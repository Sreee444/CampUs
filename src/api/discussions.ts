// @ts-nocheck
import { supabase } from './supabase';
import { DiscussionTopic, DiscussionReply, DiscussionCategory } from '../types/database';

type DiscussionScope = 'general' | 'event' | 'all';
type EventPhase = 'pre' | 'post' | 'all';

type GetDiscussionTopicsOptions = {
  scope?: DiscussionScope;
  eventId?: string;
  eventPhase?: EventPhase;
};

const getEventIdFromLegacyTitle = (title?: string): string | null => {
  if (!title) return null;
  const match = title.match(/\[event-([^\]]+)\]/);
  return match?.[1] || null;
};

const getEventPhaseFromLegacyTitle = (title?: string): 'pre' | 'post' | null => {
  if (!title) return null;
  if (title.includes('[Pre-Event]')) return 'pre';
  if (title.includes('[Post-Event]')) return 'post';
  return null;
};

const normalizeTopic = (topic: any) => {
  const legacyEventId = getEventIdFromLegacyTitle(topic.title);
  const legacyPhase = getEventPhaseFromLegacyTitle(topic.title);
  const normalizedScope = topic.discussion_scope || (legacyEventId ? 'event' : 'general');

  return {
    ...topic,
    event_id: topic.event_id || legacyEventId,
    event_phase: topic.event_phase || legacyPhase,
    discussion_scope: normalizedScope,
  };
};

// Get all discussion topics
export const getDiscussionTopics = async (options: GetDiscussionTopicsOptions = {}) => {
  const {
    scope = 'all',
    eventId,
    eventPhase = 'all',
  } = options;

  const { data, error } = await supabase
    .from('discussion_topics')
    .select(`
      *,
      creator:profiles!discussion_topics_created_by_fkey(*)
    `)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get replies count for each topic
  const topicsWithCounts = await Promise.all(
    (data || []).map(async (topic: any) => {
      const { count } = await supabase
        .from('discussion_replies')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topic.id);

      return { ...normalizeTopic(topic), replies_count: count || 0 };
    })
  );

  const filtered = topicsWithCounts.filter((topic: any) => {
    const topicScope = topic.discussion_scope || 'general';

    if (scope === 'general' && topicScope !== 'general') return false;
    if (scope === 'event' && topicScope !== 'event') return false;

    if (eventId && topic.event_id !== eventId) return false;

    if (eventPhase !== 'all' && topic.event_phase !== eventPhase) return false;

    return true;
  });

  return filtered as DiscussionTopic[];
};

// Get single topic
export const getDiscussionTopic = async (topicId: string) => {
  const { data, error } = await supabase
    .from('discussion_topics')
    .select(`
      *,
      creator:profiles!discussion_topics_created_by_fkey(*)
    `)
    .eq('id', topicId)
    .single();

  if (error) throw error;
  return normalizeTopic(data) as DiscussionTopic;
};

