import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { InterCampusFestGroup } from '../types/intercampus';

type Props = {
  fest: InterCampusFestGroup;
  onPress: () => void;
};

export default function InterCampusFestCard({ fest, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{fest.fest_name}</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{fest.events.length} Events</Text>
        </View>
      </View>
      <Text style={styles.college}>{fest.college_name}</Text>
      {!!fest.college_location && (
        <Text style={styles.location}>{fest.college_location}</Text>
      )}
      <View style={styles.footer}>
        <MaterialIcons name="arrow-forward" size={16} color="#0f766e" />
        <Text style={styles.footerText}>Open fest view</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  headerRow: {
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
  pill: {
    backgroundColor: '#cffafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f766e',
  },
  college: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  location: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  footer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f766e',
  },
});
