// @ts-nocheck
import { Tables } from '../types/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import {
  Conversation,
  Message,
  Connection,
  ConversationParticipant,
  MessageType,
  UserStatus,
  ConversationParticipantRole,
  GroupAnnouncement,
  ScheduledMessage,
  ContentFilter,
  UserBlock,
  GroupActivityLog,
  ChatAnalytics,
  UserEngagementMetrics,
  UserVerification,
  ConnectionSuggestion,
} from "../types/database";
import { moderateText } from "./ai";
import { isAdminRole } from '../utils/roles';

// ===== CONNECTIONS (Friend Requests) =====

// Send connection request
export const sendConnectionRequest = async (
  userId: string,
  targetUserId: string
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("connections")
    .insert({
      requester_id: userId,
      recipient_id: targetUserId,
      status: "pending",
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as Connection;
};

// Accept connection request
export const acceptConnection = async (connectionId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("connections")
    .update({ status: "accepted" } as any)
    .eq("id", connectionId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Reject connection request
export const rejectConnection = async (connectionId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("connections")
    .update({ status: "rejected" } as any)
    .eq("id", connectionId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Get user connections
export const getConnections = async (
  userId: string,
  status: "pending" | "accepted" | "rejected" = "accepted"
) => {
  const { data, error } = await supabase
    .from("connections")
    .select(`
  *,
  requester: profiles!connections_requester_id_fkey(*),
    recipient: profiles!connections_recipient_id_fkey(*)
    `)
    .or(`requester_id.eq.${userId}, recipient_id.eq.${userId} `)
    .eq("status", status);

  if (error) throw error;
  return data as Connection[];
};

// Get pending connection requests (received)
export const getPendingRequests = async (userId: string) => {
  const { data, error } = await supabase
    .from("connections")
    .select(`
  *,
  requester: profiles!connections_requester_id_fkey(*)
    `)
    .eq("recipient_id", userId)
    .eq("status", "pending");

  if (error) throw error;
  return data;
};

// ===== CONVERSATIONS =====

// Get user conversations
export const getConversations = async (userId: string) => {
  // Step 1: get conversation IDs the user participates in
  const { data: participantData, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("left_at", null);

  if (participantError) throw participantError;

  const conversationIds = (participantData || []).map((p: any) => p.conversation_id);
  if (conversationIds.length === 0) return [];

  // Step 2: fetch conversations ordered by most recent activity
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .in("id", conversationIds)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  // Step 3: enrich each conversation — participants, last message, unread count
  const conversationsWithData = await Promise.all(
    (data || []).map(async (conversation: any) => {
      const [participantsResult, messagesResult, unreadResult] = await Promise.all([
        // Get all current participants with profile info
        supabase
          .from("conversation_participants")
          .select("*, user:profiles!conversation_participants_user_id_fkey(*)")
          .eq("conversation_id", conversation.id)
          .is("left_at", null),

        // Get last message — use array + index instead of .single() to avoid crash when 0 messages
        supabase
          .from("messages")
          .select("*, sender:profiles!messages_sender_id_fkey(*)")
          .eq("conversation_id", conversation.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1),

        // Count messages from others as unread (simple, never crashes)
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversation.id)
          .eq("is_deleted", false)
          .neq("sender_id", userId)
          .not(
            "id",
            "in",
            `(SELECT message_id FROM message_reads WHERE user_id = '${userId}')`
          ),
      ]);

      return {
        ...conversation,
        participants: participantsResult.data?.map((p: any) => p.user) || [],
        last_message: messagesResult.data?.[0] || null,
        unread_count: unreadResult.count || 0,
      };
    })
  );

  // Enrich last_message with seen_by_others for messages sent by the current user
  const sentLastMessageIds = conversationsWithData
    .filter((c: any) => c.last_message && c.last_message.sender_id === userId)
    .map((c: any) => c.last_message.id);

  const seenSet = new Set<string>();
  if (sentLastMessageIds.length > 0) {
    const { data: seenData } = await supabase
      .from("message_reads")
      .select("message_id")
      .neq("user_id", userId)
      .in("message_id", sentLastMessageIds);
    (seenData || []).forEach((r: any) => seenSet.add(r.message_id));
  }

  for (const conv of conversationsWithData) {
    if ((conv as any).last_message && (conv as any).last_message.sender_id === userId) {
      (conv as any).last_message.seen_by_others = seenSet.has((conv as any).last_message.id);
    }
  }

  return conversationsWithData as Conversation[];
};


// Create 1-on-1 conversation
export const createDirectConversation = async (
  user1Id: string,
  user2Id: string
) => {
  // Always use authenticated user for RLS compliance
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const currentUserId = user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to create conversations');
  }

  if (user1Id && user1Id !== currentUserId) {
    console.warn('createDirectConversation called with mismatched user1Id; using authenticated user instead');
  }

  // Check if conversation already exists
  const { data: existingParticipants } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .in("user_id", [currentUserId, user2Id])
    .is("left_at", null);

  if (existingParticipants) {
    // Find conversations where both users are participants
    const conversationCounts = existingParticipants.reduce((acc: any, p: any) => {
      acc[p.conversation_id] = (acc[p.conversation_id] || 0) + 1;
      return acc;
    }, {});

    const existingConvId = Object.keys(conversationCounts).find(
      (id) => conversationCounts[id] === 2
    );

    if (existingConvId) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", existingConvId)
        .eq("is_group", false)
        .single();

      if (data) return data as Conversation;
    }
  }

  // Create new conversation
  // @ts-ignore - Supabase type inference issue
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      is_group: false,
      created_by: currentUserId,
    } as any)
    .select()
    .single();

  if (convError) {
    console.error('Error creating conversation:', convError);
    throw convError;
  }

  // Add both participants
  // @ts-ignore - Supabase type inference issue
  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert([
      { conversation_id: conversation!.id, user_id: currentUserId },
      { conversation_id: conversation!.id, user_id: user2Id },
    ] as any);

  if (participantsError) {
    console.error('Error adding participants:', participantsError);
    throw participantsError;
  }

  return conversation as Conversation;
};

// Create group conversation
export const createGroupConversation = async (
  creatorId: string,
  groupName: string,
  participantIds: string[]
) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const currentUserId = user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to create conversations');
  }

  if (creatorId && creatorId !== currentUserId) {
    console.warn('createGroupConversation called with mismatched creatorId; using authenticated user instead');
  }

  const uniqueParticipantIds = Array.from(
    new Set(participantIds.filter((id) => id && id !== currentUserId))
  );

  if (!groupName?.trim()) {
    throw new Error('Group name is required');
  }

  if (uniqueParticipantIds.length < 2) {
    throw new Error('Group must include at least 2 additional members');
  }

  // @ts-ignore - Supabase type inference issue
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      is_group: true,
      group_name: groupName.trim(),
      created_by: currentUserId,
    } as any)
    .select()
    .single();

  if (convError) throw convError;

  // Add all participants
  const participants = [currentUserId, ...uniqueParticipantIds].map((userId) => ({
    conversation_id: conversation!.id,
    user_id: userId,
    is_admin: userId === currentUserId,
  }));

  // @ts-ignore - Supabase type inference issue
  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert(participants as any);

  if (participantsError) throw participantsError;

  return conversation as Conversation;
};

