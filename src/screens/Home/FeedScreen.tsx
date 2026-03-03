import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  TextInput,
  Image,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, Spacing, FontSizes, FontWeights, Shadows, BorderRadius } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvents, registerForEvent } from '../../api/events';
import { getUserStats } from '../../api/users';
import { getProfile } from '../../api/auth';
import { supabase } from '../../api/supabase';
import { EventFeedItem } from '../../components/EventFeedItem';
import { UserAvatar } from '../../components/UserAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { WebView } from 'react-native-webview';
import { getNotifications } from '../../api/notifications';
import { getPendingReceivedRequests } from '../../api/connections';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  addComment,
  createAcademicPost,
  deleteAcademicPost,
  getFeedPosts,
  getPostComments,
  likePost,
  unlikePost,
  uploadPostAttachment,
  uploadPostImage,
} from '../../api/feed';
import { FeedPost, PostComment } from '../../types/database';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  if (hour < 21) return "Good Evening";
  return "Good Night";
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'];

const isImageAttachment = (url: string) => {
  const normalized = url.toLowerCase();
  if (normalized.includes('/post-images/')) return true;
  if (normalized.includes('image%2f') || normalized.includes('content-type=image%2f')) return true;

  const pathWithoutQuery = normalized.split('?')[0];
  const ext = (pathWithoutQuery.split('.').pop() ?? '').toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
};

const getFileNameFromUrl = (url: string) => {
  const raw = url.split('/').pop() ?? 'attachment';
  return decodeURIComponent(raw.split('?')[0]);
};

const getFileExtension = (url: string) => {
  const fileName = getFileNameFromUrl(url);
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext;
};

const getFileIcon = (url: string): keyof typeof MaterialIcons.glyphMap => {
  const ext = getFileExtension(url);
  if (ext === 'pdf') return 'picture-as-pdf';
  if (ext === 'doc' || ext === 'docx' || ext === 'txt') return 'description';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'table-chart';
  if (ext === 'ppt' || ext === 'pptx') return 'slideshow';
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'folder-zip';
  return 'insert-drive-file';
};

const getFileTypeLabel = (url: string) => {
  const ext = getFileExtension(url);
  if (ext === 'pdf') return 'PDF';
  if (ext === 'doc' || ext === 'docx') return 'DOC';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'SHEET';
  if (ext === 'ppt' || ext === 'pptx') return 'SLIDES';
  if (ext === 'txt') return 'TEXT';
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'ZIP';
  return (ext || 'FILE').toUpperCase();
};

const getEmbeddedPreviewUrl = (url: string) => {
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
};

const formatPostTime = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Just now';
  }
};

