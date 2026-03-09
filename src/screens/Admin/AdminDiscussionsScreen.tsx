import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getCleanDiscussionTitle } from '../../utils/discussionHelpers';
import {
  lockDiscussionTopic,
  pinDiscussionTopic,
  unpinDiscussionTopic,
  unlockDiscussionTopic,
} from '../../api/admin';
import { supabase } from '../../api/supabase';
import Toast from 'react-native-toast-message';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminFilterChips from '../../components/admin/AdminFilterChips';

type TopicFilter = 'all' | 'pinned' | 'locked' | 'active';

export default function AdminDiscussionsScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [topics, setTopics] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TopicFilter>('all');

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('discussion_topics')
        .select(
          `
          *,
          creator:profiles!discussion_topics_created_by_fkey(*),
          discussion_replies(count)
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTopics(data || []);
    } catch (error) {
      console.error('Error loading discussions:', error);
      Toast.show({ type: 'error', text1: 'Failed to load discussions' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLockTopic = async (topicId: string) => {
    try {
      setProcessingId(topicId);
      await lockDiscussionTopic(topicId, 'admin-system');
      setTopics((prev) =>
        prev.map((t) => (t.id === topicId ? { ...t, is_locked: true } : t))
      );
      Toast.show({ type: 'success', text1: 'Discussion locked' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to lock discussion' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnlockTopic = async (topicId: string) => {
    try {
      setProcessingId(topicId);
      await unlockDiscussionTopic(topicId);
      setTopics((prev) =>
        prev.map((t) => (t.id === topicId ? { ...t, is_locked: false } : t))
      );
      Toast.show({ type: 'success', text1: 'Discussion unlocked' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to unlock discussion' });
    } finally {
      setProcessingId(null);
    }
  };

  const handlePinTopic = async (topicId: string) => {
    try {
      setProcessingId(topicId);
      await pinDiscussionTopic(topicId);
      setTopics((prev) =>
        prev.map((t) => (t.id === topicId ? { ...t, is_pinned: true } : t))
      );
      Toast.show({ type: 'success', text1: 'Discussion pinned' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to pin discussion' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnpinTopic = async (topicId: string) => {
    try {
      setProcessingId(topicId);
      await unpinDiscussionTopic(topicId);
      setTopics((prev) =>
        prev.map((t) => (t.id === topicId ? { ...t, is_pinned: false } : t))
      );
      Toast.show({ type: 'success', text1: 'Discussion unpinned' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to unpin discussion' });
    } finally {
      setProcessingId(null);
    }
  };

  const renderTopicItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.topicCard, item.is_locked && styles.lockedCard]}
      onPress={() => {
        setSelectedTopic(item);
        setModalVisible(true);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.topicHeader}>
        <View style={styles.topicMeta}>
          <Text style={styles.topicTitle} numberOfLines={2}>
            {getCleanDiscussionTitle(item.title)}
          </Text>
          <View style={styles.badges}>
            {item.is_pinned && (
              <View style={[styles.topicBadge, { backgroundColor: '#f59e0b20' }]}>
                <MaterialIcons name="push-pin" size={12} color="#f59e0b" />
                <Text style={[styles.badgeText, { color: '#f59e0b' }]}>Pinned</Text>
              </View>
            )}
            {item.is_locked && (
              <View style={[styles.topicBadge, { backgroundColor: '#ef444420' }]}>
                <MaterialIcons name="lock" size={12} color="#ef4444" />
                <Text style={[styles.badgeText, { color: '#ef4444' }]}>Locked</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <Text style={styles.topicCategory}>{item.category || 'General'}</Text>

      <View style={styles.topicFooter}>
        <Text style={styles.creatorName}>
          by {item.creator?.full_name || 'Unknown'}
        </Text>
        <Text style={styles.replyCount}>
          {item.discussion_replies?.[0]?.count || 0} replies
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const filteredTopics = topics.filter((topic) => {
    if (filter === 'all') return true;
    if (filter === 'pinned') return !!topic.is_pinned;
    if (filter === 'locked') return !!topic.is_locked;
    return !topic.is_locked;
  });

  const counts = {
    all: topics.length,
    pinned: topics.filter((t) => t.is_pinned).length,
    locked: topics.filter((t) => t.is_locked).length,
    active: topics.filter((t) => !t.is_locked).length,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="Discussion Moderation"
        subtitle="Pin, lock and manage conversation threads"
        count={filteredTopics.length}
        onBack={() => navigation.goBack()}
        onRefresh={loadTopics}
      />

      <AdminFilterChips<TopicFilter>
        selected={filter}
        onSelect={setFilter}
        options={[
          { label: 'All', value: 'all', count: counts.all },
          { label: 'Pinned', value: 'pinned', count: counts.pinned },
          { label: 'Locked', value: 'locked', count: counts.locked },
          { label: 'Active', value: 'active', count: counts.active },
        ]}
      />

      <FlatList
        data={filteredTopics}
        renderItem={renderTopicItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="forum" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No discussions yet</Text>
          </View>
        }
      />

      {/* Topic Details Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}>
            {selectedTopic && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle} numberOfLines={2}>
                    {getCleanDiscussionTitle(selectedTopic.title)}
                  </Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <MaterialIcons name="close" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Category</Text>
                    <Text style={styles.modalValue}>
                      {selectedTopic.category || 'General'}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Created By</Text>
                    <Text style={styles.modalValue}>
                      {selectedTopic.creator?.full_name || 'Unknown'}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Status</Text>
                    <View style={styles.statusContainer}>
                      <View
                        style={[
                          styles.statusBadge,
                          selectedTopic.is_locked ? styles.statusBadgeActive : {},
                        ]}
                      >
                        <MaterialIcons
                          name="lock"
                          size={16}
                          color={selectedTopic.is_locked ? '#fff' : Colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            selectedTopic.is_locked && styles.statusBadgeTextActive,
                          ]}
                        >
                          Locked
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          selectedTopic.is_pinned ? styles.statusBadgeActive : {},
                        ]}
                      >
                        <MaterialIcons
                          name="push-pin"
                          size={16}
                          color={selectedTopic.is_pinned ? '#fff' : Colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            selectedTopic.is_pinned && styles.statusBadgeTextActive,
                          ]}
                        >
                          Pinned
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        selectedTopic.is_locked ? styles.actionButtonAlt : {},
                      ]}
                      onPress={() =>
                        selectedTopic.is_locked
                          ? handleUnlockTopic(selectedTopic.id)
                          : handleLockTopic(selectedTopic.id)
                      }
                      disabled={processingId === selectedTopic.id}
                    >
                      <MaterialIcons
                        name={selectedTopic.is_locked ? 'lock-open' : 'lock'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.actionButtonText}>
                        {selectedTopic.is_locked ? 'Unlock' : 'Lock'} Discussion
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        selectedTopic.is_pinned ? styles.actionButtonAlt : {},
                      ]}
                      onPress={() =>
                        selectedTopic.is_pinned
                          ? handleUnpinTopic(selectedTopic.id)
                          : handlePinTopic(selectedTopic.id)
                      }
                      disabled={processingId === selectedTopic.id}
                    >
                      <MaterialIcons
                        name={selectedTopic.is_pinned ? 'close' : 'push-pin'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.actionButtonText}>
                        {selectedTopic.is_pinned ? 'Unpin' : 'Pin'} Discussion
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
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
    listContent: {
      padding: Spacing.md,
    },
    topicCard: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    lockedCard: {
      opacity: 0.6,
      borderColor: '#ef4444',
    },
    topicHeader: {
      marginBottom: Spacing.md,
    },
    topicMeta: {
      gap: Spacing.sm,
    },
    topicTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    badges: {
      flexDirection: 'row',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    topicBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.md,
    },
    badgeText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    topicCategory: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
      marginBottom: Spacing.md,
    },
    topicFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    creatorName: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    replyCount: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.primary,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: Spacing.md,
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
    },
    modalSection: {
      marginBottom: Spacing.lg,
    },
    modalLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    modalValue: {
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    statusContainer: {
      flexDirection: 'row',
      gap: Spacing.md,
      flexWrap: 'wrap',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    statusBadgeActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    statusBadgeText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
    },
    statusBadgeTextActive: {
      color: '#fff',
    },
    actionButtons: {
      gap: Spacing.md,
      marginTop: Spacing.lg,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    actionButtonAlt: {
      backgroundColor: Colors.textSecondary + '40',
    },
    actionButtonText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
  });
