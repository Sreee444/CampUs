import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

const upcomingEvents = [
  {
    id: '1',
    title: 'Project Showcase 2026',
    date: 'Feb 15',
    time: '2:00 PM - 5:00 PM',
    location: 'Main Auditorium',
    category: 'Academic',
    attendees: 150,
  },
  {
    id: '2',
    title: 'Research Symposium',
    date: 'Feb 20',
    time: '10:00 AM - 4:00 PM',
    location: 'Conference Hall',
    category: 'Research',
    attendees: 200,
  },
  {
    id: '3',
    title: 'Tech Workshop: React Native',
    date: 'Feb 25',
    time: '3:00 PM - 6:00 PM',
    location: 'Lab 301',
    category: 'Workshop',
    attendees: 50,
  },
  {
    id: '4',
    title: 'Alumni Meetup',
    date: 'Mar 1',
    time: '6:00 PM - 9:00 PM',
    location: 'Campus Grounds',
    category: 'Networking',
    attendees: 120,
  },
];

const categories = ['All', 'Academic', 'Research', 'Workshop', 'Networking'];

export default function EventsScreen() {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredEvents = upcomingEvents.filter((event) =>
    selectedCategory === 'All' || event.category === selectedCategory
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <TouchableOpacity style={styles.calendarButton} onPress={() => {}/* TODO: Open calendar view */}>
          <MaterialIcons name="calendar-today" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Events List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle}>Upcoming Events</Text>

        {filteredEvents.map((event) => (
          <TouchableOpacity key={event.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <View style={styles.dateBox}>
                <Text style={styles.dateMonth}>FEB</Text>
                <Text style={styles.dateDay}>{event.date.split(' ')[1]}</Text>
              </View>

              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                
                <View style={styles.eventDetail}>
                  <MaterialIcons name="access-time" size={14} color="#64748b" />
                  <Text style={styles.eventDetailText}>{event.time}</Text>
                </View>

                <View style={styles.eventDetail}>
                  <MaterialIcons name="place" size={14} color="#64748b" />
                  <Text style={styles.eventDetailText}>{event.location}</Text>
                </View>

                <View style={styles.eventFooter}>
                  <View style={styles.attendeesInfo}>
                    <MaterialIcons name="people" size={16} color={Colors.primary} />
                    <Text style={styles.attendeesText}>{event.attendees} attending</Text>
                  </View>

                  <View style={[styles.categoryBadge, getCategoryStyle(event.category)]}>
                    <Text style={styles.categoryBadgeText}>{event.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.registerButton} onPress={() => {}/* TODO: Implement event registration */}>
              <Text style={styles.registerButtonText}>Register</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getCategoryStyle(category: string) {
  switch (category) {
    case 'Academic':
      return { backgroundColor: '#dbeafe' };
    case 'Research':
      return { backgroundColor: '#fce7f3' };
    case 'Workshop':
      return { backgroundColor: '#fef3c7' };
    case 'Networking':
      return { backgroundColor: '#d1fae5' };
    default:
      return { backgroundColor: '#e2e8f0' };
  }
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  calendarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoriesContainer: {
    maxHeight: 50,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  categoriesContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: 12,
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    ...Shadows.sm,
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dateBox: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
    opacity: 0.8,
  },
  dateDay: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#111818',
    marginBottom: 8,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  eventDetailText: {
    fontSize: 12,
    color: '#64748b',
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  attendeesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attendeesText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
    color: '#334155',
  },
  registerButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
});
