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
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getEvents } from '../../api/events';
import Toast from 'react-native-toast-message';
import {
  createExamSchedule,
  deleteExamSchedule,
  ExamSchedule,
  getExamSchedules,
  updateExamSchedule,
} from '../../api/exams';
import { isFacultyOrAdminRole } from '../../utils/roles';

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

const isExamEvent = (event?: Partial<Event> | null) => {
  if (!event) return false;
  const type = String(event.event_type || '').toLowerCase();
  const title = String(event.title || '').trim();
  return type === 'exam' || /^exam\s*:/i.test(title);
};

const toGoogleCalendarDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const isValidIsoDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const formatDateForDisplay = (value: string) => {
  const normalized = String(value || '').trim().slice(0, 10);
  if (!isValidIsoDateOnly(normalized)) return value;
  const [year, month, day] = normalized.split('-');
  return `${day}-${month}-${year.slice(2)}`;
};

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
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
  const [examRows, setExamRows] = useState<ExamSchedule[]>([]);
  const [showExamModal, setShowExamModal] = useState(false);
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [showExamDatePicker, setShowExamDatePicker] = useState(false);
  const [examDescription, setExamDescription] = useState('');
  
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
  const canManageExams = isFacultyOrAdminRole(profile?.role);
  const formatDateInput = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

  const examRowToEvent = (exam: ExamSchedule): Event => {
    const dateKey = String(exam.exam_date || '').slice(0, 10);
    const startTime = exam.start_time || '09:00:00';
    const endTime = exam.end_time || '10:00:00';
    return {
      id: `exam:${exam.id}`,
      title: exam.title,
      description: exam.description || 'Scheduled exam',
      event_type: 'exam',
      start_date: `${dateKey}T${startTime}`,
      end_date: `${dateKey}T${endTime}`,
      registration_deadline: `${dateKey}T00:00:00`,
      venue: exam.department || undefined,
      is_registered: false,
      registrations_count: 0,
    };
  };

  const getExamIdFromEvent = (event: Event): string | null => {
    if (!event?.id?.startsWith('exam:')) return null;
    const [, id] = event.id.split(':');
    return id || null;
  };

  const closeExamModal = () => {
    setShowExamModal(false);
    setShowExamDatePicker(false);
    setEditingExamId(null);
  };

  const openExamModal = (date?: Date) => {
    const baseDate = date || selectedDate || currentDate;
    setEditingExamId(null);
    setExamDate(formatDateInput(baseDate));
    setExamTitle('');
    setExamDescription('');
    setShowExamDatePicker(false);
    setShowExamModal(true);
  };

  const openEditExamModal = (event: Event) => {
    if (!canManageExams || !isExamEvent(event)) return;
    const examId = getExamIdFromEvent(event);
    if (!examId) return;
    const row = examRows.find((item) => item.id === examId);
    if (!row) return;

    setEditingExamId(row.id);
    setExamDate(String(row.exam_date || '').slice(0, 10));
    setExamTitle(row.title || '');
    setExamDescription(row.description || '');
    setShowExamDatePicker(false);
    setShowExamModal(true);
  };
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

      const [eventData, exams] = await Promise.all([
        getEvents(user.id, undefined, 'all'),
        getExamSchedules(),
      ]);
      const mappedExams = (exams || []).map(examRowToEvent);
      const normalEvents = (eventData || []).filter((event: Event) => !isExamEvent(event));
      const mergedEvents = [...normalEvents, ...mappedExams];

      setExamRows(exams || []);
      setEvents(mergedEvents);
      setFilteredEvents(mergedEvents);
      
      // Build calendar and week view
      generateCalendarDays(currentDate, mergedEvents);
      generateWeekDays(currentDate, mergedEvents);
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
    const nowTs = Date.now();
    const nonExamEvents = filteredEvents.filter((e) => !isExamEvent(e));
    const total = nonExamEvents.length;
    const registered = nonExamEvents.filter((e) => {
      if (!e.is_registered) return false;
      const eventDate = new Date(e.start_date);
      return (
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      );
    }).length;
    const upcoming = nonExamEvents.filter(
      (e) => new Date(e.start_date).getTime() > nowTs
    ).length;
    const thisMonth = nonExamEvents.filter((e) => {
      const eventDate = new Date(e.start_date);
      return (
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      );
    }).length;

    return { total, registered, upcoming, thisMonth };
  };

  const upcomingEvents = filteredEvents.filter(
    (event) => !isExamEvent(event) && new Date(event.start_date).getTime() > Date.now()
  );

  const handleCreateExam = async () => {
    if (!user?.id || !canManageExams) return;

    const title = examTitle.trim();
    const date = examDate.trim();

    if (!title || !date) {
      Toast.show({ type: 'error', text1: 'Title and date are required' });
      return;
    }

    if (title.length < 3) {
      Toast.show({ type: 'error', text1: 'Title must be at least 3 characters' });
      return;
    }

    if (title.length > 120) {
      Toast.show({ type: 'error', text1: 'Title cannot exceed 120 characters' });
      return;
    }

    if (!isValidIsoDateOnly(date)) {
      Toast.show({ type: 'error', text1: 'Date must be valid (DD-MM-YY)' });
      return;
    }

    try {
      setIsCreatingExam(true);
      if (editingExamId) {
        await updateExamSchedule(
          editingExamId,
          {
            title,
            description: examDescription.trim() || null,
            exam_date: date,
          },
          user.id
        );
        Toast.show({ type: 'success', text1: 'Exam updated' });
      } else {
        await createExamSchedule(
          {
            title,
            description: examDescription.trim() || null,
            exam_date: date,
          },
          user.id
        );
        Toast.show({ type: 'success', text1: 'Exam added' });
      }

      closeExamModal();
      await loadEventsAndCalendar();
    } catch (error: any) {
      console.error('Save exam error:', error);
      Toast.show({ type: 'error', text1: 'Failed to save exam', text2: error?.message || 'Please try again' });
    } finally {
      setIsCreatingExam(false);
    }
  };

  const handleDeleteExam = (event: Event) => {
    if (!canManageExams || !isExamEvent(event)) return;
    const examId = getExamIdFromEvent(event);
    if (!examId) return;

    Alert.alert(
      'Delete exam?',
      `This will permanently remove "${event.title}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExamSchedule(examId);
              setSelectedDayEvents((prev) => prev.filter((item) => item.id !== event.id));
              Toast.show({ type: 'success', text1: 'Exam deleted' });
              await loadEventsAndCalendar();
            } catch (error: any) {
              console.error('Delete exam error:', error);
              Toast.show({
                type: 'error',
                text1: 'Failed to delete exam',
                text2: error?.message || 'Please try again',
              });
            }
          },
        },
      ]
    );
  };


  const handleAddToCalendar = async (event: Event) => {
    try {
      const title = String(event.title || '').trim();
      if (!title) {
        Toast.show({ type: 'error', text1: 'Event title is missing' });
        return;
      }

      const startDate = new Date(event.start_date);
      const parsedEndDate = event.end_date ? new Date(event.end_date) : new Date(NaN);
      const fallbackEndDate = Number.isNaN(parsedEndDate.getTime())
        ? new Date(startDate.getTime() + 60 * 60 * 1000)
        : parsedEndDate;
      const endDate = fallbackEndDate.getTime() <= startDate.getTime()
        ? new Date(startDate.getTime() + 60 * 60 * 1000)
        : fallbackEndDate;
      const startCal = toGoogleCalendarDate(startDate.toISOString());
      const endCal = toGoogleCalendarDate(endDate.toISOString());

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || !startCal || !endCal) {
        Toast.show({ type: 'error', text1: 'Invalid event date/time' });
        return;
      }

      const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        title
      )}&details=${encodeURIComponent(event.description || '')}&location=${encodeURIComponent(
        event.venue || ''
      )}&dates=${startCal}/${endCal}`;

      await Linking.openURL(calendarUrl);

      Toast.show({
        type: 'success',
        text1: 'Opening calendar...',
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Could not open calendar' });
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
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="arrow-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Calendar</Text>
        </View>
        <View style={styles.headerActions}>
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

        {renderAddExamModal()}
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
                Upcoming Events ({upcomingEvents.length})
              </Text>
            </View>

            {upcomingEvents.length === 0 ? (
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
                data={[...upcomingEvents].sort((a, b) => 
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
        {renderAddExamModal()}
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
            const hasExam = calendarDay.events.some((event) => isExamEvent(event));
            const dateKey = `${calendarDay.year}-${calendarDay.month}-${calendarDay.day}`;

            return (
              <TouchableOpacity
                key={dateKey}
                style={[
                  styles.dayCell,
                  !calendarDay.isCurrentMonth && styles.dayCellDisabled,
                  hasExam && !isToday && styles.dayCellExam,
                  isToday && [styles.dayCellToday, { 
                    backgroundColor: '#a855f7',
                    borderColor: '#9333ea',
                  }],
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

                  {calendarDay.events.filter((event) => !isExamEvent(event)).length > 0 && (
                  <View style={styles.eventDots}>
                    {calendarDay.events
                      .filter((event) => !isExamEvent(event))
                      .slice(0, 2)
                      .map((event, idx) => (
                      (() => {
                        const effectiveType = isExamEvent(event) ? 'exam' : event.event_type;
                        return (
                      <View
                        key={idx}
                        style={[
                          styles.eventDot,
                          { backgroundColor: isToday ? '#fff' : getEventTypeColor(effectiveType) },
                        ]}
                      />
                        );
                      })()
                    ))}
                    {calendarDay.events.filter((event) => !isExamEvent(event)).length > 2 && (
                      <Text
                        style={[
                          styles.moreDots,
                          { color: isToday ? '#fff' : '#a855f7' },
                        ]}
                      >
                        +{calendarDay.events.filter((event) => !isExamEvent(event)).length - 2}
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
      {renderAddExamModal()}
      {renderDayModal()}
    </SafeAreaView>
  );

  // Helper function: Quick Add Button
  function renderQuickAddButton() {
    if (!canManageExams) return null;

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
          style={[styles.fabButton, { backgroundColor: '#dc2626' }]}
          onPress={() => openExamModal()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderAddExamModal() {
    return (
      <Modal visible={showExamModal} transparent animationType="slide" onRequestClose={closeExamModal}>
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}> 
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingExamId ? 'Edit Exam' : 'Add Exam'}</Text>
                <TouchableOpacity onPress={closeExamModal}>
                  <MaterialIcons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              >
                <TextInput
                  style={[styles.formInput, { borderColor: Colors.border, color: Colors.text, backgroundColor: Colors.background }]}
                  placeholder="Exam title"
                  placeholderTextColor={Colors.textSecondary}
                  value={examTitle}
                  onChangeText={setExamTitle}
                  returnKeyType="next"
                />
                <TouchableOpacity
                  style={[styles.formInput, styles.datePickerTrigger, { borderColor: Colors.border, backgroundColor: Colors.background }]}
                  onPress={() => setShowExamDatePicker(true)}
                >
                  <View style={styles.datePickerLabelWrap}>
                    <MaterialIcons name="calendar-today" size={16} color={Colors.textSecondary} />
                    <Text style={[styles.datePickerLabel, { color: examDate ? Colors.text : Colors.textSecondary }]}> 
                      {examDate ? formatDateForDisplay(examDate) : 'Select exam date (DD-MM-YY)'}
                    </Text>
                  </View>
                  <MaterialIcons name="expand-more" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
                {showExamDatePicker && (
                  <View style={[styles.datePickerContainer, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                    <DateTimePicker
                      value={(() => {
                        const parsed = new Date(examDate || '');
                        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
                      })()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_event, selectedDate) => {
                        if (selectedDate) {
                          setExamDate(formatDateInput(selectedDate));
                        }
                        if (Platform.OS !== 'ios') {
                          setShowExamDatePicker(false);
                        }
                      }}
                    />
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity style={styles.datePickerDoneBtn} onPress={() => setShowExamDatePicker(false)}>
                        <Text style={[styles.datePickerDoneText, { color: Colors.primary }]}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <TextInput
                  style={[styles.formInput, styles.multilineInput, { borderColor: Colors.border, color: Colors.text, backgroundColor: Colors.background }]}
                  placeholder="Description (optional)"
                  placeholderTextColor={Colors.textSecondary}
                  value={examDescription}
                  onChangeText={setExamDescription}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.actionButtonPrimary, { backgroundColor: '#dc2626' }, isCreatingExam && { opacity: 0.7 }]}
                  onPress={handleCreateExam}
                  disabled={isCreatingExam}
                >
                  {isCreatingExam ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.actionButtonPrimaryText}>{editingExamId ? 'Update Exam' : 'Save Exam'}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    const effectiveType = isExamEvent(event) ? 'exam' : event.event_type;
    const isExam = isExamEvent(event);
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
        onPress={isExam ? undefined : () => navigation.navigate('EventDetails', { eventId: event.id })}
        activeOpacity={isExam ? 1 : 0.7}
      >
        <View style={styles.eventCardHeader}>
          <View style={styles.eventCardLeft}>
            <View
              style={[
                styles.eventTypeIcon,
                { backgroundColor: getEventTypeColor(effectiveType) + '20' },
              ]}
            >
              <MaterialIcons
                name={getEventTypeIcon(effectiveType)}
                size={20}
                color={getEventTypeColor(effectiveType)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              {!isExam && (
                <Text style={styles.eventTime}>
                  <MaterialIcons name="access-time" size={12} /> {eventTime}
                </Text>
              )}
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

            {canManageExams && isExamEvent(event) && (
              <View style={styles.eventFooter}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#dbeafe' }]}
                  onPress={() => openEditExamModal(event)}
                >
                  <MaterialIcons name="edit" size={16} color="#1d4ed8" />
                  <Text style={[styles.actionButtonText, { color: '#1d4ed8' }]}>Edit Exam</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#fee2e2' }]}
                  onPress={() => handleDeleteExam(event)}
                >
                  <MaterialIcons name="delete-outline" size={16} color="#b91c1c" />
                  <Text style={[styles.actionButtonText, { color: '#b91c1c' }]}>Delete Exam</Text>
                </TouchableOpacity>
              </View>
            )}

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
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    headerBackButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    examAddButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fee2e2',
      borderWidth: 1,
      borderColor: '#fecaca',
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
    dayCellExam: {
      borderColor: '#dc2626',
      backgroundColor: '#fef2f2',
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
    modalKeyboardAvoidingView: {
      flex: 1,
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
    modalBodyContent: {
      paddingBottom: Spacing.lg,
    },
    formInput: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      fontSize: FontSizes.sm,
    },
    datePickerTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    datePickerLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    datePickerLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    datePickerContainer: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      marginBottom: 10,
      overflow: 'hidden',
    },
    datePickerDoneBtn: {
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
    },
    datePickerDoneText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    multilineInput: {
      minHeight: 90,
      textAlignVertical: 'top',
    },
    actionButtonPrimary: {
      borderRadius: BorderRadius.lg,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 6,
      marginBottom: 12,
    },
    actionButtonPrimaryText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
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
