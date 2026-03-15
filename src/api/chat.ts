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
  ChatPreference,
  GroupJoinRequest,
} from "../types/database";
import { moderateText } from "./ai";
import { isAdminRole } from '../utils/roles';
import { encryptMessage, decryptMessage } from "../../utils/encryption";
import { ENV } from '../config/env';

const decryptContentField = (value: any) => {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  if (!value) return value;
  return decryptMessage(value);
};

const decryptMessageObject = (msg: any): any => {
  if (!msg) return msg;
  const next = { ...msg };
  if ("content" in next) {
    next.content = decryptContentField((next as any).content);
  }
  if ((next as any).reply_to_message) {
    (next as any).reply_to_message = decryptMessageObject((next as any).reply_to_message);
  }
  if ((next as any).forwarded_from_message) {
    (next as any).forwarded_from_message = decryptMessageObject((next as any).forwarded_from_message);
  }
  return next;
};

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
        last_message: messagesResult.data?.[0]
          ? decryptMessageObject(messagesResult.data?.[0])
          : null,
        unread_count: unreadResult.count || 0,
      };
    })
  );

  // Recompute unread_count with a robust batch strategy so badges reflect exact counts.
  // This avoids edge cases where SQL subquery counting returns stale/incorrect values.
  const unreadCountByConversation = new Map<string, number>();
  const { data: incomingMessages } = await supabase
    .from("messages")
    .select("id,conversation_id")
    .in("conversation_id", conversationIds)
    .eq("is_deleted", false)
    .neq("sender_id", userId);

  const incomingRows = incomingMessages || [];
  if (incomingRows.length > 0) {
    const incomingMessageIds = incomingRows.map((m: any) => m.id);
    const { data: readRows } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", incomingMessageIds);

    const readSet = new Set((readRows || []).map((r: any) => r.message_id));
    for (const msg of incomingRows) {
      if (readSet.has(msg.id)) continue;
      unreadCountByConversation.set(
        msg.conversation_id,
        (unreadCountByConversation.get(msg.conversation_id) || 0) + 1
      );
    }
  }

  for (const conv of conversationsWithData) {
    (conv as any).unread_count = unreadCountByConversation.get((conv as any).id) || 0;
  }

  // Enrich last_message with seen_by_others for messages sent by the current user
  const sentLastMessageIds = conversationsWithData
    .filter((c: any) => c.last_message && c.last_message.sender_id === userId)
    .map((c: any) => c.last_message.id);

  const seenByOthersCountMap = new Map<string, number>();
  if (sentLastMessageIds.length > 0) {
    const { data: seenData } = await supabase
      .from("message_reads")
      .select("message_id,user_id")
      .neq("user_id", userId)
      .in("message_id", sentLastMessageIds);
    (seenData || []).forEach((r: any) => {
      const currentCount = seenByOthersCountMap.get(r.message_id) || 0;
      seenByOthersCountMap.set(r.message_id, currentCount + 1);
    });
  }

  for (const conv of conversationsWithData) {
    if ((conv as any).last_message && (conv as any).last_message.sender_id === userId) {
      const seenByCount = seenByOthersCountMap.get((conv as any).last_message.id) || 0;
      (conv as any).last_message.seen_by_count = seenByCount;
      (conv as any).last_message.seen_by_others = seenByCount > 0;
    }
  }

  // Enrich last_message with is_read_by_me for messages from others.
  const incomingLastMessageIds = conversationsWithData
    .filter((c: any) => c.last_message && c.last_message.sender_id !== userId)
    .map((c: any) => c.last_message.id);

  const readLastMessageSet = new Set<string>();
  if (incomingLastMessageIds.length > 0) {
    const { data: readLastMessageData } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", incomingLastMessageIds);

    (readLastMessageData || []).forEach((r: any) => readLastMessageSet.add(r.message_id));
  }

  for (const conv of conversationsWithData) {
    if ((conv as any).last_message && (conv as any).last_message.sender_id !== userId) {
      (conv as any).last_message.is_read_by_me = readLastMessageSet.has((conv as any).last_message.id);
    }
  }

  return conversationsWithData as Conversation[];
};