export const getConversationDetails = async (conversationId: string) => {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (conversationError) throw conversationError;

  const { data: participants, error: participantsError } = await supabase
    .from("conversation_participants")
    .select(`
        *,
        user: profiles!conversation_participants_user_id_fkey(*)
          `)
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  if (participantsError) throw participantsError;

  return {
    ...conversation,
    participants: participants || [],
  };
};

const ensureGroupAdminPermission = async (conversationId: string, actorId: string) => {
  const details = await getConversationDetails(conversationId);

  if (!details?.is_group) {
    throw new Error('This action is only available for group chats');
  }

  const actorParticipant = (details.participants || []).find(
    (participant: any) => participant.user_id === actorId
  );

  const isMainAdmin = details.created_by === actorId;
  const isGroupAdmin = !!actorParticipant?.is_admin;

  if (!isMainAdmin && !isGroupAdmin) {
    throw new Error('Only group admins can perform this action');
  }

  return details;
};

export const updateGroupConversation = async (
  conversationId: string,
  actorId: string,
  updates: { group_name?: string; group_avatar?: string | null }
) => {
  const details = await ensureGroupAdminPermission(conversationId, actorId);

  const payload: Record<string, any> = {};

  if (typeof updates.group_name === 'string') {
    const nextName = updates.group_name.trim();
    if (!nextName) {
      throw new Error('Group name cannot be empty');
    }
    payload.group_name = nextName;
  }

  if (typeof updates.group_avatar !== 'undefined') {
    payload.group_avatar = updates.group_avatar || null;
  }

  if (Object.keys(payload).length === 0) {
    return details;
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(payload as any)
    .eq("id", conversationId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

export const removeParticipantFromGroup = async (
  conversationId: string,
  actorId: string,
  targetUserId: string
) => {
  const details = await ensureGroupAdminPermission(conversationId, actorId);

  if (targetUserId === details.created_by) {
    throw new Error('Main admin cannot be removed from group');
  }

  const { error } = await supabase
    .from("conversation_participants")
    .update({ left_at: new Date().toISOString(), is_admin: false } as any)
    .eq("conversation_id", conversationId)
    .eq("user_id", targetUserId)
    .is("left_at", null);

  if (error) throw error;
};

export const setGroupParticipantAdmin = async (
  conversationId: string,
  actorId: string,
  targetUserId: string,
  isAdmin: boolean
) => {
  const details = await ensureGroupAdminPermission(conversationId, actorId);

  if (targetUserId === details.created_by && !isAdmin) {
    throw new Error('Main admin permissions cannot be removed');
  }

  const { error } = await supabase
    .from("conversation_participants")
    .update({ is_admin: isAdmin } as any)
    .eq("conversation_id", conversationId)
    .eq("user_id", targetUserId)
    .is("left_at", null);

  if (error) throw error;
};

// ===== MESSAGES =====

// Get messages for a conversation
export const getMessages = async (
  conversationId: string,
  userId: string,
  limit = 50,
  offset = 0
) => {
  const { data, error } = await supabase
    .from("messages")
    .select(`*, sender: profiles!messages_sender_id_fkey(*)`)
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const msgs = data || [];

  // ONE batch query for read status instead of N+1 individual .single() calls
  const messageIds = msgs.map((m: any) => m.id);
  const readSet = new Set<string>();
  if (messageIds.length > 0) {
    const { data: readData } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", messageIds);
    (readData || []).forEach((r: any) => readSet.add(r.message_id));
  }

  // Check which of the current user's sent messages have been seen by others
  const sentMessageIds = msgs.filter((m: any) => m.sender_id === userId).map((m: any) => m.id);
  const seenByOthersSet = new Set<string>();
  if (sentMessageIds.length > 0) {
    const { data: seenData } = await supabase
      .from("message_reads")
      .select("message_id")
      .neq("user_id", userId)
      .in("message_id", sentMessageIds);
    (seenData || []).forEach((r: any) => seenByOthersSet.add(r.message_id));
  }

  return msgs.reverse().map((message: any) => ({
    ...message,
    is_read: readSet.has(message.id),
    seen_by_others: message.sender_id === userId ? seenByOthersSet.has(message.id) : undefined,
  })) as Message[];
};

// Send message
export const sendMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
  messageType: MessageType = "text",
  attachmentUrl?: string
) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const currentUserId = user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to send messages');
  }

  if (senderId && senderId !== currentUserId) {
    console.warn('sendMessage called with mismatched senderId; using authenticated user instead');
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content,
      message_type: messageType,
      attachment_url: attachmentUrl,
    } as any)
    .select(`
            *,
            sender: profiles!messages_sender_id_fkey(*)
    `)
    .single();

  if (error) {
    console.error('Error sending message:', error);
    throw error;
  }

  // Update conversation timestamp
  // @ts-ignore - Supabase type inference issue
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() } as any)
    .eq("id", conversationId);

  return data as Message;
};

