// @ts-nocheck
import { supabase } from './supabase';
import { MentorshipPurpose, MentorshipStatus, Profile } from '../types/database';

export type MentorshipChat = {
  id: string;
  mentorship_id: string;
  is_group: boolean;
  created_at: string;
  mentorship?: {
    id: string;
    purpose: MentorshipPurpose;
    status: MentorshipStatus;
    mentee?: Profile;
    mentor?: {
      id: string;
      user?: Profile;
    };
  } | null;
  last_message?: {
    id: string;
    chat_id: string;
    content: string;
    created_at: string;
    sender?: Profile | null;
  } | null;
};

// Get all mentorship chats where the user is a participant
export const getMentorshipChatsForUser = async (userId: string): Promise<MentorshipChat[]> => {
  // First, find chat IDs where the user is a participant
  const { data: participantRows, error: participantsError } = await supabase
    .from('mentorship_chat_participants')
    .select('chat_id')
    .eq('user_id', userId);

  if (participantsError) throw participantsError;

  const chatIds = (participantRows || []).map((row: any) => row.chat_id);
  if (chatIds.length === 0) return [];

  // Load chat + mentorship metadata
  const { data: chats, error: chatsError } = await supabase
    .from('mentorship_chats')
    .select(`
      id,
      mentorship_id,
      is_group,
      created_at,
      mentorship:mentorship_requests(
        id,
        purpose,
        status,
        mentee:profiles!mentorship_requests_mentee_id_fkey(
          id,
          full_name,
          avatar_url,
          role,
          department
        ),
        mentor:mentors(
          id,
          user:profiles!mentors_user_id_fkey(
            id,
            full_name,
            avatar_url,
            role,
            department
          )
        )
      )
    `)
    .in('id', chatIds)
    .order('created_at', { ascending: false });

  if (chatsError) throw chatsError;
  const baseChats = (chats || []) as MentorshipChat[];

  // Load latest message for each chat (single query, then group in memory)
  const { data: messages, error: messagesError } = await supabase
    .from('mentorship_messages')
    .select(`
      id,
      chat_id,
      content,
      created_at,
      sender:profiles!mentorship_messages_sender_id_fkey(
        id,
        full_name,
        avatar_url,
        role
      )
    `)
    .in('chat_id', chatIds)
    .order('created_at', { ascending: false });

  if (messagesError) throw messagesError;

  const latestByChat = new Map<string, any>();
  for (const msg of messages || []) {
    if (!latestByChat.has(msg.chat_id)) {
      latestByChat.set(msg.chat_id, msg);
    }
  }

  const visibleChats = baseChats.filter((chat) => chat?.mentorship?.purpose !== 'project');

  return visibleChats.map((chat) => ({
    ...chat,
    last_message: latestByChat.get(chat.id) || null,
  }));
};

// Get a single mentorship chat with mentorship metadata
export const getMentorshipChatById = async (chatId: string): Promise<MentorshipChat | null> => {
  const { data, error } = await supabase
    .from('mentorship_chats')
    .select(`
      id,
      mentorship_id,
      is_group,
      created_at,
      mentorship:mentorship_requests(
        id,
        purpose,
        status,
        mentee:profiles!mentorship_requests_mentee_id_fkey(
          id,
          full_name,
          avatar_url,
          role,
          department
        ),
        mentor:mentors(
          id,
          user:profiles!mentors_user_id_fkey(
            id,
            full_name,
            avatar_url,
            role,
            department
          )
        )
      )
    `)
    .eq('id', chatId)
    .single();

  if (error) throw error;
  if ((data as any)?.mentorship?.purpose === 'project') return null;
  return data as MentorshipChat;
};

export type MentorshipMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
};

// Load messages for a mentorship chat
export const getMentorshipMessages = async (
  chatId: string,
  limit = 50,
  offset = 0
): Promise<MentorshipMessage[]> => {
  const { data, error } = await supabase
    .from('mentorship_messages')
    .select(`
      *,
      sender:profiles!mentorship_messages_sender_id_fkey(
        id,
        full_name,
        avatar_url,
        role
      )
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  // Reverse so oldest is first
  return (data || []).reverse() as MentorshipMessage[];
};

// Send a message in a mentorship chat
export const sendMentorshipMessage = async (
  chatId: string,
  content: string
): Promise<MentorshipMessage> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user?.id) throw new Error('User must be authenticated to send messages');

  console.log('[SendMsg] sender:', user.id, '| chatId:', chatId);

  const { data, error } = await supabase
    .from('mentorship_messages')
    .insert({
      chat_id: chatId,
      sender_id: user.id,
      content,
    } as any)
    .select(`
      *,
      sender:profiles!mentorship_messages_sender_id_fkey(
        id,
        full_name,
        avatar_url,
        role
      )
    `)
    .single();

  if (error) {
    console.error('[SendMsg] INSERT error code:', error.code, '| message:', error.message);
    throw error;
  }
  console.log('[SendMsg] message inserted OK, id:', data?.id);
  return data as MentorshipMessage;
};


// Subscribe to realtime mentorship messages for a chat
export const subscribeToMentorshipMessages = (
  chatId: string,
  callback: (event: {
    type: 'insert';
    message: MentorshipMessage;
  }) => void
) => {
  console.log('[Realtime] subscribing to chat:', chatId);
  return supabase
    .channel(`mentorship_messages:${chatId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mentorship_messages',
        filter: `chat_id=eq.${chatId}`,
      },
      async (payload) => {
        console.log('[Realtime] INSERT event received, message id:', payload.new?.id);
        const { data, error } = await supabase
          .from('mentorship_messages')
          .select(`
            *,
            sender:profiles!mentorship_messages_sender_id_fkey(
              id,
              full_name,
              avatar_url,
              role
            )
          `)
          .eq('id', payload.new.id)
          .single();

        if (error) {
          console.error('[Realtime] re-fetch error:', JSON.stringify(error));
        }
        if (data) {
          console.log('[Realtime] delivering message to UI');
          callback({
            type: 'insert',
            message: data as MentorshipMessage,
          });
        } else {
          console.warn('[Realtime] re-fetch returned null — RLS blocking SELECT?');
        }
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] subscription status:', status);
    });
};


