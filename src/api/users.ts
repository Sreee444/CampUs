// @ts-nocheck
import { supabase } from "./supabase";
import { Profile } from "../types/database";

// Get all users (with filters)
export const getUsers = async (filters?: {
  role?: string;
  department?: string;
  searchQuery?: string;
}) => {
  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.role) {
    query = query.eq("role", filters.role);
  }

  if (filters?.department) {
    query = query.eq("department", filters.department);
  }

  if (filters?.searchQuery) {
    query = query.or(
      `full_name.ilike.%${filters.searchQuery}%,email.ilike.%${filters.searchQuery}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Profile[];
};

// Get mentors
export const getMentors = async (expertise?: string[]) => {
  let query = supabase
    .from("profiles")
    .select("*")
    .eq("is_mentor", true);

  if (expertise && expertise.length > 0) {
    query = query.overlaps("areas_of_expertise", expertise);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Profile[];
};

// Get user by ID
export const getUserById = async (userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data as Profile;
};

// Search users
export const searchUsers = async (searchQuery: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
    .limit(20);

  if (error) throw error;
  return data as Profile[];
};

// Get users by skills
export const getUsersBySkills = async (skills: string[]) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .overlaps("skills", skills);

  if (error) throw error;
  return data as Profile[];
};

// Get users by interests
export const getUsersByInterests = async (interests: string[]) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .overlaps("interests", interests);

  if (error) throw error;
  return data as Profile[];
};

// Update last active
export const updateLastActive = async (userId: string) => {
  try {
    // @ts-ignore - Supabase type inference issue
    const { error } = await supabase
      .from("profiles")
      .update({ last_active: new Date().toISOString() } as any)
      .eq("id", userId);

    // Ignore abort errors (happens when component unmounts or request is cancelled)
    if (error && !error.message?.includes('AbortError')) {
      console.error('Update last active error:', error);
    }
  } catch (error: any) {
    // Silently ignore abort errors
    if (!error?.message?.includes('AbortError') && error?.name !== 'AbortError') {
      console.error('Update last active error:', error);
    }
  }
};

// Get user statistics
export const getUserStats = async (userId: string) => {
  // Get counts for various activities
  const [postsCount, eventsCount, connectionsCount, projectsCount] = await Promise.all([
    supabase.from("feed_posts").select("id", { count: 'exact', head: true }).eq("author_id", userId),
    supabase.from("event_registrations").select("id", { count: 'exact', head: true }).eq("user_id", userId),
    supabase.from("connections").select("id", { count: 'exact', head: true }).eq("user_id", userId).eq("status", "accepted"),
    supabase.from("project_team_members").select("id", { count: 'exact', head: true }).eq("user_id", userId),
  ]);

  return {
    total_posts: postsCount.count || 0,
    total_events: eventsCount.count || 0,
    total_connections: connectionsCount.count || 0,
    total_projects: projectsCount.count || 0,
  };
};