// Delete message
export const deleteMessage = async (messageId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase
    .from("messages")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      content: null,
    } as any)
    .eq("id", messageId);

  if (error) throw error;
};

// Mark message as read
export const markMessageAsRead = async (messageId: string, userId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase
    .from("message_reads")
    .upsert({
      message_id: messageId,
      user_id: userId,
    } as any);

  if (error && error.code !== "23505") throw error;
};

// Mark all messages in conversation as read
export const markConversationAsRead = async (
  conversationId: string,
  userId: string
) => {
  // Get all messages from others in this conversation
  const { data: messages } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .eq("is_deleted", false);

  if (!messages || messages.length === 0) return;

  const messageIds = messages.map((m: any) => m.id);

  // Check which ones are already read (to avoid duplicates — table has no unique constraint)
  const { data: alreadyRead } = await supabase
    .from("message_reads")
    .select("message_id")
    .eq("user_id", userId)
    .in("message_id", messageIds);

  const alreadyReadIds = new Set((alreadyRead || []).map((r: any) => r.message_id));
  const newReads = messageIds
    .filter((id: string) => !alreadyReadIds.has(id))
    .map((id: string) => ({ message_id: id, user_id: userId }));

  if (newReads.length === 0) return;

  // @ts-ignore
  const { error } = await supabase.from("message_reads").insert(newReads as any);
  if (error && error.code !== "23505") throw error;
};

export type ChatMessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  } | null;
};

// Get reactions grouped by message id for a list of message IDs
export const getMessageReactions = async (
  messageIds: string[]
): Promise<Map<string, ChatMessageReaction[]>> => {
  if (!messageIds.length) return new Map();

  const { data, error } = await supabase
    .from("message_reactions")
    .select(`
      *,
      user:profiles!message_reactions_user_id_fkey(id, full_name, avatar_url)
    `)
    .in("message_id", messageIds);

  if (error) throw error;

  const reactionsMap = new Map<string, ChatMessageReaction[]>();
  for (const reaction of data || []) {
    const messageId = (reaction as any).message_id;
    if (!reactionsMap.has(messageId)) {
      reactionsMap.set(messageId, []);
    }
    reactionsMap.get(messageId)?.push(reaction as ChatMessageReaction);
  }

  return reactionsMap;
};

export const addMessageReaction = async (messageId: string, emoji: string) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user?.id) throw new Error("User must be authenticated to react");

  const { error } = await supabase
    .from("message_reactions")
    .insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    } as any);

  if (error && error.code !== "23505") throw error;
};

