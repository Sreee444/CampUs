import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import { createNotification } from '../../api/notifications';
import { loadMyTeamState, cancelJoinRequest, acceptInvite, rejectInvite } from '../../utils/teamActions';
import { evaluateEventEligibility } from '../../utils/eventEligibility';

type Nav = StackNavigationProp<RootStackParamList, 'EventDetails'>;
type Route = RouteProp<RootStackParamList, 'EventDetails'>;

interface EventDetails {
  id: string;
  title: string;
  description: string;
  event_type: string;
  start_date: string;
  end_date: string;
  registration_deadline: string;
  venue: string;
  is_online: boolean;
  meeting_link?: string;
  max_participants: number;
  banner_image?: string;
  created_by: string;
  organizers?: string[];
  is_registered?: boolean;
  registrations_count: number;
  organizer_profile?: { full_name: string };
}

export default function EventDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user, profile } = useAuth();
  const eventId = route.params?.eventId;

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [showUnregisterConfirm, setShowUnregisterConfirm] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  // Team state
  const [teamState, setTeamState] = useState<any>(null);
  const [isCheckingTeam, setIsCheckingTeam] = useState(false);
  const [isLookingForTeam, setIsLookingForTeam] = useState(false);
  const [isTogglingLooking, setIsTogglingLooking] = useState(false);
  const [isHandlingInvite, setIsHandlingInvite] = useState(false);

  // Scroll animation for collapsing header
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  /* ─── DATA LOADING ─── */
  const loadEventDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: ev, error } = await supabase
        .from('events')
        .select('*, organizer_profile:profiles!events_created_by_fkey(full_name), organizers')
        .eq('id', eventId)
        .single();
      if (error) throw error;

      if (user) {
        const { data: reg } = await supabase
          .from('event_registrations')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .eq('status', 'registered')
          .maybeSingle();
        (ev as any).is_registered = !!reg;
      }
      const { count } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'registered');
      (ev as any).registrations_count = count || 0;
      setEvent(ev as any);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to load event' });
    } finally {
      setIsLoading(false);
    }
  }, [eventId, user]);

  const loadTeamStatus = useCallback(async () => {
    if (!user || !event?.is_registered || (event as any)?.participation_type !== 'team') return;
    try {
      setIsCheckingTeam(true);
      const state = await loadMyTeamState(eventId, user.id);
      setTeamState(state);

      const { data: memberData } = await supabase
        .from('event_team_members')
        .select('team_id, event_teams!inner(event_id, name)')
        .eq('user_id', user.id)
        .eq('event_teams.event_id', eventId)
        .limit(1) as any;

      if (memberData && memberData.length > 0) {
        const teamId = memberData[0].team_id;
        const teamName = memberData[0].event_teams?.name || 'Your Team';
        
        // Fetch actual member count
        const { count: memberCount } = await supabase
          .from('event_team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId);
        
        setTeamState((p: any) => ({
          ...p,
          isInTeam: true,
          teamId,
          teamName,
          teamMembersCount: memberCount || 0
        }));
      }

      const { data: regRow } = await supabase
        .from('event_registrations')
        .select('looking_for_team')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'registered')
        .maybeSingle() as any;
      setIsLookingForTeam(regRow?.looking_for_team === true);
    } catch (err) {
      console.error('Error loading team status:', err);
    } finally {
      setIsCheckingTeam(false);
    }
  }, [user, event?.is_registered, eventId]);

  useFocusEffect(useCallback(() => { loadEventDetails(); }, [loadEventDetails]));
  useEffect(() => { if (event) loadTeamStatus(); }, [event?.is_registered, loadTeamStatus]);

  /* ─── TEAM CLEANUP ─── */
  const cleanupTeamOnEventLeave = async () => {
    if (!user) return;
    try {
      const { data: membership } = await supabase
        .from('event_team_members')
        .select('id, role, team_id, event_teams!inner(event_id)')
        .eq('user_id', user.id)
        .eq('event_teams.event_id', eventId)
        .limit(1) as any;
      if (!membership || membership.length === 0) return;
      const { role, team_id } = membership[0];
      await supabase.from('event_team_members').delete().eq('user_id', user.id).eq('team_id', team_id);
      if (role === 'leader') {
        const { data: remaining } = await supabase
          .from('event_team_members').select('user_id').eq('team_id', team_id) as any;
        if (!remaining || remaining.length === 0) {
          await supabase.from('event_teams').delete().eq('id', team_id);
        } else {
          await (supabase.from('event_team_members') as any)
            .update({ role: 'leader' }).eq('team_id', team_id).eq('user_id', remaining[0].user_id);
        }
      }
    } catch (err) { console.error('Error cleaning up team on leave:', err); }
  };

  /* ─── NOTIFICATIONS ─── */
  const notifyAdmins = async (body: string) => {
    try {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin', 'developer']) as any;
      if (admins) {
        for (const a of admins) {
          await createNotification({ user_id: a.id, type: 'event', title: 'Event Registration', body });
        }
      }
    } catch (err) { console.error('Error notifying admins:', err); }
  };

  /* ─── REGISTRATION ─── */
  const handleRegistration = async () => {
    if (!user || !event) return;
    try {
      setIsRegistering(true);
      if (event.is_registered) {
        await cleanupTeamOnEventLeave();
        await (supabase.from('event_registrations') as any)
          .update({ status: 'cancelled' }).eq('event_id', eventId).eq('user_id', user.id);
        Toast.show({ type: 'success', text1: 'Unregistered from event' });
        await notifyAdmins((profile as any)?.full_name + ' unregistered from ' + event.title);
      } else {
        await (supabase.from('event_registrations') as any).upsert(
          { event_id: eventId, user_id: user.id, status: 'registered' },
          { onConflict: 'event_id,user_id' }
        );
        Toast.show({ type: 'success', text1: 'Registered for event!' });
        await notifyAdmins((profile as any)?.full_name + ' registered for ' + event.title);
        try {
          const reminder = await createEventReminder(eventId, user.id, 60);
          if (reminder) await scheduleEventReminder(eventId, event.title, event.start_date, 60);
        } catch {}
      }
      setShowRegisterConfirm(false);
      setShowUnregisterConfirm(false);
      await loadEventDetails();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Registration failed', text2: err.message });
    } finally { setIsRegistering(false); }
  };

  const handleToggleLooking = async () => {
    if (!user) return;
    try {
      setIsTogglingLooking(true);
      const v = !isLookingForTeam;
      await (supabase.from('event_registrations') as any)
        .update({ looking_for_team: v }).eq('event_id', eventId).eq('user_id', user.id);
      setIsLookingForTeam(v);
      Toast.show({ type: 'success', text1: v ? 'Marked as looking for a team' : 'Status removed' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to update', text2: err.message });
    } finally { setIsTogglingLooking(false); }
  };

  const handleAcceptInvite = async () => {
    if (!user || !teamState?.receivedInvite?.id) return;
    try {
      setIsHandlingInvite(true);
      await acceptInvite({
        requestId: teamState.receivedInvite.id,
        teamId: teamState.receivedInvite.team_id,
        eventId,
        userId: user.id,
      });
      Toast.show({ type: 'success', text1: 'Invitation accepted!' });
      await loadTeamStatus();
      await loadEventDetails();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to accept invite', text2: err.message });
    } finally { setIsHandlingInvite(false); }
  };

  const handleRejectInvite = async () => {
    if (!user || !teamState?.receivedInvite?.id) return;
    try {
      setIsHandlingInvite(true);
      await rejectInvite(teamState.receivedInvite.id);
      Toast.show({ type: 'success', text1: 'Invitation rejected' });
      await loadTeamStatus();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to reject invite', text2: err.message });
    } finally { setIsHandlingInvite(false); }
  };

  const handleCancelJoinRequest = async () => {
    if (!user || !teamState?.sentJoinRequest) return;
    try {
      await cancelJoinRequest({
        teamId: teamState.sentJoinRequest.team_id,
        requesterId: user.id,
        eventId,
      });
      Toast.show({ type: 'success', text1: 'Request cancelled' });
      await loadTeamStatus();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to cancel request', text2: err.message });
    }
  };

  const handleNavigateTeam = (screen: 'CreateTeam' | 'JoinTeam') => {
    navigation.navigate(screen as any, { eventId, requiredRoles: (event as any)?.required_roles ?? [] });
  };

  const openMeetingLink = () => {
    if (event?.meeting_link) {
      const { Linking } = require('react-native');
      Linking.openURL(event.meeting_link);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event) return;
    try {
      setIsDeleting(true);
      await supabase.from('event_registrations').delete().eq('event_id', eventId);
      await supabase.from('event_reminders').delete().eq('event_id', eventId);
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Event deleted' });
      navigation.goBack();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to delete event', text2: err.message });
    } finally { setIsDeleting(false); setShowDeleteConfirm(false); }
  };

  /* ─── HELPERS ─── */
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });
  const getDaysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

  const eligibility = useMemo(() => {
    if (!event || !profile) return { isEligible: true, reason: '' };
    return evaluateEventEligibility(event as any, profile as any);
  }, [event, profile]);

  /* ─── LOADING STATE ─── */
  if (isLoading || !event) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={s.navBar}>
          <View style={s.navInner}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.navBtn}>
              <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
            </TouchableOpacity>
            <View style={s.navCenter}>
              <Text style={s.navTitle}>Event Details</Text>
            </View>
            <View style={s.navBtn} />
          </View>
        </View>
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      </View>
    );
  }

  /* ─── COMPUTED ─── */
  const now = new Date();
  const start = new Date(event.start_date);
  const end = new Date(event.end_date);
  const isUpcoming = start > now;
  const isLive = start <= now && end >= now;
  const isEnded = end < now;
  const regOpen = new Date(event.registration_deadline) > now;
  const canRegister = regOpen && eligibility.isEligible && !isEnded &&
    (!event.max_participants || event.registrations_count < event.max_participants);
  const isCreator = user?.id === event.created_by;
  const isEventLead = !!user?.id && Array.isArray(event.organizers) && event.organizers.includes(user.id);
  const canViewRegistrations = isCreator || isEventLead || isAdminRole((profile as any)?.role);
  const canManage = isCreator || isAdminRole((profile as any)?.role);
  const eligType = (event as any)?.eligibility_type || 'college';
  const eligDepts = ((event as any)?.eligible_departments || []) as string[];
  const eligYears = (((event as any)?.eligible_years || []) as number[]).slice().sort((a: number, b: number) => a - b);
  const eligText = eligType === 'college' ? 'Open to all' : 'Restricted';
  const statusLabel = isUpcoming ? 'Upcoming' : isLive ? 'Live Now' : 'Ended';
  const statusColor = isUpcoming ? '#4f46e5' : isLive ? '#dc2626' : '#6b7280';
  const days = getDaysUntil(event.start_date);

  /* ─── 3-DOT MENU ─── */
  const menuItems = [
    { icon: 'share' as const, label: 'Share', onPress: () => setMenuVisible(false) },
    ...(canManage ? [
      { icon: 'edit' as const, label: 'Edit Event', onPress: () => { setMenuVisible(false); navigation.navigate('EditEvent', { eventId }); } },
      { icon: 'delete-outline' as const, label: 'Delete Event', onPress: () => { setMenuVisible(false); setShowDeleteConfirm(true); }, danger: true },
    ] : []),
  ];

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* ── FIXED NAVBAR ── */}
      <View style={s.navBar}>
        <View style={s.navInner}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.navBtn} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <View style={s.navCenter}>
            <Animated.Text style={[s.navTitle, { opacity: headerOpacity }]} numberOfLines={1}>
              {event.title}
            </Animated.Text>
          </View>
          <TouchableOpacity style={s.navBtn} onPress={() => setMenuVisible(true)} activeOpacity={0.7}>
            <MaterialIcons name="more-vert" size={24} color="#1f2937" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 3-DOT MENU MODAL ── */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={s.menuCard}>
            {menuItems.map((item, i) => (
              <TouchableOpacity key={i} style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <MaterialIcons name={item.icon} size={20} color={(item as any).danger ? '#ef4444' : '#374151'} />
                <Text style={[s.menuLabel, (item as any).danger && { color: '#ef4444' }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── SCROLLABLE CONTENT ── */}
      <Animated.ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        {/* Banner */}
        {event.banner_image ? (
          <View style={s.banner}>
            <Image source={{ uri: event.banner_image }} style={s.bannerImg} resizeMode="cover" />
          </View>
        ) : null}

        {/* Title Block */}
        <View style={s.titleWrap}>
          <Text style={s.eventTitle}>{event.title}</Text>
          <View style={s.pillRow}>
            <View style={[s.pill, { backgroundColor: statusColor + '18' }]}>
              {isLive && <View style={s.liveDot} />}
              <Text style={[s.pillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <View style={[s.pill, { backgroundColor: '#f0fdf4' }]}>
              <Text style={[s.pillText, { color: '#10b981' }]}>{event.event_type}</Text>
            </View>
            {(event as any)?.participation_type === 'team' && (
              <View style={[s.pill, { backgroundColor: '#f3e8ff' }]}>
                <MaterialIcons name="groups" size={12} color="#7c3aed" />
                <Text style={[s.pillText, { color: '#7c3aed' }]}>Team</Text>
              </View>
            )}
          </View>
          {isUpcoming && days > 0 && days <= 7 && (
            <View style={s.countdownRow}>
              <MaterialIcons name="timer" size={16} color="#4f46e5" />
              <Text style={s.countdown}>Starts in {days} day{days !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {/* About */}
        {event.description ? (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <View style={[s.headerIconCircle, { backgroundColor: '#fef3c7' }]}>
                <MaterialIcons name="description" size={16} color="#f59e0b" />
              </View>
              <Text style={s.cardHeaderText}>About</Text>
            </View>
            <Text style={s.bodyText}>{event.description}</Text>
          </View>
        ) : null}

        {/* Details */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={[s.headerIconCircle, { backgroundColor: '#eef2ff' }]}>
              <MaterialIcons name="info-outline" size={16} color="#4f46e5" />
            </View>
            <Text style={s.cardHeaderText}>Details</Text>
          </View>

          <InfoRow icon="calendar-today" label="Date" value={fmtDate(event.start_date)} iconColor="#4f46e5" iconBg="#eef2ff" />
          <InfoRow icon="schedule" label="Time" value={fmtTime(event.start_date) + ' — ' + fmtTime(event.end_date)} iconColor="#f59e0b" iconBg="#fef3c7" />
          <InfoRow
            icon={event.is_online ? 'laptop' : 'location-on'}
            label={event.is_online ? 'Mode' : 'Venue'}
            value={event.is_online ? 'Online' : (event.venue || 'TBA')}
            iconColor="#ef4444" iconBg="#fef2f2"
          >
            {event.is_online && event.meeting_link && isLive && (
              <TouchableOpacity onPress={openMeetingLink}>
                <Text style={s.link}>Join Meeting →</Text>
              </TouchableOpacity>
            )}
          </InfoRow>
          <InfoRow icon="people" label="Participants" value={event.registrations_count + ' / ' + (event.max_participants || '∞')} iconColor="#3b82f6" iconBg="#dbeafe">
            {canViewRegistrations && event.registrations_count > 0 && (
              <TouchableOpacity
                style={s.chipBtn}
                onPress={() => navigation.navigate('EventRegisteredUsers', { eventId, eventTitle: event.title })}
              >
                <Text style={s.chipBtnText}>View All →</Text>
              </TouchableOpacity>
            )}
          </InfoRow>
          <InfoRow icon="verified-user" label="Eligibility" value={eligText} iconColor="#10b981" iconBg="#d1fae5">
            {eligType !== 'college' && (
              <Text style={s.meta}>
                {eligDepts.length ? 'Depts: ' + eligDepts.join(', ') : ''}{eligDepts.length && eligYears.length ? ' · ' : ''}
                {eligYears.length ? 'Years: ' + eligYears.join(', ') : ''}
              </Text>
            )}
          </InfoRow>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => event.created_by && navigation.navigate('PublicProfile', { userId: event.created_by })}
          >
            <InfoRow icon="person" label="Organizer" value={event.organizer_profile?.full_name || 'Campus Team'} chevron iconColor="#ec4899" iconBg="#fce7f3" />
          </TouchableOpacity>
        </View>

        {/* Registration */}
        <View style={s.registrationCard}>
          <View style={s.cardHeaderRow}>
            <MaterialIcons name="how-to-reg" size={20} color="#10b981" />
            <Text style={s.cardHeader}>Registration</Text>
          </View>
          
          {event.is_registered ? (
            <>
              <LinearGradient
                colors={['#d1fae5', '#ecfdf5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.successCard}
              >
                <View style={s.successIconCircle}>
                  <MaterialIcons name="check-circle" size={24} color="#10b981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.successTitle}>Registered Successfully!</Text>
                  <Text style={s.successSubtext}>You're all set for this event</Text>
                </View>
              </LinearGradient>
              <TouchableOpacity
                style={[s.btnDangerOutline, isRegistering && s.btnOff]}
                onPress={() => setShowUnregisterConfirm(true)}
                disabled={isRegistering}
              >
                <MaterialIcons name="cancel" size={18} color="#ef4444" />
                <Text style={s.btnDangerOutlineText}>{isRegistering ? 'Processing...' : 'Unregister'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[s.btnRegister, (!canRegister || isRegistering) && s.btnOff]}
                onPress={() => setShowRegisterConfirm(true)}
                disabled={!canRegister || isRegistering}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={canRegister ? ['#10b981', '#059669'] : ['#9ca3af', '#6b7280']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.btnGradient}
                >
                  <MaterialIcons name="event-available" size={20} color="#fff" />
                  <Text style={s.btnFillText}>
                    {isRegistering ? 'Processing...' : canRegister ? 'Register Now' : "Can't Register"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              {!canRegister && (
                <View style={s.warningBox}>
                  <MaterialIcons name="info-outline" size={16} color="#f59e0b" />
                  <Text style={s.warningText}>
                    {!regOpen ? 'Registration closed.' : (eligibility.reason || 'Not eligible for this event.')}
                  </Text>
                </View>
              )}
            </>
          )}
          
          <View style={s.deadlineRow}>
            <View style={s.deadlineIconCircle}>
              <MaterialIcons name="event" size={16} color="#f59e0b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.deadlineLabel}>Registration Deadline</Text>
              <Text style={s.deadlineValue}>{fmtDate(event.registration_deadline)}</Text>
            </View>
          </View>
          
          <View style={s.deadlineRow}>
            <View style={s.startIconCircle}>
              <MaterialIcons name="play-circle-outline" size={16} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.deadlineLabel}>Event Starts</Text>
              <Text style={s.deadlineValue}>{fmtDate(event.start_date)} • {fmtTime(event.start_date)}</Text>
            </View>
          </View>
        </View>

        {/* Team Participation */}
        {(event as any)?.participation_type === 'team' && event.is_registered && (
          <View style={s.teamCard}>
            <View style={s.cardHeaderRow}>
              <MaterialIcons name="groups" size={20} color="#7c3aed" />
              <Text style={s.cardHeader}>Team Participation</Text>
            </View>
            {isCheckingTeam ? (
              <ActivityIndicator size="small" color="#7c3aed" style={{ marginVertical: 12 }} />
            ) : teamState?.isInTeam ? (
              <View style={s.sectionGap}>
                <LinearGradient
                  colors={['#f5f3ff', '#faf5ff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.teamInfoCard}
                >
                  <View style={s.teamAvaLarge}>
                    <MaterialIcons name="groups" size={28} color="#7c3aed" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.teamNameLarge}>{teamState?.teamName || 'Your Team'}</Text>
                    <View style={s.teamMetaRow}>
                      <MaterialIcons name="people" size={14} color="#8b5cf6" />
                      <Text style={s.teamMeta}>{teamState?.teamMembersCount ?? 0} members</Text>
                    </View>
                  </View>
                </LinearGradient>
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => navigation.navigate('TeamDetails', { teamId: teamState?.teamId, eventId })}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#7c3aed', '#6d28d9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.btnGradient}
                  >
                    <MaterialIcons name="visibility" size={18} color="#fff" />
                    <Text style={s.btnPrimaryText}>View My Team</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <View style={s.actionGridSmall}>
                  <TouchableOpacity
                    style={s.btnSecondary}
                    onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="people-outline" size={18} color="#7c3aed" />
                    <Text style={s.btnSecondaryText}>Browse Members</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.btnSecondary}
                    onPress={() => navigation.navigate('BrowseTeams', { eventId })}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="search" size={18} color="#7c3aed" />
                    <Text style={s.btnSecondaryText}>Browse Teams</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : teamState?.hasReceivedInvite ? (
              <View style={s.sectionGap}>
                <LinearGradient
                  colors={['#dbeafe', '#eff6ff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.inviteBanner}
                >
                  <View style={s.inviteIcon}>
                    <MaterialIcons name="mail" size={18} color="#3b82f6" />
                  </View>
                  <Text style={s.inviteBannerText}>You have a team invitation!</Text>
                </LinearGradient>
                <View style={s.rowBtns}>
                  <TouchableOpacity
                    style={[s.btnAccept, isHandlingInvite && s.btnOff]}
                    onPress={handleAcceptInvite}
                    disabled={isHandlingInvite}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#10b981', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.btnGradientSmall}
                    >
                      <MaterialIcons name="check" size={18} color="#fff" />
                      <Text style={s.btnAcceptText}>Accept</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnDecline, { flex: 1 }, isHandlingInvite && s.btnOff]}
                    onPress={handleRejectInvite}
                    disabled={isHandlingInvite}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={18} color="#ef4444" />
                    <Text style={s.btnDeclineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : teamState?.hasSentJoinRequest ? (
              <View style={s.sectionGap}>
                <LinearGradient
                  colors={['#fef3c7', '#fef9e7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.pendingBanner}
                >
                  <View style={s.pendingIcon}>
                    <MaterialIcons name="hourglass-empty" size={18} color="#f59e0b" />
                  </View>
                  <Text style={s.pendingBannerText}>Join request pending approval</Text>
                </LinearGradient>
                <TouchableOpacity style={s.btnCancel} onPress={handleCancelJoinRequest} activeOpacity={0.8}>
                  <Text style={s.btnCancelText}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.sectionGap}>
                <TouchableOpacity
                  style={[s.lookingBtn, isLookingForTeam && s.lookingActive, isTogglingLooking && s.btnOff]}
                  onPress={handleToggleLooking}
                  disabled={isTogglingLooking}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={isLookingForTeam ? ['#d1fae5', '#ecfdf5'] : ['#f5f3ff', '#faf5ff']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.lookingGradient}
                  >
                    <MaterialIcons
                      name={isLookingForTeam ? 'check-circle' : 'group-add'}
                      size={20}
                      color={isLookingForTeam ? '#10b981' : '#7c3aed'}
                    />
                    <Text style={[s.lookingText, isLookingForTeam && { color: '#10b981' }]}>
                      {isTogglingLooking ? 'Updating...' : isLookingForTeam ? 'Looking for Team ✨' : 'Mark as Looking for Team'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <View style={s.actionGrid}>
                  <TouchableOpacity 
                    style={s.actionCard} 
                    onPress={() => handleNavigateTeam('CreateTeam')}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#7c3aed', '#6d28d9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.actionCardGradient}
                    >
                      <View style={s.actionIconCircle}>
                        <MaterialIcons name="add-circle" size={24} color="#fff" />
                      </View>
                      <Text style={s.actionCardTitle}>Create Team</Text>
                      <Text style={s.actionCardDesc}>Start your own</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={s.actionCard} 
                    onPress={() => handleNavigateTeam('JoinTeam')}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#3b82f6', '#2563eb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.actionCardGradient}
                    >
                      <View style={s.actionIconCircle}>
                        <MaterialIcons name="vpn-key" size={24} color="#fff" />
                      </View>
                      <Text style={s.actionCardTitle}>Join via Code</Text>
                      <Text style={s.actionCardDesc}>Enter code</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                <View style={s.actionGrid}>
                  <TouchableOpacity 
                    style={s.actionCard} 
                    onPress={() => navigation.navigate('BrowseTeams', { eventId })}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#10b981', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.actionCardGradient}
                    >
                      <View style={s.actionIconCircle}>
                        <MaterialIcons name="search" size={24} color="#fff" />
                      </View>
                      <Text style={s.actionCardTitle}>Browse Teams</Text>
                      <Text style={s.actionCardDesc}>Find & join</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={s.actionCard}
                    onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#f59e0b', '#d97706']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.actionCardGradient}
                    >
                      <View style={s.actionIconCircle}>
                        <MaterialIcons name="people" size={24} color="#fff" />
                      </View>
                      <Text style={s.actionCardTitle}>Browse Members</Text>
                      <Text style={s.actionCardDesc}>Connect</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Discussion */}
        <TouchableOpacity
          style={s.discussionCard}
          onPress={() => navigation.navigate('EventDiscussion', { eventId })}
          activeOpacity={0.7}
        >
          <View style={s.discussionIcon}>
            <MaterialIcons name="forum" size={18} color="#4f46e5" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.discussionLabel}>Event Discussion</Text>
            <Text style={s.meta}>{isUpcoming ? 'Ask questions & prepare' : 'Share feedback'}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#d1d5db" />
        </TouchableOpacity>
      </Animated.ScrollView>

      {/* ── CONFIRM SHEETS ── */}
      <ConfirmBottomSheet
        visible={showRegisterConfirm}
        onClose={() => setShowRegisterConfirm(false)}
        onConfirm={handleRegistration}
        title="Confirm Registration"
        message={'Register for ' + event.title + '? You will get a reminder 1 hr before.'}
        confirmText={isRegistering ? 'Processing...' : 'Register'}
        cancelText="Cancel"
        confirmColor="#4f46e5"
        icon="event-available"
      />
      <ConfirmBottomSheet
        visible={showUnregisterConfirm}
        onClose={() => setShowUnregisterConfirm(false)}
        onConfirm={handleRegistration}
        title="Unregister?"
        message={'Leave ' + event.title + '? Your spot will open up for others.'}
        confirmText={isRegistering ? 'Processing...' : 'Unregister'}
        cancelText="Keep"
        confirmColor="#ef4444"
        icon="cancel"
      />
      <ConfirmBottomSheet
        visible={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteEvent}
        title="Delete Event?"
        message={'Delete "' + event.title + '"? This cannot be undone. ' + event.registrations_count + ' registration(s) will be cancelled.'}
        confirmText={isDeleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        confirmColor="#ef4444"
        icon="delete-forever"
      />
    </View>
  );
}

/* ─── INFO ROW COMPONENT ─── */
function InfoRow({ icon, label, value, chevron, children, iconColor, iconBg }: {
  icon: string; label: string; value: string; chevron?: boolean; children?: React.ReactNode;
  iconColor?: string; iconBg?: string;
}) {
  return (
    <View style={s.infoRow}>
      <View style={[s.infoIcon, iconBg ? { backgroundColor: iconBg } : null]}>
        <MaterialIcons name={icon as any} size={17} color={iconColor || '#4f46e5'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoVal}>{value}</Text>
        {children}
      </View>
      {chevron && <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />}
    </View>
  );
}

/* ─── STYLES ─── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Nav - proper fixed at top */
  navBar: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24),
  },
  navInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 8,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
  },

  /* 3-dot menu */
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 100 : 56,
    paddingRight: 16,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 180,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#374151' },

  /* Scroll & Banner */
  scroll: { flex: 1 },
  banner: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  bannerImg: { width: '100%', height: '100%' },

  /* Title */
  titleWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: '#4f46e5', textTransform: 'capitalize' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#dc2626' },
  eventTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  countdown: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },

  /* Cards */
  card: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  headerIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    letterSpacing: 0.1,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    letterSpacing: 0.1,
  },
  bodyText: { fontSize: 14, color: '#4b5563', lineHeight: 22 },

  /* Info rows */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  infoVal: { fontSize: 14, fontWeight: '500', color: '#111827' },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  link: { fontSize: 13, fontWeight: '600', color: '#4f46e5', marginTop: 4 },
  chipBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  chipBtnText: { fontSize: 12, fontWeight: '600', color: '#4f46e5' },

  /* Registration - Enhanced */
  registrationCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#86efac',
    marginBottom: 12,
  },
  successIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 2,
  },
  successSubtext: {
    fontSize: 13,
    fontWeight: '500',
    color: '#059669',
  },
  btnRegister: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 52,
    marginBottom: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#92400e',
    flex: 1,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginTop: 8,
  },
  deadlineIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  deadlineValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  successChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  successChipText: { fontSize: 13, fontWeight: '600', color: '#16a34a' },
  helper: { fontSize: 12, color: '#9ca3af', marginTop: 8 },

  /* Buttons */
  btnFill: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFillText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnOutline: {
    borderWidth: 1.5,
    borderColor: '#c7d2fe',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  btnOutlineText: { color: '#4f46e5', fontSize: 15, fontWeight: '600' },
  btnDangerOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: 12,
    height: 48,
    backgroundColor: '#fef2f2',
  },
  btnDangerOutlineText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  btnGhost: { paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: '#4f46e5', fontWeight: '600', fontSize: 14 },
  btnOff: { opacity: 0.5 },

  /* Team section - NEW ENHANCED STYLES */
  teamCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  sectionGap: { gap: 12 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  teamAva: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // Enhanced Team Info Card
  teamInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  teamAvaLarge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamNameLarge: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  teamMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  teamMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b5cf6',
  },

  // Primary Button with Gradient
  btnPrimary: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 50,
  },
  btnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Secondary Button
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#c7d2fe',
    borderRadius: 12,
    height: 48,
    backgroundColor: '#fff',
  },
  btnSecondaryText: {
    color: '#7c3aed',
    fontSize: 15,
    fontWeight: '600',
  },

  // Tertiary Button (for Browse Teams in team view)
  btnTertiary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    height: 48,
    backgroundColor: '#f0fdf4',
  },
  btnTertiaryText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '600',
  },

  // Action Grid for small buttons
  actionGridSmall: {
    flexDirection: 'row',
    gap: 10,
  },

  // Invite Banner
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  inviteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    flex: 1,
  },

  // Accept/Decline Buttons
  rowBtns: { flexDirection: 'row', gap: 10 },
  btnAccept: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    height: 48,
  },
  btnGradientSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnAcceptText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDecline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: 12,
    height: 48,
    backgroundColor: '#fef2f2',
  },
  btnDeclineText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },

  // Pending Banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pendingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    flex: 1,
  },
  btnCancel: {
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  btnCancelText: {
    color: '#ea580c',
    fontSize: 15,
    fontWeight: '600',
  },

  // Looking for Team Button
  lookingBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 48,
  },
  lookingGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#e9d5ff',
    borderRadius: 12,
  },
  lookingActive: {},
  lookingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7c3aed',
  },

  // Action Grid Cards
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    height: 110,
  },
  actionCardGradient: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  actionCardDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  infoBannerText: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  warnBannerText: { fontSize: 13, fontWeight: '600', color: '#92400e' },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ghostDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#d1d5db' },

  /* Discussion */
  discussionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  discussionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discussionLabel: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
});