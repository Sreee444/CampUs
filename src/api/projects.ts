// @ts-nocheck
import { supabase } from "./supabase";
import { ProjectTeam, ProjectTeamMember } from "../types/database";

// Get all project teams
export const getProjectTeams = async (userId?: string, recruiting = true) => {
  let query = supabase
    .from("project_teams")
    .select(`
      *,
      creator:profiles!project_teams_created_by_fkey(*)
    `)
    .order("created_at", { ascending: false });

  if (recruiting !== undefined) {
    query = query.eq("is_recruiting", recruiting);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Get members count for each team
  const teamsWithData = await Promise.all(
    (data || []).map(async (team: any) => {
      const [membersCount, members, isMember] = await Promise.all([
        supabase
          .from("project_team_members")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team.id),
        supabase
          .from("project_team_members")
          .select(`
            *,
            user:profiles!project_team_members_user_id_fkey(*)
          `)
          .eq("team_id", team.id),
        userId
          ? supabase
            .from("project_team_members")
            .select("id")
            .eq("team_id", team.id)
            .eq("user_id", userId)
            .single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...team,
        members_count: membersCount.count || 0,
        members: members.data?.map((m: any) => m.user) || [],
        is_member: !!isMember.data,
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
      creator:profiles!project_teams_created_by_fkey(*)
    `)
    .eq("id", teamId)
    .single();

  if (error) throw error;

  // Get members
  const { data: members } = await supabase
    .from("project_team_members")
    .select(`
      *,
      user:profiles!project_team_members_user_id_fkey(*)
    `)
    .eq("team_id", teamId);

  return {
    ...data as any,
    members: members?.map((m: any) => m.user) || [],
    members_count: members?.length || 0,
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
    // @ts-ignore - Supabase type inference issue
    await supabase.from("project_team_members").insert({
      team_id: (data as any).id,
      user_id: teamData.created_by,
      role: "leader",
    });
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
      team:project_teams(*)
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
      user:profiles!project_team_members_user_id_fkey(*)
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
      creator:profiles!project_teams_created_by_fkey(*)
    `)
    .overlaps("required_skills", skills)
    .eq("is_recruiting", true);

  if (error) throw error;
  return data as ProjectTeam[];
};

// Assign mentor to project (Faculty/Alumni only)
export const assignMentor = async (teamId: string, mentorId: string) => {
  // Update team with mentor
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("project_teams")
    .update({ mentor_id: mentorId } as any)
    .eq("id", teamId)
    .select()
    .single();

  if (error) throw error;

  // Add mentor as team advisor
  // @ts-ignore - Supabase type inference issue
  await supabase
    .from("project_team_members")
    .insert({
      team_id: teamId,
      user_id: mentorId,
      role: "mentor",
    } as any);

  return data;
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
    .eq("role", "mentor");
};

// Update project status (Students can update, Faculty can override)
export const updateProjectStatus = async (
  teamId: string,
  status: 'planning' | 'in-progress' | 'completed' | 'on-hold',
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
  userRole: 'student' | 'faculty' | 'alumni' | 'admin',
  userId: string
) => {
  let query = supabase
    .from("project_teams")
    .select(`
      *,
      creator:profiles!project_teams_created_by_fkey(*),
      mentor:profiles!project_teams_mentor_id_fkey(*)
    `);

  if (userRole === 'student') {
    // Students see: their projects + recruiting projects
    query = query.or(`created_by.eq.${userId},is_recruiting.eq.true`);
  } else if (userRole === 'faculty' || userRole === 'alumni') {
    // Faculty/Alumni see: all projects (for mentorship)
    // No filter - they can mentor any project
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  return data as ProjectTeam[];
};

// Get projects mentored by faculty/alumni
export const getMentoredProjects = async (mentorId: string) => {
  const { data, error } = await supabase
    .from("project_teams")
    .select(`
      *,
      creator:profiles!project_teams_created_by_fkey(*)
    `)
    .eq("mentor_id", mentorId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as ProjectTeam[];
};
