import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getPendingPosts, approvePost, rejectPost } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminFilterChips from '../../components/admin/AdminFilterChips';

type ModerationFilter = 'all' | 'announcement' | 'exam' | 'general';

export default function AdminModerationScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ModerationFilter>('all');

  useEffect(() => {
    loadPendingPosts();
  }, []);

  const loadPendingPosts = async () => {
    try {
      const data = await getPendingPosts();
      setPosts(data);
    } catch (error) {
      console.error('Error loading posts:', error);
      Toast.show({ type: 'error', text1: 'Failed to load posts' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (postId: string) => {
    if (!user?.id || !profile?.role) return;
    try {
      setProcessingId(postId);
      await approvePost(postId, user.id, profile.role);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      Toast.show({ type: 'success', text1: 'Post approved' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to approve post' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (postId: string) => {
    if (!user?.id) return;
    try {
      setProcessingId(postId);
      await rejectPost(postId, user.id);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      Toast.show({ type: 'success', text1: 'Post rejected' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to reject post' });
    } finally {
      setProcessingId(null);
    }
  };

  const renderPostItem = ({ item }: { item: any }) => (
    <View style={styles.postCard}>
      <View style={styles.posterInfo}>
        <View style={styles.posterAvatar}>
          <Text style={styles.posterInitials}>
            {item.author?.full_name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.posterName}>{item.author?.full_name || 'Unknown'}</Text>
          <Text style={styles.postTime}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View
          style={[
            styles.postTypeBadge,
            {
              backgroundColor:
                item.post_type === 'announcement'
                  ? '#3b82f6'
                  : item.post_type === 'exam'
                  ? '#ef4444'
                  : '#10b981',
            },
          ]}
        >
          <Text style={styles.postTypeText}>
            {item.post_type?.toUpperCase() || 'POST'}
          </Text>
        </View>
      </View>

      <Text style={styles.postContent}>{item.content}</Text>

      {item.images && item.images.length > 0 && (
        <View style={styles.imagesContainer}>
          {item.images.slice(0, 2).map((img: string, idx: number) => (
            <Image key={idx} source={{ uri: img }} style={styles.postImage} />
          ))}
        </View>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleReject(item.id)}
          disabled={processingId === item.id}
        >
          {processingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="close" size={18} color="#fff" />
              <Text style={styles.buttonText}>Reject</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.approveButton}
          onPress={() => handleApprove(item.id)}
          disabled={processingId === item.id}
        >
          {processingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={styles.buttonText}>Approve</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const filteredPosts = posts.filter((post) => {
    if (filter === 'all') return true;
    if (filter === 'general') return !post.post_type || post.post_type === 'general';
    return post.post_type === filter;
  });

  const counts = {
    all: posts.length,
    announcement: posts.filter((p) => p.post_type === 'announcement').length,
    exam: posts.filter((p) => p.post_type === 'exam').length,
    general: posts.filter((p) => !p.post_type || p.post_type === 'general').length,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="Content Moderation"
        subtitle="Review queued posts before publishing"
        count={filteredPosts.length}
        onBack={() => navigation.goBack()}
        onRefresh={loadPendingPosts}
      />

      <AdminFilterChips<ModerationFilter>
        selected={filter}
        onSelect={setFilter}
        options={[
          { label: 'All', value: 'all', count: counts.all },
          { label: 'Announcements', value: 'announcement', count: counts.announcement },
          { label: 'Exam', value: 'exam', count: counts.exam },
          { label: 'General', value: 'general', count: counts.general },
        ]}
      />

      <FlatList
        data={filteredPosts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="check-circle" size={64} color={Colors.primary} />
            <Text style={styles.emptyText}>All posts approved!</Text>
            <Text style={styles.emptySubtext}>No pending posts to review</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    listContent: {
      padding: Spacing.md,
    },
    postCard: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    posterInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.md,
      gap: Spacing.md,
    },
    posterAvatar: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    posterInitials: {
      color: '#fff',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
    },
    posterName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    postTime: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    postTypeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.md,
    },
    postTypeText: {
      color: '#fff',
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
    },
    postContent: {
      fontSize: FontSizes.md,
      color: Colors.text,
      lineHeight: 20,
      marginBottom: Spacing.md,
    },
    imagesContainer: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    postImage: {
      width: 80,
      height: 80,
      borderRadius: BorderRadius.md,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    rejectButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef4444',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      gap: 6,
    },
    approveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10b981',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      gap: 6,
    },
    buttonText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: Spacing.md,
    },
    emptySubtext: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.sm,
    },
  });
