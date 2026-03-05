import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import {
  closeInterCampusTeamPost,
  createInterCampusTeamPost,
  deleteInterCampusTeamPost,
  getInterCampusEventById,
  getInterCampusTeamPostReplies,
  getInterCampusTeamPosts,
  replyToInterCampusTeamPost,
} from '../api/intercampus';
import { createDirectConversation } from '../../../api/chat';
import { InterCampusEvent, InterCampusTeamPost, InterCampusTeamPostReply } from '../types/intercampus';

type Route = RouteProp<RootStackParamList, 'InterCampusTeamUp'>;
type Nav = StackNavigationProp<RootStackParamList>;

export default function InterCampusTeamUpScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [event, setEvent] = useState<InterCampusEvent | null>(null);
  const [posts, setPosts] = useState<InterCampusTeamPost[]>([]);
  const [repliesByPost, setRepliesByPost] = useState<Record<string, InterCampusTeamPostReply[]>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [skills, setSkills] = useState('');
  const [teamSizeNeeded, setTeamSizeNeeded] = useState('');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});

  const isModerator = profile?.role === 'admin' || profile?.role === 'faculty';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [eventData, postsData] = await Promise.all([
        getInterCampusEventById(route.params.eventId, user?.id),
        getInterCampusTeamPosts(route.params.eventId),
      ]);
      setEvent(eventData);
      setPosts(postsData);

      const replyEntries = await Promise.all(
        postsData.map(async (post) => [post.id, await getInterCampusTeamPostReplies(post.id)] as const),
      );

      const map: Record<string, InterCampusTeamPostReply[]> = {};
      replyEntries.forEach(([postId, replies]) => {
        map[postId] = replies;
      });
      setRepliesByPost(map);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load team-up data', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [route.params.eventId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canCreatePost = useMemo(() => {
    if (!event) return false;
    return event.participation_type === 'team';
  }, [event]);

  const handleCreatePost = async () => {
    if (!user?.id || !event?.id) return;
    if (!message.trim()) {
      Toast.show({ type: 'error', text1: 'Team request message is required' });
      return;
    }

    try {
      const needed = teamSizeNeeded.trim() ? Number(teamSizeNeeded.trim()) : undefined;
      const post = await createInterCampusTeamPost(user.id, {
        event_id: event.id,
        message: message.trim(),
        required_skills: skills.split(',').map((item) => item.trim()).filter(Boolean),
        team_size_needed: Number.isFinite(needed) ? needed : undefined,
        min_team_size: event.min_team_size || undefined,
        max_team_size: event.max_team_size || undefined,
      });

      setPosts((prev) => [post, ...prev]);
      setRepliesByPost((prev) => ({ ...prev, [post.id]: [] }));
      setMessage('');
      setSkills('');
      setTeamSizeNeeded('');
      Toast.show({ type: 'success', text1: 'Team request created' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not create request', text2: error?.message });
    }
  };

  const handleReply = async (postId: string) => {
    if (!user?.id) return;
    const text = (replyInputs[postId] || '').trim();
    if (!text) return;

    try {
      const newReply = await replyToInterCampusTeamPost(user.id, postId, text);
      setRepliesByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newReply],
      }));
      setReplyInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Reply failed', text2: error?.message });
    }
  };

  const handleDM = async (targetUserId: string, name?: string | null) => {
    if (!user?.id) return;
    try {
      const conversation = await createDirectConversation(user.id, targetUserId);
      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        name: name || 'User',
        isGroup: false,
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not open DM', text2: error?.message });
    }
  };

  const handleClosePost = async (postId: string) => {
    try {
      await closeInterCampusTeamPost(postId);
      setPosts((prev) => prev.map((item) => (item.id === postId ? { ...item, status: 'closed' } : item)));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not close request', text2: error?.message });
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteInterCampusTeamPost(postId);
      setPosts((prev) => prev.filter((item) => item.id !== postId));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not remove request', text2: error?.message });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <ActivityIndicator color="#0f766e" />
      </SafeAreaView>
    );
  }

  if (!event || event.participation_type !== 'team') {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <Text style={styles.emptyText}>Team up is available only for team events.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Up</Text>
        <TouchableOpacity onPress={loadData}>
          <MaterialIcons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.eventInfo}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventSub}>{event.college_name}</Text>
          <Text style={styles.eventSub}>Team size: {event.min_team_size || '-'} to {event.max_team_size || '-'}</Text>
        </View>

        {canCreatePost && (
          <View style={styles.createCard}>
            <Text style={styles.sectionTitle}>Create Team Request</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={message}
              onChangeText={setMessage}
              placeholder="Describe the role and expectations"
              placeholderTextColor="#94a3b8"
              multiline
            />
            <TextInput
              style={styles.input}
              value={skills}
              onChangeText={setSkills}
              placeholder="Required skills (comma separated)"
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={styles.input}
              value={teamSizeNeeded}
              onChangeText={setTeamSizeNeeded}
              placeholder="Team size needed"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreatePost}>
              <Text style={styles.primaryBtnText}>Post Team Request</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Open Requests</Text>
        {posts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No team requests yet.</Text>
          </View>
        ) : (
          posts.map((post) => {
            const replies = repliesByPost[post.id] || [];
            const canManage = post.created_by === user?.id || isModerator;

            return (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.postAuthor}>{post.creator?.full_name || 'Student'}</Text>
                  <Text style={[styles.status, post.status === 'open' ? styles.statusOpen : styles.statusClosed]}>
                    {post.status}
                  </Text>
                </View>
                <Text style={styles.postMessage}>{post.message}</Text>
                {!!post.required_skills?.length && (
                  <Text style={styles.postMeta}>Skills: {post.required_skills.join(', ')}</Text>
                )}
                {!!post.team_size_needed && (
                  <Text style={styles.postMeta}>Needs: {post.team_size_needed}</Text>
                )}

                <View style={styles.actionsRow}>
                  {canManage && post.status === 'open' && (
                    <TouchableOpacity style={styles.smallBtn} onPress={() => handleClosePost(post.id)}>
                      <Text style={styles.smallBtnText}>Close</Text>
                    </TouchableOpacity>
                  )}
                  {canManage && (
                    <TouchableOpacity style={styles.smallBtnDanger} onPress={() => handleDeletePost(post.id)}>
                      <Text style={styles.smallBtnDangerText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.replyWrap}>
                  {replies.map((reply) => (
                    <View key={reply.id} style={styles.replyCard}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.replyName}>{reply.user?.full_name || 'User'}</Text>
                        {reply.user_id !== user?.id && (
                          <TouchableOpacity onPress={() => handleDM(reply.user_id, reply.user?.full_name)}>
                            <Text style={styles.dmLink}>DM</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.replyText}>{reply.message}</Text>
                    </View>
                  ))}

                  {post.status === 'open' && (
                    <View style={styles.replyInputRow}>
                      <TextInput
                        style={styles.replyInput}
                        placeholder="Reply"
                        placeholderTextColor="#94a3b8"
                        value={replyInputs[post.id] || ''}
                        onChangeText={(text) => setReplyInputs((prev) => ({ ...prev, [post.id]: text }))}
                      />
                      <TouchableOpacity onPress={() => handleReply(post.id)}>
                        <MaterialIcons name="send" size={18} color="#0f766e" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  content: { padding: 16, gap: 10 },
  eventInfo: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  eventTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  eventSub: { marginTop: 3, fontSize: 12, color: '#64748b' },
  createCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    paddingVertical: 11,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  emptyCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
  },
  postCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  postAuthor: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  status: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statusOpen: { color: '#047857' },
  statusClosed: { color: '#b45309' },
  postMessage: { fontSize: 13, color: '#0f172a' },
  postMeta: { fontSize: 12, color: '#64748b' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  smallBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#dcfce7',
  },
  smallBtnText: { color: '#047857', fontSize: 11, fontWeight: '700' },
  smallBtnDanger: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fee2e2',
  },
  smallBtnDangerText: { color: '#b91c1c', fontSize: 11, fontWeight: '700' },
  replyWrap: { gap: 6, marginTop: 2 },
  replyCard: { borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', padding: 8, gap: 3 },
  replyName: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  dmLink: { fontSize: 11, color: '#0f766e', fontWeight: '700' },
  replyText: { fontSize: 12, color: '#334155' },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  replyInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
});
