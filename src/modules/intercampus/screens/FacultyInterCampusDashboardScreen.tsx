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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import {
  approveInterCampusSubmission,
  getInterCampusPendingSubmissions,
  rejectInterCampusSubmission,
} from '../api/intercampus';
import { InterCampusEventSubmission } from '../types/intercampus';

type Nav = StackNavigationProp<RootStackParamList>;

export default function FacultyInterCampusDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<InterCampusEventSubmission[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [capById, setCapById] = useState<Record<string, string>>({});

  const canModerate = isFacultyOrAdminRole(profile?.role);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInterCampusPendingSubmissions();
      setSubmissions(data);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load submissions', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const approve = async (submissionId: string) => {
    if (!user?.id) return;

    try {
      const capRaw = capById[submissionId];
      const cap = capRaw?.trim() ? Number(capRaw.trim()) : undefined;

      await approveInterCampusSubmission(user.id, {
        submission_id: submissionId,
        faculty_notes: notesById[submissionId] || undefined,
        participation_cap: Number.isFinite(cap) ? cap : undefined,
      });

      setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
      Toast.show({ type: 'success', text1: 'Submission approved', text2: 'Converted to verified InterCampus event.' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Approval failed', text2: error?.message });
    }
  };

  const reject = async (submissionId: string) => {
    try {
      await rejectInterCampusSubmission(submissionId);
      setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
      Toast.show({ type: 'success', text1: 'Submission rejected' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Reject failed', text2: error?.message });
    }
  };

  if (!canModerate) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <Text style={styles.emptyTitle}>Faculty access required.</Text>
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
        <Text style={styles.headerTitle}>Faculty InterCampus Dashboard</Text>
        <TouchableOpacity onPress={loadData}>
          <MaterialIcons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {submissions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No pending submissions.</Text>
          </View>
        ) : (
          submissions.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.title}>{item.event_title || 'Untitled Event'}</Text>
              <Text style={styles.meta}>{item.college_name || 'Unknown college'}</Text>
              {!!item.fest_name && <Text style={styles.meta}>Fest: {item.fest_name}</Text>}
              {!!item.event_description && <Text style={styles.desc}>{item.event_description}</Text>}
              {!!item.registration_link && <Text style={styles.meta}>Registration: {item.registration_link}</Text>}

              <TextInput
                style={styles.input}
                value={notesById[item.id] || ''}
                onChangeText={(text) => setNotesById((prev) => ({ ...prev, [item.id]: text }))}
                placeholder="Faculty notes"
                placeholderTextColor="#94a3b8"
                multiline
              />

              <TextInput
                style={styles.input}
                value={capById[item.id] || ''}
                onChangeText={(text) => setCapById((prev) => ({ ...prev, [item.id]: text }))}
                placeholder="Participation cap (optional)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
              />

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => approve(item.id)}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(item.id)}>
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
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
  emptyCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  emptyText: { fontSize: 13, color: '#64748b' },
  card: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b' },
  desc: { fontSize: 12, color: '#334155', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginTop: 4,
  },
  actionsRow: { marginTop: 4, flexDirection: 'row', gap: 8 },
  approveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#047857',
    alignItems: 'center',
    paddingVertical: 10,
  },
  approveText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  rejectBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rejectText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },
});
