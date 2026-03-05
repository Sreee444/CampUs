import { supabase } from '../../../api/supabase';
import { FeedPost, PostComment, FeedPostType, FeedVisibility } from '../types/feed';

const getJoinedObject = <T = any>(value: any): T | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0] as T | undefined;
  if (typeof value === 'object') return value as T;
  return undefined;
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

export async function getFeedPosts(
  userId: string,
  userDepartment: string | undefined,
  limit = 10,
  offset = 0,
): Promise<FeedPost[]> {
  const { data, error } = await (supabase as any)
    .from('feed_posts')
    .select(`
      id,
      author_id,
      content,
      images,
      type,
      department,
      visibility,
      is_approved,
      is_pinned,
      created_at,
      updated_at,
      author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url, role, department),
      likes_count:post_likes(count),
      comments_count:post_comments(count)
    `)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  // Check which posts are liked by current user
  const { data: userLikes } = await (supabase as any)
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId);

  const likedPostIds = new Set(userLikes?.map((like: any) => like.post_id) || []);

  return (data || []).map((post: any) => ({
    ...post,
    images: mapImages(post.images),
    likes_count: post.likes_count?.[0]?.count || 0,
    comments_count: post.comments_count?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    author: (() => {
      const author = getJoinedObject<any>(post.author);
      if (!author) return undefined;
      return { ...author, name: author.full_name };
    })(),
  }));
}

export async function getHomeScreenFeedPosts(
  userId: string,
  userDepartment: string | undefined,
): Promise<FeedPost[]> {
  const { data, error } = await (supabase as any)
    .from('feed_posts')
    .select(`
      id,
      author_id,
      content,
      images,
      type,
      department,
      visibility,
      is_pinned,
      created_at,
      updated_at,
      author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url, role, department),
      post_likes(count),
      post_comments(count)
    `)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) throw error;

  const { data: userLikes } = await (supabase as any)
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', (data || []).map((row: any) => row.id));

  const likedPostIds = new Set(userLikes?.map((like: any) => like.post_id) || []);

  return (data || []).map((post: any) => ({
    ...post,
    images: mapImages(post.images),
    likes_count: post.post_likes?.[0]?.count || 0,
    comments_count: post.post_comments?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    author: (() => {
      const author = getJoinedObject<any>(post.author);
      if (!author) return undefined;
      return { ...author, name: author.full_name };
    })(),
  }));
}

