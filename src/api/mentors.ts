// @ts-nocheck
// Mentorship API - Structured system with separate mentors table
import { supabase } from './supabase';
import { Mentor, MentorshipPurpose, MentorshipStatus, StructuredMentorshipRequest } from '../types/database';
import { createNotification } from './notifications';
import { getMentorshipChatsForUser } from './mentorshipChat';

// ─── Mentor Registration & Discovery ─────────────────────────

export const getMentors = async (filters?: {
  role?: string;
  department?: string;
  expertise?: string;
  available?: boolean;
}): Promise<Mentor[]> => {
  let query = supabase
    .from('mentors')
    .select(`
      *,
      profile:profiles!mentors_user_id_fkey(
        id, full_name, avatar_url, bio, role, department, email
      )
    `)
    .order('created_at', { ascending: false });

  if (filters?.available !== undefined) {
    query = query.eq('available', filters.available);
  }
  if (filters?.role) {
    query = query.eq('role', filters.role);
  }
  if (filters?.department) {
    query = query.ilike('department', `%${filters.department}%`);
  }
  if (filters?.expertise) {
    query = query.contains('expertise_tags', [filters.expertise]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Mentor[];
};

export const getMyMentorProfile = async (userId: string): Promise<Mentor | null> => {
  const { data, error } = await supabase
    .from('mentors')
    .select(`
      *,
      profile:profiles!mentors_user_id_fkey(
        id, full_name, avatar_url, bio, role, department, email
      )
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Mentor | null;
};

export const becomeMentor = async (
  userId: string,
  data: {
    role: string;
    expertise_tags: string[];
    department?: string;
    company?: string;
    max_mentees?: number;
  }
): Promise<Mentor> => {
  const { data: result, error } = await supabase
    .from('mentors')
    .upsert(
      {
        user_id: userId,
        role: data.role,
        expertise_tags: data.expertise_tags || [],
        department: data.department || null,
        company: data.company || null,
        max_mentees: data.max_mentees || 5,
        available: true,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return result as Mentor;
};

export const updateMentorAvailability = async (
  mentorId: string,
  available: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('mentors')
    .update({ available })
    .eq('id', mentorId);

  if (error) throw error;
};

// ─── Mentorship Requests ──────────────────────────────────────

export const createMentorshipRequest = async (data: {
  mentor_id: string;
  mentee_id: string;
  purpose: MentorshipPurpose;
  project_id?: string;
  description: string;
}): Promise<StructuredMentorshipRequest> => {
  if (data.project_id && data.purpose !== 'project') {
    throw new Error('Project can only be attached when purpose is project.');
  }

  if (data.purpose === 'project' && !data.project_id) {
    throw new Error('Project mentorship requests must include a project.');
  }

  if (data.purpose === 'project' && data.project_id) {
    const { data: team, error: teamError } = await supabase
      .from('project_teams')
      .select('id, created_by')
      .eq('id', data.project_id)
      .maybeSingle();

    if (teamError) throw teamError;
    if (!team) throw new Error('Selected project not found.');

    const isCreator = team.created_by === data.mentee_id;
    if (!isCreator) {
      throw new Error('Only the project creator can send project mentorship requests.');
    }
  }

  // Enforce: max 3 active mentors per student
  const { count: activeCount } = await supabase
    .from('mentorship_requests')
    .select('id', { count: 'exact', head: true })
    .eq('mentee_id', data.mentee_id)
    .eq('status', 'accepted');

  if ((activeCount || 0) >= 3) {
    throw new Error('You already have 3 active mentors. Close an existing mentorship first.');
  }

  // Prevent duplicate pending/active request to same mentor FOR SAME PURPOSE.
  // Different purposes with same mentor are allowed (e.g., project + career).
  const { data: existingRows, error: existingError } = await supabase
    .from('mentorship_requests')
    .select('id, purpose, status')
    .eq('mentor_id', data.mentor_id)
    .eq('mentee_id', data.mentee_id)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });

  if (existingError) throw existingError;

  const duplicateSamePurpose = (existingRows || []).find(
    (row: any) => row.purpose === data.purpose
  );

  if (duplicateSamePurpose) {
    throw new Error(`You already have a pending or active ${data.purpose} request with this mentor.`);
  }

  let preAssignMentorUserId: string | null = null;

  // For project mentorship, assign mentor to project BEFORE inserting request.
  // This guarantees project assignment and team-member sync at request creation time.
  if (data.purpose === 'project' && data.project_id) {
    const { data: mentorRow, error: mentorLookupError } = await supabase
      .from('mentors')
      .select('user_id')
      .eq('id', data.mentor_id)
      .single();

    if (mentorLookupError) throw mentorLookupError;
    preAssignMentorUserId = mentorRow?.user_id || null;
    if (!preAssignMentorUserId) {
      throw new Error('Selected mentor profile is invalid.');
    }

    const { data: updatedProject, error: teamUpdateError } = await supabase
      .from('project_teams')
      .update({ mentor_id: preAssignMentorUserId })
      .eq('id', data.project_id)
      .eq('created_by', data.mentee_id)
      .select('id, mentor_id')
      .maybeSingle();

    if (teamUpdateError) throw teamUpdateError;
    if (!updatedProject) {
      throw new Error('Failed to assign mentor to project. Please ensure you are the project creator.');
    }

    const { data: existingMembers, error: memberLookupError } = await supabase
      .from('project_team_members')
      .select('id, role')
      .eq('team_id', data.project_id)
      .eq('user_id', preAssignMentorUserId)
      .order('joined_at', { ascending: false });

    if (memberLookupError) throw memberLookupError;

    const existingMember = (existingMembers || [])[0] || null;

    if (!existingMember) {
      const { error: memberInsertError } = await supabase
        .from('project_team_members')
        .insert({
          team_id: data.project_id,
          user_id: preAssignMentorUserId,
          role: 'advisor',
        } as any);

      if (memberInsertError) throw memberInsertError;
    } else if (existingMember.role !== 'advisor') {
      const { error: memberRoleUpdateError } = await supabase
        .from('project_team_members')
        .update({ role: 'advisor' })
        .eq('id', existingMember.id);

      if (memberRoleUpdateError) throw memberRoleUpdateError;
    }
  }

  const { data: result, error } = await supabase
    .from('mentorship_requests')
    .insert({
      mentor_id: data.mentor_id,
      mentee_id: data.mentee_id,
      purpose: data.purpose,
      project_id: data.project_id || null,
      description: data.description,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;

  // Notify the mentor
  try {
    // Get mentor's user_id
    const { data: mentorRow } = await supabase
      .from('mentors')
      .select('user_id')
      .eq('id', data.mentor_id)
      .single();

    if (mentorRow?.user_id) {
      await createNotification({
        user_id: mentorRow.user_id,
        type: 'mentor_request',
        title: 'New Mentorship Request',
        body: `You have a new ${data.purpose} mentorship request.`,
        related_id: result.id,
        related_type: 'mentorship_request',
        is_read: false,
      });
    }
  } catch (_) {
    // Non-fatal
  }

  return result as StructuredMentorshipRequest;
};

export const getMyMentorshipRequests = async (
  menteeId: string
): Promise<StructuredMentorshipRequest[]> => {
  const { data, error } = await supabase
    .from('mentorship_requests')
    .select(`
      *,
      mentor:mentors!mentorship_requests_mentor_id_fkey(
        *,
        profile:profiles!mentors_user_id_fkey(id, full_name, avatar_url, role, department)
      )
    `)
    .eq('mentee_id', menteeId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as StructuredMentorshipRequest[];
};

export const getMentorIncomingRequests = async (
  userId: string
): Promise<StructuredMentorshipRequest[]> => {
  // First, get the mentor record for this user
  const { data: mentorRow, error: mErr } = await supabase
    .from('mentors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (mErr) throw mErr;
  if (!mentorRow) return [];

  const { data, error } = await supabase
    .from('mentorship_requests')
    .select(`
      *,
      mentee:profiles!mentorship_requests_mentee_id_fkey(
        id, full_name, avatar_url, role, department, bio
      )
    `)
    .eq('mentor_id', mentorRow.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as StructuredMentorshipRequest[];
};

export const updateMentorshipRequestStatus = async (
  requestId: string,
  status: MentorshipStatus
): Promise<StructuredMentorshipRequest> => {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user?.id) throw new Error('You must be authenticated.');

  const { data: existing, error: existingError } = await supabase
    .from('mentorship_requests')
    .select('id, status, mentee_id, purpose, project_id, mentor:mentors(user_id)')
    .eq('id', requestId)
    .single();

  if (existingError) throw existingError;
  if (!existing) throw new Error('Request not found.');

  const mentorUserId = existing.mentor?.user_id;
  const isMentee = existing.mentee_id === user.id;
  const isMentor = mentorUserId === user.id;

  if (!isMentee && !isMentor) {
    throw new Error('You are not allowed to update this mentorship request.');
  }

  const currentStatus = existing.status;

  // Transition rules:
  // - pending -> accepted/rejected (mentor only)
  // - accepted -> closed (mentor or mentee)
  if (currentStatus === 'pending') {
    if (!(status === 'accepted' || status === 'rejected')) {
      throw new Error('Pending requests can only be accepted or rejected.');
    }
    if (!isMentor) {
      throw new Error('Only the mentor can accept or reject a pending request.');
    }
  } else if (currentStatus === 'accepted') {
    if (status !== 'closed') {
      throw new Error('Active mentorship can only be closed.');
    }
    if (!isMentor && !isMentee) {
      throw new Error('Only mentor or mentee can close this mentorship.');
    }
  } else {
    throw new Error('This mentorship request is already finalized.');
  }

  const { data, error } = await supabase
    .from('mentorship_requests')
    .update({ status })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Request not found after update.');

  // When accepted: auto-create mentorship chat so both sides can message
  if (status === 'accepted') {
    try {
      // For project-purpose mentorship, do not create personal mentorship chat.
      // Chat for this case should be the project team chat only.
      if (data.purpose === 'project') {
        // Cleanup any older personal chat accidentally created for this request.
        await supabase
          .from('mentorship_chats')
          .delete()
          .eq('mentorship_id', requestId);
      } else {
        // Non-project mentorships keep personal mentorship chat.
        const { data: mentorRow } = await supabase
          .from('mentors')
          .select('user_id')
          .eq('id', data.mentor_id)
          .single();

        const mentorUserId = mentorRow?.user_id;
        const menteeUserId = data.mentee_id;

        if (mentorUserId && menteeUserId) {
          // Upsert chat (safe if called twice — mentorship_id is UNIQUE)
          const { data: chat, error: chatError } = await supabase
            .from('mentorship_chats')
            .upsert({ mentorship_id: requestId }, { onConflict: 'mentorship_id' })
            .select('id')
            .single();

          if (!chatError && chat?.id) {
            // Add both participants (ignore error if already exists)
            await supabase
              .from('mentorship_chat_participants')
              .upsert(
                [
                  { chat_id: chat.id, user_id: mentorUserId },
                  { chat_id: chat.id, user_id: menteeUserId },
                ],
                { onConflict: 'chat_id,user_id' }
              );
          }
        }
      }
    } catch (_) {
      // Non-fatal — chat creation failure should not block status update
    }
  }

  // When closed: delete mentorship chat so it is removed for both sides
  if (status === 'closed') {
    try {
      await supabase
        .from('mentorship_chats')
        .delete()
        .eq('mentorship_id', requestId);
    } catch (_) {
      // Non-fatal
    }
  }

  // If project mentorship is rejected/closed, cleanup project mentor assignment for this mentor.
  if ((status === 'rejected' || status === 'closed') && data.purpose === 'project' && data.project_id) {
    try {
      const { data: mentorRow } = await supabase
        .from('mentors')
        .select('user_id')
        .eq('id', data.mentor_id)
        .single();

      const mentorUserId = mentorRow?.user_id;

      if (mentorUserId) {
        await supabase
          .from('project_teams')
          .update({ mentor_id: null })
          .eq('id', data.project_id)
          .eq('mentor_id', mentorUserId);

        await supabase
          .from('project_team_members')
          .delete()
          .eq('team_id', data.project_id)
          .eq('user_id', mentorUserId)
          .eq('role', 'advisor');
      }
    } catch (_) {
      // Non-fatal
    }
  }

  // Notify mentee
  try {
    await createNotification({
      user_id: data.mentee_id,
      type: 'mentor_request',
      title: 'Mentorship Update',
      body: `Your mentorship request was ${status}.${status === 'accepted' ? ' You can now chat with your mentor in Mentor Hub!' : ''}`,
      related_id: requestId,
      related_type: 'mentorship_request',
      is_read: false,
    });
  } catch (_) {
    // Non-fatal
  }

  return data as StructuredMentorshipRequest;
};

export const getMentorshipConversations = async (userId: string) => {
  // Backward-compatible helper: now returns dedicated mentorship chat rows
  // from mentorship_chats/mentorship_messages instead of main conversations.
  return getMentorshipChatsForUser(userId);
};

// ─── Legacy helpers (kept for backward compat) ───────────────

export const getMentorProfiles = async (expertise?: string[]) => {
  let query = supabase
    .from('profiles')
    .select('*')
    .eq('is_mentor', true);

  if (expertise && expertise.length > 0) {
    query = query.overlaps('areas_of_expertise', expertise);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const requestMentor = async (
  mentorId: string,
  menteeId: string,
  message?: string
) => {
  const { data, error } = await supabase
    .from('mentor_requests')
    .insert({ mentor_id: mentorId, mentee_id: menteeId, message: message || null } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getIncomingMentorRequests = async (mentorId: string) => {
  const { data, error } = await supabase
    .from('mentor_requests')
    .select(`*, mentee:profiles!mentor_requests_mentee_id_fkey(*)`)
    .eq('mentor_id', mentorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getOutgoingMentorRequests = async (menteeId: string) => {
  const { data, error } = await supabase
    .from('mentor_requests')
    .select(`*, mentor:profiles!mentor_requests_mentor_id_fkey(*)`)
    .eq('mentee_id', menteeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};



export const getMentorshipRequest = async (requestId: string): Promise<any> => {
  const { data, error } = await supabase
    .from('mentorship_requests')
    .select('*, mentor:mentors(user_id, role, profile:profiles(full_name))')
    .eq('id', requestId)
    .single();
  if (error) throw error;
  return data;
};