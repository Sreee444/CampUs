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
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import ConfirmDialog from '../../components/ConfirmDialog';

dayjs.extend(relativeTime);

type NavigationProp = StackNavigationProp<RootStackParamList, 'DiscussionTopic'>;
type RouteParams = RouteProp<RootStackParamList, 'DiscussionTopic'>;

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

    if (!user?.id) return;

    try {
      setIsPosting(true);
      await postReply(topicId, user.id, replyContent.trim());
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
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '15' }]}>
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {topic.category.charAt(0).toUpperCase() + topic.category.slice(1)}
              </Text>
            </View>

            <Text style={styles.title}>{topic.title}</Text>

            <View style={styles.topicMeta}>
              <MaterialIcons name="person-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{topic.creator?.full_name || 'User'}</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{dayjs(topic.created_at).fromNow()}</Text>
            </View>

            {topic.is_locked && (
              <View style={styles.lockedBanner}>
                <MaterialIcons name="lock" size={16} color="#ef4444" />
                <Text style={styles.lockedText}>This discussion is locked</Text>
              </View>
            )}
          </View>

          {/* Replies */}
          <View style={styles.repliesSection}>
            <Text style={styles.repliesHeader}>
              {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
            </Text>

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
                    <MaterialIcons name="check-circle" size={16} color="#10b981" />
                    <Text style={styles.solutionText}>Solution</Text>
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
                    <MaterialIcons name="account-circle" size={32} color={Colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.authorName}>{reply.user?.full_name || 'User'}</Text>
                      <Text style={styles.replyTime}>{dayjs(reply.created_at).fromNow()}</Text>
                    </View>
                  </TouchableOpacity>

                  {canMarkSolution && (
                    <TouchableOpacity
                      onPress={() => {
                        console.log('Mark solution clicked for reply:', reply.id);
                        handleMarkSolution(reply.id);
                      }}
                      style={styles.actionButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      activeOpacity={0.6}
                    >
                      <MaterialIcons name="check-circle" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                  )}

                  {canDelete && (
                    <TouchableOpacity
                      onPress={() => {
                        console.log('Delete button clicked for reply:', reply.id);
                        handleDeleteReply(reply.id);
                      }}
                      style={styles.actionButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      activeOpacity={0.6}
                    >
                      <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.replyContent}>{reply.content}</Text>
              </View>
            );
            })}
          </View>
        </ScrollView>

        {/* Reply Input */}
        {!topic.is_locked && (
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
        )}
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
      padding: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    categoryBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      marginBottom: 12,
    },
    categoryText: {
      fontSize: 12,
      fontWeight: FontWeights.semibold,
    },
    title: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 12,
      lineHeight: 28,
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
      gap: 8,
      marginTop: 12,
      padding: Spacing.sm,
      backgroundColor: '#fee2e2',
      borderRadius: BorderRadius.md,
    },
    lockedText: {
      fontSize: 13,
      color: '#ef4444',
      fontWeight: FontWeights.medium,
    },
    repliesSection: {
      padding: Spacing.md,
    },
    repliesHeader: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.md,
    },
    replyCard: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    replyCardSolution: {
      borderColor: '#10b981',
      borderWidth: 2,
      backgroundColor: '#10b98105',
    },
    solutionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: '#d1fae5',
      borderRadius: BorderRadius.full,
      marginBottom: 12,
    },
    solutionText: {
      fontSize: 11,
      color: '#047857',
      fontWeight: FontWeights.semibold,
    },
    replyHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 8,
    },
    replyAuthor: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    authorName: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    replyTime: {
      fontSize: 11,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    actionButton: {
      padding: 8,
      minWidth: 32,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    replyContent: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      lineHeight: 20,
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
