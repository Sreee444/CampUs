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
    Image,
    ImageBackground,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import ChatMessageBubble from '../../components/ChatMessageBubble';
import ConfirmDialog from '../../components/ConfirmDialog';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    updateUserStatus,
    getUserStatus,
    uploadChatAttachment,
    getChatPreference,
    setChatBackgroundImage,
    removeChatBackgroundImage,
    uploadChatBackgroundToStorage,
} from '../../api/chat';
import {
    getMentorshipMessages,
    sendMentorshipMessage,
    subscribeToMentorshipMessages,
    getMentorshipChatById,
    markMentorshipMessagesRead,
    getMentorshipSeenByOthers,
    MentorshipMessage,
    MentorshipChat,
    addMentorshipMessageReaction,
    removeMentorshipMessageReaction,
    getMentorshipMessageReactions,
    deleteMentorshipMessage,
    MessageReaction,
} from '../../api/mentorshipChat';
import * as mentorshipChatApi from '../../api/mentorshipChat';
import { supabase } from '../../api/supabase';
import { CHAT_THEME_KEY, CHAT_THEMES, ChatTheme, withHexAlpha } from '../../constants/chatThemes';

type Nav = StackNavigationProp<RootStackParamList, 'MentorshipChat'>;
type Route = RouteProp<RootStackParamList, 'MentorshipChat'>;
type GroupedReaction = { count: number; hasCurrentUser: boolean };