// Create 1-on-1 conversation
const findDirectConversationBetweenUsers = async (
  userAId: string,
  userBId: string,
  includeInactiveParticipants = false
) => {
  const { data: participantRows, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id, left_at")
    .in("user_id", [userAId, userBId]);

  if (participantError) throw participantError;

  const rows = (participantRows || []) as Array<{
    conversation_id: string;
    user_id: string;
    left_at: string | null;
  }>;

  const grouped = new Map<
    string,
    { userIds: Set<string>; hasActiveA: boolean; hasActiveB: boolean }
  >();

  for (const row of rows) {
    const existing = grouped.get(row.conversation_id) || {
      userIds: new Set<string>(),
      hasActiveA: false,
      hasActiveB: false,
    };

    existing.userIds.add(row.user_id);
    if (row.user_id === userAId && row.left_at === null) existing.hasActiveA = true;
    if (row.user_id === userBId && row.left_at === null) existing.hasActiveB = true;
    grouped.set(row.conversation_id, existing);
  }

  const candidateConversationIds = Array.from(grouped.entries())
    .filter(([_, value]) => value.userIds.has(userAId) && value.userIds.has(userBId))
    .filter(([_, value]) => includeInactiveParticipants || (value.hasActiveA && value.hasActiveB))
    .map(([conversationId]) => conversationId);

  if (!candidateConversationIds.length) {
    return null;
  }

  const { data: directConversations, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .in("id", candidateConversationIds)
    .eq("is_group", false)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (conversationError) throw conversationError;
  return (directConversations || [])[0] || null;
};

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

  const existingActiveConversation = await findDirectConversationBetweenUsers(
    currentUserId,
    user2Id,
    false
  );

  if (existingActiveConversation) {
    return existingActiveConversation as Conversation;
  }

  const existingInactiveConversation = await findDirectConversationBetweenUsers(
    currentUserId,
    user2Id,
    true
  );

  if (existingInactiveConversation) {
    // Reactivate participants if a historical direct chat exists.
    const { error: restoreParticipantsError } = await supabase
      .from("conversation_participants")
      .upsert(
        [
          { conversation_id: existingInactiveConversation.id, user_id: currentUserId, left_at: null },
          { conversation_id: existingInactiveConversation.id, user_id: user2Id, left_at: null },
        ] as any,
        { onConflict: 'conversation_id,user_id' }
      );

    if (restoreParticipantsError) {
      throw restoreParticipantsError;
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() } as any)
      .eq("id", existingInactiveConversation.id);

    return existingInactiveConversation as Conversation;
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

// Delete a conversation for a user (soft delete by leaving conversation)
export const deleteConversationForUser = async (
  conversationId: string,
  userId: string
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
    throw new Error('User must be authenticated to delete conversations');
  }

  if (userId && userId !== currentUserId) {
    console.warn('deleteConversationForUser called with mismatched userId; using authenticated user instead');
  }

  const { error } = await supabase
    .from("conversation_participants")
    .update({ left_at: new Date().toISOString(), is_admin: false } as any)
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUserId)
    .is("left_at", null);

  if (error) {
    throw error;
  }

  // Best-effort cleanup for typing indicator rows.
  await supabase
    .from("typing_indicators")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUserId);

  return { success: true };
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

  const basePayload = {
    is_group: true,
    group_name: groupName.trim(),
    created_by: currentUserId,
  } as any;

  const runCreate = async (payload: Record<string, any>) => {
    return await supabase
      .from("conversations")
      .insert(payload as any)
      .select()
      .single();
  };

  let { data: conversation, error: convError } = await runCreate({
    ...basePayload,
    group_visibility: 'private',
  });

  // Backward compatibility for deployments where group_visibility migration is not applied yet.
  if (convError) {
    const message = `${(convError as any)?.message || ''}`.toLowerCase();
    const isMissingVisibilityColumn =
      message.includes('group_visibility') && (message.includes('column') || message.includes('could not find'));

    if (isMissingVisibilityColumn) {
      const fallbackResult = await runCreate(basePayload);
      conversation = fallbackResult.data;
      convError = fallbackResult.error;
    }
  }

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
  updates: {
    group_name?: string;
    group_avatar?: string | null;
    group_bio?: string | null;
    group_visibility?: 'private' | 'public';
  }
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

  if (typeof updates.group_bio !== 'undefined') {
    const nextBio = (updates.group_bio || '').trim();
    payload.group_bio = nextBio || null;
  }

  if (typeof updates.group_visibility !== 'undefined') {
    if (details.created_by !== actorId) {
      throw new Error('Only the main admin can change group visibility');
    }

    if (!['private', 'public'].includes(updates.group_visibility)) {
      throw new Error('Invalid group visibility value');
    }

    payload.group_visibility = updates.group_visibility;
  }

  if (Object.keys(payload).length === 0) {
    return details;
  }

  const runUpdate = async (updatePayload: Record<string, any>) => {
    return await supabase
      .from("conversations")
      .update(updatePayload as any)
      .eq("id", conversationId)
      .select("*")
      .single();
  };

  let { data, error } = await runUpdate(payload);
  let groupBioUnsupported = false;
  let groupVisibilityUnsupported = false;

  // Backward compatibility for deployments where group_bio migration is not applied yet.
  if (error && typeof payload.group_bio !== 'undefined') {
    const message = `${(error as any)?.message || ''}`.toLowerCase();
    const isMissingGroupBioColumn =
      message.includes('group_bio') && (message.includes('column') || message.includes('could not find'));

    if (isMissingGroupBioColumn) {
      groupBioUnsupported = true;
      const fallbackPayload = { ...payload };
      delete fallbackPayload.group_bio;

      if (Object.keys(fallbackPayload).length === 0) {
        throw new Error(
          'Group bio is not supported yet in this database. Please run the migration to add conversations.group_bio.'
        );
      }

      const fallbackResult = await runUpdate(fallbackPayload);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }
  }

  // Backward compatibility for deployments where group_visibility migration is not applied yet.
  if (error && typeof payload.group_visibility !== 'undefined') {
    const message = `${(error as any)?.message || ''}`.toLowerCase();
    const isMissingVisibilityColumn =
      message.includes('group_visibility') && (message.includes('column') || message.includes('could not find'));

    if (isMissingVisibilityColumn) {
      groupVisibilityUnsupported = true;
      const fallbackPayload = { ...payload };
      delete fallbackPayload.group_visibility;

      if (Object.keys(fallbackPayload).length === 0) {
        throw new Error(
          'Group visibility is not supported yet in this database. Please run the migration to add conversations.group_visibility.'
        );
      }

      const fallbackResult = await runUpdate(fallbackPayload);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }
  }

  if (error) throw error;
  if (groupBioUnsupported || groupVisibilityUnsupported) {
    return {
      ...(data || details),
      __groupBioUnsupported: groupBioUnsupported,
      __groupVisibilityUnsupported: groupVisibilityUnsupported,
    } as any;
  }

  return data;
};