export default function FeedScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ projects: 0, events: 0, connections: 0 });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [academicPosts, setAcademicPosts] = useState<FeedPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [failedImageAttachments, setFailedImageAttachments] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; sourceUrl: string; name: string } | null>(null);
  const [filePreviewError, setFilePreviewError] = useState(false);

  const canPostAcademic = profile?.role === 'admin' || profile?.role === 'faculty';

  const loadAcademicFeed = async () => {
    if (!user?.id) return;
    setIsLoadingPosts(true);
    try {
      const posts = await getFeedPosts(user.id);
      setAcademicPosts(posts);
    } catch (error) {
      console.error('Academic feed load error:', error);
      Toast.show({ type: 'error', text1: 'Failed to load academic feed' });
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const loadFeedData = async (refresh = false) => {
    if (user?.id) {
      try {
        const prof = await getProfile(user.id);
        setProfile(prof);
      } catch (err) {
        setProfile(null);
      }
    }
    try {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);

      const eventsData = await getEvents(user?.id, undefined, 'upcoming');
      const liveEvents = eventsData.filter(event => {
        const now = new Date();
        const eventStart = new Date(event.start_date);
        const eventEnd = new Date(event.end_date);
        return eventStart <= now && eventEnd >= now;
      });
      const feedEvents = [...liveEvents, ...eventsData.filter(e =>
        !liveEvents.find(le => le.id === e.id)
      )].slice(0, 5);
      setEvents(feedEvents);
      setUpcomingEvents(eventsData.slice(0, 3));

      if (user?.id) {
        try {
          const { count: projectsCount } = await supabase
            .from('project_teams')
            .select('id', { count: 'exact', head: true })
            .eq('is_recruiting', true);

          const now = new Date().toISOString();
          const { count: eventsCount } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .gte('start_date', now);

          const { data: connectionsData, error: connectionsError } = await supabase
            .from('connections')
            .select('id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

          const connectionsCount = connectionsData?.length || 0;

          if (connectionsError) {
            console.error('Connections count error:', connectionsError);
          }

          setStats({
            projects: projectsCount || 0,
            events: eventsCount || 0,
            connections: connectionsCount,
          });

          const [notifications, requests] = await Promise.all([
            getNotifications(user.id),
            getPendingReceivedRequests(),
          ]);
          const unreadCount = notifications.filter((n: any) => !n.is_read).length;
          const requestCount = requests.length;
          setNotificationCount(unreadCount + requestCount);
        } catch (err) {
          console.error('Stats load error:', err);
          setStats({ projects: 0, events: 0, connections: 0 });
          setNotificationCount(0);
        }
      }

      setRecentProjects([]);
      setAiSuggestion('Check out the latest events and join a project team!');
      await loadAcademicFeed();
    } catch (error) {
      console.error('Feed load error:', error);
      Toast.show({ type: 'error', text1: 'Failed to load feed', text2: 'Please try again' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadFeedData();
  }, [user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      const loadNotificationCount = async () => {
        if (!user?.id) return;
        try {
          const [notifications, requests] = await Promise.all([
            getNotifications(user.id),
            getPendingReceivedRequests(),
          ]);
          const unreadCount = notifications.filter((n: any) => !n.is_read).length;
          const requestCount = requests.length;
          setNotificationCount(unreadCount + requestCount);
        } catch (err) {
          console.error('Notification count error:', err);
        }
      };
      loadNotificationCount();
    }, [user?.id])
  );

  const handleEventRegistration = async (eventId: string) => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Please login to register' });
      return;
    }
    try {
      await registerForEvent(eventId, user.id);
      Toast.show({ type: 'success', text1: 'Registered successfully!' });
      loadFeedData(true);
    } catch (error) {
      console.error('Registration error:', error);
      Toast.show({
        type: 'error',
        text1: 'Registration failed',
        text2: (error as any)?.message || 'Please try again',
      });
    }
  };

  const handlePickImage = async () => {
    if (!canPostAcademic) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Please allow media access to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setSelectedImageUri(result.assets[0].uri);
      setSelectedFile(null);
    }
  };

  const handlePickFile = async () => {
    if (!canPostAcademic) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.name || `file_${Date.now()}`,
      });
      setSelectedImageUri(null);
    }
  };

  const handleCreateAcademicPost = async () => {
    if (!user?.id) return;
    if (!canPostAcademic) {
      Toast.show({ type: 'error', text1: 'Only admin and faculty can post' });
      return;
    }

    const hasText = !!newPostText.trim();
    if (!hasText && !selectedImageUri && !selectedFile) {
      Toast.show({ type: 'error', text1: 'Add text, image, or file to post' });
      return;
    }

    try {
      setIsPosting(true);
      const attachments: string[] = [];

      if (selectedImageUri) {
        const imageUrl = await uploadPostImage(user.id, selectedImageUri);
        attachments.push(imageUrl);
      }

      if (selectedFile) {
        const fileUrl = await uploadPostAttachment(user.id, selectedFile.uri, 'file', selectedFile.name);
        attachments.push(fileUrl);
      }

      const fallbackText = selectedFile ? `Shared file: ${selectedFile.name}` : 'Shared attachment';
      const newPost = await createAcademicPost(
        user.id,
        hasText ? newPostText.trim() : fallbackText,
        'announcement',
        attachments.length ? attachments : undefined,
      );

      setAcademicPosts((prev) => [{ ...newPost, likes_count: 0, comments_count: 0, is_liked: false }, ...prev]);
      setNewPostText('');
      setSelectedImageUri(null);
      setSelectedFile(null);
      Toast.show({ type: 'success', text1: 'Academic post published' });
    } catch (error: any) {
      console.error('Create academic post error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to publish post',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setIsPosting(false);
    }
  };

  const handleToggleLike = async (post: FeedPost) => {
    if (!user?.id) return;
    const currentlyLiked = !!post.is_liked;

    setAcademicPosts((prev) =>
      prev.map((item) =>
        item.id === post.id
          ? {
            ...item,
            is_liked: !currentlyLiked,
            likes_count: Math.max(0, (item.likes_count || 0) + (currentlyLiked ? -1 : 1)),
          }
          : item,
      ),
    );

    try {
      if (currentlyLiked) await unlikePost(post.id, user.id);
      else await likePost(post.id, user.id);
    } catch (error) {
      console.error('Like toggle error:', error);
      setAcademicPosts((prev) =>
        prev.map((item) =>
          item.id === post.id
            ? {
              ...item,
              is_liked: currentlyLiked,
              likes_count: Math.max(0, (item.likes_count || 0) + (currentlyLiked ? 0 : -1) + (currentlyLiked ? 1 : 0)),
            }
            : item,
        ),
      );
      Toast.show({ type: 'error', text1: 'Could not update like' });
    }
  };

  const handleToggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }

    setExpandedPostId(postId);
    if (commentsByPost[postId]) return;

    try {
      const comments = await getPostComments(postId);
      setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
    } catch (error) {
      console.error('Load comments error:', error);
      Toast.show({ type: 'error', text1: 'Failed to load comments' });
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!user?.id) return;
    const content = commentInputs[postId]?.trim();
    if (!content) return;

    try {
      const newComment = await addComment(postId, user.id, content);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newComment],
      }));
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      setAcademicPosts((prev) =>
        prev.map((item) =>
          item.id === postId
            ? { ...item, comments_count: (item.comments_count || 0) + 1 }
            : item,
        ),
      );
    } catch (error) {
      console.error('Add comment error:', error);
      Toast.show({ type: 'error', text1: 'Failed to add comment' });
    }
  };

  const handleOpenAttachment = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Toast.show({ type: 'error', text1: 'Cannot open attachment' });
        return;
      }
      await Linking.openURL(url);
    } catch {
      Toast.show({ type: 'error', text1: 'Download failed' });
    }
  };

  const handlePreviewFile = (url: string) => {
    const ext = getFileExtension(url);
    const nonPreviewable = ['zip', 'rar', '7z', 'exe', 'apk'];
    const canPreview = !nonPreviewable.includes(ext);

    setFilePreviewError(false);
    setPreviewFile({
      url: canPreview ? getEmbeddedPreviewUrl(url) : url,
      sourceUrl: url,
      name: getFileNameFromUrl(url),
    });

    if (!canPreview) {
      setFilePreviewError(true);
    }
  };

  const canDeletePost = (post: FeedPost) => {
    if (!user?.id) return false;
    const isOwner = post.author_id === user.id;
    const isAdmin = profile?.role === 'admin';
    return isOwner || isAdmin;
  };

  const handleDeletePost = (post: FeedPost) => {
    if (!user?.id) return;

    Alert.alert(
      'Delete post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAcademicPost(post.id, user.id);
              setAcademicPosts((prev) => prev.filter((item) => item.id !== post.id));
              Toast.show({ type: 'success', text1: 'Post deleted' });
            } catch (error: any) {
              console.error('Delete post error:', error);
              Toast.show({
                type: 'error',
                text1: 'Failed to delete post',
                text2: error?.message || 'Please try again',
              });
            }
          },
        },
      ]
    );
  };

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Student';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#e0f7fa', '#fdfbf7', '#f3e5f5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View style={styles.greetingRow}>
            <UserAvatar
              uri={profile?.avatar_url}
              name={profile?.full_name}
              role={profile?.role}
              size={42}
              showRing={true}
            />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.greeting}>{getGreeting()} 👋</Text>
              <Text style={styles.userName}>{firstName}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigation.navigate('Notifications' as any)}
          >
            <MaterialIcons name="notifications-none" size={24} color="#111818" />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadFeedData(true)}
            tintColor="#13ecec"
          />
        }
      >
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <LinearGradient colors={['#e0f7fa', '#ccfbfb']} style={styles.statCard}>
            <MaterialIcons name="folder-open" size={22} color="#0d9488" />
            <Text style={styles.statNumber}>{stats.projects}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </LinearGradient>
          <LinearGradient colors={['#f3e5f5', '#ecdcf7']} style={styles.statCard}>
            <MaterialIcons name="event" size={22} color="#9333ea" />
            <Text style={styles.statNumber}>{stats.events}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </LinearGradient>
          <LinearGradient colors={['#fff5e6', '#ffe0cc']} style={styles.statCard}>
            <MaterialIcons name="people-outline" size={22} color="#ea580c" />
            <Text style={styles.statNumber}>{stats.connections}</Text>
            <Text style={styles.statLabel}>Connects</Text>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.quickActionsGrid}>
            {/* Row 1 */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('Calendar' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#e0f7fa' }]}>
                  <MaterialIcons name="calendar-month" size={24} color="#0d9488" />
                </View>
                <Text style={styles.actionLabel}>Calendar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('MentorHub' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#ede9fe' }]}>
                  <MaterialIcons name="school" size={24} color="#4F46E5" />
                </View>
                <Text style={styles.actionLabel}>Mentor Hub</Text>

              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('Discussions' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#ede9fe' }]}>
                  <MaterialIcons name="forum" size={24} color="#7c3aed" />
                </View>
                <Text style={styles.actionLabel}>Discuss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('AllUsers' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
                  <MaterialIcons name="people" size={24} color="#d97706" />
                </View>
                <Text style={styles.actionLabel}>Connect</Text>
              </TouchableOpacity>
            </View>

            {/* Row 2 */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('CreateEvent' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#fecaca' }]}>
                  <MaterialIcons name="event" size={24} color="#dc2626" />
                </View>
                <Text style={styles.actionLabel}>+ Event</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('CreateProject' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#c7f0d8' }]}>
                  <MaterialIcons name="work-outline" size={24} color="#059669" />
                </View>
                <Text style={styles.actionLabel}>+ Project</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('EventDiscussion' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#dbeafe' }]}>
                  <MaterialIcons name="event-note" size={24} color="#0284c7" />
                </View>
                <Text style={styles.actionLabel}>Collab</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('AIInsights' as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#e9d5ff' }]}>
                  <MaterialIcons name="insights" size={24} color="#a855f7" />
                </View>
                <Text style={styles.actionLabel}>AI Stats</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Academic Feed */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Academic Feed</Text>
          </View>

          {canPostAcademic && (
            <View style={styles.postComposerCard}>
              <TextInput
                style={styles.postComposerInput}
                placeholder="Share an academic update..."
                placeholderTextColor="#94a3b8"
                value={newPostText}
                onChangeText={setNewPostText}
                multiline
                maxLength={1000}
              />

              {(selectedImageUri || selectedFile) && (
                <View>
                  <View style={styles.attachmentPreviewRow}>
                    <MaterialIcons name={selectedImageUri ? 'image' : 'attach-file'} size={16} color="#0d9488" />
                    <Text style={styles.attachmentPreviewText} numberOfLines={1}>
                      {selectedImageUri ? 'Image selected' : selectedFile?.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedImageUri(null);
                        setSelectedFile(null);
                      }}
                    >
                      <MaterialIcons name="close" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>

                  {!!selectedImageUri && (
                    <Image source={{ uri: selectedImageUri }} style={styles.composerImagePreview} resizeMode="cover" />
                  )}
                </View>
              )}

              <View style={styles.postComposerActions}>
                <View style={styles.postAttachmentButtons}>
                  <TouchableOpacity style={styles.postAttachmentButton} onPress={handlePickImage}>
                    <MaterialIcons name="image" size={18} color="#0d9488" />
                    <Text style={styles.postAttachmentButtonText}>Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.postAttachmentButton} onPress={handlePickFile}>
                    <MaterialIcons name="attach-file" size={18} color="#0d9488" />
                    <Text style={styles.postAttachmentButtonText}>File</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.publishButton, isPosting && styles.publishButtonDisabled]}
                  onPress={handleCreateAcademicPost}
                  disabled={isPosting}
                >
                  {isPosting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.publishButtonText}>Post</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!canPostAcademic && (
            <View style={styles.readOnlyNote}>
              <MaterialIcons name="info-outline" size={18} color="#64748b" />
              <Text style={styles.readOnlyNoteText}>
                Academic posts are shared by admin and faculty. You can still like and comment.
              </Text>
            </View>
          )}

          {isLoadingPosts ? (
            <ActivityIndicator color="#13ecec" style={{ marginVertical: 16 }} />
          ) : academicPosts.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="campaign" size={30} color="#cbd5e1" />
              <Text style={styles.emptyText}>No academic posts yet</Text>
            </View>
          ) : (
            academicPosts.map((post) => (
              <View key={post.id} style={styles.academicPostCard}>
                <View style={styles.postHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postAuthorName}>{post.author?.full_name || 'Faculty'}</Text>
                    <Text style={styles.postMetaText}>
                      {(post.author?.role || 'faculty').toUpperCase()} • {formatPostTime(post.created_at)}
                    </Text>
                  </View>
                  <View style={styles.postHeaderActions}>
                    <MaterialIcons name="school" size={18} color="#0d9488" />
                    {canDeletePost(post) && (
                      <TouchableOpacity style={styles.postDeleteBtn} onPress={() => handleDeletePost(post)}>
                        <MaterialIcons name="delete-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {!!post.content && <Text style={styles.postContentText}>{post.content}</Text>}

                {!!post.images?.length && (
                  <View style={styles.postAttachmentsWrap}>
                    {post.images.map((attachmentUrl, idx) => (
                      <TouchableOpacity
                        key={`${post.id}_${idx}`}
                        style={styles.attachmentCard}
                        activeOpacity={0.9}
                        onPress={() => {
                          if (isImageAttachment(attachmentUrl) && !failedImageAttachments[attachmentUrl]) {
                            setPreviewImageUrl(attachmentUrl);
                          } else {
                            handlePreviewFile(attachmentUrl);
                          }
                        }}
                      >
                        {isImageAttachment(attachmentUrl) && !failedImageAttachments[attachmentUrl] ? (
                          <Image
                            source={{ uri: attachmentUrl }}
                            style={styles.postImage}
                            resizeMode="cover"
                            onError={() =>
                              setFailedImageAttachments((prev) => ({ ...prev, [attachmentUrl]: true }))
                            }
                          />
                        ) : (
                          <View style={styles.fileAttachmentRow}>
                            <View style={styles.fileBadge}>
                              <View style={styles.filePreviewPanel}>
                                <MaterialIcons name={getFileIcon(attachmentUrl)} size={42} color="#475569" />
                                <View style={styles.fileTypeChipLarge}>
                                  <Text style={styles.fileTypeChipLargeText}>{getFileTypeLabel(attachmentUrl)}</Text>
                                </View>
                                <Text style={styles.filePreviewFileName} numberOfLines={2}>
                                  {getFileNameFromUrl(attachmentUrl)}
                                </Text>
                                <Text style={styles.fileAttachmentMeta}>
                                  Tap to preview
                                </Text>
                              </View>
                            </View>
                          </View>
                        )}

                        <TouchableOpacity
                          style={styles.downloadButton}
                          onPress={(event: any) => {
                            event?.stopPropagation?.();
                            handleOpenAttachment(attachmentUrl);
                          }}
                        >
                          <MaterialIcons name="download" size={16} color="#0d9488" />
                          <Text style={styles.downloadButtonText}>Download</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.postActionsRow}>
                  <TouchableOpacity style={styles.postActionBtn} onPress={() => handleToggleLike(post)}>
                    <MaterialIcons
                      name={post.is_liked ? 'favorite' : 'favorite-border'}
                      size={18}
                      color={post.is_liked ? '#ef4444' : '#64748b'}
                    />
                    <Text style={styles.postActionText}>{post.likes_count || 0}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.postActionBtn} onPress={() => handleToggleComments(post.id)}>
                    <MaterialIcons name="comment" size={18} color="#64748b" />
                    <Text style={styles.postActionText}>{post.comments_count || 0}</Text>
                  </TouchableOpacity>
                </View>

                {expandedPostId === post.id && (
                  <View style={styles.commentsWrap}>
                    {(commentsByPost[post.id] || []).map((comment) => (
                      <View key={comment.id} style={styles.commentRow}>
                        <Text style={styles.commentAuthor}>{comment.user?.full_name || 'User'}</Text>
                        <Text style={styles.commentText}>{comment.content}</Text>
                      </View>
                    ))}

                    <View style={styles.commentInputRow}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Write a comment..."
                        placeholderTextColor="#94a3b8"
                        value={commentInputs[post.id] || ''}
                        onChangeText={(value) =>
                          setCommentInputs((prev) => ({ ...prev, [post.id]: value }))
                        }
                      />
                      <TouchableOpacity onPress={() => handleAddComment(post.id)}>
                        <MaterialIcons name="send" size={18} color="#0d9488" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* AI Suggestion */}
        <View style={styles.section}>
          <LinearGradient
            colors={['rgba(19,236,236,0.08)', 'rgba(19,236,236,0.03)']}
            style={styles.aiSuggestion}
          >
            <MaterialIcons name="auto-awesome" size={20} color="#0d9488" />
            <View style={styles.aiContent}>
              <Text style={styles.aiTitle}>AI Suggestion</Text>
              <Text style={styles.aiText}>{aiSuggestion}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Upcoming Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Events' as any)}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#13ecec" style={{ marginVertical: 16 }} />
          ) : upcomingEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event-busy" size={32} color="#cbd5e1" />
              <Text style={styles.emptyText}>No upcoming events</Text>
            </View>
          ) : upcomingEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => navigation.navigate('EventDetails' as any, { eventId: event.id })}
            >
              <View style={styles.eventDateBadge}>
                <Text style={styles.eventDateDay}>
                  {new Date(event.start_date).getDate()}
                </Text>
                <Text style={styles.eventDateMonth}>
                  {new Date(event.start_date).toLocaleString('default', { month: 'short' })}
                </Text>
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                <View style={styles.eventMeta}>
                  <MaterialIcons name="access-time" size={13} color="#94a3b8" />
                  <Text style={styles.eventMetaText}>
                    {new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {event.location && (
                    <>
                      <MaterialIcons name="place" size={13} color="#94a3b8" />
                      <Text style={styles.eventMetaText} numberOfLines={1}>{event.location}</Text>
                    </>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={styles.imagePreviewOverlay}>
          <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setPreviewImageUrl(null)}>
            <MaterialIcons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>

          {!!previewImageUrl && (
            <Image source={{ uri: previewImageUrl }} style={styles.imagePreviewFull} resizeMode="contain" />
          )}

          {!!previewImageUrl && (
            <TouchableOpacity style={styles.imagePreviewDownload} onPress={() => handleOpenAttachment(previewImageUrl)}>
              <MaterialIcons name="download" size={18} color="#ffffff" />
              <Text style={styles.imagePreviewDownloadText}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      <Modal
        visible={!!previewFile}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewFile(null)}
      >
        <View style={styles.imagePreviewOverlay}>
          <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setPreviewFile(null)}>
            <MaterialIcons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>

          {!!previewFile && (
            <View style={styles.filePreviewContainer}>
              <View style={styles.filePreviewHeader}>
                <MaterialIcons name={getFileIcon(previewFile.sourceUrl)} size={18} color="#0f172a" />
                <Text style={styles.filePreviewTitle} numberOfLines={1}>{previewFile.name}</Text>
              </View>

              {!filePreviewError ? (
                <WebView
                  source={{ uri: previewFile.url }}
                  style={styles.filePreviewWebView}
                  originWhitelist={['*']}
                  startInLoadingState
                  renderLoading={() => (
                    <View style={styles.filePreviewLoading}>
                      <ActivityIndicator size="small" color="#0d9488" />
                    </View>
                  )}
                  onError={() => setFilePreviewError(true)}
                  onHttpError={() => setFilePreviewError(true)}
                />
              ) : (
                <View style={styles.filePreviewFallback}>
                  <MaterialIcons name="description" size={28} color="#64748b" />
                  <Text style={styles.filePreviewFallbackText}>
                    Preview not available for this file type.
                  </Text>
                </View>
              )}
            </View>
          )}

          {!!previewFile && (
            <View style={styles.filePreviewActions}>
              <TouchableOpacity
                style={styles.filePreviewActionBtn}
                onPress={() => handleOpenAttachment(previewFile.sourceUrl)}
              >
                <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
                <Text style={styles.filePreviewActionText}>Open</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filePreviewActionBtn}
                onPress={() => handleOpenAttachment(previewFile.sourceUrl)}
              >
                <MaterialIcons name="download" size={18} color="#ffffff" />
                <Text style={styles.filePreviewActionText}>Download</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  headerGradient: {
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111818',
    marginTop: 2,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111818',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111818',
    marginBottom: 14,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionsGrid: {
    gap: 14,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 14,
  },
  aiSuggestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(19,236,236,0.2)',
    borderRadius: 16,
    padding: 14,
  },
  aiContent: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0d9488',
    marginBottom: 4,
  },
  aiText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  seeAllText: {
    fontSize: 13,
    color: '#13ecec',
    fontWeight: '600',
    marginBottom: 12,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  eventDateBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(19,236,236,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateDay: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0d9488',
    lineHeight: 18,
  },
  eventDateMonth: {
    fontSize: 10,
    fontWeight: '500',
    color: '#0d9488',
    textTransform: 'uppercase',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111818',
    marginBottom: 4,
    overflow: 'hidden',
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  eventMetaText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  postComposerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 10,
  },
  postComposerInput: {
    minHeight: 70,
    fontSize: 14,
    color: '#111818',
    textAlignVertical: 'top',
  },
  postComposerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  postAttachmentButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postAttachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(13,148,136,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  postAttachmentButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0d9488',
  },
  publishButton: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishButtonDisabled: {
    opacity: 0.7,
  },
  publishButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  attachmentPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attachmentPreviewText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },
  composerImagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#e2e8f0',
  },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  readOnlyNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
  },
  academicPostCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 10,
  },
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  postHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111818',
  },
  postMetaText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  postContentText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1f2937',
  },
  postAttachmentsWrap: {
    gap: 8,
  },
  attachmentCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
    gap: 8,
  },
  postImage: {
    width: '100%',
    height: 190,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  fileAttachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fileBadge: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  filePreviewPanel: {
    width: '100%',
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: '#f8fafc',
  },
  fileAttachmentName: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  filePreviewFileName: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: '#334155',
    fontWeight: '700',
  },
  fileAttachmentMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
  },
  fileTypeChipLarge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(13,148,136,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.25)',
  },
  fileTypeChipLargeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0d9488',
    letterSpacing: 0.4,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  downloadButtonText: {
    color: '#0d9488',
    fontSize: 12,
    fontWeight: '600',
  },
  postActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  postActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postActionText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  commentsWrap: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    gap: 8,
  },
  commentRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  commentText: {
    fontSize: 12,
    color: '#475569',
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
  },
  commentInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    color: '#111818',
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  imagePreviewClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewFull: {
    width: '100%',
    height: '72%',
  },
  imagePreviewDownload: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13,148,136,0.95)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  imagePreviewDownloadText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  filePreviewContainer: {
    width: '100%',
    height: '70%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  filePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filePreviewTitle: {
    flex: 1,
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
  },
  filePreviewWebView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  filePreviewLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  filePreviewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  filePreviewFallbackText: {
    color: '#64748b',
    fontSize: 13,
  },
  filePreviewActions: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filePreviewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13,148,136,0.95)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filePreviewActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
