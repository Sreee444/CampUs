import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { isFacultyOrAdminRole } from '../../utils/roles';
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
  addDiscussionReplyReaction,
  removeDiscussionReplyReaction,
  getDiscussionReplyReactions,
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
  const [replyReactions, setReplyReactions] = useState<Map<string, any[]>>(new Map());
  const [pollVoteReplies, setPollVoteReplies] = useState<DiscussionReply[]>([]);
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
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [pollVotesSheet, setPollVotesSheet] = useState<null | {
    question: string;
    options: string[];
    counts: number[];
    votersByOption: Array<Array<{ id: string; name: string }>>;
  }>(null);

  const POLL_MESSAGE_PREFIX = '__poll__:';
  const POLL_REACTION_PREFIX = 'poll:';
  const POLL_VOTE_PREFIX = '__poll_vote__:';

  const parsePollPayload = (content?: string | null) => {
    if (!content || typeof content !== 'string' || !content.startsWith(POLL_MESSAGE_PREFIX)) return null;
    try {
      const parsed = JSON.parse(content.slice(POLL_MESSAGE_PREFIX.length));
      if (!parsed?.question || !Array.isArray(parsed?.options) || parsed.options.length < 2) return null;
      return {
        question: String(parsed.question),
        options: parsed.options.map((opt: any) => String(opt)).filter((opt: string) => !!opt.trim()),
      };
    } catch {
      return null;
    }
  };

  const parsePollVotePayload = (content?: string | null): { pollReplyId: string; optionIndex: number } | null => {
    if (!content || typeof content !== 'string' || !content.startsWith(POLL_VOTE_PREFIX)) return null;
    try {
      const parsed = JSON.parse(content.slice(POLL_VOTE_PREFIX.length));
      if (!parsed?.pollReplyId || typeof parsed?.optionIndex !== 'number') return null;
      return { pollReplyId: String(parsed.pollReplyId), optionIndex: parsed.optionIndex };
    } catch {
      return null;
    }
  };

  const getPollReactionKey = (optionIndex: number) => `${POLL_REACTION_PREFIX}${optionIndex}`;

  const loadReplyReactions = async (replyIds: string[]) => {
    try {
      const map = await getDiscussionReplyReactions(replyIds);
      setReplyReactions(map);
    } catch {
      setReplyReactions(new Map());
    }
  };

  const isFacultyOrAdmin = isFacultyOrAdminRole(profile?.role);
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
      const allReplies = repliesData || [];
      const hiddenVoteReplies = allReplies.filter((r: any) => parsePollVotePayload(r.content));
      const visibleReplies = allReplies.filter((r: any) => !parsePollVotePayload(r.content));
      setPollVoteReplies(hiddenVoteReplies);
      setReplies(visibleReplies);
      await loadReplyReactions((visibleReplies || []).map((r: any) => r.id));

      // Check if this is an event discussion using explicit metadata first,
      // then fallback to legacy event id encoded in title.
      const eventId = topicData?.event_id || getEventIdFromTitle(topicData?.title);
      const eventPhase = topicData?.event_phase || (isPreEventDiscussion(topicData?.title) ? 'pre' : 'post');

      if (eventId) {
        try {
          const eventData = await getEvent(eventId, user?.id);
          setRelatedEvent(eventData);

          // Check timing based on discussion type
          const now = new Date();
          const eventStart = new Date(eventData.start_date);
          const eventEnd = new Date(eventData.end_date);

          // Determine if this is pre or post event discussion.
          const isPreEvent = eventPhase === 'pre';
          
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
      const eventId = topic?.event_id || getEventIdFromTitle(topic?.title);
      if (eventId) {
        const isPre = topic?.event_phase ? topic.event_phase === 'pre' : isPreEventDiscussion(topic?.title);
        await addEventDiscussion(eventId, user.id, replyContent.trim(), isPre);
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

  const handleCreatePoll = async () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((opt) => opt.trim()).filter(Boolean);
    if (!question) {
      Toast.show({ type: 'error', text1: 'Please enter a poll question' });
      return;
    }
    if (options.length < 2) {
      Toast.show({ type: 'error', text1: 'Please add at least 2 options' });
      return;
    }
    if (!user?.id || isCreatingPoll) return;

    try {
      setIsCreatingPoll(true);
      const content = `${POLL_MESSAGE_PREFIX}${JSON.stringify({
        question,
        options,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      })}`;
      await postReply(topicId, user.id, content);

      const eventId = topic?.event_id || getEventIdFromTitle(topic?.title);
      if (eventId) {
        const isPre = topic?.event_phase ? topic.event_phase === 'pre' : isPreEventDiscussion(topic?.title);
        await addEventDiscussion(eventId, user.id, content, isPre);
      }

      setShowCreatePoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      await loadTopic();
      Toast.show({ type: 'success', text1: 'Poll posted!' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to create poll', text2: error?.message });
    } finally {
      setIsCreatingPoll(false);
    }
  };

  const handlePollVote = async (replyId: string, optionIndex: number) => {
    const current = (replyReactions.get(replyId) || []).filter((r: any) => r.user_id === user?.id && r.emoji?.startsWith(POLL_REACTION_PREFIX));
    const existingVoteReplies = pollVoteReplies.filter((r) => {
      const payload = parsePollVotePayload(r.content);
      return payload?.pollReplyId === replyId && r.user_id === user?.id;
    });
    const existingReplyVote = existingVoteReplies
      .map((r) => parsePollVotePayload(r.content))
      .find((v) => !!v);
    const selectedKey = getPollReactionKey(optionIndex);
    try {
      await Promise.all(
        current
          .filter((r: any) => r.emoji !== selectedKey)
          .map((r: any) => removeDiscussionReplyReaction(replyId, r.emoji))
      );

      const hasSelected = current.some((r: any) => r.emoji === selectedKey);
      if (hasSelected) await removeDiscussionReplyReaction(replyId, selectedKey);
      else await addDiscussionReplyReaction(replyId, selectedKey);

      // Hidden vote-reply fallback keeps voting functional even if reaction table is unavailable.
      await Promise.all(existingVoteReplies.map((r) => deleteReply(r.id)));
      const isTogglingOff = existingReplyVote?.optionIndex === optionIndex;
      if (!isTogglingOff) {
        await postReply(
          topicId,
          user?.id || '',
          `${POLL_VOTE_PREFIX}${JSON.stringify({ pollReplyId: replyId, optionIndex })}`
        );
      }

      await loadTopic();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to vote', text2: error?.message });
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

      const eventId = topic?.event_id || getEventIdFromTitle(topic?.title);
      if (eventId) {
        const isPre = topic?.event_phase ? topic.event_phase === 'pre' : isPreEventDiscussion(topic?.title);
        await deleteEventDiscussionThread(eventId, isPre);
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
              const pollPayload = parsePollPayload(reply.content);
              const pollReactions = (replyReactions.get(reply.id) || []).filter((reaction: any) => typeof reaction.emoji === 'string' && reaction.emoji.startsWith(POLL_REACTION_PREFIX));
              const voteRepliesForPoll = pollVoteReplies.filter((voteReply) => parsePollVotePayload(voteReply.content)?.pollReplyId === reply.id);
              const hasReactionData = pollReactions.length > 0;
              const pollVoteCounts = pollPayload
                ? pollPayload.options.map((_: any, optionIndex: number) => {
                    if (hasReactionData) {
                      const key = getPollReactionKey(optionIndex);
                      return pollReactions.filter((reaction: any) => reaction.emoji === key).length;
                    }
                    return voteRepliesForPoll.filter((voteReply) => parsePollVotePayload(voteReply.content)?.optionIndex === optionIndex).length;
                  })
                : [];
              const totalPollVotes = pollVoteCounts.reduce((sum: number, count: number) => sum + count, 0);
              const myPollVoteIndex = pollPayload
                ? pollPayload.options.findIndex((_: any, optionIndex: number) => {
                    if (hasReactionData) {
                      const key = getPollReactionKey(optionIndex);
                      return pollReactions.some((reaction: any) => reaction.user_id === user?.id && reaction.emoji === key);
                    }
                    return voteRepliesForPoll.some((voteReply) => {
                      const payload = parsePollVotePayload(voteReply.content);
                      return voteReply.user_id === user?.id && payload?.optionIndex === optionIndex;
                    });
                  })
                : -1;
              
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

                {pollPayload ? (
                  <View style={styles.pollCard}>
                    <Text style={styles.pollQuestion}>{pollPayload.question}</Text>
                    <View style={styles.pollSubtitleRow}>
                      <MaterialIcons name="how-to-vote" size={14} color={styles.pollSubtitle.color as any} />
                      <Text style={styles.pollSubtitle}>Tap an option to vote</Text>
                    </View>
                    <View style={styles.pollDivider} />
                    <View style={styles.pollOptionsWrap}>
                      {pollPayload.options.map((option: string, optionIndex: number) => {
                        const votes = pollVoteCounts[optionIndex] || 0;
                        const votePercent = totalPollVotes > 0 ? Math.round((votes / totalPollVotes) * 100) : 0;
                        const isMyVote = myPollVoteIndex === optionIndex;
                        const optionVoter = hasReactionData
                          ? (pollReactions || []).find((r: any) => r.emoji === getPollReactionKey(optionIndex))
                          : voteRepliesForPoll.find((voteReply) => parsePollVotePayload(voteReply.content)?.optionIndex === optionIndex);
                        return (
                          <TouchableOpacity
                            key={`${reply.id}-poll-option-${optionIndex}`}
                            style={[styles.pollOptionWrap, isMyVote && styles.pollOptionWrapActive]}
                            onPress={() => handlePollVote(reply.id, optionIndex)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.pollOptionRow}>
                              <View style={[styles.pollCheckCircle, isMyVote && styles.pollCheckCircleActive]}>
                                {isMyVote && <MaterialIcons name="check" size={14} color={Colors.text} />}
                              </View>
                              <Text style={styles.pollOptionLabel}>{option}</Text>
                              {!!optionVoter && (
                                (optionVoter as any).user?.avatar_url ? (
                                  <Image source={{ uri: (optionVoter as any).user.avatar_url }} style={styles.pollVoterAvatar} />
                                ) : (
                                  <View style={[styles.pollVoterAvatar, styles.pollVoterAvatarFallback]}>
                                    <Text style={styles.pollVoterAvatarInitial}>{(((optionVoter as any).user?.full_name || 'U')[0] || 'U').toUpperCase()}</Text>
                                  </View>
                                )
                              )}
                              <Text style={styles.pollVoteCount}>{votes}</Text>
                            </View>
                            <View style={styles.pollProgressBg}>
                              <View style={[styles.pollProgressFill, { width: `${votePercent}%`, backgroundColor: isMyVote ? Colors.textSecondary : Colors.border }]} />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.pollDivider} />
                    <TouchableOpacity
                      style={styles.pollViewVotesBtn}
                      onPress={() => {
                        const votersByOption = pollPayload.options.map((_: string, oi: number) => {
                          if (hasReactionData) {
                            return (pollReactions || [])
                              .filter((r: any) => r.emoji === getPollReactionKey(oi))
                              .map((r: any) => ({ id: r.user_id, name: r.user?.full_name || 'User' }));
                          }
                          return voteRepliesForPoll
                            .filter((voteReply) => parsePollVotePayload(voteReply.content)?.optionIndex === oi)
                            .map((voteReply) => ({ id: voteReply.user_id, name: voteReply.user?.full_name || 'User' }));
                        });
                        setPollVotesSheet({
                          question: pollPayload.question,
                          options: pollPayload.options,
                          counts: pollVoteCounts,
                          votersByOption,
                        });
                      }}
                    >
                      <Text style={styles.pollViewVotesText}>View votes</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.replyContent}>{reply.content}</Text>
                )}
              </View>
            );
            })}
          </View>
        </ScrollView>

        {/* Reply Input */}
        {!topic.is_locked ? (
          isEventTimingOpen ? (
            <View style={styles.replyInputContainer}>
              <TouchableOpacity style={styles.pollQuickCreateBtn} onPress={() => setShowCreatePoll(true)}>
                <MaterialIcons name="poll" size={20} color={Colors.primary} />
              </TouchableOpacity>
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

      <Modal visible={showCreatePoll} animationType="slide" transparent onRequestClose={() => setShowCreatePoll(false)}>
        <View style={styles.modalOverlay}><View style={styles.optionsSheet}>
          <Text style={styles.optionsTitle}>Create poll</Text>
          <TextInput
            value={pollQuestion}
            onChangeText={setPollQuestion}
            placeholder="Poll question"
            placeholderTextColor={Colors.textSecondary}
            style={styles.pollInput}
            maxLength={180}
          />
          {pollOptions.map((opt, idx) => (
            <TextInput
              key={`discussion-poll-opt-${idx}`}
              value={opt}
              onChangeText={(txt) => setPollOptions((prev) => prev.map((v, i) => (i === idx ? txt : v)))}
              placeholder={`Option ${idx + 1}`}
              placeholderTextColor={Colors.textSecondary}
              style={styles.pollInput}
              maxLength={80}
            />
          ))}
          {pollOptions.length < 6 && (
            <TouchableOpacity style={styles.pollAddOptionBtn} onPress={() => setPollOptions((prev) => [...prev, ''])}>
              <MaterialIcons name="add" size={18} color={Colors.primary} />
              <Text style={styles.pollAddOptionText}>Add option</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.pollCreateBtn} onPress={handleCreatePoll} disabled={isCreatingPoll}>
            {isCreatingPoll ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pollCreateBtnText}>Create poll</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.pollCancelBtn} onPress={() => setShowCreatePoll(false)}>
            <Text style={styles.pollCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      <Modal
        visible={!!pollVotesSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setPollVotesSheet(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.optionsSheet, { paddingBottom: 24 }]}> 
            <View style={styles.pollVotesHeaderRow}>
              <Text style={styles.optionsTitle}>Poll results</Text>
              <TouchableOpacity onPress={() => setPollVotesSheet(null)}>
                <MaterialIcons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pollVotesQuestion}>{pollVotesSheet?.question}</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {pollVotesSheet?.options.map((opt, oi) => (
                <View key={oi} style={styles.pollVotesOptionBlock}>
                  <View style={styles.pollVotesOptionHead}>
                    <Text style={styles.pollVotesOptionLabel}>{opt}</Text>
                    <Text style={styles.pollVotesOptionCount}>{pollVotesSheet.counts[oi]} vote{pollVotesSheet.counts[oi] === 1 ? '' : 's'}</Text>
                  </View>
                  {pollVotesSheet.votersByOption[oi]?.length > 0 ? (
                    pollVotesSheet.votersByOption[oi].map((voter) => (
                      <Text key={voter.id} style={styles.pollVotesVoterName}>{voter.name}</Text>
                    ))
                  ) : (
                    <Text style={styles.pollVotesEmpty}>No votes yet</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
    pollQuickCreateBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.card,
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
    pollInput: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: Colors.text,
      backgroundColor: Colors.card,
      fontSize: FontSizes.md,
      marginBottom: 8,
    },
    pollAddOptionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      alignSelf: 'flex-start',
    },
    pollAddOptionText: {
      color: Colors.primary,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    pollCreateBtn: {
      marginTop: 6,
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    pollCreateBtnText: {
      color: '#fff',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
    },
    pollCancelBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      marginTop: 4,
    },
    pollCancelBtnText: {
      color: Colors.textSecondary,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    pollCard: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
      paddingTop: 14,
      paddingBottom: 0,
      paddingHorizontal: 14,
    },
    pollQuestion: {
      fontSize: 15,
      fontWeight: '700',
      color: Colors.text,
      marginBottom: 4,
    },
    pollSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    pollSubtitle: {
      fontSize: 12,
      color: Colors.textSecondary,
    },
    pollDivider: {
      height: 0.5,
      backgroundColor: Colors.border,
      marginHorizontal: -14,
      marginBottom: 12,
    },
    pollOptionsWrap: {
      gap: 12,
      marginBottom: 12,
    },
    pollOptionWrap: {
      gap: 8,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    pollOptionWrapActive: {
      borderColor: Colors.border,
      backgroundColor: Colors.border,
    },
    pollOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    pollCheckCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pollCheckCircleActive: {
      borderColor: 'transparent',
      borderWidth: 0,
      backgroundColor: Colors.border,
    },
    pollOptionLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: Colors.text,
    },
    pollVoterAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      marginRight: 6,
    },
    pollVoterAvatarFallback: {
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pollVoterAvatarInitial: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    pollVoteCount: {
      fontSize: 13,
      fontWeight: '600',
      color: Colors.textSecondary,
      minWidth: 16,
      textAlign: 'right',
    },
    pollProgressBg: {
      height: 8,
      borderRadius: 999,
      backgroundColor: Colors.border,
      overflow: 'hidden',
      marginTop: 2,
    },
    pollProgressFill: {
      height: 8,
      borderRadius: 999,
    },
    pollViewVotesBtn: {
      marginHorizontal: -14,
      paddingVertical: 14,
      alignItems: 'center',
      borderTopWidth: 0.5,
      borderTopColor: Colors.border,
    },
    pollViewVotesText: {
      fontSize: 17,
      fontWeight: '700',
      color: Colors.text,
    },
    pollVotesHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pollVotesQuestion: {
      color: Colors.textSecondary,
      fontSize: FontSizes.sm,
      marginBottom: 12,
    },
    pollVotesOptionBlock: {
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: Colors.border,
    },
    pollVotesOptionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
      gap: 8,
    },
    pollVotesOptionLabel: {
      flex: 1,
      color: Colors.text,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    pollVotesOptionCount: {
      color: Colors.textSecondary,
      fontSize: FontSizes.sm,
    },
    pollVotesVoterName: {
      color: Colors.text,
      fontSize: FontSizes.sm,
      marginBottom: 4,
    },
    pollVotesEmpty: {
      color: Colors.textSecondary,
      fontSize: FontSizes.sm,
      fontStyle: 'italic',
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
