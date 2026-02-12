import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
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

export default function EventDetailsScreen() {
  const navigation = useNavigation<EventDetailsScreenNavigationProp>();
  const route = useRoute<EventDetailsScreenRouteProp>();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);

  const { eventId } = route.params;

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const loadEventDetails = async () => {
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

      // Check registration status
      let isRegistered = false;
      if (user?.id) {
        const { data: registration } = await supabase
          .from('event_registrations')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .single();
        
        isRegistered = !!registration;
      }

      // Get registration count
      const { count } = await supabase
        .from('event_registrations')
        .select('id', { count: 'exact' })
        .eq('event_id', eventId);

      setEvent({
        ...data,
        is_registered: isRegistered,
        registrations_count: count || 0,
      });

    } catch (error) {
      console.error('Error loading event details:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load event details',
        text2: 'Please try again',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistration = async () => {
    if (!user?.id || !event) return;

    try {
      setIsRegistering(true);

      if (event.is_registered) {
        // Unregister
        const { error } = await supabase
          .from('event_registrations')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', user.id);

        if (error) throw error;

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
          });

        if (error) throw error;

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

      await loadEventDetails();
    } catch (error: any) {
      console.error('Registration error:', error);
      Toast.show({
        type: 'error',
        text1: 'Registration failed',
        text2: error.message || 'Please try again',
      });
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
          { text: 'Open', onPress: () => {} }, // Linking.openURL(event.meeting_link)
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
        {/* Event Header */}
        <View style={styles.eventHeader}>
          <View style={styles.eventTypeContainer}>
            <Text style={styles.eventTypeText}>{event.event_type.toUpperCase()}</Text>
          </View>
          <EventStatus startDate={event.start_date} endDate={event.end_date} />
        </View>

        {/* Event Title */}
        <Text style={styles.eventTitle}>{event.title}</Text>

        {/* Countdown Timer for Upcoming Events */}
        {isUpcoming && (
          <View style={styles.timerSection}>
            <Text style={styles.timerLabel}>Event starts in:</Text>
            <CountdownTimer
              targetDate={event.start_date}
              showDays={true}
              compact={false}
            />
          </View>
        )}

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

        {/* Registration Section */}
        {canRegister && (
          <View style={styles.registrationSection}>
            <TouchableOpacity
              style={[
                styles.registerButton,
                event.is_registered && styles.unregisterButton,
                isRegistering && styles.registerButtonDisabled,
              ]}
              onPress={handleRegistration}
              disabled={isRegistering}
            >
              <Text style={[
                styles.registerButtonText,
                event.is_registered && styles.unregisterButtonText,
              ]}>
                {isRegistering
                  ? (event.is_registered ? 'Unregistering...' : 'Registering...')
                  : (event.is_registered ? '✓ Registered' : 'Register for Event')
                }
              </Text>
            </TouchableOpacity>

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
    alignItems: 'center',
    marginBottom: 8,
  },
  unregisterButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#6366f1',
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
    color: '#6366f1',
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
});