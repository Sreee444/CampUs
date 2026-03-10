
// @ts-nocheck
import { supabase } from "./supabase";
import { ProjectTeam, ProjectTeamMember } from "../types/database";
import { ensureProjectChat, addParticipantToProjectChat, getProjectChatId } from './projectChat';

// ─── Helper Functions ──────────────────────────────────────

// Fetch team members with role info
const fetchTeamMembersWithRole = async (teamId: string) => {
  const { data, error } = await supabase
    .from("project_team_members")
    .select(`
      *,
      user: profiles!project_team_members_user_id_fkey(*)
    `)
    .eq("team_id", teamId);

  if (error) throw error;
  return (data || []).map((m: any) => ({ ...m.user, member_role: m.role }));
};

// Ensure mentor is team member with advisor role
const ensureMentorIsAdvisor = async (teamId: string, mentorUserId: string) => {
  const { data: existingMembers, error: lookupError } = await supabase
    .from('project_team_members')
    .select('id, role')
    .eq('team_id', teamId)
    .eq('user_id', mentorUserId)
    .order('joined_at', { ascending: false });

  if (lookupError) throw lookupError;

  const existingMember = (existingMembers || [])[0] || null;

  if (!existingMember) {
    await supabase
      .from('project_team_members')
      .insert({ team_id: teamId, user_id: mentorUserId, role: 'advisor' });
  } else if (existingMember.role !== 'advisor') {
    await supabase
      .from('project_team_members')
      .update({ role: 'advisor' })
      .eq('id', existingMember.id);
  }
};

// ─── Project Team Queries ──────────────────────────────────────

// Get all project teams
export const getProjectTeams = async (userId?: string, recruiting = true) => {
  let query = supabase
    .from("project_teams")
    .select(`
  *,
  creator: profiles!project_teams_created_by_fkey(*)
    `)
    .order("created_at", { ascending: false });

  if (recruiting !== undefined) {
    query = query.eq("is_recruiting", recruiting);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Get members data for each team
  const teamsWithData = await Promise.all(
    (data || []).map(async (team: any) => {
      const members = await fetchTeamMembersWithRole(team.id);
      
      const isMemberCheck = userId
        ? members.some(m => m.id === userId)
        : false;

      return {
        ...team,
        members,
        members_count: members.length,
        is_member: isMemberCheck,
      };
    })
  );

  return teamsWithData as ProjectTeam[];
};

// Get single team
export const getProjectTeam = async (teamId: string) => {
  const { data, error } = await supabase
    .from("project_teams")
    .select(`
      *,
      creator: profiles!project_teams_created_by_fkey(*),
        mentor: profiles!project_teams_mentor_id_fkey(id, full_name, avatar_url, department, role)
          `)
    .eq("id", teamId)
    .single();

  if (error) throw error;

  // Get members
  const members = await fetchTeamMembersWithRole(teamId);

  return {
    ...data as any,
    members,
    members_count: members.length,
  } as ProjectTeam;
};

// Create project team
export const createProjectTeam = async (teamData: Partial<ProjectTeam>) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("project_teams")
    .insert(teamData as any)
    .select()
    .single();

  if (error) throw error;

  // Add creator as member
  if (data && teamData.created_by) {
    await supabase.from("project_team_members").insert({
      team_id: (data as any).id,
      user_id: teamData.created_by,
      role: "leader",
    });

    // Auto-create project team chat and add creator
    try {
      await ensureProjectChat((data as any).id, [teamData.created_by]);
    } catch (chatErr) {
      console.error('[Projects] Failed to create project chat:', chatErr);
    }
  }

  return data as ProjectTeam;
};

// Update team
export const updateProjectTeam = async (
  teamId: string,
  updates: Partial<ProjectTeam>
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("project_teams")
    .update(updates as any)
    .eq("id", teamId)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectTeam;
};

// Delete team
export const deleteProjectTeam = async (teamId: string) => {
  const { error } = await supabase
    .from("project_teams")
    .delete()
    .eq("id", teamId);
  if (error) throw error;
};

