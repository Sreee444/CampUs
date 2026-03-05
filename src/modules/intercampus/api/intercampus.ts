// @ts-nocheck
import { supabase } from '../../../api/supabase';
import {
  InterCampusApprovePayload,
  InterCampusDiscussion,
  InterCampusDiscussionReply,
  InterCampusEvent,
  InterCampusEventSubmission,
  InterCampusFestGroup,
  InterCampusSubmissionInput,
  InterCampusTeamPost,
  InterCampusTeamPostReply,
} from '../types/intercampus';

const ensureTeamSizeRange = (min?: number | null, max?: number | null, teamSize?: number | null) => {
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    throw new Error('Minimum team size cannot exceed maximum team size');
  }

  if (typeof teamSize === 'number') {
    if (typeof min === 'number' && teamSize < min) {
      throw new Error('Team size must be greater than or equal to minimum team size');
    }
    if (typeof max === 'number' && teamSize > max) {
      throw new Error('Team size must be less than or equal to maximum team size');
    }
  }
};

const normalizeSkills = (skills: string[] | undefined) => {
  return (skills || []).map((item) => item.trim()).filter(Boolean);
};

export const getVerifiedInterCampusEvents = async (userId?: string): Promise<InterCampusEvent[]> => {
  const { data: events, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('verification_status', 'verified')
    .order('event_start_date', { ascending: true, nullsFirst: false });

  if (error) throw error;
  const rows = (events || []) as InterCampusEvent[];
  if (!rows.length) return [];

  const eventIds = rows.map((event) => event.id);

  const [{ data: interestedRows, error: interestedError }, userInterestedResult] = await Promise.all([
    supabase
      .from('intercampus_interested_users')
      .select('event_id, user_id')
      .in('event_id', eventIds),
    userId
      ? supabase
          .from('intercampus_interested_users')
          .select('event_id')
          .eq('user_id', userId)
          .in('event_id', eventIds)
      : Promise.resolve({ data: null as any, error: null as any }),
  ]);

  if (interestedError) throw interestedError;
  if (userInterestedResult?.error) throw userInterestedResult.error;

  const countMap = new Map<string, number>();
  (interestedRows || []).forEach((row: any) => {
    countMap.set(row.event_id, (countMap.get(row.event_id) || 0) + 1);
  });

  const interestedSet = new Set<string>((userInterestedResult?.data || []).map((row: any) => row.event_id));

  return rows.map((event) => ({
    ...event,
    interested_count: countMap.get(event.id) || 0,
    is_interested: interestedSet.has(event.id),
  }));
};

export const getInterCampusEventById = async (eventId: string, userId?: string): Promise<InterCampusEvent | null> => {
  const { data: event, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('id', eventId)
    .eq('verification_status', 'verified')
    .single();

  if (error) throw error;

  const [{ count }, userInterestedResult] = await Promise.all([
    supabase
      .from('intercampus_interested_users')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId),
    userId
      ? supabase
          .from('intercampus_interested_users')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null as any, error: null as any }),
  ]);

  if (userInterestedResult?.error) throw userInterestedResult.error;

  return {
    ...(event as InterCampusEvent),
    interested_count: count || 0,
    is_interested: !!userInterestedResult?.data,
  };
};

