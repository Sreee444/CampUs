import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getDiscussionTopics, pinDiscussionTopic } from '../../api/discussions';
import { DiscussionTopic } from '../../types/database';
import { getCleanDiscussionTitle } from '../../utils/discussionHelpers';
import { isFacultyOrAdminRole } from '../../utils/roles';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

type NavigationProp = StackNavigationProp<RootStackParamList>;

const categories = ['All', 'Academic', 'Doubt', 'Project', 'General'];

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

export default function DiscussionsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user, profile } = useAuth();

  const [topics, setTopics] = useState<DiscussionTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const isFacultyOrAdmin = isFacultyOrAdminRole(profile?.role);

  useFocusEffect(
    React.useCallback(() => {
      loadTopics();
    }, [])
  );

  const loadTopics = async () => {
    try {
      setIsLoading(true);
      const data = await getDiscussionTopics();
      setTopics(data);
    } catch (error) {
      console.error('Failed to load discussions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinTopic = async (topicId: string, isPinned: boolean) => {
    if (!isFacultyOrAdmin) return;
    try {
      await pinDiscussionTopic(topicId, !isPinned);
      await loadTopics();
    } catch (error) {
      console.error('Failed to pin topic:', error);
    }
  };

  const applySearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const filteredTopics = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return topics.filter((topic) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        topic.category === selectedCategory.toLowerCase();
      const matchesSearch = normalizedSearch
        ? topic.title.toLowerCase().includes(normalizedSearch)
        : true;
      return matchesCategory && matchesSearch;
    });
  }, [topics, selectedCategory, searchQuery]);

  const pinnedTopics = filteredTopics.filter(t => t.is_pinned);
  const regularTopics = filteredTopics.filter(t => !t.is_pinned);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Discussions</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateTopic')}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search discussions..."
            placeholderTextColor="#94a3b8"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={applySearch}
            returnKeyType="search"
          />
          {!!searchInput && (
            <TouchableOpacity
              onPress={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
            >
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.resultsText}>
            {filteredTopics.length} {filteredTopics.length === 1 ? 'Discussion' : 'Discussions'}
          </Text>

          {/* Pinned Topics */}
          {pinnedTopics.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="push-pin" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Pinned</Text>
              </View>
              {pinnedTopics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  onPress={() => navigation.navigate('DiscussionTopic', { topicId: topic.id })}
                  onPin={() => handlePinTopic(topic.id, topic.is_pinned)}
                  canPin={isFacultyOrAdmin}
                  Colors={Colors}
                  styles={styles}
                />
              ))}
            </>
          )}

          {/* Regular Topics */}
          {regularTopics.length > 0 ? (
            regularTopics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onPress={() => navigation.navigate('DiscussionTopic', { topicId: topic.id })}
                onPin={() => handlePinTopic(topic.id, topic.is_pinned)}
                canPin={isFacultyOrAdmin}
                Colors={Colors}
                styles={styles}
              />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="forum" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No discussions found</Text>
              <Text style={styles.emptySubtext}>Start a new discussion!</Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type TopicCardProps = {
  topic: DiscussionTopic;
  onPress: () => void;
  onPin: () => void;
  canPin: boolean;
  Colors: ReturnType<typeof getColors>;
  styles: any;
};

function TopicCard({ topic, onPress, onPin, canPin, Colors, styles }: TopicCardProps) {
  const categoryColor = categoryColors[topic.category];
  const iconName = categoryIcons[topic.category];
  const replyCount = topic.replies_count || 0;
  const hasReplies = replyCount > 0;

  return (
    <TouchableOpacity 
      style={[styles.topicCard, { borderColor: Colors.border }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Category & Pin Header */}
      <View style={styles.topicHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
          <View style={[styles.categoryIconWrap, { backgroundColor: categoryColor }]}>
            <MaterialIcons name={iconName as any} size={14} color="#fff" />
          </View>
          <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
            {topic.category.charAt(0).toUpperCase() + topic.category.slice(1)}
          </Text>
        </View>
        
        <View style={styles.topicHeaderRight}>
          {topic.is_locked && (
            <View style={styles.lockedBadgeInline}>
              <MaterialIcons name="lock" size={14} color="#ef4444" />
            </View>
          )}
          {canPin && (
            <TouchableOpacity onPress={onPin} style={styles.pinButton}>
              <MaterialIcons
                name="push-pin"
                size={18}
                color={topic.is_pinned ? Colors.primary : Colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Topic Title */}
      <Text style={[styles.topicTitle, { color: Colors.text }]} numberOfLines={2}>
        {getCleanDiscussionTitle(topic.title)}
      </Text>

      {/* Author & Time Row */}
      <View style={styles.authorRow}>
        <View style={styles.avatarCircle}>
          <MaterialIcons name="account-circle" size={32} color={categoryColor} />
        </View>
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, { color: Colors.text }]} numberOfLines={1}>
            {topic.creator?.full_name || 'User'}
          </Text>
          <Text style={[styles.topicTime, { color: Colors.textSecondary }]}>
            {dayjs(topic.created_at).fromNow()}
          </Text>
        </View>
      </View>

      {/* Reply Count Badge */}
      <View style={styles.topicFooter}>
        <View style={[styles.replyBadge, hasReplies && styles.replyBadgeActive]}>
          <MaterialIcons 
            name="chat-bubble" 
            size={16} 
            color={hasReplies ? categoryColor : Colors.textSecondary} 
          />
          <Text style={[styles.replyCount, hasReplies && { color: categoryColor }]}>
            {replyCount} {replyCount === 1 ? 'Reply' : 'Replies'}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fdfbf7',
    },
    header: {
      backgroundColor: '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
    },
    headerTitle: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
    searchSection: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      backgroundColor: '#ffffff',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f8fafc',
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.08)',
    },
    searchInput: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    categoriesContainer: {
      maxHeight: 50,
      backgroundColor: '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    categoriesContent: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      gap: 8,
    },
    categoryChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.6)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.8)',
    },
    categoryChipActive: {
      backgroundColor: '#13ecec',
      borderColor: '#13ecec',
    },
    categoryText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
      color: Colors.textSecondary,
    },
    categoryTextActive: {
      color: '#111818',
      fontWeight: '700',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.md,
    },
    resultsText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    topicCard: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 5,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.05)',
    },
    topicHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    topicHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    categoryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    categoryIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryBadgeText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    pinButton: {
      padding: 6,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.03)',
    },
    topicTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 14,
      lineHeight: 24,
      color: '#111827',
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    avatarCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: 'rgba(0,0,0,0.03)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    authorInfo: {
      flex: 1,
    },
    authorName: {
      fontSize: 14,
      fontWeight: '600',
      color: '#1f2937',
      marginBottom: 2,
    },
    topicFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(0,0,0,0.06)',
    },
    replyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    replyBadgeActive: {
      backgroundColor: 'rgba(0,0,0,0.06)',
    },
    replyCount: {
      fontSize: 13,
      fontWeight: '600',
      color: '#6b7280',
    },
    topicMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    topicMetaText: {
      fontSize: 12,
    },
    topicTime: {
      fontSize: 12,
      color: '#9ca3af',
    },
    lockedBadgeInline: {
      padding: 6,
      backgroundColor: '#fee2e2',
      borderRadius: 12,
    },
    lockedText: {
      fontSize: 11,
      color: '#ef4444',
      fontWeight: FontWeights.semibold,
    },
    loadingWrapper: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xl,
      gap: 8,
    },
    emptyText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    emptySubtext: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
  });
