import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

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
        <ActivityIndicator color="#0f766e" size="large" />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <MaterialIcons name="error-outline" size={36} color="#94a3b8" />
        <Text style={styles.emptyTitle}>Event not available</Text>
      </SafeAreaView>
    );
  }

  const isTeam = event.participation_type === 'team';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll}>
        {/* ─── Banner ─── */}
        <View style={styles.bannerWrap}>
          {event.banner_image ? (
            <Image source={{ uri: event.banner_image }} style={styles.banner} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <MaterialIcons name="public" size={42} color="#0f766e" />
              <Text style={styles.bannerPlaceholderText}>InterCampus Event</Text>
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bannerGradient} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>{event.title}</Text>
          </View>
        </View>

        {/* ─── Info Section ─── */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <MaterialIcons name="school" size={18} color="#0f766e" />
            <Text style={styles.infoText}>{event.college_name}</Text>
          </View>
          {!!event.college_location && (
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={18} color="#0f766e" />
              <Text style={styles.infoText}>{event.college_location}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
            <Text style={styles.infoText}>
              {formatDate(event.event_start_date) || 'Date TBA'}
              {!!event.event_end_date && ` – ${formatDate(event.event_end_date)}`}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="place" size={18} color="#0f766e" />
            <Text style={styles.infoText}>
              {event.venue?.trim() || (event.is_online ? 'Online' : 'Venue TBA')}
            </Text>
          </View>

          {/* Badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, isTeam ? styles.badgeTeam : styles.badgeIndividual]}>
              <MaterialIcons name={isTeam ? 'groups' : 'person'} size={14} color="#0f172a" />
              <Text style={styles.badgeText}>{isTeam ? 'Team Event' : 'Individual'}</Text>
            </View>
            <View style={styles.badgeVerified}>
              <MaterialIcons name="verified" size={14} color="#047857" />
              <Text style={styles.badgeVerifiedText}>Verified</Text>
            </View>
            <View style={styles.badgeInterested}>
              <MaterialIcons name="favorite" size={14} color="#0f766e" />
              <Text style={styles.badgeInterestedText}>{event.interested_count || 0} interested</Text>
            </View>
          </View>
        </View>

        {/* ─── Description Card ─── */}
        <View style={styles.contentPad}>
          {!!event.description && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>About</Text>
              <Text style={styles.bodyText}>{event.description}</Text>
            </View>
          )}

          {/* Details Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Details</Text>
            {!!event.event_type && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Event Type</Text>
                <Text style={styles.detailValue}>{event.event_type}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Mode</Text>
              <Text style={styles.detailValue}>{event.is_online ? 'Online' : 'Offline'}</Text>
            </View>
            {isTeam && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Team Size</Text>
                <Text style={styles.detailValue}>
                  {event.min_team_size || '-'} to {event.max_team_size || '-'}
                </Text>
              </View>
            )}
            {!!event.eligibility_text && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Eligibility</Text>
                <Text style={styles.detailValue}>{event.eligibility_text}</Text>
              </View>
            )}
            {!!event.registration_deadline && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Deadline</Text>
                <Text style={styles.detailValue}>{formatDate(event.registration_deadline)}</Text>
              </View>
            )}
            {!!event.faculty_notes && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Faculty Notes</Text>
                <Text style={styles.detailValue}>{event.faculty_notes}</Text>
              </View>
            )}
          </View>

          {/* ─── Action Buttons ─── */}
          <TouchableOpacity style={styles.primaryBtn} onPress={openRegistration}>
            <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
            <Text style={styles.primaryBtnText}>Official Registration</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineBtn, event.is_interested && styles.outlineBtnActive]}
            disabled={processingInterest}
            onPress={handleToggleInterested}
          >
            <MaterialIcons
              name={event.is_interested ? 'favorite' : 'favorite-border'}
              size={18}
              color={event.is_interested ? '#ffffff' : '#0f766e'}
            />
            <Text style={[styles.outlineBtnText, event.is_interested && styles.outlineBtnTextActive]}>
              {event.is_interested ? 'Interested ✓' : 'Mark Interested'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => navigation.navigate('InterCampusDiscussion', { eventId: event.id })}
          >
            <MaterialIcons name="forum" size={18} color="#0f766e" />
            <Text style={styles.outlineBtnText}>Discussion</Text>
          </TouchableOpacity>

          {isTeam && (
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => navigation.navigate('InterCampusTeamUp', { eventId: event.id })}
            >
              <MaterialIcons name="groups" size={18} color="#0f766e" />
              <Text style={styles.outlineBtnText}>Team Up</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  scroll: { flex: 1 },

  /* ─── Banner ─── */
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e2e8f0' },
  bannerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerPlaceholderText: { fontSize: 13, color: '#334155', fontWeight: '700' },
  bannerGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextWrap: { position: 'absolute', bottom: 14, left: 16, right: 16 },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#ffffff' },

  /* ─── Info Section ─── */
  infoSection: {
    padding: 16,
    gap: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '500' },

  /* Badges */
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeTeam: { backgroundColor: '#fee2e2' },
  badgeIndividual: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  badgeVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dcfce7',
  },
  badgeVerifiedText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  badgeInterested: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ecfdf5',
  },
  badgeInterestedText: { fontSize: 12, fontWeight: '700', color: '#0f766e' },

  /* ─── Content ─── */
  contentPad: { padding: 16, gap: 12 },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  bodyText: { fontSize: 14, color: '#334155', lineHeight: 21 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  detailValue: { fontSize: 13, color: '#0f172a', fontWeight: '500', textAlign: 'right', flex: 1 },

  /* ─── Buttons ─── */
  primaryBtn: {
    borderRadius: 14,
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  outlineBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#0f766e',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 8,
  },
  outlineBtnActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  outlineBtnText: { color: '#0f766e', fontWeight: '800', fontSize: 14 },
  outlineBtnTextActive: { color: '#ffffff' },
});
