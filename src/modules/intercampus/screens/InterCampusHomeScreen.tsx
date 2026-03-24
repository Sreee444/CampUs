import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isAdminRole, isFacultyOrAdminRole } from '../../../utils/roles';
import { getVerifiedFestsPaginated, getVerifiedStandaloneEventsPaginated } from '../api/intercampus';
import { InterCampusEvent } from '../types/intercampus';
import InterCampusFestCard from '../components/InterCampusFestCard';
import InterCampusEventCard from '../components/InterCampusEventCard';
import InterCampusScreen from '../components/InterCampusScreen';

type Nav = StackNavigationProp<RootStackParamList>;
type TabKey = 'fests' | 'events';

/* ─── Skeleton ─── */
function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonBanner} />
      <View style={styles.skeletonLineLg} />
      <View style={styles.skeletonLineMd} />
      <View style={styles.skeletonLineSm} />
    </View>
  );
}

export default function InterCampusHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { profile } = useAuth();
  const canModerate = isFacultyOrAdminRole(profile?.role);

  const [activeTab, setActiveTab] = useState<TabKey>('fests');
  const [fests, setFests] = useState<InterCampusEvent[]>([]);
  const [events, setEvents] = useState<InterCampusEvent[]>([]);
  const [festPage, setFestPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [festHasMore, setFestHasMore] = useState(true);
  const [eventHasMore, setEventHasMore] = useState(true);
  const [loadingFests, setLoadingFests] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ─── Loaders ─── */
  const loadFests = useCallback(async (page = 1, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoadingFests(true);
      setError(null);
      const result = await getVerifiedFestsPaginated({ page, pageSize: 10 });
      setFests((prev) => (append ? [...prev, ...result.data] : result.data));
      setFestPage(page);
      setFestHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message || 'Failed to load fests');
    } finally {
      setLoadingFests(false);
      setLoadingMore(false);
    }
  }, []);

  const loadEvents = useCallback(async (page = 1, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoadingEvents(true);
      setError(null);
      const result = await getVerifiedStandaloneEventsPaginated({ page, pageSize: 10 });
      setEvents((prev) => (append ? [...prev, ...result.data] : result.data));
      setEventPage(page);
      setEventHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message || 'Failed to load events');
    } finally {
      setLoadingEvents(false);
      setLoadingMore(false);
    }
  }, []);

  const reload = useCallback(() => {
    loadFests(1, false);
    loadEvents(1, false);
  }, [loadFests, loadEvents]);

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    if (activeTab === 'fests' && festHasMore) {
      loadFests(festPage + 1, true);
      return;
    }
    if (activeTab === 'events' && eventHasMore) {
      loadEvents(eventPage + 1, true);
    }
  }, [activeTab, eventHasMore, eventPage, festHasMore, festPage, loadEvents, loadFests, loadingMore]);

  useFocusEffect(
    React.useCallback(() => {
      reload();
    }, [reload]),
  );

  const loading = activeTab === 'fests' ? loadingFests : loadingEvents;
  const data = activeTab === 'fests' ? fests : events;

  /* ─── Render Helpers ─── */
  const renderFestItem = ({ item }: { item: InterCampusEvent }) => (
    <InterCampusFestCard
      fest={item}
      onPress={() => navigation.navigate('InterCampusFestDetails', { festId: item.id })}
    />
  );

  const renderEventItem = ({ item }: { item: InterCampusEvent }) => (
    <InterCampusEventCard
      event={item}
      showSubmitter={canModerate}
      onPress={() => navigation.navigate('InterCampusEventDetails', { eventId: item.id })}
    />
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <MaterialIcons
          name={activeTab === 'fests' ? 'festival' : 'event'}
          size={42}
          color="#94a3b8"
        />
        <Text style={styles.emptyTitle}>
          {activeTab === 'fests' ? 'No verified fests yet' : 'No verified events yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {activeTab === 'fests'
            ? 'Verified fests from other colleges will appear here.'
            : 'Standalone events from other colleges will appear here.'}
        </Text>
      </View>
    );
  };

  const renderSkeleton = () => (
    <FlatList
      data={[1, 2, 3]}
      keyExtractor={(item) => String(item)}
      renderItem={() => <SkeletonCard />}
      contentContainerStyle={styles.listContent}
    />
  );

  return (
    <InterCampusScreen>
      {/* ─── Header ─── */}
      <View style={styles.headerGradient}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.title}>InterCampus</Text>
            <Text style={styles.subtitle}>Discover events across colleges</Text>
          </View>
          <View style={styles.headerActions}>
            {canModerate && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => navigation.navigate('FacultyInterCampusDashboard')}
              >
                <MaterialIcons name="fact-check" size={18} color="#0f172a" />
              </TouchableOpacity>
            )}
            {isAdminRole(profile?.role) && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => navigation.navigate('AdminInterCampusManagement')}
              >
                <MaterialIcons name="admin-panel-settings" size={18} color="#0f172a" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ─── Segmented Tabs ─── */}
        <View style={styles.segmentWrap}>
          {(['fests', 'events'] as TabKey[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.segmentBtn, activeTab === tab && styles.segmentBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <MaterialIcons
                name={tab === 'fests' ? 'celebration' : 'event'}
                size={16}
                color={activeTab === tab ? '#ffffff' : '#6B7280'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.segmentText, activeTab === tab && styles.segmentTextActive]}>
                {tab === 'fests' ? 'Fests' : 'Events'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Error Banner ─── */}
      {!!error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={16} color="#b91c1c" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ─── Content ─── */}
      {loading && !data.length ? (
        renderSkeleton()
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'fests' ? renderFestItem : renderEventItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="#6366F1" style={{ marginTop: 8 }} /> : null
          }
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor="#6366F1" />
          }
        />
      )}

      {/* ─── FABs ─── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('InterCampusSubmitEvent')}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={['#8B5CF6', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <MaterialIcons name={canModerate ? 'add-circle-outline' : 'add'} size={22} color="#ffffff" />
          <Text style={styles.fabText}>Submit Event</Text>
        </LinearGradient>
      </TouchableOpacity>
    </InterCampusScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerGradient: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    color: '#111827',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },

  /* ─── Segmented Tabs ─── */
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#ffffff',
  },

  /* ─── Error ─── */
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#b91c1c',
  },

  /* ─── List ─── */
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 90,
  },

  /* ─── Empty ─── */
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  /* ─── Skeleton ─── */
  skeletonCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 14,
  },
  skeletonBanner: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
  },
  skeletonLineLg: {
    height: 14,
    width: '70%',
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
  },
  skeletonLineMd: {
    height: 12,
    width: '55%',
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
  },
  skeletonLineSm: {
    height: 12,
    width: '40%',
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },

  /* ─── FABs ─── */
  fab: {
    position: 'absolute',
    left: 16,
    bottom: 26,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  fabGradient: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fabText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