// Join team
export const joinProjectTeam = async (teamId: string, userId: string) => {
  // First, fetch the team to check capacity and recruiting status
  const { data: team, error: fetchError } = await supabase
    .from("project_teams")
    .select("id, max_members, is_recruiting")
    .eq("id", teamId)
    .single();

  if (fetchError) throw fetchError;

  // Check if team is recruiting
  if (!team.is_recruiting) {
    throw new Error("Team is not recruiting");
  }

  // Get current member count
  const { count, error: countError } = await supabase
    .from("project_team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (countError) throw countError;

  // Check if team is at or exceeds max capacity
  const currentMembers = count || 0;
  if (team.max_members && currentMembers >= team.max_members) {
    throw new Error("Team is full");
  }

  // Add member
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("project_team_members")
    .insert({
      team_id: teamId,
      user_id: userId,
      role: "member",
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Add the new member to the project chat
  try {
    const chatId = await getProjectChatId(teamId);
    if (chatId) {
      await addParticipantToProjectChat(chatId, userId);
    }
  } catch (chatErr) {
    console.error('[Projects] Failed to add member to chat:', chatErr);
  }

  // Check if team is now full, and if so, close recruiting
  const newMemberCount = (count || 0) + 1;
  if (team.max_members && newMemberCount >= team.max_members) {
    await updateProjectTeam(teamId, { is_recruiting: false });
  }

  return data as ProjectTeamMember;
};

// Leave team
export const leaveProjectTeam = async (teamId: string, userId: string) => {
  const { error } = await supabase
    .from("project_team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) throw error;
};

// Get user's teams
export const getUserTeams = async (userId: string) => {
  const { data, error } = await supabase
    .from("project_team_members")
    .select(`
            *,
            team: project_teams(*)
              `)
    .eq("user_id", userId);

  if (error) throw error;
  return data;
};

// Get team members
export const getTeamMembers = async (teamId: string) => {
  const { data, error } = await supabase
    .from("project_team_members")
    .select(`
              *,
              user: profiles!project_team_members_user_id_fkey(*)
                `)
    .eq("team_id", teamId);

  if (error) throw error;
  return data;
};

// Search teams by skills
export const searchTeamsBySkills = async (skills: string[]) => {
  const { data, error } = await supabase
    .from("project_teams")
    .select(`
                *,
                creator: profiles!project_teams_created_by_fkey(*)
                  `)
    .overlaps("required_skills", skills)
    .eq("is_recruiting", true);

  if (error) throw error;
  return data as ProjectTeam[];
};

// Assign a mentor to a project team
export const assignMentor = async (
  teamId: string,
  mentorId: string,
  mentorUserId: string
) => {
  const { data: acceptedRequest, error: requestError } = await supabase
    .from('mentorship_requests')
    .select('id')
    .eq('project_id', teamId)
    .eq('mentor_id', mentorId)
    .eq('purpose', 'project')
    .eq('status', 'accepted')
    .maybeSingle();

  if (requestError) throw requestError;
  if (!acceptedRequest) {
    throw new Error('Mentor can only be assigned after accepting the project mentorship request.');
  }

  // Update the project team with the mentor_id
  const { error: teamError } = await supabase
    .from('project_teams')
    .update({ mentor_id: mentorUserId })
    .eq('id', teamId);

  if (teamError) throw teamError;

  // Add the mentor to the project chat
  try {
    const chatId = await getProjectChatId(teamId);
    if (chatId) {
      await addParticipantToProjectChat(chatId, mentorUserId);
    }
  } catch (chatErr) {
    console.error('[Projects] Failed to add mentor to chat:', chatErr);
  }

  // Ensure they are a team advisor member
  await ensureMentorIsAdvisor(teamId, mentorUserId);
};

// Remove mentor from project
export const removeMentor = async (teamId: string, mentorId: string) => {
  // Remove mentor from team
  // @ts-ignore - Supabase type inference issue
  await supabase
    .from("project_teams")
    .update({ mentor_id: null } as any)
    .eq("id", teamId);

  // Remove mentor role from members
  await supabase
    .from("project_team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", mentorId)
    .in("role", ["mentor", "advisor"]);
};

export const removeProjectMentor = async (teamId: string, actorId: string) => {
  const { data: team, error: teamError } = await supabase
    .from('project_teams')
    .select('created_by, mentor_id')
    .eq('id', teamId)
    .single();

  if (teamError) throw teamError;
  if (!team?.mentor_id) {
    throw new Error('No mentor assigned to this project.');
  }

  const isCreator = team.created_by === actorId;
  let isAdmin = false;

  if (!isCreator) {
    const { data: actorProfile, error: actorError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', actorId)
      .single();

    if (actorError) throw actorError;
    isAdmin = actorProfile?.role === 'admin';
  }

  if (!isCreator && !isAdmin) {
    throw new Error('Only project lead or admin can remove the mentor.');
  }

  const mentorUserId = team.mentor_id;

  const { data: mentorRecord, error: mentorRecordError } = await supabase
    .from('mentors')
    .select('id')
    .eq('user_id', mentorUserId)
    .maybeSingle();

  if (mentorRecordError) throw mentorRecordError;

  // End active project mentorship link for this project + mentor.
  // We close accepted requests when mentor is removed from the project.
  if (mentorRecord?.id) {
    const { error: closeMentorshipError } = await supabase
      .from('mentorship_requests')
      .update({ status: 'closed' })
      .eq('project_id', teamId)
      .eq('mentor_id', mentorRecord.id)
      .eq('purpose', 'project')
      .eq('status', 'accepted');

    if (closeMentorshipError) throw closeMentorshipError;
  }

  const { error: clearMentorError } = await supabase
    .from('project_teams')
    .update({ mentor_id: null })
    .eq('id', teamId)
    .eq('mentor_id', mentorUserId);

  if (clearMentorError) throw clearMentorError;

  const { error: removeAdvisorError } = await supabase
    .from('project_team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', mentorUserId)
    .in('role', ['mentor', 'advisor']);

  if (removeAdvisorError) throw removeAdvisorError;

  return true;
};

// Update project status (Students can update, Faculty can override)
export const updateProjectStatus = async (
  teamId: string,
  status: 'planning' | 'recruiting' | 'in-progress' | 'completed' | 'on-hold' | 'cancelled',
  completion_percentage?: number
) => {
  const updates: any = { status };
  if (completion_percentage !== undefined) {
    updates.completion_percentage = completion_percentage;
  }

  const { data, error } = await supabase
    .from("project_teams")
    // @ts-ignore - Supabase type inference issue
    .update(updates)
    .eq("id", teamId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Feature/Unfeature project (Faculty/Admin only)
export const featureProject = async (teamId: string, featured: boolean) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("project_teams")
    .update({ is_featured: featured } as any)
    .eq("id", teamId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Get projects by role-based filters
export const getProjectsByRole = async (
  userRole: 'student' | 'faculty' | 'alumni' | 'admin' | 'developer',
  userId: string
) => {
  let query = supabase
    .from("project_teams")
    .select(`
                  *,
                  creator: profiles!project_teams_created_by_fkey(*),
                    mentor: profiles!project_teams_mentor_id_fkey(*)
    `);

  if (userRole === 'student') {
    // Students see: their projects + recruiting projects
    query = query.or(`created_by.eq.${ userId }, is_recruiting.eq.true`);
  } else if (userRole === 'faculty' || userRole === 'alumni' || userRole === 'developer') {
    // Faculty/Alumni see: all projects (for mentorship)
    // No filter - they can mentor any project
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  // Get members data for each team
  const teamsWithData = await Promise.all(
    (data || []).map(async (team: any) => {
      const members = await fetchTeamMembersWithRole(team.id);
      
      const isMemberCheck = userId
        ? members.some(m => m.id === userId)
        : false;

      return {
        ...team,
        members,
        members_count: members.length,
        is_member: isMemberCheck,
      };
    })
  );

  return teamsWithData as ProjectTeam[];
};

// Get projects mentored by faculty/alumni
export const getMentoredProjects = async (mentorId: string) => {
  const { data, error } = await supabase
    .from("project_teams")
    .select(`
    *,
    creator: profiles!project_teams_created_by_fkey(*)
      `)
    .eq("mentor_id", mentorId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Get members data for each team
  const teamsWithData = await Promise.all(
    (data || []).map(async (team: any) => {
      const members = await fetchTeamMembersWithRole(team.id);

      return {
        ...team,
        members,
        members_count: members.length,
      };
    })
  );

  return teamsWithData as ProjectTeam[];
};

// Send join request
export const sendJoinRequest = async (teamId: string, userId: string, message?: string) => {
  // Check recruiting + capacity before allowing request
  const { data: team, error: teamError } = await supabase
    .from("project_teams")
    .select("id, max_members, is_recruiting")
    .eq("id", teamId)
    .single();

  if (teamError) throw teamError;

  if (!team.is_recruiting) {
    throw new Error("Team is not recruiting");
  }

  const { count, error: countError } = await supabase
    .from("project_team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (countError) throw countError;

  const currentMembers = count || 0;
  if (team.max_members && currentMembers >= team.max_members) {
    throw new Error("Team is full");
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from("project_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (existingMember) {
    throw new Error("Already a member");
  }

  // Check if already has pending request
  const { data: existingRequest } = await supabase
    .from("project_team_join_requests")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single();

  if (existingRequest) {
    throw new Error("Request already sent");
  }

  // Create join request
  const { data, error } = await supabase
    .from("project_team_join_requests")
    .insert({
      team_id: teamId,
      user_id: userId,
      message: message || null,
      status: "pending",
    })
    .select(`
        *,
        user: profiles!project_team_join_requests_user_id_fkey(*)
          `)
    .single();

  if (error) throw error;
  return data;
};

// Send project invite (creator/admin only - enforced by UI)
export const sendProjectInvite = async (teamId: string, userId: string, invitedBy?: string) => {
  // Check if already a member
  const { data: existingMember } = await supabase
    .from("project_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (existingMember) {
    throw new Error("User is already a member");
  }

  // Check if already has pending request/invite
  const { data: existingRequest } = await supabase
    .from("project_team_join_requests")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single();

  if (existingRequest) {
    throw new Error("Invite already pending");
  }

  // Check recruiting + capacity
  const { data: team, error: teamError } = await supabase
    .from("project_teams")
    .select("id, max_members, is_recruiting")
    .eq("id", teamId)
    .single();

  if (teamError) throw teamError;

  if (!team.is_recruiting) {
    throw new Error("Team is not recruiting");
  }

  const { count, error: countError } = await supabase
    .from("project_team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (countError) throw countError;

  const currentMembers = count || 0;
  if (team.max_members && currentMembers >= team.max_members) {
    throw new Error("Team is full");
  }

  const inviteMessage = `[INVITE] Invited by ${ invitedBy || "team leader" } `;

  const { data, error } = await supabase
    .from("project_team_join_requests")
    .insert({
      team_id: teamId,
      user_id: userId,
      message: inviteMessage,
      status: "pending",
    })
    .select(`* `)
    .single();

  if (error) throw error;
  return data;
};

// Accept project invite (invitee accepts)
export const acceptProjectInvite = async (requestId: string, teamId: string, userId: string) => {
  await joinProjectTeam(teamId, userId);

  const { error } = await supabase
    .from("project_team_join_requests")
    .update({ status: "accepted" })
    .eq("id", requestId);

  if (error) throw error;
  return true;
};

// Reject project invite (invitee rejects)
export const rejectProjectInvite = async (requestId: string) => {
  const { error } = await supabase
    .from("project_team_join_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);

  if (error) throw error;
  return true;
};

// Cancel project invite (creator/admin)
export const cancelProjectInvite = async (requestId: string) => {
  const { error } = await supabase
    .from("project_team_join_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);

  if (error) throw error;
  return true;
};

// Get pending join requests for a team
export const getTeamJoinRequests = async (teamId: string) => {
  const { data, error } = await supabase
    .from("project_team_join_requests")
    .select(`
  *,
  user: profiles!project_team_join_requests_user_id_fkey(*)
    `)
    .eq("team_id", teamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

// Accept join request
// Uses a SECURITY DEFINER RPC to bypass the RLS policy that prevents
// the current user from inserting a row on behalf of another user.
export const acceptJoinRequest = async (requestId: string, teamId: string, userId: string) => {
  const { data, error } = await supabase.rpc("accept_team_join_request", {
    p_request_id: requestId,
    p_team_id: teamId,
    p_user_id: userId,
  });

  if (error) throw error;

  if (data && !data.success) {
    throw new Error(data.error || "Failed to accept request");
  }

  // Add the new member to the project chat
  try {
    const chatId = await getProjectChatId(teamId);
    if (chatId) {
      await addParticipantToProjectChat(chatId, userId);
    }
  } catch (chatErr) {
    console.error('[Projects] Failed to add member to chat:', chatErr);
  }

  return true;
};

// Reject join request
export const rejectJoinRequest = async (requestId: string) => {
  const { error } = await supabase
    .from("project_team_join_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);

  if (error) throw error;
  return true;
};

// Remove team member
// - Creator/Admin can remove any non-creator, non-admin member
// - A user can remove themselves (leave team), except if they are the creator
export const removeTeamMember = async (
  teamId: string,
  userId: string,
  actorId?: string
) => {
  // Fetch creator for permission checks
  const { data: team, error: teamError } = await supabase
    .from("project_teams")
    .select("created_by")
    .eq("id", teamId)
    .single();

  if (teamError) throw teamError;

  const creatorId = team?.created_by;

  // Never allow removing the creator from team members
  if (creatorId === userId) {
    throw new Error("Project creator cannot be removed from the team");
  }

  let isSelfRemoval = false;
  let isCreatorAction = false;
  let isAdminAction = false;

  if (actorId) {
    isSelfRemoval = actorId === userId;
    isCreatorAction = actorId === creatorId;

    if (!isSelfRemoval && !isCreatorAction) {
      const { data: actorProfile, error: actorProfileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", actorId)
        .single();

      if (actorProfileError) throw actorProfileError;

      isAdminAction = actorProfile?.role === 'admin';
    }

    if (!isSelfRemoval && !isCreatorAction && !isAdminAction) {
      throw new Error("Only the project creator or an admin can remove other members");
    }

    if (!isSelfRemoval) {
      const { data: targetProfile, error: targetProfileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (targetProfileError) throw targetProfileError;

      if (targetProfile?.role === 'admin') {
        throw new Error("Admin members cannot be removed from the team");
      }
    }
  }

  const { data: existingMembership, error: membershipError } = await supabase
    .from("project_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (!existingMembership) {
    throw new Error("Member is not part of this team");
  }

  const { error } = await supabase
    .from("project_team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) throw error;

  const { data: membershipAfterDelete, error: afterDeleteCheckError } = await supabase
    .from("project_team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (afterDeleteCheckError) throw afterDeleteCheckError;

  if (membershipAfterDelete) {
    // Fallback: use SECURITY DEFINER RPC for creator/admin actions when RLS blocks direct delete
    if (actorId && !isSelfRemoval && (isCreatorAction || isAdminAction)) {
      const { data: rpcData, error: rpcError } = await supabase.rpc("remove_team_member_secure", {
        p_team_id: teamId,
        p_user_id: userId,
        p_actor_id: actorId,
      });

      if (!rpcError) {
        if (rpcData && typeof rpcData === 'object' && 'success' in rpcData && (rpcData as any).success === false) {
          throw new Error((rpcData as any).error || "Unable to remove member");
        }

        const { data: membershipAfterRpc, error: afterRpcCheckError } = await supabase
          .from("project_team_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("user_id", userId)
          .maybeSingle();

        if (afterRpcCheckError) throw afterRpcCheckError;

        if (!membershipAfterRpc) {
          // Reopen recruiting if team has space
          const { count } = await supabase
            .from("project_team_members")
            .select("id", { count: "exact", head: true })
            .eq("team_id", teamId);

          const { data: teamData } = await supabase
            .from("project_teams")
            .select("max_members")
            .eq("id", teamId)
            .single();

          if (teamData?.max_members && count && count < teamData.max_members) {
            await updateProjectTeam(teamId, { is_recruiting: true });
          }

          return true;
        }
      } else {
        const rpcMessage = String((rpcError as any)?.message || '');
        const rpcCode = String((rpcError as any)?.code || '');
        const rpcMissing = rpcCode === 'PGRST202' || rpcCode === '42883' || /remove_team_member_secure/i.test(rpcMessage);
        if (rpcMissing) {
          throw new Error('Admin removal requires backend RPC remove_team_member_secure (SECURITY DEFINER).');
        }
      }
    }

    throw new Error("You do not have permission to remove this member");
  }

  // Reopen recruiting if team has space
  const { count } = await supabase
    .from("project_team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  const { data: teamData } = await supabase
    .from("project_teams")
    .select("max_members")
    .eq("id", teamId)
    .single();

  if (teamData?.max_members && count && count < teamData.max_members) {
    await updateProjectTeam(teamId, { is_recruiting: true });
  }

  return true;
};

// Check user's join request status for a team
export const getUserJoinRequestStatus = async (teamId: string, userId: string) => {
  const { data, error } = await supabase
    .from("project_team_join_requests")
    .select("*")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
  return data;
};
