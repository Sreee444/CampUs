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
