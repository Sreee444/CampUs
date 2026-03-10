// @ts-nocheck
import { supabase } from './supabase';

export type ProjectChatMessage = {
    id: string;
    chat_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    sender?: {
        id: string;
        full_name: string;
        avatar_url?: string;
        role?: string;
    } | null;
};

export type MessageReaction = {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
    created_at: string;
    user?: {
        id: string;
        full_name: string;
        avatar_url?: string;
    } | null;
};

const isMissingReactionTableError = (error: any) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205' || message.includes('project_message_reactions') || message.includes('schema cache');
};

/**
 * Ensure a project_chat row exists for the given project team.
 * Also upserts the provided list of user IDs as participants.
 * Returns the chat ID.
 */
export const ensureProjectChat = async (
    projectTeamId: string,
    memberUserIds: string[]
): Promise<string> => {
    console.log('[ProjectChat] ensureProjectChat - teamId:', projectTeamId, '| members:', memberUserIds.length);

    // First, try to get existing chat
    const { data: existingChat } = await supabase
        .from('project_chats')
        .select('id')
        .eq('project_team_id', projectTeamId)
        .maybeSingle();

    let chatId: string;

    if (existingChat?.id) {
        chatId = existingChat.id;
        console.log('[ProjectChat] ensureProjectChat - Found existing chat ID:', chatId);
    } else {
        // Create new chat if it doesn't exist
        console.log('[ProjectChat] ensureProjectChat - Creating new chat for team:', projectTeamId);
        const { data: newChat, error: chatError } = await supabase
            .from('project_chats')
            .insert({ project_team_id: projectTeamId })
            .select('id')
            .single();

        if (chatError) {
            console.error('[ProjectChat] ensureProjectChat - Failed to create chat:', chatError);
            throw chatError;
        }
        chatId = newChat.id;
        console.log('[ProjectChat] ensureProjectChat - Created new chat ID:', chatId);
    }

    // Add all members as participants (ignore conflicts)
    if (memberUserIds.length > 0) {
        const rows = memberUserIds.map((uid) => ({ chat_id: chatId, user_id: uid }));
        const { error: pError } = await supabase
            .from('project_chat_participants')
            .upsert(rows, { onConflict: 'chat_id,user_id', ignoreDuplicates: true });
        if (pError) {
            console.error('[ProjectChat] ensureProjectChat - Failed to add participants:', pError);
            throw pError;
        }
        console.log('[ProjectChat] ensureProjectChat - Added', memberUserIds.length, 'participants');
    }

    return chatId;
};

/**
 * Get chat ID for a project team, or null if none exists.
 */
export const getProjectChatId = async (projectTeamId: string): Promise<string | null> => {
    console.log('[ProjectChat] getProjectChatId - teamId:', projectTeamId);

    const { data, error } = await supabase
        .from('project_chats')
        .select('id')
        .eq('project_team_id', projectTeamId)
        .maybeSingle();

    if (error) {
        console.error('[ProjectChat] getProjectChatId - Error:', error);
        throw error;
    }

    const chatId = data?.id ?? null;
    console.log('[ProjectChat] getProjectChatId - Result:', chatId || 'null (no chat exists)');
    return chatId;
};

/**
 * Add a single participant to an existing project chat.
 * Safe to call even if already a participant (upsert).
 */
export const addParticipantToProjectChat = async (
    chatId: string,
    userId: string
): Promise<void> => {
    console.log('[ProjectChat] addParticipant - chatId:', chatId, '| userId:', userId);

    const { error } = await supabase
        .from('project_chat_participants')
        .upsert({ chat_id: chatId, user_id: userId }, { onConflict: 'chat_id,user_id', ignoreDuplicates: true });

    if (error) {
        console.error('[ProjectChat] addParticipant - Failed:', error);
        throw error;
    }
    console.log('[ProjectChat] addParticipant - Success');
};

/**
 * Fetch all messages for a project chat, with sender profile.
 */
export const getProjectChatMessages = async (chatId: string): Promise<ProjectChatMessage[]> => {
    console.log('[ProjectChat] getMessages - chatId:', chatId);

    const { data, error } = await supabase
        .from('project_chat_messages')
        .select(`
      id,
      chat_id,
      sender_id,
      content,
      created_at,
      sender:profiles!project_chat_messages_sender_id_fkey(
        id, full_name, avatar_url, role
      )
    `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[ProjectChat] getMessages - Error:', error);
        throw error;
    }
    console.log('[ProjectChat] getMessages - Retrieved', (data || []).length, 'messages');
    return (data || []) as ProjectChatMessage[];
};

/**
 * Send a message to a project chat.
 */
