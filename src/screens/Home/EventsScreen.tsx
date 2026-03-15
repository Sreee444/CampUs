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
import { LinearGradient } from 'expo-linear-gradient';
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
import { isAdminRole } from '../../utils/roles';
import {
  SEMANTIC_COLORS,
  getRegistrationColor,
  getEventStatusColor,
  getRegistrationButtonState,
} from '../../utils/semanticColors';
import { evaluateEventEligibility } from '../../utils/eventEligibility';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

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
  const [showEventMenu, setShowEventMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Keep create button visibility aligned with CreateEventScreen permissions
  const canCreateEvent = Boolean(
    user?.id &&
    profile &&
    (
      profile.role === 'faculty' ||
      isAdminRole(profile?.role) ||
      profile.is_club_coordinator ||
      profile.is_volunteer
    )
  );

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

      const data = await getEvents(user?.id, undefined, activeTab);
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

  useRealtimeRefresh({
    enabled: Boolean(user?.id),
    tables: ['events', 'event_registrations', 'event_reminders'],
    onChange: () => {
      loadEvents(true);
    },
  });

  // DB already filtered by tab — only apply category filter client-side
  const filteredEvents = events.filter((event) => {
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
      Toast.show({
        type: 'error',
        text1: 'Registration failed',
        text2: (error as any)?.message || 'Please try again',
      });
    }
  };

  const canDeleteEvent = (event: any) => {
    if (!user?.id) return false;
    return user.id === event.created_by || isAdminRole(profile?.role);
  };

  const openEventMenu = (event: any) => {
    if (!canDeleteEvent(event)) return;
    setEventToDelete(event);
    setShowEventMenu(true);
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete || !user?.id) return;
    if (!canDeleteEvent(eventToDelete)) {
      Toast.show({ type: 'error', text1: 'You are not allowed to delete this event' });
      setShowDeleteConfirm(false);
      return;
    }

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
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Events</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.calendarButton}
              onPress={() => { }}
            >
              <MaterialIcons name="calendar-today" size={20} color="#6366F1" />
            </TouchableOpacity>
            {canCreateEvent && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  navigation.navigate('CreateEvent');
                }}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Pill Segmented Tabs */}
        <View style={styles.segmentedRow}>
          {(['upcoming', 'live', 'past'] as const).map((tab) => {
            const labels = { upcoming: '📅 Upcoming', live: '🔴 Live', past: '⏰ Past' };
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.segmentPill, isActive && styles.segmentPillActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.segmentPillText, isActive && styles.segmentPillTextActive]}>
                  {labels[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Category Filter Chips */}
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
                {category.charAt(0).toUpperCase() + category.slice(1)}
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
              tintColor="#6366F1"
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
              {activeTab === 'upcoming' && 'Check back later for new events'}
              {activeTab === 'live' && 'No events are currently live'}
              {activeTab === 'past' && 'No past events to show'}
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
          filteredEvents.map((event) => {
            const eventTypeIcons: { [key: string]: string } = {
              workshop: 'build',
              seminar: 'lightbulb',
              hackathon: 'code',
              competition: 'emoji-events',
              fest: 'celebration',
              other: 'event',
            };
            const typeIcon = eventTypeIcons[event.event_type] || 'event';

            // Status label
            const now = new Date();
            const eventStart = new Date(event.start_date);
            const eventEnd = new Date(event.end_date);
            const isLive = eventStart <= now && eventEnd >= now;
            const statusLabel = isLive ? '🔴 Live Now' : activeTab === 'past' ? '⏰ Ended' : '✅ Upcoming';
            const statusBg = isLive ? '#FEE2E2' : activeTab === 'past' ? '#F3F4F6' : '#DFF5EC';
            const statusColor = isLive ? '#DC2626' : activeTab === 'past' ? '#6B7280' : '#059669';

            return (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
              activeOpacity={0.85}
            >
              {/* Banner image */}
              {event.banner_image ? (
                <Image
                  source={{ uri: event.banner_image }}
                  style={styles.eventBanner}
                  resizeMode="cover"
                />
              ) : null}

              {/* Badges row */}
              <View style={styles.eventHeader}>
                <View style={styles.eventTypeBadge}>
                  <MaterialIcons name={typeIcon as any} size={13} color="#7C3AED" />
                  <Text style={styles.eventTypeText}>
                    {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
                  </Text>
                </View>
                <View style={styles.eventHeaderRight}>
                  <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                  {canDeleteEvent(event) && (
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        openEventMenu(event);
                      }}
                    >
                      <MaterialIcons name="more-vert" size={20} color="#6b7280" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Title */}
              <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
              {!!event.description && (
                <Text style={styles.eventDescription} numberOfLines={2}>
                  {event.description}
                </Text>
              )}

              {/* Info rows */}
              <View style={styles.infoRowsContainer}>
                {/* Eligibility */}
                {(() => {
                  const eligibleDepartments = (event.eligible_departments || []) as string[];
                  const eligibleYears = ((event.eligible_years || []) as number[]).slice().sort((a, b) => a - b);
                  const isOpenToAll = (event.eligibility_type || 'college') === 'college';
                  const depts = eligibleDepartments.length ? eligibleDepartments.join(', ') : 'All Departments';
                  const years = eligibleYears.length ? eligibleYears.map((y) => `Year ${y}`).join(', ') : 'All Years';
                  return (
                    <View style={styles.infoRow}>
                      <MaterialIcons name={isOpenToAll ? 'public' : 'verified-user'} size={15} color={isOpenToAll ? '#16a34a' : '#4f46e5'} />
                      <Text style={styles.infoRowText} numberOfLines={1}>
                        {isOpenToAll ? 'Open to all students' : `${depts} • ${years}`}
                      </Text>
                    </View>
                  );
                })()}

                {/* Date */}
                <View style={styles.infoRow}>
                  <MaterialIcons name="schedule" size={15} color="#f59e0b" />
                  <Text style={styles.infoRowText}>{formatEventDate(event.start_date)}</Text>
                </View>

                {/* Venue */}
                <View style={styles.infoRow}>
                  <MaterialIcons name={event.is_online ? 'laptop' : 'location-on'} size={15} color="#3b82f6" />
                  <Text style={styles.infoRowText}>{event.is_online ? 'Online Event' : (event.venue || 'TBA')}</Text>
                </View>

                {/* Participants */}
                {(() => {
                  const count = event.registrations_count || 0;
                  const max = event.max_participants;
                  const regInfo = getRegistrationColor(count, max);
                  return (
                    <View style={styles.infoRow}>
                      <MaterialIcons name="people" size={15} color={regInfo.color} />
                      <Text style={[styles.infoRowText, { color: regInfo.color }]}>
                        {count}{max ? `/${max}` : ''} Participants{max ? ` • ${regInfo.label}` : ''}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* Countdown */}
              {activeTab === 'upcoming' && (() => {
                const regDeadline = new Date(event.registration_deadline || event.start_date);
                const isRegClosed = regDeadline < now;
                const timerLabel = isRegClosed ? 'Event starts in' : 'Registration closes in';
                const targetDate = isRegClosed ? event.start_date : (event.registration_deadline || event.start_date);
                return (
                  <View style={styles.countdownContainer}>
                    <View style={styles.timerLabel}>
                      <MaterialIcons name="timer" size={14} color="#92400e" />
                      <Text style={styles.timerLabelText}>{timerLabel}</Text>
                    </View>
                    <CountdownTimer targetDate={targetDate} compact={true} />
                  </View>
                );
              })()}

              {/* Registration Button */}
              {activeTab === 'upcoming' && (() => {
                const count = event.registrations_count || 0;
                const max = event.max_participants;
                const isFull = max && count >= max;
                const eligibility = evaluateEventEligibility(
                  {
                    eligibility_type: event.eligibility_type,
                    eligible_departments: event.eligible_departments,
                    eligible_years: event.eligible_years,
                  },
                  { department: profile?.department, year: profile?.year }
                );
                const isRegClosed = new Date(event.registration_deadline || event.start_date) <= new Date();
                const buttonState = getRegistrationButtonState(
                  event.registration_deadline || event.start_date,
                  event.is_registered,
                  isFull
                );
                const blockedByEligibility = !event.is_registered && !eligibility.isEligible;
                const blockedState = blockedByEligibility
                  ? { disabled: true, bg: '#f3f4f6', color: '#6b7280', icon: 'block', label: "Can't Register" }
                  : buttonState;

                // Override styling for registered/closed states to match design
                let btnBg = blockedState.bg;
                let btnColor = blockedState.color;
                if (event.is_registered) {
                  btnBg = '#A7E3C8';
                  btnColor = '#047857';
                } else if (!blockedState.disabled && !isRegClosed) {
                  btnBg = '#6366F1';
                  btnColor = '#ffffff';
                } else if (isRegClosed && !event.is_registered && !blockedByEligibility) {
                  btnBg = '#FEE2E2';
                  btnColor = '#991b1b';
                }

                return (
                  <View>
                    <TouchableOpacity
                      style={[
                        styles.registerButton,
                        { backgroundColor: btnBg },
                        blockedState.disabled && !event.is_registered && styles.disabledButton,
                      ]}
                      onPress={() => !blockedState.disabled && handleRegister(event)}
                      disabled={blockedState.disabled}
                    >
                      <MaterialIcons
                        name={event.is_registered ? 'check-circle' : (blockedState.icon as any)}
                        size={16}
                        color={btnColor}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.registerButtonText, { color: btnColor }]}>
                        {blockedState.label}
                      </Text>
                    </TouchableOpacity>
                    {blockedByEligibility && (
                      <Text style={styles.blockedText}>{eligibility.reason || 'Not eligible for this event.'}</Text>
                    )}
                    {!blockedByEligibility && isRegClosed && !event.is_registered && (
                      <Text style={[styles.blockedText, { color: '#991b1b' }]}>Registration is closed for this event.</Text>
                    )}
                  </View>
                );
              })()}
            </TouchableOpacity>
          );
          })
        )}

        </ScrollView>

        <Modal
        visible={showEventMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEventMenu(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.menuOverlay}
          onPress={() => setShowEventMenu(false)}
        >
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowEventMenu(false);
                if (eventToDelete?.id) {
                  navigation.navigate('EventDetails', { eventId: eventToDelete.id });
                }
              }}
            >
              <MaterialIcons name="visibility" size={18} color="#374151" />
              <Text style={styles.menuItemText}>View details</Text>
            </TouchableOpacity>

            {eventToDelete && canDeleteEvent(eventToDelete) && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowEventMenu(false);
                  setShowDeleteConfirm(true);
                }}
              >
                <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
                <Text style={styles.menuDeleteText}>Delete event</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

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
      </LinearGradient>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#F5E6D8',
  },
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },

  // ── Segmented pill tabs ─────────────────────────────
  segmentedRow: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  segmentPillActive: {
    backgroundColor: '#EDEBFF',
  },
  segmentPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  segmentPillTextActive: {
    color: '#6366F1',
    fontWeight: '700',
  },

  // ── Category chips ──────────────────────────────────
  categoriesContainer: {
    maxHeight: 48,
  },
  categoriesContent: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  categoryTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // ── Events list ─────────────────────────────────────
  eventsContainer: {
    flex: 1,
  },
  eventsContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 90,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  createFirstButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  createFirstButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // ── Event Card ──────────────────────────────────────
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 35,
    elevation: 6,
  },
  eventBanner: {
    width: '100%',
    height: 155,
    borderRadius: 14,
    marginBottom: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eventTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  eventTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 22,
  },
  eventDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
    lineHeight: 18,
  },

  // ── Info rows ────────────────────────────────────────
  infoRowsContainer: {
    gap: 6,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoRowText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },

  // ── Countdown ────────────────────────────────────────
  countdownContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    width: '100%',
  },
  timerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  timerLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Register button ──────────────────────────────────
  registerButton: {
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disabledButton: {
    opacity: 0.7,
  },
  registerButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  blockedText: {
    marginTop: 6,
    fontSize: 11,
    color: '#b45309',
    textAlign: 'center',
  },

  // ── Context menu ─────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  menuDeleteText: {
    fontSize: 15,
    color: '#dc2626',
    fontWeight: '600',
  },
});
