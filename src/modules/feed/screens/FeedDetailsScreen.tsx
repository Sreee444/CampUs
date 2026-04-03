import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import * as Linking from 'expo-linking';
import { WebView } from 'react-native-webview';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { getProfile } from '../../../api/auth';
import { getPostById, getPostComments, createPostComment, togglePostLike, deleteFeedPost } from '../api/feed';
import { FeedPost, PostComment } from '../types/feed';
import { AttachmentType, getFileNameFromUrl, getFileType } from '../utils/attachments';
import ConfirmDialog from '../../../components/ConfirmDialog';

type Route = RouteProp<RootStackParamList, 'FeedDetails'>;
type Nav = StackNavigationProp<RootStackParamList>;

type DisplayComment = PostComment & { is_own?: boolean };

export default function FeedDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<DisplayComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(route.params.attachmentIndex ?? 0);
  const [attachmentSectionOffset, setAttachmentSectionOffset] = useState(280);
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [previewFileType, setPreviewFileType] = useState<AttachmentType | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const listRef = React.useRef<FlatList>(null);
  const commentInputRef = React.useRef<TextInput>(null);

  const loadPost = useCallback(async () => {
    try {
      setLoading(true);
      const postData = await getPostById(route.params.postId, user?.id || '');
      setPost(postData);

      const commentsData = await getPostComments(route.params.postId);
      const displayComments: DisplayComment[] = commentsData.map((comment) => ({
        ...comment,
        is_own: comment.user_id === user?.id,
      }));
      setComments(displayComments);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load post details', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [route.params.postId, user?.id]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      try {
        const profileData = await getProfile(user.id);
        setProfile(profileData);
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };
    fetchProfile();
  }, [user?.id]);

  useEffect(() => {
    if (!post) return;
    if (!route.params.focusAttachment) return;
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: Math.max(0, attachmentSectionOffset), animated: true });
    }, 250);
  }, [route.params.focusAttachment, post, attachmentSectionOffset]);

  useEffect(() => {
    if (!route.params.focusComment) return;
    const timer = setTimeout(() => {
      commentInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timer);
  }, [route.params.focusComment]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLike = useCallback(async () => {
    if (!post) return;
    try {
      const isLiked = await togglePostLike(post.id, user?.id || '');
      setPost((prev) =>
        prev
          ? {
            ...prev,
            is_liked: isLiked,
            likes_count: isLiked ? (prev.likes_count || 0) + 1 : Math.max(0, (prev.likes_count || 1) - 1),
          }
          : prev,
      );
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to update like', text2: error?.message });
    }
  }, [post, user?.id]);

  const handleAddComment = useCallback(async () => {
    if (!post || !newComment.trim()) return;

    try {
      setPosting(true);
      const comment = await createPostComment(post.id, user?.id || '', newComment.trim());
      const displayComment: DisplayComment = {
        ...comment,
        is_own: true,
      };
      setComments((prev) => [displayComment, ...prev]);
      setNewComment('');

      setPost((prev) =>
        prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev,
      );

      Toast.show({ type: 'success', text1: 'Comment posted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to post comment', text2: error?.message });
    } finally {
      setPosting(false);
    }
  }, [post, user?.id, newComment]);

  const canDeleteCurrentPost = useCallback(() => {
    if (!post || !user?.id) return false;
    const isOwner = post.author_id === user.id;
    const isAdmin = profile?.role?.toLowerCase() === 'admin';
    const isFaculty = profile?.role?.toLowerCase() === 'faculty';
    return isAdmin || (isFaculty && isOwner);
  }, [post, user?.id, profile?.role]);

  const handleDeletePost = () => {
    setShowDeleteDialog(true);
  };

  const confirmDeletePost = async () => {
    if (!post?.id) return;
    try {
      await deleteFeedPost(post.id);
      Toast.show({ type: 'success', text1: 'Post deleted successfully' });
      setShowDeleteDialog(false);
      navigation.goBack();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to delete post',
        text2: error?.message || 'Please try again',
      });
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={styles.gradientBg}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={styles.gradientBg}>
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>Post not found</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  const imageAttachments = (post.images || []).filter((url) => getFileType(url) === 'image');
  const fileAttachments = (post.images || []).filter((url) => getFileType(url) !== 'image');
  console.log('[FeedDetails] Post attachments:', { total: post.images?.length || 0, images: imageAttachments.length, files: fileAttachments.length, urls: post.images });

  const openAttachmentPreview = (url: string) => {
    console.log('[FeedDetails] Opening file preview:', { url, fileType: getFileType(url) });
    setPreviewFileUrl(url);
    setPreviewFileType(getFileType(url));
  };

  const closeAttachmentPreview = () => {
    setPreviewFileUrl(null);
    setPreviewFileType(null);
  };

  const openAttachmentExternal = async () => {
    if (!previewFileUrl) return;
    console.log('[FeedDetails] Opening attachment externally:', previewFileUrl);
    try {
      await Linking.openURL(previewFileUrl);
    } catch (err) {
      console.error('[FeedDetails] Failed to open attachment externally:', err);
      Toast.show({ type: 'error', text1: 'Unable to open attachment' });
    }
  };

  const getAttachmentIcon = (url: string): keyof typeof MaterialIcons.glyphMap => {
    const type = getFileType(url);
    if (type === 'pdf') return 'picture-as-pdf';
    if (type === 'doc') return 'description';
    if (type === 'ppt') return 'slideshow';
    return 'attach-file';
  };

  const getPreviewUri = (url: string, type: AttachmentType | null) => {
    if (type === 'pdf') return url;
    return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
  };

  const renderHeader = () => (
    <View style={styles.postContainer}>
      <View style={styles.postHeader}>
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>{post.author?.name || post.author?.full_name || 'Unknown'}</Text>
          {post.author?.role && (post.author.role === 'faculty' || post.author.role === 'admin') && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {post.author.role === 'admin' ? 'Admin' : 'Faculty'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.timestamp}>{formatFullDate(post.created_at)}</Text>
      </View>

      <View style={styles.badgesWrap}>
        {post.department && post.visibility === 'department' && (
          <View style={styles.badgeDepartment}>
            <Text style={styles.badgeText}>{post.department}</Text>
          </View>
        )}
        <View style={[styles.badgeType, getTypeColor(post.type)]}>
          <Text style={styles.badgeText}>{post.type.charAt(0).toUpperCase() + post.type.slice(1)}</Text>
        </View>
      </View>

      <Text style={styles.postContent}>{post.content}</Text>

      {!!post.images?.length && (
        <View style={styles.attachmentsSection} onLayout={(event) => setAttachmentSectionOffset(event.nativeEvent.layout.y)}>
          <View style={styles.attachmentsHeader}>
            <Text style={styles.attachmentsTitle}>Attachments</Text>
            <Text style={styles.attachmentsCounter}>{post.images.length} files</Text>
          </View>

          {!!imageAttachments.length && (
            <>
              <FlatList
                data={imageAttachments}
                horizontal
                keyExtractor={(item, index) => `${item}-${index}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attachmentsList}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      console.log('[FeedDetails] Image tapped:', { index, url: item });
                      setCurrentImageIndex(index);
                      setViewerVisible(true);
                    }}
                  >
                    <Image source={{ uri: item, cache: 'force-cache' as any }} style={styles.attachmentImage} />
                  </TouchableOpacity>
                )}
              />
              <Text style={styles.attachmentsHint}>Swipe to browse images - Tap image to zoom</Text>
            </>
          )}

          {!!fileAttachments.length && (
            <View style={styles.fileListWrap}>
              {fileAttachments.map((fileUrl, idx) => (
                <TouchableOpacity key={`${fileUrl}-${idx}`} onPress={() => openAttachmentPreview(fileUrl)} style={styles.fileCard}>
                  <MaterialIcons name={getAttachmentIcon(fileUrl)} size={20} color="#334155" style={styles.fileIcon} />
                  <Text style={styles.fileName} numberOfLines={1}>{getFileNameFromUrl(fileUrl)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <MaterialIcons name="favorite" size={14} color="#ef4444" />
            <Text style={styles.statText}>{post.likes_count || 0} likes</Text>
          </View>
          <View style={styles.stat}>
            <MaterialIcons name="comment" size={14} color="#0f172a" />
            <Text style={styles.statText}>{post.comments_count || 0} comments</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.actionBtn, post.is_liked && styles.actionBtnActive]} onPress={handleLike}>
          <MaterialIcons name={post.is_liked ? 'favorite' : 'favorite-border'} size={16} color={post.is_liked ? '#ef4444' : '#64748b'} />
          <Text style={[styles.actionBtnText, post.is_liked && styles.actionBtnTextActive]}>
            {post.is_liked ? 'Liked' : 'Like'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.commentsHeader}>
        <Text style={styles.commentsTitle}>Comments</Text>
      </View>
    </View>
  );

  const renderComment = ({ item }: { item: DisplayComment }) => (
    <View style={styles.commentWrap}>
      <View style={styles.commentHeader}>
        <Text style={styles.commentAuthor}>{item.user?.name || item.user?.full_name || 'Anonymous'}</Text>
        <Text style={styles.commentTime}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.commentContent}>{item.content}</Text>
    </View>
  );

  const renderEmptyComments = () => (
    <View style={styles.emptyComments}>
      <Text style={styles.emptyCommentsText}>No comments yet. Be the first to comment!</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={styles.gradientBg}>
      <KeyboardAvoidingView
        style={styles.contentWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Details</Text>
          {canDeleteCurrentPost() ? (
            <TouchableOpacity onPress={handleDeletePost}>
              <MaterialIcons name="delete-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <FlatList
          ref={listRef}
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyComments}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        />

        <View style={[styles.commentInputWrap, Platform.OS === 'android' && keyboardHeight > 0 ? { marginBottom: keyboardHeight } : null]}>
          <TextInput
            ref={commentInputRef}
            style={styles.commentInput}
            placeholder="Write a comment..."
            value={newComment}
            onChangeText={setNewComment}
            multiline
            editable={!posting}
            blurOnSubmit={false}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.submitBtn, posting && styles.submitBtnDisabled]}
            onPress={handleAddComment}
            disabled={posting || !newComment.trim()}
          >
            <MaterialIcons name="send" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {!!imageAttachments.length && (
        <Modal
          visible={viewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerVisible(false)}
        >
          <View style={styles.imageViewerOverlay}>
            <TouchableOpacity style={styles.imageViewerClose} onPress={() => setViewerVisible(false)}>
              <MaterialIcons name="close" size={28} color="#ffffff" />
            </TouchableOpacity>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: currentImageIndex * Dimensions.get('window').width, y: 0 }}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                setCurrentImageIndex(idx);
              }}
            >
              {imageAttachments.map((url, idx) => (
                <Image
                  key={`${url}-${idx}`}
                  source={{ uri: url }}
                  style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height }}
                  resizeMode="contain"
                />
              ))}
            </ScrollView>
            <View style={styles.viewerFooter}>
              <Text style={styles.viewerFooterText}>{currentImageIndex + 1}/{imageAttachments.length}</Text>
            </View>
          </View>
        </Modal>
      )}

      <Modal
        visible={!!previewFileUrl}
        animationType="slide"
        onRequestClose={closeAttachmentPreview}
      >
        <SafeAreaView style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            <TouchableOpacity onPress={closeAttachmentPreview} style={styles.previewHeaderBtn}>
              <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {previewFileUrl ? getFileNameFromUrl(previewFileUrl) : 'Attachment'}
            </Text>
            <TouchableOpacity onPress={openAttachmentExternal} style={styles.previewHeaderBtn}>
              <MaterialIcons name="open-in-new" size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>

          {!!previewFileUrl && (
            <WebView
              source={{ uri: (() => { const uri = getPreviewUri(previewFileUrl, previewFileType); console.log('[FeedDetails] WebView preview URI:', uri); return uri; })() }}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.previewLoadingWrap}>
                  <ActivityIndicator size="large" color="#0f766e" />
                </View>
              )}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('[FeedDetails] WebView error:', nativeEvent);
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('[FeedDetails] WebView HTTP error:', nativeEvent.statusCode, nativeEvent.url);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      <ConfirmDialog
        visible={showDeleteDialog}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        type="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeletePost}
        onCancel={() => setShowDeleteDialog(false)}
      />
      </LinearGradient>
    </SafeAreaView>
  );
}

function getTypeColor(type: string): any {
  const colors: Record<string, any> = {
    announcement: { backgroundColor: '#fef3c7' },
    event: { backgroundColor: '#dbeafe' },
    exam: { backgroundColor: '#fee2e2' },
    general: { backgroundColor: '#e0e7ff' },
  };
  return colors[type] || colors.general;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString();
}

function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradientBg: {
    flex: 1,
  },
  contentWrap: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
  },
  listContent: {
    paddingBottom: 16,
  },
  postContainer: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    margin: 12,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  postHeader: {
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  roleBadge: {
    backgroundColor: '#0f766e',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  timestamp: {
    fontSize: 12,
    color: '#64748b',
  },
  badgesWrap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badgeDepartment: {
    backgroundColor: '#f0fdfa',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  badgeType: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0f172a',
    marginBottom: 12,
  },
  attachmentsSection: {
    marginBottom: 12,
  },
  attachmentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  attachmentsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  attachmentsCounter: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  attachmentsList: {
    gap: 8,
  },
  attachmentImage: {
    width: 260,
    height: 190,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#e2e8f0',
  },
  attachmentsHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#94a3b8',
  },
  fileListWrap: {
    marginTop: 10,
    gap: 8,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  fileIcon: {
    marginRight: 10,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
  },
  statsWrap: {
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
  },
  actionBtnActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  actionBtnTextActive: {
    color: '#ef4444',
  },
  commentsHeader: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  commentsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  commentWrap: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  commentTime: {
    fontSize: 11,
    color: '#94a3b8',
  },
  commentContent: {
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 18,
  },
  emptyComments: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  commentInputWrap: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    flexDirection: 'row',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    maxHeight: 100,
  },
  submitBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerFooter: {
    width: '100%',
    paddingBottom: 24,
    alignItems: 'center',
  },
  viewerFooterText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  previewHeader: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  previewHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  previewLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
