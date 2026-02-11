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
    (data || []).map(async (team) => {
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
    ...data,
    members: members?.map((m: any) => m.user) || [],
    members_count: members?.length || 0,
  } as ProjectTeam;
};

// Create project team
export const createProjectTeam = async (teamData: Partial<ProjectTeam>) => {
  const { data, error } = await supabase
    .from("project_teams")
    .insert(teamData)
    .select()
    .single();

  if (error) throw error;

  // Add creator as member
  if (data && teamData.created_by) {
    await supabase.from("project_team_members").insert({
      team_id: data.id,
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
  const { data, error } = await supabase
    .from("project_teams")
    .update(updates)
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
  const { data, error } = await supabase
    .from("project_team_members")
    .insert({
      team_id: teamId,
      user_id: userId,
      role: "member",
    })
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
