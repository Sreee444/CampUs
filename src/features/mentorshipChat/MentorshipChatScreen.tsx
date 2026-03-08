// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import {
  getMentorshipChatById,
  getMentorshipMessages,
  sendMentorshipMessage,
  subscribeToMentorshipMessages,
  MentorshipMessage,
} from '../../api/mentorshipChat';
import { updateUserStatus } from '../../api/chat';
import { UserAvatar } from '../../components/UserAvatar';

type MentorshipChatRouteProp = RouteProp<RootStackParamList, 'MentorshipChat'>;
type MentorshipChatNavProp = StackNavigationProp<RootStackParamList, 'MentorshipChat'>;

const INDIGO = '#4F46E5';

export default function MentorshipChatScreen() {
  const navigation = useNavigation<MentorshipChatNavProp>();
  const route = useRoute<MentorshipChatRouteProp>();
  const { chatId } = route.params;

  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [isLoading, setIsLoading] = useState(true);
  const [chatMeta, setChatMeta] = useState<any | null>(null);
  const [messages, setMessages] = useState<MentorshipMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [text, setText] = useState('');

  const listRef = useRef<FlatList<MentorshipMessage>>(null);

  const currentUserId = user?.id;

  const isClosed = chatMeta?.mentorship?.status === 'closed';

  const mentorProfile = chatMeta?.mentorship?.mentor?.user;
  const menteeProfile = chatMeta?.mentorship?.mentee;
  const isMentee = menteeProfile?.id === currentUserId;

  const purposeLabel = useMemo(() => {
    const p = chatMeta?.mentorship?.purpose;
    if (!p) return '';
    switch (p) {
      case 'career':
        return 'Career';
      case 'academic':
        return 'Academic';
      case 'skill':
        return 'Skill';
      case 'project':
        return 'Project';
      case 'startup':
        return 'Startup';
      default:
        return p;
    }
  }, [chatMeta?.mentorship?.purpose]);

  const headerMentorName = mentorProfile?.full_name || 'Mentor';
  const headerStarted = chatMeta?.created_at
    ? new Date(chatMeta.created_at).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  useFocusEffect(
    React.useCallback(() => {
      if (!currentUserId) return;

      updateUserStatus(currentUserId, 'online').catch(() => {});

      return () => {
        updateUserStatus(currentUserId, 'away').catch(() => {});
      };
    }, [currentUserId])
  );

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        const [meta, initialMessages] = await Promise.all([
          getMentorshipChatById(chatId),
          getMentorshipMessages(chatId),
        ]);
        if (!isMounted) return;
        setChatMeta(meta);
        setMessages(initialMessages);
      } catch (error) {
        console.error('Failed to load mentorship chat', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    load();

    const channel = subscribeToMentorshipMessages(chatId, (event) => {
      if (event.type === 'insert' && event.message) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === event.message.id);
          if (exists) return prev;
          return [...prev, event.message].sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      }
    });

    return () => {
      isMounted = false;
      channel?.unsubscribe?.();
    };
  }, [chatId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !currentUserId || isClosed) return;

    try {
      setIsSending(true);
      setText('');
      const message = await sendMentorshipMessage(chatId, trimmed);
      setMessages((prev) =>
        [...prev, message].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      );
      setTimeout(
        () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
        50
      );
    } catch (error) {
      console.error('Failed to send mentorship message', error);
      setText(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
  );

  const renderMessage = ({ item }: { item: MentorshipMessage }) => {
    const isMine = item.sender_id === currentUserId;
    const timestamp = new Date(item.created_at).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.messageRowMine : styles.messageRowTheirs,
        ]}
      >
        {!isMine && (
          <View style={styles.avatarSlot}>
            <UserAvatar
              uri={item.sender?.avatar_url}
              name={item.sender?.full_name || 'User'}
              size={30}
              showRing={false}
            />
          </View>
        )}

        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
        >
          {!isMine && (
            <Text style={styles.senderName} numberOfLines={1}>
              {item.sender?.full_name || 'Member'}
            </Text>
          )}
          <Text
            style={[
              styles.messageText,
              isMine ? styles.messageTextMine : styles.messageTextTheirs,
            ]}
          >
            {item.content}
          </Text>
          <Text
            style={[
              styles.timeText,
              isMine ? styles.timeTextMine : styles.timeTextTheirs,
            ]}
          >
            {timestamp}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerMain}>
          <Text style={styles.headerLabel}>🎓 Mentorship</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerMentorName}
          </Text>
          <View style={styles.headerMetaRow}>
            {purposeLabel ? (
              <View style={styles.purposeChip}>
                <Text style={styles.purposeChipText}>{purposeLabel}</Text>
              </View>
            ) : null}
            {headerStarted ? (
              <Text style={styles.headerMetaText}>Started {headerStarted}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.headerSide}>
          <Text
            style={[
              styles.statusPill,
              isClosed ? styles.statusPillClosed : styles.statusPillActive,
            ]}
          >
            {isClosed ? 'Closed' : 'Active'}
          </Text>
        </View>
      </View>

      {/* Mentor / student summary */}
      <View style={styles.summaryBar}>
        <MaterialIcons name="info-outline" size={16} color={Colors.textSecondary} />
        <Text style={styles.summaryText} numberOfLines={2}>
          {isMentee
            ? `Chat with mentor ${headerMentorName}`
            : `Chat with mentee ${menteeProfile?.full_name || 'Student'}`}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={INDIGO} />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={sortedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
          >
            {isClosed && (
              <View style={styles.closedBanner}>
                <MaterialIcons name="lock" size={16} color={Colors.textSecondary} />
                <Text style={styles.closedBannerText}>
                  This mentorship is closed. New messages are disabled.
                </Text>
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={
                  isClosed ? 'Mentorship is closed' : 'Type a message to your mentor...'
                }
                placeholderTextColor={Colors.textSecondary}
                multiline
                maxLength={800}
                editable={!isClosed && !isSending}
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (isSending || !text.trim() || isClosed) && styles.sendButtonDisabled,
                ]}
                disabled={isSending || !text.trim() || isClosed}
                onPress={handleSend}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <MaterialIcons name="send" size={20} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
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
      paddingVertical: 10,
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
    headerMain: {
      flex: 1,
      marginHorizontal: Spacing.sm,
    },
    headerLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: 2,
    },
    headerMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: 4,
    },
    purposeChip: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      backgroundColor: INDIGO,
    },
    purposeChipText: {
      fontSize: FontSizes.xs,
      color: '#E0E7FF',
      fontWeight: FontWeights.semibold,
    },
    headerMetaText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    headerSide: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    statusPillActive: {
      backgroundColor: '#EEF2FF',
      color: INDIGO,
    } as any,
    statusPillClosed: {
      backgroundColor: '#E5E7EB',
      color: '#4B5563',
    } as any,
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      backgroundColor: Colors.card,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    summaryText: {
      flex: 1,
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
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.md,
    },
    messageRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    messageRowMine: {
      justifyContent: 'flex-end',
    },
    messageRowTheirs: {
      justifyContent: 'flex-start',
    },
    avatarSlot: {
      width: 34,
      marginRight: 6,
      alignItems: 'flex-end',
    },
    bubble: {
      maxWidth: '80%',
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
      ...Shadows.sm,
    },
    bubbleMine: {
      backgroundColor: INDIGO,
      borderBottomRightRadius: 6,
    },
    bubbleTheirs: {
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderBottomLeftRadius: 6,
    },
    senderName: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginBottom: 2,
      fontWeight: FontWeights.semibold,
    },
    messageText: {
      fontSize: FontSizes.md,
      lineHeight: 20,
    },
    messageTextMine: {
      color: '#ffffff',
    },
    messageTextTheirs: {
      color: Colors.text,
    },
    timeText: {
      fontSize: 10,
      marginTop: 4,
    },
    timeTextMine: {
      color: '#E5E7EB',
      textAlign: 'right',
    },
    timeTextTheirs: {
      color: Colors.textSecondary,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      backgroundColor: Colors.surface,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      gap: Spacing.sm,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.background,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: INDIGO,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    closedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      backgroundColor: Colors.card,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    closedBannerText: {
      flex: 1,
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
  });

