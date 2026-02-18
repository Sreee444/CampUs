import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, Spacing, FontSizes, FontWeights, Shadows, BorderRadius } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvents, registerForEvent } from '../../api/events';
import { getUserStats } from '../../api/users';
import { getProfile } from '../../api/auth';
import { supabase } from '../../api/supabase';
import { EventFeedItem } from '../../components/EventFeedItem';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { getNotifications } from '../../api/notifications';
import { getPendingReceivedRequests } from '../../api/connections';

export default function FeedScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ projects: 0, events: 0, connections: 0 });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  const loadFeedData = async (refresh = false) => {
    if (user?.id) {
      try {
        const prof = await getProfile(user.id);
        setProfile(prof);
      } catch (err) {
        setProfile(null);
      }
    }
    try {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);

      const eventsData = await getEvents(user?.id, undefined, true);
      const liveEvents = eventsData.filter(event => {
        const now = new Date();
        const eventStart = new Date(event.start_date);
        const eventEnd = new Date(event.end_date);
        return eventStart <= now && eventEnd >= now;
      });
      const feedEvents = [...liveEvents, ...eventsData.filter(e =>
        !liveEvents.find(le => le.id === e.id)
      )].slice(0, 5);
      setEvents(feedEvents);
      setUpcomingEvents(eventsData.slice(0, 3));

      if (user?.id) {
        try {
          const { count: projectsCount } = await supabase
            .from('project_teams')
            .select('id', { count: 'exact', head: true })
            .eq('is_recruiting', true);

          const now = new Date().toISOString();
          const { count: eventsCount } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .gte('start_date', now);

          const { count: connectionsCount } = await supabase
            .from('connections')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'accepted');

          setStats({
            projects: projectsCount || 0,
            events: eventsCount || 0,
            connections: connectionsCount || 0,
          });

          const [notifications, requests] = await Promise.all([
            getNotifications(user.id),
            getPendingReceivedRequests(),
          ]);
          const unreadCount = notifications.filter((n: any) => !n.is_read).length;
          const requestCount = requests.length;
          setNotificationCount(unreadCount + requestCount);
        } catch (err) {
          console.error('Stats load error:', err);
          setStats({ projects: 0, events: 0, connections: 0 });
          setNotificationCount(0);
        }
      }

      setRecentProjects([]);
      setAiSuggestion('Check out the latest events and join a project team!');
    } catch (error) {
      console.error('Feed load error:', error);
      Toast.show({ type: 'error', text1: 'Failed to load feed', text2: 'Please try again' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadFeedData();
  }, [user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      const loadNotificationCount = async () => {
        if (!user?.id) return;
        try {
          const [notifications, requests] = await Promise.all([
            getNotifications(user.id),
            getPendingReceivedRequests(),
          ]);
          const unreadCount = notifications.filter((n: any) => !n.is_read).length;
          const requestCount = requests.length;
          setNotificationCount(unreadCount + requestCount);
        } catch (err) {
          console.error('Notification count error:', err);
        }
      };
      loadNotificationCount();
    }, [user?.id])
  );

  const handleEventRegistration = async (eventId: string) => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Please login to register' });
      return;
    }
    try {
      await registerForEvent(eventId, user.id);
      Toast.show({ type: 'success', text1: 'Registered successfully!' });
      loadFeedData(true);
    } catch (error) {
      console.error('Registration error:', error);
      Toast.show({ type: 'error', text1: 'Registration failed', text2: 'Please try again' });
    }
  };

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Student';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#e0f7fa', '#fdfbf7', '#f3e5f5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning 👋</Text>
            <Text style={styles.userName}>{firstName}</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigation.navigate('Notifications' as any)}
          >
            <MaterialIcons name="notifications-none" size={24} color="#111818" />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadFeedData(true)}
            tintColor="#13ecec"
          />
        }
      >
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <LinearGradient colors={['#e0f7fa', '#ccfbfb']} style={styles.statCard}>
            <MaterialIcons name="folder-open" size={22} color="#0d9488" />
            <Text style={styles.statNumber}>{stats.projects}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </LinearGradient>
          <LinearGradient colors={['#f3e5f5', '#ecdcf7']} style={styles.statCard}>
            <MaterialIcons name="event" size={22} color="#9333ea" />
            <Text style={styles.statNumber}>{stats.events}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </LinearGradient>
          <LinearGradient colors={['#fff5e6', '#ffe0cc']} style={styles.statCard}>
            <MaterialIcons name="people-outline" size={22} color="#ea580c" />
            <Text style={styles.statNumber}>{stats.connections}</Text>
            <Text style={styles.statLabel}>Connects</Text>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Discussions' as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#e0f7fa' }]}>
                <MaterialIcons name="forum" size={24} color="#0d9488" />
              </View>
              <Text style={styles.actionLabel}>Discussions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('AllUsers' as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#f3e5f5' }]}>
                <MaterialIcons name="people" size={24} color="#9333ea" />
              </View>
              <Text style={styles.actionLabel}>Connect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateEvent' as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#fff5e6' }]}>
                <MaterialIcons name="add-circle-outline" size={24} color="#ea580c" />
              </View>
              <Text style={styles.actionLabel}>New Event</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateProject' as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#e0fbfb' }]}>
                <MaterialIcons name="work-outline" size={24} color="#0891b2" />
              </View>
              <Text style={styles.actionLabel}>New Project</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Suggestion */}
        <View style={styles.section}>
          <LinearGradient
            colors={['rgba(19,236,236,0.08)', 'rgba(19,236,236,0.03)']}
            style={styles.aiSuggestion}
          >
            <MaterialIcons name="auto-awesome" size={20} color="#0d9488" />
            <View style={styles.aiContent}>
              <Text style={styles.aiTitle}>AI Suggestion</Text>
              <Text style={styles.aiText}>{aiSuggestion}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Upcoming Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Events' as any)}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#13ecec" style={{ marginVertical: 16 }} />
          ) : upcomingEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event-busy" size={32} color="#cbd5e1" />
              <Text style={styles.emptyText}>No upcoming events</Text>
            </View>
          ) : upcomingEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => navigation.navigate('EventDetails' as any, { eventId: event.id })}
            >
              <View style={styles.eventDateBadge}>
                <Text style={styles.eventDateDay}>
                  {new Date(event.start_date).getDate()}
                </Text>
                <Text style={styles.eventDateMonth}>
                  {new Date(event.start_date).toLocaleString('default', { month: 'short' })}
                </Text>
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                <View style={styles.eventMeta}>
                  <MaterialIcons name="access-time" size={13} color="#94a3b8" />
                  <Text style={styles.eventMetaText}>
                    {new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {event.location && (
                    <>
                      <MaterialIcons name="place" size={13} color="#94a3b8" />
                      <Text style={styles.eventMetaText} numberOfLines={1}>{event.location}</Text>
                    </>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  headerGradient: {
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  greeting: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111818',
    marginTop: 2,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111818',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111818',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  aiSuggestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(19,236,236,0.2)',
    borderRadius: 16,
    padding: 14,
  },
  aiContent: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0d9488',
    marginBottom: 4,
  },
  aiText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  seeAllText: {
    fontSize: 13,
    color: '#13ecec',
    fontWeight: '600',
    marginBottom: 12,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  eventDateBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(19,236,236,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateDay: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0d9488',
    lineHeight: 18,
  },
  eventDateMonth: {
    fontSize: 10,
    fontWeight: '500',
    color: '#0d9488',
    textTransform: 'uppercase',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111818',
    marginBottom: 4,
    overflow: 'hidden',
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  eventMetaText: {
    fontSize: 12,
    color: '#94a3b8',
  },
});
