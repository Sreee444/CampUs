// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
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
      <SafeAreaView style={styles.centerWrap}>
        <ActivityIndicator color="#0f766e" />
      </SafeAreaView>
    );
  }

  const selectedDiscussion = discussions.find((item) => item.id === selectedDiscussionId) || null;

  const Container = embedded ? View : SafeAreaView;

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
                    <MaterialIcons name={discussion.is_locked ? 'lock-open' : 'lock'} size={18} color="#0f766e" />
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
                    <MaterialIcons name="send" size={18} color="#0f766e" />
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
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
  card: {
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
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  emptyText: { fontSize: 12, color: '#64748b' },
  topicRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topicRowActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
  },
  topicTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  topicMeta: { marginTop: 3, fontSize: 11, color: '#64748b' },
  replyRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
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
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  replyInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
});