export const removeMessageReaction = async (messageId: string, emoji: string) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user?.id) throw new Error("User must be authenticated to remove reaction");

  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji);

  if (error) throw error;
};


// ===== TYPING INDICATORS =====

// Set typing indicator
export const setTyping = async (conversationId: string, userId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase.from("typing_indicators").upsert({
    conversation_id: conversationId,
    user_id: userId,
    started_at: new Date().toISOString(),
  } as any);

  if (error) console.error("Typing indicator error:", error);
};

// Remove typing indicator
export const removeTyping = async (conversationId: string, userId: string) => {
  const { error } = await supabase
    .from("typing_indicators")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  if (error) console.error("Remove typing error:", error);
};

// Subscribe to typing indicators
export const subscribeToTyping = (
  conversationId: string,
  callback: (typingUsers: string[]) => void
) => {
  return supabase
    .channel(`typing:${conversationId} `)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "typing_indicators",
        filter: `conversation_id = eq.${conversationId} `,
      },
      async () => {
        // Fetch current typing users
        const { data } = await supabase
          .from("typing_indicators")
          .select("user_id")
          .eq("conversation_id", conversationId);

        callback(data?.map((d: any) => d.user_id) || []);
      }
    )
    .subscribe();
};

// Subscribe to new messages
export const subscribeToMessages = (
  conversationId: string,
  callback: (event: {
    type: "insert" | "update" | "delete";
    message?: Message;
    messageId?: string;
  }) => void
) => {
  return supabase
    .channel(`messages:${conversationId} `)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id = eq.${conversationId} `,
      },
      async (payload) => {
        // Fetch full message with sender info
        const { data } = await supabase
          .from("messages")
          .select(`
  *,
  sender: profiles!messages_sender_id_fkey(*)
          `)
          .eq("id", payload.new.id)
          .single();

        if (data) {
          callback({
            type: "insert",
            message: data as Message,
            messageId: payload.new.id,
          });
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id = eq.${conversationId} `,
      },
      async (payload) => {
        const updated = payload.new as any;

        if (updated?.is_deleted) {
          callback({
            type: "delete",
            messageId: updated.id,
          });
          return;
        }

        const { data } = await supabase
          .from("messages")
          .select(`
  *,
  sender: profiles!messages_sender_id_fkey(*)
          `)
          .eq("id", updated.id)
          .single();

        if (data) {
          callback({
            type: "update",
            message: data as Message,
            messageId: updated.id,
          });
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "messages",
        filter: `conversation_id = eq.${conversationId} `,
      },
      (payload) => {
        callback({
          type: "delete",
          messageId: (payload.old as any)?.id,
        });
      }
    )
    .subscribe();
};

