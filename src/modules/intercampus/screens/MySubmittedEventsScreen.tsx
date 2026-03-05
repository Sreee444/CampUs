import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getMyInterCampusSubmissions,
  resolveApprovedEventForSubmission,
} from '../api/intercampus';
import { InterCampusEventSubmission } from '../types/intercampus';

type Nav = StackNavigationProp<RootStackParamList, 'MySubmittedEvents'>;

const formatDisplayDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending Review', bg: '#ffedd5', text: '#c2410c' },
  approved: { label: 'Approved', bg: '#dcfce7', text: '#047857' },
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
  const { user } = useAuth();
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
    <SafeAreaView style={styles.container}>
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
            <TouchableOpacity style={styles.submitBtn} onPress={() => navigation.navigate('InterCampusSubmitEvent')}>
              <Text style={styles.submitBtnText}>Submit Event</Text>
            </TouchableOpacity>
          </View>
        ) : (
          submissions.map((item) => {
            const config = statusConfig[item.status] || statusConfig.pending;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.eventTitle}>{item.event_title || 'Untitled Event'}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                    <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
                  </View>
                </View>

                <Text style={styles.metaText}>College: {item.college_name || 'Unknown'}</Text>
                {!!item.fest_name && <Text style={styles.metaText}>Fest: {item.fest_name}</Text>}
                <Text style={styles.metaText}>Event Start: {formatDisplayDate(item.event_start_date)}</Text>
                <Text style={styles.metaText}>Submitted: {formatDisplayDate(item.created_at)}</Text>

                {item.status === 'approved' && (
                  <TouchableOpacity style={styles.viewBtn} onPress={() => handleViewEvent(item)}>
                    <Text style={styles.viewBtnText}>View Event</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'rejected' && (
                  <View style={styles.rejectedBox}>
                    <Text style={styles.rejectedText}>This submission was not approved by faculty.</Text>
                    {!!(item as any).faculty_notes && (
                      <Text style={styles.rejectedNotes}>Notes: {(item as any).faculty_notes}</Text>
                    )}
                  </View>
                )}
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
  content: { padding: 16, gap: 10, paddingBottom: 30 },
  summaryCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  summaryLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  summaryValue: { marginTop: 4, marginBottom: 10, fontSize: 20, color: '#0f172a', fontWeight: '800' },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  skeleton: { borderRadius: 8, backgroundColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eventTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaText: { marginTop: 4, fontSize: 12, color: '#64748b' },
  viewBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  rejectedBox: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    padding: 10,
  },
  rejectedText: { fontSize: 12, color: '#be123c', fontWeight: '600' },
  rejectedNotes: { marginTop: 4, fontSize: 12, color: '#9f1239' },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#0f766e',
  },
  submitBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
