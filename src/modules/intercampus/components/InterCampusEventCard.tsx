import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { InterCampusEvent } from '../types/intercampus';

type Props = {
  event: InterCampusEvent;
  onPress: () => void;
};

export default function InterCampusEventCard({ event, onPress }: Props) {
  const isTeam = event.participation_type === 'team';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.86}>
      {event.banner_image ? (
        <Image source={{ uri: event.banner_image }} style={styles.banner} />
      ) : (
        <View style={styles.bannerPlaceholder}>
          <MaterialIcons name="public" size={22} color="#1f2937" />
          <Text style={styles.bannerPlaceholderText}>InterCampus Verified</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.rowBetween}>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <View style={styles.verifiedBadge}>
            <MaterialIcons name="verified" size={13} color="#047857" />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        </View>

        <Text style={styles.meta} numberOfLines={1}>{event.college_name}</Text>

        {!!event.fest_name && (
          <Text style={styles.metaSmall} numberOfLines={1}>Fest: {event.fest_name}</Text>
        )}

        <View style={styles.footerRow}>
          <View style={[styles.typeBadge, isTeam ? styles.teamBadge : styles.individualBadge]}>
            <Text style={styles.typeBadgeText}>{isTeam ? 'Team' : 'Individual'}</Text>
          </View>
          <Text style={styles.interested}>{event.interested_count || 0} interested</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  banner: {
    width: '100%',
    height: 120,
    backgroundColor: '#e5e7eb',
  },
  bannerPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerPlaceholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  verifiedBadge: {
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  metaSmall: {
    fontSize: 12,
    color: '#64748b',
  },
  footerRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  teamBadge: {
    backgroundColor: '#fee2e2',
  },
  individualBadge: {
    backgroundColor: '#dbeafe',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  interested: {
    fontSize: 12,
    color: '#64748b',
  },
});
