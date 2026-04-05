import { supabase } from "./supabase";
import { Profile, Report, UserBan, UserRole } from "../types/database";
import { canModerateAcademic } from "../utils/roles";
import { BASE_URL } from "../config/api";

export type TimeRange = '7d' | '30d' | '90d';

const sinceDate = (range: TimeRange): string => {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const BAN_APPEAL_REASON = 'Ban Appeal Request';

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes(`'${column.toLowerCase()}'`) &&
    (message.includes('could not find') || message.includes('column'))
  );
};

export type BanAppealStatus = {
  id: string;
  status: string;
  reason?: string;
  description?: string | null;
  action_taken?: string | null;
  reviewed_at?: string | null;
  created_at: string;
};

const isBanActive = (ban: any) => {
  const until = ban?.banned_until ?? ban?.ban_until ?? null;
  if (ban?.is_permanent === true) return true;
  if (!until) return false;
  const untilTs = new Date(until).getTime();
  return !Number.isNaN(untilTs) && untilTs > Date.now();
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
  const updates: Partial<Profile> = { role: newRole };
  // DB constraint: designation is only allowed for faculty/admin.
  if (newRole !== 'faculty' && newRole !== 'admin') {
    updates.faculty_designation = null;
  }
  const { data, error } = await (supabase as any)
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
};

export const updateUserProfileAdmin = async (
  userId: string,
  updates: Partial<Profile>
) => {
  const { data, error } = await (supabase as any)
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
};

export type AdminCreateUserPayload = {
  email: string;
  full_name?: string | null;
  role?: UserRole;
  department?: string | null;
  year?: number | null;
  semester?: number | null;
  section?: string | null;
  password?: string | null;
};

export const createUserByAdmin = async (payload: AdminCreateUserPayload) => {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${BASE_URL}/admin/create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Failed to create user';
    try {
      const errorBody = await response.json();
      message = errorBody?.error || message;
    } catch {
      // ignore parsing errors
    }
    throw new Error(message);
  }

  return response.json();
};

export const toggleUserBan = async (
  userId: string,
  banned_by: string,
  reason: string,
  banUntil?: string
): Promise<{ success: boolean; action: 'banned' | 'unbanned'; data?: UserBan }> => {
  const active = await getUserActiveBan(userId);
  if (active) {
    await unbanUser(userId);
    return { success: true, action: 'unbanned' };
  }

  const created = await banUser(userId, banned_by, reason, banUntil);
  return { success: true, action: 'banned', data: created };
};

export const getUserActiveBan = async (userId: string): Promise<UserBan | null> => {
  const { data, error } = await supabase
    .from('user_bans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const active = ((data as UserBan[]) || []).find((ban: any) => isBanActive(ban));
  return active || null;
};

export const banUser = async (
  userId: string,
  bannedBy: string,
  reason: string,
  banUntil?: string
): Promise<UserBan> => {
  if (!reason.trim()) {
    throw new Error('Ban reason is required');
  }

  const alreadyActive = await getUserActiveBan(userId);
  if (alreadyActive) {
    throw new Error('User already has an active ban');
  }

  let createResult = await (supabase as any)
    .from('user_bans')
    .insert({
      user_id: userId,
      banned_by: bannedBy,
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
        banned_by: bannedBy,
        reason,
        ban_until: banUntil ?? null,
        is_permanent: !banUntil,
      })
      .select()
      .single();
  }

  const { data, error } = createResult;
  if (error) throw error;

  await (supabase as any)
    .from('profiles')
    .update({ is_suspended: true })
    .eq('id', userId);

  return data as UserBan;
};

