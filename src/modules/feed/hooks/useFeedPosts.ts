import { useCallback, useEffect, useRef, useState } from 'react';
import { FeedPost, FeedPostType } from '../types/feed';
import {
  getFeedPosts,
  togglePostLike,
  getFeedPostsByDepartment,
  getFeedPostsByType,
} from '../api/feed';

export function useFeedPosts(userId: string, userDepartment: string | undefined, pageSize = 10) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const loadPosts = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current) return;
      if (!reset && !hasMoreRef.current) return;

      if (reset) {
        offsetRef.current = 0;
        setPosts([]);
        setHasMore(true);
        hasMoreRef.current = true;
      }

      try {
        isLoadingRef.current = true;
        setLoading(true);
        setError(null);
        const currentOffset = offsetRef.current;
        const newPosts = await getFeedPosts(userId, userDepartment, pageSize, currentOffset);
        setPosts((prev) => (reset ? newPosts : [...prev, ...newPosts]));
        setHasMore(newPosts.length === pageSize);
        hasMoreRef.current = newPosts.length === pageSize;
        offsetRef.current = currentOffset + pageSize;
      } catch (err: any) {
        setError(err?.message || 'Failed to load posts');
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
      }
    },
    [userId, userDepartment, pageSize],
  );

  useEffect(() => {
    if (!userId) return;
    loadPosts(true);
  }, [userId, userDepartment, pageSize]);

  const toggleLike = useCallback(
    async (postId: string) => {
      try {
        const isLiked = await togglePostLike(postId, userId);
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  is_liked: isLiked,
                  likes_count: isLiked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 1) - 1),
                }
              : post,
          ),
        );
      } catch (err) {
        console.error('Failed to toggle like:', err);
      }
    },
    [userId],
  );

  return { posts, loading, error, hasMore, loadMore: loadPosts, toggleLike };
}

export function useFeedPostsByDepartment(
  userId: string,
  userDepartment: string,
  pageSize = 10,
) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const loadPosts = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current) return;
      if (!reset && !hasMoreRef.current) return;

      if (reset) {
        offsetRef.current = 0;
        setPosts([]);
        setHasMore(true);
        hasMoreRef.current = true;
      }

      try {
        isLoadingRef.current = true;
        setLoading(true);
        setError(null);
        const currentOffset = offsetRef.current;
        const newPosts = await getFeedPostsByDepartment(userId, userDepartment, pageSize, currentOffset);
        setPosts((prev) => (reset ? newPosts : [...prev, ...newPosts]));
        setHasMore(newPosts.length === pageSize);
        hasMoreRef.current = newPosts.length === pageSize;
        offsetRef.current = currentOffset + pageSize;
      } catch (err: any) {
        setError(err?.message || 'Failed to load posts');
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
      }
    },
    [userId, userDepartment, pageSize],
  );

  useEffect(() => {
    if (!userId || !userDepartment) return;
    loadPosts(true);
  }, [userId, userDepartment, pageSize]);

  const toggleLike = useCallback(
    async (postId: string) => {
      try {
        const isLiked = await togglePostLike(postId, userId);
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  is_liked: isLiked,
                  likes_count: isLiked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 1) - 1),
                }
              : post,
          ),
        );
      } catch (err) {
        console.error('Failed to toggle like:', err);
      }
    },
    [userId],
  );

  return { posts, loading, error, hasMore, loadMore: loadPosts, toggleLike };
}

export function useFeedPostsByType(
  userId: string,
  userDepartment: string | undefined,
  type: FeedPostType,
  pageSize = 10,
) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const loadPosts = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current) return;
      if (!reset && !hasMoreRef.current) return;

      if (reset) {
        offsetRef.current = 0;
        setPosts([]);
        setHasMore(true);
        hasMoreRef.current = true;
      }

      try {
        isLoadingRef.current = true;
        setLoading(true);
        setError(null);
        const currentOffset = offsetRef.current;
        const newPosts = await getFeedPostsByType(userId, userDepartment, type, pageSize, currentOffset);
        setPosts((prev) => (reset ? newPosts : [...prev, ...newPosts]));
        setHasMore(newPosts.length === pageSize);
        hasMoreRef.current = newPosts.length === pageSize;
        offsetRef.current = currentOffset + pageSize;
      } catch (err: any) {
        setError(err?.message || 'Failed to load posts');
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
      }
    },
    [userId, userDepartment, type, pageSize],
  );

  useEffect(() => {
    if (!userId) return;
    loadPosts(true);
  }, [userId, userDepartment, type, pageSize]);

  const toggleLike = useCallback(
    async (postId: string) => {
      try {
        const isLiked = await togglePostLike(postId, userId);
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  is_liked: isLiked,
                  likes_count: isLiked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 1) - 1),
                }
              : post,
          ),
        );
      } catch (err) {
        console.error('Failed to toggle like:', err);
      }
    },
    [userId],
  );

  return { posts, loading, error, hasMore, loadMore: loadPosts, toggleLike };
}