// Ensure a mentorship chat exists for a given accepted mentorship request.
// Creates it if missing, adds both users, returns the chat id.
// Safe to call multiple times (UNIQUE on mentorship_id + PK on participants).
export const ensureMentorshipChat = async (
  mentorshipRequestId: string,
  mentorUserId: string,
  menteeUserId: string
): Promise<string> => {
  // 1. Return existing chat if already created
  const { data: existing } = await supabase
    .from('mentorship_chats')
    .select('id')
    .eq('mentorship_id', mentorshipRequestId)
    .maybeSingle();

  let chatId: string;

  if (existing?.id) {
    chatId = existing.id;
  } else {
    // 2. Create the chat (UNIQUE constraint prevents duplicates)
    const { data: created, error: createError } = await supabase
      .from('mentorship_chats')
      .insert({ mentorship_id: mentorshipRequestId })
      .select('id')
      .single();

    if (createError) throw createError;
    chatId = created.id;
  }

  // 3. Ensure both users are participants (PK prevents duplicates)
  await supabase
    .from('mentorship_chat_participants')
    .upsert(
      [
        { chat_id: chatId, user_id: mentorUserId },
        { chat_id: chatId, user_id: menteeUserId },
      ],
      { onConflict: 'chat_id,user_id' }
    );

  return chatId;
};

// Get the mentorship chat ID for a project team (if a mentor has been accepted for the project).
// Returns the chat ID string, or null if no accepted mentorship + chat exists for this project.
export const getProjectMentorshipChat = async (
  projectTeamId: string
): Promise<string | null> => {
  // Find accepted mentorship requests linked to this project
  const { data: requests, error: reqError } = await supabase
    .from('mentorship_requests')
    .select('id')
    .eq('project_id', projectTeamId)
    .eq('status', 'accepted');

  if (reqError) throw reqError;
  if (!requests || requests.length === 0) return null;

  const requestId = requests[0].id;

  // Get the mentorship chat for that request
  const { data: chat, error: chatError } = await supabase
    .from('mentorship_chats')
    .select('id')
    .eq('mentorship_id', requestId)
    .maybeSingle();

  if (chatError) throw chatError;
  return chat?.id ?? null;
};

// ========== MESSAGE REACTIONS ==========

export type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
};

/**
 * Add a reaction to a mentorship message.
 */
export const addMentorshipMessageReaction = async (
  messageId: string,
  emoji: string
): Promise<void> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user?.id) throw new Error('User must be authenticated to add reactions');

  const { error } = await supabase
    .from('mentorship_message_reactions')
    .insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    } as any);

  if (error && error.code !== '23505') throw error;
};

/**
 * Remove a reaction from a mentorship message.
 */
export const removeMentorshipMessageReaction = async (
  messageId: string,
  emoji: string
): Promise<void> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user?.id) throw new Error('User must be authenticated to remove reactions');

  const { error } = await supabase
    .from('mentorship_message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji);

  if (error) throw error;
};

/**
 * Get all reactions for mentorship message IDs.
 */
export const getMentorshipMessageReactions = async (
  messageIds: string[]
): Promise<Map<string, MessageReaction[]>> => {
  if (messageIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('mentorship_message_reactions')
    .select(`
      *,
      user:profiles!mentorship_message_reactions_user_id_fkey(
        id,
        full_name,
        avatar_url
      )
    `)
    .in('message_id', messageIds);

  if (error) throw error;

  const reactionsMap = new Map<string, MessageReaction[]>();
  for (const reaction of data || []) {
    const msgId = reaction.message_id;
    if (!reactionsMap.has(msgId)) {
      reactionsMap.set(msgId, []);
    }
    reactionsMap.get(msgId)!.push(reaction as MessageReaction);
  }

  return reactionsMap;
};
