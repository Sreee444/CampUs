// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import {
  approveInterCampusSubmission,
  deleteInterCampusDiscussionReply,
  deleteInterCampusTeamPost,
  getInterCampusAdminOverview,
  getInterCampusAllDiscussionReplies,
  getInterCampusAllDiscussions,
  getInterCampusAllTeamPosts,
  getInterCampusInterestedUsers,
  getInterCampusPendingSubmissions,
  lockInterCampusDiscussion,
  rejectInterCampusSubmission,
} from '../api/intercampus';

type Nav = StackNavigationProp<RootStackParamList>;

type Pending = {
  id: string;
  event_title?: string;
  college_name?: string;
};

export default function AdminInterCampusManagementScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [teamPosts, setTeamPosts] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [interestSample, setInterestSample] = useState<any[]>([]);

  const isAdmin = profile?.role === 'admin';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewData, pendingData, postsData, discussionsData, repliesData] = await Promise.all([
        getInterCampusAdminOverview(),
        getInterCampusPendingSubmissions(),
        getInterCampusAllTeamPosts(),
        getInterCampusAllDiscussions(),
        getInterCampusAllDiscussionReplies(),
      ]);

      setOverview(overviewData);
      setPending((pendingData || []) as Pending[]);
      setTeamPosts(postsData || []);
      setDiscussions(discussionsData || []);
      setReplies(repliesData || []);

      const firstEventId = postsData?.[0]?.event_id;
      if (firstEventId) {
        const interested = await getInterCampusInterestedUsers(firstEventId);
        setInterestSample(interested.slice(0, 10));
      } else {
        setInterestSample([]);
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load management data', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const approveSubmission = async (submissionId: string) => {
    if (!user?.id) return;
    try {
      await approveInterCampusSubmission(user.id, { submission_id: submissionId });
      setPending((prev) => prev.filter((item) => item.id !== submissionId));
      Toast.show({ type: 'success', text1: 'Submission approved' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Approval failed', text2: error?.message });
    }
  };

  const rejectSubmission = async (submissionId: string) => {
    try {
      await rejectInterCampusSubmission(submissionId);
      setPending((prev) => prev.filter((item) => item.id !== submissionId));
      Toast.show({ type: 'success', text1: 'Submission rejected' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Reject failed', text2: error?.message });
    }
  };

  const removeTeamPost = async (postId: string) => {
    try {
      await deleteInterCampusTeamPost(postId);
      setTeamPosts((prev) => prev.filter((item) => item.id !== postId));
      Toast.show({ type: 'success', text1: 'Team post removed' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not remove team post', text2: error?.message });
    }
  };

  const toggleDiscussionLock = async (discussionId: string, currentState: boolean) => {
    try {
      await lockInterCampusDiscussion(discussionId, !currentState);
      setDiscussions((prev) => prev.map((item) => (item.id === discussionId ? { ...item, is_locked: !currentState } : item)));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not lock discussion', text2: error?.message });
    }
  };

  const removeReply = async (replyId: string) => {
    try {
      await deleteInterCampusDiscussionReply(replyId);
      setReplies((prev) => prev.filter((item) => item.id !== replyId));
      Toast.show({ type: 'success', text1: 'Reply deleted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not delete reply', text2: error?.message });
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <Text style={styles.emptyTitle}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <ActivityIndicator color="#0f766e" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>InterCampus Management</Text>
        <TouchableOpacity onPress={loadData}>
          <MaterialIcons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.overviewRow}>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{overview?.pending_submissions || 0}</Text><Text style={styles.metricLabel}>Pending</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{overview?.open_team_posts || 0}</Text><Text style={styles.metricLabel}>Team Posts</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{overview?.locked_discussions || 0}</Text><Text style={styles.metricLabel}>Locked</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{overview?.interested_users || 0}</Text><Text style={styles.metricLabel}>Interested</Text></View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Approve Events</Text>
          {pending.length === 0 ? <Text style={styles.emptyText}>No pending submissions.</Text> : pending.map((item) => (
            <View key={item.id} style={styles.rowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.event_title || 'Untitled'}</Text>
                <Text style={styles.rowMeta}>{item.college_name || 'Unknown college'}</Text>
              </View>
              <TouchableOpacity style={styles.approveBtn} onPress={() => approveSubmission(item.id)}>
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectSubmission(item.id)}>
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Remove Team Posts</Text>
          {teamPosts.slice(0, 10).map((post) => (
            <View key={post.id} style={styles.rowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{post.event?.title || 'Event'}</Text>
                <Text style={styles.rowMeta}>{post.message}</Text>
              </View>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => removeTeamPost(post.id)}>
                <Text style={styles.rejectText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Lock Discussions</Text>
          {discussions.slice(0, 10).map((discussion) => (
            <View key={discussion.id} style={styles.rowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{discussion.title || 'Untitled topic'}</Text>
                <Text style={styles.rowMeta}>{discussion.event?.title || 'Event'}</Text>
              </View>
              <TouchableOpacity style={styles.approveBtn} onPress={() => toggleDiscussionLock(discussion.id, !!discussion.is_locked)}>
                <Text style={styles.approveText}>{discussion.is_locked ? 'Unlock' : 'Lock'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Delete Replies</Text>
          {replies.slice(0, 10).map((reply) => (
            <View key={reply.id} style={styles.rowItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMeta}>{reply.message}</Text>
                <Text style={styles.rowMeta}>Topic: {reply.discussion?.title || '-'}</Text>
              </View>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => removeReply(reply.id)}>
                <Text style={styles.rejectText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Interested Users (sample)</Text>
          {interestSample.length === 0 ? (
            <Text style={styles.emptyText}>No interested users available yet.</Text>
          ) : (
            interestSample.map((item) => (
              <View key={item.id} style={styles.rowItem}>
                <Text style={styles.rowTitle}>{item.user?.full_name || 'User'}</Text>
                <Text style={styles.rowMeta}>{item.user?.department || item.user?.role || ''}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  content: { padding: 16, gap: 10 },
  overviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  metricValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  metricLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  emptyText: { fontSize: 12, color: '#64748b' },
  rowItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 8,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  rowMeta: { fontSize: 11, color: '#64748b', flexShrink: 1 },
  approveBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dcfce7',
  },
  approveText: { color: '#047857', fontSize: 11, fontWeight: '700' },
  rejectBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
  },
  rejectText: { color: '#b91c1c', fontSize: 11, fontWeight: '700' },
});
