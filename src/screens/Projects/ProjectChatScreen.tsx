// @ts-nocheck
import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    Image,
    Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import { uploadChatAttachment } from '../../api/chat';
import {
    getProjectChatMessages,
    sendProjectChatMessage,
    subscribeToProjectChatMessages,
    deleteProjectChatMessage,
    markProjectMessagesRead,
    getProjectSeenByOthers,
    ProjectChatMessage,
} from '../../api/projectChat';

type Nav = StackNavigationProp<RootStackParamList, 'ProjectChat'>;
type Route = RouteProp<RootStackParamList, 'ProjectChat'>;

export default function ProjectChatScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<Route>();
    const { chatId, teamName } = route.params;
    const { isDark } = useTheme();
    const { user } = useAuth();
    const Colors = getColors(isDark);
    const S = styles(Colors);

    const [messages, setMessages] = useState<ProjectChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [selectedAttachmentUri, setSelectedAttachmentUri] = useState<string | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [showMessageOptions, setShowMessageOptions] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<ProjectChatMessage | null>(null);
    const [seenByOthersMap, setSeenByOthersMap] = useState<Map<string, number>>(new Map());
    const [imageLoadFailures, setImageLoadFailures] = useState<Record<string, boolean>>({});
    const listRef = useRef<FlatList>(null);

    const loadMessages = useCallback(async () => {
        if (!chatId) return;
        try {
            console.log('[ProjectChatScreen] Loading messages for chat:', chatId);
            const msgs = await getProjectChatMessages(chatId);
            console.log('[ProjectChatScreen] Loaded', msgs.length, 'messages');
            setMessages(msgs);
        } catch (e: any) {
            console.error('[ProjectChatScreen] Failed to load messages:', e);
            Toast.show({ type: 'error', text1: 'Failed to load messages', text2: e?.message });
        } finally {
            setIsLoading(false);
        }
    }, [chatId]);

    useEffect(() => {
        console.log('[ProjectChatScreen] Setting up chat for chatId:', chatId);
        loadMessages();

        const subscription = subscribeToProjectChatMessages(chatId, (newMsg) => {
            console.log('[ProjectChatScreen] New message received via subscription:', newMsg.id);
            setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) {
                    console.log('[ProjectChatScreen] Message already exists, skipping');
                    return prev;
                }
                console.log('[ProjectChatScreen] Adding new message to state');
                return [...prev, newMsg];
            });
        });

        return () => {
            console.log('[ProjectChatScreen] Cleaning up subscription');
            subscription?.unsubscribe?.();
        };
    }, [chatId, loadMessages]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
    }, [messages.length]);

    useEffect(() => {
        const syncSeen = async () => {
            if (!user?.id || messages.length === 0) return;

            const incomingIds = messages.filter((m) => m.sender_id !== user.id).map((m) => m.id);
            const outgoingIds = messages.filter((m) => m.sender_id === user.id).map((m) => m.id);

            try {
                if (incomingIds.length) {
                    await markProjectMessagesRead(incomingIds, user.id);
                }
                if (outgoingIds.length) {
                    const map = await getProjectSeenByOthers(outgoingIds, user.id);
                    setSeenByOthersMap(map);
                } else {
                    setSeenByOthersMap(new Map());
                }
            } catch {
                // Read receipts are optional.
            }
        };

        syncSeen();
    }, [messages, user?.id]);

    const handleSend = async () => {
        const content = messageText.trim();
        const hasAttachment = !!selectedAttachmentUri;
        if ((!content && !hasAttachment) || isSending || isUploadingAttachment || !user?.id) return;

        console.log('[ProjectChatScreen] Sending message, length:', content.length);
        setMessageText('');
        setIsSending(true);
        try {
            if (selectedAttachmentUri) {
                setIsUploadingAttachment(true);
                const attachmentUrl = await uploadChatAttachment(user.id, selectedAttachmentUri);
                await sendProjectChatMessage(chatId, user.id, content, 'image', attachmentUrl);
                setSelectedAttachmentUri(null);
            } else {
                await sendProjectChatMessage(chatId, user.id, content, 'text');
            }
            console.log('[ProjectChatScreen] Message sent successfully');
        } catch (e: any) {
            console.error('[ProjectChatScreen] Failed to send message:', e);
            Toast.show({ type: 'error', text1: 'Failed to send', text2: e?.message });
            setMessageText(content);
        } finally {
            setIsUploadingAttachment(false);
            setIsSending(false);
        }
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

    const handleDeleteMessage = async () => {
        if (!selectedMessage?.id || !user?.id) return;
        try {
            await deleteProjectChatMessage(selectedMessage.id, user.id);
            setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
            Toast.show({ type: 'success', text1: 'Message deleted' });
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Delete failed', text2: e?.message });
        } finally {
            setShowMessageOptions(false);
            setSelectedMessage(null);
        }
    };

    const getDateLabel = (isoDate: string) => {
        const date = new Date(isoDate);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        if (toDay(date) === toDay(today)) return 'Today';
        if (toDay(date) === toDay(yesterday)) return 'Yesterday';
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const renderMessage = ({ item, index }: { item: ProjectChatMessage; index: number }) => {
        const isMe = item.sender_id === user?.id;
        const rawType = (item as any)?.message_type ?? (item as any)?.type;
        const normalizedType = typeof rawType === 'string' ? rawType.toLowerCase() : '';
        const contentAsUrl = typeof item.content === 'string' && /^https?:\/\/\S+$/i.test(item.content.trim()) ? item.content.trim() : '';
        const imageUri = item.attachment_url || contentAsUrl || '';
        const isImageMessage = !!imageUri && (normalizedType === 'image' || !normalizedType);
        const imageCaption = (item.content || '').trim();
        const hasImageLoadFailure = !!imageLoadFailures[item.id];
        const prev = index > 0 ? messages[index - 1] : null;
        const showDate =
            index === 0 ||
            new Date(prev?.created_at || '').toDateString() !== new Date(item.created_at).toDateString();
        const showAvatar = !isMe && (!prev || prev.sender_id !== item.sender_id);
        const time = new Date(item.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
        const seenByCount = isMe ? (seenByOthersMap.get(item.id) || 0) : 0;
        const tickName = seenByCount > 0 ? 'done-all' : 'done';
        const tickColor = seenByCount > 0 ? '#60A5FA' : 'rgba(255,255,255,0.72)';

        return (
            <View>
                {showDate && (
                    <View style={S.dateSeparator}>
                        <Text style={S.dateLabel}>{getDateLabel(item.created_at)}</Text>
                    </View>
                )}
                <View style={[S.msgRow, isMe ? S.myMsgRow : S.otherMsgRow]}>
                    {!isMe && (
                        <View style={S.avatarWrap}>
                            {showAvatar ? (
                                <UserAvatar
                                    uri={item.sender?.avatar_url}
                                    name={item.sender?.full_name || 'M'}
                                    size={28}
                                    showRing={false}
                                />
                            ) : (
                                <View style={{ width: 28 }} />
                            )}
                        </View>
                    )}
                    <TouchableOpacity
                        style={[S.bubble, isImageMessage && S.imageMessageBubble, isMe ? S.myBubble : S.otherBubble]}
                        onLongPress={() => {
                            if (!isMe) return;
                            setSelectedMessage(item);
                            setShowMessageOptions(true);
                        }}
                        delayLongPress={350}
                        activeOpacity={0.85}
                    >
                        {showAvatar && !isMe && (
                            <Text style={S.senderName}>{item.sender?.full_name || 'Member'}</Text>
                        )}
                        {isImageMessage ? (
                            <View style={S.imageMessageWrap}>
                                <TouchableOpacity activeOpacity={0.9} onPress={() => !hasImageLoadFailure && setImagePreviewUrl(imageUri)}>
                                    {!hasImageLoadFailure ? (
                                        <Image
                                            source={{ uri: imageUri }}
                                            style={S.imageMessage}
                                            resizeMode="cover"
                                            onError={() => setImageLoadFailures((prevState) => ({ ...prevState, [item.id]: true }))}
                                        />
                                    ) : (
                                        <View style={S.imageLoadFallback}>
                                            <MaterialIcons name="broken-image" size={22} color={isMe ? 'rgba(255,255,255,0.85)' : Colors.textSecondary} />
                                            <Text style={[S.imageLoadFallbackText, isMe ? S.myMsgText : S.otherMsgText]}>Image unavailable</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                                {!!imageCaption && (
                                    <Text style={[S.msgText, isMe ? S.myMsgText : S.otherMsgText]}>{imageCaption}</Text>
                                )}
                            </View>
                        ) : (
                            <Text style={[S.msgText, isMe ? S.myMsgText : S.otherMsgText]}>
                                {item.content}
                            </Text>
                        )}
                        <View style={S.timeRow}>
                            <Text style={[S.msgTime, isMe ? S.myMsgTime : S.otherMsgTime]}>{time}</Text>
                            {isMe && <MaterialIcons name={tickName} size={14} color={tickColor} />}
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={S.container}>
                <View style={S.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
                        <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={S.headerTitle}>Loading…</Text>
                    <View style={{ width: 24 }} />
                </View>
                <View style={S.centered}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={S.container}>
            {/* Header */}
            <View style={S.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <View style={S.headerCenter}>
                    <View style={S.groupIcon}>
                        <MaterialIcons name="group" size={20} color="#fff" />
                    </View>
                    <View>
                        <Text style={S.headerTitle} numberOfLines={1}>{teamName || 'Team Chat'}</Text>
                        <Text style={S.headerSub}>Project Team Chat</Text>
                    </View>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={S.messagesList}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                    ListEmptyComponent={
                        <View style={S.emptyChat}>
                            <MaterialIcons name="chat-bubble-outline" size={48} color={Colors.border} />
                            <Text style={S.emptyChatText}>No messages yet. Start the conversation!</Text>
                        </View>
                    }
                />

                {/* Input */}
                <View style={S.inputContainer}>
                    {!!selectedAttachmentUri && (
                        <View style={S.attachmentPreviewRow}>
                            <Image source={{ uri: selectedAttachmentUri }} style={S.attachmentPreviewImage} />
                            <TouchableOpacity style={S.attachmentRemoveBtn} onPress={() => setSelectedAttachmentUri(null)}>
                                <MaterialIcons name="close" size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={S.inputRow}>
                        <TouchableOpacity
                            style={[S.attachBtn, (isUploadingAttachment || isSending) && S.attachBtnDisabled]}
                            onPress={handlePickAttachment}
                            disabled={isUploadingAttachment || isSending}
                        >
                            {isUploadingAttachment
                                ? <ActivityIndicator size="small" color={Colors.textSecondary} />
                                : <MaterialIcons name="attach-file" size={20} color={Colors.textSecondary} />}
                        </TouchableOpacity>
                        <TextInput
                            style={S.input}
                            value={messageText}
                            onChangeText={setMessageText}
                            placeholder="Message your team…"
                            placeholderTextColor={Colors.textSecondary}
                            multiline
                            maxLength={2000}
                            returnKeyType="default"
                        />
                        <TouchableOpacity
                            style={[S.sendBtn, (!messageText.trim() && !selectedAttachmentUri || isSending || isUploadingAttachment) && S.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={(!messageText.trim() && !selectedAttachmentUri) || isSending || isUploadingAttachment}
                        >
                            {(isSending || isUploadingAttachment) ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <MaterialIcons name="send" size={20} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            <Modal visible={!!imagePreviewUrl} transparent animationType="fade" onRequestClose={() => setImagePreviewUrl(null)}>
                <View style={S.imagePreviewBackdrop}>
                    <TouchableOpacity style={S.imagePreviewClose} onPress={() => setImagePreviewUrl(null)}>
                        <MaterialIcons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <View style={S.imagePreviewContainer}>
                        {!!imagePreviewUrl && (
                            <Image source={{ uri: imagePreviewUrl }} style={S.imagePreviewImage} resizeMode="contain" />
                        )}
                    </View>
                </View>
            </Modal>

            <Modal visible={showMessageOptions} transparent animationType="slide" onRequestClose={() => setShowMessageOptions(false)}>
                <View style={S.modalOverlay}>
                    <View style={S.optionsSheet}>
                        <Text style={S.optionsTitle}>Message options</Text>
                        <TouchableOpacity style={S.optionRow} onPress={handleDeleteMessage}>
                            <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
                            <Text style={[S.optionText, { color: Colors.error }]}>Delete message</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[S.optionRow, S.optionCancel]}
                            onPress={() => {
                                setShowMessageOptions(false);
                                setSelectedMessage(null);
                            }}
                        >
                            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
                            <Text style={[S.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = (Colors: any) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: Colors.background },
        centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.md,
            paddingVertical: 10,
            backgroundColor: Colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            gap: 10,
        },
        backBtn: { padding: 4 },
        headerCenter: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        groupIcon: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#4F46E5',
            alignItems: 'center',
            justifyContent: 'center',
        },
        headerTitle: {
            fontSize: FontSizes.md,
            fontWeight: FontWeights.bold,
            color: Colors.text,
        },
        headerSub: {
            fontSize: 11,
            color: Colors.textSecondary,
        },
        messagesList: {
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            gap: 4,
        },
        dateSeparator: {
            alignItems: 'center',
            marginVertical: 12,
        },
        dateLabel: {
            fontSize: 11,
            color: Colors.textSecondary,
            backgroundColor: Colors.surface,
            paddingHorizontal: 12,
            paddingVertical: 3,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.border,
        },
        msgRow: {
            flexDirection: 'row',
            marginBottom: 4,
            alignItems: 'flex-end',
        },
        myMsgRow: { justifyContent: 'flex-end' },
        otherMsgRow: { justifyContent: 'flex-start' },
        avatarWrap: { marginRight: 6 },
        bubble: {
            maxWidth: '75%',
            borderRadius: BorderRadius.lg,
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 2,
        },
        imageMessageBubble: {
            paddingHorizontal: 4,
            paddingVertical: 4,
            borderRadius: 14,
        },
        imageMessageWrap: {
            gap: 6,
        },
        imageMessage: {
            width: 220,
            height: 220,
            borderRadius: 10,
            backgroundColor: Colors.border,
        },
        imageLoadFallback: {
            width: 220,
            height: 220,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: Colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            backgroundColor: Colors.background,
        },
        imageLoadFallbackText: {
            fontSize: 12,
            fontWeight: '600',
        },
        myBubble: {
            backgroundColor: '#4F46E5',
            borderBottomRightRadius: 4,
        },
        otherBubble: {
            backgroundColor: Colors.surface,
            borderBottomLeftRadius: 4,
            borderWidth: 1,
            borderColor: Colors.border,
        },
        senderName: {
            fontSize: 11,
            fontWeight: '700',
            color: '#4F46E5',
            marginBottom: 2,
        },
        msgText: {
            fontSize: FontSizes.sm,
            lineHeight: 20,
        },
        myMsgText: { color: '#fff' },
        otherMsgText: { color: Colors.text },
        msgTime: {
            fontSize: 10,
            alignSelf: 'flex-end',
        },
        timeRow: {
            alignSelf: 'flex-end',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
        },
        myMsgTime: { color: 'rgba(255,255,255,0.65)' },
        otherMsgTime: { color: Colors.textSecondary },
        inputContainer: {
            flexDirection: 'column',
            paddingHorizontal: Spacing.md,
            paddingVertical: 10,
            backgroundColor: Colors.surface,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            gap: 8,
        },
        inputRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
        },
        input: {
            flex: 1,
            minHeight: 42,
            maxHeight: 130,
            backgroundColor: Colors.background,
            borderRadius: BorderRadius.lg,
            paddingHorizontal: 14,
            paddingVertical: Platform.OS === 'ios' ? 11 : 8,
            fontSize: FontSizes.sm,
            color: Colors.text,
            borderWidth: 1,
            borderColor: Colors.border,
        },
        attachBtn: {
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: Colors.border,
            backgroundColor: Colors.background,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 2,
        },
        attachBtnDisabled: {
            opacity: 0.6,
        },
        sendBtn: {
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: '#4F46E5',
            alignItems: 'center',
            justifyContent: 'center',
        },
        sendBtnDisabled: {
            backgroundColor: Colors.border,
        },
        attachmentPreviewRow: {
            width: 84,
            height: 84,
            borderRadius: 10,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: Colors.border,
            backgroundColor: Colors.background,
        },
        attachmentPreviewImage: {
            width: '100%',
            height: '100%',
        },
        attachmentRemoveBtn: {
            position: 'absolute',
            right: 4,
            top: 4,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: 'rgba(0,0,0,0.65)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        imagePreviewBackdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.9)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        imagePreviewClose: {
            position: 'absolute',
            top: 54,
            right: 18,
            zIndex: 10,
            padding: 6,
        },
        imagePreviewContainer: {
            width: '92%',
            height: '72%',
        },
        imagePreviewImage: {
            width: '100%',
            height: '100%',
        },
        emptyChat: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 80,
            gap: 12,
        },
        emptyChatText: {
            fontSize: FontSizes.md,
            color: Colors.textSecondary,
            textAlign: 'center',
        },
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'flex-end',
        },
        optionsSheet: {
            backgroundColor: Colors.surface,
            borderTopLeftRadius: BorderRadius.xl,
            borderTopRightRadius: BorderRadius.xl,
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.lg,
            gap: Spacing.xs,
        },
        optionsTitle: {
            fontSize: FontSizes.lg,
            fontWeight: FontWeights.semibold,
            color: Colors.text,
            marginBottom: Spacing.xs,
        },
        optionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: Colors.border,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.md,
            backgroundColor: Colors.card,
        },
        optionText: {
            fontSize: FontSizes.md,
            color: Colors.text,
            fontWeight: FontWeights.medium,
        },
        optionCancel: {
            marginTop: Spacing.xs,
        },
    });
