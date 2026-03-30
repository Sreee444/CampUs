// @ts-nocheck
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
    ImageBackground,
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
import ChatMessageBubble from '../../components/ChatMessageBubble';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    uploadChatAttachment,
    getChatPreference,
    setChatBackgroundImage,
    removeChatBackgroundImage,
    uploadChatBackgroundToStorage,
} from '../../api/chat';
import { CHAT_THEME_KEY, CHAT_THEMES, ChatTheme, withHexAlpha } from '../../constants/chatThemes';
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
    const [showThemePicker, setShowThemePicker] = useState(false);
    const [showChatOptions, setShowChatOptions] = useState(false);
    const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
    const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
    const [isLoadingBackground, setIsLoadingBackground] = useState(false);
    const listRef = useRef<FlatList>(null);
    const prevMessageCountRef = useRef(0);

    // Chat theme
    const [chatTheme, setChatTheme] = useState<ChatTheme>(CHAT_THEMES[0]);
    useEffect(() => {
        AsyncStorage.getItem(CHAT_THEME_KEY).then((key) => {
            if (key) {
                const theme = CHAT_THEMES.find((t) => t.key === key);
                if (theme) setChatTheme(theme);
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

    const selectChatTheme = async (theme: ChatTheme) => {
        setChatTheme(theme);
        await AsyncStorage.setItem(CHAT_THEME_KEY, theme.key);
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

    // Auto-scroll to bottom on new messages only
    useEffect(() => {
        if (messages.length > 0 && messages.length > prevMessageCountRef.current) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
        prevMessageCountRef.current = messages.length;
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
        const seenStatus = seenByCount > 0 ? 'read' : 'sent';

        return (
            <View>
                {showDate && (
                    <View style={S.dateSeparator}>
                        <Text style={S.dateLabel}>{getDateLabel(item.created_at)}</Text>
                    </View>
                )}
                <ChatMessageBubble
                    messageId={item.id}
                    content={item.content}
                    isMe={isMe}
                    time={time}
                    chatTheme={chatTheme}
                    showSender={showAvatar && !isMe}
                    senderName={item.sender?.full_name || 'Member'}
                    senderAvatar={item.sender?.avatar_url}
                    senderRole={item.sender?.role}
                    seenStatus={seenStatus}
                    showTicks={isMe}
                    isImage={isImageMessage}
                    attachmentUrl={imageUri}
                    imageCaption={isImageMessage ? imageCaption : undefined}
                    onImagePress={(url) => setImagePreviewUrl(url)}
                    onLongPress={() => {
                        if (!isMe) return;
                        setSelectedMessage(item);
                        setShowMessageOptions(true);
                    }}
                />
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
                    <View style={[S.groupIcon, { backgroundColor: chatTheme.bubbleColor }]}>
                        <MaterialIcons name="group" size={18} color="#fff" />
                    </View>
                    <View>
                        <Text style={S.headerTitle} numberOfLines={1}>{teamName || 'Team Chat'}</Text>
                        <Text style={S.headerSub}>Project Team Chat</Text>
                    </View>
                </View>
                <TouchableOpacity style={S.paletteBtn} onPress={() => setShowChatOptions(true)}>
                    <MaterialIcons name="palette" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <ImageBackground
                source={backgroundImageUrl ? { uri: backgroundImageUrl } : undefined}
                style={S.messagesContainer}
                imageStyle={S.backgroundImage}
            >
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
                    style={S.messagesListContainer}
                    contentContainerStyle={S.messagesList}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={S.emptyChat}>
                            <MaterialIcons name="chat-bubble-outline" size={48} color={Colors.border} />
                            <Text style={S.emptyChatText}>No messages yet. Start the conversation!</Text>
                        </View>
                    }
                />

                {/* Input */}
                <View style={[S.inputContainer, backgroundImageUrl && { backgroundColor: withHexAlpha(Colors.surface, 0.88) }]}>
                    {!!selectedAttachmentUri && (
                        <View style={S.attachmentPreviewRow}>
                            <Image source={{ uri: selectedAttachmentUri }} style={S.attachmentPreviewImage} />
                            <TouchableOpacity style={S.attachmentRemoveBtn} onPress={() => setSelectedAttachmentUri(null)}>
                                <MaterialIcons name="close" size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={S.inputRow}>
                        <View style={[S.inputMain, backgroundImageUrl && { backgroundColor: withHexAlpha(Colors.card, 0.9) }]}>
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
                        </View>
                        <TouchableOpacity
                            style={[S.sendBtn, { backgroundColor: chatTheme.bubbleColor }, (!messageText.trim() && !selectedAttachmentUri || isSending || isUploadingAttachment) && S.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={(!messageText.trim() && !selectedAttachmentUri) || isSending || isUploadingAttachment}
                        >
                            {(isSending || isUploadingAttachment) ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <MaterialIcons name="send" size={20} color={Colors.primaryContent} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
            </ImageBackground>

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

            {/* Chat Options Modal */}
            <Modal visible={showChatOptions} transparent animationType="slide" onRequestClose={() => setShowChatOptions(false)}>
                <View style={S.modalOverlay}>
                    <View style={S.optionsSheet}>
                        <Text style={S.optionsTitle}>Chat options</Text>
                        <TouchableOpacity style={S.optionRow} onPress={() => { setShowChatOptions(false); setShowThemePicker(true); }}>
                            <MaterialIcons name="palette" size={20} color={Colors.text} />
                            <Text style={S.optionText}>Change Chat Theme</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.optionRow} onPress={() => { setShowChatOptions(false); setShowBackgroundPicker(true); }}>
                            <MaterialIcons name="image" size={20} color={Colors.text} />
                            <Text style={S.optionText}>Chat Background</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[S.optionRow, S.optionCancel]} onPress={() => setShowChatOptions(false)}>
                            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
                            <Text style={[S.optionText, { color: Colors.textSecondary }]}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Theme Picker Modal */}
            <Modal visible={showThemePicker} transparent animationType="slide" onRequestClose={() => setShowThemePicker(false)}>
                <View style={S.modalOverlay}>
                    <View style={S.optionsSheet}>
                        <Text style={S.optionsTitle}>Chat Theme</Text>
                        <Text style={S.themeSubtitle}>Choose a color for your chat bubbles</Text>
                        <View style={S.themeGrid}>
                            {CHAT_THEMES.map((theme) => (
                                <TouchableOpacity key={theme.key} style={S.themeOption} onPress={() => selectChatTheme(theme)}>
                                    <View style={[S.themeCircle, { backgroundColor: theme.bubbleColor }, chatTheme.key === theme.key && S.themeCircleSelected]}>
                                        {chatTheme.key === theme.key && <MaterialIcons name="check" size={20} color={theme.textColor} />}
                                    </View>
                                    <Text style={[S.themeLabel, chatTheme.key === theme.key && S.themeLabelSelected]}>{theme.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={S.themePreview}>
                            <View style={[S.previewBubbleOther, { backgroundColor: chatTheme.incomingBubbleColor, borderColor: chatTheme.incomingBorderColor }]}>
                                <Text style={{ color: chatTheme.incomingTextColor, fontSize: 13 }}>Hey there! 👋</Text>
                            </View>
                            <View style={[S.previewBubbleMine, { backgroundColor: chatTheme.bubbleColor }]}>
                                <Text style={{ color: chatTheme.textColor, fontSize: 13 }}>Hello! How are you?</Text>
                            </View>
                        </View>
                        <TouchableOpacity style={[S.optionRow, S.optionCancel]} onPress={() => setShowThemePicker(false)}>
                            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
                            <Text style={[S.optionText, { color: Colors.textSecondary }]}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Chat Background Picker */}
            <Modal visible={showBackgroundPicker} transparent animationType="slide" onRequestClose={() => setShowBackgroundPicker(false)}>
                <View style={S.modalOverlay}>
                    <View style={S.optionsSheet}>
                        <Text style={S.optionsTitle}>Chat Background</Text>
                        <Text style={S.themeSubtitle}>Customize your chat background</Text>
                        {backgroundImageUrl && (
                            <View style={S.backgroundPreview}>
                                <Image source={{ uri: backgroundImageUrl }} style={S.backgroundPreviewImage} />
                                <Text style={S.backgroundPreviewLabel}>Current Background</Text>
                            </View>
                        )}
                        <TouchableOpacity style={S.optionRow} onPress={handlePickBackgroundImage} disabled={isLoadingBackground}>
                            <MaterialIcons name="photo-library" size={20} color={Colors.text} />
                            <Text style={S.optionText}>{backgroundImageUrl ? 'Change Background' : 'Choose from Gallery'}</Text>
                            {isLoadingBackground && <ActivityIndicator size="small" color={Colors.primary} />}
                        </TouchableOpacity>
                        {backgroundImageUrl && (
                            <TouchableOpacity style={S.optionRow} onPress={handleRemoveBackground} disabled={isLoadingBackground}>
                                <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
                                <Text style={[S.optionText, { color: Colors.error }]}>Remove Background</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[S.optionRow, S.optionCancel]} onPress={() => setShowBackgroundPicker(false)}>
                            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
                            <Text style={[S.optionText, { color: Colors.textSecondary }]}>Close</Text>
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
            paddingHorizontal: 10,
            paddingVertical: 8,
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
            backgroundColor: Colors.primary,
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
        messagesContainer: {
            flex: 1,
        },
        messagesListContainer: {
            flex: 1,
            backgroundColor: 'transparent',
        },
        backgroundImage: {
            opacity: 1,
        },
        messagesList: {
            paddingHorizontal: 6,
            paddingVertical: Spacing.sm,
            gap: 3,
        },
        dateSeparator: {
            alignItems: 'center',
            marginVertical: 8,
        },
        dateLabel: {
            fontSize: 11,
            color: Colors.textSecondary,
            backgroundColor: Colors.card,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            fontWeight: '500',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: Colors.border,
        },
        inputContainer: {
            flexDirection: 'column',
            paddingHorizontal: 8,
            paddingVertical: 6,
            backgroundColor: Colors.surface,
            borderTopWidth: 0.5,
            borderTopColor: Colors.border,
            gap: 6,
        },
        inputRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 6,
        },
        inputMain: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 20,
            paddingLeft: 4,
            paddingRight: 6,
            backgroundColor: Colors.card,
            borderWidth: 1,
            borderColor: Colors.border,
        },
        input: {
            flex: 1,
            minHeight: 40,
            maxHeight: 110,
            backgroundColor: 'transparent',
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: Platform.OS === 'ios' ? 10 : 8,
            fontSize: FontSizes.sm,
            color: Colors.text,
            borderWidth: 0,
        },
        attachBtn: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
        },
        attachBtnDisabled: {
            opacity: 0.5,
        },
        sendBtn: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: Colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        sendBtnDisabled: {
            opacity: 0.4,
        },
        attachmentPreviewRow: {
            width: 80,
            height: 80,
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: Colors.card,
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
            backgroundColor: 'rgba(0,0,0,0.95)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        imagePreviewClose: {
            position: 'absolute',
            top: 48,
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
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
        },
        optionsSheet: {
            backgroundColor: Colors.card,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
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
            borderRadius: 10,
            paddingHorizontal: Spacing.md,
            paddingVertical: 14,
            backgroundColor: Colors.background,
        },
        optionText: {
            fontSize: FontSizes.md,
            color: Colors.text,
            fontWeight: FontWeights.medium,
        },
        optionCancel: {
            marginTop: Spacing.xs,
        },
        paletteBtn: {
            padding: 6,
        },
        themeSubtitle: {
            fontSize: FontSizes.sm,
            color: Colors.textSecondary,
            marginBottom: Spacing.sm,
        },
        themeGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 16,
            paddingVertical: Spacing.sm,
        },
        themeOption: {
            alignItems: 'center',
            gap: 6,
        },
        themeCircle: {
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
        },
        themeCircleSelected: {
            borderWidth: 3,
            borderColor: Colors.text,
        },
        themeLabel: {
            fontSize: 11,
            color: Colors.textSecondary,
            fontWeight: '500',
        },
        themeLabelSelected: {
            color: Colors.text,
            fontWeight: '700',
        },
        themePreview: {
            backgroundColor: Colors.background,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 12,
            padding: 14,
            gap: 8,
            marginTop: Spacing.xs,
            marginBottom: Spacing.sm,
        },
        previewBubbleOther: {
            alignSelf: 'flex-start',
            maxWidth: '70%',
            borderRadius: 8,
            borderTopLeftRadius: 2,
            padding: 8,
        },
        previewBubbleMine: {
            alignSelf: 'flex-end',
            maxWidth: '70%',
            borderRadius: 8,
            borderTopRightRadius: 2,
            padding: 8,
        },
        backgroundPreview: {
            alignItems: 'center',
            marginVertical: Spacing.md,
            borderRadius: BorderRadius.lg,
            overflow: 'hidden',
        },
        backgroundPreviewImage: {
            width: '100%',
            height: 200,
            borderRadius: BorderRadius.lg,
        },
        backgroundPreviewLabel: {
            fontSize: FontSizes.sm,
            color: Colors.textSecondary,
            marginTop: Spacing.sm,
            fontWeight: FontWeights.medium,
        },
    });
