// @ts-nocheck
import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    FlatList,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { getMentorshipChatsForUser, MentorshipChat } from '../../api/mentorshipChat';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function MentorshipChatListScreen() {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const { user } = useAuth();
    const Colors = getColors(isDark);
    const S = styles(Colors);

    const [chats, setChats] = useState<MentorshipChat[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadChats = useCallback(async () => {
        if (!user?.id) return;
        try {
            const data = await getMentorshipChatsForUser(user.id);
            setChats(data || []);
        } catch (e) {
            console.error('Failed to load mentorship chats:', e);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [user?.id]);

    useEffect(() => {
        loadChats();
    }, [loadChats]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadChats();
    };

    const getOtherParticipantName = (chat: MentorshipChat): string => {
        const mentee = chat.mentorship?.mentee;
        const mentor = chat.mentorship?.mentor?.user;
        // Show the other person: if current user is the mentee, show mentor name and vice versa
        if (user?.id === mentee?.id) {
            return mentor?.full_name || 'Mentor';
        }
        return mentee?.full_name || 'Student';
    };

    const getOtherParticipantAvatar = (chat: MentorshipChat): string | undefined => {
        const mentee = chat.mentorship?.mentee;
        const mentor = chat.mentorship?.mentor?.user;
        if (user?.id === mentee?.id) {
            return mentor?.avatar_url;
        }
        return mentee?.avatar_url;
    };

    const renderItem = ({ item }: { item: MentorshipChat }) => {
        const name = getOtherParticipantName(item);
        const avatar = getOtherParticipantAvatar(item);
        const lastMsg = item.last_message;
        const purpose = item.mentorship?.purpose;

        return (
            <TouchableOpacity
                style={S.chatItem}
                onPress={() => (navigation as any).navigate('MentorshipChat', { chatId: item.id })}
                activeOpacity={0.7}
            >
                <UserAvatar uri={avatar} name={name} size={50} showRing={false} />
                <View style={S.chatInfo}>
                    <View style={S.chatRow}>
                        <Text style={S.chatName} numberOfLines={1}>{name}</Text>
                        {lastMsg && (
                            <Text style={S.chatTime}>{dayjs(lastMsg.created_at).fromNow()}</Text>
                        )}
                    </View>
                    {purpose && (
                        <View style={S.purposeBadge}>
                            <Text style={S.purposeText}>{purpose}</Text>
                        </View>
                    )}
                    {lastMsg ? (
                        <Text style={S.lastMessage} numberOfLines={1}>
                            {lastMsg.content}
                        </Text>
                    ) : (
                        <Text style={[S.lastMessage, { fontStyle: 'italic' }]}>No messages yet</Text>
                    )}
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={S.container}>
            {/* Header */}
            <View style={S.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={S.headerTitle}>Mentorship Chats</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View style={S.centered}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                </View>
            ) : (
                <FlatList
                    data={chats}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={chats.length === 0 ? S.centered : S.listContent}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#4F46E5" />
                    }
                    ListEmptyComponent={
                        <View style={S.emptyState}>
                            <MaterialIcons name="chat-bubble-outline" size={64} color={Colors.border} />
                            <Text style={S.emptyTitle}>No mentorship chats</Text>
                            <Text style={S.emptySub}>Your mentorship conversations will appear here</Text>
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = (Colors: any) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: Colors.background },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.md,
            paddingVertical: 12,
            backgroundColor: Colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
        },
        backBtn: { padding: 8 },
        headerTitle: {
            fontSize: FontSizes.lg,
            fontWeight: FontWeights.bold,
            color: Colors.text,
        },
        centered: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        listContent: {
            paddingBottom: 20,
        },
        chatItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            paddingVertical: 12,
            backgroundColor: Colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            gap: 12,
        },
        chatInfo: { flex: 1, gap: 3 },
        chatRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        chatName: {
            fontSize: FontSizes.md,
            fontWeight: FontWeights.semibold,
            color: Colors.text,
            flex: 1,
        },
        chatTime: {
            fontSize: 11,
            color: Colors.textSecondary,
            marginLeft: 8,
        },
        purposeBadge: {
            alignSelf: 'flex-start',
            backgroundColor: '#4F46E514',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
        },
        purposeText: {
            fontSize: 10,
            color: '#4F46E5',
            fontWeight: '700',
            textTransform: 'capitalize',
        },
        lastMessage: {
            fontSize: FontSizes.sm,
            color: Colors.textSecondary,
        },
        emptyState: {
            alignItems: 'center',
            gap: 12,
            paddingTop: 80,
        },
        emptyTitle: {
            fontSize: FontSizes.lg,
            fontWeight: FontWeights.bold,
            color: Colors.text,
        },
        emptySub: {
            fontSize: FontSizes.sm,
            color: Colors.textSecondary,
            textAlign: 'center',
            paddingHorizontal: 32,
        },
    });
