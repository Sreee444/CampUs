// ...existing code...
import React, { useState, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  Modal,
  Animated,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { isAdminRole } from '../../utils/roles';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { DEPARTMENTS, YEARS } from '../../utils/teamUtils';

type CreateEventScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CreateEvent'>;

interface EventFormData {
  title: string;
  description: string;
  event_type: string;
  start_date: Date;
  end_date: Date;
  venue: string;
  is_online: boolean;
  meeting_link: string;
  max_participants: number;
  registration_deadline: Date;
  banner_image: string;
  participation_type: 'individual' | 'team';
  min_team_size: number;
  max_team_size: number;
  eligibility_type: 'college' | 'department' | 'year' | 'department_year';
  eligible_departments: string[];
  eligible_years: number[];
}

const EVENT_TYPES = [
  { id: 'workshop', label: 'Workshop', icon: '🛠️' },
  { id: 'seminar', label: 'Seminar', icon: '🎓' },
  { id: 'hackathon', label: 'Hackathon', icon: '💻' },
  { id: 'competition', label: 'Competition', icon: '🏆' },
  { id: 'fest', label: 'Fest', icon: '🎉' },
  { id: 'other', label: 'Other', icon: '📅' },
];

const STEPS = [
  { key: 'basics', title: 'Basics', icon: 'edit' as const },
  { key: 'schedule', title: 'Schedule', icon: 'event' as const },
  { key: 'details', title: 'Details', icon: 'tune' as const },
  { key: 'review', title: 'Review', icon: 'check-circle' as const },
];

const ACCENT = '#4f46e5';
const BG = '#f5f5f7';

export default function CreateEventScreen() {
  const navigation = useNavigation<CreateEventScreenNavigationProp>();
  const { user, profile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    event_type: '',
    start_date: new Date(),
    end_date: new Date(Date.now() + 2 * 60 * 60 * 1000),
    venue: '',
    is_online: false,
    meeting_link: '',
    max_participants: 50,
    registration_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    banner_image: '',
    participation_type: 'individual',
    min_team_size: 2,
    max_team_size: 5,
    eligibility_type: 'college',
    eligible_departments: [],
    eligible_years: [],
  });

  const [showPicker, setShowPicker] = useState<{
    field: keyof EventFormData | null;
    mode: 'date' | 'time';
    show: boolean;
  }>({ field: null, mode: 'date', show: false });

  // Check permissions
  const canCreateEvent = profile && (
    profile.role === 'faculty' ||
    profile.role === 'admin' ||
    profile.is_club_coordinator ||
    profile.is_volunteer
  );

  // ─── Image Upload ─────────────────
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Toast.show({ type: 'error', text1: 'Permission to access gallery is required!' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      const fileExt = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
      const fileName = 'event-poster-' + Date.now() + '.' + fileExt;
      const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const byteCharacters = atob(base64);
      const uint8Array = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        uint8Array[i] = byteCharacters.charCodeAt(i);
      }

      const { error } = await supabase.storage
        .from('event-banners')
        .upload(fileName, uint8Array, { contentType, upsert: true });
      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from('event-banners')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, banner_image: publicUrlData.publicUrl }));
      Toast.show({ type: 'success', text1: 'Poster uploaded!' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Upload failed', text2: err.message || 'Try again' });
    } finally {
      setUploading(false);
    }
  };

  // ─── Date Handling ─────────────────
  const handleDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') closeDatePicker();
    if (selectedDate && showPicker.field) {
      setFormData(prev => ({ ...prev, [showPicker.field as string]: selectedDate }));
      if (Platform.OS === 'ios' && showPicker.mode === 'date') {
        setTimeout(() => setShowPicker({ field: showPicker.field, mode: 'time', show: true }), 300);
      }
    }
  };

  const showDatePicker = (field: keyof EventFormData, mode: 'date' | 'time' = 'date') => {
    setShowPicker({ field, mode, show: true });
  };

  const closeDatePicker = () => {
    setShowPicker({ field: null, mode: 'date', show: false });
  };

  const handleQuickDate = (field: keyof EventFormData, hoursFromNow: number) => {
    setFormData(prev => ({ ...prev, [field]: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000) }));
    closeDatePicker();
  };

  // ─── Max Participants TextInput ─────
  const handleMaxParticipantsChange = (text: string) => {
    const num = parseInt(text, 10);
    if (text === '') {
      setFormData(prev => ({ ...prev, max_participants: 1 }));
    } else if (!isNaN(num)) {
      setFormData(prev => ({ ...prev, max_participants: Math.max(1, Math.min(9999, num)) }));
    }
  };

  // ─── Step Navigation ─────────────────
  const animateToStep = (step: number) => {
    Animated.timing(progressAnim, {
      toValue: step,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setCurrentStep(step);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goNext = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < STEPS.length - 1) animateToStep(currentStep + 1);
  };

  const goBack = () => {
    if (currentStep > 0) animateToStep(currentStep - 1);
    else navigation.goBack();
  };

  const goToStep = (step: number) => {
    animateToStep(step);
  };

  // ─── Validation ─────────────────
  const validateStep = (step: number): boolean => {
    if (step === 0) {
      if (!formData.title.trim()) {
        Toast.show({ type: 'error', text1: 'Event title is required' });
        return false;
      }
      if (!formData.description.trim()) {
        Toast.show({ type: 'error', text1: 'Event description is required' });
        return false;
      }
      if (!formData.event_type) {
        Toast.show({ type: 'error', text1: 'Please select an event type' });
        return false;
      }
    }
    if (step === 1) {
      if (formData.start_date >= formData.end_date) {
        Toast.show({ type: 'error', text1: 'End date must be after start date' });
        return false;
      }
      if (formData.registration_deadline >= formData.start_date) {
        Toast.show({ type: 'error', text1: 'Registration deadline must be before event start' });
        return false;
      }
      if (formData.is_online && !formData.meeting_link.trim()) {
        Toast.show({ type: 'error', text1: 'Meeting link is required for online events' });
        return false;
      }
      if (!formData.is_online && !formData.venue.trim()) {
        Toast.show({ type: 'error', text1: 'Venue is required for offline events' });
        return false;
      }
    }
    return true;
  };

  // ─── Submit ─────────────────
  const handleSubmit = async () => {
    if (!user?.id || !canCreateEvent) {
      Toast.show({ type: 'error', text1: 'You do not have permission to create events' });
      return;
    }
    for (let i = 0; i < 3; i++) {
      if (!validateStep(i)) {
        animateToStep(i);
        return;
      }
    }
    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('events')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim(),
          event_type: formData.event_type,
          start_date: formData.start_date.toISOString(),
          end_date: formData.end_date.toISOString(),
          venue: formData.venue.trim(),
          is_online: formData.is_online,
          meeting_link: formData.meeting_link.trim() || null,
          max_participants: formData.max_participants,
          registration_deadline: formData.registration_deadline.toISOString(),
          banner_image: formData.banner_image.trim() || null,
          created_by: user.id,
          organizers: [user.id],
          participation_type: formData.participation_type,
          min_team_size: formData.participation_type === 'team' ? formData.min_team_size : null,
          max_team_size: formData.participation_type === 'team' ? formData.max_team_size : null,
          eligibility_type: formData.eligibility_type,
          eligible_departments: ['department', 'department_year'].includes(formData.eligibility_type)
            ? formData.eligible_departments : [],
          eligible_years: ['year', 'department_year'].includes(formData.eligibility_type)
            ? formData.eligible_years : [],
        } as any)
        .select()
        .single();
      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Event created!', text2: 'Students can now register.' });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to create event', text2: error.message || 'Try again' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Helper formatters ─────────────────
  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const getEventTypeLabel = (id: string) =>
    EVENT_TYPES.find(t => t.id === id)?.label || id;

  const getEventTypeIcon = (id: string) =>
    EVENT_TYPES.find(t => t.id === id)?.icon || '📅';

  const getEligibilityLabel = () => {
    switch (formData.eligibility_type) {
      case 'college': return 'Open to all students';
      case 'department': return formData.eligible_departments.join(', ') || 'Select departments';
      case 'year': return formData.eligible_years.map(y => 'Year ' + y).join(', ') || 'Select years';
      case 'department_year': {
        const depts = formData.eligible_departments.join(', ') || 'All depts';
        const yrs = formData.eligible_years.map(y => 'Y' + y).join(', ') || 'All years';
        return depts + ' · ' + yrs;
      }
      default: return '';
    }
  };

  // ─── Access Denied ─────────────────
  if (!canCreateEvent) {
    return (
      <View style={st.container}>
        <View style={st.accessDenied}>
          <View style={st.accessDeniedIcon}>
            <MaterialIcons name="lock-outline" size={40} color={ACCENT} />
          </View>
          <Text style={st.accessDeniedTitle}>Access Restricted</Text>
          <Text style={st.accessDeniedText}>
            Only faculty, coordinators, and volunteers can create events.
          </Text>
          <TouchableOpacity style={st.accessDeniedBtn} onPress={() => navigation.goBack()}>
            <Text style={st.accessDeniedBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Step Progress Indicator ─────────────────
  const renderProgressBar = () => {
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, STEPS.length - 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <View style={st.progressContainer}>
        <View style={st.progressSteps}>
          {STEPS.map((step, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;
            return (
              <TouchableOpacity
                key={step.key}
                style={st.progressStep}
                onPress={() => { if (i < currentStep) goToStep(i); }}
                disabled={i > currentStep}
              >
                <View style={[
                  st.stepDot,
                  isActive && st.stepDotActive,
                  isCompleted && st.stepDotCompleted,
                ]}>
                  {isCompleted ? (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  ) : (
                    <Text style={[
                      st.stepDotText,
                      (isActive || isCompleted) && st.stepDotTextActive,
                    ]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[
                  st.stepLabel,
                  isActive && st.stepLabelActive,
                  isCompleted && st.stepLabelCompleted,
                ]}>{step.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={st.progressTrack}>
          <Animated.View style={[st.progressFill, { width: progressWidth }]} />
        </View>
      </View>
    );
  };

  // ═════════════════════════════════════
  // STEP 1: BASICS
  // ═════════════════════════════════════
  const renderStep1 = () => (
    <View style={st.stepContent}>
      <Text style={st.stepTitle}>Event Basics</Text>
      <Text style={st.stepSubtitle}>Tell us about your event</Text>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Event Title <Text style={st.required}>*</Text></Text>
        <TextInput
          style={st.input}
          value={formData.title}
          onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
          placeholder="Give your event a catchy name"
          placeholderTextColor="#9ca3af"
          maxLength={100}
        />
        <Text style={st.charCount}>{formData.title.length}/100</Text>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Description <Text style={st.required}>*</Text></Text>
        <TextInput
          style={[st.input, st.textArea]}
          value={formData.description}
          onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
          placeholder="What's this event about? Include key details..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={5}
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={st.charCount}>{formData.description.length}/500</Text>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Event Type <Text style={st.required}>*</Text></Text>
        <View style={st.chipGrid}>
          {EVENT_TYPES.map((type) => {
            const isSelected = formData.event_type === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                style={[st.chip, isSelected && st.chipSelected]}
                onPress={() => setFormData(prev => ({ ...prev, event_type: type.id }))}
              >
                <Text style={st.chipIcon}>{type.icon}</Text>
                <Text style={[st.chipText, isSelected && st.chipTextSelected]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Participation Type</Text>
        <View style={st.toggleRow}>
          <TouchableOpacity
            style={[st.toggleBtn, formData.participation_type === 'individual' && st.toggleBtnActive]}
            onPress={() => setFormData(prev => ({ ...prev, participation_type: 'individual' }))}
          >
            <MaterialIcons name="person" size={18} color={formData.participation_type === 'individual' ? '#fff' : '#6b7280'} />
            <Text style={[st.toggleBtnText, formData.participation_type === 'individual' && st.toggleBtnTextActive]}>Individual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.toggleBtn, formData.participation_type === 'team' && st.toggleBtnActive]}
            onPress={() => setFormData(prev => ({ ...prev, participation_type: 'team' }))}
          >
            <MaterialIcons name="groups" size={18} color={formData.participation_type === 'team' ? '#fff' : '#6b7280'} />
            <Text style={[st.toggleBtnText, formData.participation_type === 'team' && st.toggleBtnTextActive]}>Team</Text>
          </TouchableOpacity>
        </View>

        {formData.participation_type === 'team' && (
          <View style={st.teamSizeRow}>
            <View style={st.teamSizeField}>
              <Text style={st.teamSizeLabel}>Min Size</Text>
              <View style={st.counterRow}>
                <TouchableOpacity style={st.counterBtn} onPress={() => setFormData(prev => ({ ...prev, min_team_size: Math.max(2, prev.min_team_size - 1) }))}>
                  <MaterialIcons name="remove" size={18} color="#374151" />
                </TouchableOpacity>
                <Text style={st.counterValue}>{formData.min_team_size}</Text>
                <TouchableOpacity style={st.counterBtn} onPress={() => setFormData(prev => ({ ...prev, min_team_size: Math.min(prev.max_team_size, prev.min_team_size + 1) }))}>
                  <MaterialIcons name="add" size={18} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={st.teamSizeField}>
              <Text style={st.teamSizeLabel}>Max Size</Text>
              <View style={st.counterRow}>
                <TouchableOpacity style={st.counterBtn} onPress={() => setFormData(prev => ({ ...prev, max_team_size: Math.max(prev.min_team_size, prev.max_team_size - 1) }))}>
                  <MaterialIcons name="remove" size={18} color="#374151" />
                </TouchableOpacity>
                <Text style={st.counterValue}>{formData.max_team_size}</Text>
                <TouchableOpacity style={st.counterBtn} onPress={() => setFormData(prev => ({ ...prev, max_team_size: prev.max_team_size + 1 }))}>
                  <MaterialIcons name="add" size={18} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Who can participate?</Text>
        <View style={st.chipGrid}>
          {([
            { id: 'college', label: 'College-wide', icon: '🏫' },
            { id: 'department', label: 'Department', icon: '🏛️' },
            { id: 'year', label: 'Year', icon: '📅' },
            { id: 'department_year', label: 'Dept + Year', icon: '🎯' },
          ] as const).map((opt) => {
            const isSel = formData.eligibility_type === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[st.chip, isSel && st.chipSelected]}
                onPress={() => setFormData(prev => ({ ...prev, eligibility_type: opt.id as any, eligible_departments: [], eligible_years: [] }))}
              >
                <Text style={st.chipIcon}>{opt.icon}</Text>
                <Text style={[st.chipText, isSel && st.chipTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {['department', 'department_year'].includes(formData.eligibility_type) && (
          <View style={st.subFieldGroup}>
            <Text style={st.subFieldLabel}>Select Departments</Text>
            <View style={st.chipGrid}>
              {DEPARTMENTS.map((dept) => {
                const isSel = formData.eligible_departments.includes(dept);
                return (
                  <TouchableOpacity
                    key={dept}
                    style={[st.chipSmall, isSel && st.chipSmallSelected]}
                    onPress={() => setFormData(prev => ({
                      ...prev,
                      eligible_departments: isSel
                        ? prev.eligible_departments.filter(d => d !== dept)
                        : [...prev.eligible_departments, dept],
                    }))}
                  >
                    <Text style={[st.chipSmallText, isSel && st.chipSmallTextSelected]}>{dept}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {['year', 'department_year'].includes(formData.eligibility_type) && (
          <View style={st.subFieldGroup}>
            <Text style={st.subFieldLabel}>Select Years</Text>
            <View style={st.chipGrid}>
              {YEARS.map((yr) => {
                const isSel = formData.eligible_years.includes(yr);
                return (
                  <TouchableOpacity
                    key={yr}
                    style={[st.chipSmall, isSel && st.chipSmallSelected]}
                    onPress={() => setFormData(prev => ({
                      ...prev,
                      eligible_years: isSel
                        ? prev.eligible_years.filter(y => y !== yr)
                        : [...prev.eligible_years, yr],
                    }))}
                  >
                    <Text style={[st.chipSmallText, isSel && st.chipSmallTextSelected]}>{'Year ' + yr}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </View>
  );

  // ═════════════════════════════════════
  // STEP 2: SCHEDULE & LOCATION
  // ═════════════════════════════════════
  const renderStep2 = () => (
    <View style={st.stepContent}>
      <Text style={st.stepTitle}>Schedule & Venue</Text>
      <Text style={st.stepSubtitle}>When and where is it happening?</Text>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Start Date & Time <Text style={st.required}>*</Text></Text>
        <View style={st.dateRow}>
          <TouchableOpacity style={st.dateBtn} onPress={() => showDatePicker('start_date', 'date')}>
            <MaterialIcons name="event" size={18} color={ACCENT} />
            <Text style={st.dateBtnText}>{formatDate(formData.start_date)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.dateBtn} onPress={() => showDatePicker('start_date', 'time')}>
            <MaterialIcons name="access-time" size={18} color={ACCENT} />
            <Text style={st.dateBtnText}>{formatTime(formData.start_date)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>End Date & Time <Text style={st.required}>*</Text></Text>
        <View style={st.dateRow}>
          <TouchableOpacity style={st.dateBtn} onPress={() => showDatePicker('end_date', 'date')}>
            <MaterialIcons name="event" size={18} color={ACCENT} />
            <Text style={st.dateBtnText}>{formatDate(formData.end_date)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.dateBtn} onPress={() => showDatePicker('end_date', 'time')}>
            <MaterialIcons name="access-time" size={18} color={ACCENT} />
            <Text style={st.dateBtnText}>{formatTime(formData.end_date)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Registration Deadline <Text style={st.required}>*</Text></Text>
        <View style={st.dateRow}>
          <TouchableOpacity style={st.dateBtn} onPress={() => showDatePicker('registration_deadline', 'date')}>
            <MaterialIcons name="event" size={18} color="#ea580c" />
            <Text style={st.dateBtnText}>{formatDate(formData.registration_deadline)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.dateBtn} onPress={() => showDatePicker('registration_deadline', 'time')}>
            <MaterialIcons name="access-time" size={18} color="#ea580c" />
            <Text style={st.dateBtnText}>{formatTime(formData.registration_deadline)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Location</Text>
        <View style={st.toggleRow}>
          <TouchableOpacity
            style={[st.toggleBtn, !formData.is_online && st.toggleBtnActive]}
            onPress={() => setFormData(prev => ({ ...prev, is_online: false }))}
          >
            <MaterialIcons name="location-on" size={18} color={!formData.is_online ? '#fff' : '#6b7280'} />
            <Text style={[st.toggleBtnText, !formData.is_online && st.toggleBtnTextActive]}>Offline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.toggleBtn, formData.is_online && st.toggleBtnActive]}
            onPress={() => setFormData(prev => ({ ...prev, is_online: true }))}
          >
            <MaterialIcons name="videocam" size={18} color={formData.is_online ? '#fff' : '#6b7280'} />
            <Text style={[st.toggleBtnText, formData.is_online && st.toggleBtnTextActive]}>Online</Text>
          </TouchableOpacity>
        </View>

        {formData.is_online ? (
          <View style={{ marginTop: 12 }}>
            <Text style={st.subFieldLabel}>Meeting Link <Text style={st.required}>*</Text></Text>
            <TextInput
              style={st.input}
              value={formData.meeting_link}
              onChangeText={(text) => setFormData(prev => ({ ...prev, meeting_link: text }))}
              placeholder="https://meet.google.com/..."
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Text style={st.subFieldLabel}>Venue <Text style={st.required}>*</Text></Text>
            <TextInput
              style={st.input}
              value={formData.venue}
              onChangeText={(text) => setFormData(prev => ({ ...prev, venue: text }))}
              placeholder="e.g. Main Auditorium, Block A"
              placeholderTextColor="#9ca3af"
            />
          </View>
        )}
      </View>
    </View>
  );

  // ═════════════════════════════════════
  // STEP 3: CAPACITY & POSTER
  // ═════════════════════════════════════
  const renderStep3 = () => (
    <View style={st.stepContent}>
      <Text style={st.stepTitle}>Details & Media</Text>
      <Text style={st.stepSubtitle}>Set capacity and add a poster</Text>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Max Participants</Text>
        <View style={st.counterRowLarge}>
          <TouchableOpacity
            style={st.counterBtnLarge}
            onPress={() => setFormData(prev => ({ ...prev, max_participants: Math.max(1, prev.max_participants - 5) }))}
          >
            <MaterialIcons name="remove" size={22} color="#374151" />
          </TouchableOpacity>
          <TextInput
            style={st.counterInput}
            value={String(formData.max_participants)}
            onChangeText={handleMaxParticipantsChange}
            keyboardType="number-pad"
            maxLength={4}
            selectTextOnFocus
          />
          <TouchableOpacity
            style={st.counterBtnLarge}
            onPress={() => setFormData(prev => ({ ...prev, max_participants: Math.min(9999, prev.max_participants + 5) }))}
          >
            <MaterialIcons name="add" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <Text style={st.fieldHint}>Use +/- for increments of 5, or type directly</Text>
      </View>

      <View style={st.fieldGroup}>
        <Text style={st.fieldLabel}>Event Poster</Text>
        {formData.banner_image ? (
          <View style={st.posterPreview}>
            <Image
              source={{ uri: formData.banner_image }}
              style={st.posterImage}
              resizeMode="cover"
            />
            <View style={st.posterActions}>
              <TouchableOpacity style={st.posterChangeBtn} onPress={pickImage} disabled={uploading}>
                <MaterialIcons name="edit" size={16} color={ACCENT} />
                <Text style={st.posterChangeBtnText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={st.posterRemoveBtn}
                onPress={() => setFormData(prev => ({ ...prev, banner_image: '' }))}
              >
                <MaterialIcons name="delete-outline" size={16} color="#ef4444" />
                <Text style={st.posterRemoveBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={st.uploadArea} onPress={pickImage} disabled={uploading}>
            <View style={st.uploadIconWrapper}>
              <MaterialIcons name="cloud-upload" size={32} color={ACCENT} />
            </View>
            <Text style={st.uploadTitle}>
              {uploading ? 'Uploading...' : 'Upload Event Poster'}
            </Text>
            <Text style={st.uploadHint}>JPG, PNG or WebP · Recommended 16:9</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ═════════════════════════════════════
  // STEP 4: REVIEW & CONFIRM
  // ═════════════════════════════════════
  const renderStep4 = () => (
    <View style={st.stepContent}>
      <Text style={st.stepTitle}>Review & Submit</Text>
      <Text style={st.stepSubtitle}>Make sure everything looks good</Text>

      {formData.banner_image ? (
        <Image source={{ uri: formData.banner_image }} style={st.reviewPoster} resizeMode="cover" />
      ) : null}

      {/* Basic Info Card */}
      <View style={st.reviewCard}>
        <View style={st.reviewCardHeader}>
          <Text style={st.reviewCardTitle}>Basic Info</Text>
          <TouchableOpacity onPress={() => goToStep(0)} style={st.editBtn}>
            <MaterialIcons name="edit" size={14} color={ACCENT} />
            <Text style={st.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Title</Text>
          <Text style={st.reviewValue} numberOfLines={2}>{formData.title || '—'}</Text>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Description</Text>
          <Text style={[st.reviewValue, { fontSize: 13 }]} numberOfLines={3}>{formData.description || '—'}</Text>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Type</Text>
          <View style={st.reviewBadge}>
            <Text style={{ fontSize: 14 }}>{getEventTypeIcon(formData.event_type)}</Text>
            <Text style={st.reviewBadgeText}>{getEventTypeLabel(formData.event_type)}</Text>
          </View>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Participation</Text>
          <Text style={st.reviewValue}>
            {formData.participation_type === 'team'
              ? 'Team (' + formData.min_team_size + '–' + formData.max_team_size + ' members)'
              : 'Individual'}
          </Text>
        </View>
        <View style={[st.reviewRow, { borderBottomWidth: 0 }]}>
          <Text style={st.reviewLabel}>Eligibility</Text>
          <Text style={st.reviewValue}>{getEligibilityLabel()}</Text>
        </View>
      </View>

      {/* Schedule Card */}
      <View style={st.reviewCard}>
        <View style={st.reviewCardHeader}>
          <Text style={st.reviewCardTitle}>Schedule & Venue</Text>
          <TouchableOpacity onPress={() => goToStep(1)} style={st.editBtn}>
            <MaterialIcons name="edit" size={14} color={ACCENT} />
            <Text style={st.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Starts</Text>
          <Text style={st.reviewValue}>{formatDate(formData.start_date) + ' at ' + formatTime(formData.start_date)}</Text>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Ends</Text>
          <Text style={st.reviewValue}>{formatDate(formData.end_date) + ' at ' + formatTime(formData.end_date)}</Text>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Deadline</Text>
          <Text style={[st.reviewValue, { color: '#ea580c' }]}>
            {formatDate(formData.registration_deadline) + ' at ' + formatTime(formData.registration_deadline)}
          </Text>
        </View>
        <View style={[st.reviewRow, { borderBottomWidth: 0 }]}>
          <Text style={st.reviewLabel}>Location</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 0.6, justifyContent: 'flex-end' }}>
            <MaterialIcons name={formData.is_online ? 'videocam' : 'location-on'} size={14} color={ACCENT} />
            <Text style={st.reviewValue} numberOfLines={1}>
              {formData.is_online ? (formData.meeting_link || 'Online') : (formData.venue || 'TBD')}
            </Text>
          </View>
        </View>
      </View>

      {/* Details Card */}
      <View style={st.reviewCard}>
        <View style={st.reviewCardHeader}>
          <Text style={st.reviewCardTitle}>Details</Text>
          <TouchableOpacity onPress={() => goToStep(2)} style={st.editBtn}>
            <MaterialIcons name="edit" size={14} color={ACCENT} />
            <Text style={st.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={st.reviewRow}>
          <Text style={st.reviewLabel}>Max Participants</Text>
          <Text style={st.reviewValue}>{formData.max_participants}</Text>
        </View>
        <View style={[st.reviewRow, { borderBottomWidth: 0 }]}>
          <Text style={st.reviewLabel}>Poster</Text>
          <Text style={st.reviewValue}>{formData.banner_image ? '✅ Uploaded' : '—  Not uploaded'}</Text>
        </View>
      </View>

      <View style={st.submitNotice}>
        <MaterialIcons name="info-outline" size={16} color="#6b7280" />
        <Text style={st.submitNoticeText}>
          Once created, students can immediately register for this event.
        </Text>
      </View>
    </View>
  );

  // ═════════════════════════════════════
  // MAIN RENDER
  // ═════════════════════════════════════
  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={goBack} style={st.headerBackBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Create Event</Text>
        <View style={{ width: 40 }} />
      </View>

      {renderProgressBar()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={st.scrollContent}
          contentContainerStyle={st.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {currentStep === 0 && renderStep1()}
          {currentStep === 1 && renderStep2()}
          {currentStep === 2 && renderStep3()}
          {currentStep === 3 && renderStep4()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Navigation */}
      <View style={st.bottomBar}>
        {currentStep > 0 && (
          <TouchableOpacity style={st.bottomBackBtn} onPress={goBack}>
            <MaterialIcons name="arrow-back" size={18} color="#374151" />
            <Text style={st.bottomBackBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {currentStep < STEPS.length - 1 ? (
          <TouchableOpacity style={st.bottomNextBtn} onPress={goNext}>
            <Text style={st.bottomNextBtnText}>Continue</Text>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[st.bottomSubmitBtn, isSubmitting && st.bottomSubmitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <MaterialIcons name="check-circle" size={18} color="#fff" />
            <Text style={st.bottomSubmitBtnText}>
              {isSubmitting ? 'Creating...' : 'Create Event'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date Time Picker */}
      {showPicker.show && showPicker.field && (
        Platform.OS === 'ios' ? (
          <Modal visible transparent animationType="slide" onRequestClose={closeDatePicker}>
            <View style={st.modalOverlay}>
              <View style={st.pickerSheet}>
                <View style={st.pickerHeader}>
                  <TouchableOpacity onPress={closeDatePicker}>
                    <Text style={st.pickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={st.pickerTitle}>
                    {showPicker.mode === 'date' ? 'Select Date' : 'Select Time'}
                  </Text>
                  <TouchableOpacity onPress={closeDatePicker}>
                    <Text style={st.pickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={formData[showPicker.field] as Date}
                  mode={showPicker.mode}
                  display="spinner"
                  onChange={handleDateChange}
                  textColor="#000"
                  style={{ height: 200 }}
                />
                <View style={st.quickPickRow}>
                  <Text style={st.quickPickLabel}>Quick Select</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {showPicker.field === 'start_date' && (
                      <>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('start_date', 1)}>
                          <Text style={st.quickChipText}>1 hour</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('start_date', 24)}>
                          <Text style={st.quickChipText}>Tomorrow</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('start_date', 168)}>
                          <Text style={st.quickChipText}>Next week</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {showPicker.field === 'end_date' && (
                      <>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('end_date', 2)}>
                          <Text style={st.quickChipText}>2 hours</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('end_date', 4)}>
                          <Text style={st.quickChipText}>4 hours</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('end_date', 24)}>
                          <Text style={st.quickChipText}>1 day</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {showPicker.field === 'registration_deadline' && (
                      <>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('registration_deadline', 24)}>
                          <Text style={st.quickChipText}>Tomorrow</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('registration_deadline', 72)}>
                          <Text style={st.quickChipText}>3 days</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.quickChip} onPress={() => handleQuickDate('registration_deadline', 168)}>
                          <Text style={st.quickChipText}>1 week</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </ScrollView>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={formData[showPicker.field] as Date}
            mode={showPicker.mode}
            display="default"
            onChange={handleDateChange}
          />
        )
      )}
    </View>
  );
}

// ═════════════════════════════════════
// STYLES
// ═════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  // Progress
  progressContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  progressSteps: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12,
  },
  progressStep: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: ACCENT },
  stepDotCompleted: { backgroundColor: '#10b981' },
  stepDotText: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  stepDotTextActive: { color: '#fff' },
  stepLabel: { fontSize: 11, fontWeight: '500', color: '#9ca3af' },
  stepLabelActive: { color: ACCENT, fontWeight: '600' },
  stepLabelCompleted: { color: '#10b981', fontWeight: '600' },
  progressTrack: {
    height: 3, backgroundColor: '#e5e7eb',
    borderRadius: 2, overflow: 'hidden' as const,
  },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },

  // Content
  scrollContent: { flex: 1 },
  scrollContainer: { padding: 20, paddingBottom: 100 },
  stepContent: { gap: 0 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  stepSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24 },

  // Fields
  fieldGroup: { marginBottom: 24 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#ef4444' },
  fieldHint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  subFieldGroup: { marginTop: 16 },
  subFieldLabel: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginBottom: 8 },

  // Inputs
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#111827',
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' as const, paddingTop: 14 },
  charCount: { fontSize: 11, color: '#9ca3af', textAlign: 'right' as const, marginTop: 4 },

  // Chips
  chipGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  chipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipIcon: { fontSize: 15 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextSelected: { color: '#fff' },
  chipSmall: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  chipSmallSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipSmallText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipSmallTextSelected: { color: '#fff' },

  // Toggle
  toggleRow: {
    flexDirection: 'row' as const, backgroundColor: '#f3f4f6',
    borderRadius: 12, padding: 4, gap: 4,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
    justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  toggleBtnActive: { backgroundColor: ACCENT },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  toggleBtnTextActive: { color: '#fff' },

  // Team Size
  teamSizeRow: { flexDirection: 'row' as const, gap: 16, marginTop: 16 },
  teamSizeField: { flex: 1 },
  teamSizeLabel: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginBottom: 8 },
  counterRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  counterBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f3f4f6', alignItems: 'center' as const,
    justifyContent: 'center' as const, borderWidth: 1, borderColor: '#e5e7eb',
  },
  counterValue: {
    fontSize: 18, fontWeight: '700', color: '#111827',
    minWidth: 30, textAlign: 'center' as const,
  },

  // Counter Large
  counterRowLarge: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    gap: 16, justifyContent: 'center' as const,
  },
  counterBtnLarge: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#fff', alignItems: 'center' as const,
    justifyContent: 'center' as const, borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  counterInput: {
    fontSize: 28, fontWeight: '700', color: '#111827',
    minWidth: 80, textAlign: 'center' as const,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16,
  },

  // Dates
  dateRow: { flexDirection: 'row' as const, gap: 10 },
  dateBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
  },
  dateBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  // Upload Area
  uploadArea: {
    borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed' as const,
    borderRadius: 16, paddingVertical: 36,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: '#fff',
  },
  uploadIconWrapper: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#eef2ff',
    alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 12,
  },
  uploadTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 4 },
  uploadHint: { fontSize: 12, color: '#9ca3af' },

  // Poster Preview
  posterPreview: {
    borderRadius: 12, overflow: 'hidden' as const,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  posterImage: { width: '100%', height: 180 },
  posterActions: {
    flexDirection: 'row' as const, justifyContent: 'center' as const,
    gap: 16, padding: 12,
  },
  posterChangeBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  posterChangeBtnText: { fontSize: 13, fontWeight: '600', color: ACCENT },
  posterRemoveBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  posterRemoveBtnText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },

  // Review
  reviewPoster: { width: '100%', height: 180, borderRadius: 14, marginBottom: 20 },
  reviewCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#f0f0f0',
  },
  reviewCardHeader: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'center' as const, marginBottom: 14,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  reviewCardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  editBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: ACCENT },
  reviewRow: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  reviewLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500', flex: 0.4 },
  reviewValue: {
    fontSize: 14, color: '#111827', fontWeight: '600',
    flex: 0.6, textAlign: 'right' as const,
  },
  reviewBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  reviewBadgeText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  submitNotice: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    backgroundColor: '#f9fafb', padding: 14, borderRadius: 12, marginTop: 4,
  },
  submitNoticeText: { fontSize: 12, color: '#6b7280', flex: 1, lineHeight: 18 },

  // Bottom Bar
  bottomBar: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 20, paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12,
  },
  bottomBackBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  bottomBackBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  bottomNextBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
    backgroundColor: ACCENT,
  },
  bottomNextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  bottomSubmitBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#10b981',
  },
  bottomSubmitBtnDisabled: { backgroundColor: '#d1d5db' },
  bottomSubmitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Access Denied
  accessDenied: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingHorizontal: 40,
  },
  accessDeniedIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#eef2ff',
    alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 20,
  },
  accessDeniedTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  accessDeniedText: {
    fontSize: 14, color: '#6b7280', textAlign: 'center' as const,
    marginBottom: 24, lineHeight: 20,
  },
  accessDeniedBtn: {
    paddingHorizontal: 28, paddingVertical: 12,
    backgroundColor: ACCENT, borderRadius: 12,
  },
  accessDeniedBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Date Picker Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end' as const,
  },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, paddingBottom: 20,
  },
  pickerHeader: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'center' as const, paddingHorizontal: 20,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  pickerCancel: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  pickerDone: { fontSize: 15, color: ACCENT, fontWeight: '700' },
  quickPickRow: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  quickPickLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 10 },
  quickChip: {
    backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#e5e7eb',
  },
  quickChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
});