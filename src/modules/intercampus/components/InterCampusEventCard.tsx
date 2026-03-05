import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { InterCampusEvent } from '../types/intercampus';

type Props = {
  event: InterCampusEvent;
  onPress?: () => void;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Date TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBA';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function InterCampusEventCard({ event, onPress }: Props) {
  const onRegister = async () => {
    if (!event.registration_link) return;
    const canOpen = await Linking.canOpenURL(event.registration_link);
    if (canOpen) {
      Linking.openURL(event.registration_link);
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={onPress ? 0.86 : 1}>
      {event.banner_image ? (
        <Image
          source={{ uri: event.banner_image }}
          style={styles.banner}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.bannerPlaceholder}>
          <MaterialIcons name="public" size={22} color="#0f766e" />
          <Text style={styles.bannerPlaceholderText}>InterCampus Event</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.infoRow}>
          <MaterialIcons name="school" size={15} color="#64748b" />
          <Text style={styles.infoText} numberOfLines={1}>
            {event.college_name}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="calendar-month" size={15} color="#64748b" />
          <Text style={styles.infoText}>{formatDate(event.event_start_date)}</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="location-on" size={15} color="#64748b" />
          <Text style={styles.infoText}>
            {event.venue?.trim() || (event.is_online ? 'Online' : 'Venue TBA')}
          </Text>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.typeBadge}>
            <MaterialIcons
              name={event.participation_type === 'team' ? 'groups' : 'person'}
              size={13}
              color="#1e293b"
            />
            <Text style={styles.typeBadgeText}>
              {event.participation_type === 'team' ? 'Team' : 'Individual'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.registerBtn, !event.registration_link && styles.registerBtnDisabled]}
            onPress={onRegister}
            disabled={!event.registration_link}
          >
            <MaterialIcons name="open-in-new" size={13} color="#ffffff" />
            <Text style={styles.registerBtnText}>Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  banner: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#e2e8f0',
  },
  bannerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
  },
  footerRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#dbeafe',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0f766e',
  },
  registerBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  registerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
