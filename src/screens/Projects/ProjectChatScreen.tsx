// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    FlatList,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Modal,
    ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import ConfirmDialog from '../../components/ConfirmDialog';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateUserStatus } from '../../api/chat';
import {
    getProjectChatMessages,
    sendProjectChatMessage,
    subscribeToProjectChatMessages,
    ProjectChatMessage,
    addProjectMessageReaction,
    removeProjectMessageReaction,
    getProjectMessageReactions,
    deleteProjectChatMessage,
    MessageReaction,
    setProjectTyping,
    removeProjectTyping,
    subscribeToProjectTyping,
} from '../../api/projectChat';
import { supabase } from '../../api/supabase';

const CHAT_THEME_KEY = 'chat_color_theme';

type ChatTheme = {
    key: string; label: string; bubbleColor: string; textColor: string; timeColor: string;
    incomingBubbleColor: string; incomingTextColor: string; incomingTimeColor: string; incomingBorderColor: string;
};

const CHAT_THEMES: ChatTheme[] = [
    { key: 'default', label: 'Teal', bubbleColor: '#13ecec', textColor: '#0e3a3a', timeColor: '#0e3a3a', incomingBubbleColor: '#d8fafa', incomingTextColor: '#0f3d3d', incomingTimeColor: '#2b5f5f', incomingBorderColor: '#aeecec' },
    { key: 'blue', label: 'Blue', bubbleColor: '#3B82F6', textColor: '#ffffff', timeColor: '#dbeafe', incomingBubbleColor: '#dbeafe', incomingTextColor: '#1e3a8a', incomingTimeColor: '#1d4ed8', incomingBorderColor: '#bfdbfe' },
    { key: 'purple', label: 'Purple', bubbleColor: '#8B5CF6', textColor: '#ffffff', timeColor: '#ede9fe', incomingBubbleColor: '#ede9fe', incomingTextColor: '#5b21b6', incomingTimeColor: '#6d28d9', incomingBorderColor: '#ddd6fe' },
    { key: 'green', label: 'Green', bubbleColor: '#10B981', textColor: '#ffffff', timeColor: '#d1fae5', incomingBubbleColor: '#d1fae5', incomingTextColor: '#065f46', incomingTimeColor: '#047857', incomingBorderColor: '#a7f3d0' },
    { key: 'rose', label: 'Rose', bubbleColor: '#F43F5E', textColor: '#ffffff', timeColor: '#ffe4e6', incomingBubbleColor: '#ffe4e6', incomingTextColor: '#9f1239', incomingTimeColor: '#be123c', incomingBorderColor: '#fecdd3' },
    { key: 'orange', label: 'Orange', bubbleColor: '#F97316', textColor: '#ffffff', timeColor: '#ffedd5', incomingBubbleColor: '#ffedd5', incomingTextColor: '#9a3412', incomingTimeColor: '#c2410c', incomingBorderColor: '#fed7aa' },
    { key: 'indigo', label: 'Indigo', bubbleColor: '#6366F1', textColor: '#ffffff', timeColor: '#e0e7ff', incomingBubbleColor: '#e0e7ff', incomingTextColor: '#3730a3', incomingTimeColor: '#4338ca', incomingBorderColor: '#c7d2fe' },
    { key: 'pink', label: 'Pink', bubbleColor: '#EC4899', textColor: '#ffffff', timeColor: '#fce7f3', incomingBubbleColor: '#fce7f3', incomingTextColor: '#9d174d', incomingTimeColor: '#be185d', incomingBorderColor: '#fbcfe8' },
];

const withHexAlpha = (hexColor: string, alpha: number): string => {
    const normalized = hexColor.replace('#', '');
    const expanded = normalized.length === 3 ? normalized.split('').map((ch) => ch + ch).join('') : normalized;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return hexColor;
    const clampedAlpha = Math.min(1, Math.max(0, alpha));
    const alphaHex = Math.round(clampedAlpha * 255).toString(16).padStart(2, '0');
    return `#${expanded}${alphaHex}`;
};

type Nav = StackNavigationProp<RootStackParamList, 'ProjectChat'>;
type Route = RouteProp<RootStackParamList, 'ProjectChat'>;
type GroupedReaction = { count: number; hasCurrentUser: boolean };

const PROJECT_POLL_PREFIX = '__poll__:';

type ProjectPollPayload = {
    question: string;
    options: string[];
    allowsMultiple?: boolean;
    createdBy?: string;
    createdAt?: string;
};

type PollVoter = { id: string; name: string; avatarUrl?: string };

type PollVotesSheetState = {
    messageId: string;
    question: string;
    options: string[];
    counts: number[];
    totalVotes: number;
    votersByOption: PollVoter[][];
};

const parseProjectPollPayload = (content?: string): ProjectPollPayload | null => {
    if (!content?.startsWith(PROJECT_POLL_PREFIX)) return null;
    try {
        const payload = JSON.parse(content.slice(PROJECT_POLL_PREFIX.length));
        if (!payload?.question || !Array.isArray(payload?.options) || payload.options.length < 2) return null;
        return payload as ProjectPollPayload;
    } catch {
        return null;
    }
};

