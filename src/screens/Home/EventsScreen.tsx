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
  Modal,
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
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import { supabase } from '../../api/supabase';
import Toast from 'react-native-toast-message';
import {
  SEMANTIC_COLORS,
  getRegistrationColor,
  getEventStatusColor,
  getRegistrationButtonState,
} from '../../utils/semanticColors';

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
  const [eventToDelete, setEventToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const canDeleteEvent = (event: any) => {
    if (!user?.id) return false;
    return user.id === event.created_by || profile?.role === 'admin';
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete || !user?.id) return;

    try {
      setIsDeleting(true);

      // Delete all event registrations first
      const { error: registrationsError } = await supabase
        .from('event_registrations')
        .delete()
        .eq('event_id', eventToDelete.id);

      if (registrationsError) throw registrationsError;

      // Delete event reminders
      const { error: remindersError } = await supabase
        .from('event_reminders')
        .delete()
        .eq('event_id', eventToDelete.id);

      if (remindersError) console.error('Error deleting reminders:', remindersError);

      // Delete the event
      const { error: eventError } = await supabase
        .from('events')
        .delete()
        .eq('id', eventToDelete.id);

      if (eventError) throw eventError;

      Toast.show({
        type: 'success',
        text1: 'Event deleted successfully',
        text2: 'All registrations have been cancelled',
      });

      // Close modal and refresh list
      setShowDeleteConfirm(false);
      setEventToDelete(null);
      await loadEvents(true);
    } catch (error: any) {
      console.error('Error deleting event:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to delete event',
        text2: error.message || 'Please try again',
      });
    } finally {
      setIsDeleting(false);
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
            <MaterialIcons name="calendar-today" size={20} color="#a855f7" />
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
            tintColor="#a855f7"
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
                <View style={styles.eventHeaderRight}>
                  <EventStatus
                    startDate={event.start_date}
                    endDate={event.end_date}
                  />
                  {canDeleteEvent(event) && (
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        setEventToDelete(event);
                        setShowDeleteConfirm(true);
                      }}
                    >
                      <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Event Title & Description */}
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventDescription} numberOfLines={2}>
                {event.description}
              </Text>

              {/* Event Details */}
              <View style={styles.eventDetails}>
                <View style={styles.eventDetailRow}>
                  <MaterialIcons name="schedule" size={16} color={SEMANTIC_COLORS.textSecondary} />
                  <Text style={styles.eventDetailText}>
                    {formatEventDate(event.start_date)}
                  </Text>
                </View>
                <View style={styles.eventDetailRow}>
                  <MaterialIcons
                    name={event.is_online ? "laptop" : "location-on"}
                    size={16}
                    color={SEMANTIC_COLORS.textSecondary}
                  />
                  <Text style={styles.eventDetailText}>
                    {event.is_online ? "Online Event" : event.venue}
                  </Text>
                </View>
                <View style={styles.eventDetailRow}>
                  {(() => {
                    const count = event.registrations_count || 0;
                    const max = event.max_participants;
                    const regInfo = getRegistrationColor(count, max);
                    return (
                      <View style={[styles.registrationBadge, { backgroundColor: regInfo.bg }]}>
                        <MaterialIcons name="people" size={14} color={regInfo.color} />
                        <Text style={[styles.registrationText, { color: regInfo.color }]}>
                          {count}/{max || '∞'}
                        </Text>
                        <Text style={[styles.registrationLabel, { color: regInfo.color }]}>
                          {regInfo.label}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* Premium Countdown Timer for Upcoming Events */}
              {activeTab === 'upcoming' && (() => {
                const now = new Date();
                const regDeadline = new Date(event.registration_deadline || event.start_date);
                const eventStart = new Date(event.start_date);
                const isRegClosed = regDeadline < now;
                const timerLabel = isRegClosed ? 'Event starts in' : 'Registration closes in';
                const targetDate = isRegClosed ? event.start_date : (event.registration_deadline || event.start_date);
                
                return (
                  <View style={styles.premiumTimerContainer}>
                    <View style={styles.timerLabel}>
                      <MaterialIcons name="timer" size={14} color={SEMANTIC_COLORS.warning} />
                      <Text style={styles.timerLabelText}>{timerLabel}</Text>
                    </View>
                    <CountdownTimer
                      targetDate={targetDate}
                      compact={true}
                    />
                  </View>
                );
              })()}

              {/* Dynamic Registration Button */}
              {activeTab === 'upcoming' && (() => {
                const count = event.registrations_count || 0;
                const max = event.max_participants;
                const isFull = max && count >= max;
                const buttonState = getRegistrationButtonState(
                  event.registration_deadline || event.start_date,
                  event.is_registered,
                  isFull
                );
                return (
                  <TouchableOpacity
                    style={[
                      styles.registerButton,
                      { backgroundColor: buttonState.bg },
                      buttonState.disabled && styles.disabledButton
                    ]}
                    onPress={() => !buttonState.disabled && handleRegister(event)}
                    disabled={buttonState.disabled}
                  >
                    <MaterialIcons
                      name={buttonState.icon as any}
                      size={16}
                      color={buttonState.color}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.registerButtonText, { color: buttonState.color }]}>
                      {buttonState.label}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Delete Confirmation */}
      <ConfirmBottomSheet
        visible={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setEventToDelete(null);
        }}
        onConfirm={handleDeleteEvent}
        title="Delete Event?"
        message={`Are you sure you want to delete "${eventToDelete?.title}"? This action cannot be undone and all registration(s) will be cancelled.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Event'}
        cancelText="Cancel"
        confirmColor="#ef4444"
        icon="delete-forever"
      />
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
    backgroundColor: '#fb7185',
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#fb7185',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
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
    backgroundColor: '#fb7185',
    borderColor: '#fb7185',
  },
  categoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: SEMANTIC_COLORS.textSecondary,
  },
  categoryTextActive: {
    color: '#ffffff',
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
    borderBottomColor: '#fb7185',
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  tabTextActive: {
    color: '#fb7185',
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#fda4af',
    overflow: 'hidden',
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  eventHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButton: {
    padding: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
  premiumTimerContainer: {
    backgroundColor: SEMANTIC_COLORS.warningLight,
    borderRadius: BorderRadius.md,
    padding: 10,
    marginTop: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: SEMANTIC_COLORS.warning,
  },
  timerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  timerLabelText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
    color: '#92400e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  registrationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  registrationText: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  registrationLabel: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
  },
  registerButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  disabledButton: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  registerButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
