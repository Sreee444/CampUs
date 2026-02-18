import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  ActivityIndicator,
  FlatList,
  TextInput,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvent, getEventDiscussions, addEventDiscussion, deleteEventDiscussions } from '../../api/events';
import Toast from 'react-native-toast-message';

type EventDiscussionScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EventDetails'>;
type EventDiscussionScreenRouteProp = RouteProp<RootStackParamList, 'EventDetails'>;

export default function EventDiscussionScreen() {
  const navigation = useNavigation<EventDiscussionScreenNavigationProp>();
  const route = useRoute<EventDiscussionScreenRouteProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const { eventId } = route.params || {};

  const [event, setEvent] = useState<any>(null);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [preEventDiscussion, setPreEventDiscussion] = useState<any>(null);
  const [postEventDiscussion, setPostEventDiscussion] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [discussionType, setDiscussionType] = useState<'pre' | 'post'>('pre');

  useEffect(() => {
    loadEventAndDiscussions();
  }, [eventId]);

  // Reload discussions when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadEventAndDiscussions();
    }, [eventId])
  );

  const loadEventAndDiscussions = async () => {
    if (!eventId) {
      Toast.show({ type: 'error', text1: 'Event ID not found' });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Load event details
      const eventData = await getEvent(eventId, user?.id);
      setEvent(eventData);

      // Load pre-event and post-event discussions from event_discussions table
      const [preEventData, postEventData] = await Promise.all([
        getEventDiscussions(eventId, true),
        getEventDiscussions(eventId, false),
      ]);

      setDiscussions([...preEventData, ...postEventData]);
      
      // Combine messages into discussion groups
      // For pre-event: use first message as "title"
      if (preEventData && preEventData.length > 0) {
        const lastPreMessage = preEventData[preEventData.length - 1];
        setPreEventDiscussion({
          id: `pre-${eventId}`,
          title: 'Pre-event Discussion',
          event_id: eventId,
          is_pre_event: true,
          messages: preEventData,
          reply_count: preEventData.length,
          last_message: lastPreMessage,
          description: lastPreMessage?.message,
        });
      } else {
        setPreEventDiscussion(null);
      }

      // For post-event
      if (postEventData && postEventData.length > 0) {
        const lastPostMessage = postEventData[postEventData.length - 1];
        setPostEventDiscussion({
          id: `post-${eventId}`,
          title: 'Post-event Discussion',
          event_id: eventId,
          is_pre_event: false,
          messages: postEventData,
          reply_count: postEventData.length,
          last_message: lastPostMessage,
          description: lastPostMessage?.message,
        });
      } else {
        setPostEventDiscussion(null);
      }
    } catch (error) {
      console.error('Error loading event discussions:', error);
      Toast.show({ type: 'error', text1: 'Failed to load event discussions' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDiscussion = async () => {
    if (!newTopicTitle.trim() || !user?.id) {
      Toast.show({ type: 'error', text1: 'Please enter a message' });
      return;
    }

    if (!eventId || !event) {
      Toast.show({ type: 'error', text1: 'Event information not loaded' });
      return;
    }

    try {
      setIsCreating(true);

      // Add event discussion message to the event_discussions table
      await addEventDiscussion(
        eventId,
        user.id,
        newTopicTitle,
        discussionType === 'pre'
      );

      setNewTopicTitle('');
      setModalVisible(false);
      
      // Reload discussions to show the new message
      await loadEventAndDiscussions();

      Toast.show({
        type: 'success',
        text1: `${discussionType === 'pre' ? 'Pre-event' : 'Post-event'} message posted!`,
      });
    } catch (error: any) {
      console.error('Error posting discussion:', error);
      Toast.show({ type: 'error', text1: error.message || 'Failed to post discussion' });
    } finally {
      setIsCreating(false);
    }
  };

  const navigateToDiscussion = (topicId: string) => {
    navigation.navigate('DiscussionTopic', { topicId });
  };

  // Delete discussion if user is admin or event creator
  const handleDeleteDiscussion = async (discussionType: 'pre' | 'post') => {
    if (!user?.id || !event) return;

    // Check if user has permission to delete
    const isAdmin = user.role === 'admin';
    const isEventCreator = event.created_by === user.id;

    if (!isAdmin && !isEventCreator) {
      Toast.show({ type: 'error', text1: 'Only admin or event creator can delete discussions' });
      return;
    }

    try {
      await deleteEventDiscussions(event.id, discussionType === 'pre');
      
      // Update state to remove deleted discussion
      if (discussionType === 'pre') {
        setPreEventDiscussion(null);
      } else {
        setPostEventDiscussion(null);
      }

      Toast.show({
        type: 'success',
        text1: `${discussionType === 'pre' ? 'Pre-event' : 'Post-event'} discussion deleted`,
      });
    } catch (error: any) {
      console.error('Error deleting discussion:', error);
      Toast.show({ type: 'error', text1: error.message || 'Failed to delete discussion' });
    }
  };

  // Check event timing
  const getEventTimingStatus = () => {
    if (!event) return { status: 'unknown', isOngoing: false, isOver: false, timeUntilStart: '', timeUntilEnd: '' };
    
    const now = new Date();
    const eventStart = new Date(event.start_date);
    const eventEnd = new Date(event.end_date);

    const isOngoing = now >= eventStart && now < eventEnd;
    const isOver = now >= eventEnd;
    const isUpcoming = now < eventStart;

    let status = 'upcoming';
    if (isOngoing) status = 'ongoing';
    if (isOver) status = 'past';

    // Calculate time remaining
    let timeUntilStart = '';
    let timeUntilEnd = '';

    if (isUpcoming) {
      const diff = eventStart.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      if (days > 0) timeUntilStart = `Starts in ${days}d ${hours % 24}h`;
      else timeUntilStart = `Starts in ${hours}h`;
    }

    if (isOngoing || isOver) {
      const diff = eventEnd.getTime() - now.getTime();
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        timeUntilEnd = `Ends in ${hours}h ${mins}m`;
      } else {
        timeUntilEnd = 'Event has ended';
      }
    }

    return { status, isOngoing, isOver, timeUntilStart, timeUntilEnd };
  };

  const isPreEventPeriodOpen = () => {
    if (!event) return false;
    const now = new Date();
    const eventStart = new Date(event.start_date);
    return now < eventStart; // Before event starts
  };

  const isPostEventPeriodOpen = () => {
    if (!event) return false;
    const now = new Date();
    const eventEnd = new Date(event.end_date);
    return now >= eventEnd; // After event ends
  };

  const timingStatus = getEventTimingStatus();
  const isEventPast = timingStatus.status === 'past';
  const isEventOngoing = timingStatus.status === 'ongoing';

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with Event Info */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Event Discussion</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Event Summary Card */}
        {event && (
          <View style={[styles.eventCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <View style={styles.eventHeader}>
              <View style={styles.eventMeta}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventDate}>
                  <MaterialIcons name="event" size={12} /> {new Date(event.start_date).toLocaleDateString()}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: isEventOngoing ? '#f59e0b' : isEventPast ? '#ef4444' : '#10b981' }]}>
                <Text style={styles.statusText}>
                  {isEventOngoing ? 'Ongoing' : isEventPast ? 'Past' : 'Upcoming'}
                </Text>
              </View>
            </View>

            {event.description && (
              <Text style={styles.eventDescription} numberOfLines={2}>
                {event.description}
              </Text>
            )}

            {/* Event Timing Info */}
            <View style={[styles.timingInfo, { backgroundColor: Colors.border + '30' }]}>
              <Text style={[styles.timingText, { color: Colors.textSecondary }]}>
                {timingStatus.timeUntilStart || timingStatus.timeUntilEnd || 'Event timing'}
              </Text>
            </View>
          </View>
        )}

        {/* Pre-Event Discussion Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Before the Event</Text>
            <MaterialIcons name="question-answer" size={20} color={Colors.primary} />
          </View>

          {preEventDiscussion ? (
            <TouchableOpacity
              style={[styles.discussionCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
              onPress={() => navigateToDiscussion(preEventDiscussion.id)}
              activeOpacity={0.7}
            >
              <View style={styles.discussionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.discussionTitle}>{getCleanDiscussionTitle(preEventDiscussion.title)}</Text>
                  <Text style={styles.discussionMeta}>
                    <MaterialIcons name="forum" size={12} /> {preEventDiscussion.reply_count || 0} discussions
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {(user?.role === 'admin' || event?.created_by === user?.id) && (
                    <TouchableOpacity onPress={() => handleDeleteDiscussion('pre')}>
                      <MaterialIcons name="delete" size={20} color={Colors.danger || '#ef4444'} />
                    </TouchableOpacity>
                  )}
                  <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
                </View>
              </View>
              {preEventDiscussion.description && (
                <Text style={styles.discussionDescription} numberOfLines={2}>
                  {preEventDiscussion.description}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.emptyState, { backgroundColor: Colors.surface + '50' }]}>
              <MaterialIcons name="forum" size={36} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No pre-event discussion yet</Text>
              {isPreEventPeriodOpen() ? (
                <TouchableOpacity
                  style={[styles.createButton, { backgroundColor: Colors.primary + '20' }]}
                  onPress={() => {
                    setDiscussionType('pre');
                    setModalVisible(true);
                  }}
                >
                  <MaterialIcons name="add" size={16} color={Colors.primary} />
                  <Text style={[styles.createButtonText, { color: Colors.primary }]}>Start Discussion</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.closedBadge, { backgroundColor: '#ef444425' }]}>
                  <MaterialIcons name="lock" size={14} color="#dc2626" />
                  <Text style={[styles.closedText, { color: '#dc2626' }]}>Pre-event discussion closed</Text>
                </View>
              )}
            </View>
          )}

          {preEventDiscussion && (
            <Text style={[styles.helperText, { color: isPreEventPeriodOpen() ? Colors.textSecondary : '#dc2626' }]}>
              {isPreEventPeriodOpen()
                ? '💡 Share questions, expectations, and coordinate before the event'
                : '🔒 Pre-event discussion period has ended. Event has started.'}
            </Text>
          )}
        </View>

        {/* Post-Event Collaboration Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>After the Event</Text>
            <MaterialIcons name="feedback" size={20} color={Colors.primary} />
          </View>

          {postEventDiscussion ? (
            <TouchableOpacity
              style={[styles.discussionCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
              onPress={() => navigateToDiscussion(postEventDiscussion.id)}
              activeOpacity={0.7}
            >
              <View style={styles.discussionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.discussionTitle}>{getCleanDiscussionTitle(postEventDiscussion.title)}</Text>
                  <Text style={styles.discussionMeta}>
                    <MaterialIcons name="forum" size={12} /> {postEventDiscussion.reply_count || 0} discussions
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {(user?.role === 'admin' || event?.created_by === user?.id) && (
                    <TouchableOpacity onPress={() => handleDeleteDiscussion('post')}>
                      <MaterialIcons name="delete" size={20} color={Colors.danger || '#ef4444'} />
                    </TouchableOpacity>
                  )}
                  <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
                </View>
              </View>
              {postEventDiscussion.description && (
                <Text style={styles.discussionDescription} numberOfLines={2}>
                  {postEventDiscussion.description}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.emptyState, { backgroundColor: Colors.surface + '50' }]}>
              <MaterialIcons name="comment" size={36} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No post-event discussion yet</Text>
              {isPostEventPeriodOpen() ? (
                <TouchableOpacity
                  style={[styles.createButton, { backgroundColor: Colors.primary + '20' }]}
                  onPress={() => {
                    setDiscussionType('post');
                    setModalVisible(true);
                  }}
                >
                  <MaterialIcons name="add" size={16} color={Colors.primary} />
                  <Text style={[styles.createButtonText, { color: Colors.primary }]}>Share Feedback</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.closedBadge, { backgroundColor: 'rgba(100, 116, 139, 0.2)' }]}>
                  <MaterialIcons name="schedule" size={14} color="#64748b" />
                  <Text style={[styles.closedText, { color: '#64748b' }]}>Event is still ongoing</Text>
                </View>
              )}
            </View>
          )}

          {postEventDiscussion && (
            <Text style={[styles.helperText, { color: isPostEventPeriodOpen() ? Colors.textSecondary : '#64748b' }]}>
              {isPostEventPeriodOpen()
                ? '✨ Share your experience, learnings, and feedback from the event'
                : '⏳ Post-event discussion opens after the event ends'}
            </Text>
          )}
        </View>

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Create Discussion Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {discussionType === 'pre' ? 'Start Pre-Event Discussion' : 'Start Post-Event Discussion'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Discussion Title</Text>
              <TextInput
                style={[styles.input, { borderColor: Colors.border }]}
                placeholder={
                  discussionType === 'pre'
                    ? 'e.g., What to expect? Tips and preparation?'
                    : 'e.g., Most interesting takeaway? What did you learn?'
                }
                placeholderTextColor={Colors.textSecondary}
                value={newTopicTitle}
                onChangeText={setNewTopicTitle}
                maxLength={100}
                editable={!isCreating}
              />
              <Text style={styles.charCount}>{newTopicTitle.length}/100</Text>

              <View style={[styles.infoBox, { backgroundColor: Colors.primary + '15' }]}>
                <MaterialIcons name="info" size={16} color={Colors.primary} />
                <Text style={[styles.infoText, { color: Colors.primary }]}>
                  {discussionType === 'pre'
                    ? 'This discussion will help attendees prepare and ask questions before the event.'
                    : 'This discussion allows attendees to share their experience and feedback after the event.'}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: Colors.border }]}
                onPress={() => setModalVisible(false)}
                disabled={isCreating}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createDiscussionButton, { backgroundColor: Colors.primary }]}
                onPress={handleCreateDiscussion}
                disabled={isCreating || !newTopicTitle.trim()}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="add" size={18} color="#fff" />
                    <Text style={styles.createDiscussionButtonText}>Create</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
      textAlign: 'center',
    },
    eventCard: {
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    eventHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.md,
    },
    eventMeta: {
      flex: 1,
    },
    eventTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 4,
    },
    eventDate: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    statusBadge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
    },
    statusText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      color: '#fff',
    },
    eventDescription: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.md,
      lineHeight: 18,
    },
    section: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
    },
    discussionCard: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    discussionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.md,
    },
    discussionTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    discussionMeta: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 4,
    },
    discussionDescription: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.md,
      lineHeight: 16,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      borderRadius: BorderRadius.lg,
      gap: Spacing.md,
    },
    emptyText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    createButton: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      gap: 6,
      marginTop: Spacing.sm,
    },
    createButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    helperText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      margintop: Spacing.sm,
      fontStyle: 'italic',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      maxHeight: '90%',
      paddingTop: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
    },
    modalBody: {
      padding: Spacing.md,
      maxHeight: 'auto',
    },
    label: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: 4,
    },
    charCount: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      textAlign: 'right',
      marginBottom: Spacing.md,
    },
    infoBox: {
      flexDirection: 'row',
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      alignItems: 'flex-start',
    },
    infoText: {
      flex: 1,
      fontSize: FontSizes.sm,
      lineHeight: 18,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: Spacing.md,
      padding: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    createDiscussionButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    createDiscussionButtonText: {
      color: '#fff',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
    },
    timingInfo: {
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timingText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    closedBadge: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      gap: 6,
      marginTop: Spacing.sm,
    },
    closedText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
  });