// Upload chat attachment
export const uploadChatAttachment = async (
  userId: string,
  fileUri: string
) => {
  const fileExt = (fileUri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
  const fileName = `${Date.now()}.${fileExt} `;
  const filePath = `${userId}/${fileName}`;
  const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const byteCharacters = atob(base64);
  const uint8Array = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    uint8Array[i] = byteCharacters.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from('chat-attachments')
    .upload(filePath, uint8Array, { contentType, upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(filePath);

  return publicUrl;
};

const aiResponseLibrary = [
  {
    keywords: ['event', 'workshop', 'hackathon'],
    response:
      'You can register for campus events directly from the Events tab. Remember to RSVP before the deadline and bring any prework materials.'
  },
  {
    keywords: ['project', 'team', 'collaboration'],
    response:
      'Head to Projects to explore ongoing teams. You can filter by skills, join a recruiting team, and start a chat with the members.'
  },
  {
    keywords: ['mentor', 'guide', 'alumni'],
    response:
      'Mentorship is available through your profile. Complete your interests and skills so the AI can recommend the best mentor matching your goals.'
  },
  {
    keywords: ['exam', 'deadline', 'assignment'],
    response:
      'Check the Feed for academic announcements and pinned reminders. You can also set a personal reminder in Notifications for upcoming deadlines.'
  },
];

export const chatWithAI = async (userId: string, prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) return 'Share a question, and I can help you with campus info or study suggestions.';

  const isAllowed = await moderateText(trimmed);
  if (!isAllowed) {
    throw new Error('Your message was flagged for review. Try rephrasing without sensitive terms.');
  }

  const context = trimmed.toLowerCase();
  for (const entry of aiResponseLibrary) {
    if (entry.keywords.some((keyword) => context.includes(keyword))) {
      return entry.response;
    }
  }

  return `Thanks for asking! Here is a quick tip: review the Feed or Events tab for more context, and feel free to ask follow-up questions.`;
};

// ===== FACULTY SUPERVISION =====

// Add faculty supervisor to a conversation
export const addConversationSupervisor = async (
  conversationId: string,
  facultyId: string,
  conversationData?: any
) => {
  // Verify it's a group conversation and faculty is a member
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation || !conversation.is_group) {
    throw new Error('Can only supervise group conversations');
  }

  // Check if faculty is a member
  const { data: isMember } = await supabase
    .from("conversation_participants")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", facultyId)
    .is("left_at", null)
    .single();

  if (!isMember) {
    throw new Error('Faculty must be a member of the group to supervise');
  }

  // Update conversation with supervisor
  const { data, error } = await supabase
    .from("conversations")
    .update({
      supervisor_id: facultyId,
      supervision_started_at: new Date().toISOString()
    } as any)
    .eq("id", conversationId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Remove faculty supervisor from a conversation
export const removeConversationSupervisor = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("conversations")
    .update({
      supervisor_id: null,
      supervision_ended_at: new Date().toISOString()
    } as any)
    .eq("id", conversationId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Get supervisor for a conversation
export const getConversationSupervisor = async (conversationId: string) => {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("supervisor_id, supervision_started_at, supervision_ended_at")
    .eq("id", conversationId)
    .single();

  if (!conversation || !conversation.supervisor_id) return null;

  const { data: supervisor } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", conversation.supervisor_id)
    .single();

  return {
    supervisor,
    startedAt: conversation.supervision_started_at,
    endedAt: conversation.supervision_ended_at,
  };
};

// Check if faculty can supervise a conversation
export const canFacultySupervise = async (
  conversationId: string,
  facultyId: string,
  facultyRole: string
): Promise<boolean> => {
  if (facultyRole !== 'faculty' && !isAdminRole(facultyRole)) {
    return false;
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("is_group, created_by")
    .eq("id", conversationId)
    .single();

  if (!conversation) return false;

  // Admin can supervise any group conversation
  if (isAdminRole(facultyRole)) {
    return conversation.is_group;
  }

  // Faculty can only supervise group conversations they're members of
  if (!conversation.is_group) return false;

  const { data: isMember } = await supabase
    .from("conversation_participants")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", facultyId)
    .is("left_at", null)
    .single();

  return !!isMember;
};

// Get all conversations supervised by faculty
export const getFacultySupervisedConversations = async (facultyId: string) => {
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      *,
      supervisor:profiles!conversations_supervisor_id_fkey(*),
      participants:conversation_participants(
        *,
        user:profiles(*)
      )
    `)
    .eq("supervisor_id", facultyId)
    .eq("is_group", true);

  if (error) throw error;
  return data;
};

// Get supervision statistics for a conversation
export const getConversationSupervisionStats = async (conversationId: string) => {
  // Get total messages
  const { count: totalMessages } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false);

  // Get participant count
  const { count: participantCount } = await supabase
    .from("conversation_participants")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .is("left_at", null);

  // Get message count by participant
  const { data: messagesByUser } = await supabase
    .from("messages")
    .select("sender_id")
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false);

  const userMessageCounts = (messagesByUser || []).reduce((acc: any, msg: any) => {
    acc[msg.sender_id] = (acc[msg.sender_id] || 0) + 1;
    return acc;
  }, {});

  return {
    totalMessages: totalMessages || 0,
    participantCount: participantCount || 0,
    messagesByUser: userMessageCounts,
    averageMessagesPerParticipant: (totalMessages || 0) / (participantCount || 1),
  };
};

// ===== NEW FEATURES =====

// ===== 1. USER STATUS (Online/Offline/Away) =====
export const updateUserStatus = async (userId: string, status: 'online' | 'away' | 'offline') => {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      status,
      status_updated_at: new Date().toISOString(),
    } as any)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getUserStatus = async (userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, status, status_updated_at")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
};

// ===== 2. USER VERIFICATION BADGES =====
export const addUserVerification = async (
  userId: string,
  verificationType: 'mentor' | 'admin' | 'faculty' | 'ambassador',
  verifiedByAdminId: string,
  expiresAt?: string
) => {
  const { data, error } = await supabase
    .from("user_verifications")
    .insert({
      user_id: userId,
      verified_by: verifiedByAdminId,
      verification_type: verificationType,
      is_active: true,
      verified_at: new Date().toISOString(),
      expires_at: expiresAt,
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Update profile is_verified flag
  await supabase
    .from("profiles")
    .update({ is_verified: true } as any)
    .eq("id", userId);

  return data;
};

export const removeUserVerification = async (userId: string, verificationType: string) => {
  const { error } = await supabase
    .from("user_verifications")
    .update({ is_active: false } as any)
    .eq("user_id", userId)
    .eq("verification_type", verificationType);

  if (error) throw error;

  // Check if user has other active verifications
  const { data } = await supabase
    .from("user_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!data || data.length === 0) {
    await supabase
      .from("profiles")
      .update({ is_verified: false } as any)
      .eq("id", userId);
  }
};

export const getUserVerifications = async (userId: string) => {
  const { data, error } = await supabase
    .from("user_verifications")
    .select(`*,verified_by_user:profiles!verified_by(*)`)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;
  return data;
};

// ===== 3. USER SUSPENSION =====
export const suspendUser = async (userId: string, reason: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_suspended: true } as any)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;

  // Create a ban record
  await supabase
    .from("user_bans")
    .insert({
      user_id: userId,
      banned_by: (await supabase.auth.getUser()).data.user?.id,
      reason,
      created_at: new Date().toISOString(),
    } as any);

  return data;
};

export const unsuspendUser = async (userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_suspended: false } as any)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ===== 4. BLOCK/REPORT USERS =====
export const blockUser = async (blockingUserId: string, blockedUserId: string, reason?: string) => {
  const { data, error } = await supabase
    .from("user_blocks")
    .insert({
      blocking_user_id: blockingUserId,
      blocked_user_id: blockedUserId,
      reason,
      created_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const unblockUser = async (blockingUserId: string, blockedUserId: string) => {
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocking_user_id", blockingUserId)
    .eq("blocked_user_id", blockedUserId);

  if (error) throw error;
};

export const getUserBlocks = async (userId: string) => {
  const { data, error } = await supabase
    .from("user_blocks")
    .select(`*,blocked_user:profiles!blocked_user_id(*)`)
    .eq("blocking_user_id", userId);

  if (error) throw error;
  return data;
};

export const isUserBlocked = async (blockingUserId: string, blockedUserId: string) => {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocking_user_id", blockingUserId)
    .eq("blocked_user_id", blockedUserId)
    .single();

  return !!data;
};

// ===== 5. GROUP ROLES (Admin/Moderator/Member/Viewer) =====
export const updateGroupParticipantRole = async (
  conversationId: string,
  actorId: string,
  targetUserId: string,
  role: 'admin' | 'moderator' | 'member' | 'viewer'
) => {
  await ensureGroupAdminPermission(conversationId, actorId);

  const { error } = await supabase
    .from("conversation_participants")
    .update({ role } as any)
    .eq("conversation_id", conversationId)
    .eq("user_id", targetUserId)
    .is("left_at", null);

  if (error) throw error;
};

export const getGroupParticipantRole = async (conversationId: string, userId: string) => {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("role, is_admin")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .single();

  if (error) throw error;
  return data;
};

// ===== 6. QUOTED/REPLY MESSAGES =====
export const sendReplyMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
  replyToMessageId: string
) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  const currentUserId = user?.id;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content,
      message_type: "text",
      reply_to_message_id: replyToMessageId,
    } as any)
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(*),
      reply_to_message:messages!reply_to_message_id(
        *,
        sender:profiles!messages_sender_id_fkey(*)
      )
    `)
    .single();

  if (error) throw error;

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() } as any)
    .eq("id", conversationId);

  return data;
};

// ===== 7. MESSAGE FORWARDING =====
export const forwardMessage = async (
  messageId: string,
  fromConversationId: string,
  toConversationId: string,
  senderId: string
) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  const currentUserId = user?.id;

  // Get original message
  const { data: originalMessage } = await supabase
    .from("messages")
    .select("content, message_type, attachment_url")
    .eq("id", messageId)
    .single();

  if (!originalMessage) throw new Error("Message not found");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: toConversationId,
      sender_id: currentUserId,
      content: originalMessage.content,
      message_type: originalMessage.message_type,
      attachment_url: originalMessage.attachment_url,
      forwarded_from_message_id: messageId,
    } as any)
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(*),
      forwarded_from_message:messages!forwarded_from_message_id(
        *,
        sender:profiles!messages_sender_id_fkey(*)
      )
    `)
    .single();

  if (error) throw error;

  // Update target conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() } as any)
    .eq("id", toConversationId);

  return data;
};

// ===== 8. MESSAGE SEARCH WITH FILTERS =====
export const searchMessages = async (
  conversationId: string,
  query: string,
  filters?: {
    senderId?: string;
    startDate?: string;
    endDate?: string;
    messageType?: string;
  }
) => {
  let q = supabase
    .from("messages")
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(*)
    `)
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false)
    .ilike("content", `%${query}%`);

  if (filters?.senderId) {
    q = q.eq("sender_id", filters.senderId);
  }

  if (filters?.messageType) {
    q = q.eq("message_type", filters.messageType);
  }

  if (filters?.startDate) {
    q = q.gte("created_at", filters.startDate);
  }

  if (filters?.endDate) {
    q = q.lte("created_at", filters.endDate);
  }

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

