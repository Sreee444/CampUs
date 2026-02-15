import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { CountdownTimer, EventStatus } from '../../components/CountdownTimer';
import { scheduleEventReminder, createEventReminder } from '../../api/eventReminders';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';

type EventDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EventDetails'>;
type EventDetailsScreenRouteProp = RouteProp<RootStackParamList, 'EventDetails'>;

interface EventDetails {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  venue: string;
  is_online: boolean;
  meeting_link?: string;
  event_type: string;
  max_participants: number;
  registration_deadline: string;
  banner_image?: string;
  created_by: string;
  organizers: string[];
  is_registered?: boolean;
  registrations_count: number;
  organizer_profile?: {
    full_name: string;
    avatar_url?: string;
  };
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function EventDetailsScreen() {
  const navigation = useNavigation<EventDetailsScreenNavigationProp>();
  const route = useRoute<EventDetailsScreenRouteProp>();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);

  const { eventId } = route.params;

  const loadEventDetails = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          organizer_profile:profiles!events_created_by_fkey(
            full_name,
            avatar_url
          )
        `)
        .eq('id', eventId)
        .single();

      if (error) throw error;

      // Check if user is registered for this event
      let isRegistered = false;
      if (user?.id) {
        const { data: registrationData, error: regError } = await supabase
          .from('event_registrations')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .eq('status', 'registered')
          .maybeSingle();

        if (!regError && registrationData) {
          isRegistered = true;
        }
      }

      // Get participant count
      const { count: participantCount } = await supabase
        .from('event_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'registered');

      console.log('Event registration check:', { isRegistered, userId: user?.id, eventId });

      setEvent({
        ...(data as any),
        is_registered: isRegistered,
        registrations_count: participantCount || 0,
      } as EventDetails);
    } catch (error) {
      console.error('Failed to load event details:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load event',
        text2: 'Please try again',
      });
    } finally {
      setIsLoading(false);
    }
  }, [eventId, user?.id]);

  useEffect(() => {
    loadEventDetails();
  }, [loadEventDetails]);

  const handleRegistration = async () => {
    if (!user?.id || !event) return;

    try {
      setIsRegistering(true);

      if (event.is_registered) {
        // Unregister
        console.log('Attempting to unregister:', { eventId, userId: user.id });

        const { error, count } = await supabase
          .from('event_registrations')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', user.id);

        console.log('Delete result:', { error, count });

        if (error) {
          console.error('Delete error:', error);
          throw error;
        }

        // Optimistically update UI immediately
        setEvent({
          ...event,
          is_registered: false,
          registrations_count: Math.max(0, (event.registrations_count || 1) - 1),
        });

        Toast.show({
          type: 'success',
          text1: 'Unregistered successfully',
        });
      } else {
        // Register
        const { error } = await supabase
          .from('event_registrations')
          .insert({
            event_id: eventId,
            user_id: user.id,
            status: 'registered',
          } as any);

        if (error) throw error;

        // Optimistically update UI immediately
        setEvent({
          ...event,
          is_registered: true,
          registrations_count: (event.registrations_count || 0) + 1,
        });

        // Schedule reminder notification
        try {
          const notificationId = await scheduleEventReminder(
            eventId,
            event.title,
            event.start_date,
            60 // 1 hour before
          );

          await createEventReminder(eventId, user.id, 60);

          Toast.show({
            type: 'success',
            text1: 'Registered successfully!',
            text2: 'You will get a reminder 1 hour before the event',
          });
        } catch (reminderError) {
          console.error('Failed to schedule reminder:', reminderError);
          Toast.show({
            type: 'success',
            text1: 'Registered successfully!',
            text2: 'Could not schedule reminder notification',
          });
        }
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      Toast.show({
        type: 'error',
        text1: 'Registration failed',
        text2: error.message || 'Please try again',
      });
      // Revert optimistic update on error
      await loadEventDetails();
    } finally {
      setIsRegistering(false);
    }
  };

  const openMeetingLink = () => {
    if (event?.meeting_link) {
      // You would typically use Linking.openURL here
      Alert.alert(
        'Join Meeting',
        `Open meeting link?\n${event.meeting_link}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open', onPress: () => { } }, // Linking.openURL(event.meeting_link)
        ]
      );
    }
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDaysUntil = (dateStr: string) => {
    const target = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(target.getTime() - now.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    return target.toLocaleDateString();
  };

  if (isLoading || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Event Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading event details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date();
  const eventStart = new Date(event.start_date);
  const eventEnd = new Date(event.end_date);
  const isUpcoming = eventStart > now;
  const isLive = eventStart <= now && eventEnd >= now;
  const isEnded = eventEnd < now;
  const canRegister = isUpcoming && new Date(event.registration_deadline) > now;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
        <TouchableOpacity>
          <MaterialIcons name="share" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Event Banner/Poster */}
        {event.banner_image && (
          <View style={styles.bannerContainer}>
            <Image
              source={{ uri: event.banner_image }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
            {/* Gradient overlay for better text visibility */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.bannerGradient}
            />
          </View>
        )}

        {/* Event Header */}
        <View style={styles.eventHeader}>
          <View style={styles.eventTypeContainer}>
            <Text style={styles.eventTypeText}>{event.event_type.toUpperCase()}</Text>
          </View>
          <EventStatus startDate={event.start_date} endDate={event.end_date} />
        </View>

        {/* Event Title */}
        <Text style={styles.eventTitle}>{event.title}</Text>



        {/* Live Indicator */}
        {isLive && (
          <View style={styles.liveSection}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>🔴 Event is Live Now!</Text>
            </View>
            {event.is_online && event.meeting_link && (
              <TouchableOpacity style={styles.joinButton} onPress={openMeetingLink}>
                <MaterialIcons name="video-call" size={20} color="#fff" />
                <Text style={styles.joinButtonText}>Join Meeting</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Event Details */}
        <View style={styles.detailsSection}>
          <View style={styles.detailRow}>
            <MaterialIcons name="schedule" size={20} color="#6b7280" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Start Time</Text>
              <Text style={styles.detailText}>{formatEventDate(event.start_date)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons name="access-time" size={20} color="#6b7280" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>End Time</Text>
              <Text style={styles.detailText}>{formatEventDate(event.end_date)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons
              name={event.is_online ? "laptop" : "location-on"}
              size={20}
              color="#6b7280"
            />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>
                {event.is_online ? "Meeting" : "Venue"}
              </Text>
              <Text style={styles.detailText}>
                {event.is_online ? "Online Event" : event.venue}
              </Text>
              {event.is_online && event.meeting_link && isLive && (
                <TouchableOpacity onPress={openMeetingLink}>
                  <Text style={styles.meetingLink}>Join Meeting</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons name="people" size={20} color="#6b7280" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Participants</Text>
              <Text style={styles.detailText}>
                {event.registrations_count} / {event.max_participants || '∞'} registered
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons name="person" size={20} color="#6b7280" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Organizer</Text>
              <Text style={styles.detailText}>
                {event.organizer_profile?.full_name || 'Campus Team'}
              </Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>About This Event</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>

        {/* Event Timeline Section */}
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>📅 Event Timeline</Text>

          <View style={styles.timelineContainer}>
            {/* Registration Deadline */}
            <View style={styles.timelineItem}>
              <View style={[styles.timelineIconContainer, { backgroundColor: '#fef3c7' }]}>
                <MaterialIcons name="event-available" size={20} color="#f59e0b" />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Registration Closes</Text>
                <Text style={styles.timelineDate}>{formatEventDate(event.registration_deadline)}</Text>
                {/* Show countdown if registration deadline is approaching */}
                {isUpcoming && new Date(event.registration_deadline) > new Date() && (
                  <View style={styles.miniCountdown}>
                    <MaterialIcons name="timer" size={14} color="#f59e0b" />
                    <Text style={styles.miniCountdownText}>
                      {getDaysUntil(event.registration_deadline)} left to register
                    </Text>
                  </View>
                )}
                {new Date(event.registration_deadline) <= new Date() && (
                  <View style={styles.closedBadge}>
                    <Text style={styles.closedBadgeText}>Registration Closed</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Event Start */}
            <View style={styles.timelineItem}>
              <View style={[styles.timelineIconContainer, { backgroundColor: '#d1fae5' }]}>
                <MaterialIcons name="play-circle-filled" size={20} color="#10b981" />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Event Starts</Text>
                <Text style={styles.timelineDate}>{formatEventDate(event.start_date)}</Text>
              </View>
            </View>

            {/* Event End */}
            <View style={styles.timelineItem}>
              <View style={[styles.timelineIconContainer, { backgroundColor: '#fee2e2' }]}>
                <MaterialIcons name="stop-circle" size={20} color="#ef4444" />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Event Ends</Text>
                <Text style={styles.timelineDate}>{formatEventDate(event.end_date)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Registration Section */}
        {canRegister && (
          <View style={styles.registrationSection}>
            {event.is_registered ? (
              // Already Registered - Show Unregister Button
              <TouchableOpacity
                style={[
                  styles.unregisterButton,
                  isRegistering && styles.registerButtonDisabled,
                ]}
                onPress={handleRegistration}
                disabled={isRegistering}
              >
                <MaterialIcons name="cancel" size={20} color="#ef4444" />
                <Text style={styles.unregisterButtonText}>
                  {isRegistering ? 'Unregistering...' : 'Unregister'}
                </Text>
              </TouchableOpacity>
            ) : (
              // Not Registered - Show Register Button
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  isRegistering && styles.registerButtonDisabled,
                ]}
                onPress={handleRegistration}
                disabled={isRegistering}
              >
                <MaterialIcons name="event-available" size={20} color="#fff" />
                <Text style={styles.registerButtonText}>
                  {isRegistering ? 'Registering...' : 'Register for Event'}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.registrationInfo}>
              Registration deadline: {new Date(event.registration_deadline).toLocaleDateString()}
            </Text>
          </View>
        )}

        {isUpcoming && new Date(event.registration_deadline) <= now && (
          <View style={styles.closedSection}>
            <Text style={styles.closedText}>Registration Closed</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  eventTypeContainer: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  eventTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
    lineHeight: 32,
  },
  timerSection: {
    backgroundColor: '#f9fafb',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  timerLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 12,
  },
  liveSection: {
    backgroundColor: '#fef2f2',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 14,
    color: '#1f2937',
  },
  meetingLink: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '500',
    marginTop: 4,
  },
  descriptionSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  registrationSection: {
    marginBottom: 24,
  },
  registerButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  unregisterButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  unregisterButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  registrationInfo: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  closedSection: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  closedText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  bannerContainer: {
    width: '100%',
    height: 250,
    marginBottom: 20,
    position: 'relative',
    backgroundColor: '#f3f4f6',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  bannerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  // Timeline Section Styles
  timelineSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 16,
  },
  timelineContainer: {
    marginTop: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  timelineIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  timelineDate: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  miniCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  miniCountdownText: {
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '500',
  },
  closedBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  closedBadgeText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
});