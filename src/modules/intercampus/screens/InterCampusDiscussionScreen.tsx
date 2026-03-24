// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { isFacultyOrAdminRole } from '../../../utils/roles';
import {
  createInterCampusDiscussion,
  createInterCampusDiscussionReply,
  deleteInterCampusDiscussionReply,
  getInterCampusDiscussionReplies,
  getInterCampusDiscussions,
  lockInterCampusDiscussion,
} from '../api/intercampus';
import { InterCampusDiscussion, InterCampusDiscussionReply } from '../types/intercampus';
import InterCampusScreen from '../components/InterCampusScreen';

type Route = RouteProp<RootStackParamList, 'InterCampusDiscussion'>;
type Nav = StackNavigationProp<RootStackParamList>;

type Props = {
  eventId?: string;
  embedded?: boolean;
};

export default function InterCampusDiscussionScreen({ eventId, embedded = false }: Props) {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const targetEventId = eventId || route.params?.eventId;

  const [loading, setLoading] = useState(true);
  const [discussions, setDiscussions] = useState<InterCampusDiscussion[]>([]);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);
  const [replies, setReplies] = useState<InterCampusDiscussionReply[]>([]);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newReply, setNewReply] = useState('');

  const isModerator = isFacultyOrAdminRole(profile?.role);

  const loadDiscussions = useCallback(async () => {
    if (!targetEventId) return;
    try {
      setLoading(true);
      const data = await getInterCampusDiscussions(targetEventId);
      setDiscussions(data);

      const firstId = selectedDiscussionId && data.find((item) => item.id === selectedDiscussionId)
        ? selectedDiscussionId
        : data[0]?.id || null;

      setSelectedDiscussionId(firstId);

      if (firstId) {
        const loadedReplies = await getInterCampusDiscussionReplies(firstId);
        setReplies(loadedReplies);
      } else {
        setReplies([]);
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load discussion', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [selectedDiscussionId, targetEventId]);

  useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

  const openDiscussion = async (discussionId: string) => {
    setSelectedDiscussionId(discussionId);
    try {
      const data = await getInterCampusDiscussionReplies(discussionId);
      setReplies(data);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load replies', text2: error?.message });
    }
  };

  const createTopic = async () => {
    if (!user?.id) return;
    if (!targetEventId) return;
    if (!newTopicTitle.trim()) {
      Toast.show({ type: 'error', text1: 'Topic title is required' });
      return;
    }

    try {
      const discussion = await createInterCampusDiscussion(targetEventId, user.id, newTopicTitle.trim());
      setDiscussions((prev) => [discussion, ...prev]);
      setNewTopicTitle('');
      await openDiscussion(discussion.id);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not create topic', text2: error?.message });
    }
  };

  const sendReply = async () => {
    if (!user?.id || !selectedDiscussionId) return;
    if (!newReply.trim()) return;

    try {
      const reply = await createInterCampusDiscussionReply(selectedDiscussionId, user.id, newReply.trim());
      setReplies((prev) => [...prev, reply]);
      setNewReply('');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not send reply', text2: error?.message });
    }
  };

  const removeReply = async (replyId: string) => {
    try {
      await deleteInterCampusDiscussionReply(replyId);
      setReplies((prev) => prev.filter((item) => item.id !== replyId));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not delete reply', text2: error?.message });
    }
  };

  const toggleLock = async (discussion: InterCampusDiscussion) => {
    try {
      const updated = await lockInterCampusDiscussion(discussion.id, !discussion.is_locked);
      setDiscussions((prev) => prev.map((item) => (item.id === discussion.id ? { ...item, is_locked: updated.is_locked } : item)));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not update lock', text2: error?.message });
    }
  };

  if (loading) {
    return (
      <InterCampusScreen contentStyle={styles.centerWrap}>
        <ActivityIndicator color="#6366F1" />
      </InterCampusScreen>
    );
  }

  const selectedDiscussion = discussions.find((item) => item.id === selectedDiscussionId) || null;

  const Container = embedded ? View : InterCampusScreen;

  return (
    <Container style={[styles.container, embedded && { flex: 0 }]}>
      {!embedded && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Discussion</Text>
          <TouchableOpacity onPress={loadDiscussions}>
            <MaterialIcons name="refresh" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create Topic</Text>
          <TextInput
            style={styles.input}
            value={newTopicTitle}
            onChangeText={setNewTopicTitle}
            placeholder="Topic title"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={createTopic}>
            <Text style={styles.primaryBtnText}>Create Topic</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Topics</Text>
          {discussions.length === 0 ? (
            <Text style={styles.emptyText}>No topics yet.</Text>
          ) : (
            discussions.map((discussion) => (
              <TouchableOpacity
                key={discussion.id}
                style={[
                  styles.topicRow,
                  selectedDiscussionId === discussion.id && styles.topicRowActive,
                ]}
                onPress={() => openDiscussion(discussion.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.topicTitle}>{discussion.title}</Text>
                  <Text style={styles.topicMeta}>
                    by {discussion.creator?.full_name || 'User'} {discussion.is_locked ? '| Locked' : ''}
                  </Text>
                </View>
                {isModerator && (
                  <TouchableOpacity onPress={() => toggleLock(discussion)}>
                    <MaterialIcons name={discussion.is_locked ? 'lock-open' : 'lock'} size={18} color="#6366F1" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Replies</Text>
          {!selectedDiscussion ? (
            <Text style={styles.emptyText}>Select a topic to view replies.</Text>
          ) : (
            <>
              {replies.length === 0 ? (
                <Text style={styles.emptyText}>No replies yet.</Text>
              ) : (
                replies.map((reply) => {
                  const canDelete = reply.user_id === user?.id || isModerator;
                  return (
                    <View key={reply.id} style={styles.replyRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.replyName}>{reply.user?.full_name || 'User'}</Text>
                        <Text style={styles.replyText}>{reply.message}</Text>
                      </View>
                      {canDelete && (
                        <TouchableOpacity onPress={() => removeReply(reply.id)}>
                          <MaterialIcons name="delete-outline" size={18} color="#b91c1c" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}

              {!selectedDiscussion.is_locked && (
                <View style={styles.replyInputRow}>
                  <TextInput
                    style={styles.replyInput}
                    value={newReply}
                    onChangeText={setNewReply}
                    placeholder="Reply"
                    placeholderTextColor="#94a3b8"
                  />
                  <TouchableOpacity onPress={sendReply}>
                    <MaterialIcons name="send" size={18} color="#6366F1" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  content: { padding: 16, gap: 12, paddingBottom: 90 },
  card: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 16,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  primaryBtn: {
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  emptyText: { fontSize: 12, color: '#64748b' },
  topicRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topicRowActive: {
    borderColor: 'rgba(99,102,241,0.35)',
    backgroundColor: 'rgba(99,102,241,0.1)',
  },
  topicTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  topicMeta: { marginTop: 3, fontSize: 11, color: '#64748b' },
  replyRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyName: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  replyText: { marginTop: 3, fontSize: 12, color: '#334155' },
  replyInputRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  replyInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
});