export async function createFeedPost(
  authorId: string,
  content: string,
  type: FeedPostType,
  visibility: FeedVisibility,
  department?: string,
  images?: string[],
): Promise<FeedPost> {
  const { data, error } = await (supabase as any)
    .from('feed_posts')
    .insert([
      {
        author_id: authorId,
        content,
        type,
        images: images && images.length ? images : null,
        visibility,
        department: visibility === 'department' ? department : null,
        is_pinned: false,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    likes_count: 0,
    comments_count: 0,
    is_liked: false,
  };
}

export async function togglePostLike(postId: string, userId: string): Promise<boolean> {
  // Check if user has already liked
  const { data: existingLike } = await (supabase as any)
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  if (existingLike) {
    // Unlike
    const { error } = await (supabase as any)
      .from('post_likes')
      .delete()
      .eq('id', existingLike.id);

    if (error) throw error;
    return false;
  } else {
    // Like
    const { error } = await (supabase as any)
      .from('post_likes')
      .insert([{ post_id: postId, user_id: userId }]);

    if (error) throw error;
    return true;
  }
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await (supabase as any)
    .from('post_comments')
    .select(`
      id,
      post_id,
      user_id,
      content,
      created_at,
      user:profiles(id, full_name, avatar_url)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((comment: any) => ({
    ...comment,
    user: (() => {
      const user = getJoinedObject<any>(comment.user);
      if (!user) return undefined;
      return { ...user, name: user.full_name };
    })(),
  }));
}

export async function createPostComment(
  postId: string,
  userId: string,
  content: string,
): Promise<PostComment> {
  const { data, error } = await (supabase as any)
    .from('post_comments')
    .insert([
      {
        post_id: postId,
        user_id: userId,
        content,
      },
    ])
    .select(`
      id,
      post_id,
      user_id,
      content,
      created_at,
      user:profiles(id, full_name, avatar_url)
    `)
    .single();

  if (error) throw error;

  return {
    ...data,
    user: (() => {
      const user = getJoinedObject<any>((data as any).user);
      if (!user) return undefined;
      return { ...user, name: user.full_name };
    })(),
  };
}

export async function getPostById(postId: string, userId: string): Promise<FeedPost> {
  const { data, error } = await (supabase as any)
    .from('feed_posts')
    .select(`
      id,
      author_id,
      content,
      images,
      type,
      department,
      visibility,
      is_approved,
      is_pinned,
      created_at,
      updated_at,
      author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url, role, department),
      likes_count:post_likes(count),
      comments_count:post_comments(count)
    `)
    .eq('id', postId)
    .eq('is_deleted', false)
    .single();

  if (error) throw error;

  // Check if user has liked this post
  const { data: userLike } = await (supabase as any)
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  return {
    ...data,
    images: mapImages((data as any).images),
    likes_count: data.likes_count?.[0]?.count || 0,
    comments_count: data.comments_count?.[0]?.count || 0,
    is_liked: !!userLike,
    author: (() => {
      const author = getJoinedObject<any>((data as any).author);
      if (!author) return undefined;
      return { ...author, name: author.full_name };
    })(),
  };
}

export async function deletePostComment(commentId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('post_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}

export async function deleteFeedPost(postId: string): Promise<void> {
  const deletedAt = new Date().toISOString();

  const { error: softDeleteError } = await (supabase as any)
    .from('feed_posts')
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq('id', postId);

  if (!softDeleteError) return;

  const missingColumn =
    (softDeleteError as any)?.message?.includes('is_deleted') ||
    (softDeleteError as any)?.message?.includes('deleted_at');

  if (missingColumn) {
    const { error: hardDeleteError } = await (supabase as any)
      .from('feed_posts')
      .delete()
      .eq('id', postId);

    if (hardDeleteError) throw hardDeleteError;
    return;
  }

  throw softDeleteError;
}

export async function getFeedPostsByDepartment(
  userId: string,
  userDepartment: string,
  limit = 10,
  offset = 0,
): Promise<FeedPost[]> {
  const { data, error } = await (supabase as any)
    .from('feed_posts')
    .select(`
      id,
      author_id,
      content,
      images,
      type,
      department,
      visibility,
      is_approved,
      is_pinned,
      created_at,
      updated_at,
      author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url, role, department),
      likes_count:post_likes(count),
      comments_count:post_comments(count)
    `)
    .eq('is_deleted', false)
    .or(`and(visibility.eq.department,department.eq.${userDepartment}),visibility.eq.global`)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const { data: userLikes } = await (supabase as any)
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId);

  const likedPostIds = new Set(userLikes?.map((like: any) => like.post_id) || []);

  return (data || []).map((post: any) => ({
    ...post,
    images: mapImages(post.images),
    likes_count: post.likes_count?.[0]?.count || 0,
    comments_count: post.comments_count?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    author: (() => {
      const author = getJoinedObject<any>(post.author);
      if (!author) return undefined;
      return { ...author, name: author.full_name };
    })(),
  }));
}

export async function getFeedPostsByType(
  userId: string,
  userDepartment: string | undefined,
  type: FeedPostType,
  limit = 10,
  offset = 0,
): Promise<FeedPost[]> {
  const { data, error } = await (supabase as any)
    .from('feed_posts')
    .select(`
      id,
      author_id,
      content,
      images,
      type,
      department,
      visibility,
      is_approved,
      is_pinned,
      created_at,
      updated_at,
      author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url, role, department),
      likes_count:post_likes(count),
      comments_count:post_comments(count)
    `)
    .eq('is_deleted', false)
    .eq('type', type)
    .or(`visibility.eq.global${userDepartment ? `,and(visibility.eq.department,department.eq.${userDepartment})` : ''}`)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const { data: userLikes } = await (supabase as any)
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId);

  const likedPostIds = new Set(userLikes?.map((like: any) => like.post_id) || []);

  return (data || []).map((post: any) => ({
    ...post,
    images: mapImages(post.images),
    likes_count: post.likes_count?.[0]?.count || 0,
    comments_count: post.comments_count?.[0]?.count || 0,
    is_liked: likedPostIds.has(post.id),
    author: (() => {
      const author = getJoinedObject<any>(post.author);
      if (!author) return undefined;
      return { ...author, name: author.full_name };
    })(),
  }));
}
