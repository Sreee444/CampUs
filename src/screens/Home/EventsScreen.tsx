import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvents, registerForEvent, unregisterFromEvent } from '../../api/events';
import { CountdownTimer, EventStatus } from '../../components/CountdownTimer';
import Toast from 'react-native-toast-message';

type EventsScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Events'>,
  StackNavigationProp<RootStackParamList>
>;

const categories = ['All', 'workshop', 'seminar', 'hackathon', 'competition', 'fest', 'other'];

export default function EventsScreen() {
  const navigation = useNavigation<EventsScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'live' | 'past'>('upcoming');

  // Check if user can create events
  // TEMP: Allow all authenticated users for debugging
  const canCreateEvent = profile && user?.id;

  // Log for debugging
  useEffect(() => {
    console.log('EventsScreen - User Role:', profile?.role);
    console.log('EventsScreen - Is Club Coordinator:', profile?.is_club_coordinator);
    console.log('EventsScreen - Is Volunteer:', profile?.is_volunteer);
    console.log('EventsScreen - Can Create Event:', canCreateEvent);
  }, [profile]);

  const loadEvents = async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);

      const data = await getEvents(user?.id, undefined, activeTab === 'upcoming');
      setEvents(data || []);
    } catch (error) {
      console.error('Events load error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load events',
        text2: 'Please try again'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [user?.id, activeTab]);

  const filteredEvents = events.filter((event) => {
    const now = new Date();
    const eventStart = new Date(event.start_date);
    const eventEnd = new Date(event.end_date);

    // Filter by tab
    if (activeTab === 'upcoming' && eventStart <= now) return false;
    if (activeTab === 'live' && (eventStart > now || eventEnd < now)) return false;
    if (activeTab === 'past' && eventEnd >= now) return false;

    // Filter by category
    return selectedCategory === 'All' || event.event_type === selectedCategory;
  });

  const handleRegister = async (event: any) => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Please login to register' });
      return;
    }

    try {
      if (event.is_registered) {
        await unregisterFromEvent(event.id, user.id);
        Toast.show({ type: 'success', text1: 'Unregistered successfully' });
      } else {
        await registerForEvent(event.id, user.id);
        Toast.show({ type: 'success', text1: 'Registered successfully!' });
      }
      loadEvents(true);
    } catch (error) {
      console.error('Registration error:', error);
      Toast.show({ type: 'error', text1: 'Registration failed', text2: 'Please try again' });
    }
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.calendarButton}
            onPress={() => { }}
          >
            <MaterialIcons name="calendar-today" size={20} color={Colors.primary} />
          </TouchableOpacity>
          {canCreateEvent && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                console.log('Create Event button pressed!');
                console.log('Navigating to CreateEvent screen...');
                navigation.navigate('CreateEvent');
              }}
            >
              <MaterialIcons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Selection */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            📅 Upcoming
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'live' && styles.tabActive]}
          onPress={() => setActiveTab('live')}
        >
          <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
            🔴 Live
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            ⏰ Past
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Events List */}
      <ScrollView
        style={styles.eventsContainer}
        contentContainerStyle={styles.eventsContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadEvents(true)}
            tintColor={Colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="event-busy" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>
              No {activeTab === 'upcoming' ? 'upcoming' : activeTab === 'live' ? 'live' : 'past'} events
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === 'upcoming' && "Check back later for new events"}
              {activeTab === 'live' && "No events are currently live"}
              {activeTab === 'past' && "No past events to show"}
            </Text>
            {canCreateEvent && activeTab === 'upcoming' && (
              <TouchableOpacity
                style={styles.createFirstButton}
                onPress={() => navigation.navigate('CreateEvent')}
              >
                <Text style={styles.createFirstButtonText}>Create First Event</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
            >
              {/* Event Poster/Notice */}
              {event.banner_image ? (
                <Image source={{ uri: event.banner_image }} style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 8 }} resizeMode="cover" />
              ) : null}

              {/* Event Header */}
              <View style={styles.eventHeader}>
                <View style={styles.eventTypeContainer}>
                  <Text style={styles.eventTypeText}>
                    {event.event_type.toUpperCase()}
                  </Text>
                </View>
                <EventStatus
                  startDate={event.start_date}
                  endDate={event.end_date}
                />
              </View>

              {/* Event Title & Description */}
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventDescription} numberOfLines={2}>
                {event.description}
              </Text>

              {/* Event Details */}
              <View style={styles.eventDetails}>
                <View style={styles.eventDetailRow}>
                  <MaterialIcons name="schedule" size={16} color="#6b7280" />
                  <Text style={styles.eventDetailText}>
                    {formatEventDate(event.start_date)}
                  </Text>
                </View>
                <View style={styles.eventDetailRow}>
                  <MaterialIcons
                    name={event.is_online ? "laptop" : "location-on"}
                    size={16}
                    color="#6b7280"
                  />
                  <Text style={styles.eventDetailText}>
                    {event.is_online ? "Online Event" : event.venue}
                  </Text>
                </View>
                <View style={styles.eventDetailRow}>
                  {(() => {
                    const count = event.registrations_count || 0;
                    const max = event.max_participants;
                    const isFull = max && count >= max;
                    const color = isFull ? '#ef4444' : count > 0 ? '#10b981' : '#94a3b8';
                    return (
                      <>
                        <MaterialIcons name="people" size={16} color={color} />
                        <Text style={[styles.eventDetailText, { color, fontWeight: '600' }]}>
                          {count} / {max || '∞'} {isFull ? 'Full' : 'registered'}
                        </Text>
                      </>
                    );
                  })()}
                </View>
              </View>

              {/* Countdown Timer for Upcoming Events */}
              {activeTab === 'upcoming' && (
                <View style={styles.timerContainer}>
                  <MaterialIcons name="timer" size={14} color="#92400e" style={{ marginRight: 6 }} />
                  <CountdownTimer
                    targetDate={event.start_date}
                    compact={true}
                    onExpire={() => loadEvents(true)}
                  />
                </View>
              )}

              {/* Registration Button */}
              {activeTab === 'upcoming' && new Date(event.registration_deadline) > new Date() && (
                <TouchableOpacity
                  style={[
                    styles.registerButton,
                    event.is_registered && styles.unregisterButton
                  ]}
                  onPress={() => handleRegister(event)}
                >
                  <MaterialIcons
                    name={event.is_registered ? 'person-remove' : 'how-to-reg'}
                    size={16}
                    color="#ffffff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.registerButtonText}>
                    {event.is_registered ? 'Unregister' : 'Register Now'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Registration Closed */}
              {activeTab === 'upcoming' && new Date(event.registration_deadline) <= new Date() && (
                <View style={styles.closedButton}>
                  <MaterialIcons name="block" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.closedButtonText}>Registration Closed</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getCategoryStyle(category: string) {
  switch (category) {
    case 'Academic':
      return { backgroundColor: '#dbeafe' };
    case 'Research':
      return { backgroundColor: '#fce7f3' };
    case 'Workshop':
      return { backgroundColor: '#fef3c7' };
    case 'Networking':
      return { backgroundColor: '#d1fae5' };
    default:
      return { backgroundColor: '#e2e8f0' };
  }
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginLeft: 8,
  },
  eventsContainer: {
    flex: 1,
    backgroundColor: '#fdfbf7',
  },
  eventsContent: {
    padding: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: 8,
  },
  createFirstButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  createFirstButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#fff',
  },
  eventTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  eventTypeText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    marginLeft: 4,
  },
  eventDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: 8,
  },

  container: {
    flex: 1,
    backgroundColor: '#fdfbf7',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  calendarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoriesContainer: {
    maxHeight: 50,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  categoriesContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  categoryChipActive: {
    backgroundColor: '#13ecec',
    borderColor: '#13ecec',
  },
  categoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  categoryTextActive: {
    color: '#111818',
    fontWeight: '700',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dateBox: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
    opacity: 0.8,
  },
  dateDay: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#111818',
    marginBottom: 8,
    overflow: 'hidden',
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexShrink: 1,
  },
  eventDetails: {
    gap: 4,
    marginBottom: 8,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  eventDetailText: {
    fontSize: 12,
    color: '#64748b',
    flex: 1,
    flexShrink: 1,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  attendeesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attendeesText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
    color: '#334155',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef8e7',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  timerText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
    color: '#92400e',
  },
  registerButton: {
    backgroundColor: '#10b981',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  registerButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
  unregisterButton: {
    backgroundColor: '#ef4444',
  },
  closedButton: {
    backgroundColor: '#ef4444',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  closedButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#6b7280',
  },
});
