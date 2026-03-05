import { supabase } from "./supabase";
import { Profile, Report, UserBan } from "../types/database";
import { canModerateAcademic } from "../utils/roles";

export type TimeRange = '7d' | '30d' | '90d';

const sinceDate = (range: TimeRange): string => {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

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
  newRole: "student" | "faculty" | "alumni" | "admin" | "developer"
) => {
  const { data, error } = await (supabase as any)
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
): Promise<{ success: boolean; action: 'banned' | 'unbanned'; data?: UserBan }> => {
  const isBanActive = (ban: any) => {
    const until = ban?.banned_until ?? ban?.ban_until ?? null;
    if (ban?.is_permanent === true) return true;
    if (!until) return false;
    const untilTs = new Date(until).getTime();
    return !Number.isNaN(untilTs) && untilTs > Date.now();
  };

  // Find any active ban (temporary or permanent)
  const { data: existing, error: existingError } = await supabase
    .from('user_bans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (existingError) throw existingError;
  const activeBans = (existing || []).filter(isBanActive);

  if (activeBans.length > 0) {
    // Remove all active bans for this user
    const { error } = await supabase
      .from('user_bans')
      .delete()
      .in('id', activeBans.map((b: any) => b.id));
    if (error) throw error;

    // Keep profiles table in sync for fast guards.
    await (supabase as any)
      .from('profiles')
      .update({ is_suspended: false })
      .eq('id', userId);

    return { success: true, action: 'unbanned' };
  }

  // Create new ban
  let createResult = await (supabase as any)
    .from('user_bans')
    .insert({
      user_id: userId,
      banned_by,
      reason,
      banned_until: banUntil ?? null,
      is_permanent: !banUntil,
    })
    .select()
    .single();

  // Backward compatibility for schemas using ban_until instead of banned_until.
  if (createResult.error) {
    createResult = await (supabase as any)
      .from('user_bans')
      .insert({
        user_id: userId,
        banned_by,
        reason,
        ban_until: banUntil ?? null,
        is_permanent: !banUntil,
      })
      .select()
      .single();
  }

  const { data, error } = createResult;

  if (error) throw error;

  // Keep profiles table in sync for fast guards.
  await (supabase as any)
    .from('profiles')
    .update({ is_suspended: true })
    .eq('id', userId);

  return { success: true, action: 'banned', data: data as UserBan };
};

export const getActiveBans = async (): Promise<UserBan[]> => {
  const { data, error } = await supabase
    .from("user_bans")
    .select("*")
    .order('created_at', { ascending: false });

  if (error) throw error;

  const active = ((data as UserBan[]) || []).filter((ban: any) => {
    const until = ban?.banned_until ?? ban?.ban_until ?? null;
    if (ban?.is_permanent === true) return true;
    if (!until) return false;
    const untilTs = new Date(until).getTime();
    return !Number.isNaN(untilTs) && untilTs > Date.now();
  });

  return active;
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
  if (!canModerateAcademic(moderatorRole)) {
    throw new Error("Unauthorized: Only admin/faculty can approve posts");
  }

  const { data, error } = await (supabase as any)
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
  const { data, error } = await (supabase as any)
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
  targetRole?: string,
  imageUrl?: string
): Promise<{ success: boolean; recipient_count: number }> => {
  let query = supabase.from('profiles').select('id');
  if (targetRole && targetRole !== 'all') query = (query as any).eq('role', targetRole);

  const { data: users, error: usersError } = await query;
  if (usersError) throw usersError;

  const userIds = ((users as any[]) ?? []).map((u: any) => u.id);
  if (userIds.length === 0) return { success: true, recipient_count: 0 };

  const notifications = userIds.map((userId: string) => ({
    user_id: userId,
    type: 'broadcast',
    title,
    message,
    image_url: imageUrl ?? null,
    data: { broadcast_by: senderUserId },
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  const { error } = await (supabase as any).from('notifications').insert(notifications);
  if (error) throw error;

  // Audit log
  await insertAdminLog(senderUserId, 'broadcast_sent', null, {
    title,
    target_role: targetRole ?? 'all',
    recipient_count: userIds.length,
  });

  return { success: true, recipient_count: userIds.length };
};

// ===== ANALYTICS =====

export type EngagementMetrics = {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalPosts: number;
  totalEvents: number;
  totalTeams: number;
  recentMessages: number;
  recentPosts: number;
  recentRegistrations: number;
  newUsers: number;
  lastUpdated: string;
  timeRange: TimeRange;
};

export const getEngagementMetrics = async (
  timeRange: TimeRange = '30d'
): Promise<EngagementMetrics> => {
  const since = sinceDate(timeRange);

  // All static counts (not time-filtered)
  const [usersRes, postsRes, eventsRes, teamsRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('is_approved', true),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('project_teams').select('id', { count: 'exact', head: true }),
  ]);

  // Time-filtered counts
  const [messagesRes, recentPostsRes, registrationsRes, newUsersRes] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('feed_posts').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('event_registrations').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);

  // Users by role
  const roles = ['student', 'faculty', 'alumni', 'admin', 'developer'];
  const roleResults = await Promise.all(
    roles.map((role) =>
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role)
    )
  );
  const usersByRole: Record<string, number> = {};
  roles.forEach((role, i) => { usersByRole[role] = roleResults[i].count ?? 0; });

  return {
    totalUsers: usersRes.count ?? 0,
    usersByRole,
    totalPosts: postsRes.count ?? 0,
    totalEvents: eventsRes.count ?? 0,
    totalTeams: teamsRes.count ?? 0,
    recentMessages: messagesRes.count ?? 0,
    recentPosts: recentPostsRes.count ?? 0,
    recentRegistrations: registrationsRes.count ?? 0,
    newUsers: newUsersRes.count ?? 0,
    lastUpdated: new Date().toISOString(),
    timeRange,
  };
};

export const getRecipientCount = async (role?: string): Promise<number> => {
  let query = supabase.from('profiles').select('id', { count: 'exact', head: true });
  if (role && role !== 'all') query = query.eq('role', role);
  const { count } = await query;
  return count ?? 0;
};

// ===== DISCUSSION MODERATION =====

export const lockDiscussionTopic = async (
  topicId: string,
  moderatorId: string
) => {
  const { data, error } = await (supabase as any)
    .from("discussion_topics")
    .update({ is_locked: true })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const unlockDiscussionTopic = async (topicId: string) => {
  const { data, error } = await (supabase as any)
    .from("discussion_topics")
    .update({ is_locked: false })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const pinDiscussionTopic = async (topicId: string) => {
  const { data, error } = await (supabase as any)
    .from("discussion_topics")
    .update({ is_pinned: true })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const unpinDiscussionTopic = async (topicId: string) => {
  const { data, error } = await (supabase as any)
    .from("discussion_topics")
    .update({ is_pinned: false })
    .eq("id", topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteDiscussionReply = async (replyId: string): Promise<{ success: boolean }> => {
  // Soft delete
  const { error } = await (supabase as any)
    .from('discussion_replies')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', replyId);
  if (error) throw error;
  return { success: true };
};

// ===== AUDIT LOG =====

export type AdminLogAction =
  | 'ban_user'
  | 'unban_user'
  | 'role_change'
  | 'post_approved'
  | 'post_rejected'
  | 'report_resolved'
  | 'broadcast_sent'
  | 'topic_locked'
  | 'topic_pinned';

export type AdminAuditLog = {
  id: string;
  admin_id: string;
  action: AdminLogAction | string;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  admin?: { full_name?: string | null; avatar_url?: string | null } | null;
  target_user?: { full_name?: string | null; avatar_url?: string | null } | null;
};

export const insertAdminLog = async (
  adminId: string,
  action: AdminLogAction,
  targetUserId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> => {
  // Best-effort insert. Keep app flow alive but surface useful diagnostics.
  try {
    await (supabase as any).from('admin_logs').insert({
      admin_id: adminId,
      action,
      target_user_id: targetUserId,
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.warn('insertAdminLog failed:', error?.message || error);
  }
};

export const getAdminLogs = async (
  filter?: { action?: AdminLogAction; page?: number }
): Promise<AdminAuditLog[]> => {
  const pageSize = 30;
  const from = ((filter?.page ?? 0)) * pageSize;

  let query = supabase
    .from('admin_logs')
    .select('*, admin:profiles!admin_logs_admin_id_fkey(full_name, avatar_url), target_user:profiles!admin_logs_target_user_id_fkey(full_name, avatar_url)')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filter?.action) query = (query as any).eq('action', filter.action);

  const { data, error } = await query;
  if (!error) return (data as AdminAuditLog[]) ?? [];

  // Fallback for databases where FK relation alias differs or join metadata is absent.
  let fallbackQuery = supabase
    .from('admin_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filter?.action) fallbackQuery = (fallbackQuery as any).eq('action', filter.action);

  const { data: fallbackData, error: fallbackError } = await fallbackQuery;
  if (fallbackError) throw fallbackError;

  const rows = (fallbackData ?? []) as AdminAuditLog[];
  const profileIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.admin_id, r.target_user_id])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  if (!profileIds.length) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', profileIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((row) => ({
    ...row,
    admin: profileMap.get(row.admin_id)
      ? {
          full_name: profileMap.get(row.admin_id).full_name,
          avatar_url: profileMap.get(row.admin_id).avatar_url,
        }
      : null,
    target_user: row.target_user_id && profileMap.get(row.target_user_id)
      ? {
          full_name: profileMap.get(row.target_user_id).full_name,
          avatar_url: profileMap.get(row.target_user_id).avatar_url,
        }
      : null,
  }));
};

export const softDeletePost = async (postId: string): Promise<{ success: boolean }> => {
  const { error } = await (supabase as any)
    .from('feed_posts')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
  return { success: true };
};
