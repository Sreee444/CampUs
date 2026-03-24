import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import {
  getMyInterCampusSubmissions,
  resolveApprovedEventForSubmission,
} from '../api/intercampus';
import { InterCampusEventSubmission } from '../types/intercampus';
import InterCampusScreen from '../components/InterCampusScreen';

type Nav = StackNavigationProp<RootStackParamList, 'MySubmittedEvents'>;

const formatDisplayDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending Review', bg: '#ffedd5', text: '#c2410c' },
  approved: { label: 'Approved', bg: 'rgba(16,185,129,0.14)', text: '#10B981' },
  rejected: { label: 'Rejected', bg: '#fee2e2', text: '#b91c1c' },
};

const SkeletonCard = () => (
  <View style={styles.card}>
    <View style={[styles.skeleton, { width: '65%', height: 16 }]} />
    <View style={[styles.skeleton, { width: '52%', height: 12, marginTop: 8 }]} />
    <View style={[styles.skeleton, { width: '42%', height: 12, marginTop: 6 }]} />
  </View>
);

export default function MySubmittedEventsScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const isStudent = !isFacultyOrAdminRole(profile?.role);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<InterCampusEventSubmission[]>([]);

  const loadSubmissions = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await getMyInterCampusSubmissions(user.id);
      setSubmissions(data);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load submissions', text2: error?.message || 'Please try again' });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      loadSubmissions();
    }, [loadSubmissions]),
  );

  const pendingCount = useMemo(
    () => submissions.filter((item) => item.status === 'pending').length,
    [submissions],
  );

  const handleViewEvent = async (submission: InterCampusEventSubmission) => {
    try {
      const eventId = await resolveApprovedEventForSubmission(submission);
      if (!eventId) {
        Toast.show({ type: 'info', text1: 'Approved event is not available yet' });
        return;
      }

      navigation.navigate('InterCampusEventDetails', { eventId });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to open event', text2: error?.message || 'Please try again' });
    }
  };

  return (
    <InterCampusScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Submissions</Text>
        <TouchableOpacity onPress={loadSubmissions}>
          <MaterialIcons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Submissions</Text>
          <Text style={styles.summaryValue}>{submissions.length}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
        </View>

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : submissions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>You have not submitted any events yet.</Text>
            {isStudent && (
              <TouchableOpacity style={styles.submitBtn} onPress={() => navigation.navigate('InterCampusSubmitEvent')}>
                <Text style={styles.submitBtnText}>Submit Event</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          submissions.map((item) => {
            const config = statusConfig[item.status] || statusConfig.pending;
            const nextStepText =
              item.status === 'pending'
                ? 'Awaiting faculty review. We\'ll notify you when it\'s approved.'
                : item.status === 'approved'
                  ? 'Your event has been approved! It\'s now visible to other colleges.'
                  : 'Please review the faculty notes and resubmit if needed.';

            return (
              <View key={item.id} style={styles.card}>
                {/* Event Image Banner */}
                {(item as any)?.poster_image || (item as any)?.banner_image ? (
                  <View style={styles.imageBanner}>
                    <Image
                      source={{ uri: (item as any)?.poster_image || (item as any)?.banner_image || '' }}
                      style={styles.bannerImage}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                    <View style={[styles.statusBadgeOverlay, { backgroundColor: config.bg }]}>
                      <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <MaterialIcons name="event" size={32} color="#6366F1" />
                  </View>
                )}

                <View style={styles.cardContent}>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {item.event_title || 'Untitled Event'}
                  </Text>

                  <View style={styles.detailsGrid}>
                    <View style={styles.detailRow}>
                      <MaterialIcons name="school" size={14} color="#64748b" />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {item.college_name || 'Unknown'}
                      </Text>
                    </View>

                    {!!item.fest_name && (
                      <View style={styles.detailRow}>
                        <MaterialIcons name="celebration" size={14} color="#64748b" />
                        <Text style={styles.detailText} numberOfLines={1}>
                          {item.fest_name}
                        </Text>
                      </View>
                    )}

                    <View style={styles.detailRow}>
                      <MaterialIcons name="calendar-today" size={14} color="#64748b" />
                      <Text style={styles.detailText}>{formatDisplayDate(item.event_start_date)}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <MaterialIcons name="upload" size={14} color="#64748b" />
                      <Text style={styles.detailText}>{formatDisplayDate(item.created_at)}</Text>
                    </View>
                  </View>

                  {/* Next Steps Info */}
                  <View style={styles.nextStepsBox}>
                    <View style={styles.nextStepsHeader}>
                      <MaterialIcons
                        name={
                          item.status === 'approved'
                            ? 'check-circle'
                            : item.status === 'rejected'
                              ? 'error'
                              : 'hourglass-empty'
                        }
                        size={16}
                        color={config.text}
                      />
                      <Text
                        style={[
                          styles.nextStepsLabel,
                          { color: item.status === 'pending' ? '#92400e' : config.text },
                        ]}
                      >
                        {item.status === 'pending' ? 'Under Review' : 'Status Update'}
                      </Text>
                    </View>
                    <Text style={[styles.nextStepsText, { color: item.status === 'pending' ? '#92400e' : config.text }]}>
                      {nextStepText}
                    </Text>
                  </View>

                  {item.status === 'approved' && (
                    <TouchableOpacity style={styles.viewBtn} onPress={() => handleViewEvent(item)}>
                      <MaterialIcons name="open-in-new" size={16} color="#ffffff" />
                      <Text style={styles.viewBtnText}>View Event</Text>
                    </TouchableOpacity>
                  )}

                  {item.status === 'rejected' && !!((item as any).faculty_notes) && (
                    <View style={styles.rejectedBox}>
                      <Text style={styles.rejectedLabel}>Faculty Feedback</Text>
                      <Text style={styles.rejectedNotes}>{(item as any).faculty_notes}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </InterCampusScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  content: { padding: 16, gap: 12, paddingBottom: 90 },
  summaryCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 16,
  },
  summaryLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  summaryValue: { marginTop: 4, marginBottom: 10, fontSize: 20, color: '#0f172a', fontWeight: '800' },
  card: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  skeleton: { borderRadius: 8, backgroundColor: '#e2e8f0' },

  /* Image banner */
  imageBanner: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#e2e8f0',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  /* Card content */
  cardContent: {
    padding: 16,
    gap: 12,
  },
  eventTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  /* Details grid */
  detailsGrid: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: { flex: 1, fontSize: 12, color: '#64748b', fontWeight: '500' },

  /* Status badge */
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },

  /* Next steps info */
  nextStepsBox: {
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    padding: 12,
    gap: 6,
  },
  nextStepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextStepsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  nextStepsText: {
    fontSize: 12,
    color: '#92400e',
    lineHeight: 18,
  },

  /* Buttons */
  viewBtn: {
    borderRadius: 12,
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  rejectedBox: {
    borderRadius: 10,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    padding: 12,
    gap: 6,
  },
  rejectedLabel: { fontSize: 12, color: '#be123c', fontWeight: '700' },
  rejectedText: { fontSize: 12, color: '#be123c', fontWeight: '600' },
  rejectedNotes: { marginTop: 4, fontSize: 12, color: '#9f1239', lineHeight: 16 },
  emptyCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#6366F1',
  },
  submitBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
