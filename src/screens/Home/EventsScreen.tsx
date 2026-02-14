import React, { useEffect, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { getEvents, registerForEvent, unregisterFromEvent } from '../../api/events';

const categories = ['All', 'workshop', 'seminar', 'hackathon', 'competition', 'fest', 'other'];

export default function EventsScreen() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const data = await getEvents(user?.id, undefined, true);
        setEvents(data);
      } catch (error) {
        console.error('Events load error:', error);
      }
    };

    loadEvents();
  }, [user?.id]);

  const filteredEvents = events.filter((event) =>
    selectedCategory === 'All' || event.event_type === selectedCategory
  );

  const handleRegister = async (event: any) => {
    if (!user?.id) return;

    try {
      if (event.is_registered) {
        await unregisterFromEvent(event.id, user.id);
      } else {
        await registerForEvent(event.id, user.id);
      }

      const updated = await getEvents(user.id, undefined, true);
      setEvents(updated);
    } catch (error) {
      console.error('Registration error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <TouchableOpacity style={styles.calendarButton} onPress={() => {}}>
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

        {filteredEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No events available</Text>
          </View>
        ) : filteredEvents.map((event) => (
          <TouchableOpacity key={event.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <View style={styles.dateBox}>
                <Text style={styles.dateMonth}>
                  {new Date(event.start_date).toLocaleString('en-US', { month: 'short' }).toUpperCase()}
                </Text>
                <Text style={styles.dateDay}>
                  {new Date(event.start_date).getDate()}
                </Text>
              </View>

              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                
                <View style={styles.eventDetail}>
                  <MaterialIcons name="access-time" size={14} color="#64748b" />
                  <Text style={styles.eventDetailText}>
                    {new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.eventDetail}>
                  <MaterialIcons name="place" size={14} color="#64748b" />
                  <Text style={styles.eventDetailText}>{event.venue || 'TBA'}</Text>
                </View>

                <View style={styles.eventFooter}>
                  <View style={styles.attendeesInfo}>
                    <MaterialIcons name="people" size={16} color={Colors.primary} />
                    <Text style={styles.attendeesText}>
                      {event.registrations_count || 0} attending
                    </Text>
                  </View>

                  <View style={[styles.categoryBadge, getCategoryStyle(event.event_type)]}>
                    <Text style={styles.categoryBadgeText}>{event.event_type}</Text>
                  </View>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.registerButton, event.is_registered && styles.registeredButton]}
              onPress={() => handleRegister(event)}
            >
              <Text style={styles.registerButtonText}>
                {event.is_registered ? 'Registered' : 'Register'}
              </Text>
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
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
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
  registeredButton: {
    backgroundColor: '#10b981',
  },
  registerButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
});