export default function ProjectChatScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<Route>();
    const { chatId, teamName } = route.params;
    const { isDark } = useTheme();
    const { user, profile } = useAuth();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);

    const [messages, setMessages] = useState<ProjectChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [reactions, setReactions] = useState<Map<string, MessageReaction[]>>(new Map());
    const [showChatOptions, setShowChatOptions] = useState(false);
    const [showMessageOptions, setShowMessageOptions] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<ProjectChatMessage | null>(null);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [chatTheme, setChatTheme] = useState<ChatTheme>(CHAT_THEMES[0]);
    const [showThemePicker, setShowThemePicker] = useState(false);
    const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
    const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
    const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
    const [showCreatePoll, setShowCreatePoll] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
    const [isCreatingPoll, setIsCreatingPoll] = useState(false);
    const [pollVotesSheet, setPollVotesSheet] = useState<PollVotesSheetState | null>(null);
    const listRef = useRef<FlatList>(null);
    const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSignalAtRef = useRef(0);
    const reactionChoices = ['👍', '❤️', '😂', '😮', '😢', '👏'];
    const TYPING_IDLE_MS = 2200;
    const TYPING_HEARTBEAT_MS = 1400;

    const [confirmDialog, setConfirmDialog] = useState<{
        visible: boolean; title: string; message: string; onConfirm: () => void;
    }>({ visible: false, title: '', message: '', onConfirm: () => { } });

    // Load saved chat theme
    useEffect(() => {
        AsyncStorage.getItem(CHAT_THEME_KEY).then((val) => {
            if (val) { const found = CHAT_THEMES.find((t) => t.key === val); if (found) setChatTheme(found); }
        });
    }, []);

    const selectChatTheme = (theme: ChatTheme) => {
        setChatTheme(theme); AsyncStorage.setItem(CHAT_THEME_KEY, theme.key); setShowThemePicker(false);
        Toast.show({ type: 'success', text1: `${theme.label} theme applied` });
    };

    const headerChromeColor = useMemo(() => withHexAlpha(chatTheme.bubbleColor, 0.16), [chatTheme.bubbleColor]);
    const headerChromeBorder = useMemo(() => withHexAlpha(chatTheme.bubbleColor, 0.35), [chatTheme.bubbleColor]);
    const composerBorderColor = useMemo(() => withHexAlpha(chatTheme.bubbleColor, 0.3), [chatTheme.bubbleColor]);

    // ===== TYPING INDICATORS =====
    const clearTypingStopTimeout = () => {
        if (typingStopTimeoutRef.current) { clearTimeout(typingStopTimeoutRef.current); typingStopTimeoutRef.current = null; }
    };

    const stopTypingSignal = useCallback(async () => {
        clearTypingStopTimeout();
        if (!chatId || !user?.id) return;
        await removeProjectTyping(chatId, user.id);
    }, [chatId, user?.id]);

    const sendTypingSignal = useCallback(() => {
        if (!chatId || !user?.id) return;
        const now = Date.now();
        if (now - lastTypingSignalAtRef.current >= TYPING_HEARTBEAT_MS) {
            lastTypingSignalAtRef.current = now;
            setProjectTyping(chatId, user.id).catch(() => { });
        }
        clearTypingStopTimeout();
        typingStopTimeoutRef.current = setTimeout(() => { stopTypingSignal().catch(() => { }); }, TYPING_IDLE_MS);
    }, [chatId, user?.id, stopTypingSignal]);

    // Subscribe to typing indicators
    useEffect(() => {
        if (!chatId || !user?.id) { setTypingUserIds([]); return; }

        const typingChannel = subscribeToProjectTyping(chatId, (ids) => {
            setTypingUserIds(ids.filter((id) => id !== user?.id));
        });

        return () => {
            setTypingUserIds([]);
            clearTypingStopTimeout();
            stopTypingSignal().catch(() => { });
            supabase.removeChannel(typingChannel);
        };
    }, [chatId, user?.id, stopTypingSignal]);

    useEffect(() => {
        return () => { clearTypingStopTimeout(); stopTypingSignal().catch(() => { }); };
    }, [stopTypingSignal]);

    const typingDisplayNames = useMemo(() => {
        if (!typingUserIds.length) return [] as string[];
        const names = typingUserIds.map((typingUserId) => {
            const match = messages.find((msg) => msg.sender_id === typingUserId && !!msg.sender?.full_name);
            return match?.sender?.full_name || 'Someone';
        });
        return Array.from(new Set(names));
    }, [typingUserIds, messages]);

    const typingLabel = useMemo(() => {
        if (!typingDisplayNames.length) return null;
        if (typingDisplayNames.length === 1) return `${typingDisplayNames[0]} is typing...`;
        if (typingDisplayNames.length === 2) return `${typingDisplayNames[0]} and ${typingDisplayNames[1]} are typing...`;
        return `${typingDisplayNames[0]}, ${typingDisplayNames[1]} and others are typing...`;
    }, [typingDisplayNames]);

    // Keep presence online while screen is focused
    useFocusEffect(
        useCallback(() => {
            if (!user?.id) return;
            updateUserStatus(user.id, 'online').catch(() => { });
            return () => { updateUserStatus(user.id, 'away').catch(() => { }); };
        }, [user?.id])
    );

    // ===== DATA LOADING =====
    const loadMessages = useCallback(async () => {
        if (!chatId) return;
        try {
            const msgs = await getProjectChatMessages(chatId);
            setMessages(msgs);
            if (msgs.length > 0) {
                const reactionsMap = await getProjectMessageReactions(msgs.map(m => m.id));
                setReactions(reactionsMap);
            }
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to load messages', text2: e?.message });
        } finally { setIsLoading(false); }
    }, [chatId]);

    useEffect(() => {
        loadMessages();
        const subscription = subscribeToProjectChatMessages(chatId, (newMsg) => {
            setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        });
        return () => { subscription?.unsubscribe?.(); };
    }, [chatId, loadMessages]);

    useEffect(() => {
        if (messages.length > 0 && !showMessageSearch) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
    }, [messages.length, showMessageSearch]);

    // ===== SEND / DELETE =====
    const handleSend = async () => {
        const content = messageText.trim();
        if (!content || isSending || !user?.id) return;
        setMessageText(''); setIsSending(true);
        clearTypingStopTimeout(); stopTypingSignal().catch(() => { });
        try { await sendProjectChatMessage(chatId, user.id, content); }
        catch (e: any) { Toast.show({ type: 'error', text1: 'Failed to send', text2: e?.message }); setMessageText(content); }
        finally { setIsSending(false); }
    };

    const handleDeleteMessage = (messageId: string) => {
        setConfirmDialog({
            visible: true, title: 'Delete Message', message: 'Delete this message? This cannot be undone.',
            onConfirm: async () => {
                try { await deleteProjectChatMessage(messageId); setMessages((prev) => prev.filter((msg) => msg.id !== messageId)); Toast.show({ type: 'success', text1: 'Message deleted' }); }
                catch (error: any) { Toast.show({ type: 'error', text1: 'Failed to delete', text2: error?.message }); }
            },
        });
    };

    const handleMessageLongPress = (message: ProjectChatMessage) => {
        if (!user?.id) return;
        if (message.sender_id !== user.id) { openReactionPicker(message.id); return; }
        setSelectedMessage(message); setShowMessageOptions(true);
    };

    // ===== SEARCH =====
    const filteredMessages = useMemo(() => {
        if (!showMessageSearch || !messageSearchQuery.trim()) return messages;
        const query = messageSearchQuery.trim().toLowerCase();
        return messages.filter((msg) => (msg.content || '').toLowerCase().includes(query));
    }, [messages, messageSearchQuery, showMessageSearch]);

    // ===== DATE LABELS =====
    const getDateLabel = (isoDate: string) => {
        const date = new Date(isoDate); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).getTime();
        if (dateOnly === todayOnly) return 'Today';
        if (dateOnly === yesterdayOnly) return 'Yesterday';
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    // ===== REACTIONS =====
    const getGroupedReactions = (messageId: string): Record<string, GroupedReaction> => {
        const rxns = reactions.get(messageId) || [];
        const grouped: Record<string, GroupedReaction> = {};
        for (const r of rxns) {
            if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, hasCurrentUser: false };
            grouped[r.emoji].count += 1;
            if (r.user_id === user?.id) grouped[r.emoji].hasCurrentUser = true;
        }
        return grouped;
    };

    const openReactionPicker = (messageId: string) => { setReactionTargetMessageId(messageId); setReactionPickerVisible(true); };

    const upsertLocalReaction = (messageId: string, emoji: string) => {
        setReactions((prev) => {
            const next = new Map(prev); const list = [...(next.get(messageId) || [])];
            if (!list.some((r) => r.user_id === user?.id && r.emoji === emoji)) {
                list.push({ id: `local-${Date.now()}`, message_id: messageId, user_id: user?.id || '', emoji, created_at: new Date().toISOString() });
                next.set(messageId, list);
            }
            return next;
        });
    };

    const removeLocalReaction = (messageId: string, emoji: string) => {
        setReactions((prev) => {
            const next = new Map(prev);
            const list = (next.get(messageId) || []).filter((r) => !(r.user_id === user?.id && r.emoji === emoji));
            if (list.length) next.set(messageId, list); else next.delete(messageId);
            return next;
        });
    };

    const handlePickReaction = async (emoji: string) => {
        const messageId = reactionTargetMessageId; setReactionPickerVisible(false); setReactionTargetMessageId(null);
        if (!messageId) return;
        try { await addProjectMessageReaction(messageId, emoji); upsertLocalReaction(messageId, emoji); }
        catch (error: any) { Toast.show({ type: 'error', text1: 'Failed to add reaction', text2: error?.message }); }
    };

    const toggleReaction = async (messageId: string, emoji: string) => {
        const rxns = reactions.get(messageId) || [];
        const hasMine = rxns.some((r) => r.user_id === user?.id && r.emoji === emoji);
        try {
            if (hasMine) { await removeProjectMessageReaction(messageId, emoji); removeLocalReaction(messageId, emoji); }
            else { await addProjectMessageReaction(messageId, emoji); upsertLocalReaction(messageId, emoji); }
        } catch (error: any) { Toast.show({ type: 'error', text1: 'Failed to update reaction', text2: error?.message }); }
    };

    const resolvePollVoter = useCallback((reaction: MessageReaction): PollVoter => {
        const fromReaction = reaction.user?.full_name?.trim();
        if (fromReaction) {
            return {
                id: reaction.user?.id || reaction.user_id,
                name: fromReaction,
                avatarUrl: reaction.user?.avatar_url,
            };
        }

        const fromMessages = messages.find((m) => m.sender_id === reaction.user_id && !!m.sender?.full_name)?.sender;
        if (fromMessages?.full_name) {
            return {
                id: fromMessages.id || reaction.user_id,
                name: fromMessages.full_name,
                avatarUrl: fromMessages.avatar_url,
            };
        }

        if (reaction.user_id === user?.id && (profile?.full_name || user?.email)) {
            return {
                id: user.id,
                name: profile?.full_name || user.email || 'You',
                avatarUrl: profile?.avatar_url,
            };
        }

        return { id: reaction.user_id, name: 'User' };
    }, [messages, profile?.avatar_url, profile?.full_name, user?.email, user?.id]);

    const getPollReactions = useCallback((messageId: string) => {
        const all = reactions.get(messageId) || [];
        return all.filter((r) => /^poll:\d+$/.test(r.emoji));
    }, [reactions]);

    const handlePollVote = async (messageId: string, optionIndex: number) => {
        if (!user?.id) return;
        const pollReactions = getPollReactions(messageId);
        const myPollReactions = pollReactions.filter((r) => r.user_id === user.id);
        const selectedEmoji = `poll:${optionIndex}`;
        const alreadySelected = myPollReactions.some((r) => r.emoji === selectedEmoji);

        try {
            const uniqueMyPollEmojis = Array.from(new Set(myPollReactions.map((r) => r.emoji)));
            if (uniqueMyPollEmojis.length > 0) {
                await Promise.all(uniqueMyPollEmojis.map((emoji) => removeProjectMessageReaction(messageId, emoji)));
                uniqueMyPollEmojis.forEach((emoji) => removeLocalReaction(messageId, emoji));
            }

            // Single-select poll behavior: one user can keep only one selected option.
            if (!alreadySelected) {
                await addProjectMessageReaction(messageId, selectedEmoji);
                upsertLocalReaction(messageId, selectedEmoji);
            }
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Failed to update vote', text2: error?.message });
        }
    };

    const openPollVotesSheet = (messageId: string, payload: ProjectPollPayload) => {
        const pollReactions = getPollReactions(messageId);
        const counts = payload.options.map((_, idx) => pollReactions.filter((r) => r.emoji === `poll:${idx}`).length);
        const totalVotes = counts.reduce((sum, count) => sum + count, 0);
        const votersByOption = payload.options.map((_, idx) =>
            pollReactions
                .filter((r) => r.emoji === `poll:${idx}`)
                .map((r) => resolvePollVoter(r))
        );
        setPollVotesSheet({ messageId, question: payload.question, options: payload.options, counts, totalVotes, votersByOption });
    };

    const handleCreatePoll = async () => {
        if (!user?.id || isCreatingPoll) return;
        const question = pollQuestion.trim();
        const options = pollOptions.map((o) => o.trim()).filter(Boolean);

        if (!question) {
            Toast.show({ type: 'error', text1: 'Please enter a poll question' });
            return;
        }
        if (options.length < 2) {
            Toast.show({ type: 'error', text1: 'Please add at least 2 options' });
            return;
        }

        setIsCreatingPoll(true);
        try {
            const payload: ProjectPollPayload = {
                question,
                options,
                allowsMultiple: false,
                createdBy: user.id,
                createdAt: new Date().toISOString(),
            };
            await sendProjectChatMessage(chatId, user.id, `${PROJECT_POLL_PREFIX}${JSON.stringify(payload)}`);
            setShowCreatePoll(false);
            setPollQuestion('');
            setPollOptions(['', '']);
            Toast.show({ type: 'success', text1: 'Poll posted' });
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Failed to create poll', text2: error?.message });
        } finally {
            setIsCreatingPoll(false);
        }
    };

    // ===== RENDER MESSAGE =====
    const renderMessage = ({ item: message, index }: { item: ProjectChatMessage; index: number }) => {
        const isMe = message.sender_id === user?.id;
        const prev = index > 0 ? filteredMessages[index - 1] : null;
        const showDate = index === 0 || new Date(prev?.created_at || '').toDateString() !== new Date(message.created_at).toDateString();
        const showAvatar = !isMe && (!prev || prev.sender_id !== message.sender_id);
        const senderDisplayName = isMe ? profile?.full_name || message.sender?.full_name || 'You' : message.sender?.full_name || 'Member';
        const senderAvatarUri = isMe ? profile?.avatar_url || message.sender?.avatar_url : message.sender?.avatar_url;
        const senderRole = isMe ? profile?.role || message.sender?.role : message.sender?.role;
        const time = new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const pollPayload = parseProjectPollPayload(message.content);
        const pollReactions = pollPayload ? getPollReactions(message.id) : [];
        const pollCounts = pollPayload ? pollPayload.options.map((_, idx) => pollReactions.filter((r) => r.emoji === `poll:${idx}`).length) : [];
        const pollTotalVotes = pollCounts.reduce((sum, count) => sum + count, 0);
        const selectedPollOptionIndex = pollPayload
            ? pollPayload.options.findIndex((_, idx) => pollReactions.some((r) => r.user_id === user?.id && r.emoji === `poll:${idx}`))
            : -1;
        const groupedReactions = getGroupedReactions(message.id);
        const groupedReactionEntries = Object.entries(groupedReactions).filter(([emoji]) => !emoji.startsWith('poll:'));
        const msgLen = (message.content || '').trim().length;
        const bubbleWidthStyle = msgLen <= 12 ? styles.bubbleShort : msgLen <= 40 ? styles.bubbleMedium : styles.bubbleLong;

        return (
            <View>
                {showDate && (<View style={styles.dateSeparatorContainer}><Text style={styles.dateSeparatorLabel}>{getDateLabel(message.created_at)}</Text></View>)}
                <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
                    {!isMe && (
                        <View style={styles.avatarLaneStart}>
                            {showAvatar ? <UserAvatar uri={senderAvatarUri} name={senderDisplayName} size={30} role={senderRole} showRing={false} /> : <View style={{ width: 30 }} />}
                        </View>
                    )}
                    <View style={[styles.messageBubbleWrap, bubbleWidthStyle]}>
                        <TouchableOpacity
                            style={[styles.messageBubble,
                            isMe ? [styles.myMessage, { backgroundColor: chatTheme.bubbleColor }]
                                : [styles.otherMessage, { backgroundColor: chatTheme.incomingBubbleColor, borderColor: chatTheme.incomingBorderColor }]]}
                            onLongPress={() => handleMessageLongPress(message)} delayLongPress={400} activeOpacity={0.8}>
                            {showAvatar && !isMe && (<Text style={[styles.senderName, { color: chatTheme.incomingTextColor }]} numberOfLines={1}>{senderDisplayName}</Text>)}
                            <View style={styles.messageContentWrap}>
                                {pollPayload ? (
                                    <View style={styles.pollCard}>
                                        <Text style={[styles.pollQuestion, { color: isMe ? chatTheme.textColor : chatTheme.incomingTextColor }]}>{pollPayload.question}</Text>
                                        <View style={styles.pollPromptRow}>
                                            <MaterialIcons name="check-circle-outline" size={14} color={isMe ? chatTheme.timeColor : chatTheme.incomingTimeColor} />
                                            <Text style={[styles.pollPromptText, { color: isMe ? chatTheme.timeColor : chatTheme.incomingTimeColor }]}>Select one option</Text>
                                        </View>
                                        {pollPayload.options.map((option, optionIndex) => {
                                            const count = pollCounts[optionIndex] || 0;
                                            const ratio = pollTotalVotes > 0 ? count / pollTotalVotes : 0;
                                            const isSelected = selectedPollOptionIndex === optionIndex;
                                            const optionVoters = pollReactions
                                                .filter((r) => r.emoji === `poll:${optionIndex}`)
                                                .map((r) => resolvePollVoter(r));

                                            return (
                                                <TouchableOpacity
                                                    key={`${message.id}-poll-option-${optionIndex}`}
                                                    style={styles.pollOptionRow}
                                                    onPress={() => handlePollVote(message.id, optionIndex)}
                                                    activeOpacity={0.75}
                                                >
                                                    <View style={styles.pollOptionTrackWrap}>
                                                        <View style={[styles.pollOptionProgressTrack, { width: `${Math.round(ratio * 100)}%` as any }]} />
                                                        <View style={styles.pollOptionInner}>
                                                            <View style={[styles.pollOptionIndicator, isSelected && styles.pollOptionIndicatorActive]}>
                                                                {isSelected ? <MaterialIcons name="check" size={12} color="#fff" /> : null}
                                                            </View>
                                                            <Text style={[styles.pollOptionLabel, { color: isMe ? chatTheme.textColor : chatTheme.incomingTextColor }]} numberOfLines={2}>{option}</Text>
                                                            <Text style={[styles.pollOptionCount, { color: isMe ? chatTheme.timeColor : chatTheme.incomingTimeColor }]}>{count}</Text>
                                                        </View>
                                                    </View>
                                                    {optionVoters.length > 0 && (
                                                        <View style={styles.pollVoterAvatarRow}>
                                                            {optionVoters.slice(0, 4).map((voter, voterIndex) => (
                                                                <View key={`${message.id}-poll-voter-${optionIndex}-${voter.id}-${voterIndex}`} style={[styles.pollVoterAvatarWrap, { marginLeft: voterIndex > 0 ? -6 : 0, zIndex: 5 - voterIndex }]}>
                                                                    <UserAvatar uri={voter.avatarUrl} name={voter.name} size={20} role={null} showRing={false} />
                                                                </View>
                                                            ))}
                                                            {optionVoters.length > 4 ? <Text style={[styles.pollVoterMoreLabel, { color: isMe ? chatTheme.timeColor : chatTheme.incomingTimeColor }]}>+{optionVoters.length - 4}</Text> : null}
                                                        </View>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                        <TouchableOpacity style={styles.pollViewVotesBtn} onPress={() => openPollVotesSheet(message.id, pollPayload)}>
                                            <Text style={[styles.pollViewVotesText, { color: isMe ? chatTheme.textColor : chatTheme.incomingTextColor }]}>View votes · {pollTotalVotes}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <Text style={[styles.messageText, isMe ? [styles.myMessageText, { color: chatTheme.textColor }] : [styles.otherMessageText, { color: chatTheme.incomingTextColor }]]}>
                                        {message.content}
                                    </Text>
                                )}
                            </View>
                            <View style={[styles.messageFooter, isMe ? styles.myMessageFooter : styles.otherMessageFooter]}>
                                <Text style={[styles.messageTime, isMe ? [styles.myMessageTime, { color: chatTheme.timeColor, opacity: 0.85 }] : [styles.otherMessageTime, { color: chatTheme.incomingTimeColor, opacity: 0.9 }]]}>
                                    {time}
                                </Text>
                            </View>
                        </TouchableOpacity>
                        {groupedReactionEntries.length > 0 && (
                            <View style={[styles.reactionRow, isMe ? styles.myReactionRow : styles.otherReactionRow]}>
                                {groupedReactionEntries.map(([emoji, info]) => (
                                    <TouchableOpacity key={`${message.id}-${emoji}`} style={[styles.reactionPill, info.hasCurrentUser && styles.reactionPillActive]} onPress={() => toggleReaction(message.id, emoji)}>
                                        <Text style={styles.reactionPillEmoji}>{emoji}</Text>
                                        <Text style={[styles.reactionPillCount, info.hasCurrentUser && styles.reactionPillCountActive]}>{info.count}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                    {isMe && (<View style={styles.avatarLaneEnd}><UserAvatar uri={senderAvatarUri} name={senderDisplayName} size={30} role={senderRole} showRing={false} /></View>)}
                </View>
            </View>
        );
    };

    if (isLoading) {
        return (<SafeAreaView style={styles.container}><View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.loadingText}>Loading messages...</Text></View></SafeAreaView>);
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: headerChromeColor, borderBottomColor: headerChromeBorder }]}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerMainInfo} activeOpacity={0.8}>
                    <View style={styles.groupIcon}><MaterialIcons name="group" size={20} color="#fff" /></View>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName} numberOfLines={1}>{teamName || 'Team Chat'}</Text>
                        <View style={styles.directStatusRow}>
                            <Text style={styles.headerStatus}>{typingLabel || 'Project Team Chat'}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreButton} onPress={() => setShowChatOptions(true)}>
                    <MaterialIcons name="more-vert" size={24} color={Colors.text} />
                </TouchableOpacity>
            </View>

            {/* Message Search Bar */}
            {showMessageSearch && (
                <View style={[styles.messageSearchBar, { backgroundColor: headerChromeColor, borderBottomColor: headerChromeBorder }]}>
                    <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
                    <TextInput value={messageSearchQuery} onChangeText={setMessageSearchQuery} placeholder="Search in conversation" placeholderTextColor={Colors.textSecondary} style={styles.messageSearchInput} />
                    <TouchableOpacity onPress={() => { setShowMessageSearch(false); setMessageSearchQuery(''); }}>
                        <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Messages */}
            <View style={styles.messagesContainer}>
                <FlatList ref={listRef} data={filteredMessages} keyExtractor={(item) => item.id} renderItem={renderMessage}
                    style={styles.messagesListContainer} contentContainerStyle={styles.messagesContentContainer}
                    onContentSizeChange={() => { if (!showMessageSearch) listRef.current?.scrollToEnd({ animated: false }); }}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialIcons name="chat-bubble-outline" size={64} color={Colors.textSecondary} />
                            <Text style={styles.emptyText}>{showMessageSearch ? 'No matching messages' : 'No messages yet'}</Text>
                            <Text style={styles.emptySubtext}>{showMessageSearch ? 'Try another search term' : 'Start the conversation with your team!'}</Text>
                        </View>
                    }
                />

                <KeyboardAvoidingView style={styles.composerOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                    <View style={styles.inputContainer}>
                        <View style={[styles.inputMain, { backgroundColor: Colors.surface, borderColor: composerBorderColor }]}>
                            <TouchableOpacity style={styles.pollComposerButton} onPress={() => setShowCreatePoll(true)}>
                                <MaterialIcons name="poll" size={20} color={chatTheme.bubbleColor} />
                            </TouchableOpacity>
                            <TextInput style={styles.input} value={messageText}
                                onChangeText={(text) => { setMessageText(text); if (!text.trim()) { stopTypingSignal().catch(() => { }); return; } sendTypingSignal(); }}
                                placeholder="Message your team" placeholderTextColor={Colors.textSecondary} multiline maxLength={2000} editable={!isSending} />
                        </View>
                        <TouchableOpacity style={[styles.sendButton, { backgroundColor: chatTheme.bubbleColor }, (isSending || !messageText.trim()) && styles.sendButtonDisabled]}
                            onPress={handleSend} disabled={isSending || !messageText.trim()}>
                            {isSending ? <ActivityIndicator size="small" color={chatTheme.textColor} /> : <MaterialIcons name="send" size={22} color={chatTheme.textColor} />}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
            {/* Chat Options Modal */}
            <Modal visible={showChatOptions} animationType="slide" transparent onRequestClose={() => setShowChatOptions(false)}>
                <View style={styles.modalOverlay}><View style={styles.optionsSheet}>
                    <Text style={styles.optionsTitle}>Chat options</Text>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowChatOptions(false); setShowMessageSearch((p) => !p); if (showMessageSearch) setMessageSearchQuery(''); }}>
                        <MaterialIcons name="search" size={20} color={Colors.text} /><Text style={styles.optionText}>{showMessageSearch ? 'Hide Search' : 'Search Messages'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionRow} onPress={async () => { setShowChatOptions(false); await loadMessages(); }}>
                        <MaterialIcons name="refresh" size={20} color={Colors.text} /><Text style={styles.optionText}>Refresh Conversation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowChatOptions(false); setShowThemePicker(true); }}>
                        <MaterialIcons name="palette" size={20} color={Colors.text} /><Text style={styles.optionText}>Change Chat Theme</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.optionRow, styles.optionCancel]} onPress={() => setShowChatOptions(false)}>
                        <MaterialIcons name="close" size={20} color={Colors.textSecondary} /><Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
                    </TouchableOpacity>
                </View></View>
            </Modal>

            {/* Message Options Modal */}
            <Modal visible={showMessageOptions} animationType="fade" transparent onRequestClose={() => setShowMessageOptions(false)}>
                <View style={styles.modalOverlay}><View style={styles.optionsSheet}>
                    <Text style={styles.optionsTitle}>Message options</Text>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowMessageOptions(false); if (selectedMessage) openReactionPicker(selectedMessage.id); }}>
                        <MaterialIcons name="emoji-emotions" size={20} color={Colors.text} /><Text style={styles.optionText}>Add Reaction</Text>
                    </TouchableOpacity>
                    {selectedMessage?.sender_id === user?.id && (
                        <TouchableOpacity style={styles.optionRow} onPress={() => { setShowMessageOptions(false); if (selectedMessage) handleDeleteMessage(selectedMessage.id); }}>
                            <MaterialIcons name="delete-outline" size={20} color={Colors.error} /><Text style={[styles.optionText, { color: Colors.error }]}>Delete Message</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.optionRow, styles.optionCancel]} onPress={() => setShowMessageOptions(false)}>
                        <MaterialIcons name="close" size={20} color={Colors.textSecondary} /><Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                </View></View>
            </Modal>

            {/* Reaction Picker Modal */}
            <Modal visible={reactionPickerVisible} transparent animationType="fade" onRequestClose={() => setReactionPickerVisible(false)}>
                <TouchableOpacity style={styles.centeredModalOverlay} activeOpacity={1} onPress={() => setReactionPickerVisible(false)}>
                    <View style={styles.reactionPickerSheet}><Text style={styles.optionsTitle}>React</Text>
                        <View style={styles.reactionChoiceRow}>
                            {reactionChoices.map((emoji) => (
                                <TouchableOpacity key={emoji} style={styles.reactionChoiceButton} onPress={() => handlePickReaction(emoji)}><Text style={styles.reactionChoiceText}>{emoji}</Text></TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Theme Picker Modal */}
            <Modal visible={showThemePicker} transparent animationType="slide" onRequestClose={() => setShowThemePicker(false)}>
                <View style={styles.modalOverlay}><View style={styles.optionsSheet}>
                    <Text style={styles.optionsTitle}>Chat Theme</Text>
                    <Text style={styles.themeSubtitle}>Choose a color for your chat bubbles</Text>
                    <View style={styles.themeGrid}>
                        {CHAT_THEMES.map((theme) => (
                            <TouchableOpacity key={theme.key} style={styles.themeOption} onPress={() => selectChatTheme(theme)}>
                                <View style={[styles.themeCircle, { backgroundColor: theme.bubbleColor }, chatTheme.key === theme.key && styles.themeCircleSelected]}>
                                    {chatTheme.key === theme.key && <MaterialIcons name="check" size={20} color={theme.textColor} />}
                                </View>
                                <Text style={[styles.themeLabel, chatTheme.key === theme.key && styles.themeLabelSelected]}>{theme.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.themePreview}>
                        <View style={[styles.previewBubbleOther, { backgroundColor: chatTheme.incomingBubbleColor, borderColor: chatTheme.incomingBorderColor }]}>
                            <Text style={{ color: chatTheme.incomingTextColor, fontSize: FontSizes.sm }}>Hey team! 👋</Text>
                        </View>
                        <View style={[styles.previewBubbleMine, { backgroundColor: chatTheme.bubbleColor }]}>
                            <Text style={{ color: chatTheme.textColor, fontSize: FontSizes.sm }}>Let's get started!</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={[styles.optionRow, styles.optionCancel]} onPress={() => setShowThemePicker(false)}>
                        <MaterialIcons name="close" size={20} color={Colors.textSecondary} /><Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
                    </TouchableOpacity>
                </View></View>
            </Modal>

            {/* Create Poll Modal */}
            <Modal visible={showCreatePoll} transparent animationType="slide" onRequestClose={() => setShowCreatePoll(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.pollSheet}>
                        <View style={styles.pollSheetHeader}>
                            <Text style={styles.optionsTitle}>Create Poll</Text>
                            <TouchableOpacity onPress={() => setShowCreatePoll(false)}>
                                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.pollFieldLabel}>Question</Text>
                            <TextInput
                                style={styles.pollFieldInput}
                                value={pollQuestion}
                                onChangeText={setPollQuestion}
                                placeholder="Ask your team..."
                                placeholderTextColor={Colors.textSecondary}
                                multiline
                                maxLength={180}
                            />

                            <Text style={styles.pollFieldLabel}>Options</Text>
                            {pollOptions.map((option, optionIndex) => (
                                <View key={`poll-option-input-${optionIndex}`} style={styles.pollOptionInputRow}>
                                    <TextInput
                                        style={[styles.pollFieldInput, styles.pollOptionInput]}
                                        value={option}
                                        onChangeText={(text) => {
                                            setPollOptions((prev) => {
                                                const next = [...prev];
                                                next[optionIndex] = text;
                                                return next;
                                            });
                                        }}
                                        placeholder={`Option ${optionIndex + 1}`}
                                        placeholderTextColor={Colors.textSecondary}
                                        maxLength={80}
                                    />
                                    {pollOptions.length > 2 ? (
                                        <TouchableOpacity style={styles.pollOptionRemoveBtn} onPress={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== optionIndex))}>
                                            <MaterialIcons name="remove-circle-outline" size={20} color={Colors.error} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}

                            {pollOptions.length < 6 ? (
                                <TouchableOpacity style={styles.pollAddOptionBtn} onPress={() => setPollOptions((prev) => [...prev, ''])}>
                                    <MaterialIcons name="add-circle-outline" size={18} color={chatTheme.bubbleColor} />
                                    <Text style={[styles.pollAddOptionText, { color: chatTheme.bubbleColor }]}>Add option</Text>
                                </TouchableOpacity>
                            ) : null}

                            <TouchableOpacity style={[styles.pollPostBtn, { backgroundColor: chatTheme.bubbleColor }, isCreatingPoll && styles.sendButtonDisabled]} onPress={handleCreatePoll} disabled={isCreatingPoll}>
                                {isCreatingPoll ? <ActivityIndicator size="small" color={chatTheme.textColor} /> : <Text style={[styles.pollPostBtnText, { color: chatTheme.textColor }]}>Post Poll</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Poll Votes Modal */}
            <Modal visible={!!pollVotesSheet} transparent animationType="slide" onRequestClose={() => setPollVotesSheet(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.pollSheet}>
                        <View style={styles.pollSheetHeader}>
                            <Text style={styles.optionsTitle} numberOfLines={2}>{pollVotesSheet?.question}</Text>
                            <TouchableOpacity onPress={() => setPollVotesSheet(null)}>
                                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.pollVotesMeta}>{pollVotesSheet?.totalVotes} vote{pollVotesSheet?.totalVotes === 1 ? '' : 's'}</Text>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {pollVotesSheet?.options.map((option, idx) => (
                                <View key={`poll-votes-${idx}`} style={styles.pollVotesOptionCard}>
                                    <View style={styles.pollVotesOptionHeader}>
                                        <Text style={styles.pollVotesOptionTitle}>{option}</Text>
                                        <Text style={styles.pollVotesOptionCount}>{pollVotesSheet?.counts[idx] || 0}</Text>
                                    </View>
                                    {pollVotesSheet?.votersByOption[idx]?.length ? (
                                        pollVotesSheet.votersByOption[idx].map((voter, voterIndex) => (
                                            <View key={`poll-voter-${idx}-${voter.id}-${voterIndex}`} style={styles.pollVoterRow}>
                                                <UserAvatar uri={voter.avatarUrl} name={voter.name} size={24} role={null} showRing={false} />
                                                <Text style={styles.pollVoterName}>{voter.name}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={styles.pollNoVotesText}>No votes yet</Text>
                                    )}
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <ConfirmDialog visible={confirmDialog.visible} title={confirmDialog.title} message={confirmDialog.message}
                onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog({ ...confirmDialog, visible: false }); }}
                onCancel={() => setConfirmDialog({ ...confirmDialog, visible: false })} />
        </SafeAreaView>
    );
}

const createStyles = (Colors: any) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: Colors.background },
        loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
        loadingText: { fontSize: FontSizes.md, color: Colors.textSecondary },
        header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
        backButton: { padding: 6 },
        headerMainInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
        groupIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
        headerInfo: { flex: 1 },
        headerName: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.text },
        directStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
        headerStatus: { fontSize: FontSizes.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
        moreButton: { padding: 6 },
        messageSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
        messageSearchInput: { flex: 1, color: Colors.text, fontSize: FontSizes.sm },
        messagesContainer: { flex: 1 },
        messagesListContainer: { flex: 1, backgroundColor: 'transparent' },
        messagesContentContainer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 120 },
        composerOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
        messageWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, width: '100%' },
        myMessageWrapper: { justifyContent: 'flex-end' },
        otherMessageWrapper: { justifyContent: 'flex-start' },
        avatarLaneStart: { width: 34, marginRight: 8, alignItems: 'flex-end', justifyContent: 'flex-end' },
        avatarLaneEnd: { width: 34, marginLeft: 8, alignItems: 'flex-start', justifyContent: 'flex-end' },
        dateSeparatorContainer: { alignItems: 'center', marginBottom: Spacing.sm, marginTop: Spacing.sm },
        dateSeparatorLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, overflow: 'hidden', fontWeight: FontWeights.medium },
        messageBubbleWrap: { width: 'auto', maxWidth: '84%' },
        bubbleShort: { maxWidth: '42%' },
        bubbleMedium: { maxWidth: '64%' },
        bubbleLong: { maxWidth: '82%' },
        messageBubble: { maxWidth: '100%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, ...Shadows.sm },
        myMessage: { backgroundColor: Colors.primary, borderBottomRightRadius: 8 },
        otherMessage: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 8 },
        senderName: { fontSize: FontSizes.xs, marginBottom: 3, fontWeight: FontWeights.semibold },
        messageContentWrap: { paddingRight: 2 },
        messageText: { fontSize: FontSizes.md, lineHeight: 21, letterSpacing: 0.1 },
        myMessageText: { color: Colors.primaryContent, textAlign: 'right' },
        otherMessageText: { color: Colors.text },
        messageFooter: { flexDirection: 'row', marginTop: 6, alignItems: 'center', gap: 6, minHeight: 20, width: '100%' },
        myMessageFooter: { justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'flex-end' },
        otherMessageFooter: { justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'flex-end' },
        messageTime: { fontSize: 10, fontWeight: FontWeights.medium, lineHeight: 14 },
        myMessageTime: { color: Colors.primaryContent, opacity: 0.8 },
        otherMessageTime: { color: Colors.textSecondary },
        reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
        myReactionRow: { justifyContent: 'flex-end' },
        otherReactionRow: { justifyContent: 'flex-start' },
        reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
        reactionPillActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}20` },
        reactionPillEmoji: { fontSize: 13 },
        reactionPillCount: { fontSize: 11, color: Colors.textSecondary, fontWeight: FontWeights.semibold },
        reactionPillCountActive: { color: Colors.primary },
        reactionPickerSheet: { width: '88%', maxWidth: 340, backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadows.md },
        reactionChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: Spacing.sm },
        reactionChoiceButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
        reactionChoiceText: { fontSize: 21 },
        inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 10 : 8, gap: 8 },
        inputMain: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 24, paddingLeft: 10, paddingRight: 8, paddingVertical: 3, ...Shadows.sm },
        pollComposerButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
        input: { flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 6, paddingVertical: 10, fontSize: FontSizes.md, color: Colors.text, maxHeight: 110 },
        sendButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadows.sm },
        sendButtonDisabled: { opacity: 0.5 },
        emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
        emptyText: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
        emptySubtext: { fontSize: FontSizes.md, color: Colors.textSecondary },
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
        centeredModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
        optionsSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.xs },
        optionsTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text, marginBottom: Spacing.xs },
        optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: Colors.card },
        optionText: { fontSize: FontSizes.md, color: Colors.text, fontWeight: FontWeights.medium },
        optionCancel: { marginTop: Spacing.xs },
        themeSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.md, marginTop: -4 },
        themeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, paddingVertical: Spacing.sm },
        themeOption: { alignItems: 'center', gap: 6, width: 64 },
        themeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', ...Shadows.sm },
        themeCircleSelected: { borderWidth: 3, borderColor: Colors.text },
        themeLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: FontWeights.medium },
        themeLabelSelected: { color: Colors.text, fontWeight: FontWeights.bold },
        themePreview: { marginTop: Spacing.md, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: Colors.background, borderRadius: BorderRadius.lg, gap: 8 },
        previewBubbleOther: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderBottomLeftRadius: 6, borderWidth: 1, maxWidth: '70%' },
        previewBubbleMine: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderBottomRightRadius: 6, maxWidth: '70%' },
        pollCard: { borderRadius: BorderRadius.md, overflow: 'hidden' },
        pollQuestion: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: 6 },
        pollPromptRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
        pollPromptText: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
        pollOptionRow: { marginTop: 6 },
        pollOptionTrackWrap: { position: 'relative', borderRadius: BorderRadius.sm, overflow: 'hidden', minHeight: 34, backgroundColor: 'rgba(255,255,255,0.18)' },
        pollOptionProgressTrack: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.24)' },
        pollOptionInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7 },
        pollOptionIndicator: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
        pollOptionIndicatorActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
        pollOptionLabel: { flex: 1, fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
        pollOptionCount: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, minWidth: 18, textAlign: 'right' },
        pollVoterAvatarRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingLeft: 30 },
        pollVoterAvatarWrap: { borderRadius: 10, borderWidth: 1.5, borderColor: Colors.surface, overflow: 'hidden' },
        pollVoterMoreLabel: { fontSize: 10, marginLeft: 4, fontWeight: FontWeights.semibold },
        pollViewVotesBtn: { marginTop: 8, alignItems: 'center', paddingTop: 2 },
        pollViewVotesText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
        pollSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.lg, maxHeight: '88%' },
        pollSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: Spacing.sm },
        pollFieldLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.textSecondary, marginBottom: 6 },
        pollFieldInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, backgroundColor: Colors.card, color: Colors.text, fontSize: FontSizes.md, paddingHorizontal: Spacing.md, paddingVertical: 10, marginBottom: Spacing.sm },
        pollOptionInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        pollOptionInput: { flex: 1 },
        pollOptionRemoveBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
        pollAddOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: Spacing.md },
        pollAddOptionText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
        pollPostBtn: { borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: Spacing.md },
        pollPostBtnText: { fontSize: FontSizes.md, fontWeight: FontWeights.bold },
        pollVotesMeta: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
        pollVotesOptionCard: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.sm },
        pollVotesOptionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
        pollVotesOptionTitle: { flex: 1, fontSize: FontSizes.sm, color: Colors.text, fontWeight: FontWeights.semibold },
        pollVotesOptionCount: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: FontWeights.bold },
        pollVoterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
        pollVoterName: { fontSize: FontSizes.sm, color: Colors.text },
        pollNoVotesText: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontStyle: 'italic', paddingVertical: 2 },
    });