const GROUP_JOIN_REQUESTS_TABLE = 'group_join_requests';

const throwGroupJoinRequestTableMissing = (error: any) => {
  const message = `${error?.message || ''}`.toLowerCase();
  const isMissingTable = message.includes('group_join_requests') && (message.includes('relation') || message.includes('does not exist'));

  if (isMissingTable) {
    throw new Error('Group join requests are not enabled in this database yet. Please create the group_join_requests table first.');
  }

  throw error;
};

export const searchPublicGroups = async (userId: string, rawQuery: string) => {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return [];
  }

  const { data: groups, error: groupsError } = await supabase
    .from('conversations')
    .select('id, group_name, group_avatar, group_bio, group_visibility, created_by, updated_at')
    .eq('is_group', true)
    .eq('group_visibility', 'public')
    .ilike('group_name', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(40);

  if (groupsError) {
    const message = `${groupsError?.message || ''}`.toLowerCase();
    const isMissingVisibilityColumn =
      message.includes('group_visibility') && (message.includes('column') || message.includes('could not find'));

    if (isMissingVisibilityColumn) {
      throw new Error('Public group search requires conversations.group_visibility. Please run the DB migration first.');
    }

    throw groupsError;
  }

  const groupRows = groups || [];
  if (!groupRows.length) {
    return [];
  }

  const groupIds = groupRows.map((group: any) => group.id);

  const [membershipResult, requestResult] = await Promise.all([
    supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId)
      .is('left_at', null)
      .in('conversation_id', groupIds),
    supabase
      .from(GROUP_JOIN_REQUESTS_TABLE)
      .select('conversation_id, status')
      .eq('requester_id', userId)
      .in('conversation_id', groupIds),
  ]);

  if (membershipResult.error) throw membershipResult.error;
  if (requestResult.error) throwGroupJoinRequestTableMissing(requestResult.error);

  const membershipSet = new Set<string>((membershipResult.data || []).map((row: any) => row.conversation_id));

  const latestRequestMap = new Map<string, string>();
  (requestResult.data || []).forEach((row: any) => {
    if (!row?.conversation_id) return;
    latestRequestMap.set(row.conversation_id, row.status || 'pending');
  });

  return groupRows.map((group: any) => ({
    ...group,
    is_member: membershipSet.has(group.id),
    request_status: latestRequestMap.get(group.id) || null,
  }));
};

