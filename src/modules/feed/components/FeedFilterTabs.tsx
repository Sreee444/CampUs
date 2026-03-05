import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type FilterType = 'all' | 'department' | 'announcement' | 'event' | 'exam' | 'general';

type Props = {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
};

const FILTERS: Array<{ id: FilterType; label: string; icon: string }> = [
  { id: 'all', label: 'All', icon: '📰' },
  { id: 'department', label: 'My Department', icon: '🏢' },
  { id: 'announcement', label: 'Announcements', icon: '📢' },
  { id: 'event', label: 'Events', icon: '🎉' },
  { id: 'exam', label: 'Exams', icon: '✏️' },
  { id: 'general', label: 'General', icon: '💬' },
];

export default function FeedFilterTabs({ activeFilter, onFilterChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      scrollEventThrottle={16}
    >
      {FILTERS.map((filter) => (
        <TouchableOpacity
          key={filter.id}
          style={[styles.tab, activeFilter === filter.id && styles.tabActive]}
          onPress={() => onFilterChange(filter.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.tabIcon}>{filter.icon}</Text>
          <Text style={[styles.tabLabel, activeFilter === filter.id && styles.tabLabelActive]}>
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  tabIcon: {
    fontSize: 14,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tabLabelActive: {
    color: '#ffffff',
  },
});