export const sendProjectChatMessage = async (
    chatId: string,
    senderId: string,
    content: string
): Promise<void> => {
    console.log('[ProjectChat] sendMessage - chatId:', chatId, '| senderId:', senderId, '| length:', content.length);

    const { error } = await supabase
        .from('project_chat_messages')
        .insert({ chat_id: chatId, sender_id: senderId, content });

    if (error) {
        console.error('[ProjectChat] sendMessage - Error:', error);
        throw error;
    }
    console.log('[ProjectChat] sendMessage - Success');
};

/**
 * Subscribe to new messages in a project chat (Supabase Realtime).
 * Returns an object with an unsubscribe() method.
 */
export const subscribeToProjectChatMessages = (
    chatId: string,
    onInsert: (msg: ProjectChatMessage) => void
) => {
    console.log('[ProjectChat] subscribeToMessages - chatId:', chatId);

    const channel = supabase
        .channel(`project_chat_${chatId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'project_chat_messages',
                filter: `chat_id=eq.${chatId}`,
            },
            async (payload: any) => {
                console.log('[ProjectChat] Realtime - New message received, id:', payload.new?.id);

                // Fetch sender profile for the new message
                const { data: senderData, error: senderError } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url, role')
                    .eq('id', payload.new.sender_id)
                    .maybeSingle();

                if (senderError) {
                    console.error('[ProjectChat] Realtime - Failed to fetch sender profile:', senderError);
                }

                const message = { ...payload.new, sender: senderData ?? null };
                console.log('[ProjectChat] Realtime - Delivering message to UI, sender:', senderData?.full_name || 'unknown');
                onInsert(message);
            }
        )
        .subscribe((status) => {
            console.log('[ProjectChat] Subscription status:', status);
        });

    return {
        unsubscribe: () => {
            console.log('[ProjectChat] Unsubscribing from chat:', chatId);
            supabase.removeChannel(channel);
        }
    };
};

// ========== MESSAGE DELETE ==========

/**
 * Delete a project chat message (hard delete).
 */
export const deleteProjectChatMessage = async (messageId: string): Promise<void> => {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user?.id) throw new Error('User must be authenticated to delete messages');

    const { error } = await supabase
        .from('project_chat_messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', user.id);

    if (error) throw error;
};

// ========== MESSAGE REACTIONS ==========

/**
 * Add a reaction to a project chat message.
 */
export const addProjectMessageReaction = async (
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
        .from('project_message_reactions')
        .insert({
            message_id: messageId,
            user_id: user.id,
            emoji,
        } as any);

    if (error && error.code !== '23505') {
        if (isMissingReactionTableError(error)) return;
        throw error;
    }
};

/**
 * Remove a reaction from a project chat message.
 */
export const removeProjectMessageReaction = async (
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
        .from('project_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);

    if (error) {
        if (isMissingReactionTableError(error)) return;
        throw error;
    }
};

/**
 * Get all reactions for project message IDs.
 */
export const getProjectMessageReactions = async (
    messageIds: string[]
): Promise<Map<string, MessageReaction[]>> => {
    if (messageIds.length === 0) return new Map();

    const { data, error } = await supabase
        .from('project_message_reactions')
        .select(`
      *,
      user:profiles!project_message_reactions_user_id_fkey(
        id,
        full_name,
        avatar_url
      )
    `)
        .in('message_id', messageIds);

    if (error) {
        if (isMissingReactionTableError(error)) return new Map();
        throw error;
    }

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

// ========== TYPING INDICATORS ==========

/**
 * Set typing indicator for a user in a project chat.
 */
export const setProjectTyping = async (chatId: string, userId: string) => {
    // @ts-ignore - Supabase type inference issue
    const { error } = await supabase.from("project_typing_indicators").upsert({
        chat_id: chatId,
        user_id: userId,
        started_at: new Date().toISOString(),
    } as any);

    if (error) console.error("Project typing indicator error:", error);
};

/**
 * Remove typing indicator for a user in a project chat.
 */
export const removeProjectTyping = async (chatId: string, userId: string) => {
    const { error } = await supabase
        .from("project_typing_indicators")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", userId);

    if (error) console.error("Remove project typing error:", error);
};

/**
 * Subscribe to typing indicators in a project chat.
 */
export const subscribeToProjectTyping = (
    chatId: string,
    callback: (typingUsers: string[]) => void
) => {
    const fetchTypingUsers = async () => {
        const staleCutoff = new Date(Date.now() - 8 * 1000).toISOString();
        const { data } = await supabase
            .from("project_typing_indicators")
            .select("user_id")
            .eq("chat_id", chatId)
            .gte("started_at", staleCutoff);

        callback(data?.map((d: any) => d.user_id) || []);
    };

    const channel = supabase
        .channel(`project_typing:${chatId}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "project_typing_indicators",
                filter: `chat_id=eq.${chatId}`,
            },
            async () => {
                await fetchTypingUsers();
            }
        );

    fetchTypingUsers().catch((error) => {
        console.error("Initial project typing fetch error:", error);
        callback([]);
    });

    return channel.subscribe();
};