export const getInterCampusFests = (events: InterCampusEvent[]): InterCampusFestGroup[] => {
  const grouped = new Map<string, InterCampusFestGroup>();

  events.forEach((event) => {
    if (!event.fest_name?.trim()) return;
    const key = `${event.fest_name.trim()}__${event.college_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        fest_name: event.fest_name,
        college_name: event.college_name,
        college_location: event.college_location,
        banner_image: event.banner_image,
        events: [],
      });
    }

    grouped.get(key)!.events.push(event);
  });

  return Array.from(grouped.values()).sort((a, b) => a.fest_name.localeCompare(b.fest_name));
};

export const submitInterCampusEvent = async (submittedBy: string, payload: InterCampusSubmissionInput) => {
  ensureTeamSizeRange(payload.min_team_size, payload.max_team_size);

  const baseInsert: any = {
    submitted_by: submittedBy,
    event_title: payload.event_title,
    event_description: payload.event_description || null,
    college_name: payload.college_name,
    college_location: payload.college_location || null,
    college_website: payload.college_website || null,
    fest_name: payload.fest_name || null,
    event_start_date: payload.event_start_date || null,
    event_end_date: payload.event_end_date || null,
    registration_link: payload.registration_link || null,
    registration_deadline: payload.registration_deadline || null,
    participation_type: payload.participation_type || null,
    min_team_size: payload.min_team_size ?? null,
    max_team_size: payload.max_team_size ?? null,
  };

  let { data, error } = await supabase
    .from('intercampus_event_submissions')
    .insert(baseInsert as any)
    .select('*')
    .single();

  if (error && String(error.message || '').toLowerCase().includes('registration_deadline')) {
    const { registration_deadline: _ignored, ...withoutDeadline } = baseInsert;
    const retry = await supabase
      .from('intercampus_event_submissions')
      .insert(withoutDeadline as any)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data as InterCampusEventSubmission;
};

export const submitInterCampusFestEvents = async (
  submittedBy: string,
  festName: string,
  common: {
    college_name: string;
    college_location?: string;
    college_website?: string;
    fest_start_date?: string;
    fest_end_date?: string;
  },
  events: InterCampusSubmissionInput[],
) => {
  if (!events.length) throw new Error('At least one event is required for fest submission');

  const insertRows = events.map((event) => {
    ensureTeamSizeRange(event.min_team_size, event.max_team_size);

    return {
      submitted_by: submittedBy,
      event_title: event.event_title,
      event_description: event.event_description || null,
      college_name: common.college_name,
      college_location: common.college_location || null,
      college_website: common.college_website || null,
      fest_name: festName,
      event_start_date: event.event_start_date || common.fest_start_date || null,
      event_end_date: event.event_end_date || common.fest_end_date || null,
      registration_link: event.registration_link || null,
      participation_type: event.participation_type || null,
      min_team_size: event.min_team_size ?? null,
      max_team_size: event.max_team_size ?? null,
    };
  });

  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .insert(insertRows as any)
    .select('*');

  if (error) throw error;
  return (data || []) as InterCampusEventSubmission[];
};

export const toggleInterCampusInterested = async (eventId: string, userId: string) => {
  const { data: existing, error: existingError } = await supabase
    .from('intercampus_interested_users')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from('intercampus_interested_users')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from('intercampus_interested_users')
    .insert({ event_id: eventId, user_id: userId } as any);

  if (error) throw error;
  return true;
};

export const getInterCampusInterestedUsers = async (eventId: string) => {
  const { data, error } = await supabase
    .from('intercampus_interested_users')
    .select('id, created_at, user_id, user:profiles!intercampus_interested_users_user_id_fkey(id, full_name, avatar_url, role, department)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getInterCampusTeamPosts = async (eventId: string): Promise<InterCampusTeamPost[]> => {
  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .select('*, creator:profiles!intercampus_team_posts_created_by_fkey(id, full_name, avatar_url, department, role)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusTeamPost[];
};

export const createInterCampusTeamPost = async (
  createdBy: string,
  payload: {
    event_id: string;
    message: string;
    required_skills?: string[];
    team_size_needed?: number;
    min_team_size?: number;
    max_team_size?: number;
  },
) => {
  ensureTeamSizeRange(payload.min_team_size, payload.max_team_size, payload.team_size_needed);

  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .insert({
      event_id: payload.event_id,
      created_by: createdBy,
      message: payload.message,
      required_skills: normalizeSkills(payload.required_skills),
      team_size_needed: payload.team_size_needed ?? null,
      status: 'open',
    } as any)
    .select('*, creator:profiles!intercampus_team_posts_created_by_fkey(id, full_name, avatar_url, department, role)')
    .single();

  if (error) throw error;
  return data as InterCampusTeamPost;
};

export const closeInterCampusTeamPost = async (postId: string) => {
  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .update({ status: 'closed' } as any)
    .eq('id', postId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const deleteInterCampusTeamPost = async (postId: string) => {
  const { error } = await supabase
    .from('intercampus_team_posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
  return true;
};

export const getInterCampusTeamPostReplies = async (postId: string): Promise<InterCampusTeamPostReply[]> => {
  const { data, error } = await supabase
    .from('intercampus_team_post_replies')
    .select('*, user:profiles!intercampus_team_post_replies_user_id_fkey(id, full_name, avatar_url, department, role)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as InterCampusTeamPostReply[];
};

export const replyToInterCampusTeamPost = async (userId: string, postId: string, message: string) => {
  const { data, error } = await supabase
    .from('intercampus_team_post_replies')
    .insert({ post_id: postId, user_id: userId, message } as any)
    .select('*, user:profiles!intercampus_team_post_replies_user_id_fkey(id, full_name, avatar_url, department, role)')
    .single();

  if (error) throw error;
  return data as InterCampusTeamPostReply;
};

export const getInterCampusDiscussions = async (eventId: string): Promise<InterCampusDiscussion[]> => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .select('*, creator:profiles!intercampus_discussions_created_by_fkey(id, full_name, avatar_url, role)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusDiscussion[];
};

export const createInterCampusDiscussion = async (eventId: string, userId: string, title: string) => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .insert({ event_id: eventId, created_by: userId, title } as any)
    .select('*, creator:profiles!intercampus_discussions_created_by_fkey(id, full_name, avatar_url, role)')
    .single();

  if (error) throw error;
  return data as InterCampusDiscussion;
};

export const lockInterCampusDiscussion = async (discussionId: string, locked = true) => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .update({ is_locked: locked } as any)
    .eq('id', discussionId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const getInterCampusDiscussionReplies = async (discussionId: string): Promise<InterCampusDiscussionReply[]> => {
  const { data, error } = await supabase
    .from('intercampus_discussion_replies')
    .select('*, user:profiles!intercampus_discussion_replies_user_id_fkey(id, full_name, avatar_url, role)')
    .eq('discussion_id', discussionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as InterCampusDiscussionReply[];
};

export const createInterCampusDiscussionReply = async (discussionId: string, userId: string, message: string) => {
  const { data, error } = await supabase
    .from('intercampus_discussion_replies')
    .insert({ discussion_id: discussionId, user_id: userId, message } as any)
    .select('*, user:profiles!intercampus_discussion_replies_user_id_fkey(id, full_name, avatar_url, role)')
    .single();

  if (error) throw error;
  return data as InterCampusDiscussionReply;
};

export const deleteInterCampusDiscussionReply = async (replyId: string) => {
  const { error } = await supabase
    .from('intercampus_discussion_replies')
    .delete()
    .eq('id', replyId);

  if (error) throw error;
  return true;
};

export const getInterCampusPendingSubmissions = async (): Promise<InterCampusEventSubmission[]> => {
  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusEventSubmission[];
};

export const approveInterCampusSubmission = async (
  approverId: string,
  payload: InterCampusApprovePayload,
) => {
  const { data: submission, error: submissionError } = await supabase
    .from('intercampus_event_submissions')
    .select('*')
    .eq('id', payload.submission_id)
    .single();

  if (submissionError) throw submissionError;
  if (!submission) throw new Error('Submission not found');

  const { data: insertedEvent, error: insertError } = await supabase
    .from('intercampus_events')
    .insert({
      title: submission.event_title || 'Untitled Event',
      description: submission.event_description || null,
      college_name: submission.college_name || 'Unknown College',
      college_location: submission.college_location || null,
      college_website: submission.college_website || null,
      fest_name: submission.fest_name || null,
      event_start_date: submission.event_start_date || null,
      event_end_date: submission.event_end_date || null,
      registration_link: submission.registration_link || null,
      participation_type: submission.participation_type || null,
      min_team_size: submission.min_team_size ?? null,
      max_team_size: submission.max_team_size ?? null,
      verification_status: 'verified',
      faculty_notes: payload.faculty_notes || null,
      participation_cap: payload.participation_cap ?? null,
      created_by: approverId,
    } as any)
    .select('*')
    .single();

  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('intercampus_event_submissions')
    .update({ status: 'approved' } as any)
    .eq('id', payload.submission_id);

  if (updateError) throw updateError;

  return insertedEvent as InterCampusEvent;
};

export const rejectInterCampusSubmission = async (submissionId: string) => {
  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .update({ status: 'rejected' } as any)
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error) throw error;
  return data as InterCampusEventSubmission;
};

export const getInterCampusMyCollaborations = async (userId: string) => {
  const [{ data: myPosts, error: postsError }, { data: myReplies, error: repliesError }] = await Promise.all([
    supabase
      .from('intercampus_team_posts')
      .select('*, event:intercampus_events!intercampus_team_posts_event_id_fkey(id, title, college_name, participation_type, verification_status)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('intercampus_team_post_replies')
      .select('*, post:intercampus_team_posts!intercampus_team_post_replies_post_id_fkey(id, event_id, message, status, event:intercampus_events!intercampus_team_posts_event_id_fkey(id, title, college_name, participation_type, verification_status))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (postsError) throw postsError;
  if (repliesError) throw repliesError;

  return {
    my_posts: myPosts || [],
    my_replies: myReplies || [],
  };
};

export const getMyInterCampusSubmissions = async (userId: string): Promise<InterCampusEventSubmission[]> => {
  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .select('*')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusEventSubmission[];
};

export const resolveApprovedEventForSubmission = async (submission: InterCampusEventSubmission) => {
  if (!submission.event_title || !submission.college_name) return null;

  let query = supabase
    .from('intercampus_events')
    .select('id')
    .eq('verification_status', 'verified')
    .eq('title', submission.event_title)
    .eq('college_name', submission.college_name)
    .order('created_at', { ascending: false })
    .limit(1);

  if (submission.event_start_date) {
    query = query.eq('event_start_date', submission.event_start_date);
  }

  if (submission.fest_name) {
    query = query.eq('fest_name', submission.fest_name);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

export const getInterCampusAdminOverview = async () => {
  const [
    pendingSubmissions,
    openTeamPosts,
    lockedDiscussions,
    interestedUsers,
  ] = await Promise.all([
    supabase.from('intercampus_event_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('intercampus_team_posts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('intercampus_discussions').select('id', { count: 'exact', head: true }).eq('is_locked', true),
    supabase.from('intercampus_interested_users').select('id', { count: 'exact', head: true }),
  ]);

  return {
    pending_submissions: pendingSubmissions.count || 0,
    open_team_posts: openTeamPosts.count || 0,
    locked_discussions: lockedDiscussions.count || 0,
    interested_users: interestedUsers.count || 0,
  };
};

export const getInterCampusAllTeamPosts = async () => {
  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .select('*, event:intercampus_events!intercampus_team_posts_event_id_fkey(id, title, college_name), creator:profiles!intercampus_team_posts_created_by_fkey(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
};

export const getInterCampusAllDiscussions = async () => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .select('*, event:intercampus_events!intercampus_discussions_event_id_fkey(id, title, college_name), creator:profiles!intercampus_discussions_created_by_fkey(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
};

export const getInterCampusAllDiscussionReplies = async () => {
  const { data, error } = await supabase
    .from('intercampus_discussion_replies')
    .select('*, discussion:intercampus_discussions!intercampus_discussion_replies_discussion_id_fkey(id, title), user:profiles!intercampus_discussion_replies_user_id_fkey(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data || [];
};

export const createInterCampusEventDirect = async (
  creatorId: string,
  payload: {
    title: string;
    description?: string;
    college_name: string;
    college_location?: string;
    college_website?: string;
    fest_name?: string;
    event_type?: string;
    participation_type?: 'individual' | 'team';
    min_team_size?: number;
    max_team_size?: number;
    venue?: string;
    is_online?: boolean;
    registration_link?: string;
    registration_deadline?: string;
    event_start_date: string;
    event_end_date?: string;
    eligibility_text?: string;
    banner_image?: string;
    faculty_notes?: string;
    participation_cap?: number;
  },
) => {
  ensureTeamSizeRange(payload.min_team_size, payload.max_team_size);

  const insertData: any = {
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    college_name: payload.college_name.trim(),
    college_location: payload.college_location?.trim() || null,
    college_website: payload.college_website?.trim() || null,
    fest_name: payload.fest_name?.trim() || null,
    event_type: payload.event_type?.trim() || null,
    participation_type: payload.participation_type || null,
    min_team_size: payload.participation_type === 'team' ? payload.min_team_size ?? null : null,
    max_team_size: payload.participation_type === 'team' ? payload.max_team_size ?? null : null,
    venue: payload.venue?.trim() || null,
    is_online: !!payload.is_online,
    registration_link: payload.registration_link?.trim() || null,
    registration_deadline: payload.registration_deadline || null,
    event_start_date: payload.event_start_date,
    event_end_date: payload.event_end_date || null,
    eligibility_text: payload.eligibility_text?.trim() || null,
    banner_image: payload.banner_image?.trim() || null,
    faculty_notes: payload.faculty_notes?.trim() || null,
    participation_cap: payload.participation_cap ?? null,
    verification_status: 'verified',
    created_by: creatorId,
    status: 'upcoming',
  };

  let result = await supabase.from('intercampus_events').insert(insertData).select('*').single();

  // Backward-compatible fallback when `status` column is not present.
  if (result.error && String(result.error.message || '').toLowerCase().includes('status')) {
    const { status: _ignored, ...withoutStatus } = insertData;
    result = await supabase.from('intercampus_events').insert(withoutStatus).select('*').single();
  }

  if (result.error) throw result.error;
  return result.data as InterCampusEvent;
};
