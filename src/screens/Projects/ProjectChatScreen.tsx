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
    Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import { updateUserStatus } from '../../api/chat';
import {
    getProjectChatMessages,
    sendProjectChatMessage,
    subscribeToProjectChatMessages,
    ProjectChatMessage,
    addProjectMessageReaction,
    removeProjectMessageReaction,
    getProjectMessageReactions,
    MessageReaction,
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
    const [messageText, setMessageText] = useState('');
    const [reactions, setReactions] = useState<Map<string, MessageReaction[]>>(new Map());
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
    const listRef = useRef<FlatList>(null);

    const availableEmojis = ['👍', '❤️', '😊', '😂', '🎉', '🔥', '👏', '🙌'];

    useFocusEffect(
        useCallback(() => {
            if (!user?.id) return;

            updateUserStatus(user.id, 'online').catch(() => {});

            return () => {
                updateUserStatus(user.id, 'away').catch(() => {});
            };
        }, [user?.id])
    );

    const loadMessages = useCallback(async () => {
        if (!chatId) return;
        try {
            console.log('[ProjectChatScreen] Loading messages for chat:', chatId);
            const msgs = await getProjectChatMessages(chatId);
            console.log('[ProjectChatScreen] Loaded', msgs.length, 'messages');
            setMessages(msgs);
            
            if (msgs.length > 0) {
                const messageIds = msgs.map(m => m.id);
                const reactionsMap = await getProjectMessageReactions(messageIds);
                setReactions(reactionsMap);
            }
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

    const handleSend = async () => {
        const content = messageText.trim();
        if (!content || isSending || !user?.id) return;

        console.log('[ProjectChatScreen] Sending message, length:', content.length);
        setMessageText('');
        setIsSending(true);
        try {
            await sendProjectChatMessage(chatId, user.id, content);
            console.log('[ProjectChatScreen] Message sent successfully');
        } catch (e: any) {
            console.error('[ProjectChatScreen] Failed to send message:', e);
            Toast.show({ type: 'error', text1: 'Failed to send', text2: e?.message });
            setMessageText(content);
        } finally {
            setIsSending(false);
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

    const handleReactionPress = (messageId: string) => {
        setSelectedMessageId(messageId);
        setShowReactionPicker(true);
    };

    const handleAddReaction = async (emoji: string) => {
        if (!selectedMessageId) return;
        try {
            await addProjectMessageReaction(selectedMessageId, emoji);
            setReactions((prev) => {
                const newMap = new Map(prev);
                const existing = newMap.get(selectedMessageId) || [];
                const alreadyReacted = existing.some(r => r.user_id === user?.id && r.emoji === emoji);
                if (!alreadyReacted) {
                    newMap.set(selectedMessageId, [...existing, {
                        id: Date.now().toString(),
                        message_id: selectedMessageId,
                        user_id: user?.id || '',
                        emoji,
                        created_at: new Date().toISOString(),
                    }]);
                }
                return newMap;
            });
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to add reaction', text2: e?.message });
        } finally {
            setShowReactionPicker(false);
            setSelectedMessageId(null);
        }
    };

    const handleToggleReaction = async (messageId: string, emoji: string) => {
        const messageReactions = reactions.get(messageId) || [];
        const userReaction = messageReactions.find(r => r.user_id === user?.id && r.emoji === emoji);
        try {
            if (userReaction) {
                await removeProjectMessageReaction(messageId, emoji);
                setReactions((prev) => {
                    const newMap = new Map(prev);
                    const filtered = (newMap.get(messageId) || []).filter(
                        r => !(r.user_id === user?.id && r.emoji === emoji)
                    );
                    if (filtered.length === 0) newMap.delete(messageId);
                    else newMap.set(messageId, filtered);
                    return newMap;
                });
            } else {
                await addProjectMessageReaction(messageId, emoji);
                setReactions((prev) => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(messageId) || [];
                    newMap.set(messageId, [...existing, {
                        id: Date.now().toString(),
                        message_id: messageId,
                        user_id: user?.id || '',
                        emoji,
                        created_at: new Date().toISOString(),
                    }]);
                    return newMap;
                });
            }
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to update reaction', text2: e?.message });
        }
    };

    const groupReactions = (messageReactions: MessageReaction[]) => {
        const grouped: { [emoji: string]: { count: number; hasUserReacted: boolean } } = {};
        messageReactions.forEach((reaction) => {
            if (!grouped[reaction.emoji]) {
                grouped[reaction.emoji] = { count: 0, hasUserReacted: false };
            }
            grouped[reaction.emoji].count++;
            if (reaction.user_id === user?.id) {
                grouped[reaction.emoji].hasUserReacted = true;
            }
        });
        return grouped;
    };

    const renderMessage = ({ item, index }: { item: ProjectChatMessage; index: number }) => {
        const isMe = item.sender_id === user?.id;
        const prev = index > 0 ? messages[index - 1] : null;
        const showDate =
            index === 0 ||
            new Date(prev?.created_at || '').toDateString() !== new Date(item.created_at).toDateString();
        const showAvatar = !isMe && (!prev || prev.sender_id !== item.sender_id);
        const time = new Date(item.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });

        const messageReactions = reactions.get(item.id) || [];
        const groupedReactions = groupReactions(messageReactions);

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
                    <View style={{ maxWidth: '75%' }}>
                        <View style={[S.bubble, isMe ? S.myBubble : S.otherBubble]}>
                            {showAvatar && !isMe && (
                                <Text style={S.senderName}>{item.sender?.full_name || 'Member'}</Text>
                            )}
                            <Text style={[S.msgText, isMe ? S.myMsgText : S.otherMsgText]}>
                                {item.content}
                            </Text>
                            <View style={S.msgFooter}>
                                <Text style={[S.msgTime, isMe ? S.myMsgTime : S.otherMsgTime]}>{time}</Text>
                                <TouchableOpacity 
                                    onPress={() => handleReactionPress(item.id)}
                                    style={S.reactionBtn}
                                >
                                    <MaterialIcons 
                                        name="insert-emoticon" 
                                        size={16} 
                                        color={isMe ? 'rgba(255,255,255,0.8)' : Colors.textSecondary} 
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                        {Object.keys(groupedReactions).length > 0 && (
                            <View style={[S.reactionsContainer, isMe && S.reactionsContainerRight]}>
                                {Object.entries(groupedReactions).map(([emoji, data]) => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={[S.reactionPill, data.hasUserReacted && S.reactionPillActive]}
                                        onPress={() => handleToggleReaction(item.id, emoji)}
                                    >
                                        <Text style={S.reactionEmoji}>{emoji}</Text>
                                        <Text style={[S.reactionCount, data.hasUserReacted && S.reactionCountActive]}>
                                            {data.count}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
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
                        style={[S.sendBtn, (!messageText.trim() || isSending) && S.sendBtnDisabled]}
                        onPress={handleSend}
                        disabled={!messageText.trim() || isSending}
                    >
                        {isSending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <MaterialIcons name="send" size={20} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
            <Modal visible={showReactionPicker} transparent animationType="fade" onRequestClose={() => setShowReactionPicker(false)}>
                <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={() => setShowReactionPicker(false)}>
                    <View style={S.reactionPickerContainer}>
                        <Text style={S.reactionPickerTitle}>React with</Text>
                        <View style={S.reactionPickerGrid}>
                            {availableEmojis.map((emoji) => (
                                <TouchableOpacity key={emoji} style={S.emojiButton} onPress={() => handleAddReaction(emoji)}>
                                    <Text style={S.emojiButtonText}>{emoji}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </TouchableOpacity>
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
        myMsgTime: { color: 'rgba(255,255,255,0.65)' },
        otherMsgTime: { color: Colors.textSecondary },
                msgFooter: {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                },
                reactionBtn: {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.12)',
                },
                reactionsContainer: {
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                    marginTop: 4,
                },
                reactionsContainerRight: {
                    alignSelf: 'flex-end',
                },
                reactionPill: {
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: Colors.surface,
                    borderRadius: 12,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    gap: 4,
                    borderWidth: 1,
                    borderColor: Colors.border,
                },
                reactionPillActive: {
                    backgroundColor: '#E0E7FF',
                    borderColor: '#4F46E5',
                },
                reactionEmoji: {
                    fontSize: 14,
                },
                reactionCount: {
                    fontSize: 11,
                    fontWeight: '600',
                    color: Colors.text,
                },
                reactionCountActive: {
                    color: '#4F46E5',
                },
                modalOverlay: {
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                },
                reactionPickerContainer: {
                    backgroundColor: Colors.surface,
                    borderRadius: BorderRadius.lg,
                    padding: Spacing.lg,
                    width: 280,
                    maxWidth: '90%',
                },
                reactionPickerTitle: {
                    fontSize: FontSizes.md,
                    fontWeight: FontWeights.bold,
                    color: Colors.text,
                    marginBottom: Spacing.md,
                },
                reactionPickerGrid: {
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                },
                emojiButton: {
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    backgroundColor: Colors.background,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                emojiButtonText: {
                    fontSize: 28,
                },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: Spacing.md,
            paddingVertical: 10,
            backgroundColor: Colors.surface,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
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
    });
