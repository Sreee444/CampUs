// @ts-nocheck
import { supabase } from "./supabase";
import {
  Conversation,
  Message,
  Connection,
  ConversationParticipant,
  MessageType,
} from "../types/database";
import { moderateText } from "./ai";

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
      requester:profiles!connections_requester_id_fkey(*),
      recipient:profiles!connections_recipient_id_fkey(*)
    `)
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
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
      requester:profiles!connections_requester_id_fkey(*)
    `)
    .eq("recipient_id", userId)
    .eq("status", "pending");

  if (error) throw error;
  return data;
};

// ===== CONVERSATIONS =====

// Get user conversations
export const getConversations = async (userId: string) => {
  // First get all conversation IDs where user is a participant
  const { data: participantData, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("left_at", null);

  if (participantError) throw participantError;

  const conversationIds = participantData.map((p: any) => p.conversation_id);

  if (conversationIds.length === 0) return [];

  // Get full conversation details
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      *
    `)
    .in("id", conversationIds)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  // Get participants and last message for each conversation
  const conversationsWithData = await Promise.all(
    (data || []).map(async (conversation: any) => {
      const [participants, lastMessage, unreadCount] = await Promise.all([
        supabase
          .from("conversation_participants")
          .select(`
            *,
            user:profiles!conversation_participants_user_id_fkey(*)
          `)
          .eq("conversation_id", conversation.id)
          .is("left_at", null),
        supabase
          .from("messages")
          .select(`
            *,
            sender:profiles!messages_sender_id_fkey(*)
          `)
          .eq("conversation_id", conversation.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversation.id)
          .eq("is_deleted", false)
          .not("sender_id", "eq", userId)
          .not(
            "id",
            "in",
            `(SELECT message_id FROM message_reads WHERE user_id = '${userId}')`
          ),
      ]);

      return {
        ...conversation,
        participants: participants.data?.map((p: any) => p.user) || [],
        last_message: lastMessage.data || null,
        unread_count: unreadCount.count || 0,
      };
    })
  );

  return conversationsWithData as Conversation[];
};

// Create 1-on-1 conversation
export const createDirectConversation = async (
  user1Id: string,
  user2Id: string
) => {
  // Ensure user1Id is set to current user for RLS compliance
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = user1Id || sessionData?.session?.user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to create conversations');
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
  // @ts-ignore - Supabase type inference issue
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      is_group: true,
      group_name: groupName,
      created_by: creatorId,
    } as any)
    .select()
    .single();

  if (convError) throw convError;

  // Add all participants
  const participants = [creatorId, ...participantIds].map((userId, index) => ({
    conversation_id: conversation!.id,
    user_id: userId,
    is_admin: userId === creatorId,
  }));

  // @ts-ignore - Supabase type inference issue
  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert(participants as any);

  if (participantsError) throw participantsError;

  return conversation as Conversation;
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
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(*)
    `)
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  // Check read status for each message
  const messagesWithReadStatus = await Promise.all(
    (data || []).map(async (message: any) => {
      const { data: readData } = await supabase
        .from("message_reads")
        .select("id")
        .eq("message_id", message.id)
        .eq("user_id", userId)
        .single();

      return {
        ...message,
        is_read: !!readData,
      };
    })
  );

  return messagesWithReadStatus.reverse() as Message[];
};

// Send message
export const sendMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
  messageType: MessageType = "text",
  attachmentUrl?: string
) => {
  // Ensure sender_id is set to current user for RLS compliance
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = senderId || sessionData?.session?.user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to send messages');
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
      sender:profiles!messages_sender_id_fkey(*)
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
  // Get all unread messages
  const { data: messages } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .eq("is_deleted", false);

  if (!messages || messages.length === 0) return;

  const reads = messages.map((msg: any) => ({
    message_id: msg.id,
    user_id: userId,
  }));

  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase.from("message_reads").upsert(reads as any);

  if (error && error.code !== "23505") throw error;
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
    .channel(`typing:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "typing_indicators",
        filter: `conversation_id=eq.${conversationId}`,
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
  callback: (message: Message) => void
) => {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      async (payload) => {
        // Fetch full message with sender info
        const { data } = await supabase
          .from("messages")
          .select(`
            *,
            sender:profiles!messages_sender_id_fkey(*)
          `)
          .eq("id", payload.new.id)
          .single();

        if (data) callback(data as Message);
      }
    )
    .subscribe();
};

// Upload chat attachment
export const uploadChatAttachment = async (
  userId: string,
  fileUri: string
) => {
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const fileExt = fileUri.split(".").pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("chat-attachments")
    .upload(filePath, uint8Array, {
      contentType: `image/${fileExt}`,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);

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
  if (facultyRole !== 'faculty' && facultyRole !== 'admin') {
    return false;
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("is_group, created_by")
    .eq("id", conversationId)
    .single();

  if (!conversation) return false;

  // Admin can supervise any group conversation
  if (facultyRole === 'admin') {
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

