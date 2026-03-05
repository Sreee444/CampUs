import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { addEventDiscussion, deleteEventDiscussionThread, getEvent } from '../../api/events';
import {
  getDiscussionTopic,
  getTopicReplies,
  postReply,
  markAsSolution,
  lockDiscussionTopic,
  deleteDiscussionTopic,
  deleteReply,
} from '../../api/discussions';
import { DiscussionTopic, DiscussionReply } from '../../types/database';
import { getCleanDiscussionTitle, getEventIdFromTitle, isPreEventDiscussion } from '../../utils/discussionHelpers';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import ConfirmDialog from '../../components/ConfirmDialog';

dayjs.extend(relativeTime);

type NavigationProp = StackNavigationProp<RootStackParamList, 'DiscussionTopic'>;
type RouteParams = RouteProp<RootStackParamList, 'DiscussionTopic'>;

const categoryIcons: { [key: string]: string } = {
  academic: 'school',
  doubt: 'help-outline',
  project: 'folder-open',
  general: 'forum',
};

const categoryColors: { [key: string]: string } = {
  academic: '#3b82f6',
  doubt: '#f59e0b',
  project: '#10b981',
  general: '#6366f1',
};

export default function DiscussionTopicScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteParams>();
  const { topicId } = route.params;
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user, profile } = useAuth();

  const [topic, setTopic] = useState<DiscussionTopic | null>(null);
  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [relatedEvent, setRelatedEvent] = useState<any>(null);
  const [isEventTimingOpen, setIsEventTimingOpen] = useState(true);
  const [replyDisabledReason, setReplyDisabledReason] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const isFacultyOrAdmin = profile?.role === 'faculty' || profile?.role === 'admin';
  const isTopicCreator = topic?.created_by === user?.id;

  useEffect(() => {
    loadTopic();
  }, [topicId]);

  const loadTopic = async () => {
    try {
      setIsLoading(true);
      const [topicData, repliesData] = await Promise.all([
        getDiscussionTopic(topicId),
        getTopicReplies(topicId),
      ]);
      setTopic(topicData);
      setReplies(repliesData);

      // Check if this is an event discussion by looking for event ID in title
      // Title format: "[Pre-Event] [event-123] Topic Title" or "[Post-Event] [event-456] Topic"
      const eventIdMatch = topicData?.title?.match(/\[event-([^\]]+)\]/);
      
      if (eventIdMatch && eventIdMatch[1]) {
        const eventId = eventIdMatch[1];
        try {
          const eventData = await getEvent(eventId, user?.id);
          setRelatedEvent(eventData);

          // Check timing based on discussion type
          const now = new Date();
          const eventStart = new Date(eventData.start_date);
          const eventEnd = new Date(eventData.end_date);

          // Determine if this is pre or post event discussion based on title prefix
          const isPreEvent = topicData.title?.includes('[Pre-Event]');
          
          let timingOpen = true;
          let disabledReason = '';

          if (isPreEvent) {
            // Pre-event: only open before event starts
            if (now >= eventStart) {
              timingOpen = false;
              disabledReason = '🔒 Pre-event discussion closed. Event has started.';
            }
          } else {
            // Post-event: only open after event ends
            if (now < eventEnd) {
              timingOpen = false;
              disabledReason = '⏳ Post-event discussion opens after the event ends.';
            }
          }

          setIsEventTimingOpen(timingOpen);
          setReplyDisabledReason(disabledReason);
        } catch (eventError) {
          console.warn('Could not load event details:', eventError);
          // Allow replies if event not found
          setIsEventTimingOpen(true);
        }
      }
    } catch (error) {
      console.error('Failed to load topic:', error);
      Toast.show({ type: 'error', text1: 'Failed to load discussion' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostReply = async () => {
    if (!replyContent.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter a reply' });
      return;
    }

    if (!isEventTimingOpen) {
      Toast.show({ type: 'error', text1: replyDisabledReason });
      return;
    }

    if (!user?.id) return;

    try {
      setIsPosting(true);
      await postReply(topicId, user.id, replyContent.trim());

      // Mirror into event_discussions if this is an event-linked topic
      const eventId = getEventIdFromTitle(topic?.title);
      if (eventId) {
        await addEventDiscussion(eventId, user.id, replyContent.trim(), isPreEventDiscussion(topic?.title));
      }

      setReplyContent('');
      await loadTopic();
      Toast.show({ type: 'success', text1: 'Reply posted!' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to post reply', text2: error.message });
    } finally {
      setIsPosting(false);
    }
  };

  const handleMarkSolution = async (replyId: string) => {
    if (!isFacultyOrAdmin && !isTopicCreator) return;

    try {
      await markAsSolution(replyId);
      await loadTopic();
      Toast.show({ type: 'success', text1: 'Marked as solution!' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to mark solution' });
    }
  };

  const handleLockTopic = async () => {
    if (!isFacultyOrAdmin) return;

    try {
      await lockDiscussionTopic(topicId, !topic?.is_locked);
      await loadTopic();
      Toast.show({
        type: 'success',
        text1: topic?.is_locked ? 'Topic unlocked' : 'Topic locked',
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to update topic' });
    }
  };

  const handleDeleteTopic = () => {
    console.log('Delete topic clicked:', topicId);
    setConfirmDialog({
      visible: true,
      title: 'Delete Discussion',
      message: 'Are you sure you want to delete this discussion? This action cannot be undone.',
      onConfirm: deleteTopicConfirmed,
    });
  };

  const deleteTopicConfirmed = async () => {
    try {
      console.log('Deleting topic:', topicId);
      await deleteDiscussionTopic(topicId);

      const eventId = getEventIdFromTitle(topic?.title);
      if (eventId) {
        await deleteEventDiscussionThread(eventId, isPreEventDiscussion(topic?.title));
      }

      Toast.show({ type: 'success', text1: 'Discussion deleted' });
      navigation.goBack();
    } catch (error) {
      console.error('Delete topic error:', error);
      Toast.show({ type: 'error', text1: 'Failed to delete' });
    }
  };

  const handleDeleteReply = (replyId: string) => {
    console.log('Delete reply clicked:', replyId);
    setConfirmDialog({
      visible: true,
      title: 'Delete Reply',
      message: 'Are you sure you want to delete this reply? This action cannot be undone.',
      onConfirm: () => deleteReplyConfirmed(replyId),
    });
  };

  const deleteReplyConfirmed = async (replyId: string) => {
    try {
      console.log('Deleting reply:', replyId);
      await deleteReply(replyId);
      Toast.show({ type: 'success', text1: 'Reply deleted' });
      // Reload topic to refresh replies list
      await loadTopic();
    } catch (error) {
      console.error('Delete reply error:', error);
      Toast.show({ type: 'error', text1: 'Failed to delete reply' });
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!topic) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.errorText}>Discussion not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColor = categoryColors[topic.category];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Discussion
        </Text>
        {(isFacultyOrAdmin || isTopicCreator) && (
          <TouchableOpacity 
            onPress={handleLockTopic} 
            style={styles.headerAction}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
          >
            <MaterialIcons
              name={topic.is_locked ? 'lock' : 'lock-open'}
              size={22}
              color={Colors.text}
            />
          </TouchableOpacity>
        )}
        {(isFacultyOrAdmin || isTopicCreator) && (
          <TouchableOpacity 
            onPress={handleDeleteTopic} 
            style={styles.headerAction}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
          >
            <MaterialIcons name="delete-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Topic Header */}
          <View style={styles.topicCard}>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
              <View style={[styles.categoryIconWrap, { backgroundColor: categoryColor }]}>
                <MaterialIcons 
                  name={categoryIcons[topic.category] as any} 
                  size={16} 
                  color="#fff" 
                />
              </View>
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {topic.category.charAt(0).toUpperCase() + topic.category.slice(1)}
              </Text>
            </View>

            <Text style={styles.title}>{getCleanDiscussionTitle(topic.title)}</Text>

            <View style={styles.topicMetaRow}>
              <View style={styles.authorCard}>
                <View style={[styles.authorAvatar, { backgroundColor: categoryColor + '20' }]}>
                  <MaterialIcons name="account-circle" size={40} color={categoryColor} />
                </View>
                <View style={styles.authorDetails}>
                  <Text style={styles.authorLabel}>Created by</Text>
                  <Text style={styles.authorNameText}>{topic.creator?.full_name || 'User'}</Text>
                  <View style={styles.timeRow}>
                    <MaterialIcons name="schedule" size={14} color={Colors.textSecondary} />
                    <Text style={styles.metaText}>{dayjs(topic.created_at).fromNow()}</Text>
                  </View>
                </View>
              </View>
            </View>

            {topic.is_locked && (
              <View style={styles.lockedBanner}>
                <MaterialIcons name="lock" size={18} color="#ef4444" />
                <Text style={styles.lockedText}>🔒 This discussion is locked</Text>
              </View>
            )}
          </View>

          {/* Replies */}
          <View style={styles.repliesSection}>
            <View style={styles.repliesSectionHeader}>
              <MaterialIcons name="forum" size={20} color={Colors.primary} />
              <Text style={styles.repliesHeader}>
                {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
              </Text>
            </View>

            {replies.map((reply) => {
              const canDelete = reply.user_id === user?.id || isFacultyOrAdmin || isTopicCreator;
              const canMarkSolution = !reply.is_solution && (isFacultyOrAdmin || isTopicCreator);
              
              console.log('Reply permissions:', {
                replyId: reply.id,
                replyUserId: reply.user_id,
                currentUserId: user?.id,
                canDelete,
                canMarkSolution,
                isFacultyOrAdmin,
                isTopicCreator
              });
              
              return (
              <View
                key={reply.id}
                style={[
                  styles.replyCard,
                  reply.is_solution && styles.replyCardSolution,
                ]}
              >
                {reply.is_solution && (
                  <View style={styles.solutionBadge}>
                    <MaterialIcons name="check-circle" size={18} color="#10b981" />
                    <Text style={styles.solutionText}>✓ Marked as Solution</Text>
                  </View>
                )}

                <View style={styles.replyHeader}>
                  <TouchableOpacity 
                    style={styles.replyAuthor}
                    onPress={() => {
                      if (reply.user_id) {
                        navigation.navigate('PublicProfile', { userId: reply.user_id });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.replyAvatar, { backgroundColor: categoryColor + '20' }]}>
                      <MaterialIcons name="account-circle" size={44} color={categoryColor} />
                    </View>
                    <View style={styles.replyAuthorInfo}>
                      <Text style={styles.authorName}>{reply.user?.full_name || 'User'}</Text>
                      <View style={styles.replyTimeRow}>
                        <MaterialIcons name="schedule" size={12} color={Colors.textSecondary} />
                        <Text style={styles.replyTime}>{dayjs(reply.created_at).fromNow()}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.actionsRow}>
                    {canMarkSolution && (
                      <TouchableOpacity
                        onPress={() => {
                          console.log('Mark solution clicked for reply:', reply.id);
                          handleMarkSolution(reply.id);
                        }}
                        style={[styles.actionButton, styles.actionButtonPrimary]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.6}
                      >
                        <MaterialIcons name="check-circle-outline" size={20} color={Colors.primary} />
                      </TouchableOpacity>
                    )}

                    {canDelete && (
                      <TouchableOpacity
                        onPress={() => {
                          console.log('Delete button clicked for reply:', reply.id);
                          handleDeleteReply(reply.id);
                        }}
                        style={[styles.actionButton, styles.actionButtonDanger]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.6}
                      >
                        <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <Text style={styles.replyContent}>{reply.content}</Text>
              </View>
            );
            })}
          </View>
        </ScrollView>

        {/* Reply Input */}
        {!topic.is_locked ? (
          isEventTimingOpen ? (
            <View style={styles.replyInputContainer}>
              <TextInput
                style={styles.replyInput}
                placeholder="Write a reply..."
                placeholderTextColor={Colors.textSecondary}
                value={replyContent}
                onChangeText={setReplyContent}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendButton, isPosting && styles.sendButtonDisabled]}
                onPress={handlePostReply}
                disabled={isPosting}
              >
                <MaterialIcons name="send" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.disabledDiscussionNotice, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
              <MaterialIcons name="lock" size={18} color="#dc2626" />
              <Text style={[styles.disabledNoticeText, { color: '#dc2626' }]}>{replyDisabledReason}</Text>
            </View>
          )
        ) : null}
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, visible: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, visible: false })}
        type="danger"
      />
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
      gap: 12,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      flex: 1,
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    headerAction: {
      padding: 8,
      minWidth: 32,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
    },
    topicCard: {
      backgroundColor: Colors.card,
      padding: 20,
      marginBottom: 16,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    categoryBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 16,
      gap: 8,
    },
    categoryIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: Colors.text,
      marginBottom: 16,
      lineHeight: 30,
    },
    topicMetaRow: {
      marginTop: 4,
    },
    authorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      backgroundColor: Colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    authorAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    authorDetails: {
      flex: 1,
    },
    authorLabel: {
      fontSize: 11,
      color: Colors.textSecondary,
      marginBottom: 2,
      textTransform: 'uppercase',
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    authorNameText: {
      fontSize: 15,
      fontWeight: '700',
      color: Colors.text,
      marginBottom: 4,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    topicMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaText: {
      fontSize: 12,
      color: Colors.textSecondary,
    },
    metaDot: {
      fontSize: 12,
      color: Colors.textSecondary,
    },
    lockedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      padding: 14,
      backgroundColor: '#fee2e2',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#ef4444',
    },
    lockedText: {
      fontSize: 14,
      color: '#ef4444',
      fontWeight: '700',
    },
    repliesSection: {
      padding: Spacing.md,
    },
    repliesSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 2,
      borderBottomColor: Colors.border,
    },
    repliesHeader: {
      fontSize: 18,
      fontWeight: '800',
      color: Colors.text,
    },
    replyCard: {
      backgroundColor: Colors.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: Colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    replyCardSolution: {
      borderColor: '#10b981',
      borderWidth: 2,
      backgroundColor: '#ecfdf5',
    },
    solutionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: '#d1fae5',
      borderRadius: 20,
      marginBottom: 14,
    },
    solutionText: {
      fontSize: 12,
      color: '#047857',
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    replyHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 12,
    },
    replyAuthor: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    replyAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replyAuthorInfo: {
      flex: 1,
    },
    authorName: {
      fontSize: 15,
      fontWeight: '700',
      color: Colors.text,
      marginBottom: 4,
    },
    replyTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    replyTime: {
      fontSize: 12,
      color: Colors.textSecondary,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      padding: 8,
      minWidth: 36,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    actionButtonPrimary: {
      backgroundColor: Colors.primary + '15',
    },
    actionButtonDanger: {
      backgroundColor: '#fee2e2',
    },
    replyContent: {
      fontSize: 15,
      color: Colors.text,
      lineHeight: 22,
    },
    replyInputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: Spacing.md,
      backgroundColor: Colors.surface,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      gap: Spacing.sm,
    },
    replyInput: {
      flex: 1,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: FontSizes.md,
      color: Colors.text,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    sendButton: {
      backgroundColor: Colors.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
    disabledDiscussionNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: 'transparent',
      borderTopWidth: 1,
      gap: Spacing.md,
    },
    disabledNoticeText: {
      flex: 1,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    errorText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
    },
  });
