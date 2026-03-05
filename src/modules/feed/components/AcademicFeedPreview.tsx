import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../../navigation/types';
import { getHomeScreenFeedPosts, togglePostLike } from '../api/feed';
import FeedCard from './FeedCard';
import { FeedPost } from '../types/feed';

type Nav = StackNavigationProp<RootStackParamList>;

type Props = {
  userId: string;
  userDepartment?: string;
  onLikePress?: (postId: string) => void;
};

export default function AcademicFeedPreview({ userId, userDepartment, onLikePress }: Props) {
  const navigation = useNavigation<Nav>();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPreview = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const data = await getHomeScreenFeedPosts(userId, userDepartment);
      setPosts(data);
    } catch (error) {
      console.error('Feed load error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, userDepartment]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleLike = async (postId: string) => {
    try {
      const liked = await togglePostLike(postId, userId);
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                is_liked: liked,
                likes_count: liked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 1) - 1),
              }
            : post,
        ),
      );
      onLikePress?.(postId);
    } catch (error) {
      console.error('Feed load error:', error);
    }
  };

  const handleViewMore = () => {
    navigation.navigate('AcademicFeed');
  };

  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>?? Academic Feed</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0f766e" />
        </View>
      </View>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>?? Academic Feed</Text>
          <Text style={styles.subtitle}>Latest campus discussions</Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleViewMore}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-forward" size={18} color="#0f766e" />
        </TouchableOpacity>
      </View>

      <View style={styles.cardsWrap}>
        {posts.map((post) => (
          <FeedCard
            key={post.id}
            post={post}
            onPress={() => navigation.navigate('FeedDetails', { postId: post.id })}
            onLikePress={handleLike}
            onCommentPress={() =>
              navigation.navigate('FeedDetails', { postId: post.id, focusComment: true })
            }
            compactAttachments
            onAttachmentPress={(postId, imageIndex) =>
              navigation.navigate('FeedDetails', {
                postId,
                focusAttachment: true,
                attachmentIndex: imageIndex,
              })
            }
          />
        ))}
      </View>

      <TouchableOpacity
        style={styles.viewMoreBtn}
        onPress={handleViewMore}
        activeOpacity={0.8}
      >
        <Text style={styles.viewMoreText}>View All Posts</Text>
        <MaterialIcons name="arrow-forward" size={16} color="#0f766e" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  cardsWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0fdfa',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
  },
});
