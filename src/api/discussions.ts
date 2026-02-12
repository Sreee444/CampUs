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
    (data || []).map(async (topic) => {
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
  const { data, error } = await supabase
    .from('discussion_topics')
    .insert({
      title,
      category,
      created_by: createdBy,
    })
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
  const { data, error } = await supabase
    .from('discussion_replies')
    .insert({
      topic_id: topicId,
      user_id: userId,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DiscussionReply;
};

// Mark reply as solution
export const markAsSolution = async (replyId: string) => {
  const { data, error } = await supabase
    .from('discussion_replies')
    .update({ is_solution: true })
    .eq('id', replyId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Pin/Unpin topic (Faculty/Admin only)
export const pinDiscussionTopic = async (topicId: string, isPinned: boolean) => {
  const { data, error } = await supabase
    .from('discussion_topics')
    .update({ is_pinned: isPinned })
    .eq('id', topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Lock/Unlock topic (Faculty/Admin only)
export const lockDiscussionTopic = async (topicId: string, isLocked: boolean) => {
  const { data, error } = await supabase
    .from('discussion_topics')
    .update({ is_locked: isLocked })
    .eq('id', topicId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Delete topic (Faculty/Admin only)
export const deleteDiscussionTopic = async (topicId: string) => {
  // First delete all replies
  await supabase
    .from('discussion_replies')
    .delete()
    .eq('topic_id', topicId);

  // Then delete topic
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
