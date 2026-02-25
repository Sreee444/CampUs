import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Switch,
  ActivityIndicator,
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
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import { createNotification } from '../../api/notifications';
import StatusBadge from '../../components/StatusBadge';
import { computeTeamStatus } from '../../utils/teamUtils';
import { loadMyTeamState, cancelJoinRequest } from '../../utils/teamActions';

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
  // Team fields
  participation_type?: 'individual' | 'team';
  max_team_size?: number;
  min_team_size?: number;
  eligible_departments?: string[];
  eligible_years?: number[];
  eligibility_type?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function EventDetailsScreen() {
  const navigation = useNavigation<EventDetailsScreenNavigationProp>();
  const route = useRoute<EventDetailsScreenRouteProp>();
  const { user, profile } = useAuth();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegisterConfirmation, setShowRegisterConfirmation] = useState(false);
  const [showUnregisterConfirmation, setShowUnregisterConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Team zone state
  // Centralized team state
  const [teamState, setTeamState] = useState<any>(null);
  const [isCheckingTeam, setIsCheckingTeam] = useState(true);

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
          .neq('status', 'cancelled')
          .maybeSingle();

        if (!regError && registrationData) {
          isRegistered = true;
        }
      }

      // Get participant count — no status filter for accurate total
      const { count: participantCount } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);

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

  // Load team status — ONLY from event_registrations with status='registered'
  // This is the single source of truth. Always called via useFocusEffect.
  // Centralized loader for team state
  const loadTeamStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsCheckingTeam(true);
      const [state, scopedMembershipRes] = await Promise.all([
        loadMyTeamState(eventId, user.id),
        (supabase as any)
          .from('event_team_members')
          .select(`
            team_id,
            role,
            status,
            team:event_teams!inner(
              id,
              event_id
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .eq('team.event_id', eventId)
          .limit(1)
          .maybeSingle(),
      ]);

      const scopedTeamId = scopedMembershipRes?.data?.team_id ?? null;
      setTeamState({
        ...state,
        teamId: scopedTeamId,
        isInTeam: !!scopedTeamId,
      });
    } catch (err) {
      console.error('Team status error:', err);
      setTeamState(null);
    } finally {
      setIsCheckingTeam(false);
    }
  }, [eventId, user?.id]);

  // Initial event load (once)
  useEffect(() => {
    loadEventDetails();
  }, [loadEventDetails]);

  // useFocusEffect is the SOLE trigger for team status:
  // runs on mount AND every time the user navigates back to this screen.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadTeamStatus();
      }
    }, [eventId, user?.id, loadTeamStatus])
  );

  // Prevent team state carry-over between events.
  useEffect(() => {
    setTeamState(null);
    setIsCheckingTeam(true);
  }, [eventId]);

  const cleanupTeamOnEventLeave = useCallback(async (currentEventId: string, currentUserId: string) => {
    const { data: membershipRow, error: membershipError } = await (supabase as any)
      .from('event_team_members')
      .select(`
        team_id,
        role,
        team:event_teams!inner(
          id,
          event_id,
          leader_id
        )
      `)
      .eq('user_id', currentUserId)
      .eq('status', 'active')
      .eq('team.event_id', currentEventId)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membershipRow?.team_id) return;

    const teamId = membershipRow.team_id as string;
    const isLeader = membershipRow.role === 'leader' || membershipRow.team?.leader_id === currentUserId;

    const { error: removeMembershipError } = await (supabase as any)
      .from('event_team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', currentUserId);
    if (removeMembershipError) throw removeMembershipError;

    if (isLeader) {
      const { error: clearTeamRegsError } = await (supabase as any)
        .from('event_registrations')
        .update({ team_id: null, looking_for_team: false })
        .eq('event_id', currentEventId)
        .eq('team_id', teamId);
      if (clearTeamRegsError) throw clearTeamRegsError;

      await (supabase as any)
        .from('team_requests')
        .delete()
        .eq('event_id', currentEventId)
        .eq('team_id', teamId);

      await (supabase as any)
        .from('event_team_members')
        .delete()
        .eq('team_id', teamId);

      const { error: deleteTeamError } = await (supabase as any)
        .from('event_teams')
        .delete()
        .eq('id', teamId)
        .eq('event_id', currentEventId);
      if (deleteTeamError) throw deleteTeamError;

      return;
    }

    const { count: remainingMembers, error: remainingMembersError } = await (supabase as any)
      .from('event_team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (remainingMembersError) throw remainingMembersError;

    if ((remainingMembers ?? 0) === 0) {
      await (supabase as any)
        .from('team_requests')
        .delete()
        .eq('event_id', currentEventId)
        .eq('team_id', teamId);

      const { error: deleteEmptyTeamError } = await (supabase as any)
        .from('event_teams')
        .delete()
        .eq('id', teamId)
        .eq('event_id', currentEventId);
      if (deleteEmptyTeamError) throw deleteEmptyTeamError;
    }
  }, []);

  // Notify all admin users
  const notifyAdmins = async (title: string, message: string) => {
    try {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins) {
        // Insert notifications directly to avoid type mismatch
        const notifications = admins.map((admin: { id: string }) => ({
          user_id: admin.id,
          title,
          message,
          type: 'event',
          related_id: eventId,
          is_read: false,
          created_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('notifications')
          .insert(notifications as any);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Failed to notify admins:', error);
    }
  };

  const handleRegistration = async () => {
    if (!user?.id || !event) return;

    try {
      setIsRegistering(true);

      if (event.is_registered) {
        // UNREGISTER — UPDATE status to 'cancelled', never DELETE the row
        setShowUnregisterConfirmation(false);

        if ((event as any)?.participation_type === 'team') {
          await cleanupTeamOnEventLeave(eventId, user.id);
        }

        const { error } = await (supabase as any)
          .from('event_registrations')
          .update({
            status: 'cancelled',
            team_id: null,
            looking_for_team: false,
          })
          .eq('event_id', eventId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Unregister error:', error);
          throw error;
        }

        // Notify event creator
        if (event.created_by) {
          await createNotification({
            user_id: event.created_by,
            title: 'Event Unregistration',
            body: `${profile?.full_name || user.email || 'Someone'} unregistered from ${event.title}`,
            type: 'event_update',
            related_id: eventId,
          });
        }

        // Notify admins
        await notifyAdmins(
          'Event Unregistration',
          `${profile?.full_name || user.email || 'A user'} unregistered from ${event.title}`
        );

        // Optimistically update UI immediately
        setEvent({
          ...event,
          is_registered: false,
          registrations_count: Math.max(0, (event.registrations_count || 1) - 1),
        });
        setTeamState(null);

        // Refetch team state so UI reflects the cleared team association
        loadTeamStatus();

        Toast.show({
          type: 'success',
          text1: 'Unregistered successfully',
        });
      } else {
        // REGISTER — always include status='registered'
        setShowRegisterConfirmation(false);

        const { error } = await (supabase as any)
          .from('event_registrations')
          .upsert({
            event_id: eventId,
            user_id: user.id,
            status: 'registered',
            team_id: null,
            looking_for_team: false,
          }, { onConflict: 'event_id,user_id' });

        if (error) throw error;

        // Notify event creator
        if (event.created_by) {
          await createNotification({
            user_id: event.created_by,
            title: 'New Event Registration',
            body: `${profile?.full_name || user.email || 'Someone'} registered for ${event.title}`,
            type: 'event_registration',
            related_id: eventId,
          });
        }

        // Notify admins
        await notifyAdmins(
          'Event Registration',
          `${profile?.full_name || user.email || 'A user'} registered for ${event.title}`
        );

        // Optimistically update UI immediately
        setEvent({
          ...event,
          is_registered: true,
          registrations_count: (event.registrations_count || 0) + 1,
        });

        // Reload team status after registering
        await loadTeamStatus();

        // Schedule reminder notification
        try {
          await scheduleEventReminder(
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

  // For team events: just navigate to the target screen
  const handleRegisterAndNavigate = (
    destination: 'CreateTeam' | 'JoinTeam'
  ) => {
    if (!event) return;
    if (teamState?.isInTeam) {
      Toast.show({
        type: 'info',
        text1: 'Already in a team',
        text2: 'You are already in a team for this event.',
      });
      return;
    }

    if (destination === 'CreateTeam') {
      navigation.navigate('CreateTeam', {
        eventId,
        maxTeamSize: (event as any)?.max_team_size ?? 5,
      });
    } else {
      navigation.navigate('JoinTeam', { eventId });
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

  const handleDeleteEvent = async () => {
    if (!event || !user?.id) return;

    try {
      setIsDeleting(true);
      setShowDeleteConfirmation(false);

      // Delete all event registrations first
      const { error: registrationsError } = await supabase
        .from('event_registrations')
        .delete()
        .eq('event_id', eventId);

      if (registrationsError) throw registrationsError;

      // Delete event reminders
      const { error: remindersError } = await supabase
        .from('event_reminders')
        .delete()
        .eq('event_id', eventId);

      if (remindersError) console.error('Error deleting reminders:', remindersError);

      // Delete the event
      const { error: eventError } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (eventError) throw eventError;

      // Notify admins if creator is deleting
      if (user.id === event.created_by && profile?.role !== 'admin') {
        await notifyAdmins(
          'Event Deleted',
          `${profile?.full_name || user.email || 'A user'} deleted the event "${event.title}"`
        );
      }

      Toast.show({
        type: 'success',
        text1: 'Event deleted successfully',
        text2: 'All registrations have been cancelled',
      });

      // Navigate back to events list
      navigation.goBack();
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
  const isCreator = user?.id === event.created_by;
  const isAdmin = profile?.role === 'admin';
  const canManageEvent = isCreator || isAdmin;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton}>
            <MaterialIcons name="share" size={24} color="#000" />
          </TouchableOpacity>
          {canManageEvent && (
            <TouchableOpacity
              style={[styles.headerButton, styles.deleteButton]}
              onPress={() => setShowDeleteConfirmation(true)}
            >
              <MaterialIcons name="delete-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
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
            {canManageEvent && event.registrations_count > 0 && (
              <TouchableOpacity
                style={styles.viewUsersButton}
                onPress={() =>
                  navigation.navigate('EventRegisteredUsers', {
                    eventId,
                    eventTitle: event.title,
                  })
                }
              >
                <Text style={styles.viewUsersText}>View All</Text>
                <MaterialIcons name="arrow-forward" size={16} color="#fb7185" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.detailRow}
            onPress={() => {
              if (event.created_by) {
                navigation.navigate('PublicProfile', { userId: event.created_by });
              }
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="person" size={20} color="#6b7280" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Organizer</Text>
              <Text style={styles.detailText}>
                {event.organizer_profile?.full_name || 'Campus Team'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#6b7280" />
          </TouchableOpacity>
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
              <View>
                {(event as any)?.participation_type !== 'team' && (
                  <View style={styles.individualNotice}>
                    <MaterialIcons name="person" size={16} color="#6b7280" />
                    <Text style={styles.individualNoticeText}>This is an individual event.</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[
                    styles.unregisterButton,
                    isRegistering && styles.registerButtonDisabled,
                  ]}
                  onPress={() => setShowUnregisterConfirmation(true)}
                  disabled={isRegistering}
                >
                  <MaterialIcons name="cancel" size={20} color="#ef4444" />
                  <Text style={styles.unregisterButtonText}>
                    {isRegistering ? 'Unregistering...' : 'Unregister'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (event as any)?.participation_type === 'team' ? (
              // Team Event — user NOT registered yet: show Register button only
              // Create/Join team buttons are inside the Team Participation Zone (below), shown only after registration
              <View style={styles.teamRegisterContainer}>
                <View style={styles.teamRegisterInfoBanner}>
                  <MaterialIcons name="info-outline" size={16} color="#6366f1" />
                  <Text style={styles.teamRegisterInfoText}>
                    Register first to access team features (create or join a team).
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.registerButton,
                    isRegistering && styles.registerButtonDisabled,
                  ]}
                  onPress={() => setShowRegisterConfirmation(true)}
                  disabled={isRegistering}
                >
                  <MaterialIcons name="event-available" size={20} color="#fff" />
                  <Text style={styles.registerButtonText}>
                    {isRegistering ? 'Registering...' : 'Register for Event'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Individual Event - Show Register Button
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  isRegistering && styles.registerButtonDisabled,
                ]}
                onPress={() => setShowRegisterConfirmation(true)}
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

        {/* Team Participation Zone — only when registered + team event */}
        {(event as any)?.participation_type === 'team' && event.is_registered && (() => {
          const deadlinePassed = new Date(event.registration_deadline) <= now;
          const isInTeam = !!teamState?.isInTeam;
          const hasSentJoinRequest = !!teamState?.hasSentJoinRequest;
          const hasReceivedInvite = !!teamState?.hasReceivedInvite;

          // Only show loader if checking
          if (isCheckingTeam) {
            return (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <ActivityIndicator size="small" color="#6366f1" />
              </View>
            );
          }

          return (
            <View style={styles.teamZoneContainer}>
              {/* PRIMARY ACTION: Based on current state */}
              {isInTeam ? (
                <TouchableOpacity
                  style={styles.teamZoneActionButton}
                  onPress={() => navigation.navigate('TeamDetails', { teamId: teamState?.teamId, eventId })}
                >
                  <MaterialIcons name="group" size={18} color="#6366f1" />
                  <Text style={styles.teamZoneActionText}>View My Team</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#6366f1" />
                </TouchableOpacity>
              ) : hasSentJoinRequest ? (
                <View style={styles.teamZoneActions}>
                  <TouchableOpacity
                    style={[styles.teamZonePrimaryButton, { backgroundColor: '#fef3c7' }]}
                    onPress={async () => {
                      if (teamState?.sentJoinRequest?.team_id) {
                        try {
                          await cancelJoinRequest({ teamId: teamState.sentJoinRequest.team_id, requesterId: user.id, eventId });
                          Toast.show({ type: 'info', text1: 'Request cancelled' });
                          await loadTeamStatus();
                        } catch (err: any) {
                          Toast.show({ type: 'error', text1: 'Failed to cancel', text2: err.message });
                        }
                      }
                    }}
                  >
                    <MaterialIcons name="hourglass-empty" size={18} color="#f59e0b" />
                    <Text style={[styles.teamZonePrimaryText, { color: '#d97706' }]}>Cancel Request</Text>
                  </TouchableOpacity>
                </View>
              ) : !deadlinePassed ? (
                <View style={styles.teamZoneActions}>
                  <TouchableOpacity
                    style={[styles.teamZonePrimaryButton]}
                    onPress={() => handleRegisterAndNavigate('CreateTeam')}
                  >
                    <MaterialIcons name="add" size={18} color="#fff" />
                    <Text style={styles.teamZonePrimaryText}>Create Team</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* SECONDARY ACTIONS: Always show if deadline not passed (or already in team/have requests) */}
              {!deadlinePassed && (
                <View style={[styles.teamZoneSecondaryActions, { marginTop: 8 }]}>
                  {hasReceivedInvite && (
                    <TouchableOpacity
                      style={[styles.teamZoneSecondaryButton, { backgroundColor: '#eef2ff', borderColor: '#6366f1' }]}
                      onPress={() => navigation.navigate('TeamInvitations')}
                    >
                      <MaterialIcons name="mail" size={18} color="#6366f1" />
                      <Text style={[styles.teamZoneSecondaryText, { color: '#6366f1', fontWeight: 'bold' }]}>View Invites!</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={styles.teamZoneSecondaryButton}
                      onPress={() => navigation.navigate('BrowseTeams', { eventId })}
                    >
                      <MaterialIcons name="search" size={18} color="#6b7280" />
                      <Text style={styles.teamZoneSecondaryText}>Browse Teams</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.teamZoneSecondaryButton}
                      onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [] })}
                    >
                      <MaterialIcons name="person-search" size={18} color="#6b7280" />
                      <Text style={styles.teamZoneSecondaryText}>Find Teammates</Text>
                    </TouchableOpacity>
                    {!isInTeam && !hasSentJoinRequest && (
                      <TouchableOpacity
                        style={styles.teamZoneSecondaryButton}
                        onPress={() => handleRegisterAndNavigate('JoinTeam')}
                      >
                        <MaterialIcons name="login" size={18} color="#6b7280" />
                        <Text style={styles.teamZoneSecondaryText}>Join via Code</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {deadlinePassed && !isInTeam && !hasSentJoinRequest && (
                <View style={styles.deadlineBanner}>
                  <MaterialIcons name="lock" size={14} color="#ef4444" />
                  <Text style={styles.deadlineBannerText}>Registration deadline passed — team changes locked</Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Event Collaboration/Discussion Section */}
        <View style={styles.collaborationSection}>
          <TouchableOpacity
            style={styles.discussionButton}
            onPress={() => navigation.navigate('EventDiscussion', { eventId })}
          >
            <MaterialIcons name="forum" size={20} color="#3b82f6" />
            <View style={{ flex: 1 }}>
              <Text style={styles.discussionButtonTitle}>Event Discussion</Text>
              <Text style={styles.discussionButtonSubtitle}>
                {isUpcoming ? 'Ask questions & prepare' : 'Share feedback & learnings'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9ca3b8" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Register Confirmation */}
      <ConfirmBottomSheet
        visible={showRegisterConfirmation}
        onClose={() => setShowRegisterConfirmation(false)}
        onConfirm={handleRegistration}
        title="Confirm Registration"
        message={`Are you sure you want to register for ${event.title}? You will receive a reminder 1 hour before the event.`}
        confirmText={isRegistering ? 'Registering...' : 'Register'}
        cancelText="Cancel"
        confirmColor="#fb7185"
        icon="event-available"
      />

      {/* Unregister Confirmation */}
      <ConfirmBottomSheet
        visible={showUnregisterConfirmation}
        onClose={() => setShowUnregisterConfirmation(false)}
        onConfirm={handleRegistration}
        title="Unregister from Event?"
        message={`Are you sure you want to unregister from ${event.title}? Your spot will be made available to others.`}
        confirmText={isRegistering ? 'Unregistering...' : 'Unregister'}
        cancelText="Keep Registration"
        confirmColor="#ef4444"
        icon="cancel"
      />

      {/* Delete Event Confirmation */}
      <ConfirmBottomSheet
        visible={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleDeleteEvent}
        title="Delete Event?"
        message={`Are you sure you want to delete "${event.title}"? This action cannot be undone and all ${event.registrations_count} registration(s) will be cancelled.`}
        confirmText={isDeleting ? 'Deleting...' : 'Delete Event'}
        cancelText="Cancel"
        confirmColor="#ef4444"
        icon="delete-forever"
      />
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 4,
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 8,
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
  collaborationSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  discussionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  discussionButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  discussionButtonSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  viewUsersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff1f2',
  },
  viewUsersText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fb7185',
  },
  // Team zone styles
  individualNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  individualNoticeText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
  },
  teamRegisterContainer: {
    gap: 10,
  },
  teamRegisterInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  teamRegisterInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: '500',
  },
  teamZoneContainer: {
    marginVertical: 16,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  teamZoneActions: {
    flexDirection: 'row',
    gap: 12,
  },
  teamZoneSecondaryActions: {
    gap: 8,
  },
  teamZonePrimaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  teamZonePrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  teamZoneSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  teamZoneSecondaryText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
  teamZoneActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
    marginBottom: 12,
  },
  teamZoneActionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1',
    flex: 1,
    marginLeft: 12,
  },
  deadlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  deadlineBannerText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '500',
    flex: 1,
  },
});
