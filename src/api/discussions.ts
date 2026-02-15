// @ts-nocheck
import { supabase } from './supabase';
import { DiscussionTopic, DiscussionReply, DiscussionCategory } from '../types/database';

// Get all discussion topics
export const getDiscussionTopics = async () => {
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

      return { ...topic, replies_count: count || 0 };
    })
  );

  return topicsWithCounts as DiscussionTopic[];
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
  return data as DiscussionTopic;
};

// Create new topic
export const createDiscussionTopic = async (
  title: string,
  category: DiscussionCategory,
  createdBy: string
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from('discussion_topics')
    .insert({
      title,
      category,
      created_by: createdBy,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as DiscussionTopic;
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
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from('discussion_replies')
    .insert({
      topic_id: topicId,
      user_id: userId,
      content,
    } as any)
    .select()
    .single();

  if (error) throw error;
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