// Create new topic - supports both old and new signatures
export const createDiscussionTopic = async (
  titleOrData: string | any,
  categoryOrUndefined?: DiscussionCategory | string,
  createdByOrUndefined?: string
) => {
  let insertData: any = {};

  // Handle both function signatures
  if (typeof titleOrData === 'string') {
    // Old signature: (title, category, createdBy)
    insertData = {
      title: titleOrData,
      category: categoryOrUndefined,
      created_by: createdByOrUndefined,
    };
  } else {
    // New signature: ({title, category, created_by, ...})
    insertData = {
      title: titleOrData.title,
      category: titleOrData.category,
      created_by: titleOrData.created_by,
      description: titleOrData.description,
      event_id: titleOrData.event_id,
      discussion_scope: titleOrData.discussion_scope,
      event_phase: titleOrData.event_phase,
    };
  }

  // Ensure created_by is set to current user for RLS compliance
  const { data: sessionData } = await supabase.auth.getSession();
  if (!insertData.created_by && sessionData?.session?.user?.id) {
    insertData.created_by = sessionData.session.user.id;
  }

  // Ensure default scope for quick-access/general topics.
  if (!insertData.discussion_scope) {
    insertData.discussion_scope = 'general';
  }

  // Avoid sending undefined values in Supabase insert payload.
  Object.keys(insertData).forEach((key) => {
    if (insertData[key] === undefined) {
      delete insertData[key];
    }
  });

  let { data, error } = await supabase
    .from('discussion_topics')
    .insert(insertData as any)
    .select()
    .single();

  // Backward compatibility: if new metadata columns are missing in DB schema,
  // retry with the legacy minimal payload.
  if (error && ['PGRST204', '42703'].includes((error as any).code)) {
    const legacyInsertData: any = {
      title: insertData.title,
      category: insertData.category,
      created_by: insertData.created_by,
    };

    const retry = await supabase
      .from('discussion_topics')
      .insert(legacyInsertData)
      .select()
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('Error creating discussion topic:', error);
    throw error;
  }
  return normalizeTopic(data) as DiscussionTopic;
};

// Get replies for a topic
export const getTopicReplies = async (topicId: string) => {
  const { data, error } = await supabase
    .from('discussion_replies')
    .select(`
      *,
      user:profiles!discussion_replies_user_id_fkey(*)
    `)
    .eq('topic_id', topicId)
    .order('is_solution', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as DiscussionReply[];
};

// Post reply to topic
export const postReply = async (
  topicId: string,
  userId: string,
  content: string
) => {
  // Ensure user_id is set to current user for RLS compliance
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = userId || sessionData?.session?.user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to post replies');
  }

  const { data, error } = await supabase
    .from('discussion_replies')
    .insert({
      topic_id: topicId,
      user_id: currentUserId,
      content,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('Error posting reply:', error);
    throw error;
  }
  return data as DiscussionReply;
};

// Mark reply as solution
export const markAsSolution = async (replyId: string) => {
  try {
    // First, get the topic_id of this reply
    const { data: reply, error: replyError } = await supabase
      .from('discussion_replies')
      .select('topic_id')
      .eq('id', replyId)
      .single();

    if (replyError) throw replyError;
    if (!reply) throw new Error('Reply not found');

    // Unmark any existing solutions for this topic
    await supabase
      .from('discussion_replies')
      .update({ is_solution: false } as any)
      .eq('topic_id', reply.topic_id)
      .eq('is_solution', true);

    // Mark this reply as the solution
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await supabase
      .from('discussion_replies')
      .update({ is_solution: true } as any)
      .eq('id', replyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error marking solution:', error);
    throw error;
  }
};

// Pin/Unpin topic (Faculty/Admin only)
export const pinDiscussionTopic = async (topicId: string, isPinned: boolean) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from('discussion_topics')
    .update({ is_pinned: isPinned } as any)
    .eq('id', topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Lock/Unlock topic (Faculty/Admin only)
export const lockDiscussionTopic = async (topicId: string, isLocked: boolean) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from('discussion_topics')
    .update({ is_locked: isLocked } as any)
    .eq('id', topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Delete topic (Faculty/Admin only)
export const deleteDiscussionTopic = async (topicId: string) => {
  // Try to delete replies first (best effort)
  // This handles cases where ON DELETE CASCADE is missing in the DB
  const { error: replyError } = await supabase
    .from('discussion_replies')
    .delete()
    .eq('topic_id', topicId);

  if (replyError) {
    console.log('Reply delete warning:', replyError);
    // Continue to try deleting the topic anyway
  }

  const { error } = await supabase
    .from('discussion_topics')
    .delete()
    .eq('id', topicId);

  if (error) throw error;
};

// Delete reply
export const deleteReply = async (replyId: string) => {
  const { error } = await supabase
    .from('discussion_replies')
    .delete()
    .eq('id', replyId);

  if (error) throw error;
};
