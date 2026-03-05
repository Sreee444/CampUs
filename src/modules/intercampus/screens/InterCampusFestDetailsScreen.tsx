// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import {
  getInterCampusEventById,
  getFestEvents,
  getInterCampusDiscussions,
  getInterCampusDiscussionReplies,
  createInterCampusDiscussion,
  createInterCampusDiscussionReply,
  deleteInterCampusDiscussionReply,
  lockInterCampusDiscussion,
} from '../api/intercampus';
import { InterCampusEvent, InterCampusDiscussion, InterCampusDiscussionReply } from '../types/intercampus';
import InterCampusEventCard from '../components/InterCampusEventCard';

type Route = RouteProp<RootStackParamList, 'InterCampusFestDetails'>;
type Nav = StackNavigationProp<RootStackParamList>;
type SubTab = 'events' | 'discussion';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function InterCampusFestDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const isModerator = isFacultyOrAdminRole(profile?.role);

  const [fest, setFest] = useState<InterCampusEvent | null>(null);
  const [festEvents, setFestEvents] = useState<InterCampusEvent[]>([]);
  const [loadingFest, setLoadingFest] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('events');

  /* ─── Discussion state ─── */
  const [discussions, setDiscussions] = useState<InterCampusDiscussion[]>([]);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);
  const [replies, setReplies] = useState<InterCampusDiscussionReply[]>([]);
  const [loadingDiscussion, setLoadingDiscussion] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newReply, setNewReply] = useState('');

  /* ─── Load Fest ─── */
  const loadFest = useCallback(async () => {
    try {
      setLoadingFest(true);
      const data = await getInterCampusEventById(route.params.festId);
      setFest(data);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to load fest', text2: err?.message });
    } finally {
      setLoadingFest(false);
    }
  }, [route.params.festId]);

  /* ─── Load Fest Events ─── */
  const loadFestEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      const data = await getFestEvents(route.params.festId);
      setFestEvents(data);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to load events', text2: err?.message });
    } finally {
      setLoadingEvents(false);
    }
  }, [route.params.festId]);

  /* ─── Load Discussions ─── */
  const loadDiscussions = useCallback(async () => {
    try {
      setLoadingDiscussion(true);
      const data = await getInterCampusDiscussions(route.params.festId);
      setDiscussions(data);
      const firstId = data[0]?.id || null;
      setSelectedDiscussionId(firstId);
      if (firstId) {
        const loadedReplies = await getInterCampusDiscussionReplies(firstId);
        setReplies(loadedReplies);
      } else {
        setReplies([]);
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to load discussion', text2: err?.message });
    } finally {
      setLoadingDiscussion(false);
    }
  }, [route.params.festId]);

  useEffect(() => {
    loadFest();
    loadFestEvents();
  }, [loadFest, loadFestEvents]);

  useEffect(() => {
    if (subTab === 'discussion' && discussions.length === 0 && !loadingDiscussion) {
      loadDiscussions();
    }
  }, [subTab]);

  /* ─── Discussion Helpers ─── */
  const openDiscussion = async (discussionId: string) => {
    setSelectedDiscussionId(discussionId);
    try {
      const data = await getInterCampusDiscussionReplies(discussionId);
      setReplies(data);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to load replies', text2: err?.message });
    }
  };

  const createTopic = async () => {
    if (!user?.id || !newTopicTitle.trim()) return;
    try {
      const discussion = await createInterCampusDiscussion(route.params.festId, user.id, newTopicTitle.trim());
      setDiscussions((prev) => [discussion, ...prev]);
      setNewTopicTitle('');
      await openDiscussion(discussion.id);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not create topic', text2: err?.message });
    }
  };

  const sendReply = async () => {
    if (!user?.id || !selectedDiscussionId || !newReply.trim()) return;
    try {
      const reply = await createInterCampusDiscussionReply(selectedDiscussionId, user.id, newReply.trim());
      setReplies((prev) => [...prev, reply]);
      setNewReply('');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not send reply', text2: err?.message });
    }
  };

  const removeReply = async (replyId: string) => {
    try {
      await deleteInterCampusDiscussionReply(replyId);
      setReplies((prev) => prev.filter((r) => r.id !== replyId));
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not delete reply', text2: err?.message });
    }
  };

  const toggleLock = async (disc: InterCampusDiscussion) => {
    try {
      const updated = await lockInterCampusDiscussion(disc.id, !disc.is_locked);
      setDiscussions((prev) => prev.map((d) => (d.id === disc.id ? { ...d, is_locked: updated.is_locked } : d)));
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not update lock', text2: err?.message });
    }
  };

  const selectedDiscussion = discussions.find((d) => d.id === selectedDiscussionId) || null;

  /* ─── Loading state ─── */
  if (loadingFest) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <ActivityIndicator color="#0f766e" size="large" />
      </SafeAreaView>
    );
  }

  if (!fest) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <MaterialIcons name="error-outline" size={36} color="#94a3b8" />
        <Text style={styles.emptyTitle}>Fest not found</Text>
      </SafeAreaView>
    );
  }

  const startStr = formatDate(fest.event_start_date);
  const endStr = formatDate(fest.event_end_date);
  const dateRange = startStr && endStr ? `${startStr} – ${endStr}` : startStr || 'Dates TBA';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loadingEvents}
            onRefresh={() => {
              loadFest();
              loadFestEvents();
              if (subTab === 'discussion') loadDiscussions();
            }}
            tintColor="#0f766e"
          />
        }
      >
        {/* ─── Banner ─── */}
        <View style={styles.bannerWrap}>
          {fest.banner_image ? (
            <Image source={{ uri: fest.banner_image }} style={styles.banner} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <MaterialIcons name="celebration" size={48} color="#0f766e" />
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bannerGradient} />

          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Title over banner */}
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>{fest.title}</Text>
          </View>
        </View>

        {/* ─── Info Section ─── */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <MaterialIcons name="school" size={18} color="#0f766e" />
            <Text style={styles.infoText}>{fest.college_name}</Text>
          </View>
          {!!fest.college_location && (
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={18} color="#0f766e" />
              <Text style={styles.infoText}>{fest.college_location}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
            <Text style={styles.infoText}>{dateRange}</Text>
          </View>
          {!!fest.college_website && (
            <View style={styles.infoRow}>
              <MaterialIcons name="language" size={18} color="#0f766e" />
              <Text style={styles.infoText}>{fest.college_website}</Text>
            </View>
          )}
        </View>

        {/* ─── Sub Tabs ─── */}
        <View style={styles.subTabWrap}>
          {(['events', 'discussion'] as SubTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.subTabBtn, subTab === tab && styles.subTabBtnActive]}
              onPress={() => setSubTab(tab)}
            >
              <MaterialIcons
                name={tab === 'events' ? 'event' : 'forum'}
                size={16}
                color={subTab === tab ? '#ffffff' : '#334155'}
              />
              <Text style={[styles.subTabText, subTab === tab && styles.subTabTextActive]}>
                {tab === 'events' ? 'Events' : 'Discussion'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Events Tab Content ─── */}
        {subTab === 'events' && (
          <View style={styles.tabContent}>
            {loadingEvents ? (
              <ActivityIndicator color="#0f766e" style={{ padding: 30 }} />
            ) : festEvents.length === 0 ? (
              <View style={styles.emptyTabWrap}>
                <MaterialIcons name="event-busy" size={36} color="#94a3b8" />
                <Text style={styles.emptyTabText}>No events under this fest yet</Text>
              </View>
            ) : (
              festEvents.map((event) => (
                <InterCampusEventCard
                  key={event.id}
                  event={event}
                  onPress={() => navigation.navigate('InterCampusEventDetails', { eventId: event.id })}
                />
              ))
            )}
          </View>
        )}

        {/* ─── Discussion Tab Content ─── */}
        {subTab === 'discussion' && (
          <View style={styles.tabContent}>
            {loadingDiscussion ? (
              <ActivityIndicator color="#0f766e" style={{ padding: 30 }} />
            ) : (
              <>
                {/* Create Topic */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Create Topic</Text>
                  <TextInput
                    style={styles.input}
                    value={newTopicTitle}
                    onChangeText={setNewTopicTitle}
                    placeholder="Topic title"
                    placeholderTextColor="#94a3b8"
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={createTopic}>
                    <Text style={styles.primaryBtnText}>Create</Text>
                  </TouchableOpacity>
                </View>

                {/* Topics List */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Topics</Text>
                  {discussions.length === 0 ? (
                    <Text style={styles.muted}>No topics yet. Start the conversation!</Text>
                  ) : (
                    discussions.map((disc) => (
                      <TouchableOpacity
                        key={disc.id}
                        style={[styles.topicRow, selectedDiscussionId === disc.id && styles.topicRowActive]}
                        onPress={() => openDiscussion(disc.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.topicTitle}>{disc.title}</Text>
                          <Text style={styles.topicMeta}>
                            by {disc.creator?.full_name || 'User'} {disc.is_locked ? '| 🔒 Locked' : ''}
                          </Text>
                        </View>
                        {isModerator && (
                          <TouchableOpacity onPress={() => toggleLock(disc)}>
                            <MaterialIcons name={disc.is_locked ? 'lock-open' : 'lock'} size={18} color="#0f766e" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                {/* Replies */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Replies</Text>
                  {!selectedDiscussion ? (
                    <Text style={styles.muted}>Select a topic to view replies.</Text>
                  ) : (
                    <>
                      {replies.length === 0 ? (
                        <Text style={styles.muted}>No replies yet.</Text>
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
                            placeholder="Write a reply..."
                            placeholderTextColor="#94a3b8"
                          />
                          <TouchableOpacity onPress={sendReply}>
                            <MaterialIcons name="send" size={20} color="#0f766e" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  scroll: { flex: 1 },

  /* ─── Banner ─── */
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e2e8f0' },
  bannerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextWrap: { position: 'absolute', bottom: 14, left: 16, right: 16 },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#ffffff' },

  /* ─── Info ─── */
  infoSection: {
    padding: 16,
    gap: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '500' },

  /* ─── Sub Tabs ─── */
  subTabWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    padding: 3,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subTabBtnActive: {
    backgroundColor: '#0f766e',
    shadowColor: '#0f766e',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  subTabText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  subTabTextActive: { color: '#ffffff' },

  /* ─── Tab Content ─── */
  tabContent: { padding: 16, gap: 12 },

  emptyTabWrap: { alignItems: 'center', paddingTop: 30, gap: 8 },
  emptyTabText: { fontSize: 14, color: '#64748b', fontWeight: '600' },

  /* ─── Discussion ─── */
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, color: '#64748b' },

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
  topicRowActive: { borderColor: '#0f766e', backgroundColor: '#ecfdf5' },
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
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
  },
  replyInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: '#0f172a' },
});
