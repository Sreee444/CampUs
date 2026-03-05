// @ts-nocheck
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from "./supabase";
import { Database } from '../types/database';
import { FeedPost, PostComment, PostLike, PostType } from "../types/database";
import { canModerateAcademic, isAdminRole } from "../utils/roles";

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'];

const guessContentType = (fileExt: string, fallback = 'application/octet-stream') => {
  if (fileExt === 'png') return 'image/png';
  if (fileExt === 'webp') return 'image/webp';
  if (fileExt === 'gif') return 'image/gif';
  if (fileExt === 'jpg' || fileExt === 'jpeg') return 'image/jpeg';
  if (fileExt === 'pdf') return 'application/pdf';
  if (fileExt === 'txt') return 'text/plain';
  if (fileExt === 'doc') return 'application/msword';
  if (fileExt === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (fileExt === 'xls') return 'application/vnd.ms-excel';
  if (fileExt === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (fileExt === 'ppt') return 'application/vnd.ms-powerpoint';
  if (fileExt === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return fallback;
};

const parseStorageUrl = (url: string) => {
  try {
    const publicMarker = '/storage/v1/object/public/';
    const signMarker = '/storage/v1/object/sign/';
    const marker = url.includes(publicMarker) ? publicMarker : url.includes(signMarker) ? signMarker : '';
    if (!marker) return null;

    const markerIndex = url.indexOf(marker);
    if (markerIndex === -1) return null;

    const pathWithBucket = url.slice(markerIndex + marker.length).split('?')[0];
    const [bucket, ...fileParts] = pathWithBucket.split('/');
    const filePath = fileParts.join('/');
    if (!bucket || !filePath) return null;

    return { bucket, filePath };
  } catch {
    return null;
  }
};

const resolveAttachmentUrl = async (url: string) => {
  const parsed = parseStorageUrl(url);
  if (!parsed) return url;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.filePath, 60 * 60 * 24);

  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
};

// Get feed posts with author info and counts
export const getFeedPosts = async (
  userId?: string,
  type?: PostType,
  limit = 20,
  offset = 0
) => {
  let approvedQuery = supabase
    .from("feed_posts")
    .select(`
      *,
      author:profiles!feed_posts_author_id_fkey(*)
    `)
    .eq("is_approved", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) {
    approvedQuery = approvedQuery.eq("type", type);
  }

  const [approvedResult, legacyAcademicResult] = await Promise.all([
    approvedQuery,
    supabase
      .from('feed_posts')
      .select(`
        *,
        author:profiles!feed_posts_author_id_fkey(*)
      `)
      .eq('is_approved', false)
      .eq('type', 'announcement')
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (approvedResult.error) throw approvedResult.error;
  if (legacyAcademicResult.error) throw legacyAcademicResult.error;

  const legacyAcademicPosts = (legacyAcademicResult.data || []).filter((post: any) => {
    const role = post?.author?.role;
    return canModerateAcademic(role);
  });

  const postMap = new Map<string, any>();
  [...(approvedResult.data || []), ...legacyAcademicPosts].forEach((post: any) => {
    postMap.set(post.id, post);
  });

  const mergedPosts = Array.from(postMap.values())
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(offset, offset + limit);

  const postsWithResolvedAttachments = await Promise.all(
    mergedPosts.map(async (post: any) => {
      const attachments = Array.isArray(post.images) ? post.images : [];
      if (!attachments.length) return post;

      const resolvedUrls = await Promise.all(attachments.map((attachmentUrl: string) => resolveAttachmentUrl(attachmentUrl)));
      return {
        ...post,
        images: resolvedUrls,
      };
    })
  );

  // Get likes and comments counts for each post
  const postsWithCounts = await Promise.all(
    postsWithResolvedAttachments.map(async (post) => {
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
    })
    .select(`
      *,
      author:profiles!feed_posts_author_id_fkey(*)
    `)
    .single();

  if (error) throw error;
  return data as FeedPost;
};

// Create academic post (admin/faculty only)
export const createAcademicPost = async (
  authorId: string,
  content: string,
  type: PostType = 'announcement',
  images?: string[]
) => {
  const { data: authorProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authorId)
    .single();

  if (profileError) throw profileError;

  const role = (authorProfile as any)?.role;
  if (!canModerateAcademic(role)) {
    throw new Error('Only admin and faculty can post in academic feed');
  }

  const { data, error } = await supabase
    .from('feed_posts')
    .insert({
      author_id: authorId,
      content,
      type,
      images,
      is_approved: true,
      moderated_by: authorId,
      moderated_at: new Date().toISOString(),
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
    .update(updates)
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

// Delete academic post (admin or post owner)
export const deleteAcademicPost = async (postId: string, requesterId: string) => {
  const [{ data: post, error: postError }, { data: requester, error: requesterError }] = await Promise.all([
    supabase
      .from('feed_posts')
      .select('id, author_id')
      .eq('id', postId)
      .single(),
    supabase
      .from('profiles')
      .select('role')
      .eq('id', requesterId)
      .single(),
  ]);

  if (postError) throw postError;
  if (requesterError) throw requesterError;

  const isOwner = (post as any)?.author_id === requesterId;
  const isAdmin = isAdminRole((requester as any)?.role);

  if (!isOwner && !isAdmin) {
    throw new Error('Only admin or post owner can delete this post');
  }

  const { error } = await supabase
    .from('feed_posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
};

// Like post
export const likePost = async (postId: string, userId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("post_likes")
    .insert({ post_id: postId, user_id: userId })
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
    .insert({ post_id: postId, user_id: userId, content })
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
  const { data, error } = await supabase
    .from("feed_posts")
    .update({
      is_approved: true,
      moderated_by: moderatorId,
      moderated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Upload post image
export const uploadPostImage = async (userId: string, fileUri: string) => {
  return uploadPostAttachment(userId, fileUri, 'image');
};

// Upload post image/file attachment
export const uploadPostAttachment = async (
  userId: string,
  fileUri: string,
  kind: 'image' | 'file' = 'file',
  originalName?: string
) => {
  const uriExt = (fileUri.split('.').pop()?.split('?')[0] ?? '').toLowerCase();
  const originalExt = (originalName?.split('.').pop() ?? '').toLowerCase();
  const fileExt = originalExt || uriExt || (kind === 'image' ? 'jpg' : 'bin');
  const safeName = (originalName || `attachment.${fileExt}`).replace(/\s+/g, '_');
  const fileName = `${Date.now()}_${safeName}`;
  const filePath = `${userId}/${fileName}`;
  const inferredKind = kind === 'file' && IMAGE_EXTENSIONS.includes(fileExt) ? 'image' : kind;
  const contentType = guessContentType(fileExt, inferredKind === 'image' ? 'image/jpeg' : 'application/octet-stream');
  const bucket = inferredKind === 'image' ? 'post-images' : 'post-files';

  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const byteCharacters = atob(base64);
  const uint8Array = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    uint8Array[i] = byteCharacters.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, uint8Array, { contentType, upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return publicUrl;
};