// ===== 9. PINNED MESSAGES & GROUP ANNOUNCEMENTS =====
export const pinMessage = async (
  messageId: string,
  conversationId: string,
  pinnedByUserId: string
) => {
  await ensureGroupAdminPermission(conversationId, pinnedByUserId);

  const { error } = await supabase
    .from("pinned_messages")
    .insert({
      message_id: messageId,
      conversation_id: conversationId,
      pinned_by: pinnedByUserId,
    });

  if (error) {
    console.error("Pin message error:", error);
    throw new Error(`Failed to pin message: ${error.message}`);
  }

  return true;
};

export const unpinMessage = async (messageId: string, conversationId: string) => {
  const { error } = await supabase
    .from("pinned_messages")
    .delete()
    .eq("message_id", messageId)
    .eq("conversation_id", conversationId);

  if (error) throw error;
};

export const getPinnedMessages = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("pinned_messages")
    .select("*, message:messages(id, content, sender_id, created_at)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createGroupAnnouncement = async (
  conversationId: string,
  createdByAdminId: string,
  title: string,
  content: string
) => {
  await ensureGroupAdminPermission(conversationId, createdByAdminId);

  const { data, error } = await supabase
    .from("group_announcements")
    .insert({
      conversation_id: conversationId,
      created_by: createdByAdminId,
      title,
      content,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .select(`*,creator:profiles!created_by(*)`)
    .single();

  if (error) throw error;
  return data;
};

export const getGroupAnnouncements = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("group_announcements")
    .select(`*,creator:profiles!created_by(*)`)
    .eq("conversation_id", conversationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

export const deactivateGroupAnnouncement = async (announcementId: string) => {
  const { data, error } = await supabase
    .from("group_announcements")
    .update({ is_active: false } as any)
    .eq("id", announcementId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ===== 10. GROUP ACTIVITY LOGS =====
export const logGroupActivity = async (
  conversationId: string,
  actorId: string,
  action: string,
  targetUserId?: string,
  details?: string
) => {
  const { data, error } = await supabase
    .from("group_activity_logs")
    .insert({
      conversation_id: conversationId,
      actor_id: actorId,
      action,
      target_user_id: targetUserId,
      details,
      created_at: new Date().toISOString(),
    } as any)
    .select(`
      *,
      actor:profiles!actor_id(*),
      target_user:profiles!target_user_id(*)
    `)
    .single();

  if (error) throw error;
  return data;
};

export const getGroupActivityLogs = async (conversationId: string, adminOnly = false) => {
  let q = supabase
    .from("group_activity_logs")
    .select(`
      *,
      actor:profiles!actor_id(*),
      target_user:profiles!target_user_id(*)
    `)
    .eq("conversation_id", conversationId);

  if (adminOnly) {
    q = q.in("action", ["promoted", "demoted", "removed", "admin_changed"]);
  }

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

// ===== 11. SCHEDULED MESSAGES =====
export const scheduleMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
  scheduledFor: string,
  messageType: 'text' | 'image' | 'file' = 'text'
) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  const currentUserId = user?.id;

  const scheduledDate = new Date(scheduledFor);
  if (scheduledDate <= new Date()) {
    throw new Error("Scheduled time must be in the future");
  }

  const { data, error } = await supabase
    .from("scheduled_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content,
      message_type: messageType,
      scheduled_for: scheduledDate.toISOString(),
      status: "pending",
      created_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getScheduledMessages = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select(`*,sender:profiles!sender_id(*)`)
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true });

  if (error) throw error;
  return data;
};

export const cancelScheduledMessage = async (messageId: string) => {
  const { error } = await supabase
    .from("scheduled_messages")
    .delete()
    .eq("id", messageId)
    .eq("status", "pending");

  if (error) throw error;
};

// ===== 12. CONTENT FILTERS (Spam Detection) =====
export const addContentFilter = async (keyword: string, action: 'block' | 'warn' | 'flag_for_review') => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  const { data, error } = await supabase
    .from("content_filters")
    .insert({
      keyword: keyword.toLowerCase(),
      action,
      is_active: true,
      created_by: user?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const checkContentFilters = async (text: string) => {
  const { data: filters, error } = await supabase
    .from("content_filters")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;

  const lowerText = text.toLowerCase();
  const flaggedFilters = filters?.filter((f: any) => lowerText.includes(f.keyword)) || [];

  return {
    isFlagged: flaggedFilters.length > 0,
    flaggedKeywords: flaggedFilters.map((f: any) => ({ keyword: f.keyword, action: f.action })),
  };
};

export const getContentFilters = async () => {
  const { data, error } = await supabase
    .from("content_filters")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;
  return data;
};

// ===== 13. MUTUAL CONNECTIONS PREVIEW =====
export const getMutualConnections = async (userId: string, targetUserId: string) => {
  // Get user1's connections
  const { data: user1Connections } = await supabase
    .from("connections")
    .select("requester_id, recipient_id")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .eq("status", "accepted");

  // Get user2's connections
  const { data: user2Connections } = await supabase
    .from("connections")
    .select("requester_id, recipient_id")
    .or(`requester_id.eq.${targetUserId},recipient_id.eq.${targetUserId}`)
    .eq("status", "accepted");

  // Find mutual connections
  const user1Ids = new Set(
    (user1Connections || []).map((c: any) =>
      c.requester_id === userId ? c.recipient_id : c.requester_id
    )
  );

  const mutualIds = (user2Connections || [])
    .map((c: any) => c.requester_id === targetUserId ? c.recipient_id : c.requester_id)
    .filter((id: string) => user1Ids.has(id));

  // Get mutual user profiles
  const { data: mutualUsers } = await supabase
    .from("profiles")
    .select("*")
    .in("id", mutualIds);

  return {
    mutual_count: mutualIds.length,
    mutual_users: mutualUsers,
  };
};

// ===== 14. CONNECTION SUGGESTIONS & DISCOVERY =====
export const getConnectionSuggestions = async (userId: string) => {
  const { data, error } = await supabase
    .from("connection_suggestions")
    .select(`*,suggested_user:profiles!suggested_user_id(*)`)
    .eq("user_id", userId)
    .eq("dismissed", false)
    .order("match_score", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data;
};

export const dismissConnectionSuggestion = async (suggestionId: string) => {
  const { error } = await supabase
    .from("connection_suggestions")
    .update({ dismissed: true } as any)
    .eq("id", suggestionId);

  if (error) throw error;
};

// ===== 15. CHAT ANALYTICS =====
export const calculateChatAnalytics = async (conversationId: string) => {
  const { count: totalMessages } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false);

  const { data: messagesByUser } = await supabase
    .from("messages")
    .select("sender_id")
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false);

  const senderCounts = (messagesByUser || []).reduce((acc: any, msg: any) => {
    acc[msg.sender_id] = (acc[msg.sender_id] || 0) + 1;
    return acc;
  }, {});

  const mostActiveSenderId = Object.entries(senderCounts).sort(
    (a: any, b: any) => b[1] - a[1]
  )[0]?.[0];

  const { data, error } = await supabase
    .from("chat_analytics")
    .upsert({
      conversation_id: conversationId,
      total_messages: totalMessages || 0,
      unique_senders: Object.keys(senderCounts).length,
      most_active_member_id: mostActiveSenderId,
      last_calculated_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getChatAnalytics = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("chat_analytics")
    .select(`*,most_active_member:profiles!most_active_member_id(*)`)
    .eq("conversation_id", conversationId)
    .single();

  if (error) throw error;
  return data;
};

// ===== 16. USER ENGAGEMENT METRICS (Admin Dashboard) =====
export const calculateUserEngagementMetrics = async (userId: string) => {
  const { count: messagesSent } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .eq("is_deleted", false);

  const { count: messagesReceived } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .neq("sender_id", userId)
    .eq("is_deleted", false);

  const { data: conversations } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("left_at", null);

  const { count: groupCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact" })
    .in("id", conversations?.map((c: any) => c.conversation_id) || [])
    .eq("is_group", true);

  const engagementScore = (messagesSent || 0) * 0.5 + (messagesReceived || 0) * 0.3 + (groupCount || 0) * 0.2;

  const { data, error } = await supabase
    .from("user_engagement_metrics")
    .upsert({
      user_id: userId,
      messages_sent: messagesSent || 0,
      conversations_participated: conversations?.length || 0,
      messages_received: messagesReceived || 0,
      active_groups: groupCount || 0,
      engagement_score: Math.round(engagementScore),
      last_activity: new Date().toISOString(),
      calculated_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getTopEngagedUsers = async (limit = 10) => {
  const { data, error } = await supabase
    .from("user_engagement_metrics")
    .select(`*,user:profiles!user_id(*)`)
    .order("engagement_score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
};

export const getUserEngagementMetrics = async (userId: string) => {
  const { data, error } = await supabase
    .from("user_engagement_metrics")
    .select(`*,user:profiles!user_id(*)`)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
};

// ===== 17. UNREAD MESSAGE BADGES =====
export const getUnreadConversations = async (userId: string) => {
  const { data: conversations } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("left_at", null);

  const convIds = conversations?.map((c: any) => c.conversation_id) || [];

  if (convIds.length === 0) return [];

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", convIds)
    .neq("sender_id", userId)
    .eq("is_deleted", false)
    .not(
      "id",
      "in",
      `(SELECT message_id FROM message_reads WHERE user_id = '${userId}')`
    );

  if (messagesError) throw messagesError;

  const unreadByConversation = (messages || []).reduce((acc: Record<string, number>, message: any) => {
    const key = message.conversation_id;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const unreadConversationIds = Object.keys(unreadByConversation);

  if (unreadConversationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .in("id", unreadConversationIds);

  if (error) throw error;

  return (data || []).map((conversation: any) => ({
    ...conversation,
    unread_count: unreadByConversation[conversation.id] || 0,
  }));
};

export const getUnreadCount = async (userId: string) => {
  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id", { count: "exact" })
    .neq("sender_id", userId)
    .eq("is_deleted", false)
    .not(
      "id",
      "in",
      `(SELECT message_id FROM message_reads WHERE user_id = '${userId}')`
    );

  if (error) throw error;
  return data?.length || 0;
};

