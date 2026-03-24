import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { StackNavigationProp } from '@react-navigation/stack'
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import { approveInterCampusEvent, deleteInterCampusEvent, getInterCampusEventById, rejectInterCampusEvent, toggleInterCampusInterested } from '../api/intercampus';
import { InterCampusEvent } from '../types/intercampus';
import InterCampusScreen from '../components/InterCampusScreen';

type Route = RouteProp<RootStackParamList, 'InterCampusEventDetails'>;
type Nav = StackNavigationProp<RootStackParamList>;

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

export default function InterCampusEventDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [event, setEvent] = useState<InterCampusEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingInterest, setProcessingInterest] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState<'approve' | 'reject' | null>(null);
  const [facultyNotes, setFacultyNotes] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isFaculty = isFacultyOrAdminRole(profile?.role);
  const isPending = event?.verification_status === 'pending';
  const isUnapproved = event?.verification_status === 'pending' || event?.verification_status === 'rejected';

  const handleDelete = () => {
    if (!event?.id) return;
    Alert.alert(
      'Delete Event',
      `Permanently delete "${event.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteInterCampusEvent(event.id);
              Toast.show({ type: 'success', text1: 'Event deleted' });
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

  const handleEdit = () => {
    if (!event?.id) return;
    navigation.navigate('EditInterCampusEvent', { eventId: event.id });
  };

  const loadEvent = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInterCampusEventById(route.params.eventId, user?.id, true);
      setEvent(data);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load event', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [route.params.eventId, user?.id]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const openRegistration = async () => {
    if (!event?.registration_link) {
      Toast.show({ type: 'info', text1: 'No registration link available yet' });
      return;
    }
    await openUrl(event.registration_link);
  };

  const openWebsite = async () => {
    if (!event?.college_website) return;
    await openUrl(event.college_website);
  };

  const openSourceUrl = async () => {
    if (!event?.source_url) return;
    await openUrl(event.source_url);
  };

  const handleToggleInterested = async () => {
    if (!user?.id || !event?.id) return;
    try {
      setProcessingInterest(true);
      const interestedNow = await toggleInterCampusInterested(event.id, user.id);
      setEvent((prev) => {
        if (!prev) return prev;
        const currentCount = prev.interested_count || 0;
        return {
          ...prev,
          is_interested: interestedNow,
          interested_count: interestedNow ? currentCount + 1 : Math.max(0, currentCount - 1),
        };
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not update interest', text2: error?.message });
    } finally {
      setProcessingInterest(false);
    }
  };

  const handleApprove = async () => {
    if (!user?.id || !event?.id) return;
    Alert.alert(
      'Approve Event',
      `Approve "${event.title}"? It will become visible to all students.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setApprovalLoading('approve');
            try {
              await approveInterCampusEvent(event.id, user.id, facultyNotes.trim() || undefined);
              setEvent((prev) => prev ? { ...prev, verification_status: 'verified' } : prev);
              Toast.show({ type: 'success', text1: 'Event approved ✓' });
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

  const handleReject = async () => {
    if (!user?.id || !event?.id) return;
    Alert.alert(
      'Reject Event',
      `Reject "${event.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setApprovalLoading('reject');
            try {
              await rejectInterCampusEvent(event.id, user.id, facultyNotes.trim() || undefined);
              setEvent((prev) => prev ? { ...prev, verification_status: 'rejected' } : prev);
              Toast.show({ type: 'success', text1: 'Event rejected' });
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

  if (loading) {
    return (
      <InterCampusScreen contentStyle={styles.centerWrap}>
        <ActivityIndicator color="#6366F1" size="large" />
      </InterCampusScreen>
    );
  }

  if (!event) {
    return (
      <InterCampusScreen contentStyle={styles.centerWrap}>
        <MaterialIcons name="error-outline" size={36} color="#94a3b8" />
        <Text style={styles.emptyTitle}>Event not available</Text>
      </InterCampusScreen>
    );
  }

  const isTeam = event.participation_type === 'team';
  const isRejected = event.verification_status === 'rejected';

  return (
    <InterCampusScreen>
      <ScrollView style={styles.scroll}>
        {/* ─── Banner ─── */}
        <View style={styles.bannerWrap}>
          {event.poster_image || event.banner_image ? (
            <Image source={{ uri: event.poster_image || event.banner_image || '' }} style={styles.banner} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <MaterialIcons name={event.is_fest ? 'celebration' : 'public'} size={42} color="#6366F1" />
              <Text style={styles.bannerPlaceholderText}>{event.is_fest ? 'College Fest' : 'InterCampus Event'}</Text>
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bannerGradient} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>{event.title}</Text>
          </View>
        </View>

        {/* ─── Faculty Approval Banner (ONLY for faculty/admin) ─── */}
        {isFaculty && isPending && user?.id && (
          <View style={styles.approvalBanner}>
            <View style={styles.approvalBannerLeft}>
              <MaterialIcons name="pending-actions" size={20} color="#d97706" />
              <View>
                <Text style={styles.approvalBannerTitle}>Pending Your Review</Text>
                <Text style={styles.approvalBannerSub}>Add notes (optional) then approve or reject.</Text>
              </View>
            </View>

            {/* Faculty notes input */}
            <TextInput
              style={styles.facultyNotesInput}
              value={facultyNotes}
              onChangeText={setFacultyNotes}
              placeholder="Add faculty notes before deciding…"
              placeholderTextColor="#b45309"
              multiline
            />

            <View style={styles.approvalBannerBtns}>
              <TouchableOpacity
                style={[styles.approvalBannerApprove, approvalLoading === 'approve' && { opacity: 0.6 }]}
                onPress={handleApprove}
                disabled={!!approvalLoading}
              >
                {approvalLoading === 'approve'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><MaterialIcons name="check" size={14} color="#fff" /><Text style={styles.approvalBannerApproveText}>Approve</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approvalBannerReject, approvalLoading === 'reject' && { opacity: 0.6 }]}
                onPress={handleReject}
                disabled={!!approvalLoading}
              >
                {approvalLoading === 'reject'
                  ? <ActivityIndicator size="small" color="#b91c1c" />
                  : <><MaterialIcons name="close" size={14} color="#b91c1c" /><Text style={styles.approvalBannerRejectText}>Reject</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Rejected banner for faculty ONLY */}
        {isFaculty && isRejected && user?.id && (
          <View style={[styles.approvalBanner, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
            <MaterialIcons name="cancel" size={20} color="#ef4444" />
            <Text style={[styles.approvalBannerTitle, { color: '#b91c1c', marginLeft: 8 }]}>This event was rejected</Text>
          </View>
        )}

        {/* ── Edit / Delete actions (FACULTY/ADMIN ONLY - not for regular users) ── */}
        {isFaculty && user?.id && (
          <View style={styles.adminActionsRow}>
            <TouchableOpacity
              style={styles.adminEditBtn}
              onPress={handleEdit}
            >
              <MaterialIcons name="edit" size={15} color="#6366F1" />
              <Text style={styles.adminEditBtnText}>Edit Event</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adminDeleteBtn, deleting && { opacity: 0.6 }]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#b91c1c" />
                : <><MaterialIcons name="delete" size={15} color="#b91c1c" /><Text style={styles.adminDeleteBtnText}>Delete</Text></>}
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Pending Verification Notice (for regular users viewing pending events) ─── */}
        {!isFaculty && isUnapproved && (
          <View style={styles.verificationNoticeBox}>
            <MaterialIcons
              name={event.verification_status === 'rejected' ? 'cancel' : 'hourglass-empty'}
              size={20}
              color={event.verification_status === 'rejected' ? '#b91c1c' : '#d97706'}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.verificationNoticeTitle, { color: event.verification_status === 'rejected' ? '#b91c1c' : '#d97706' }]}>
                {event.verification_status === 'rejected' ? 'Verification Rejected' : 'Pending Verification'}
              </Text>
              <Text style={[styles.verificationNoticeSubtitle, { color: event.verification_status === 'rejected' ? '#92400e' : '#92400e' }]}>
                {event.verification_status === 'rejected'
                  ? 'This event was not approved by faculty.'
                  : 'This event is under review by faculty and will be approved shortly.'}
              </Text>
              {event.faculty_notes && (
                <Text style={styles.verificationNoteFacultyNotes}>
                  Faculty Notes: {event.faculty_notes}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ─── Info Section ─── */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
              <MaterialIcons name="school" size={18} color="#6B7280" />
            <Text style={styles.infoText}>{event.college_name}</Text>
          </View>
          {!!event.college_location && (
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={18} color="#6B7280" />
              <Text style={styles.infoText}>{event.college_location}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <MaterialIcons name="calendar-month" size={18} color="#6B7280" />
            <Text style={styles.infoText}>
              {formatDate(event.event_start_date) || 'Date TBA'}
              {!!event.event_end_date && ` – ${formatDate(event.event_end_date)}`}
            </Text>
          </View>
          {!!event.venue && (
            <View style={styles.infoRow}>
              <MaterialIcons name="place" size={18} color="#6B7280" />
              <Text style={styles.infoText}>
                {event.venue.trim() || (event.is_online ? 'Online' : 'Venue TBA')}
              </Text>
            </View>
          )}
          {!!event.fest_name && (
            <View style={styles.infoRow}>
              <MaterialIcons name="celebration" size={18} color="#6B7280" />
              <Text style={styles.infoText}>Part of {event.fest_name}</Text>
            </View>
          )}

          {/* Status badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, isTeam ? styles.badgeTeam : styles.badgeIndividual]}>
              <MaterialIcons name={isTeam ? 'groups' : 'person'} size={14} color="#0f172a" />
              <Text style={styles.badgeText}>{isTeam ? 'Team Event' : 'Individual'}</Text>
            </View>

            {event.verification_status === 'verified' ? (
              <View style={styles.badgeVerified}>
                <MaterialIcons name="verified" size={14} color="#10B981" />
                <Text style={styles.badgeVerifiedText}>Verified</Text>
              </View>
            ) : event.verification_status === 'rejected' ? (
              <View style={styles.badgeRejected}>
                <MaterialIcons name="cancel" size={14} color="#b91c1c" />
                <Text style={styles.badgeRejectedText}>Rejected</Text>
              </View>
            ) : (
              <View style={styles.badgePending}>
                <MaterialIcons name="hourglass-top" size={14} color="#d97706" />
                <Text style={styles.badgePendingText}>Pending Review</Text>
              </View>
            )}

            {event.verification_status === 'verified' && (
              <View style={styles.badgeInterested}>
                <MaterialIcons name="favorite" size={14} color="#6366F1" />
                <Text style={styles.badgeInterestedText}>{event.interested_count || 0} interested</Text>
              </View>
            )}
          </View>
        </View>

        {/* ─── Content ─── */}
        <View style={styles.contentPad}>
          {!!event.description && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>About</Text>
              <Text style={styles.bodyText}>{event.description}</Text>
            </View>
          )}

          {/* Details Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Details</Text>
            {!!event.event_type && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Event Type</Text>
                <Text style={styles.detailValue}>{event.event_type}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Mode</Text>
              <Text style={styles.detailValue}>{event.is_online ? 'Online' : 'Offline'}</Text>
            </View>
            {isTeam && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Team Size</Text>
                <Text style={styles.detailValue}>
                  {event.min_team_size || '-'} to {event.max_team_size || '-'}
                </Text>
              </View>
            )}
            {!!event.eligibility_text && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Eligibility</Text>
                <Text style={styles.detailValue}>{event.eligibility_text}</Text>
              </View>
            )}
            {!!event.registration_deadline && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Deadline</Text>
                <Text style={styles.detailValue}>{formatDate(event.registration_deadline)}</Text>
              </View>
            )}
            {!!event.source_url && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Event Website</Text>
                <Text style={styles.detailValue}>{event.source_url}</Text>
              </View>
            )}
            {!!event.faculty_notes && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Faculty Notes</Text>
                <Text style={styles.detailValue}>{event.faculty_notes}</Text>
              </View>
            )}
          </View>

          {/* ─── Action Buttons ─── */}

          {/* Registration link */}
          {!!event.registration_link && (
            <TouchableOpacity style={styles.primaryBtn} onPress={openRegistration}>
              <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
              <Text style={styles.primaryBtnText}>Official Registration</Text>
            </TouchableOpacity>
          )}

          {/* Event source URL (event website) */}
          {!!event.source_url && (
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: '#6366F1' }]} onPress={openSourceUrl}>
              <MaterialIcons name="link" size={18} color="#6366F1" />
              <Text style={[styles.outlineBtnText, { color: '#6366F1' }]} numberOfLines={1}>Event Website</Text>
            </TouchableOpacity>
          )}

          {/* College website */}
          {!!event.college_website && (
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: '#3b82f6' }]} onPress={openWebsite}>
              <MaterialIcons name="language" size={18} color="#3b82f6" />
              <Text style={[styles.outlineBtnText, { color: '#3b82f6' }]}>College Website</Text>
            </TouchableOpacity>
          )}

          {/* Regular student actions — only shown for verified events */}
          {event.verification_status === 'verified' && (
            <>
              <TouchableOpacity
                style={[styles.outlineBtn, event.is_interested && styles.outlineBtnActive]}
                disabled={processingInterest}
                onPress={handleToggleInterested}
              >
                <MaterialIcons
                  name={event.is_interested ? 'favorite' : 'favorite-border'}
                  size={18}
                  color={event.is_interested ? '#ffffff' : '#6366F1'}
                />
                <Text style={[styles.outlineBtnText, event.is_interested && styles.outlineBtnTextActive]}>
                  {event.is_interested ? 'Interested ✓' : 'Mark Interested'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => navigation.navigate('InterCampusDiscussion', { eventId: event.id })}
              >
                <MaterialIcons name="forum" size={18} color="#6366F1" />
                <Text style={styles.outlineBtnText}>Discussion</Text>
              </TouchableOpacity>

              {isTeam && (
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => navigation.navigate('InterCampusTeamUp', { eventId: event.id })}
                >
                  <MaterialIcons name="groups" size={18} color="#6366F1" />
                  <Text style={styles.outlineBtnText}>Team Up</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </InterCampusScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  scroll: { flex: 1 },

  /* ─── Banner ─── */
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e2e8f0' },
  bannerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerPlaceholderText: { fontSize: 13, color: '#334155', fontWeight: '700' },
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

  /* ─── Faculty approval banner ─── */
  approvalBanner: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    padding: 14,
    gap: 10,
  },
  approvalBannerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  approvalBannerTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  approvalBannerSub: { fontSize: 11, color: '#b45309', marginTop: 2 },
  approvalBannerBtns: { flexDirection: 'row', gap: 8 },
  approvalBannerApprove: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10,
  },
  approvalBannerApproveText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  approvalBannerReject: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, backgroundColor: '#fee2e2', borderRadius: 10, paddingVertical: 10,
  },
  approvalBannerRejectText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },
  facultyNotesInput: {
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#92400e',
    backgroundColor: '#fef9c3',
    minHeight: 54,
    textAlignVertical: 'top',
  },

  /* ─── Info Section ─── */
  infoSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '500' },

  /* Badges */
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeTeam: { backgroundColor: '#fee2e2' },
  badgeIndividual: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  badgeVerified: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#dcfce7',
  },
  badgeVerifiedText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  badgePending: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fef3c7',
  },
  badgePendingText: { fontSize: 12, fontWeight: '700', color: '#d97706' },
  badgeRejected: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fee2e2',
  },
  badgeRejectedText: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  badgeInterested: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(99,102,241,0.1)',
  },
  badgeInterestedText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },

  /* ─── Content ─── */
  contentPad: { padding: 16, gap: 12, paddingBottom: 90 },
  card: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  bodyText: { fontSize: 14, color: '#334155', lineHeight: 21 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  detailValue: { fontSize: 13, color: '#0f172a', fontWeight: '500', textAlign: 'right', flex: 1 },

  /* Faculty actions card */
  facultyActionsCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 14,
    gap: 10,
  },
  facultyActionsTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  facultyActionsRow: { flexDirection: 'row', gap: 10 },
  facultyApproveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, backgroundColor: '#10B981', paddingVertical: 12,
  },
  facultyApproveBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  facultyRejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, backgroundColor: '#fee2e2', paddingVertical: 12,
  },
  facultyRejectBtnText: { color: '#b91c1c', fontWeight: '800', fontSize: 14 },

  /* ─── Buttons ─── */
  primaryBtn: {
    borderRadius: 12,
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  outlineBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    backgroundColor: 'rgba(99,102,241,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  outlineBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  outlineBtnText: { color: '#6366F1', fontWeight: '800', fontSize: 14 },
  outlineBtnTextActive: { color: '#ffffff' },

  /* Admin edit/delete actions */
  adminActionsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  adminEditBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, backgroundColor: '#f5f3ff',
    paddingVertical: 10, borderWidth: 1, borderColor: '#ddd6fe',
  },
  adminEditBtnText: { color: '#6366F1', fontWeight: '700', fontSize: 13 },
  adminDeleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, backgroundColor: '#fef2f2',
    paddingVertical: 10, borderWidth: 1, borderColor: '#fca5a5',
  },
  adminDeleteBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },

  /* ─── Verification Notice (for regular users) ─── */
  verificationNoticeBox: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 245, 235, 0.95)',
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  verificationNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  verificationNoticeSubtitle: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
    lineHeight: 17,
  },
  verificationNoteFacultyNotes: {
    fontSize: 11,
    color: '#b45309',
    fontWeight: '500',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