export default function MentorshipChatScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<Route>();
    const { chatId } = route.params;
    const { isDark } = useTheme();
    const { user, profile } = useAuth();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);

    const [chat, setChat] = useState<MentorshipChat | null>(null);
    const [messages, setMessages] = useState<MentorshipMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [selectedAttachmentUri, setSelectedAttachmentUri] = useState<string | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [reactions, setReactions] = useState<Map<string, MessageReaction[]>>(new Map());
    const [showChatOptions, setShowChatOptions] = useState(false);
    const [showMessageOptions, setShowMessageOptions] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<MentorshipMessage | null>(null);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [chatTheme, setChatTheme] = useState<ChatTheme>(CHAT_THEMES[0]);
    const [showThemePicker, setShowThemePicker] = useState(false);
    const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
    const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
    const [isLoadingBackground, setIsLoadingBackground] = useState(false);
    const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
    const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
    const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
    const [directPartnerStatus, setDirectPartnerStatus] = useState<'online' | 'away' | 'offline' | null>(null);
    const [seenByOthersMap, setSeenByOthersMap] = useState<Map<string, number>>(new Map());
    const listRef = useRef<FlatList>(null);
    const messageInputRef = useRef<TextInput | null>(null);
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
            if (val) {
                const found = CHAT_THEMES.find((t) => t.key === val);
                if (found) setChatTheme(found);
            }
        });
    }, []);

    // Load chat background preference
    useEffect(() => {
        if (!chatId || !user?.id) return;

        const loadBackground = async () => {
            try {
                const preference = (await getChatPreference(user.id, chatId)) as
                    | { background_image_url?: string | null }
                    | null;
                if (preference?.background_image_url) {
                    setBackgroundImageUrl(preference.background_image_url);
                }
            } catch (error) {
                console.error('Failed to load background preference:', error);
            }
        };

        loadBackground();
    }, [chatId, user?.id]);

    const selectChatTheme = (theme: ChatTheme) => {
        setChatTheme(theme);
        AsyncStorage.setItem(CHAT_THEME_KEY, theme.key);
        setShowThemePicker(false);
        Toast.show({ type: 'success', text1: `${theme.label} theme applied` });
    };

    const handlePickBackgroundImage = async () => {
        const previousBackgroundImage = backgroundImageUrl;

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [9, 16],
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0] && user?.id) {
                const asset = result.assets[0];
                const fileName = `bg-${Date.now()}.jpg`;

                // Show the chosen image immediately for faster perceived response.
                setBackgroundImageUrl(asset.uri);
                setShowBackgroundPicker(false);
                setIsLoadingBackground(true);

                const imageUrl = await uploadChatBackgroundToStorage(user.id, chatId, asset.uri, fileName);
                await setChatBackgroundImage(user.id, chatId, imageUrl, fileName);
                setBackgroundImageUrl(imageUrl);
                Toast.show({ type: 'success', text1: 'Background updated', text2: 'Custom background applied' });
            }
        } catch (error: any) {
            console.error('Failed to set background:', error);
            setBackgroundImageUrl(previousBackgroundImage);
            Toast.show({ type: 'error', text1: 'Failed to set background', text2: error?.message || 'Try again' });
        } finally {
            setIsLoadingBackground(false);
        }
    };

    const handleRemoveBackground = async () => {
        if (!user?.id) return;

        try {
            setIsLoadingBackground(true);
            await removeChatBackgroundImage(user.id, chatId);
            setBackgroundImageUrl(null);
            setShowBackgroundPicker(false);
            Toast.show({ type: 'success', text1: 'Background removed' });
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Failed to remove background', text2: error?.message || 'Try again' });
        } finally {
            setIsLoadingBackground(false);
        }
    };

    const headerChromeColor = useMemo(
        () => withHexAlpha(chatTheme.bubbleColor, backgroundImageUrl ? 0.28 : 0.16),
        [chatTheme.bubbleColor, backgroundImageUrl]
    );
    const headerChromeBorder = useMemo(() => withHexAlpha(chatTheme.bubbleColor, 0.35), [chatTheme.bubbleColor]);
    const composerBorderColor = useMemo(() => withHexAlpha(chatTheme.bubbleColor, 0.3), [chatTheme.bubbleColor]);

    // ===== TYPING INDICATORS =====
    const clearTypingStopTimeout = () => {
        if (typingStopTimeoutRef.current) { clearTimeout(typingStopTimeoutRef.current); typingStopTimeoutRef.current = null; }
    };

    const stopTypingSignal = useCallback(async () => {
        clearTypingStopTimeout();
        if (!chatId || !user?.id) return;
        if (typeof mentorshipChatApi.removeMentorshipTyping === 'function') {
            await mentorshipChatApi.removeMentorshipTyping(chatId, user.id);
        }
    }, [chatId, user?.id]);

    const sendTypingSignal = useCallback(() => {
        if (!chatId || !user?.id) return;
        const now = Date.now();
        if (now - lastTypingSignalAtRef.current >= TYPING_HEARTBEAT_MS) {
            lastTypingSignalAtRef.current = now;
            if (typeof mentorshipChatApi.setMentorshipTyping === 'function') {
                mentorshipChatApi.setMentorshipTyping(chatId, user.id).catch(() => { });
            }
        }
        clearTypingStopTimeout();
        typingStopTimeoutRef.current = setTimeout(() => { stopTypingSignal().catch(() => { }); }, TYPING_IDLE_MS);
    }, [chatId, user?.id, stopTypingSignal]);

    // Subscribe to typing indicators
    useEffect(() => {
        if (!chatId || !user?.id) { setTypingUserIds([]); return; }

        if (typeof mentorshipChatApi.subscribeToMentorshipTyping !== 'function') {
            setTypingUserIds([]);
            return;
        }

        const typingChannel = mentorshipChatApi.subscribeToMentorshipTyping(chatId, (ids) => {
            setTypingUserIds(ids.filter((id) => id !== user.id));
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

    const isDirectPartnerTyping = typingUserIds.length > 0;

    // ===== PARTNER ONLINE STATUS =====
    const normalizePresenceStatus = (status?: string | null, updatedAt?: string | null) => {
        const fallback: 'online' | 'away' | 'offline' = 'offline';
        const nextStatus = (status as 'online' | 'away' | 'offline' | null) || fallback;
        if (nextStatus === 'offline') return fallback;
        const PRESENCE_STALE_MS = 2 * 60 * 1000;
        const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
        const isFresh = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= PRESENCE_STALE_MS;
        return isFresh ? nextStatus : fallback;
    };

    const getPartnerId = (): string | null => {
        if (!chat || !user?.id) return null;
        const mentee = chat.mentorship?.mentee;
        const mentor = chat.mentorship?.mentor?.user;
        if (user.id === mentee?.id) return mentor?.id || null;
        return mentee?.id || null;
    };

    const partnerId = useMemo(() => getPartnerId(), [chat, user?.id]);

    // Keep presence online while screen is focused
    useFocusEffect(
        useCallback(() => {
            if (!user?.id) return;
            updateUserStatus(user.id, 'online').catch(() => { });
            return () => { updateUserStatus(user.id, 'away').catch(() => { }); };
        }, [user?.id])
    );

    // Load and subscribe to partner status
    useEffect(() => {
        if (!partnerId) { setDirectPartnerStatus(null); return; }
        let isMounted = true;

        const loadStatus = async () => {
            try {
                const statusData: any = await getUserStatus(partnerId);
                if (isMounted) setDirectPartnerStatus(normalizePresenceStatus(statusData?.status, statusData?.status_updated_at));
            } catch { if (isMounted) setDirectPartnerStatus(null); }
        };

        loadStatus();
        const statusPoll = setInterval(loadStatus, 30 * 1000);

        const statusChannel = supabase
            .channel(`mentor-partner-status-${partnerId}-${Date.now()}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${partnerId}` },
                (payload: any) => {
                    if (!isMounted) return;
                    const nextStatus = normalizePresenceStatus(payload?.new?.status, payload?.new?.status_updated_at);
                    if (nextStatus) setDirectPartnerStatus(nextStatus);
                }
            ).subscribe();

        return () => {
            isMounted = false;
            clearInterval(statusPoll);
            supabase.removeChannel(statusChannel);
        };
    }, [partnerId]);

    // ===== DATA LOADING =====
    const loadData = useCallback(async () => {
        if (!chatId) return;
        try {
            const [chatData, msgs] = await Promise.all([getMentorshipChatById(chatId), getMentorshipMessages(chatId)]);
            setChat(chatData);
            setMessages(msgs);
            if (msgs.length > 0) {
                const reactionsMap = await getMentorshipMessageReactions(msgs.map(m => m.id));
                setReactions(reactionsMap);
            }
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to load chat', text2: e?.message });
        } finally { setIsLoading(false); }
    }, [chatId]);

    useEffect(() => {
        loadData();
        const subscription = subscribeToMentorshipMessages(chatId, (event) => {
            if (event.type === 'insert') {
                setMessages((prev) => prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message]);
            }
        });
        return () => { subscription?.unsubscribe?.(); };
    }, [chatId, loadData]);

    useEffect(() => {
        const syncSeenState = async () => {
            if (!user?.id || messages.length === 0) return;

            const incomingIds = messages.filter((m) => m.sender_id !== user.id).map((m) => m.id);
            const outgoingIds = messages.filter((m) => m.sender_id === user.id).map((m) => m.id);

            try {
                if (incomingIds.length > 0) {
                    await markMentorshipMessagesRead(incomingIds, user.id);
                }
                if (outgoingIds.length > 0) {
                    const seenCounts = await getMentorshipSeenByOthers(outgoingIds, user.id);
                    setSeenByOthersMap(seenCounts);
                } else {
                    setSeenByOthersMap(new Map());
                }
            } catch {
                // Read receipts are optional; keep chat usable even if table/policy is missing.
            }
        };

        syncSeenState();
    }, [messages, user?.id]);

    useEffect(() => {
        if (messages.length > 0 && !showMessageSearch) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
    }, [messages.length, showMessageSearch]);

    // ===== HELPERS =====
    const getChatTitle = (): string => {
        if (!chat) return 'Chat';
        const mentee = chat.mentorship?.mentee;
        const mentor = chat.mentorship?.mentor?.user;
        if (user?.id === mentee?.id) return mentor?.full_name || 'Mentor';
        return mentee?.full_name || 'Student';
    };

    const getChatAvatar = (): string | undefined => {
        if (!chat) return undefined;
        const mentee = chat.mentorship?.mentee;
        const mentor = chat.mentorship?.mentor?.user;
        if (user?.id === mentee?.id) return mentor?.avatar_url;
        return mentee?.avatar_url;
    };

    const getChatRole = (): string | undefined => {
        if (!chat) return undefined;
        const mentee = chat.mentorship?.mentee;
        const mentor = chat.mentorship?.mentor?.user;
        if (user?.id === mentee?.id) return mentor?.role;
        return mentee?.role;
    };

    // ===== SEND / DELETE =====
    const handleSend = async () => {
        const content = messageText.trim();
        const hasAttachment = !!selectedAttachmentUri;
        if ((!content && !hasAttachment) || isSending || isUploadingAttachment || !user?.id) return;
        setMessageText(''); setIsSending(true);
        clearTypingStopTimeout(); stopTypingSignal().catch(() => { });
        try {
            if (selectedAttachmentUri) {
                setIsUploadingAttachment(true);
                const attachmentUrl = await uploadChatAttachment(user.id, selectedAttachmentUri);
                await sendMentorshipMessage(chatId, content, 'image', attachmentUrl);
                setSelectedAttachmentUri(null);
            } else {
                await sendMentorshipMessage(chatId, content, 'text');
            }
        }
        catch (e: any) { Toast.show({ type: 'error', text1: 'Failed to send', text2: e?.message }); setMessageText(content); }
        finally { setIsUploadingAttachment(false); setIsSending(false); }
    };

    const handlePickAttachment = async () => {
        if (!user?.id || isSending || isUploadingAttachment) return;
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
            Toast.show({ type: 'error', text1: 'Photo permission required' });
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsMultipleSelection: false,
        });

        if (result.canceled || !result.assets?.length) return;
        setSelectedAttachmentUri(result.assets[0].uri);
    };

    const handleDeleteMessage = (messageId: string) => {
        setConfirmDialog({
            visible: true, title: 'Delete Message', message: 'Delete this message? This cannot be undone.',
            onConfirm: async () => {
                try { await deleteMentorshipMessage(messageId); setMessages((prev) => prev.filter((msg) => msg.id !== messageId)); Toast.show({ type: 'success', text1: 'Message deleted' }); }
                catch (error: any) { Toast.show({ type: 'error', text1: 'Failed to delete', text2: error?.message }); }
            },
        });
    };

    const handleMessageLongPress = (message: MentorshipMessage) => {
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
        try { await addMentorshipMessageReaction(messageId, emoji); upsertLocalReaction(messageId, emoji); }
        catch (error: any) { Toast.show({ type: 'error', text1: 'Failed to add reaction', text2: error?.message }); }
    };

    const toggleReaction = async (messageId: string, emoji: string) => {
        const rxns = reactions.get(messageId) || [];
        const hasMine = rxns.some((r) => r.user_id === user?.id && r.emoji === emoji);
        try {
            if (hasMine) { await removeMentorshipMessageReaction(messageId, emoji); removeLocalReaction(messageId, emoji); }
            else { await addMentorshipMessageReaction(messageId, emoji); upsertLocalReaction(messageId, emoji); }
        } catch (error: any) { Toast.show({ type: 'error', text1: 'Failed to update reaction', text2: error?.message }); }
    };

    // ===== RENDER MESSAGE =====
    const renderMessage = ({ item: message, index }: { item: MentorshipMessage; index: number }) => {
        const isMe = message.sender_id === user?.id;
        const rawType = (message as any)?.message_type ?? (message as any)?.type;
        const normalizedType = typeof rawType === 'string' ? rawType.toLowerCase() : '';
        const isImageMessage = !!message.attachment_url && (normalizedType === 'image' || !normalizedType);
        const imageCaptionRaw = (message.content || '').trim();
        const imageCaption = imageCaptionRaw === 'Unable to decrypt message' ? '' : imageCaptionRaw;
        const prev = index > 0 ? filteredMessages[index - 1] : null;
        const showDate = index === 0 || new Date(prev?.created_at || '').toDateString() !== new Date(message.created_at).toDateString();
        const senderDisplayName = isMe ? profile?.full_name || message.sender?.full_name || 'You' : message.sender?.full_name || 'Member';
        const senderAvatarUri = isMe ? profile?.avatar_url || message.sender?.avatar_url : message.sender?.avatar_url;
        const senderRole = isMe ? profile?.role || message.sender?.role : message.sender?.role;
        const time = new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const groupedReactions = getGroupedReactions(message.id);
        const seenByCount = isMe ? (seenByOthersMap.get(message.id) || 0) : 0;
        const seenStatus = seenByCount > 0 ? 'read' : 'sent';

        return (
            <View>
                {showDate && (<View style={styles.dateSeparatorContainer}><Text style={styles.dateSeparatorLabel}>{getDateLabel(message.created_at)}</Text></View>)}
                <ChatMessageBubble
                    messageId={message.id}
                    content={message.content}
                    isMe={isMe}
                    time={time}
                    chatTheme={chatTheme}
                    showSender={!isMe}
                    senderName={senderDisplayName}
                    senderAvatar={senderAvatarUri}
                    senderRole={senderRole}
                    seenStatus={seenStatus}
                    showTicks={isMe}
                    isImage={isImageMessage}
                    attachmentUrl={message.attachment_url}
                    imageCaption={imageCaption}
                    onImagePress={(url) => setImagePreviewUrl(url)}
                    reactions={groupedReactions}
                    onReactionPress={(emoji) => toggleReaction(message.id, emoji)}
                    onLongPress={() => handleMessageLongPress(message)}
                />
            </View>
        );
    };

    if (isLoading) {
        return (<SafeAreaView style={styles.container}><View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.loadingText}>Loading messages...</Text></View></SafeAreaView>);
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: headerChromeColor }]}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerMainInfo} activeOpacity={0.8}
                    onPress={() => { if (partnerId) navigation.navigate('PublicProfile', { userId: partnerId }); }}>
                    <UserAvatar uri={getChatAvatar()} name={getChatTitle()} size={38} role={getChatRole()} showRing={false} />
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName} numberOfLines={1}>{getChatTitle()}</Text>
                        <View style={styles.directStatusRow}>
                            {!isDirectPartnerTyping && directPartnerStatus === 'online' && <View style={styles.onlineDot} />}
                            <Text style={styles.headerStatus}>
                                {isDirectPartnerTyping ? 'Typing...'
                                    : directPartnerStatus === 'online' ? 'Online'
                                        : chat?.mentorship?.purpose ? `${chat.mentorship.purpose} mentorship`
                                            : 'Mentorship Chat'}
                            </Text>
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
            <ImageBackground
                source={backgroundImageUrl ? { uri: backgroundImageUrl } : undefined}
                style={styles.messagesContainer}
                imageStyle={styles.backgroundImage}
            >
                <FlatList ref={listRef} data={filteredMessages} keyExtractor={(item) => item.id} renderItem={renderMessage}
                    style={styles.messagesListContainer} contentContainerStyle={styles.messagesContentContainer}
                    onContentSizeChange={() => { if (!showMessageSearch) listRef.current?.scrollToEnd({ animated: false }); }}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MaterialIcons name="chat-bubble-outline" size={64} color={Colors.textSecondary} />
                            <Text style={styles.emptyText}>{showMessageSearch ? 'No matching messages' : 'No messages yet'}</Text>
                            <Text style={styles.emptySubtext}>{showMessageSearch ? 'Try another search term' : 'Say hello to start the conversation!'}</Text>
                        </View>
                    }
                />

                <KeyboardAvoidingView style={styles.composerOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                    <View style={styles.inputContainer}>
                        {!!selectedAttachmentUri && (
                            <View style={styles.attachmentPreviewRow}>
                                <Image source={{ uri: selectedAttachmentUri }} style={styles.attachmentPreviewImage} />
                                <TouchableOpacity style={styles.attachmentRemoveBtn} onPress={() => setSelectedAttachmentUri(null)}>
                                    <MaterialIcons name="close" size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}
                        <View style={[styles.inputMain, { backgroundColor: backgroundImageUrl ? withHexAlpha(Colors.surface, 0.88) : Colors.surface, borderColor: composerBorderColor }]}>
                            <TouchableOpacity
                                style={[styles.attachBtn, (isUploadingAttachment || isSending) && styles.attachBtnDisabled]}
                                onPress={handlePickAttachment}
                                disabled={isUploadingAttachment || isSending}
                            >
                                {isUploadingAttachment
                                    ? <ActivityIndicator size="small" color={Colors.textSecondary} />
                                    : <MaterialIcons name="attach-file" size={20} color={Colors.textSecondary} />}
                            </TouchableOpacity>
                            <TextInput ref={messageInputRef} style={styles.input} value={messageText}
                                onChangeText={(text) => { setMessageText(text); if (!text.trim() && !selectedAttachmentUri) { stopTypingSignal().catch(() => { }); return; } sendTypingSignal(); }}
                                placeholder="Type a message" placeholderTextColor={Colors.textSecondary} multiline maxLength={2000} editable={!isSending} />
                        </View>
                        <TouchableOpacity
                            style={[
                                styles.sendButton,
                                { backgroundColor: chatTheme.bubbleColor },
                                (isSending || isUploadingAttachment || (!messageText.trim() && !selectedAttachmentUri)) && styles.sendButtonDisabled,
                            ]}
                            onPress={handleSend}
                            disabled={isSending || isUploadingAttachment || (!messageText.trim() && !selectedAttachmentUri)}
                        >
                            {isSending ? <ActivityIndicator size="small" color={chatTheme.textColor} /> : <MaterialIcons name="send" size={22} color={chatTheme.textColor} />}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </ImageBackground>
            {/* Chat Options Modal */}
            <Modal visible={showChatOptions} animationType="slide" transparent onRequestClose={() => setShowChatOptions(false)}>
                <View style={styles.modalOverlay}><View style={styles.optionsSheet}>
                    <Text style={styles.optionsTitle}>Chat options</Text>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowChatOptions(false); setShowMessageSearch((p) => !p); if (showMessageSearch) setMessageSearchQuery(''); }}>
                        <MaterialIcons name="search" size={20} color={Colors.text} /><Text style={styles.optionText}>{showMessageSearch ? 'Hide Search' : 'Search Messages'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowChatOptions(false); if (partnerId) navigation.navigate('PublicProfile', { userId: partnerId }); }}>
                        <MaterialIcons name="person-outline" size={20} color={Colors.text} /><Text style={styles.optionText}>View Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionRow} onPress={async () => { setShowChatOptions(false); await loadData(); }}>
                        <MaterialIcons name="refresh" size={20} color={Colors.text} /><Text style={styles.optionText}>Refresh Conversation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowChatOptions(false); setShowThemePicker(true); }}>
                        <MaterialIcons name="palette" size={20} color={Colors.text} /><Text style={styles.optionText}>Change Chat Theme</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionRow} onPress={() => { setShowChatOptions(false); setShowBackgroundPicker(true); }}>
                        <MaterialIcons name="image" size={20} color={Colors.text} /><Text style={styles.optionText}>Chat Background</Text>
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
                            <Text style={{ color: chatTheme.incomingTextColor, fontSize: FontSizes.sm }}>Hey there! 👋</Text>
                        </View>
                        <View style={[styles.previewBubbleMine, { backgroundColor: chatTheme.bubbleColor }]}>
                            <Text style={{ color: chatTheme.textColor, fontSize: FontSizes.sm }}>Hello! How are you?</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={[styles.optionRow, styles.optionCancel]} onPress={() => setShowThemePicker(false)}>
                        <MaterialIcons name="close" size={20} color={Colors.textSecondary} /><Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
                    </TouchableOpacity>
                </View></View>
            </Modal>

            {/* Chat Background Picker */}
            <Modal visible={showBackgroundPicker} transparent animationType="slide" onRequestClose={() => setShowBackgroundPicker(false)}>
                <View style={styles.modalOverlay}><View style={styles.optionsSheet}>
                    <Text style={styles.optionsTitle}>Chat Background</Text>
                    <Text style={styles.themeSubtitle}>Customize your chat background</Text>
                    {backgroundImageUrl && (
                        <View style={styles.backgroundPreview}>
                            <Image source={{ uri: backgroundImageUrl }} style={styles.backgroundPreviewImage} />
                            <Text style={styles.backgroundPreviewLabel}>Current Background</Text>
                        </View>
                    )}
                    <TouchableOpacity style={styles.optionRow} onPress={handlePickBackgroundImage} disabled={isLoadingBackground}>
                        <MaterialIcons name="photo-library" size={20} color={Colors.text} />
                        <Text style={styles.optionText}>{backgroundImageUrl ? 'Change Background' : 'Choose from Gallery'}</Text>
                        {isLoadingBackground && <ActivityIndicator size="small" color={Colors.primary} />}
                    </TouchableOpacity>
                    {backgroundImageUrl && (
                        <TouchableOpacity style={styles.optionRow} onPress={handleRemoveBackground} disabled={isLoadingBackground}>
                            <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
                            <Text style={[styles.optionText, { color: Colors.error }]}>Remove Background</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.optionRow, styles.optionCancel]} onPress={() => setShowBackgroundPicker(false)}>
                        <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
                        <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
                    </TouchableOpacity>
                </View></View>
            </Modal>

            <ConfirmDialog visible={confirmDialog.visible} title={confirmDialog.title} message={confirmDialog.message}
                onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog({ ...confirmDialog, visible: false }); }}
                onCancel={() => setConfirmDialog({ ...confirmDialog, visible: false })} />

            <Modal visible={!!imagePreviewUrl} transparent animationType="fade" onRequestClose={() => setImagePreviewUrl(null)}>
                <View style={styles.imagePreviewBackdrop}>
                    <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setImagePreviewUrl(null)}>
                        <MaterialIcons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.imagePreviewContainer}>
                        {!!imagePreviewUrl && (
                            <Image source={{ uri: imagePreviewUrl }} style={styles.imagePreviewImage} resizeMode="contain" />
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const createStyles = (Colors: any) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: Colors.background },
        loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
        loadingText: { fontSize: FontSizes.md, color: Colors.textSecondary },
        header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
        backButton: { padding: 4 },
        headerMainInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
        headerInfo: { flex: 1 },
        headerName: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.text },
        directStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
        onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
        headerStatus: { fontSize: FontSizes.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
        moreButton: { padding: 4 },
        messageSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
        messageSearchInput: { flex: 1, color: Colors.text, fontSize: FontSizes.sm },
        messagesContainer: { flex: 1, backgroundColor: Colors.background },
        backgroundImage: { opacity: 1 },
        messagesListContainer: { flex: 1, backgroundColor: 'transparent' },
        messagesContentContainer: { paddingHorizontal: 6, paddingTop: Spacing.sm, paddingBottom: 90 },
        composerOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
        dateSeparatorContainer: { alignItems: 'center', marginBottom: 6, marginTop: 8 },
        dateSeparatorLabel: { fontSize: 11, color: Colors.textSecondary, backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', fontWeight: '500', borderWidth: 1, borderColor: Colors.border },
        reactionPickerSheet: { width: '88%', maxWidth: 340, backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: Spacing.md },
        reactionChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: Spacing.sm },
        reactionChoiceButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
        reactionChoiceText: { fontSize: 21 },
        inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 10 : 6, gap: 6, backgroundColor: Colors.surface, borderTopWidth: 0.5, borderTopColor: Colors.border },
        attachmentPreviewRow: {
            alignSelf: 'flex-start',
            marginBottom: 4,
            position: 'relative',
        },
        attachmentPreviewImage: {
            width: 80,
            height: 80,
            borderRadius: 10,
            backgroundColor: Colors.card,
        },
        attachmentRemoveBtn: {
            position: 'absolute',
            top: -6,
            right: -6,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: 'rgba(0,0,0,0.72)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        inputMain: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingLeft: 6, paddingRight: 6, paddingVertical: 2, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
        attachBtn: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 2,
        },
        attachBtnDisabled: { opacity: 0.55 },
        input: { flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 8, paddingVertical: 10, fontSize: FontSizes.md, color: Colors.text, maxHeight: 110 },
        sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
        sendButtonDisabled: { opacity: 0.4 },
        emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
        emptyText: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
        emptySubtext: { fontSize: FontSizes.md, color: Colors.textSecondary },
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
        centeredModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
        optionsSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.xs },
        optionsTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text, marginBottom: Spacing.xs },
        optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 14, backgroundColor: Colors.background },
        optionText: { fontSize: FontSizes.md, color: Colors.text, fontWeight: FontWeights.medium },
        optionCancel: { marginTop: Spacing.xs },
        themeSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.md, marginTop: -4 },
        themeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, paddingVertical: Spacing.sm },
        themeOption: { alignItems: 'center', gap: 6, width: 64 },
        themeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
        themeCircleSelected: { borderWidth: 3, borderColor: Colors.text },
        themeLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: FontWeights.medium },
        themeLabelSelected: { color: Colors.text, fontWeight: FontWeights.bold },
        themePreview: { marginTop: Spacing.md, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: Colors.background, borderRadius: 10, gap: 8, borderWidth: 1, borderColor: Colors.border },
        previewBubbleOther: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderTopLeftRadius: 2, maxWidth: '70%' },
        previewBubbleMine: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderTopRightRadius: 2, maxWidth: '70%' },
        backgroundPreview: { alignItems: 'center', marginVertical: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden' },
        backgroundPreviewImage: { width: '100%', height: 200, borderRadius: BorderRadius.lg },
        backgroundPreviewLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: Spacing.sm, fontWeight: FontWeights.medium },
        imagePreviewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
        imagePreviewClose: { position: 'absolute', top: 48, right: 20, padding: 8, zIndex: 2 },
        imagePreviewContainer: { width: '100%', height: '100%', paddingHorizontal: 16, paddingVertical: 72, justifyContent: 'center', alignItems: 'center' },
        imagePreviewImage: { width: '100%', height: '100%' },
    });
