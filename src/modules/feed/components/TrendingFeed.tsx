import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FeedPost } from '../types/feed';

type Props = {
  posts: FeedPost[];
  onPress: (postId: string) => void;
  onLikePress: (postId: string) => void;
};

export default function TrendingFeed({ posts, onPress, onLikePress }: Props) {
  if (!posts || posts.length === 0) {
    return null;
  }

  const renderItem = ({ item }: { item: FeedPost }) => (
    <TouchableOpacity
      style={styles.trendingCard}
      onPress={() => onPress(item.id)}
      activeOpacity={0.85}
    >
      <View style={styles.trendingBadge}>
        <MaterialIcons name="local-fire-department" size={14} color="#ef4444" />
        <Text style={styles.trendingBadgeText}>Trending</Text>
      </View>

      <Text style={styles.trendingTitle} numberOfLines={2}>
        {item.content.substring(0, 50)}...
      </Text>

      <View style={styles.trendingFooter}>
        <View style={styles.trendingStats}>
          <View style={styles.trendingStat}>
            <MaterialIcons name="favorite" size={12} color="#ef4444" />
            <Text style={styles.trendingStatText}>{item.likes_count || 0}</Text>
          </View>
          <View style={styles.trendingStat}>
            <MaterialIcons name="comment" size={12} color="#64748b" />
            <Text style={styles.trendingStatText}>{item.comments_count || 0}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.trendingLikeBtn}
          onPress={() => onLikePress(item.id)}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name={item.is_liked ? 'favorite' : 'favorite-border'}
            size={14}
            color={item.is_liked ? '#ef4444' : '#94a3b8'}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔥 Trending Today</Text>
      </View>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        scrollEventThrottle={16}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  trendingCard: {
    width: 160,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  trendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  trendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  trendingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    lineHeight: 16,
  },
  trendingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trendingStats: {
    flexDirection: 'row',
    gap: 8,
  },
  trendingStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendingStatText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  trendingLikeBtn: {
    padding: 6,
  },
});
