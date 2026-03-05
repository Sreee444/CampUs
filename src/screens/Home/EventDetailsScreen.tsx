import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { EventStatus } from '../../components/CountdownTimer';
import { scheduleEventReminder, createEventReminder } from '../../api/eventReminders';
import Toast from 'react-native-toast-message';
import { isAdminRole } from '../../utils/roles';
import { LinearGradient } from 'expo-linear-gradient';
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import { createNotification } from '../../api/notifications';
import { loadMyTeamState, cancelJoinRequest, acceptInvite, rejectInvite } from '../../utils/teamActions';
import { evaluateEventEligibility } from '../../utils/eventEligibility';

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
  const [isHandlingInvite, setIsHandlingInvite] = useState(false);
  const [isLookingForTeam, setIsLookingForTeam] = useState(false);
  const [isTogglingLookingForTeam, setIsTogglingLookingForTeam] = useState(false);

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
              name,
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
      const scopedTeamName = scopedMembershipRes?.data?.team?.name ?? null;
      let teamMembersCount = 0;
      if (scopedTeamId) {
        const { count } = await (supabase as any)
          .from('event_team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', scopedTeamId)
          .eq('status', 'active');
        teamMembersCount = count ?? 0;
      }
      setTeamState({
        ...state,
        teamId: scopedTeamId,
        userTeamId: scopedTeamId,
        teamName: scopedTeamName,
        teamMembersCount,
        isInTeam: !!scopedTeamId,
      });

      // Load looking_for_team flag
      if (user?.id) {
        const { data: regRow } = await (supabase as any)
          .from('event_registrations')
          .select('looking_for_team')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .maybeSingle();
        setIsLookingForTeam(regRow?.looking_for_team ?? false);
      }
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
        .in('role', ['admin', 'developer']);

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

        if (!eligibility.isEligible) {
          throw new Error(eligibility.reason || 'You are not eligible to register for this event.');
        }

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

  const handleToggleLookingForTeam = async () => {
    if (!user?.id) return;
    try {
      setIsTogglingLookingForTeam(true);
      const next = !isLookingForTeam;
      await (supabase as any)
        .from('event_registrations')
        .update({ looking_for_team: next })
        .eq('event_id', eventId)
        .eq('user_id', user.id);
      setIsLookingForTeam(next);
      Toast.show({
        type: 'info',
        text1: next ? 'Marked as looking for a team' : 'Removed from looking for team',
      });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to update', text2: err?.message });
    } finally {
      setIsTogglingLookingForTeam(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!user?.id || !teamState?.receivedInvite?.id || !teamState?.receivedInvite?.team_id) return;
    try {
      setIsHandlingInvite(true);
      await acceptInvite({
        requestId: teamState.receivedInvite.id,
        teamId: teamState.receivedInvite.team_id,
        eventId,
        userId: user.id,
      });
      Toast.show({ type: 'success', text1: 'Invitation accepted' });
      await loadTeamStatus();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to accept invite', text2: err.message });
    } finally {
      setIsHandlingInvite(false);
    }
  };

  const handleRejectInvite = async () => {
    if (!teamState?.receivedInvite?.id) return;
    try {
      setIsHandlingInvite(true);
      await rejectInvite(teamState.receivedInvite.id);
      Toast.show({ type: 'info', text1: 'Invitation rejected' });
      await loadTeamStatus();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to reject invite', text2: err.message });
    } finally {
      setIsHandlingInvite(false);
    }
  };

  const handleCancelPendingJoinRequest = async () => {
    if (!user?.id || !teamState?.sentJoinRequest?.team_id) return;
    try {
      await cancelJoinRequest({
        teamId: teamState.sentJoinRequest.team_id,
        requesterId: user.id,
        eventId,
      });
      Toast.show({ type: 'info', text1: 'Request cancelled' });
      await loadTeamStatus();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to cancel request', text2: err.message });
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

  const eligibility = useMemo(() => {
    if (!event) return { isEligible: true, reason: undefined };
    return evaluateEventEligibility(
      {
        eligibility_type: (event as any)?.eligibility_type,
        eligible_departments: (event as any)?.eligible_departments,
        eligible_years: (event as any)?.eligible_years,
      },
      {
        department: profile?.department,
        year: profile?.year,
      }
    );
  }, [
    event?.eligibility_type,
    JSON.stringify(event?.eligible_departments || []),
    JSON.stringify(event?.eligible_years || []),
    profile?.department,
    profile?.year,
  ]);

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
  const registrationOpen = isUpcoming && new Date(event.registration_deadline) > now;
  const canRegister = registrationOpen && eligibility.isEligible;
  const isCreator = user?.id === event.created_by;
  const isAdmin = isAdminRole(profile?.role);
  const canManageEvent = isCreator || isAdmin;
  const eligibilityType = (event as any)?.eligibility_type || 'college';
  const eligibleDepartments = ((event as any)?.eligible_departments || []) as string[];
  const eligibleYears = (((event as any)?.eligible_years || []) as number[]).slice().sort((a, b) => a - b);
  const eligibilityText = eligibilityType === 'college' ? 'Open to all departments and years' : 'Restricted participation';

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#dff8f0', '#f2eefc']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.roundIconButton}>
            <MaterialIcons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitleMain} numberOfLines={1}>{event.title}</Text>
            <View style={styles.headerPills}>
              <View style={styles.headerTypePill}>
                <Text style={styles.headerTypePillText}>{event.event_type}</Text>
              </View>
              <View style={isUpcoming ? styles.headerUpcomingPill : styles.headerNeutralPill}>
                <Text style={isUpcoming ? styles.headerUpcomingText : styles.headerNeutralText}>
                  {isUpcoming ? 'Upcoming' : isLive ? 'Live' : 'Ended'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.roundIconButton}>
              <MaterialIcons name="share" size={22} color="#111827" />
            </TouchableOpacity>
            {canManageEvent && (
              <>
                <TouchableOpacity
                  style={[styles.roundIconButton, { backgroundColor: '#f3e8ff', marginRight: 8 }]}
                  onPress={() => navigation.navigate('EditEvent', { eventId })}
                >
                  <MaterialIcons name="edit" size={20} color="#a855f7" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roundIconButton, { backgroundColor: '#fee2e2' }]}
                  onPress={() => setShowDeleteConfirmation(true)}
                >
                  <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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

        {/* 1. Event Info Card */}
        <View style={styles.saasCard}>
          <View style={styles.eventHeader}>
            <EventStatus startDate={event.start_date} endDate={event.end_date} />
          </View>

          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.description}>{event.description}</Text>

          <View style={{ height: 12 }} />
          <View style={styles.detailRow}>
            <View style={[styles.iconBubble, { backgroundColor: '#e0f2fe' }]}>
              <MaterialIcons name="event" size={18} color="#0284c7" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailText}>{formatEventDate(event.start_date)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={[styles.iconBubble, { backgroundColor: '#ede9fe' }]}>
              <MaterialIcons name="schedule" size={18} color="#7c3aed" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailText}>{formatEventDate(event.end_date)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={[styles.iconBubble, { backgroundColor: '#fef3c7' }]}>
              <MaterialIcons
                name={event.is_online ? "laptop" : "location-on"}
                size={18}
                color="#b45309"
              />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{event.is_online ? "Meeting" : "Venue"}</Text>
              <Text style={styles.detailText}>{event.is_online ? "Online Event" : event.venue}</Text>
              {event.is_online && event.meeting_link && isLive && (
                <TouchableOpacity onPress={openMeetingLink}>
                  <Text style={styles.meetingLink}>Join Meeting</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={[styles.iconBubble, { backgroundColor: '#dcfce7' }]}>
              <MaterialIcons name="people" size={18} color="#16a34a" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Participants</Text>
              <Text style={styles.detailText}>
                {event.registrations_count} / {event.max_participants || 'Unlimited'} registered
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
                <MaterialIcons name="arrow-forward" size={16} color="#6366f1" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.detailRow}>
            <View style={[styles.iconBubble, { backgroundColor: '#ede9fe' }]}>
              <MaterialIcons name="verified-user" size={18} color="#6366f1" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Eligibility</Text>
              <Text style={styles.detailText}>{eligibilityText}</Text>
              <Text style={styles.metaText}>
                Departments: {eligibleDepartments.length ? eligibleDepartments.join(', ') : 'All'}
              </Text>
              <Text style={styles.metaText}>
                Years: {eligibleYears.length ? eligibleYears.map((y) => `Year ${y}`).join(', ') : 'All'}
              </Text>
            </View>
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
            <View style={[styles.iconBubble, { backgroundColor: '#ffe4e6' }]}>
              <MaterialIcons name="person" size={18} color="#e11d48" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Organizer</Text>
              <Text style={styles.detailText}>{event.organizer_profile?.full_name || 'Campus Team'}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* 2. Registration Card */}
        <View style={styles.saasCard}>
          <Text style={styles.sectionTitle}>Registration</Text>
          {event.is_registered ? (
            <>
              <View style={styles.registeredPill}>
                <MaterialIcons name="check-circle" size={18} color="#16a34a" />
                <Text style={styles.registeredText}>Registered Successfully</Text>
              </View>
              <TouchableOpacity
                style={[styles.outlineDangerButton, styles.roundButton, isRegistering && styles.registerButtonDisabled]}
                onPress={() => setShowUnregisterConfirmation(true)}
                disabled={isRegistering}
              >
                <Text style={styles.outlineDangerButtonText}>
                  {isRegistering ? 'Unregistering...' : 'Unregister'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, styles.roundButton, (!canRegister || isRegistering) && styles.registerButtonDisabled]}
                onPress={() => setShowRegisterConfirmation(true)}
                disabled={!canRegister || isRegistering}
              >
                <Text style={styles.primaryButtonText}>
                  {isRegistering ? 'Registering...' : canRegister ? 'Register for Event' : "Can't Register"}
                </Text>
              </TouchableOpacity>
              {!canRegister && (
                <Text style={styles.metaText}>
                  {!registrationOpen
                    ? 'Registration is closed for this event.'
                    : (eligibility.reason || 'You are not eligible for this event.')}
                </Text>
              )}
            </>
          )}
          <Text style={styles.metaText}>
            Registration deadline: {new Date(event.registration_deadline).toLocaleDateString()}
          </Text>
        </View>

        {/* 3. Team Participation Card */}
        {(event as any)?.participation_type === 'team' && event.is_registered && (
          <View style={styles.saasCard}>
            {isCheckingTeam ? (
              <View style={styles.loadingInline}>
                <ActivityIndicator size="small" color="#6366f1" />
              </View>
            ) : teamState?.isInTeam ? (
              <>
                <Text style={styles.sectionTitle}>Team Participation</Text>
                <Text style={styles.metaTitle}>Your Team</Text>
                <Text style={styles.metaTitle}>{teamState?.teamName || 'Team joined'}</Text>
                <Text style={styles.metaText}>{teamState?.teamMembersCount ?? 0} members</Text>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.roundButton]}
                  onPress={() => navigation.navigate('TeamDetails', { teamId: teamState?.teamId, eventId })}
                >
                  <Text style={styles.primaryButtonText}>View My Team</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                >
                  <Text style={styles.ghostButtonText}>Browse Members</Text>
                </TouchableOpacity>
              </>
            ) : teamState?.hasReceivedInvite ? (
              <>
                <Text style={styles.sectionTitle}>Team Participation</Text>
                <View style={styles.inviteHighlight}>
                  <Text style={styles.metaText}>You have a team invitation</Text>
                </View>
                <View style={styles.inlineButtons}>
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.roundButton, styles.inlineButton, isHandlingInvite && styles.registerButtonDisabled]}
                    onPress={handleAcceptInvite}
                    disabled={isHandlingInvite}
                  >
                    <Text style={styles.primaryButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.outlineButton, styles.roundButton, styles.inlineButton, isHandlingInvite && styles.registerButtonDisabled]}
                    onPress={handleRejectInvite}
                    disabled={isHandlingInvite}
                  >
                    <Text style={styles.outlineButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                >
                  <Text style={styles.ghostButtonText}>Browse Members</Text>
                </TouchableOpacity>
              </>
            ) : teamState?.hasSentJoinRequest ? (
              <>
                <Text style={styles.sectionTitle}>Team Participation</Text>
                <Text style={styles.metaText}>Join request pending approval</Text>
                <TouchableOpacity style={[styles.outlineButton, styles.roundButton]} onPress={handleCancelPendingJoinRequest}>
                  <Text style={styles.outlineButtonText}>Cancel Request</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                >
                  <Text style={styles.ghostButtonText}>Browse Members</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Team Participation</Text>
                <Text style={styles.metaText}>You are not in a team yet.</Text>
                {/* Looking for a team toggle */}
                <TouchableOpacity
                  style={[
                    styles.outlineButton,
                    styles.roundButton,
                    {
                      flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
                      borderColor: isLookingForTeam ? '#16a34a' : '#6366f1',
                      marginBottom: 8
                    },
                    isTogglingLookingForTeam && styles.registerButtonDisabled,
                  ]}
                  onPress={handleToggleLookingForTeam}
                  disabled={isTogglingLookingForTeam}
                >
                  <MaterialIcons
                    name={isLookingForTeam ? 'group' : 'group-add'}
                    size={18}
                    color={isLookingForTeam ? '#16a34a' : '#6366f1'}
                  />
                  <Text style={[styles.outlineButtonText, { color: isLookingForTeam ? '#16a34a' : '#6366f1' }]}>
                    {isTogglingLookingForTeam
                      ? 'Updating...'
                      : isLookingForTeam
                        ? '✓ Looking for a Team'
                        : 'Mark as Looking for a Team'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.buttonStack}>
                  <TouchableOpacity style={[styles.primaryButton, styles.roundButton]} onPress={() => handleRegisterAndNavigate('CreateTeam')}>
                    <Text style={styles.primaryButtonText}>Create Team</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.outlineButton, styles.roundButton]} onPress={() => handleRegisterAndNavigate('JoinTeam')}>
                    <Text style={styles.outlineButtonText}>Join via Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ghostButton} onPress={() => navigation.navigate('BrowseTeams', { eventId })}>
                    <Text style={styles.ghostButtonText}>Browse Teams</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ghostButton}
                    onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                  >
                    <Text style={styles.ghostButtonText}>Browse Members</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* 4. Discussion Card */}
        <View style={styles.saasCard}>
          <TouchableOpacity
            style={styles.discussionButton}
            onPress={() => navigation.navigate('EventDiscussion', { eventId })}
          >
            <MaterialIcons name="forum" size={20} color="#6366f1" />
            <View style={{ flex: 1 }}>
              <Text style={styles.discussionButtonTitle}>Event Discussion</Text>
              <Text style={styles.discussionButtonSubtitle}>
                {isUpcoming ? 'Ask questions & prepare' : 'Share feedback and learnings'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9ca3b8" />
          </TouchableOpacity>
        </View>
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
    backgroundColor: '#f5f4f2',
  },
  gradientHeader: {
    paddingTop: 8,
    paddingBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  headerTitleMain: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerPills: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  headerTypePill: {
    backgroundColor: '#ede9fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerTypePillText: {
    color: '#6d28d9',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  headerUpcomingPill: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerUpcomingText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
  },
  headerNeutralPill: {
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerNeutralText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  roundIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 20,
  },
  saasCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 10,
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
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
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
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
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
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 12,
  },
  metaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  registeredText: {
    color: '#16a34a',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 0,
  },
  registeredPill: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  buttonStack: {
    gap: 12,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineButton: {
    flex: 1,
  },
  inviteHighlight: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 12,
  },
  loadingInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  primaryButton: {
    backgroundColor: '#13ecec',
    borderRadius: 28,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#062b2b',
    fontSize: 15,
    fontWeight: '700',
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderRadius: 28,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  outlineButtonText: {
    color: '#6366f1',
    fontSize: 15,
    fontWeight: '700',
  },
  outlineDangerButton: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    borderRadius: 28,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  outlineDangerButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
  ghostButton: {
    paddingVertical: 4,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    color: '#6366f1',
    fontWeight: '600',
    fontSize: 14,
  },
  description: {
    fontSize: 15,
    color: '#4b5563',
    lineHeight: 24,
    marginBottom: 4,
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
  roundButton: {
    borderRadius: 28,
    height: 52,
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
    height: 210,
    marginBottom: 18,
    borderRadius: 20,
    overflow: 'hidden',
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
    backgroundColor: '#f8faff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e0e7ff',
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
    backgroundColor: '#eef2ff',
  },
  viewUsersText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
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

