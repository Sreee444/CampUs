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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import {
    getMentorshipMessages,
    sendMentorshipMessage,
    subscribeToMentorshipMessages,
    getMentorshipChatById,
    MentorshipMessage,
    MentorshipChat,
} from '../../api/mentorshipChat';

type Nav = StackNavigationProp<RootStackParamList, 'MentorshipChat'>;
type Route = RouteProp<RootStackParamList, 'MentorshipChat'>;

export default function MentorshipChatScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<Route>();
    const { chatId } = route.params;
    const { isDark } = useTheme();
    const { user } = useAuth();
    const Colors = getColors(isDark);
    const S = styles(Colors);

    const [chat, setChat] = useState<MentorshipChat | null>(null);
    const [messages, setMessages] = useState<MentorshipMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [messageText, setMessageText] = useState('');
    const listRef = useRef<FlatList>(null);

    const loadData = useCallback(async () => {
        if (!chatId) return;
        try {
            const [chatData, msgs] = await Promise.all([
                getMentorshipChatById(chatId),
                getMentorshipMessages(chatId),
            ]);
            setChat(chatData);
            setMessages(msgs);
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to load chat', text2: e?.message });
        } finally {
            setIsLoading(false);
        }
    }, [chatId]);

    useEffect(() => {
        loadData();

        // Real-time subscription
        const subscription = subscribeToMentorshipMessages(chatId, (event) => {
            if (event.type === 'insert') {
                setMessages((prev) => {
                    const exists = prev.some((m) => m.id === event.message.id);
                    if (exists) return prev;
                    return [...prev, event.message];
                });
            }
        });

        return () => {
            subscription?.unsubscribe?.();
        };
    }, [chatId, loadData]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
        }
    }, [messages.length]);

    const handleSend = async () => {
        const content = messageText.trim();
        if (!content || isSending) return;

        setMessageText('');
        setIsSending(true);
        try {
            await sendMentorshipMessage(chatId, content);
        } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Failed to send', text2: e?.message });
            setMessageText(content);
        } finally {
            setIsSending(false);
        }
    };

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

    const renderMessage = ({ item, index }: { item: MentorshipMessage; index: number }) => {
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
                                    name={item.sender?.full_name || 'U'}
                                    size={28}
                                    showRing={false}
                                />
                            ) : (
                                <View style={{ width: 28 }} />
                            )}
                        </View>
                    )}
                    <View style={[S.bubble, isMe ? S.myBubble : S.otherBubble]}>
                        {showAvatar && !isMe && (
                            <Text style={S.senderName}>{item.sender?.full_name || 'Member'}</Text>
                        )}
                        <Text style={[S.msgText, isMe ? S.myMsgText : S.otherMsgText]}>
                            {item.content}
                        </Text>
                        <Text style={[S.msgTime, isMe ? S.myMsgTime : S.otherMsgTime]}>{time}</Text>
                    </View>
                </View>
            </View>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={S.container}>
                <View style={S.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
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
                    <UserAvatar uri={getChatAvatar()} name={getChatTitle()} size={36} showRing={false} />
                    <View>
                        <Text style={S.headerTitle} numberOfLines={1}>{getChatTitle()}</Text>
                        {chat?.mentorship?.purpose && (
                            <Text style={S.headerSub}>{chat.mentorship.purpose} mentorship</Text>
                        )}
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
                            <Text style={S.emptyChatText}>No messages yet. Say hello!</Text>
                        </View>
                    }
                />

                {/* Input */}
                <View style={S.inputContainer}>
                    <TextInput
                        style={S.input}
                        value={messageText}
                        onChangeText={setMessageText}
                        placeholder="Type a message…"
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
        headerTitle: {
            fontSize: FontSizes.md,
            fontWeight: FontWeights.bold,
            color: Colors.text,
        },
        headerSub: {
            fontSize: 11,
            color: Colors.textSecondary,
            textTransform: 'capitalize',
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
        },
    });
