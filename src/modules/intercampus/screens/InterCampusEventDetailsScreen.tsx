import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { getInterCampusEventById, toggleInterCampusInterested } from '../api/intercampus';
import { InterCampusEvent } from '../types/intercampus';

type Route = RouteProp<RootStackParamList, 'InterCampusEventDetails'>;
type Nav = StackNavigationProp<RootStackParamList>;

export default function InterCampusEventDetailsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [event, setEvent] = useState<InterCampusEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingInterest, setProcessingInterest] = useState(false);

  const loadEvent = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInterCampusEventById(route.params.eventId, user?.id);
      setEvent(data);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to load event', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [route.params.eventId, user?.id]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const openRegistration = async () => {
    if (!event?.registration_link) {
      Toast.show({ type: 'info', text1: 'No registration link available yet' });
      return;
    }

    const canOpen = await Linking.canOpenURL(event.registration_link);
    if (!canOpen) {
      Toast.show({ type: 'error', text1: 'Invalid registration URL' });
      return;
    }

    await Linking.openURL(event.registration_link);
  };

  const handleToggleInterested = async () => {
    if (!user?.id || !event?.id) return;

    try {
      setProcessingInterest(true);
      const interestedNow = await toggleInterCampusInterested(event.id, user.id);
      setEvent((prev) => {
        if (!prev) return prev;
        const currentCount = prev.interested_count || 0;
        return {
          ...prev,
          is_interested: interestedNow,
          interested_count: interestedNow ? currentCount + 1 : Math.max(0, currentCount - 1),
        };
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not update interest', text2: error?.message });
    } finally {
      setProcessingInterest(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <ActivityIndicator color="#0f766e" />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <Text style={styles.emptyTitle}>Event not available</Text>
      </SafeAreaView>
    );
  }

  const isTeam = event.participation_type === 'team';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>InterCampus Event</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {event.banner_image ? (
          <Image source={{ uri: event.banner_image }} style={styles.banner} />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <MaterialIcons name="public" size={26} color="#0f172a" />
            <Text style={styles.bannerText}>Verified InterCampus Event</Text>
          </View>
        )}

        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.subTitle}>{event.college_name}</Text>
        {!!event.college_location && <Text style={styles.fest}>Location: {event.college_location}</Text>}
        {!!event.college_website && <Text style={styles.fest}>Website: {event.college_website}</Text>}
        {!!event.fest_name && <Text style={styles.fest}>Fest: {event.fest_name}</Text>}

        <View style={styles.badgeRow}>
          <View style={[styles.badge, isTeam ? styles.badgeTeam : styles.badgeIndividual]}>
            <Text style={styles.badgeText}>{isTeam ? 'Team Event' : 'Individual Event'}</Text>
          </View>
          <View style={styles.badgeVerified}>
            <MaterialIcons name="verified" size={14} color="#047857" />
            <Text style={styles.badgeVerifiedText}>Verified</Text>
          </View>
        </View>

        <View style={styles.card}>
          {!!event.description && <Text style={styles.bodyText}>{event.description}</Text>}
          {!!event.event_type && <Text style={styles.metaLine}>Event Type: {event.event_type}</Text>}
          <Text style={styles.metaLine}>Mode: {event.is_online ? 'Online' : 'Offline'}</Text>
          {!!event.venue && <Text style={styles.metaLine}>Venue: {event.venue}</Text>}
          {isTeam && (
            <Text style={styles.metaLine}>
              Team Size: {event.min_team_size || '-'} to {event.max_team_size || '-'}
            </Text>
          )}
          {!!event.event_start_date && <Text style={styles.metaLine}>Start: {new Date(event.event_start_date).toLocaleString()}</Text>}
          {!!event.event_end_date && <Text style={styles.metaLine}>End: {new Date(event.event_end_date).toLocaleString()}</Text>}
          {!!event.eligibility_text && <Text style={styles.metaLine}>Eligibility: {event.eligibility_text}</Text>}
          {!!event.faculty_notes && <Text style={styles.metaLine}>Faculty Notes: {event.faculty_notes}</Text>}
          {!!event.registration_deadline && (
            <Text style={styles.metaLine}>Registration Deadline: {new Date(event.registration_deadline).toLocaleString()}</Text>
          )}
          <Text style={styles.interestedCount}>{event.interested_count || 0} users interested</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openRegistration}>
          <Text style={styles.primaryBtnText}>Official Registration</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} disabled={processingInterest} onPress={handleToggleInterested}>
          <Text style={styles.secondaryBtnText}>{event.is_interested ? 'Interested' : 'Mark Interested'}</Text>
        </TouchableOpacity>

        {isTeam && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('InterCampusTeamUp', { eventId: event.id })}
          >
            <Text style={styles.secondaryBtnText}>Team Up</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('InterCampusDiscussion', { eventId: event.id })}
        >
          <Text style={styles.secondaryBtnText}>Discussion</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  emptyTitle: { fontSize: 16, color: '#0f172a', fontWeight: '700' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  banner: { width: '100%', height: 190, borderRadius: 16, backgroundColor: '#dbeafe' },
  bannerPlaceholder: {
    width: '100%',
    height: 190,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bannerText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  subTitle: { fontSize: 14, color: '#334155', fontWeight: '600' },
  fest: { fontSize: 13, color: '#64748b' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeTeam: { backgroundColor: '#fee2e2' },
  badgeIndividual: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  badgeVerified: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dcfce7',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  badgeVerifiedText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 6,
  },
  bodyText: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  metaLine: { fontSize: 13, color: '#475569' },
  interestedCount: { marginTop: 4, fontSize: 12, color: '#0f766e', fontWeight: '700' },
  primaryBtn: {
    borderRadius: 12,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: { color: '#0f766e', fontWeight: '800', fontSize: 14 },
});
