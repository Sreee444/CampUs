// Mentor-mentee API helpers
import { supabase } from './supabase';
import { MentorshipSession, MentorRequest, Profile } from '../types/database';
import { createNotification } from './notifications';

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
  return (data || []) as Profile[];
};

export const requestMentor = async (
  mentorId: string,
  menteeId: string,
  message?: string
) => {
  const { data, error } = await supabase
    .from('mentor_requests')
    .insert({
      mentor_id: mentorId,
      mentee_id: menteeId,
      message: message || null,
    } as any)
    .select()
    .single();

  if (error) throw error;

  await createNotification({
    user_id: mentorId,
    type: 'mentor_request',
    title: 'New Mentorship Request',
    body: 'You have a new mentorship request.',
    related_id: menteeId,
    related_type: 'profile',
  });

  return data as MentorRequest;
};

export const getIncomingMentorRequests = async (mentorId: string) => {
  const { data, error } = await supabase
    .from('mentor_requests')
    .select(`
      *,
      mentee:profiles!mentor_requests_mentee_id_fkey(*)
    `)
    .eq('mentor_id', mentorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as MentorRequest[];
};

export const getOutgoingMentorRequests = async (menteeId: string) => {
  const { data, error } = await supabase
    .from('mentor_requests')
    .select(`
      *,
      mentor:profiles!mentor_requests_mentor_id_fkey(*)
    `)
    .eq('mentee_id', menteeId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as MentorRequest[];
};

export const updateMentorRequestStatus = async (
  requestId: string,
  status: 'accepted' | 'rejected' | 'completed'
) => {
  const mentorRequestsQuery = supabase.from('mentor_requests') as any;

  const { data, error } = await mentorRequestsQuery
    .update({ status })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Mentor request not found after update.');

  if (data.mentee_id && status !== 'completed') {
    await createNotification({
      user_id: data.mentee_id,
      type: 'mentor_request_update',
      title: 'Mentorship Update',
      body: `Your mentorship request was ${status}.`,
      related_id: data.mentor_id,
      related_type: 'profile',
    });
  }

  return data as MentorRequest;
};

export const createMentorshipSession = async (
  mentorId: string,
  menteeId: string,
  scheduledAt: string,
  durationMinutes: number,
  notes?: string
) => {
  const { data, error } = await supabase
    .from('mentorship_sessions')
    .insert({
      mentor_id: mentorId,
      mentee_id: menteeId,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      notes: notes || null,
      status: 'scheduled',
    } as any)
    .select()
    .single();

  if (error) throw error;

  await createNotification({
    user_id: menteeId,
    type: 'mentorship_session',
    title: 'Mentorship Session Scheduled',
    body: 'A new mentoring session has been scheduled for you.',
    related_id: mentorId,
    related_type: 'profile',
  });

  return data as MentorshipSession;
};

export const getMentorshipSessions = async (userId: string) => {
  const { data, error } = await supabase
    .from('mentorship_sessions')
    .select(`
      *,
      mentor:profiles!mentorship_sessions_mentor_id_fkey(*),
      mentee:profiles!mentorship_sessions_mentee_id_fkey(*)
    `)
    .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return (data || []) as MentorshipSession[];
};

export const updateMentorshipSessionStatus = async (
  sessionId: string,
  status: 'scheduled' | 'completed' | 'cancelled'
) => {
  const mentorshipSessionsQuery = supabase.from('mentorship_sessions') as any;

  const { data, error } = await mentorshipSessionsQuery
    .update({ status })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Mentorship session not found after update.');
  return data as MentorshipSession;
};