export const requestToJoinPublicGroup = async (conversationId: string, requesterId: string) => {
  const { data: group, error: groupError } = await supabase
    .from('conversations')
    .select('id, is_group, group_name, group_visibility, created_by')
    .eq('id', conversationId)
    .single();

  if (groupError) throw groupError;
  if (!group?.is_group) {
    throw new Error('This is not a group conversation');
  }
  if (group?.group_visibility !== 'public') {
    throw new Error('Join requests are only available for public groups');
  }

  const { count: memberCount, error: memberError } = await supabase
    .from('conversation_participants')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('user_id', requesterId)
    .is('left_at', null);

  if (memberError) throw memberError;
  if ((memberCount || 0) > 0) {
    throw new Error('You are already a member of this group');
  }

  const { data: existingPending, error: pendingError } = await supabase
    .from(GROUP_JOIN_REQUESTS_TABLE)
    .select('id, status')
    .eq('conversation_id', conversationId)
    .eq('requester_id', requesterId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (pendingError) throwGroupJoinRequestTableMissing(pendingError);
  if (existingPending?.id) {
    return existingPending;
  }

  const { data: createdRequest, error: createError } = await supabase
    .from(GROUP_JOIN_REQUESTS_TABLE)
    .insert({
      conversation_id: conversationId,
      requester_id: requesterId,
      status: 'pending',
    } as any)
    .select('*')
    .single();

  if (createError) throwGroupJoinRequestTableMissing(createError);

  const { data: requesterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', requesterId)
    .maybeSingle();

  await supabase.from('notifications').insert({
    user_id: group.created_by,
    type: 'group_join_request',
    title: 'New Group Join Request',
    body: `${requesterProfile?.full_name || 'A user'} requested to join ${group.group_name || 'your group'}`,
    related_id: conversationId,
    related_type: 'conversation',
    metadata: {
      requester_id: requesterId,
      request_id: createdRequest?.id,
      conversation_id: conversationId,
    },
    is_read: false,
  } as any);

  return createdRequest;
};

export const getPendingGroupJoinRequests = async (conversationId: string, actorId: string) => {
  await ensureGroupAdminPermission(conversationId, actorId);

  const { data, error } = await supabase
    .from(GROUP_JOIN_REQUESTS_TABLE)
    .select('*, requester:profiles!group_join_requests_requester_id_fkey(*)')
    .eq('conversation_id', conversationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throwGroupJoinRequestTableMissing(error);
  return (data || []) as GroupJoinRequest[];
};

export const reviewGroupJoinRequest = async (
  conversationId: string,
  requestId: string,
  actorId: string,
  action: 'accept' | 'reject'
) => {
  const details = await ensureGroupAdminPermission(conversationId, actorId);

  const { data: request, error: requestError } = await supabase
    .from(GROUP_JOIN_REQUESTS_TABLE)
    .select('*')
    .eq('id', requestId)
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (requestError) throwGroupJoinRequestTableMissing(requestError);
  if (!request) {
    throw new Error('Join request not found');
  }
  if (request.status !== 'pending') {
    throw new Error('This join request is no longer pending');
  }

  const nextStatus = action === 'accept' ? 'accepted' : 'rejected';

  if (action === 'accept') {
    const { error: upsertError } = await supabase
      .from('conversation_participants')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: request.requester_id,
          left_at: null,
          is_admin: false,
        } as any,
        { onConflict: 'conversation_id,user_id' }
      );

    if (upsertError) throw upsertError;
  }

  const { error: updateError } = await supabase
    .from(GROUP_JOIN_REQUESTS_TABLE)
    .update({
      status: nextStatus,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq('id', requestId);

  if (updateError) throwGroupJoinRequestTableMissing(updateError);

  if (action === 'accept') {
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() } as any)
      .eq('id', conversationId);
  }

  await supabase.from('notifications').insert({
    user_id: request.requester_id,
    type: action === 'accept' ? 'group_join_accepted' : 'group_join_rejected',
    title: action === 'accept' ? 'Join Request Accepted' : 'Join Request Rejected',
    body:
      action === 'accept'
        ? `You were added to ${details.group_name || 'the group'}`
        : `Your request to join ${details.group_name || 'the group'} was declined`,
    related_id: conversationId,
    related_type: 'conversation',
    metadata: {
      request_id: requestId,
      conversation_id: conversationId,
    },
    is_read: false,
  } as any);

  return { success: true };
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

export const addParticipantsToGroup = async (
  conversationId: string,
  actorId: string,
  participantIds: string[]
) => {
  const details = await ensureGroupAdminPermission(conversationId, actorId);

  const uniqueParticipantIds = Array.from(
    new Set(participantIds.filter((id) => !!id && id !== actorId))
  );

  if (!uniqueParticipantIds.length) {
    return { addedCount: 0 };
  }

  const activeMemberIds = new Set<string>(
    (details.participants || []).map((participant: any) => participant.user_id)
  );

  const idsToAdd = uniqueParticipantIds.filter((id) => !activeMemberIds.has(id));

  if (!idsToAdd.length) {
    return { addedCount: 0 };
  }

  const rows = idsToAdd.map((userId) => ({
    conversation_id: conversationId,
    user_id: userId,
    left_at: null,
    is_admin: false,
  }));

  const { error } = await supabase
    .from("conversation_participants")
    .upsert(rows as any, { onConflict: "conversation_id,user_id" });

  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() } as any)
    .eq("id", conversationId);

  return { addedCount: idsToAdd.length };
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
  const seenByOthersCountMap = new Map<string, number>();
  if (sentMessageIds.length > 0) {
    const { data: seenData } = await supabase
      .from("message_reads")
      .select("message_id,user_id")
      .neq("user_id", userId)
      .in("message_id", sentMessageIds);
    (seenData || []).forEach((r: any) => {
      const currentCount = seenByOthersCountMap.get(r.message_id) || 0;
      seenByOthersCountMap.set(r.message_id, currentCount + 1);
    });
  }

  return msgs.reverse().map((message: any) => ({
    ...decryptMessageObject(message),
    is_read: readSet.has(message.id),
    seen_by_others:
      message.sender_id === userId ? (seenByOthersCountMap.get(message.id) || 0) > 0 : undefined,
    seen_by_count: message.sender_id === userId ? seenByOthersCountMap.get(message.id) || 0 : undefined,
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

  // Encrypt on the client before storing in Supabase (DB stores only encrypted text).
  const encryptedContent = encryptMessage(content);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: encryptedContent,
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

  // Decrypt only when returning to UI.
  return decryptMessageObject(data) as Message;
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
  const fetchTypingUsers = async () => {
    const staleCutoff = new Date(Date.now() - 8 * 1000).toISOString();
    const { data } = await supabase
      .from("typing_indicators")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .gte("started_at", staleCutoff);

    callback(data?.map((d: any) => d.user_id) || []);
  };

  const channel = supabase
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
        await fetchTypingUsers();
      }
    );

  fetchTypingUsers().catch((error) => {
    console.error("Initial typing fetch error:", error);
    callback([]);
  });

  return channel.subscribe();
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
            message: decryptMessageObject(data) as Message,
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
            message: decryptMessageObject(data) as Message,
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
  const fileName = `${Date.now()}.${fileExt}`;
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

// Upload group avatar (uses avatars bucket which is already configured for profile uploads)
export const uploadGroupAvatar = async (userId: string, fileUri: string) => {
  const fileExt = (fileUri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt) ? fileExt : 'jpg';
  const fileName = `group-avatar-${Date.now()}.${safeExt}`;
  const filePath = `${userId}/${fileName}`;

  const contentType =
    safeExt === 'png'
      ? 'image/png'
      : safeExt === 'webp'
        ? 'image/webp'
        : safeExt === 'gif'
          ? 'image/gif'
          : 'image/jpeg';

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const byteCharacters = atob(base64);
  const uint8Array = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    uint8Array[i] = byteCharacters.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, uint8Array, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(filePath);

  return publicUrl;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown time';
  return parsed.toLocaleString();
};

const formatDateOnly = (value: Date) => {
  return value.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const parseRequestedDate = (text: string): Date | null => {
  const lower = text.toLowerCase();
  const now = new Date();

  if (lower.includes('today')) return now;
  if (lower.includes('tomorrow')) return new Date(now.getTime() + DAY_IN_MS);
  if (lower.includes('yesterday')) return new Date(now.getTime() - DAY_IN_MS);

  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const parsed = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const dmyMatch = lower.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const getDateRange = (value: Date) => {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

const normalizeSearchTerm = (prompt: string) => {
  return prompt
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
};

const isDateIntent = (prompt: string) => {
  const lower = prompt.toLowerCase();
  return (
    !!parseRequestedDate(prompt) ||
    /\b(date|day|today|tomorrow|yesterday|schedule|happening|on)\b/.test(lower)
  );
};

const getEventLifecycleStatus = (startDate?: string | null, endDate?: string | null) => {
  const now = Date.now();
  const start = startDate ? new Date(startDate).getTime() : Number.NaN;
  const end = endDate ? new Date(endDate).getTime() : Number.NaN;

  if (!Number.isNaN(end) && end < now) return 'Finished';
  if (!Number.isNaN(start) && start > now) return 'Upcoming';
  if (!Number.isNaN(start) && !Number.isNaN(end) && start <= now && end >= now) return 'Live';
  return 'Scheduled';
};

const getProjectLifecycleStatus = (status?: string | null) => {
  const normalized = (status || '').toLowerCase().trim();
  if (normalized === 'completed' || normalized === 'cancelled') return 'Finished';
  if (normalized === 'on-hold') return 'On hold';
  if (normalized === 'planning' || normalized === 'recruiting' || normalized === 'in-progress') {
    return 'Ongoing';
  }
  return 'Active';
};

const isDetailIntent = (prompt: string) => {
  return /\b(detail|details|about|info|information|describe|explain|full)\b/.test(prompt);
};

const extractEntityHint = (prompt: string) => {
  return prompt
    .toLowerCase()
    .replace(/\b(give|show|tell|me|about|details|detail|info|information|project|projects|event|events|of|the|a|an|for|what|is|venue|location|where|date|time|status|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getPrimaryLookupTerm = (prompt: string, entityHint: string) => {
  const cleanedHint = normalizeSearchTerm(entityHint);
  if (cleanedHint) return cleanedHint;
  return normalizeSearchTerm(prompt);
};

const scoreMatch = (candidate: string, hint: string) => {
  if (!hint) return 0;
  const candidateLower = candidate.toLowerCase();
  let score = 0;

  if (candidateLower.includes(hint)) score += 10;

  const tokens = hint.split(' ').filter((token) => token.length > 2);
  for (const token of tokens) {
    if (candidateLower.includes(token)) score += 2;
  }

  return score;
};

const pickBestEvent = (events: any[], hint: string) => {
  if (!events.length) return null;
  if (!hint) return events[0];

  return [...events]
    .sort((a, b) => {
      const aText = `${a.title || ''} ${a.description || ''} ${a.venue || ''}`;
      const bText = `${b.title || ''} ${b.description || ''} ${b.venue || ''}`;
      return scoreMatch(bText, hint) - scoreMatch(aText, hint);
    })[0];
};

const pickBestProject = (projects: any[], hint: string) => {
  if (!projects.length) return null;
  if (!hint) return projects[0];

  return [...projects]
    .sort((a, b) => {
      const aText = `${a.name || ''} ${a.description || ''} ${a.category || ''}`;
      const bText = `${b.name || ''} ${b.description || ''} ${b.category || ''}`;
      return scoreMatch(bText, hint) - scoreMatch(aText, hint);
    })[0];
};

const normalizeForComparison = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const shouldAutoShowDetails = (
  prompt: string,
  events: any[],
  projects: any[],
  wantsEvents: boolean,
  wantsProjects: boolean,
  wantsVenue: boolean,
  requestedDate: Date | null
) => {
  if (requestedDate || wantsVenue) return false;

  const normalizedPrompt = normalizeForComparison(prompt);
  if (!normalizedPrompt || normalizedPrompt.length < 3) return false;

  const eventExactMatch = wantsEvents
    ? events.some((event) => normalizeForComparison(event.title || '') === normalizedPrompt)
    : false;

  const projectExactMatch = wantsProjects
    ? projects.some((project) => normalizeForComparison(project.name || '') === normalizedPrompt)
    : false;

  if (eventExactMatch || projectExactMatch) return true;

  const eventStrongMatch = wantsEvents
    ? events.some((event) => scoreMatch(`${event.title || ''} ${event.description || ''}`, normalizedPrompt) >= 10)
    : false;

  const projectStrongMatch = wantsProjects
    ? projects.some((project) => scoreMatch(`${project.name || ''} ${project.description || ''}`, normalizedPrompt) >= 10)
    : false;

  return eventStrongMatch || projectStrongMatch;
};

const isCampusIntent = (lowerPrompt: string, requestedDate: Date | null) => {
  if (requestedDate) return true;
  return /\b(event|events|workshop|hackathon|seminar|competition|fest|project|projects|team|teams|announcement|notice|feed|update|updates|news|venue|location|where|date|time|when|status|campus|college|university)\b/.test(lowerPrompt);
};

const looksLikeCodeSnippet = (text: string) => {
  return /```|\b(function|class|const|let|var|import|export|return|if\s*\(|for\s*\(|while\s*\(|def\s+|public\s+class|#include)\b|[{};]{2,}/i.test(text);
};

const buildLocalGeneralFallback = (prompt: string) => {
  const lower = prompt.toLowerCase();

  if (looksLikeCodeSnippet(prompt) || /\b(explain|debug|fix|error|bug|code|program|algorithm)\b/.test(lower)) {
    return [
      'I can help with code questions.',
      'Share the language, expected behavior, and any error output, and I will explain the code step-by-step or help fix the issue.',
      'If you want, paste the code snippet and I will break it down clearly.',
    ].join('\n');
  }

  if (/\b(prepare|preparation|study plan|revise|revision|exam|interview)\b/.test(lower)) {
    return [
      'Good question. Here is a quick preparation framework:',
      '1. Define scope: topics, format, and time available.',
      '2. Prioritize: high-weight topics first, weak areas second.',
      '3. Practice: timed questions + active recall + short review loops.',
      '4. Final pass: one-page summary, sleep, and a calm pre-checklist.',
      'Tell me the exact event/interview/exam and timeline, and I will create a tailored plan.',
    ].join('\n');
  }

  if (/\b(hi|hello|hey)\b/.test(lower)) {
    return 'Hi! Ask me anything, and I will help with a clear answer. I can handle academics, coding, career prep, and campus guidance.';
  }

  return [
    'I am ready to help with any question.',
    'Share a bit more context (goal, constraints, or what you already tried), and I will give a precise answer.',
  ].join('\n');
};

const fetchGeneralAiReply = async (prompt: string) => {
  const baseUrl = (ENV.aiApiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: prompt }),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    if (typeof payload?.reply === 'string' && payload.reply.trim()) {
      return payload.reply.trim();
    }
  } catch {
    return null;
  }

  return null;
};

const getGeneralAiResponse = async (prompt: string) => {
  const serverReply = await fetchGeneralAiReply(prompt);
  if (serverReply) return serverReply;
  return buildLocalGeneralFallback(prompt);
};

export const chatWithAI = async (_userId: string, prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return 'Ask me anything. I can help with general questions, coding, study prep, and campus events/projects.';
  }

  const isAllowed = await moderateText(trimmed);
  if (!isAllowed) {
    throw new Error('Your message was flagged for review. Try rephrasing without sensitive terms.');
  }

  const lower = trimmed.toLowerCase();
  const requestedDate = parseRequestedDate(trimmed);
  const wantsEvents = /\b(event|events|workshop|hackathon|seminar|competition|fest)\b/.test(lower) || !!requestedDate;
  const wantsProjects = /\b(project|projects|team|teams)\b/.test(lower) || !!requestedDate;
  const wantsOther = /\b(other|announcement|notice|feed|update|updates|news)\b/.test(lower) || !!requestedDate;
  const wantsVenue = /\b(venue|location|where)\b/.test(lower);
  const wantsStatus = /\bstatus\b/.test(lower);
  const wantsDateTime = /\b(date|time|when)\b/.test(lower);
  const wantsDetails = isDetailIntent(lower) || /\b(tell me about|what is|more about)\b/.test(lower);
  if (!isCampusIntent(lower, requestedDate)) {
    return getGeneralAiResponse(trimmed);
  }

  const entityHint = extractEntityHint(lower);
  const searchTerm = getPrimaryLookupTerm(trimmed, entityHint);

  let events: any[] = [];
  let projects: any[] = [];
  let feedPosts: any[] = [];

  if (wantsEvents || wantsProjects || wantsOther || wantsVenue || isDateIntent(trimmed)) {
    if (requestedDate) {
      const { startIso, endIso } = getDateRange(requestedDate);

      const [eventsResult, projectsResult, postsResult] = await Promise.all([
        supabase
          .from('events')
          .select('id,title,description,start_date,end_date,venue,is_online,meeting_link')
          .lte('start_date', endIso)
          .gte('end_date', startIso)
          .order('start_date', { ascending: true })
          .limit(8),
        supabase
          .from('project_teams')
          .select('id,name,description,status,category,is_recruiting,created_at,updated_at')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('feed_posts')
          .select('id,content,type,created_at')
          .eq('is_approved', true)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (projectsResult.error) throw projectsResult.error;
      if (postsResult.error) throw postsResult.error;

      events = eventsResult.data || [];
      projects = projectsResult.data || [];
      feedPosts = postsResult.data || [];
    } else {
      const likeToken = `%${searchTerm}%`;
      const [eventsResult, projectsResult, postsResult] = await Promise.all([
        supabase
          .from('events')
          .select('id,title,description,start_date,end_date,venue,is_online,meeting_link')
          .or(`title.ilike.${likeToken},description.ilike.${likeToken},venue.ilike.${likeToken}`)
          .order('start_date', { ascending: true })
          .limit(8),
        supabase
          .from('project_teams')
          .select('id,name,description,status,category,is_recruiting,created_at,updated_at')
          .or(`name.ilike.${likeToken},description.ilike.${likeToken},category.ilike.${likeToken}`)
          .order('updated_at', { ascending: false })
          .limit(8),
        supabase
          .from('feed_posts')
          .select('id,content,type,created_at')
          .eq('is_approved', true)
          .ilike('content', likeToken)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (projectsResult.error) throw projectsResult.error;
      if (postsResult.error) throw postsResult.error;

      events = eventsResult.data || [];
      projects = projectsResult.data || [];
      feedPosts = postsResult.data || [];
    }
  }

  const output: string[] = [];
  const matchedEvent = wantsEvents && events.length ? pickBestEvent(events, entityHint || searchTerm.toLowerCase()) : null;
  const matchedProject = wantsProjects && projects.length ? pickBestProject(projects, entityHint || searchTerm.toLowerCase()) : null;
  const autoShowDetails = shouldAutoShowDetails(
    trimmed,
    events,
    projects,
    wantsEvents,
    wantsProjects,
    wantsVenue,
    requestedDate
  );

  if (wantsVenue && matchedEvent) {
    const venueLabel = matchedEvent.venue || (matchedEvent.is_online ? 'Online' : 'Venue not specified');
    const outputLines = [
      `${matchedEvent.title} venue: ${venueLabel}`,
    ];
    if (matchedEvent.meeting_link) {
      outputLines.push(`Meeting link: ${matchedEvent.meeting_link}`);
    }
    return outputLines.join('\n');
  }

  if (wantsDateTime && matchedEvent) {
    return [
      `${matchedEvent.title} schedule:`,
      `- Start: ${formatDateTime(matchedEvent.start_date)}`,
      `- End: ${formatDateTime(matchedEvent.end_date)}`,
      `- Status: ${getEventLifecycleStatus(matchedEvent.start_date, matchedEvent.end_date)}`,
    ].join('\n');
  }

  if (wantsStatus && matchedEvent) {
    return `${matchedEvent.title} status: ${getEventLifecycleStatus(matchedEvent.start_date, matchedEvent.end_date)}`;
  }

  if (wantsStatus && matchedProject) {
    const status = matchedProject.status || (matchedProject.is_recruiting ? 'recruiting' : 'active');
    return `${matchedProject.name} status: ${status} (${getProjectLifecycleStatus(status)})`;
  }

  if (/\brecruiting\b/.test(lower) && matchedProject) {
    return `${matchedProject.name} recruiting: ${matchedProject.is_recruiting ? 'Yes' : 'No'}`;
  }

  if (wantsDetails || autoShowDetails) {
    if (matchedEvent) {
      const event = matchedEvent;
      if (event) {
        const venueLabel = event.venue || (event.is_online ? 'Online' : 'Venue not specified');
        const lifecycle = getEventLifecycleStatus(event.start_date, event.end_date);
        output.push(`Event details:`);
        output.push(`- Title: ${event.title}`);
        output.push(`- Status: ${lifecycle}`);
        output.push(`- Start: ${formatDateTime(event.start_date)}`);
        output.push(`- End: ${formatDateTime(event.end_date)}`);
        output.push(`- Venue: ${venueLabel}`);
        if (event.meeting_link) output.push(`- Meeting link: ${event.meeting_link}`);
        if (event.description) output.push(`- Description: ${event.description}`);
      }
    }

    if (matchedProject) {
      const project = matchedProject;
      if (project) {
        const status = project.status || (project.is_recruiting ? 'recruiting' : 'active');
        const lifecycle = getProjectLifecycleStatus(status);
        output.push(`Project details:`);
        output.push(`- Name: ${project.name}`);
        output.push(`- Status: ${status} (${lifecycle})`);
        output.push(`- Category: ${project.category || 'general'}`);
        output.push(`- Recruiting: ${project.is_recruiting ? 'Yes' : 'No'}`);
        if (project.description) output.push(`- Description: ${project.description}`);
        output.push(`- Last updated: ${formatDateTime(project.updated_at || project.created_at)}`);
      }
    }

    if (output.length) {
      output.push('I answer from live campus data, so details update as records change.');
      return output.join('\n');
    }
  }

  const askedForEvents = /\b(event|events|workshop|hackathon|seminar|competition|fest)\b/.test(lower);
  const askedForProjects = /\b(project|projects|team|teams)\b/.test(lower);
  let dataLines = 0;

  if (requestedDate) {
    output.push(`Here is what is scheduled for ${formatDateOnly(requestedDate)}:`);
  }

  if (events.length) {
    dataLines++;
    output.push(`Events (${events.length}):`);
    for (const event of events.slice(0, 5)) {
      const venueLabel = event.venue || (event.is_online ? 'Online' : 'Venue not specified');
      const lifecycle = getEventLifecycleStatus(event.start_date, event.end_date);
      output.push(`- ${event.title} | ${formatDateTime(event.start_date)} | Venue: ${venueLabel} | Status: ${lifecycle}`);
    }
  }

  if (projects.length) {
    dataLines++;
    output.push(`Projects (${projects.length}):`);
    for (const project of projects.slice(0, 5)) {
      const status = project.status || (project.is_recruiting ? 'recruiting' : 'active');
      const lifecycle = getProjectLifecycleStatus(status);
      output.push(`- ${project.name} | Status: ${status} (${lifecycle}) | Category: ${project.category || 'general'}`);
    }
  }

  if (feedPosts.length) {
    dataLines++;
    output.push(`Other updates (${feedPosts.length}):`);
    for (const post of feedPosts.slice(0, 4)) {
      const preview = (post.content || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      output.push(`- [${post.type}] ${preview}${preview.length >= 90 ? '...' : ''}`);
    }
  }

  if (dataLines === 0 && wantsVenue) {
    return 'I could not find matching venues right now. Try an event name or a date like 2026-03-11.';
  }

  if (dataLines === 0) {
    if (requestedDate) {
      const dateLabel = formatDateOnly(requestedDate);
      if (askedForEvents && !askedForProjects) {
        return `There are no events scheduled for ${dateLabel}.`;
      }
      if (askedForProjects && !askedForEvents) {
        return `There are no projects scheduled for ${dateLabel}.`;
      }
      return `There are no events or projects scheduled for ${dateLabel}.`;
    }
    if (askedForEvents && !askedForProjects) return 'No events found matching your query.';
    if (askedForProjects && !askedForEvents) return 'No projects found matching your query.';
    if (askedForEvents || askedForProjects) return 'No events or projects found matching your query.';
    return getGeneralAiResponse(trimmed);
  }

  output.push('I answer from live campus data, so responses update as events and projects change.');
  return output.join('\n');
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
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const getUserStatus = async (userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, status, status_updated_at")
    .eq("id", userId)
    .single();

  if (error) throw error;

  const currentStatus = (data?.status as 'online' | 'away' | 'offline' | null) || 'offline';
  if (currentStatus === 'offline') {
    return data;
  }

  // Presence is only trusted when the timestamp is recent and parseable.
  const PRESENCE_STALE_MS = 2 * 60 * 1000;
  const updatedAtMs = data?.status_updated_at ? new Date(data.status_updated_at).getTime() : Number.NaN;
  const isFresh = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= PRESENCE_STALE_MS;

  if (!isFresh) {
    return {
      ...data,
      status: 'offline',
    };
  }

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

  // Encrypt on the client before storing in Supabase (DB stores only encrypted text).
  const encryptedContent = encryptMessage(content);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: encryptedContent,
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

  // Decrypt only when returning to UI.
  return decryptMessageObject(data);
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

  // Decrypt only when returning to UI.
  return decryptMessageObject(data);
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
  // Messages are stored encrypted, so DB-level `ilike(content, ...)` won't work.
  // Fetch a filtered set, decrypt client-side, then search in decrypted text.
  let q = supabase
    .from("messages")
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(*)
    `)
    .eq("conversation_id", conversationId)
    .eq("is_deleted", false);

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

  const { data, error } = await q.order("created_at", { ascending: false }).limit(500);

  if (error) throw error;

  const decrypted = (data || []).map((m: any) => decryptMessageObject(m));
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return decrypted;

  return decrypted.filter((m: any) => {
    const content = typeof m?.content === "string" ? m.content : "";
    return content.toLowerCase().includes(needle);
  });
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
  return (data || []).map((row: any) => ({
    ...row,
    message: row?.message ? decryptMessageObject(row.message) : row?.message,
  }));
};

export const createGroupAnnouncement = async (
  conversationId: string,
  createdByAdminId: string,
  title: string,
  content: string
) => {
  await ensureGroupAdminPermission(conversationId, createdByAdminId);

  // Encrypt on the client before storing in Supabase (DB stores only encrypted text).
  const encryptedTitle = encryptMessage(title);
  const encryptedContent = encryptMessage(content);

  const { data, error } = await supabase
    .from("group_announcements")
    .insert({
      conversation_id: conversationId,
      created_by: createdByAdminId,
      title: encryptedTitle,
      content: encryptedContent,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .select(`*,creator:profiles!created_by(*)`)
    .single();

  if (error) throw error;
  // Decrypt only when returning to UI.
  return {
    ...data,
    title: decryptContentField((data as any)?.title),
    content: decryptContentField((data as any)?.content),
  };
};

export const getGroupAnnouncements = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("group_announcements")
    .select(`*,creator:profiles!created_by(*)`)
    .eq("conversation_id", conversationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((a: any) => ({
    ...a,
    title: decryptContentField(a?.title),
    content: decryptContentField(a?.content),
  }));
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

  // Encrypt on the client before storing in Supabase (DB stores only encrypted text).
  const encryptedContent = encryptMessage(content);

  const { data, error } = await supabase
    .from("scheduled_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: encryptedContent,
      message_type: messageType,
      scheduled_for: scheduledDate.toISOString(),
      status: "pending",
      created_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (error) throw error;
  // Decrypt only when returning to UI.
  return {
    ...data,
    content: decryptContentField((data as any)?.content),
  };
};

export const getScheduledMessages = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select(`*,sender:profiles!sender_id(*)`)
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true });

  if (error) throw error;
  return (data || []).map((m: any) => ({
    ...m,
    content: decryptContentField(m?.content),
  }));
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

// ===== CHAT PREFERENCES (Background Images) =====

// Get chat preference for a specific conversation
export const getChatPreference = async (userId: string, conversationId: string) => {
  const { data, error } = await supabase
    .from("chat_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

// Upload and set background image for a conversation
export const setChatBackgroundImage = async (
  userId: string,
  conversationId: string,
  imageUrl: string,
  imageName: string
) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("chat_preferences")
    .upsert(
      {
        user_id: userId,
        conversation_id: conversationId,
        background_image_url: imageUrl,
        background_image_name: imageName,
        updated_at: now,
      } as any,
      {
        onConflict: "user_id,conversation_id",
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Remove background image for a conversation
export const removeChatBackgroundImage = async (userId: string, conversationId: string) => {
  const { data, error } = await supabase
    .from("chat_preferences")
    .update({
      background_image_url: null,
      background_image_name: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

// Upload image to Supabase storage
export const uploadChatBackgroundToStorage = async (
  userId: string,
  conversationId: string,
  fileUri: string,
  fileName: string
) => {
  try {
    const path = `chat-backgrounds/${userId}/${conversationId}/${fileName}`;
    const fileExt = (fileName.split('.').pop() || 'jpg').toLowerCase();
    const contentType =
      fileExt === 'png'
        ? 'image/png'
        : fileExt === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error('Failed to read selected image');
    }
    const fileBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, fileBuffer, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    return urlData?.publicUrl;
  } catch (error) {
    console.error("Error uploading background image:", error);
    throw error;
  }
};

