import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  TextInput,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvents } from '../../api/events';
import Toast from 'react-native-toast-message';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewType, setViewType] = useState<'month' | 'week' | 'agenda'>('month');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [weekDays, setWeekDays] = useState<CalendarDay[]>([]);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          // Swipe right - previous month
          goToPreviousMonth();
        } else if (gestureState.dx < -50) {
          // Swipe left - next month
          goToNextMonth();
        }
      },
    })
  ).current;

  const pad2 = (value: number) => String(value).padStart(2, '0');
  const applySearch = () => {
    setSearchQuery(searchInput.trim());
  };
  const getDateKey = (date: Date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const getDateKeyFromString = (value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return getDateKey(parsed);
  };

  useEffect(() => {
    loadEventsAndCalendar();
  }, [currentDate]);

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    // Filter events based on search and event type
    let filtered = events;

    if (searchQuery.trim()) {
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedEventTypes.length > 0) {
      filtered = filtered.filter((event) =>
        selectedEventTypes.includes(event.event_type)
      );
    }

    setFilteredEvents(filtered);
    generateCalendarDays(currentDate, filtered);
  }, [searchQuery, selectedEventTypes, events, currentDate]);

  const loadEventsAndCalendar = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      
      // Load events with user ID for personalized results
      const eventData = await getEvents(user.id, undefined, false);
      setEvents(eventData || []);
      setFilteredEvents(eventData || []);
      
      // Build calendar and week view
      generateCalendarDays(currentDate, eventData || []);
      generateWeekDays(currentDate, eventData || []);
    } catch (error) {
      console.error('Error loading events:', error);
      Toast.show({ type: 'error', text1: 'Failed to load calendar' });
    } finally {
      setIsLoading(false);
    }
  };

  const generateWeekDays = (date: Date, eventList: Event[]) => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay()); // Start from Sunday

    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateObj = new Date(startOfWeek);
      dateObj.setDate(startOfWeek.getDate() + i);
      const dateStr = getDateKey(dateObj);

      const dayEvents = eventList.filter((e) => {
        const eventDateStr = getDateKeyFromString(e.start_date);
        const deadlineStr = getDateKeyFromString(e.registration_deadline);
        return eventDateStr === dateStr || deadlineStr === dateStr;
      });

      days.push({
        date: dateObj,
        day: dateObj.getDate(),
        month: dateObj.getMonth(),
        year: dateObj.getFullYear(),
        isCurrentMonth: dateObj.getMonth() === date.getMonth(),
        events: dayEvents,
      });
    }

    setWeekDays(days);
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
    for (let i = firstDay; i > 0; i--) {
      const day = daysInPrevMonth - i + 1;
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
      const dateStr = getDateKey(dateObj);
      
      // Match events: include both start_date and registration_deadline
      const dayEvents = eventList.filter((e) => {
        const eventDateStr = getDateKeyFromString(e.start_date);
        const deadlineStr = getDateKeyFromString(e.registration_deadline);
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
    const totalCells = Math.ceil(days.length / 7) * 7;
    const remainingDays = totalCells - days.length;
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
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(newDate);
    generateWeekDays(newDate, filteredEvents);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(newDate);
    generateWeekDays(newDate, filteredEvents);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    generateWeekDays(today, filteredEvents);
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
    generateWeekDays(newDate, filteredEvents);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
    generateWeekDays(newDate, filteredEvents);
  };

  const toggleEventType = (type: string) => {
    setSelectedEventTypes((prev) => 
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const getEventStats = () => {
    const total = filteredEvents.length;
    const registered = filteredEvents.filter((e) => e.is_registered).length;
    const upcoming = filteredEvents.filter(
      (e) => new Date(e.start_date) > new Date()
    ).length;
    const thisMonth = filteredEvents.filter((e) => {
      const eventDate = new Date(e.start_date);
      return (
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      );
    }).length;

    return { total, registered, upcoming, thisMonth };
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
  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const eventTypes = Array.from(new Set(events.map((e) => e.event_type)));
  const stats = getEventStats();

  // Render header with search and view controls
  const renderHeader = () => (
    <Animated.View
      style={[
        styles.header,
        {
          opacity: fadeAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-50, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <MaterialIcons
            name="filter-list"
            size={24}
            color={showFilters ? Colors.primary : Colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: Colors.background }]}>
        <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search events..."
          placeholderTextColor={Colors.textSecondary}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={applySearch}
          returnKeyType="search"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchInput('');
              setSearchQuery('');
            }}
          >
            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Event Stats */}
      <Animated.View 
        style={[
          styles.statsRow,
          {
            opacity: fadeAnim,
            transform: [{
              scale: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1],
              }),
            }],
          },
        ]}
      >
        <View style={[styles.statCard, styles.statCardPurple]}>
          <View style={styles.statIconContainer}>
            <MaterialIcons name="calendar-month" size={24} color="#a855f7" />
          </View>
          <Text style={[styles.statNumber, { color: '#a855f7' }]}>{stats.thisMonth}</Text>
          <Text style={styles.statLabel}>This Month</Text>
        </View>
        <View style={[styles.statCard, styles.statCardEmerald]}>
          <View style={styles.statIconContainer}>
            <MaterialIcons name="event-available" size={24} color="#10b981" />
          </View>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>{stats.upcoming}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={[styles.statCard, styles.statCardAmber]}>
          <View style={styles.statIconContainer}>
            <MaterialIcons name="check-circle" size={24} color="#f59e0b" />
          </View>
          <Text style={[styles.statNumber, { color: '#f59e0b' }]}>{stats.registered}</Text>
          <Text style={styles.statLabel}>Registered</Text>
        </View>
      </Animated.View>

      {/* Filters */}
      {showFilters && (
        <Animated.View style={styles.filtersContainer}>
          <Text style={styles.filterTitle}>Event Types</Text>
          <View style={styles.filterChips}>
            {eventTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  selectedEventTypes.includes(type) && {
                    backgroundColor: getEventTypeColor(type),
                  },
                ]}
                onPress={() => toggleEventType(type)}
              >
                <MaterialIcons
                  name={getEventTypeIcon(type)}
                  size={16}
                  color={selectedEventTypes.includes(type) ? '#fff' : Colors.text}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    selectedEventTypes.includes(type) && { color: '#fff' },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}

      {/* View Type Switcher */}
      <View style={styles.viewSwitcher}>
        <TouchableOpacity
          style={[
            styles.viewButton,
            viewType === 'month' && { backgroundColor: Colors.primary },
          ]}
          onPress={() => setViewType('month')}
        >
          <MaterialIcons
            name="calendar-month"
            size={20}
            color={viewType === 'month' ? '#fff' : Colors.text}
          />
          <Text
            style={[
              styles.viewButtonText,
              viewType === 'month' && { color: '#fff' },
            ]}
          >
            Month
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewButton,
            viewType === 'week' && { backgroundColor: Colors.primary },
          ]}
          onPress={() => setViewType('week')}
        >
          <MaterialIcons
            name="view-week"
            size={20}
            color={viewType === 'week' ? '#fff' : Colors.text}
          />
          <Text
            style={[
              styles.viewButtonText,
              viewType === 'week' && { color: '#fff' },
            ]}
          >
            Week
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewButton,
            viewType === 'agenda' && { backgroundColor: Colors.primary },
          ]}
          onPress={() => setViewType('agenda')}
        >
          <MaterialIcons
            name="list"
            size={20}
            color={viewType === 'agenda' ? '#fff' : Colors.text}
          />
          <Text
            style={[
              styles.viewButtonText,
              viewType === 'agenda' && { color: '#fff' },
            ]}
          >
            Agenda
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading calendar...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Week View
  if (viewType === 'week') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderHeader()}

          {/* Week Navigation */}
          <View style={styles.monthNavigation}>
            <TouchableOpacity onPress={goToPreviousWeek} style={styles.navButton}>
              <MaterialIcons name="chevron-left" size={28} color={Colors.primary} />
            </TouchableOpacity>
            <View style={styles.monthNameContainer}>
              <Text style={styles.monthName}>{monthName}</Text>
              <TouchableOpacity onPress={goToToday} style={[styles.todayButton, { borderColor: '#ec4899' }]}>
                <MaterialIcons name="today" size={14} color="#ec4899" />
                <Text style={[styles.todayButtonText, { color: '#ec4899' }]}>Today</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={goToNextWeek} style={styles.navButton}>
              <MaterialIcons name="chevron-right" size={28} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Week Grid */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.md }}
          >
            <View style={styles.weekGrid}>
              {weekDays.map((day) => {
                const isToday = day.date.toDateString() === new Date().toDateString();
                const dateKey = `${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}`;
                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={[
                      styles.weekDayCard,
                      isToday && { 
                        backgroundColor: '#a855f7',
                        borderColor: '#9333ea',
                        borderWidth: 3,
                      },
                    ]}
                    onPress={() => {
                      setSelectedDate(day.date);
                      setSelectedDayEvents(day.events);
                      setModalVisible(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.weekDayName,
                        isToday && { color: '#fff' },
                      ]}
                    >
                      {weekDayNames[day.date.getDay()]}
                    </Text>
                    <Text
                      style={[
                        styles.weekDayNumber,
                        isToday && { color: '#fff' },
                      ]}
                    >
                      {day.day}
                    </Text>
                    {day.events.length > 0 && (
                      <View style={[styles.weekEventBadge, { backgroundColor: getEventTypeColor(day.events[0].event_type) }]}>
                        <Text style={styles.weekEventCount}>{day.events.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Week Events List */}
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="event-note" size={24} color="#a855f7" />
              <Text style={styles.sectionTitle}>This Week's Events</Text>
            </View>
            {weekDays.some((d) => d.events.length > 0) ? (
              weekDays.map((day) =>
                day.events.length > 0 ? (
                  <View key={day.date.toISOString()} style={{ marginBottom: Spacing.sm }}>
                    <Text style={styles.dayHeader}>
                      {day.date.toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                    {day.events.map((event) => renderEventCard(event))}
                  </View>
                ) : null
              )
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-busy" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No events this week</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {renderQuickAddButton()}
        {renderDayModal()}
      </SafeAreaView>
    );
  }

  // Agenda View
  if (viewType === 'agenda') {
    // List View
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderHeader()}

          {/* Upcoming Events - Sorted by date */}
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="event-available" size={24} color="#10b981" />
              <Text style={styles.sectionTitle}>
                Upcoming Events ({filteredEvents.length})
              </Text>
            </View>

            {filteredEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-note" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No events found</Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery || selectedEventTypes.length > 0
                    ? 'Try adjusting your filters'
                    : 'Check back later for new events'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={[...filteredEvents].sort((a, b) => 
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

        {renderQuickAddButton()}
      </SafeAreaView>
    );
  }

  // Month View
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderHeader()}

        {/* Month Navigation */}
        <View style={styles.monthNavigation}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
            <MaterialIcons name="chevron-left" size={28} color={Colors.primary} />
          </TouchableOpacity>
          <View style={styles.monthNameContainer}>
            <Text style={styles.monthName}>{monthName}</Text>
            <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
            <MaterialIcons name="chevron-right" size={28} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Week Day Headers */}
        <View style={styles.weekDaysContainer}>
          {weekDayNames.map((day) => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid} {...panResponder.panHandlers}>
          {calendarDays.map((calendarDay) => {
            const isToday =
              calendarDay.isCurrentMonth &&
              calendarDay.date.toDateString() === new Date().toDateString();
            const isSelected =
              selectedDate && calendarDay.date.toDateString() === selectedDate.toDateString();
            const dateKey = `${calendarDay.year}-${calendarDay.month}-${calendarDay.day}`;

            return (
              <TouchableOpacity
                key={dateKey}
                style={[
                  styles.dayCell,
                  !calendarDay.isCurrentMonth && styles.dayCellDisabled,
                  isToday && [styles.dayCellToday, { 
                    backgroundColor: '#a855f7',
                    borderColor: '#9333ea',
                  }],
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
                    {calendarDay.events.slice(0, 2).map((event, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.eventDot,
                          { backgroundColor: isToday ? '#fff' : getEventTypeColor(event.event_type) },
                        ]}
                      />
                    ))}
                    {calendarDay.events.length > 2 && (
                      <Text
                        style={[
                          styles.moreDots,
                          { color: isToday ? '#fff' : '#a855f7' },
                        ]}
                      >
                        +{calendarDay.events.length - 2}
                      </Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderQuickAddButton()}
      {renderDayModal()}
    </SafeAreaView>
  );

  // Helper function: Quick Add Button
  function renderQuickAddButton() {
    return (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{
            scale: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            }),
          }],
        }}
      >
        <TouchableOpacity
          style={[styles.fabButton, { backgroundColor: '#a855f7' }]}
          onPress={() => navigation.navigate('CreateEvent')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Helper function: Day Details Modal
  function renderDayModal() {
    return (
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
    );
  }

  // Helper function: Render Event Card
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
    workshop: '#a855f7',     // Purple
    seminar: '#ec4899',      // Pink
    conference: '#f97316',   // Orange
    hackathon: '#eab308',    // Yellow
    meetup: '#10b981',       // Emerald
    webinar: '#14b8a6',      // Teal
    exam: '#ef4444',         // Red
    default: '#6b7280',      // Gray
  };
  return colors[type] || colors.default;
};

const getEventTypeGradient = (type: string) => {
  const gradients: { [key: string]: string[] } = {
    workshop: ['#a855f7', '#9333ea'],     // Purple gradient
    seminar: ['#ec4899', '#db2777'],      // Pink gradient
    conference: ['#f97316', '#ea580c'],   // Orange gradient
    hackathon: ['#eab308', '#ca8a04'],    // Yellow gradient
    meetup: ['#10b981', '#059669'],       // Emerald gradient
    webinar: ['#14b8a6', '#0d9488'],      // Teal gradient
    exam: ['#ef4444', '#dc2626'],         // Red gradient
    default: ['#6b7280', '#4b5563'],      // Gray gradient
  };
  return gradients[type] || gradients.default;
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
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderBottomWidth: 0,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
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
      justifyContent: 'space-between',
    },
    dayCell: {
      width: '13.6%',
      aspectRatio: 1,
      borderRadius: BorderRadius.xl,
      borderWidth: 2,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      marginBottom: 10,
      backgroundColor: Colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    dayCellDisabled: {
      backgroundColor: Colors.background,
      opacity: 0.5,
    },
    dayCellToday: {
      borderWidth: 0,
      shadowColor: '#a855f7',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    dayCellSelected: {
      borderWidth: 3,
      borderColor: '#ec4899',
      backgroundColor: '#fdf2f8',
      transform: [{ scale: 1.05 }],
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
      gap: 3,
      marginTop: 2,
      alignItems: 'center',
    },
    eventDot: {
      width: 6,
      height: 6,
      borderRadius: BorderRadius.full,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 1,
    },
    moreDots: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      marginLeft: 1,
    },
    section: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      marginTop: Spacing.sm,
    },
    sectionTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    eventsList: {
      gap: Spacing.md,
    },
    eventCard: {
      borderRadius: BorderRadius.xl,
      borderWidth: 0,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
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
      width: 48,
      height: 48,
      borderRadius: BorderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
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
    // New styles for enhanced UI
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Spacing.md,
    },
    loadingText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
    },
    headerTitle: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    filterButton: {
      padding: Spacing.sm,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.xl,
      marginTop: Spacing.md,
      backgroundColor: isDark ? '#1e293b' : '#f8fafc',
      borderWidth: 2,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      paddingVertical: 4,
    },
    statsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    statCard: {
      flex: 1,
      padding: Spacing.md,
      borderRadius: BorderRadius.xl,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    statCardPurple: {
      backgroundColor: '#faf5ff',
      borderWidth: 2,
      borderColor: '#e9d5ff',
    },
    statCardEmerald: {
      backgroundColor: '#f0fdf4',
      borderWidth: 2,
      borderColor: '#d1fae5',
    },
    statCardAmber: {
      backgroundColor: '#fffbeb',
      borderWidth: 2,
      borderColor: '#fde68a',
    },
    statIconContainer: {
      marginBottom: Spacing.xs,
    },
    statNumber: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      marginTop: 4,
    },
    statLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 4,
      fontWeight: FontWeights.semibold,
    },
    filtersContainer: {
      marginTop: Spacing.md,
    },
    filterTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    filterChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.surface,
      borderWidth: 2,
      borderColor: Colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    filterChipText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    viewSwitcher: {
      flexDirection: 'row',
      gap: Spacing.xs,
      marginTop: Spacing.md,
      backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
      borderRadius: BorderRadius.xl,
      padding: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    viewButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: 'transparent',
    },
    viewButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    monthNavigation: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      marginBottom: Spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    navButton: {
      padding: Spacing.sm,
    },
    monthNameContainer: {
      flex: 1,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    monthName: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    todayButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      backgroundColor: '#fdf2f8',
      borderWidth: 2,
      shadowColor: '#ec4899',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    todayButtonText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
    },
    weekGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.md,
      gap: 8,
      minWidth: '100%',
    },
    weekDayCard: {
      width: 48,
      aspectRatio: 0.85,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.surface,
      borderWidth: 2,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    weekDayName: {
      fontSize: 10,
      color: Colors.textSecondary,
      fontWeight: FontWeights.bold,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    weekDayNumber: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    weekEventBadge: {
      position: 'absolute',
      top: 2,
      right: 2,
      borderRadius: BorderRadius.full,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 3,
    },
    weekEventCount: {
      fontSize: 10,
      color: '#fff',
      fontWeight: FontWeights.bold,
    },
    dayHeader: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: isDark ? '#1e293b' : '#f8fafc',
      borderRadius: BorderRadius.lg,
      borderLeftWidth: 4,
      borderLeftColor: '#a855f7',
    },
    emptySubtext: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    fabButton: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 12,
      shadowColor: '#a855f7',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
    },
  });
