// @ts-nocheck
import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { getMentorshipChatsForUser, MentorshipChat } from '../../api/mentorshipChat';
import { UserAvatar } from '../../components/UserAvatar';

type Nav = StackNavigationProp<RootStackParamList, 'MentorshipChatList'>;

const INDIGO = '#4F46E5';

export default function MentorshipChatListScreen() {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [chats, setChats] = useState<MentorshipChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChats = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const data = await getMentorshipChatsForUser(user.id);
      setChats(data);
    } catch (error) {
      console.error('Failed to load mentorship chats', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const onRefresh = async () => {
    if (!user?.id) return;
    try {
      setRefreshing(true);
      await loadChats();
    } finally {
      setRefreshing(false);
    }
  };

  const renderItem = ({ item }: { item: MentorshipChat }) => {
    const mentorship = item.mentorship;
    const purpose = mentorship?.purpose || 'career';
    const isMentee = mentorship?.mentee?.id === user?.id;

    const mentorName = mentorship?.mentor?.user?.full_name || 'Mentor';
    const menteeName = mentorship?.mentee?.full_name || 'Student';
    const counterpartyName = isMentee ? mentorName : menteeName;

    const status = mentorship?.status || 'pending';
    const lastMessage = item.last_message?.content || 'No messages yet';

    const lastTimestamp = item.last_message?.created_at || item.created_at;
    const timeLabel = lastTimestamp
      ? new Date(lastTimestamp).toLocaleString('en-IN', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

    const purposeLabel =
      purpose === 'career'
        ? 'Career'
        : purpose === 'academic'
        ? 'Academic'
        : purpose === 'skill'
        ? 'Skill'
        : purpose === 'project'
        ? 'Project'
        : purpose === 'startup'
        ? 'Startup'
        : purpose;

    const statusColor =
      status === 'accepted'
        ? Colors.success || '#16A34A'
        : status === 'closed'
        ? Colors.textSecondary
        : Colors.warning || '#F59E0B';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('MentorshipChat', { chatId: item.id })}
      >
        <View style={styles.avatarColumn}>
          <UserAvatar
            uri={isMentee ? mentorship?.mentor?.user?.avatar_url : mentorship?.mentee?.avatar_url}
            name={counterpartyName}
            size={44}
            showRing={false}
          />
        </View>

        <View style={styles.infoColumn}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {counterpartyName}
            </Text>
            <Text style={styles.time}>{timeLabel}</Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.purposeBadge}>
              <MaterialIcons name="school" size={12} color="#E0E7FF" />
              <Text style={styles.purposeText}>{purposeLabel}</Text>
            </View>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {status === 'accepted'
                ? 'Active'
                : status === 'closed'
                ? 'Closed'
                : status === 'pending'
                ? 'Pending'
                : status === 'rejected'
                ? 'Rejected'
                : status}
            </Text>
          </View>

          <Text style={styles.preview} numberOfLines={1}>
            {lastMessage}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Mentorship Chats</Text>
          <Text style={styles.headerSubtitle}>1:1 and project mentorship threads</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={INDIGO} />
          <Text style={styles.loadingText}>Loading mentorship chats...</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={chats.length === 0 ? styles.emptyListContent : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="chat-bubble-outline" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>No mentorship chats yet</Text>
              <Text style={styles.emptySubtitle}>
                Accepted mentorships will appear here with their dedicated chat.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {
      flex: 1,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    headerSubtitle: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    emptyListContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    card: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.sm,
      borderRadius: BorderRadius.xl,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
      ...Shadows.sm,
    },
    avatarColumn: {
      paddingHorizontal: Spacing.xs,
      justifyContent: 'center',
    },
    infoColumn: {
      flex: 1,
      marginLeft: Spacing.sm,
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    name: {
      flex: 1,
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    time: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    purposeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      backgroundColor: INDIGO,
    },
    purposeText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: '#E0E7FF',
      textTransform: 'capitalize',
    },
    statusText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      textTransform: 'capitalize',
    },
    preview: {
      marginTop: 4,
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    emptyTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    emptySubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
  });

