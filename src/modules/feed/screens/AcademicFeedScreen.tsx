import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { supabase } from '../../../api/supabase';
import { deleteFeedPost, togglePostLike } from '../api/feed';
import FeedCard from '../components/FeedCard';
import CreateFeedFAB from '../components/CreateFeedFAB';
import { FeedPost } from '../types/feed';

type Nav = StackNavigationProp<RootStackParamList, 'AcademicFeed'>;

const PAGE_SIZE = 10;

const normalizeJoined = (value: any) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
};

const normalizeImageUrl = (value: string) => {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;

  let filePath = value.trim();
  if (filePath.startsWith('/')) filePath = filePath.slice(1);
  if (filePath.startsWith('post-images/')) filePath = filePath.slice('post-images/'.length);

  const { data } = supabase.storage.from('post-images').getPublicUrl(filePath);
  return data.publicUrl;
};

const mapImages = (rawImages: any): string[] => {
  if (!Array.isArray(rawImages)) return [];
  return rawImages.map((img) => normalizeImageUrl(String(img))).filter(Boolean);
};

const mapFeedPost = (row: any): FeedPost => {
  const author = normalizeJoined(row.author);
  return {
    id: row.id,
    author_id: row.author_id || author?.id || '',
    content: row.content || '',
    type: row.type || 'general',
    visibility: 'global',
    is_approved: true,
    is_pinned: !!row.is_pinned,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    images: mapImages(row.images),
    author: author
      ? {
          id: author.id,
          name: author.full_name,
          full_name: author.full_name,
          avatar_url: author.avatar_url,
          role: author.role || 'faculty',
          department: author.department,
        }
      : undefined,
    likes_count: row.post_likes?.[0]?.count || 0,
    comments_count: row.post_comments?.[0]?.count || 0,
    is_liked: !!row.is_liked,
  };
};

export default function AcademicFeedScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const role = (profile?.role || '').toLowerCase();

  const fetchFeeds = useCallback(async (pageToLoad = 0, reset = false) => {
    if (!user?.id) return;

    const from = pageToLoad * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      if (reset) setRefreshing(true);
      else if (pageToLoad === 0) setLoading(true);
      else setLoadingMore(true);

      const { data, error } = await supabase
        .from('feed_posts')
        .select(`id,
          author_id,
          content,
          images,
          type,
          is_pinned,
          created_at,
          author:profiles!feed_posts_author_id_fkey(
            id,
            full_name,
            avatar_url,
            department,
            role
          ),
          post_likes(count),
          post_comments(count)`)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Feed load error:', error);
        throw error;
      }

      const rows = data || [];
      const postIds = rows.map((row: any) => row.id);

      const { data: likedRows } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds.length ? postIds : ['']);

      const likedSet = new Set((likedRows || []).map((item: any) => item.post_id));
      const mapped = rows.map((row: any) => mapFeedPost({ ...row, is_liked: likedSet.has(row.id) }));

      setPosts((prev) => (reset || pageToLoad === 0 ? mapped : [...prev, ...mapped]));
      setPage(pageToLoad);
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Feed load failed',
        text2: err?.message || 'Please try again',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchFeeds(0, true);
  }, [fetchFeeds]);

  const handleLoadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    fetchFeeds(page + 1);
  };

  const handleRefresh = () => {
    fetchFeeds(0, true);
  };

  const handleToggleLike = async (postId: string) => {
    if (!user?.id) return;

    try {
      const liked = await togglePostLike(postId, user.id);
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
    } catch (error) {
      console.error('Feed load error:', error);
    }
  };

  const canDeletePost = useCallback(
    (post: FeedPost) => {
      const isAdmin = role === 'admin';
      const isFacultyOwner = role === 'faculty' && post.author_id === user?.id;
      return isAdmin || isFacultyOwner;
    },
    [role, user?.id],
  );

  const handleDeletePost = useCallback(async () => {
    if (!deletePostId) return;
    try {
      setDeleting(true);
      await deleteFeedPost(deletePostId);
      setPosts((prev) => prev.filter((post) => post.id !== deletePostId));
      Toast.show({ type: 'success', text1: 'Post deleted successfully' });
      setDeletePostId(null);
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to delete post',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setDeleting(false);
    }
  }, [deletePostId]);

  const renderItem = ({ item }: { item: FeedPost }) => (
    <View style={styles.cardWrap}>
      <FeedCard
        post={item}
        onPress={() => navigation.navigate('FeedDetails', { postId: item.id })}
        onLikePress={handleToggleLike}
        onCommentPress={() => navigation.navigate('FeedDetails', { postId: item.id, focusComment: true })}
        canDelete={canDeletePost(item)}
        onDeletePress={(postId) => setDeletePostId(postId)}
        onAttachmentPress={(postId, imageIndex) =>
          navigation.navigate('FeedDetails', {
            postId,
            focusAttachment: true,
            attachmentIndex: imageIndex,
          })
        }
      />
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator size="small" color="#0f766e" />
      </View>
    );
  };

  const renderEmptyState = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateIcon}>??</Text>
        <Text style={styles.emptyStateTitle}>No feed posts yet</Text>
        <Text style={styles.emptyStateSubtitle}>New academic posts will appear here.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Academic Feed</Text>
      </View>

      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0f766e" />
        }
      />

      <CreateFeedFAB />

      <ConfirmDialog
        visible={!!deletePostId}
        title="Delete Feed Post"
        message="This post will be removed from the feed. This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onConfirm={handleDeletePost}
        onCancel={() => !deleting && setDeletePostId(null)}
        type="danger"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#eefcf8',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  cardWrap: {
    marginBottom: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
