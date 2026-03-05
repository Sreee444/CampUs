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
  const isAdmin = (profile as any)?.role === 'admin';

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
        .select('*, organizer_profile:profiles!events_created_by_fkey(full_name)')
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
        .select('team_id, event_teams!inner(event_id)')
        .eq('user_id', user.id)
        .eq('event_teams.event_id', eventId)
        .limit(1) as any;

      if (memberData && memberData.length > 0) {
        setTeamState((p: any) => ({ ...p, isInTeam: true, teamId: memberData[0].team_id }));
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
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin') as any;
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
      <SafeAreaView style={s.container}>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.navIconBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#1f2937" />
          </TouchableOpacity>
          <Text style={s.navTitleCenter}>Event Details</Text>
          <View style={s.navIconBtn} />
        </View>
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      </SafeAreaView>
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
  const canManage = isCreator || isAdmin;
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
    <SafeAreaView style={s.container}>
      {/* ── NAVBAR ── */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.navIconBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#1f2937" />
        </TouchableOpacity>
        <View style={s.navCenter}>
          <Animated.Text style={[s.navTitleCenter, { opacity: headerOpacity }]} numberOfLines={1}>
            {event.title}
          </Animated.Text>
        </View>
        <TouchableOpacity style={s.navIconBtn} onPress={() => setMenuVisible(true)}>
          <MaterialIcons name="more-vert" size={22} color="#1f2937" />
        </TouchableOpacity>
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
        contentContainerStyle={{ paddingBottom: 100 }}
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
          <View style={s.pillRow}>
            <View style={[s.pill, { backgroundColor: statusColor + '14' }]}>
              {isLive && <View style={s.liveDot} />}
              <Text style={[s.pillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <View style={s.pill}>
              <Text style={s.pillText}>{event.event_type}</Text>
            </View>
            {(event as any)?.participation_type === 'team' && (
              <View style={[s.pill, { backgroundColor: '#f3e8ff' }]}>
                <Text style={[s.pillText, { color: '#7c3aed' }]}>Team</Text>
              </View>
            )}
          </View>
          <Text style={s.eventTitle}>{event.title}</Text>
          {isUpcoming && days > 0 && days <= 7 && (
            <Text style={s.countdown}>Starts in {days} day{days !== 1 ? 's' : ''}</Text>
          )}
        </View>

        {/* About */}
        {event.description ? (
          <View style={s.card}>
            <Text style={s.cardHeader}>About</Text>
            <Text style={s.bodyText}>{event.description}</Text>
          </View>
        ) : null}

        {/* Details */}
        <View style={s.card}>
          <Text style={s.cardHeader}>Details</Text>

          <InfoRow icon="calendar-today" label="Date" value={fmtDate(event.start_date)} />
          <InfoRow icon="schedule" label="Time" value={fmtTime(event.start_date) + ' — ' + fmtTime(event.end_date)} />
          <InfoRow
            icon={event.is_online ? 'laptop' : 'location-on'}
            label={event.is_online ? 'Mode' : 'Venue'}
            value={event.is_online ? 'Online' : (event.venue || 'TBA')}
          >
            {event.is_online && event.meeting_link && isLive && (
              <TouchableOpacity onPress={openMeetingLink}>
                <Text style={s.link}>Join Meeting →</Text>
              </TouchableOpacity>
            )}
          </InfoRow>
          <InfoRow icon="people-outline" label="Participants" value={event.registrations_count + ' / ' + (event.max_participants || '∞')}>
            {canManage && event.registrations_count > 0 && (
              <TouchableOpacity
                style={s.chipBtn}
                onPress={() => navigation.navigate('EventRegisteredUsers', { eventId, eventTitle: event.title })}
              >
                <Text style={s.chipBtnText}>View All</Text>
              </TouchableOpacity>
            )}
          </InfoRow>
          <InfoRow icon="verified-user" label="Eligibility" value={eligText}>
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
            <InfoRow icon="person-outline" label="Organizer" value={event.organizer_profile?.full_name || 'Campus Team'} chevron />
          </TouchableOpacity>
        </View>

        {/* Registration */}
        <View style={s.card}>
          <Text style={s.cardHeader}>Registration</Text>
          {event.is_registered ? (
            <>
              <View style={s.successChip}>
                <MaterialIcons name="check-circle" size={16} color="#16a34a" />
                <Text style={s.successChipText}>You're registered</Text>
              </View>
              <TouchableOpacity
                style={[s.btnDangerOutline, isRegistering && s.btnOff]}
                onPress={() => setShowUnregisterConfirm(true)}
                disabled={isRegistering}
              >
                <Text style={s.btnDangerOutlineText}>{isRegistering ? 'Processing...' : 'Unregister'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[s.btnFill, (!canRegister || isRegistering) && s.btnOff]}
                onPress={() => setShowRegisterConfirm(true)}
                disabled={!canRegister || isRegistering}
              >
                <Text style={s.btnFillText}>
                  {isRegistering ? 'Processing...' : canRegister ? 'Register Now' : "Can't Register"}
                </Text>
              </TouchableOpacity>
              {!canRegister && (
                <Text style={s.helper}>
                  {!regOpen ? 'Registration closed.' : (eligibility.reason || 'Not eligible for this event.')}
                </Text>
              )}
            </>
          )}
          <Text style={s.helper}>Deadline: {fmtDate(event.registration_deadline)}</Text>
        </View>

        {/* Team Participation */}
        {(event as any)?.participation_type === 'team' && event.is_registered && (
          <View style={s.card}>
            <Text style={s.cardHeader}>Team Participation</Text>
            {isCheckingTeam ? (
              <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 12 }} />
            ) : teamState?.isInTeam ? (
              <View style={s.sectionGap}>
                <View style={s.teamRow}>
                  <View style={s.teamAva}>
                    <MaterialIcons name="groups" size={20} color="#4f46e5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.teamLabel}>{teamState?.teamName || 'Your Team'}</Text>
                    <Text style={s.meta}>{teamState?.teamMembersCount ?? 0} members</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.btnFill}
                  onPress={() => navigation.navigate('TeamDetails', { teamId: teamState?.teamId, eventId })}
                >
                  <Text style={s.btnFillText}>View My Team</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.btnGhost}
                  onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                >
                  <Text style={s.btnGhostText}>Browse Members</Text>
                </TouchableOpacity>
              </View>
            ) : teamState?.hasReceivedInvite ? (
              <View style={s.sectionGap}>
                <View style={s.infoBanner}>
                  <MaterialIcons name="mail" size={16} color="#4f46e5" />
                  <Text style={s.infoBannerText}>You have a team invitation</Text>
                </View>
                <View style={s.rowBtns}>
                  <TouchableOpacity
                    style={[s.btnFill, { flex: 1 }, isHandlingInvite && s.btnOff]}
                    onPress={handleAcceptInvite}
                    disabled={isHandlingInvite}
                  >
                    <Text style={s.btnFillText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnOutline, { flex: 1 }, isHandlingInvite && s.btnOff]}
                    onPress={handleRejectInvite}
                    disabled={isHandlingInvite}
                  >
                    <Text style={s.btnOutlineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : teamState?.hasSentJoinRequest ? (
              <View style={s.sectionGap}>
                <View style={s.warnBanner}>
                  <MaterialIcons name="hourglass-empty" size={16} color="#92400e" />
                  <Text style={s.warnBannerText}>Join request pending</Text>
                </View>
                <TouchableOpacity style={s.btnOutline} onPress={handleCancelJoinRequest}>
                  <Text style={s.btnOutlineText}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.sectionGap}>
                <TouchableOpacity
                  style={[s.lookingBtn, isLookingForTeam && s.lookingActive, isTogglingLooking && s.btnOff]}
                  onPress={handleToggleLooking}
                  disabled={isTogglingLooking}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={isLookingForTeam ? 'check-circle' : 'group-add'}
                    size={18}
                    color={isLookingForTeam ? '#16a34a' : '#4f46e5'}
                  />
                  <Text style={[s.lookingText, isLookingForTeam && { color: '#16a34a' }]}>
                    {isTogglingLooking ? 'Updating...' : isLookingForTeam ? 'Looking for Team' : 'Mark as Looking'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnFill} onPress={() => handleNavigateTeam('CreateTeam')}>
                  <Text style={s.btnFillText}>Create Team</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnOutline} onPress={() => handleNavigateTeam('JoinTeam')}>
                  <Text style={s.btnOutlineText}>Join via Code</Text>
                </TouchableOpacity>
                <View style={s.ghostRow}>
                  <TouchableOpacity style={s.btnGhost} onPress={() => navigation.navigate('BrowseTeams', { eventId })}>
                    <Text style={s.btnGhostText}>Browse Teams</Text>
                  </TouchableOpacity>
                  <View style={s.ghostDot} />
                  <TouchableOpacity
                    style={s.btnGhost}
                    onPress={() => navigation.navigate('TeamConnect', { eventId, requiredRoles: (event as any)?.required_roles ?? [], teamId: teamState?.teamId })}
                  >
                    <Text style={s.btnGhostText}>Browse Members</Text>
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
    </SafeAreaView>
  );
}

/* ─── INFO ROW COMPONENT ─── */
function InfoRow({ icon, label, value, chevron, children }: {
  icon: string; label: string; value: string; chevron?: boolean; children?: React.ReactNode;
}) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <MaterialIcons name={icon as any} size={17} color="#4f46e5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoVal}>{value}</Text>
        {children}
      </View>
      {chevron && <MaterialIcons name="chevron-right" size={20} color="#d1d5db" />}
    </View>
  );
}

/* ─── STYLES ─── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f7' },
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Nav */
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  navIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitleCenter: {
    fontSize: 16,
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
    paddingTop: 20,
    paddingBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: '#4f46e5', textTransform: 'capitalize' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#dc2626' },
  eventTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  countdown: { fontSize: 13, fontWeight: '600', color: '#4f46e5', marginTop: 6 },

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
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  bodyText: { fontSize: 14, color: '#4b5563', lineHeight: 22 },

  /* Info rows */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
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

  /* Registration */
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
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
  },
  btnDangerOutlineText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  btnGhost: { paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: '#4f46e5', fontWeight: '600', fontSize: 14 },
  btnOff: { opacity: 0.5 },

  /* Team section */
  sectionGap: { gap: 10 },
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
  rowBtns: { flexDirection: 'row', gap: 10 },
  lookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#c7d2fe',
    borderRadius: 12,
    height: 44,
  },
  lookingActive: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  lookingText: { fontSize: 14, fontWeight: '600', color: '#4f46e5' },
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