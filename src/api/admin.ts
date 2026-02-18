// @ts-nocheck
import { supabase } from "./supabase";
import { Profile, Report, UserBan } from "../types/database";

// ===== USER MANAGEMENT =====

export const getAllUsers = async (filters?: {
  role?: string;
  searchQuery?: string;
  isBanned?: boolean;
}) => {
  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.role) {
    query = query.eq("role", filters.role);
  }

  if (filters?.searchQuery) {
    query = query.or(
      `full_name.ilike.%${filters.searchQuery}%,email.ilike.%${filters.searchQuery}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  // Filter by ban status if needed
  if (filters?.isBanned !== undefined) {
    const bans = await getActiveBans();
    const bannedIds = bans.map((b) => b.user_id);

    return filters.isBanned
      ? (data as Profile[]).filter((u) => bannedIds.includes(u.id))
      : (data as Profile[]).filter((u) => !bannedIds.includes(u.id));
  }

  return (data as Profile[]) || [];
};

export const changeUserRole = async (
  userId: string,
  newRole: "student" | "faculty" | "alumni" | "admin"
) => {
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
};

export const toggleUserBan = async (
  userId: string,
  banned_by: string,
  reason: string,
  banUntil?: string
) => {
  // Check if already banned
  const existing = await supabase
    .from("user_bans")
    .select("id")
    .eq("user_id", userId)
    .eq("is_permanent", false)
    .gt("banned_until", new Date().toISOString());

  if (existing.data && existing.data.length > 0) {
    // Remove ban
    const { error } = await supabase
      .from("user_bans")
      .delete()
      .eq("id", existing.data[0].id);
    if (error) throw error;
    return { success: true, action: "unbanned" };
  }

  // Create new ban
  const { data, error } = await supabase
    .from("user_bans")
    .insert({
      user_id: userId,
      banned_by,
      reason,
      banned_until: banUntil || null,
      is_permanent: !banUntil,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return { success: true, action: "banned", data };
};

export const getActiveBans = async (): Promise<UserBan[]> => {
  const { data, error } = await supabase
    .from("user_bans")
    .select("*")
    .or(`is_permanent.eq.true,banned_until.gt.${new Date().toISOString()}`);

  if (error) throw error;
  return (data as UserBan[]) || [];
};

// ===== MODERATION =====

export const getPendingPosts = async () => {
  const { data, error } = await supabase
    .from("feed_posts")
    .select(
      `
      *,
      author:profiles!feed_posts_author_id_fkey(*)
    `
    )
    .eq("is_approved", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

export const approvePost = async (
  postId: string,
  moderatorId: string,
  moderatorRole: string
) => {
  // Only admin/faculty can approve
  if (!["admin", "faculty"].includes(moderatorRole)) {
    throw new Error("Unauthorized: Only admin/faculty can approve posts");
  }

  const { data, error } = await supabase
    .from("feed_posts")
    .update({
      is_approved: true,
      moderated_by: moderatorId,
      moderated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const rejectPost = async (postId: string, moderatorId: string) => {
  const { error } = await supabase
    .from("feed_posts")
    .delete()
    .eq("id", postId);

  if (error) throw error;
  return { success: true };
};

// ===== REPORTS & BAN MANAGEMENT =====

export const getReports = async (filters?: { status?: string }) => {
  let query = supabase
    .from("reports")
    .select(
      `
      *,
      reporter:profiles!reports_reporter_id_fkey(*),
      reported_user:profiles!reports_reported_user_id_fkey(*)
    `
    )
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const updateReportStatus = async (
  reportId: string,
  status: string,
  reviewedBy: string,
  actionTaken?: string
) => {
  const { data, error } = await supabase
    .from("reports")
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      action_taken: actionTaken || null,
    })
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ===== BROADCAST MESSAGING =====

export const sendBroadcastMessage = async (
  senderUserId: string,
  title: string,
  message: string,
  targetRole?: string
) => {
  // Get target users
  let query = supabase.from("profiles").select("id");

  if (targetRole) {
    query = query.eq("role", targetRole);
  }

  const { data: users, error: usersError } = await query;
  if (usersError) throw usersError;

  const userIds = (users as any[]).map((u) => u.id);

  // Create notifications for all users
  const notifications = userIds.map((userId) => ({
    user_id: userId,
    type: "broadcast",
    title,
    message,
    data: { broadcast_by: senderUserId },
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("notifications")
    .insert(notifications as any);

  if (error) throw error;
  return { success: true, recipient_count: userIds.length };
};

// ===== ANALYTICS =====

export const getEngagementMetrics = async () => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // Users by role
    const roles = ["student", "faculty", "alumni", "admin"];
    const usersByRole: any = {};

    for (const role of roles) {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", role);
      usersByRole[role] = count || 0;
    }

    // Active posts
    const { count: totalPosts } = await supabase
      .from("feed_posts")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", true);

    // Total events
    const { count: totalEvents } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true });

    // Total project teams
    const { count: totalTeams } = await supabase
      .from("project_teams")
      .select("id", { count: "exact", head: true });

    // Messages sent (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentMessages } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo);

    return {
      totalUsers,
      usersByRole,
      totalPosts,
      totalEvents,
      totalTeams,
      recentMessages,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching analytics:", error);
    throw error;
  }
};

// ===== DISCUSSION MODERATION =====

export const lockDiscussionTopic = async (
  topicId: string,
  moderatorId: string
) => {
  const { data, error } = await supabase
    .from("discussion_topics")
    .update({ is_locked: true })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const unlockDiscussionTopic = async (topicId: string) => {
  const { data, error } = await supabase
    .from("discussion_topics")
    .update({ is_locked: false })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const pinDiscussionTopic = async (topicId: string) => {
  const { data, error } = await supabase
    .from("discussion_topics")
    .update({ is_pinned: true })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const unpinDiscussionTopic = async (topicId: string) => {
  const { data, error } = await supabase
    .from("discussion_topics")
    .update({ is_pinned: false })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteDiscussionReply = async (replyId: string) => {
  const { error } = await supabase
    .from("discussion_replies")
    .delete()
    .eq("id", replyId);

  if (error) throw error;
  return { success: true };
};
