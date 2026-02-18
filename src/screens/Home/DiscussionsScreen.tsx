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
  const [searchQuery, setSearchQuery] = useState('');

  const isFacultyOrAdmin = profile?.role === 'faculty' || profile?.role === 'admin';

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
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
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

  return (
    <TouchableOpacity style={[styles.topicCard, { borderColor: Colors.border }]} onPress={onPress}>
      <View style={styles.topicHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '15' }]}>
          <MaterialIcons name={iconName as any} size={16} color={categoryColor} />
          <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
            {topic.category.charAt(0).toUpperCase() + topic.category.slice(1)}
          </Text>
        </View>
        {canPin && (
          <TouchableOpacity onPress={onPin} style={styles.pinButton}>
            <MaterialIcons
              name={topic.is_pinned ? 'push-pin' : 'push-pin'}
              size={18}
              color={topic.is_pinned ? Colors.primary : Colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.topicTitle, { color: Colors.text }]}>{getCleanDiscussionTitle(topic.title)}</Text>

      <View style={styles.topicFooter}>
        <View style={styles.topicMeta}>
          <MaterialIcons name="person-outline" size={16} color={Colors.textSecondary} />
          <Text style={[styles.topicMetaText, { color: Colors.textSecondary }]}>
            {topic.creator?.full_name || 'User'}
          </Text>
        </View>
        <View style={styles.topicMeta}>
          <MaterialIcons name="chat-bubble-outline" size={16} color={Colors.textSecondary} />
          <Text style={[styles.topicMetaText, { color: Colors.textSecondary }]}>
            {topic.replies_count || 0} replies
          </Text>
        </View>
        <Text style={[styles.topicTime, { color: Colors.textSecondary }]}>
          {dayjs(topic.created_at).fromNow()}
        </Text>
      </View>

      {topic.is_locked && (
        <View style={styles.lockedBadge}>
          <MaterialIcons name="lock" size={14} color="#ef4444" />
          <Text style={styles.lockedText}>Locked</Text>
        </View>
      )}
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
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
      position: 'relative',
    },
    topicHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    categoryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
    },
    categoryBadgeText: {
      fontSize: 12,
      fontWeight: FontWeights.semibold,
    },
    pinButton: {
      padding: 4,
    },
    topicTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      marginBottom: 12,
      lineHeight: 22,
    },
    topicFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
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
      marginLeft: 'auto',
    },
    lockedBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: '#fee2e2',
      borderRadius: BorderRadius.sm,
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
