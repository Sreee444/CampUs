import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
  Share,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvents } from '../../api/events';
import { getEventReminders } from '../../api/eventReminders';
import Toast from 'react-native-toast-message';

interface Event {
  id: string;
  title: string;
  description?: string;
  event_type: string;
  start_date: string;
  end_date: string;
  venue?: string;
  meeting_link?: string;
  registration_deadline?: string;
  creator?: any;
  registrations_count?: number;
  is_registered?: boolean;
}

interface CalendarDay {
  date: Date;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  events: Event[];
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewType, setViewType] = useState<'month' | 'list'>('month');

  useEffect(() => {
    loadEventsAndCalendar();
  }, [currentDate]);

  const loadEventsAndCalendar = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      
      // Load events with user ID for personalized results
      const eventData = await getEvents(user.id, undefined, false);
      setEvents(eventData || []);
      
      // Build calendar
      generateCalendarDays(currentDate, eventData || []);
    } catch (error) {
      console.error('Error loading events:', error);
      Toast.show({ type: 'error', text1: 'Failed to load calendar' });
    } finally {
      setIsLoading(false);
    }
  };

  const generateCalendarDays = (date: Date, eventList: Event[]) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // First day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];

    // Previous month's days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      days.push({
        date: new Date(year, month - 1, day),
        day,
        month: month - 1,
        year,
        isCurrentMonth: false,
        events: [],
      });
    }

    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dateStr = dateObj.toISOString().split('T')[0];
      
      // Match events: include both start_date and registration_deadline
      const dayEvents = eventList.filter((e) => {
        const eventDateStr = e.start_date.split('T')[0];
        const deadlineStr = e.registration_deadline?.split('T')[0];
        return eventDateStr === dateStr || deadlineStr === dateStr;
      });

      days.push({
        date: dateObj,
        day,
        month,
        year,
        isCurrentMonth: true,
        events: dayEvents,
      });
    }

    // Next month's days
    const totalCells = Math.ceil((days.length + firstDay) / 7);
    const remainingDays = totalCells * 7 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        date: new Date(year, month + 1, day),
        day,
        month: month + 1,
        year,
        isCurrentMonth: false,
        events: [],
      });
    }

    setCalendarDays(days);
  };

  const handleDayPress = (calendarDay: CalendarDay) => {
    if (!calendarDay.isCurrentMonth) return;
    setSelectedDate(calendarDay.date);
    setSelectedDayEvents(calendarDay.events);
    setModalVisible(true);
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleAddToCalendar = async (event: Event) => {
    try {
      const startDate = new Date(event.start_date);
      const endDate = new Date(event.end_date);

      // For iOS Calendar: use calendar:// scheme
      if (Platform.OS === 'ios') {
        const calendarURL = `calendar://event?title=${encodeURIComponent(
          event.title
        )}&notes=${encodeURIComponent(event.description || '')}&location=${encodeURIComponent(
          event.venue || ''
        )}&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}`;
        await Linking.openURL(calendarURL);
      } else if (Platform.OS === 'android') {
        // For Android: use Google Calendar intent or native calendar
        const calendarURL = `content://com.android.calendar/events?title=${encodeURIComponent(
          event.title
        )}&description=${encodeURIComponent(
          event.description || ''
        )}&eventLocation=${encodeURIComponent(
          event.venue || ''
        )}&beginTime=${startDate.getTime()}&endTime=${endDate.getTime()}`;
        await Linking.openURL(calendarURL);
      }

      Toast.show({
        type: 'success',
        text1: 'Opening calendar app...',
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Could not open calendar app' });
    }
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (viewType === 'list') {
    // List View
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header with Controls */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.title}>Calendar</Text>
              <TouchableOpacity onPress={() => setViewType('month')}>
                <MaterialIcons name="calendar-month" size={24} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>{monthName}</Text>
          </View>

          {/* Upcoming Events - Sorted by date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>

            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-note" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No events scheduled</Text>
              </View>
            ) : (
              <FlatList
                data={events.sort((a, b) => 
                  new Date(a.start_date).getTime() -
                  new Date(b.start_date).getTime()
                )}
                renderItem={({ item }) => renderEventCard(item)}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.eventsList}
              />
            )}
          </View>

          <View style={{ height: Spacing.lg }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Month View
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with Controls */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={goToPreviousMonth}>
              <MaterialIcons name="chevron-left" size={28} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>{monthName}</Text>
            <TouchableOpacity onPress={goToNextMonth}>
              <MaterialIcons name="chevron-right" size={28} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, { borderColor: Colors.border }]}
              onPress={goToToday}
            >
              <Text style={styles.controlButtonText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: Colors.primary }]}
              onPress={() => setViewType('list')}
            >
              <MaterialIcons name="list" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Week Day Headers */}
        <View style={styles.weekDaysContainer}>
          {weekDays.map((day) => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {calendarDays.map((calendarDay, index) => {
            const isToday =
              calendarDay.isCurrentMonth &&
              calendarDay.date.toDateString() === new Date().toDateString();
            const isSelected =
              selectedDate && calendarDay.date.toDateString() === selectedDate.toDateString();

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !calendarDay.isCurrentMonth && styles.dayCellDisabled,
                  isToday && [styles.dayCellToday, { backgroundColor: Colors.primary }],
                  isSelected && [styles.dayCellSelected, { borderColor: Colors.primary }],
                ]}
                onPress={() => handleDayPress(calendarDay)}
                disabled={!calendarDay.isCurrentMonth}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !calendarDay.isCurrentMonth && styles.dayNumberDisabled,
                    isToday && styles.dayNumberToday,
                  ]}
                >
                  {calendarDay.day}
                </Text>

                {calendarDay.events.length > 0 && (
                  <View style={styles.eventDots}>
                    {calendarDay.events.slice(0, 3).map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.eventDot,
                          { backgroundColor: isToday ? '#fff' : Colors.primary },
                        ]}
                      />
                    ))}
                    {calendarDay.events.length > 3 && (
                      <Text
                        style={[
                          styles.moreDots,
                          { color: isToday ? '#fff' : Colors.primary },
                        ]}
                      >
                        +{calendarDay.events.length - 3}
                      </Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Day Details Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate?.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedDayEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="event-note" size={48} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>No events on this day</Text>
                </View>
              ) : (
                <FlatList
                  data={selectedDayEvents}
                  renderItem={({ item }) => renderEventCard(item, true)}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  contentContainerStyle={styles.eventsList}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  function renderEventCard(event: Event, isDetailed = false) {
    // Format time from ISO datetime
    const startDate = new Date(event.start_date);
    const endDate = new Date(event.end_date);
    
    const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const eventTime = `${startTime} - ${endTime}`;
    
    const dateStr = startDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    // Check if there's a deadline and if it's different from event start date
    const hasDeadline = event.registration_deadline && 
      new Date(event.registration_deadline).toDateString() !== startDate.toDateString();
    const deadlineDate = hasDeadline ? 
      new Date(event.registration_deadline!).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) : null;

    return (
      <TouchableOpacity
        key={event.id}
        style={[styles.eventCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
        onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
        activeOpacity={0.7}
      >
        <View style={styles.eventCardHeader}>
          <View style={styles.eventCardLeft}>
            <View
              style={[
                styles.eventTypeIcon,
                { backgroundColor: getEventTypeColor(event.event_type) + '20' },
              ]}
            >
              <MaterialIcons
                name={getEventTypeIcon(event.event_type)}
                size={20}
                color={getEventTypeColor(event.event_type)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventTime}>
                <MaterialIcons name="access-time" size={12} /> {eventTime}
              </Text>
            </View>
          </View>
          {!isDetailed && (
            <Text style={styles.eventDate}>{dateStr}</Text>
          )}
        </View>

        {isDetailed && (
          <>
            {event.venue && (
              <View style={styles.eventDetail}>
                <MaterialIcons name="location-on" size={16} color={Colors.textSecondary} />
                <Text style={styles.eventDetailText}>{event.venue}</Text>
              </View>
            )}

            {event.description && (
              <Text style={styles.eventDescription}>{event.description}</Text>
            )}

            {hasDeadline && (
              <View style={[styles.eventDetail, { backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginTop: 12 }]}>
                <MaterialIcons name="calendar-today" size={16} color="#dc2626" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#dc2626', fontWeight: '600' }}>Registration Deadline</Text>
                  <Text style={[styles.eventDetailText, { color: '#dc2626', marginTop: 2 }]}>{deadlineDate}</Text>
                </View>
              </View>
            )}

            <View style={styles.eventFooter}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: Colors.primary + '20' }]}
                onPress={() => handleAddToCalendar(event)}
              >
                <MaterialIcons name="add-to-photos" size={16} color={Colors.primary} />
                <Text style={[styles.actionButtonText, { color: Colors.primary }]}>
                  Add to Calendar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: Colors.primary }]}
                onPress={() =>
                  Share.share({
                    message: `${event.title}\n${eventTime}\n${event.venue || ''}\n${hasDeadline ? `Deadline: ${deadlineDate}` : ''}`,
                    title: event.title,
                  })
                }
              >
                <MaterialIcons name="share" size={16} color="#fff" />
                <Text style={[styles.actionButtonText, { color: '#fff' }]}>Share</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </TouchableOpacity>
    );
  }
}

