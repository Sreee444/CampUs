// @ts-nocheck
import { supabase } from "./supabase";
import { FeedPost, PostComment, PostLike, PostType } from "../types/database";

// Get feed posts with author info and counts
export const getFeedPosts = async (
  userId?: string,
  type?: PostType,
  limit = 20,
  offset = 0
) => {
  let query = supabase
    .from("feed_posts")
    .select(`
      *,
      author:profiles!feed_posts_author_id_fkey(*)
    `)
    .eq("is_approved", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Get likes and comments counts for each post
  const postsWithCounts = await Promise.all(
    (data || []).map(async (post: any) => {
      const [likesCount, commentsCount, isLiked] = await Promise.all([
        supabase
          .from("post_likes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", post.id),
        supabase
          .from("post_comments")
          .select("id", { count: "exact", head: true })
          .eq("post_id", post.id),
        userId
          ? supabase
            .from("post_likes")
            .select("id")
            .eq("post_id", post.id)
            .eq("user_id", userId)
            .single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...post,
        likes_count: likesCount.count || 0,
        comments_count: commentsCount.count || 0,
        is_liked: !!isLiked.data,
      };
    })
  );

  return postsWithCounts as FeedPost[];
};

// Create new post
export const createPost = async (
  authorId: string,
  content: string,
  type: PostType = "general",
  images?: string[]
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("feed_posts")
    .insert({
      author_id: authorId,
      content,
      type,
      images,
    } as any)
    .select(`
      *,
      author:profiles!feed_posts_author_id_fkey(*)
    `)
    .single();

  if (error) throw error;
  return data as FeedPost;
};

// Update post
export const updatePost = async (
  postId: string,
  updates: Partial<FeedPost>
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("feed_posts")
    .update(updates as any)
    .eq("id", postId)
    .select()
    .single();

  if (error) throw error;
  return data as FeedPost;
};

// Delete post
export const deletePost = async (postId: string) => {
  const { error } = await supabase.from("feed_posts").delete().eq("id", postId);
  if (error) throw error;
};

// Like post
export const likePost = async (postId: string, userId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("post_likes")
    .insert({ post_id: postId, user_id: userId } as any)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      // Already liked, try to unlike
      return unlikePost(postId, userId);
    }
    throw error;
  }
  return data;
};

// Unlike post
export const unlikePost = async (postId: string, userId: string) => {
  const { error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);

  if (error) throw error;
};

// Get post comments
export const getPostComments = async (postId: string) => {
  const { data, error } = await supabase
    .from("post_comments")
    .select(`
      *,
      user:profiles!post_comments_user_id_fkey(*)
    `)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as PostComment[];
};

// Add comment to post
export const addComment = async (
  postId: string,
  userId: string,
  content: string
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, user_id: userId, content } as any)
    .select(`
      *,
      user:profiles!post_comments_user_id_fkey(*)
    `)
    .single();

  if (error) throw error;
  return data as PostComment;
};

// Delete comment
export const deleteComment = async (commentId: string) => {
  const { error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", commentId);
  if (error) throw error;
};

// Get posts pending moderation
export const getPendingPosts = async () => {
  const { data, error } = await supabase
    .from("feed_posts")
    .select(`
      *,
      author:profiles!feed_posts_author_id_fkey(*)
    `)
    .eq("is_approved", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as FeedPost[];
};

// Approve post (admin/faculty only)
export const approvePost = async (postId: string, moderatorId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("feed_posts")
    .update({
      is_approved: true,
      moderated_by: moderatorId,
      moderated_at: new Date().toISOString(),
    } as any)
    .eq("id", postId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Upload post image
export const uploadPostImage = async (userId: string, fileUri: string) => {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const fileExt = fileUri.split(".").pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("post-images")
    .upload(filePath, blob);

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("post-images").getPublicUrl(filePath);

  return publicUrl;
};