export const unbanUser = async (userId: string): Promise<void> => {
  const { data: existing, error: existingError } = await supabase
    .from('user_bans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (existingError) throw existingError;

  const activeIds = (existing || [])
    .filter((ban: any) => isBanActive(ban))
    .map((ban: any) => ban.id);

  if (activeIds.length) {
    const { error } = await supabase
      .from('user_bans')
      .delete()
      .in('id', activeIds);
    if (error) throw error;
  }

  await (supabase as any)
    .from('profiles')
    .update({ is_suspended: false })
    .eq('id', userId);
};

export const getActiveBans = async (): Promise<UserBan[]> => {
  const { data, error } = await supabase
    .from("user_bans")
    .select("*")
    .order('created_at', { ascending: false });

  if (error) throw error;

  const active = ((data as UserBan[]) || []).filter((ban: any) => isBanActive(ban));

  return active;
};

export const submitBanAppeal = async (
  userId: string,
  message: string,
  preferredContact?: string
): Promise<Report> => {
  const trimmed = message.trim();
  const trimmedContact = String(preferredContact || '').trim();
  if (!trimmed) throw new Error('Appeal message is required');
  if (!trimmedContact) throw new Error('Contact details are required');

  // Allow only one OPEN appeal at a time. Support both schemas (`reason` and `title`).
  let recentAppeals: any[] = [];
  let existingAppealError: any = null;

  const queryAppealsForUser = async (build: (orFilter: string) => any) => {
    const withReportedBy = await build(`reported_user_id.eq.${userId},reporter_id.eq.${userId},reported_by.eq.${userId}`);
    if (!withReportedBy.error || !isMissingColumnError(withReportedBy.error, 'reported_by')) {
      return withReportedBy;
    }
    return build(`reported_user_id.eq.${userId},reporter_id.eq.${userId}`);
  };

  const byReason = await queryAppealsForUser((orFilter) =>
    (supabase as any)
      .from('reports')
      .select('id, status, reason, title, created_at')
      .or(orFilter)
      .ilike('reason', '%appeal%')
      .order('created_at', { ascending: false })
      .limit(25)
  );

  if (!byReason.error) {
    recentAppeals = (byReason.data as any[]) || [];
  } else if (isMissingColumnError(byReason.error, 'reason')) {
    const byTitle = await queryAppealsForUser((orFilter) =>
      (supabase as any)
        .from('reports')
        .select('id, status, title, created_at')
        .or(orFilter)
        .ilike('title', '%appeal%')
        .order('created_at', { ascending: false })
        .limit(25)
    );

    if (!byTitle.error) {
      recentAppeals = (byTitle.data as any[]) || [];
    } else {
      existingAppealError = byTitle.error;
    }
  } else {
    existingAppealError = byReason.error;
  }

  if (!existingAppealError) {
    const cooldownMs = 2 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    const recentCooldownAppeal = ((recentAppeals as any[]) || []).find((appeal: any) => {
      const createdMs = new Date(appeal?.created_at || 0).getTime();
      return !Number.isNaN(createdMs) && nowMs - createdMs < cooldownMs;
    });

    if (recentCooldownAppeal?.id) {
      throw new Error('You can submit only 1 appeal within 2 days. Please try again later.');
    }

    const openAppeal = ((recentAppeals as any[]) || []).find((appeal: any) => {
      const status = String(appeal?.status || '').toLowerCase();
      return status && status !== 'resolved' && status !== 'dismissed';
    });
    if (openAppeal?.id) {
      throw new Error('You already have an appeal under review. Please wait for admin response.');
    }
  }

  const description = [
    trimmed,
    `Preferred contact: ${trimmedContact}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // Primary schema shape with `reason`.
  let insertResult = await (supabase as any)
    .from('reports')
    .insert({
      reporter_id: userId,
      reported_user_id: userId,
      reason: BAN_APPEAL_REASON,
      description,
      status: 'pending',
    });

  // Backward compatibility for schemas using reported_by.
  if (insertResult.error) {
    const reasonMissing = isMissingColumnError(insertResult.error, 'reason');
    if (reasonMissing) {
      // Newer schema shape with title/category/content_type and no `reason` column.
      insertResult = await (supabase as any)
        .from('reports')
        .insert({
          reporter_id: userId,
          reported_user_id: userId,
          reported_content_type: 'user',
          category: 'other',
          title: BAN_APPEAL_REASON,
          description,
          priority: 'medium',
          status: 'pending',
        });
    } else {
      insertResult = await (supabase as any)
        .from('reports')
        .insert({
          reported_by: userId,
          reported_user_id: userId,
          reason: BAN_APPEAL_REASON,
          description,
          status: 'pending',
        });
    }
  }

  if (insertResult.error) throw insertResult.error;

  // Return a local object because select-after-insert can be blocked by RLS.
  const now = new Date().toISOString();
  return {
    id: `appeal-${Date.now()}`,
    reporter_id: userId,
    reported_user_id: userId,
    reported_content_type: 'user',
    category: 'other',
    title: BAN_APPEAL_REASON,
    description,
    priority: 'medium',
    status: 'pending',
    created_at: now,
    updated_at: now,
    is_deleted: false,
  } as Report;
};

export const getPendingAppealsCount = async (): Promise<number> => {
  try {
    // Preferred schema shape (legacy appeals stored via reason text).
    const preferred = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .ilike('reason', '%appeal%');

    if (!preferred.error) return preferred.count ?? 0;

    if (isMissingColumnError(preferred.error, 'reason')) {
      const titleFallback = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .ilike('title', '%appeal%');

      if (!titleFallback.error) return titleFallback.count ?? 0;
    }

    // Fallback for schemas without `reason` or with restrictive RLS policies.
    const fallback = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (fallback.error) return 0;
    return fallback.count ?? 0;
  } catch {
    return 0;
  }
};

export const getLatestBanAppealStatus = async (userId: string): Promise<BanAppealStatus | null> => {
  let rows: any[] = [];

  const queryAppealsForUser = async (build: (orFilter: string) => any) => {
    const withReportedBy = await build(`reported_user_id.eq.${userId},reporter_id.eq.${userId},reported_by.eq.${userId}`);
    if (!withReportedBy.error || !isMissingColumnError(withReportedBy.error, 'reported_by')) {
      return withReportedBy;
    }
    return build(`reported_user_id.eq.${userId},reporter_id.eq.${userId}`);
  };

  const byReason = await queryAppealsForUser((orFilter) =>
    supabase
      .from('reports')
      .select('id, status, reason, title, description, admin_notes, action_taken, updated_at, reviewed_at, created_at')
      .or(orFilter)
      .ilike('reason', '%appeal%')
      .order('created_at', { ascending: false })
      .limit(25)
  );

  if (!byReason.error) {
    rows = (byReason.data as any[]) || [];
  } else if (
    isMissingColumnError(byReason.error, 'reason') ||
    isMissingColumnError(byReason.error, 'action_taken') ||
    isMissingColumnError(byReason.error, 'reviewed_at')
  ) {
    const byTitle = await queryAppealsForUser((orFilter) =>
      supabase
        .from('reports')
        .select('id, status, title, description, admin_notes, action_taken, updated_at, reviewed_at, created_at')
        .or(orFilter)
        .ilike('title', '%appeal%')
        .order('created_at', { ascending: false })
        .limit(25)
    );

    if (!byTitle.error) {
      rows = (byTitle.data as any[]) || [];
    } else if (isMissingColumnError(byTitle.error, 'action_taken') || isMissingColumnError(byTitle.error, 'reviewed_at')) {
      const minimalByTitle = await queryAppealsForUser((orFilter) =>
        supabase
          .from('reports')
          .select('id, status, title, description, admin_notes, updated_at, created_at')
          .or(orFilter)
          .ilike('title', '%appeal%')
          .order('created_at', { ascending: false })
          .limit(25)
      );

      if (minimalByTitle.error) throw minimalByTitle.error;
      rows = (minimalByTitle.data as any[]) || [];
    } else {
      throw byTitle.error;
    }
  } else {
    throw byReason.error;
  }

  if (!rows.length) return null;

  const normalizedRows: BanAppealStatus[] = rows.map((r: any) => ({
    id: r.id,
    status: r.status,
    reason: r.reason || r.title || BAN_APPEAL_REASON,
    description: r.description,
    action_taken: r.action_taken || r.admin_notes || null,
    reviewed_at: r.reviewed_at || r.updated_at || null,
    created_at: r.created_at,
  }));

  const resolved = normalizedRows
    .filter((r) => String(r.status || '').toLowerCase() === 'resolved')
    .sort((a, b) => new Date(b.reviewed_at || b.created_at).getTime() - new Date(a.reviewed_at || a.created_at).getTime());

  if (resolved.length) return resolved[0];
  return normalizedRows[0];
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
  const enrichReportedEntities = async (rows: any[]) => {
    if (!rows.length) return rows;

    const eventIds = Array.from(
      new Set(
        rows
          .filter((r) => r?.reported_content_type === 'event' && r?.reported_content_id)
          .map((r) => r.reported_content_id)
      )
    );
    const projectIds = Array.from(
      new Set(
        rows
          .filter((r) => r?.reported_content_type === 'project' && r?.reported_content_id)
          .map((r) => r.reported_content_id)
      )
    );
    const groupChatIds = Array.from(
      new Set(
        rows
          .filter((r) => r?.reported_content_type === 'group_chat' && r?.reported_content_id)
          .map((r) => r.reported_content_id)
      )
    );

    let events: any[] = [];
    let projects: any[] = [];
    let groups: any[] = [];

    if (eventIds.length) {
      const { data } = await (supabase as any)
        .from('events')
        .select('id, title, created_by')
        .in('id', eventIds);
      events = data || [];
    }

    if (projectIds.length) {
      const { data } = await (supabase as any)
        .from('project_teams')
        .select('id, name, created_by')
        .in('id', projectIds);
      projects = data || [];
    }

    if (groupChatIds.length) {
      const { data } = await (supabase as any)
        .from('conversations')
        .select('id, group_name, created_by, is_group')
        .in('id', groupChatIds)
        .eq('is_group', true);
      groups = data || [];
    }

    const creatorIds = Array.from(
      new Set(
        [...events, ...projects, ...groups]
          .map((item: any) => item?.created_by)
          .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    let creatorMap = new Map<string, string>();
    if (creatorIds.length) {
      const { data: creators } = await (supabase as any)
        .from('profiles')
        .select('id, full_name')
        .in('id', creatorIds);
      creatorMap = new Map(((creators as any[]) || []).map((c) => [c.id, c.full_name || 'Unknown']));
    }

    const eventMap = new Map(events.map((e: any) => [e.id, e]));
    const projectMap = new Map(projects.map((p: any) => [p.id, p]));
    const groupMap = new Map(groups.map((g: any) => [g.id, g]));

    return rows.map((row) => {
      if (row?.reported_content_type === 'event' && row?.reported_content_id) {
        const event = eventMap.get(row.reported_content_id);
        return {
          ...row,
          reported_entity_name: event?.title || null,
          reported_entity_creator_name: creatorMap.get(event?.created_by) || null,
        };
      }

      if (row?.reported_content_type === 'project' && row?.reported_content_id) {
        const project = projectMap.get(row.reported_content_id);
        return {
          ...row,
          reported_entity_name: project?.name || null,
          reported_entity_creator_name: creatorMap.get(project?.created_by) || null,
        };
      }

      if (row?.reported_content_type === 'group_chat' && row?.reported_content_id) {
        const group = groupMap.get(row.reported_content_id);
        return {
          ...row,
          reported_entity_name: group?.group_name || null,
          reported_entity_creator_name: creatorMap.get(group?.created_by) || null,
        };
      }

      return row;
    });
  };

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
  if (!error) {
    const rows = (data as any[]) || [];
    const missingReporter = rows.some((r) => !r.reporter);
    const missingReportedUser = rows.some((r) => !r.reported_user);
    if (!missingReporter && !missingReportedUser) {
      return enrichReportedEntities(rows);
    }

    const profileIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.reported_user_id, r.reporter_id, r.reported_by])
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    if (!profileIds.length) return rows;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', profileIds);
    const profileMap = new Map(((profiles as any[]) || []).map((p) => [p.id, p]));

    const hydratedRows = rows.map((row) => ({
      ...row,
      reporter: row.reporter || profileMap.get(row.reporter_id) || profileMap.get(row.reported_by) || null,
      reported_user: row.reported_user || profileMap.get(row.reported_user_id) || null,
    }));
    return enrichReportedEntities(hydratedRows);
  }

  // Fallback for schemas where FK aliases differ.
  let fallbackQuery = supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) {
    fallbackQuery = fallbackQuery.eq('status', filters.status);
  }

  const { data: fallbackData, error: fallbackError } = await fallbackQuery;
  if (fallbackError) throw fallbackError;

  const rows = (fallbackData as any[]) || [];
  const profileIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.reported_user_id, r.reporter_id, r.reported_by])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  if (!profileIds.length) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', profileIds);
  const profileMap = new Map(((profiles as any[]) || []).map((p) => [p.id, p]));

  const hydratedRows = rows.map((row) => ({
    ...row,
    reporter: profileMap.get(row.reporter_id) || profileMap.get(row.reported_by) || null,
    reported_user: profileMap.get(row.reported_user_id) || null,
  }));
  return enrichReportedEntities(hydratedRows);
};

export const updateReportStatus = async (
  reportId: string,
  status: string,
  reviewedBy: string,
  adminNotes?: string
) => {
  const normalizedStatus = status === 'on_hold' ? 'awaiting_info' : status;

  try {
    const updateData: any = {
      status: normalizedStatus,
      assigned_admin_id: reviewedBy,
      updated_at: new Date().toISOString(),
    };
    
    if (adminNotes) {
      updateData.admin_notes = adminNotes;
    }

    const { data, error } = await (supabase as any)
      .from("reports")
      .update(updateData)
      .eq("id", reportId)
      .select()
      .single();

    if (error) {
      console.error('UpdateReportStatus error:', error);
      throw error;
    }
    
    return data;
  } catch (error: any) {
    console.error('UpdateReportStatus catch:', error);
    // Return a local success object if SELECT after UPDATE fails due to RLS
    if (error?.message?.includes('permission') || error?.code === 'PGRST116') {
      console.warn('RLS prevented SELECT after UPDATE, continuing with local update');
      return {
        id: reportId,
        status: normalizedStatus,
        assigned_admin_id: reviewedBy,
        admin_notes: adminNotes || null,
        updated_at: new Date().toISOString(),
      };
    }
    throw error;
  }
};

export const deleteReport = async (reportId: string): Promise<{ success: boolean }> => {
  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', reportId);

  if (error) throw error;
  return { success: true };
};

export const resolveAppealWithFeedback = async (
  reportId: string,
  reviewedBy: string,
  userId: string,
  decision: 'approved' | 'denied',
  feedback: string
): Promise<void> => {
  const trimmedFeedback = feedback.trim();
  if (!trimmedFeedback) {
    throw new Error('Feedback is required while resolving appeals');
  }

  const actionTaken =
    decision === 'approved'
      ? `Appeal approved. Feedback: ${trimmedFeedback}`
      : `Appeal denied. Feedback: ${trimmedFeedback}`;

  if (decision === 'approved') {
    await unbanUser(userId);
  }

  await updateReportStatus(reportId, 'resolved', reviewedBy, actionTaken);

  const title = decision === 'approved' ? 'Appeal Approved' : 'Appeal Denied';
  const body =
    decision === 'approved'
      ? `Your appeal was approved. ${trimmedFeedback}`
      : `Your appeal was reviewed and denied. ${trimmedFeedback}`;

  // Best effort: feedback is persisted in report action_taken regardless of notification insert result.
  try {
    await (supabase as any).from('notifications').insert({
      user_id: userId,
      type: 'appeal_status',
      title,
      body,
      related_id: reportId,
      related_type: 'report',
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.warn('resolveAppealWithFeedback notification insert failed:', error?.message || error);
  }
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
  totalProjects: number;
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

  const safeCount = async (queryFactory: () => any) => {
    try {
      const result = await queryFactory();
      if (result?.error) {
        const message = result.error?.message || '';
        if (message) {
          console.warn('getEngagementMetrics count query failed:', message);
        }
        return 0;
      }
      return result?.count ?? 0;
    } catch (error: any) {
      const message = error?.message || '';
      if (message) {
        console.warn('getEngagementMetrics count query threw:', message);
      }
      return 0;
    }
  };

  // All static counts (not time-filtered)
  const [totalUsers, totalPosts, totalEvents, totalTeams] = await Promise.all([
    safeCount(() => supabase.from('profiles').select('id', { count: 'exact', head: true })),
    safeCount(() => supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('is_approved', true)),
    safeCount(() => supabase.from('events').select('id', { count: 'exact', head: true })),
    safeCount(() => supabase.from('project_teams').select('id', { count: 'exact', head: true })),
  ]);

  // Time-filtered counts
  const [recentMessages, recentPosts, recentRegistrations, newUsers] = await Promise.all([
    safeCount(() => supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    safeCount(() => supabase.from('feed_posts').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    safeCount(() => supabase.from('event_registrations').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    safeCount(() => supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since)),
  ]);

  // Users by role
  const roles = ['student', 'faculty', 'alumni', 'admin', 'developer'];
  const roleResults = await Promise.all(
    roles.map((role) =>
      safeCount(() => supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role))
    )
  );
  const usersByRole: Record<string, number> = {};
  roles.forEach((role, i) => {
    usersByRole[role] = roleResults[i] ?? 0;
  });

  return {
    totalUsers,
    usersByRole,
    totalPosts,
    totalEvents,
    // Prefer project naming for dashboard cards while keeping teams for existing consumers.
    totalProjects: totalTeams,
    totalTeams,
    recentMessages,
    recentPosts,
    recentRegistrations,
    newUsers,
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
  | 'user_created'
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