const getEventTypeIcon = (type: string) => {
  const icons: { [key: string]: any } = {
    workshop: 'school',
    seminar: 'groups',
    conference: 'event-note',
    hackathon: 'code',
    meetup: 'people',
    webinar: 'videocam',
    exam: 'assignment',
    default: 'event',
  };
  return icons[type] || icons.default;
};

const getEventTypeColor = (type: string) => {
  const colors: { [key: string]: string } = {
    workshop: '#3b82f6',
    seminar: '#8b5cf6',
    conference: '#ec4899',
    hackathon: '#f59e0b',
    meetup: '#10b981',
    webinar: '#06b6d4',
    exam: '#ef4444',
    default: '#6b7280',
  };
  return colors[type] || colors.default;
};

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    controls: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    controlButton: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    controlButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    weekDaysContainer: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
      backgroundColor: Colors.surface,
    },
    weekDayCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    weekDayText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      color: Colors.textSecondary,
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      gap: 8,
    },
    dayCell: {
      width: '14.2%',
      aspectRatio: 1,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    dayCellDisabled: {
      backgroundColor: Colors.background,
      opacity: 0.5,
    },
    dayCellToday: {
      borderColor: Colors.primary,
    },
    dayCellSelected: {
      borderWidth: 2,
      backgroundColor: Colors.primary + '10',
    },
    dayNumber: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    dayNumberDisabled: {
      color: Colors.textSecondary,
    },
    dayNumberToday: {
      color: '#fff',
    },
    eventDots: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 2,
      alignItems: 'center',
    },
    eventDot: {
      width: 4,
      height: 4,
      borderRadius: BorderRadius.full,
    },
    moreDots: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      marginLeft: 1,
    },
    section: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.md,
    },
    eventsList: {
      gap: Spacing.md,
    },
    eventCard: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    eventCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.md,
    },
    eventCardLeft: {
      flex: 1,
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'flex-start',
    },
    eventTypeIcon: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    eventTime: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    eventDate: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
    },
    eventDetail: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
      alignItems: 'center',
    },
    eventDetailText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      flex: 1,
    },
    eventDescription: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.md,
      lineHeight: 18,
    },
    eventFooter: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginTop: Spacing.md,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    actionButtonText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: Spacing.xxl,
      gap: Spacing.md,
    },
    emptyText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      maxHeight: '80%',
      paddingTop: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
    },
    modalBody: {
      padding: Spacing.md,
      maxHeight: 'auto',
    },
  });
