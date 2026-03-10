// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  SafeAreaView,
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
  approveInterCampusEvent,
  deleteInterCampusEvent,
  deleteInterCampusFest,
  getFestEventsPaginated,
  getInterCampusEventById,
  rejectInterCampusEvent,
} from '../api/intercampus';
import { InterCampusEvent } from '../types/intercampus';
import InterCampusEventCard from '../components/InterCampusEventCard';
import InterCampusDiscussionScreen from './InterCampusDiscussionScreen';

type Route = RouteProp<RootStackParamList, 'InterCampusFestDetails'>;
type Nav = StackNavigationProp<RootStackParamList>;
type SubTab = 'events' | 'discussion';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const openUrl = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
    else Toast.show({ type: 'error', text1: 'Cannot open URL' });
  } catch {
    Toast.show({ type: 'error', text1: 'Failed to open link' });
  }
};

export default function InterCampusFestDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [fest, setFest] = useState<InterCampusEvent | null>(null);
  const [events, setEvents] = useState<InterCampusEvent[]>([]);
  const [subTab, setSubTab] = useState<SubTab>('events');
  const [loadingFest, setLoadingFest] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [eventPage, setEventPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [resolvedFestId, setResolvedFestId] = useState<string | null>(route.params.festId);
  const [approvalLoading, setApprovalLoading] = useState<'approve' | 'reject' | null>(null);
  const [facultyNotes, setFacultyNotes] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isFaculty = isFacultyOrAdminRole(profile?.role);
  const isPending = fest?.verification_status === 'pending';
  const isRejected = fest?.verification_status === 'rejected';
  const isVerified = fest?.verification_status === 'verified';

  const handleDeleteFest = () => {
    const targetFestId = resolvedFestId || fest?.id;
    if (!targetFestId || !fest?.id) return;
    Alert.alert(
      'Delete Fest',
      `Permanently delete "${fest.title}" and all its events? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteInterCampusFest(targetFestId);
              Toast.show({ type: 'success', text1: 'Fest deleted' });
              navigation.goBack();
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Delete failed', text2: error?.message });
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleEditFest = () => {
    if (!fest?.id) return;
    navigation.navigate('EditInterCampusEvent', { eventId: fest.id });
  };

  const handleDeleteEvent = (eventItem: any) => {
    Alert.alert(
      'Delete Event',
      `Delete "${eventItem.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInterCampusEvent(eventItem.id);
              setEvents((prev) => prev.filter((e) => e.id !== eventItem.id));
              Toast.show({ type: 'success', text1: 'Event deleted' });
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Delete failed', text2: error?.message });
            }
          },
        },
      ],
    );
  };

  const loadFest = useCallback(async () => {
    try {
      setLoadingFest(true);
      const data = await getInterCampusEventById(resolvedFestId || route.params.festId, user?.id, true);

      if (data?.is_fest) {
        setFest(data);
        setResolvedFestId(data.id);
      } else if (data?.parent_fest_id) {
        const parentFest = await getInterCampusEventById(data.parent_fest_id, user?.id, true);
        setFest(parentFest);
        setResolvedFestId(parentFest?.id || data.parent_fest_id);
      } else {
        setFest(data);
        setResolvedFestId(data?.id || route.params.festId);
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load fest', text2: error?.message });
    } finally {
      setLoadingFest(false);
    }
  }, [resolvedFestId, route.params.festId, user?.id]);

  const loadFestEvents = useCallback(async (page = 1, append = false) => {
    try {
      const festIdToLoad = resolvedFestId || route.params.festId;
      if (append) setLoadingMore(true);
      else setLoadingEvents(true);
      const result = await getFestEventsPaginated(festIdToLoad, { page, pageSize: 10 });
      setEvents((prev) => (append ? [...prev, ...result.data] : result.data));
      setHasMore(result.hasMore);
      setEventPage(page);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load fest events', text2: error?.message });
    } finally {
      setLoadingEvents(false);
      setLoadingMore(false);
    }
  }, [resolvedFestId, route.params.festId]);

  useEffect(() => {
    loadFest();
    loadFestEvents(1, false);
  }, [loadFest, loadFestEvents]);

  const onLoadMore = () => {
    if (loadingMore || !hasMore || subTab !== 'events') return;
    loadFestEvents(eventPage + 1, true);
  };

  const handleApprove = () => {
    if (!user?.id || !fest?.id) return;
    Alert.alert(
      'Approve Fest',
      `Approve "${fest.title}"? It and its events will go live.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setApprovalLoading('approve');
            try {
              await approveInterCampusEvent(fest.id, user.id, facultyNotes.trim() || undefined);
              setFest((prev) => prev ? { ...prev, verification_status: 'verified' } : prev);
              Toast.show({ type: 'success', text1: 'Fest approved ✓' });
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Approval failed', text2: error?.message });
            } finally {
              setApprovalLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = () => {
    if (!user?.id || !fest?.id) return;
    Alert.alert(
      'Reject Fest',
      `Reject "${fest.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setApprovalLoading('reject');
            try {
              await rejectInterCampusEvent(fest.id, user.id, facultyNotes.trim() || undefined);
              setFest((prev) => prev ? { ...prev, verification_status: 'rejected' } : prev);
              Toast.show({ type: 'success', text1: 'Fest rejected' });
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Rejection failed', text2: error?.message });
            } finally {
              setApprovalLoading(null);
            }
          },
        },
      ],
    );
  };

  if (loadingFest) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <ActivityIndicator color="#7c3aed" size="large" />
        <Text style={styles.loadingText}>Loading fest details…</Text>
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

  const start = formatDate(fest.event_start_date);
  const end = formatDate(fest.event_end_date);
  const dateRange = start && end ? `${start} – ${end}` : start || 'Dates TBA';
  const bannerUri = fest.banner_image || fest.poster_image;

  const ListHeader = (
    <>
      {/* ── Banner ── */}
      <View style={styles.bannerWrap}>
        {bannerUri ? (
          <Image source={{ uri: bannerUri }} style={styles.banner} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <MaterialIcons name="celebration" size={52} color="#7c3aed" />
            <Text style={styles.bannerPlaceholderText}>College Fest</Text>
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={styles.bannerOverlay} />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.bannerTextWrap}>
          {/* Status chip in banner */}
          {isPending ? (
            <View style={styles.statusChipPending}>
              <MaterialIcons name="hourglass-top" size={12} color="#d97706" />
              <Text style={styles.statusChipPendingText}>Pending Review</Text>
            </View>
          ) : isRejected ? (
            <View style={styles.statusChipRejected}>
              <MaterialIcons name="cancel" size={12} color="#b91c1c" />
              <Text style={styles.statusChipRejectedText}>Rejected</Text>
            </View>
          ) : (
            <View style={styles.statusChipVerified}>
              <MaterialIcons name="verified" size={12} color="#047857" />
              <Text style={styles.statusChipVerifiedText}>Verified</Text>
            </View>
          )}
          <Text style={styles.bannerTitle}>{fest.title}</Text>
          <Text style={styles.bannerCollege}>{fest.college_name}</Text>
        </View>
      </View>

      {/* ── Faculty Approval Banner ── */}
      {isFaculty && isPending && (
        <View style={styles.approvalBanner}>
          <View style={styles.approvalBannerHeader}>
            <MaterialIcons name="pending-actions" size={18} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.approvalBannerTitle}>Pending Your Approval</Text>
              <Text style={styles.approvalBannerSub}>Add notes (optional) then approve or reject this fest.</Text>
            </View>
          </View>
          <TextInput
            style={styles.approvalNotesInput}
            value={facultyNotes}
            onChangeText={setFacultyNotes}
            placeholder="Add faculty notes before deciding…"
            placeholderTextColor="#b45309"
            multiline
          />
          <View style={styles.approvalBtns}>
            <TouchableOpacity
              style={[styles.approveAllBtn, approvalLoading === 'approve' && { opacity: 0.6 }]}
              onPress={handleApprove}
              disabled={!!approvalLoading}
            >
              {approvalLoading === 'approve'
                ? <ActivityIndicator size="small" color="#fff" />
                : <><MaterialIcons name="check" size={15} color="#fff" /><Text style={styles.approveAllBtnText}>Approve Fest</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, approvalLoading === 'reject' && { opacity: 0.6 }]}
              onPress={handleReject}
              disabled={!!approvalLoading}
            >
              {approvalLoading === 'reject'
                ? <ActivityIndicator size="small" color="#b91c1c" />
                : <><MaterialIcons name="close" size={15} color="#b91c1c" /><Text style={styles.rejectBtnText}>Reject</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Rejected notice */}
      {isFaculty && isRejected && (
        <View style={[styles.approvalBanner, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
          <View style={styles.approvalBannerHeader}>
            <MaterialIcons name="cancel" size={18} color="#ef4444" />
            <Text style={[styles.approvalBannerTitle, { color: '#b91c1c', marginLeft: 8 }]}>This fest was rejected</Text>
          </View>
        </View>
      )}

      {/* ── Info Card ── */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}><MaterialIcons name="calendar-month" size={15} color="#7c3aed" /></View>
          <Text style={styles.infoText}>{dateRange}</Text>
        </View>
        {!!fest.college_location && (
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}><MaterialIcons name="location-on" size={15} color="#7c3aed" /></View>
            <Text style={styles.infoText}>{fest.college_location}</Text>
          </View>
        )}
        {!!fest.fest_year && (
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}><MaterialIcons name="event" size={15} color="#7c3aed" /></View>
            <Text style={styles.infoText}>Fest Year: {fest.fest_year}</Text>
          </View>
        )}
        {!!fest.faculty_notes && isFaculty && (
          <View style={[styles.infoRow, { backgroundColor: '#fef9c3', borderRadius: 8, padding: 8 }]}>
            <View style={styles.infoIcon}><MaterialIcons name="sticky-note-2" size={15} color="#d97706" /></View>
            <Text style={[styles.infoText, { color: '#92400e' }]}>Faculty Notes: {fest.faculty_notes}</Text>
          </View>
        )}

        {!!fest.description && (
          <Text style={styles.festDesc}>{fest.description}</Text>
        )}

        {/* Link buttons */}
        <View style={styles.linkBtns}>
          {!!fest.college_website && (
            <TouchableOpacity style={styles.linkBtn} onPress={() => openUrl(fest.college_website)}>
              <MaterialIcons name="language" size={14} color="#3b82f6" />
              <Text style={[styles.linkBtnText, { color: '#3b82f6' }]}>College Website</Text>
            </TouchableOpacity>
          )}
          {!!fest.source_url && (
            <TouchableOpacity style={[styles.linkBtn, { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]} onPress={() => openUrl(fest.source_url)}>
              <MaterialIcons name="open-in-new" size={14} color="#7c3aed" />
              <Text style={[styles.linkBtnText, { color: '#7c3aed' }]}>Official Link</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Edit / Delete Fest (faculty/admin) */}
        {isFaculty && (
          <View style={styles.festAdminRow}>
            <TouchableOpacity style={styles.festEditBtn} onPress={handleEditFest}>
              <MaterialIcons name="edit" size={14} color="#7c3aed" />
              <Text style={styles.festEditBtnText}>Edit Fest</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.festDeleteBtn, deleting && { opacity: 0.6 }]}
              onPress={handleDeleteFest}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#b91c1c" />
                : <><MaterialIcons name="delete" size={14} color="#b91c1c" /><Text style={styles.festDeleteBtnText}>Delete Fest</Text></>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Tabs (only show Discussion for verified fests) ── */}
      <View style={styles.subTabWrap}>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'events' && styles.subTabBtnActive]}
          onPress={() => setSubTab('events')}
        >
          <MaterialIcons name="event" size={15} color={subTab === 'events' ? '#fff' : '#64748b'} />
          <Text style={[styles.subTabText, subTab === 'events' && styles.subTabTextActive]}>Events</Text>
        </TouchableOpacity>
        {isVerified && (
          <TouchableOpacity
            style={[styles.subTabBtn, subTab === 'discussion' && styles.subTabBtnActive]}
            onPress={() => setSubTab('discussion')}
          >
            <MaterialIcons name="forum" size={15} color={subTab === 'discussion' ? '#fff' : '#64748b'} />
            <Text style={[styles.subTabText, subTab === 'discussion' && styles.subTabTextActive]}>Discussion</Text>
          </TouchableOpacity>
        )}
      </View>

      {subTab === 'discussion' ? (
        <View style={{ marginTop: 10 }}>
          <InterCampusDiscussionScreen eventId={fest.id} embedded />
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={subTab === 'events' ? events : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.eventCardWrapper}>
            <InterCampusEventCard
              event={item}
              onPress={() => navigation.navigate('InterCampusEventDetails', { eventId: item.id })}
            />
            {isFaculty && (
              <View style={styles.eventItemAdminRow}>
                <TouchableOpacity
                  style={styles.eventItemEditBtn}
                  onPress={() => navigation.navigate('EditInterCampusEvent', { eventId: item.id })}
                >
                  <MaterialIcons name="edit" size={13} color="#7c3aed" />
                  <Text style={styles.eventItemEditText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventItemDeleteBtn}
                  onPress={() => handleDeleteEvent(item)}
                >
                  <MaterialIcons name="delete" size={13} color="#b91c1c" />
                  <Text style={styles.eventItemDeleteText}>Delete</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <Text style={styles.eventItemAdminLabel}>Admin</Text>
              </View>
            )}
          </View>
        )}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.45}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          subTab === 'events' && !loadingEvents ? (
            <View style={styles.emptyWrap}>
              <MaterialIcons name="event-busy" size={34} color="#94a3b8" />
              <Text style={styles.emptyText}>No events under this fest yet</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          subTab === 'events' ? (
            loadingEvents || loadingMore
              ? <ActivityIndicator color="#7c3aed" style={{ marginVertical: 12 }} />
              : <View style={{ height: 20 }} />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={loadingFest || loadingEvents}
            onRefresh={() => { loadFest(); loadFestEvents(1, false); }}
            tintColor="#7c3aed"
          />
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', gap: 8 },
  loadingText: { fontSize: 13, color: '#64748b', marginTop: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  listContent: { paddingBottom: 32 },

  // ── Banner ──
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e2e8f0' },
  bannerPlaceholder: {
    width: '100%', aspectRatio: 16 / 9,
    backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  bannerPlaceholderText: { fontSize: 14, fontWeight: '700', color: '#7c3aed' },
  bannerOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 130 },
  backBtn: {
    position: 'absolute', top: 12, left: 12, width: 38, height: 38,
    borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  bannerTextWrap: { position: 'absolute', left: 16, right: 16, bottom: 12, gap: 4 },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#ffffff', lineHeight: 28 },
  bannerCollege: { fontSize: 13, color: 'rgba(255,255,255,0.82)', fontWeight: '600' },

  // Status chips in banner
  statusChipPending: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: '#fef3c7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  statusChipPendingText: { fontSize: 10, fontWeight: '700', color: '#d97706' },
  statusChipRejected: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  statusChipRejectedText: { fontSize: 10, fontWeight: '700', color: '#b91c1c' },
  statusChipVerified: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: '#dcfce7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  statusChipVerifiedText: { fontSize: 10, fontWeight: '700', color: '#047857' },

  // ── Approval Banner ──
  approvalBanner: {
    margin: 16, marginBottom: 0, borderRadius: 14, borderWidth: 1,
    borderColor: '#fcd34d', backgroundColor: '#fffbeb', padding: 14, gap: 10,
  },
  approvalBannerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  approvalBannerTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  approvalBannerSub: { fontSize: 11, color: '#b45309', marginTop: 2 },
  approvalNotesInput: {
    borderWidth: 1, borderColor: '#fcd34d', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: '#92400e',
    backgroundColor: '#fef9c3', minHeight: 54, textAlignVertical: 'top',
  },
  approvalBtns: { flexDirection: 'row', gap: 8 },
  approveAllBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 11,
  },
  approveAllBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#fee2e2', borderRadius: 10, paddingVertical: 11,
  },
  rejectBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },

  // ── Info Card ──
  infoCard: {
    margin: 16, marginBottom: 0, borderRadius: 16,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0',
    padding: 14, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center',
  },
  infoText: { fontSize: 13, color: '#334155', fontWeight: '600', flex: 1, lineHeight: 18 },
  festDesc: { fontSize: 13, color: '#475569', lineHeight: 20, paddingTop: 4 },

  // Link buttons
  linkBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 12,
    backgroundColor: '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe',
  },
  linkBtnText: { fontSize: 12, fontWeight: '700' },

  // ── Tabs ──
  subTabWrap: {
    flexDirection: 'row', margin: 16, marginBottom: 8,
    borderRadius: 12, backgroundColor: '#e2e8f0', padding: 3, gap: 2,
  },
  subTabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, paddingVertical: 10,
  },
  subTabBtnActive: { backgroundColor: '#7c3aed' },
  subTabText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  subTabTextActive: { color: '#ffffff' },

  // Empty/footer
  emptyWrap: { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyText: { fontSize: 14, color: '#64748b', fontWeight: '600' },

  // Fest-level admin actions (edit/delete fest)
  festAdminRow: {
    flexDirection: 'row', gap: 10, marginTop: 8,
  },
  festEditBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, backgroundColor: '#f5f3ff',
    paddingVertical: 10, borderWidth: 1, borderColor: '#ddd6fe',
  },
  festEditBtnText: { color: '#7c3aed', fontWeight: '700', fontSize: 13 },
  festDeleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, backgroundColor: '#fef2f2',
    paddingVertical: 10, borderWidth: 1, borderColor: '#fca5a5',
  },
  festDeleteBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },

  // Per-event admin row (under each event card)
  eventCardWrapper: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  eventItemAdminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  eventItemAdminLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventItemEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 14,
    backgroundColor: '#f5f3ff', borderRadius: 999,
    borderWidth: 1, borderColor: '#ddd6fe',
  },
  eventItemEditText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
  eventItemDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 14,
    backgroundColor: '#fef2f2', borderRadius: 999,
    borderWidth: 1, borderColor: '#fca5a5',
  },
  eventItemDeleteText: { fontSize: 11, fontWeight: '700', color: '#b91c1c' },
});
