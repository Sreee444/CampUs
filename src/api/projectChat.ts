// @ts-nocheck
import { supabase } from './supabase';

export type ProjectChatMessage = {
    id: string;
    chat_id: string;
    sender_id: string;
    content: string;
    message_type?: 'text' | 'image' | 'file' | 'system';
    type?: 'text' | 'image' | 'file' | 'system';
    attachment_url?: string | null;
    created_at: string;
    sender?: {
        id: string;
        full_name: string;
        avatar_url?: string;
        role?: string;
    } | null;
};

const isMissingColumnError = (error: any): boolean => {
    const code = `${error?.code || ''}`;
    const message = `${error?.message || ''}`;
    return code === '42703' || code === 'PGRST204' || message.includes("Could not find the '");
};

const isMissingProjectMessageReadsTableError = (error: any): boolean => {
    const code = `${error?.code || ''}`;
    const message = `${error?.message || ''}`.toLowerCase();
    return code === 'PGRST205' || message.includes('project_chat_message_reads') || message.includes('schema cache');
};

const normalizeProjectChatMessage = (message: any): ProjectChatMessage => {
    const rawContent = typeof message?.content === 'string' ? message.content.trim() : '';
    const hasExplicitType = typeof message?.message_type === 'string' || typeof message?.type === 'string';
    const inferredAttachmentFromContent =
        !hasExplicitType && /^https?:\/\/\S+$/i.test(rawContent) ? rawContent : null;
    const resolvedAttachmentUrl = message?.attachment_url ?? inferredAttachmentFromContent ?? null;
    const resolvedType = message?.message_type ?? message?.type ?? (resolvedAttachmentUrl ? 'image' : 'text');

    return {
        ...message,
        content: inferredAttachmentFromContent ? '' : message?.content,
        message_type: resolvedType,
        attachment_url: resolvedAttachmentUrl,
    } as ProjectChatMessage;
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

        const selectShapes = [
                `
            id,
            chat_id,
            sender_id,
            content,
            message_type,
            attachment_url,
            created_at,
            sender:profiles!project_chat_messages_sender_id_fkey(
                id, full_name, avatar_url, role
            )
        `,
                `
            id,
            chat_id,
            sender_id,
            content,
            type,
            attachment_url,
            created_at,
            sender:profiles!project_chat_messages_sender_id_fkey(
                id, full_name, avatar_url, role
            )
        `,
                `
            id,
            chat_id,
            sender_id,
            content,
            attachment_url,
            created_at,
            sender:profiles!project_chat_messages_sender_id_fkey(
                id, full_name, avatar_url, role
            )
        `,
                `
            id,
            chat_id,
            sender_id,
            content,
            created_at,
            sender:profiles!project_chat_messages_sender_id_fkey(
                id, full_name, avatar_url, role
            )
        `,
        ];

        let data: any[] | null = null;
        let error: any = null;

        for (const shape of selectShapes) {
                ({ data, error } = await supabase
                        .from('project_chat_messages')
                        .select(shape)
                        .eq('chat_id', chatId)
                        .order('created_at', { ascending: true }));

                if (!error) {
                        break;
                }

                if (!isMissingColumnError(error)) {
                        break;
                }

                console.warn('[ProjectChat] getMessages - Retrying with fallback select shape due to missing column:', error?.message);
        }

    if (error) {
        console.error('[ProjectChat] getMessages - Error:', error);
        throw error;
    }
    console.log('[ProjectChat] getMessages - Retrieved', (data || []).length, 'messages');
        return (data || []).map(normalizeProjectChatMessage);
};

/**
 * Send a message to a project chat.
 */
export const sendProjectChatMessage = async (
    chatId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'image' | 'file' | 'system' = 'text',
    attachmentUrl?: string
): Promise<void> => {
    console.log('[ProjectChat] sendMessage - chatId:', chatId, '| senderId:', senderId, '| length:', content.length);

    const basePayload = {
        chat_id: chatId,
        sender_id: senderId,
        content,
    };

    const basePayloadWithAttachmentFallbackContent = {
        chat_id: chatId,
        sender_id: senderId,
        content: content || attachmentUrl || '',
    };

    const attachmentPayload = attachmentUrl !== undefined ? { attachment_url: attachmentUrl } : {};

    const insertPayloads = [
        { ...basePayload, message_type: messageType, ...attachmentPayload },
        { ...basePayload, type: messageType, ...attachmentPayload },
        { ...basePayloadWithAttachmentFallbackContent, message_type: messageType },
        { ...basePayloadWithAttachmentFallbackContent, type: messageType },
        { ...basePayload, ...attachmentPayload },
        { ...basePayloadWithAttachmentFallbackContent },
        { ...basePayload },
    ];

    let error: any = null;

    for (const payload of insertPayloads) {
        ({ error } = await supabase
            .from('project_chat_messages')
            .insert(payload));

        if (!error) {
            break;
        }

        if (!isMissingColumnError(error)) {
            break;
        }

        console.warn('[ProjectChat] sendMessage - Retrying insert with fallback payload due to missing column:', error?.message);
    }
    
    if (error) {
        console.error('[ProjectChat] sendMessage - Error:', error);
        throw error;
    }
    console.log('[ProjectChat] sendMessage - Success');
};

export const deleteProjectChatMessage = async (
    messageId: string,
    senderId: string
): Promise<void> => {
    const { error } = await supabase
        .from('project_chat_messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', senderId);

    if (error) {
        console.error('[ProjectChat] deleteMessage - Error:', error);
        throw error;
    }
};

export const markProjectMessagesRead = async (
    messageIds: string[],
    userId: string
): Promise<void> => {
    if (!messageIds.length || !userId) return;

    const rows = Array.from(new Set(messageIds)).map((messageId) => ({
        message_id: messageId,
        user_id: userId,
        read_at: new Date().toISOString(),
    }));

    const { error } = await supabase
        .from('project_chat_message_reads')
        .upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true });

    if (error) {
        if (isMissingProjectMessageReadsTableError(error)) return;
        throw error;
    }
};

export const getProjectSeenByOthers = async (
    messageIds: string[],
    currentUserId: string
): Promise<Map<string, number>> => {
    const counts = new Map<string, number>();
    if (!messageIds.length || !currentUserId) return counts;

    const { data, error } = await supabase
        .from('project_chat_message_reads')
        .select('message_id,user_id')
        .in('message_id', messageIds)
        .neq('user_id', currentUserId);

    if (error) {
        if (isMissingProjectMessageReadsTableError(error)) return counts;
        throw error;
    }

    for (const row of data || []) {
        const current = counts.get(row.message_id) || 0;
        counts.set(row.message_id, current + 1);
    }

    return counts;
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

                const message = normalizeProjectChatMessage({ ...payload.new, sender: senderData ?? null });
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
