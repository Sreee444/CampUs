import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { useInterCampusEvents } from '../hooks/useInterCampusEvents';
import InterCampusEventCard from '../components/InterCampusEventCard';
import InterCampusState from '../components/InterCampusState';
import { getInterCampusMyCollaborations, getMyInterCampusSubmissions } from '../api/intercampus';
import { InterCampusEventSubmission } from '../types/intercampus';

type Nav = StackNavigationProp<RootStackParamList>;
type TabKey = 'all' | 'submissions' | 'team' | 'mine';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All Events' },
  { key: 'submissions', label: 'My Submissions' },
  { key: 'team', label: 'Team-Up' },
  { key: 'mine', label: 'My Collaborations' },
];

export default function InterCampusHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const { events, loading, error, reload } = useInterCampusEvents(user?.id);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [myData, setMyData] = useState<{ my_posts: any[]; my_replies: any[] } | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);
  const [submissions, setSubmissions] = useState<InterCampusEventSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const canCreateDirect = profile?.role === 'faculty' || profile?.role === 'admin';

  const teamEvents = useMemo(
    () => events.filter((item) => item.participation_type === 'team'),
    [events],
  );

  const loadMine = async () => {
    if (!user?.id) return;
    setLoadingMine(true);
    try {
      const data = await getInterCampusMyCollaborations(user.id);
      setMyData(data);
    } catch {
      setMyData({ my_posts: [], my_replies: [] });
    } finally {
      setLoadingMine(false);
    }
  };

  const loadSubmissions = async () => {
    if (!user?.id) return;
    setLoadingSubmissions(true);
    try {
      const data = await getMyInterCampusSubmissions(user.id);
      setSubmissions(data);
    } catch {
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const onTabPress = async (key: TabKey) => {
    setActiveTab(key);
    if (key === 'mine' && !myData) {
      await loadMine();
    }
    if (key === 'submissions' && submissions.length === 0) {
      await loadSubmissions();
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerGradient}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.title}>InterCampus</Text>
            <Text style={styles.subtitle}>Verified external college events</Text>
          </View>
          <View style={styles.headerActions}>
            {(profile?.role === 'faculty' || profile?.role === 'admin') && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => navigation.navigate('FacultyInterCampusDashboard')}
              >
                <MaterialIcons name="fact-check" size={18} color="#0f172a" />
              </TouchableOpacity>
            )}
            {profile?.role === 'admin' && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => navigation.navigate('AdminInterCampusManagement')}
              >
                <MaterialIcons name="admin-panel-settings" size={18} color="#0f172a" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabPress(tab.key)}
              style={[styles.tabPill, activeTab === tab.key && styles.tabPillActive]}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor="#0f766e" />}
        contentContainerStyle={styles.scrollContent}
      >
        {!!error && (
          <InterCampusState title="Could not load InterCampus events" subtitle={error} />
        )}

        {loading && !events.length ? (
          <InterCampusState loading title="Loading InterCampus" subtitle="Fetching verified events..." />
        ) : null}

        {!loading && !error && activeTab === 'all' && (
          <>
            {events.length === 0 ? (
              <InterCampusState title="No verified events yet" subtitle="Faculty verification is in progress." />
            ) : (
              events.map((event) => (
                <InterCampusEventCard
                  key={event.id}
                  event={event}
                  onPress={() => navigation.navigate('InterCampusEventDetails', { eventId: event.id })}
                />
              ))
            )}
          </>
        )}

        {!loading && !error && activeTab === 'submissions' && (
          <>
            {loadingSubmissions ? (
              <InterCampusState loading title="Loading submissions" />
            ) : submissions.length === 0 ? (
              <InterCampusState
                title="You have not submitted any events yet."
                subtitle="Submit your first external event for faculty verification."
              />
            ) : (
              submissions.slice(0, 4).map((item) => (
                <View key={item.id} style={styles.submissionCard}>
                  <View style={styles.submissionHeader}>
                    <Text style={styles.submissionTitle}>{item.event_title || 'Untitled Event'}</Text>
                    <View style={[
                      styles.submissionBadge,
                      item.status === 'approved'
                        ? styles.badgeApproved
                        : item.status === 'rejected'
                          ? styles.badgeRejected
                          : styles.badgePending,
                    ]}>
                      <Text style={styles.submissionBadgeText}>
                        {item.status === 'approved' ? 'Approved' : item.status === 'rejected' ? 'Rejected' : 'Pending Review'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.submissionMeta}>{item.college_name || 'Unknown college'}</Text>
                  <Text style={styles.submissionMeta}>
                    Submitted: {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.openSubmissionsBtn} onPress={() => navigation.navigate('MySubmittedEvents')}>
              <Text style={styles.openSubmissionsText}>Open My Submissions</Text>
            </TouchableOpacity>
          </>
        )}

        {!loading && !error && activeTab === 'team' && (
          <>
            {teamEvents.length === 0 ? (
              <InterCampusState title="No team events" subtitle="Team-up appears only for events with team participation." />
            ) : (
              teamEvents.map((event) => (
                <InterCampusEventCard
                  key={event.id}
                  event={event}
                  onPress={() => navigation.navigate('InterCampusTeamUp', { eventId: event.id })}
                />
              ))
            )}
          </>
        )}

        {!loading && activeTab === 'mine' && (
          <>
            {loadingMine ? (
              <InterCampusState loading title="Loading collaborations" />
            ) : (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>My Team Posts</Text>
                <Text style={styles.sectionValue}>{myData?.my_posts?.length || 0}</Text>
                <Text style={styles.sectionTitle}>My Replies</Text>
                <Text style={styles.sectionValue}>{myData?.my_replies?.length || 0}</Text>
                <TouchableOpacity style={styles.reloadBtn} onPress={loadMine}>
                  <MaterialIcons name="refresh" size={16} color="#ffffff" />
                  <Text style={styles.reloadText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('InterCampusSubmitEvent')}
        activeOpacity={0.88}
      >
        <MaterialIcons name="add" size={22} color="#ffffff" />
        <Text style={styles.fabText}>Submit Event</Text>
      </TouchableOpacity>

      {canCreateDirect && (
        <TouchableOpacity
          style={styles.facultyFab}
          onPress={() => navigation.navigate('CreateInterCampusEvent')}
          activeOpacity={0.9}
        >
          <MaterialIcons name="add-circle-outline" size={21} color="#ffffff" />
          <Text style={styles.fabText}>Create Event</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#eefcf8',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#475569',
  },
  tabRow: {
    gap: 8,
  },
  tabPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  tabPillActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    borderRadius: 999,
    backgroundColor: '#0f766e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  facultyFab: {
    position: 'absolute',
    left: 16,
    bottom: 24,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  sectionValue: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  reloadBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#0f766e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reloadText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  submissionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 12,
    marginBottom: 10,
  },
  submissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  submissionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  submissionMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  submissionBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgePending: { backgroundColor: '#ffedd5' },
  badgeApproved: { backgroundColor: '#dcfce7' },
  badgeRejected: { backgroundColor: '#fee2e2' },
  submissionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  openSubmissionsBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
    paddingVertical: 10,
    alignItems: 'center',
  },
  openSubmissionsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
  },
});
