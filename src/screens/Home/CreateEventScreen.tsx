// ...existing code...
import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  Image,
  Modal,
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
  // Team fields
  participation_type: 'individual' | 'team';
  min_team_size: number;
  max_team_size: number;
  // Eligibility fields
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

export default function CreateEventScreen() {
  const navigation = useNavigation<CreateEventScreenNavigationProp>();
  const { user, profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Poster/Notice upload state and logic
  const [uploading, setUploading] = useState(false);

  // Image picker for poster/notice
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Toast.show({ type: 'error', text1: 'Permission to access gallery is required!' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const image = result.assets[0];
      await uploadImage(image.uri);
    }
  };

  // Upload image to Supabase Storage
  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      const fileExt = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
      const fileName = `event-poster-${Date.now()}.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

      // Read as base64 — response.arrayBuffer() is NOT supported in Hermes/React Native
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const byteCharacters = atob(base64);
      const uint8Array = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        uint8Array[i] = byteCharacters.charCodeAt(i);
      }

      const { data, error } = await supabase.storage
        .from('event-banners')
        .upload(fileName, uint8Array, { contentType, upsert: true });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from('event-banners')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, banner_image: publicUrlData.publicUrl }));
      Toast.show({ type: 'success', text1: 'Poster uploaded successfully!' });
    } catch (err: any) {
      console.error('Upload error:', err);
      Toast.show({ type: 'error', text1: 'Failed to upload poster', text2: err.message || 'Please try again' });
    } finally {
      setUploading(false);
    }
  };

  // Check if user can create events
  const canCreateEvent = profile && (
    profile.role === 'faculty' ||
    isAdminRole(profile.role) ||
    profile.is_club_coordinator ||
    profile.is_volunteer
  );

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      closeDatePicker();
    }

    if (selectedDate && showPicker.field) {
      setFormData(prev => ({
        ...prev,
        [showPicker.field as string]: selectedDate,
      }));

      // On iOS, automatically switch from date to time picker
      if (Platform.OS === 'ios' && showPicker.mode === 'date') {
        setTimeout(() => {
          setShowPicker({ field: showPicker.field, mode: 'time', show: true });
        }, 300);
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
    const newDate = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    setFormData(prev => ({
      ...prev,
      [field]: newDate,
    }));
    closeDatePicker();
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      Toast.show({ type: 'error', text1: 'Event title is required' });
      return false;
    }

    if (!formData.description.trim()) {
      Toast.show({ type: 'error', text1: 'Event description is required' });
      return false;
    }

    if (!formData.event_type) {
      Toast.show({ type: 'error', text1: 'Please select event type' });
      return false;
    }

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

    return true;
  };

  const handleSubmit = async () => {
    if (!user?.id || !canCreateEvent) {
      Toast.show({ type: 'error', text1: 'You do not have permission to create events' });
      return;
    }

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      const { data, error } = await supabase
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
          // Team fields
          participation_type: formData.participation_type,
          min_team_size: formData.participation_type === 'team' ? formData.min_team_size : null,
          max_team_size: formData.participation_type === 'team' ? formData.max_team_size : null,
          // Eligibility fields
          eligibility_type: formData.eligibility_type,
          eligible_departments: ['department', 'department_year'].includes(formData.eligibility_type)
            ? formData.eligible_departments
            : [],
          eligible_years: ['year', 'department_year'].includes(formData.eligibility_type)
            ? formData.eligible_years
            : [],
        } as any)
        .select()
        .single();

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Event created successfully!',
        text2: 'Students can now register for your event.',
      });

      navigation.goBack();

    } catch (error: any) {
      console.error('Error creating event:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to create event',
        text2: error.message || 'Please try again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canCreateEvent) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#ef4444" />
          <Text style={styles.errorTitle}>Access Denied</Text>
          <Text style={styles.errorText}>
            Only faculty, coordinators, and volunteers can create events.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Event</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        >
          <Text style={[styles.submitButtonText, isSubmitting && styles.submitButtonTextDisabled]}>
            {isSubmitting ? 'Creating...' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.textInput}
            value={formData.title}
            onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
            placeholder="Event title"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={formData.description}
            onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
            placeholder="Describe the event"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Type</Text>
          <View style={styles.typeContainer}>
            {EVENT_TYPES.map((type) => {
              const isSelected = formData.event_type === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.typeChip, isSelected && styles.typeChipSelected]}
                  onPress={() => setFormData(prev => ({ ...prev, event_type: type.id }))}
                >
                  <Text style={styles.typeIcon}>{type.icon}</Text>
                  <Text style={[styles.typeText, isSelected && styles.typeTextSelected]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Participation Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Participation</Text>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, formData.participation_type === 'individual' && styles.toggleButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, participation_type: 'individual' }))}
            >
              <Text style={[styles.toggleText, formData.participation_type === 'individual' && styles.toggleTextActive]}>👤 Individual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, formData.participation_type === 'team' && styles.toggleButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, participation_type: 'team' }))}
            >
              <Text style={[styles.toggleText, formData.participation_type === 'team' && styles.toggleTextActive]}>👥 Team</Text>
            </TouchableOpacity>
          </View>

          {formData.participation_type === 'team' && (
            <View style={{ marginTop: 16, gap: 12 }}>
              <Text style={styles.label}>Min Team Size</Text>
              <View style={styles.participantsContainer}>
                <TouchableOpacity style={styles.participantsButton} onPress={() => setFormData(prev => ({ ...prev, min_team_size: Math.max(2, prev.min_team_size - 1) }))}>
                  <MaterialIcons name="remove" size={20} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.participantsCount}>{formData.min_team_size}</Text>
                <TouchableOpacity style={styles.participantsButton} onPress={() => setFormData(prev => ({ ...prev, min_team_size: Math.min(prev.max_team_size, prev.min_team_size + 1) }))}>
                  <MaterialIcons name="add" size={20} color="#374151" />
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Max Team Size</Text>
              <View style={styles.participantsContainer}>
                <TouchableOpacity style={styles.participantsButton} onPress={() => setFormData(prev => ({ ...prev, max_team_size: Math.max(prev.min_team_size, prev.max_team_size - 1) }))}>
                  <MaterialIcons name="remove" size={20} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.participantsCount}>{formData.max_team_size}</Text>
                <TouchableOpacity style={styles.participantsButton} onPress={() => setFormData(prev => ({ ...prev, max_team_size: prev.max_team_size + 1 }))}>
                  <MaterialIcons name="add" size={20} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Eligibility */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eligibility</Text>
          <Text style={styles.label}>Who can participate?</Text>
          <View style={styles.typeContainer}>
            {[
              { id: 'college', label: '🏫 College-wide' },
              { id: 'department', label: '🏛️ Department' },
              { id: 'year', label: '📅 Year' },
              { id: 'department_year', label: '🎯 Dept + Year' },
            ].map((opt) => {
              const isSel = formData.eligibility_type === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.typeChip, isSel && styles.typeChipSelected]}
                  onPress={() => setFormData(prev => ({ ...prev, eligibility_type: opt.id as any, eligible_departments: [], eligible_years: [] }))}
                >
                  <Text style={[styles.typeText, isSel && styles.typeTextSelected]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {['department', 'department_year'].includes(formData.eligibility_type) && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>Select Departments</Text>
              <View style={styles.typeContainer}>
                {DEPARTMENTS.map((dept) => {
                  const isSel = formData.eligible_departments.includes(dept);
                  return (
                    <TouchableOpacity
                      key={dept}
                      style={[styles.typeChip, isSel && styles.typeChipSelected]}
                      onPress={() => setFormData(prev => ({
                        ...prev,
                        eligible_departments: isSel
                          ? prev.eligible_departments.filter(d => d !== dept)
                          : [...prev.eligible_departments, dept],
                      }))}
                    >
                      <Text style={[styles.typeText, isSel && styles.typeTextSelected]}>{dept}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {['year', 'department_year'].includes(formData.eligibility_type) && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>Select Years</Text>
              <View style={styles.typeContainer}>
                {YEARS.map((yr) => {
                  const isSel = formData.eligible_years.includes(yr);
                  return (
                    <TouchableOpacity
                      key={yr}
                      style={[styles.typeChip, isSel && styles.typeChipSelected]}
                      onPress={() => setFormData(prev => ({
                        ...prev,
                        eligible_years: isSel
                          ? prev.eligible_years.filter(y => y !== yr)
                          : [...prev.eligible_years, yr],
                      }))}
                    >
                      <Text style={[styles.typeText, isSel && styles.typeTextSelected]}>Year {yr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>

          <Text style={styles.label}>Start Date & Time *</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => showDatePicker('start_date', 'date')}
            >
              <MaterialIcons name="event" size={20} color="#a855f7" />
              <Text style={styles.dateText}>
                {formData.start_date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => showDatePicker('start_date', 'time')}
            >
              <MaterialIcons name="access-time" size={20} color="#10b981" />
              <Text style={styles.dateText}>
                {formData.start_date.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>End Date & Time *</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => showDatePicker('end_date', 'date')}
            >
              <MaterialIcons name="event" size={20} color="#a855f7" />
              <Text style={styles.dateText}>
                {formData.end_date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => showDatePicker('end_date', 'time')}
            >
              <MaterialIcons name="access-time" size={20} color="#10b981" />
              <Text style={styles.dateText}>
                {formData.end_date.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Registration Deadline *</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => showDatePicker('registration_deadline', 'date')}
            >
              <MaterialIcons name="event" size={20} color="#a855f7" />
              <Text style={styles.dateText}>
                {formData.registration_deadline.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => showDatePicker('registration_deadline', 'time')}
            >
              <MaterialIcons name="access-time" size={20} color="#10b981" />
              <Text style={styles.dateText}>
                {formData.registration_deadline.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, !formData.is_online && styles.toggleButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, is_online: false }))}
            >
              <Text style={[styles.toggleText, !formData.is_online && styles.toggleTextActive]}>
                Offline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, formData.is_online && styles.toggleButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, is_online: true }))}
            >
              <Text style={[styles.toggleText, formData.is_online && styles.toggleTextActive]}>
                Online
              </Text>
            </TouchableOpacity>
          </View>

          {formData.is_online ? (
            <>
              <Text style={styles.label}>Meeting Link *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.meeting_link}
                onChangeText={(text) => setFormData(prev => ({ ...prev, meeting_link: text }))}
                placeholder="https://"
                placeholderTextColor="#9ca3af"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Venue *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.venue}
                onChangeText={(text) => setFormData(prev => ({ ...prev, venue: text }))}
                placeholder="Event location"
                placeholderTextColor="#9ca3af"
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Capacity</Text>
          <Text style={styles.label}>Max Participants</Text>
          <View style={styles.participantsContainer}>
            <TouchableOpacity
              style={styles.participantsButton}
              onPress={() =>
                setFormData(prev => ({
                  ...prev,
                  max_participants: Math.max(1, prev.max_participants - 1),
                }))
              }
            >
              <MaterialIcons name="remove" size={20} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.participantsCount}>{formData.max_participants}</Text>
            <TouchableOpacity
              style={styles.participantsButton}
              onPress={() =>
                setFormData(prev => ({
                  ...prev,
                  max_participants: prev.max_participants + 1,
                }))
              }
            >
              <MaterialIcons name="add" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Poster</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={pickImage}
            disabled={uploading}
          >
            <Text style={styles.uploadButtonText}>
              {uploading ? 'Uploading...' : formData.banner_image ? 'Change Poster' : 'Upload Poster'}
            </Text>
          </TouchableOpacity>
          {formData.banner_image ? (
            <Image
              source={{ uri: formData.banner_image }}
              style={{ width: '100%', height: 180, borderRadius: 12, marginTop: 8 }}
              resizeMode="cover"
            />
          ) : null}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Native Date Time Picker */}
      {showPicker.show && showPicker.field && (
        Platform.OS === 'ios' ? (
          <Modal
            visible={showPicker.show}
            transparent={true}
            animationType="slide"
            onRequestClose={closeDatePicker}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.iosPickerContainer}>
                <View style={styles.iosPickerHeader}>
                  <TouchableOpacity onPress={closeDatePicker}>
                    <Text style={styles.iosPickerButton}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.iosPickerTitle}>
                    {showPicker.mode === 'date' ? 'Select Date' : 'Select Time'}
                  </Text>
                  <TouchableOpacity onPress={closeDatePicker}>
                    <Text style={[styles.iosPickerButton, { color: '#a855f7', fontWeight: 'bold' }]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={formData[showPicker.field] as Date}
                  mode={showPicker.mode}
                  display="spinner"
                  onChange={handleDateChange}
                  textColor="#000"
                  style={styles.iosPicker}
                />

                {/* Quick Select Buttons */}
                <View style={styles.quickSelectContainer}>
                  <Text style={styles.quickSelectTitle}>Quick Select</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScrollView}>
                    {showPicker.field === 'start_date' && (
                      <>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('start_date', 1)}>
                          <Text style={styles.quickChipText}>⏰ 1 hour</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('start_date', 24)}>
                          <Text style={styles.quickChipText}>📅 Tomorrow</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('start_date', 24 * 7)}>
                          <Text style={styles.quickChipText}>📅 Next week</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {showPicker.field === 'end_date' && (
                      <>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('end_date', 2)}>
                          <Text style={styles.quickChipText}>⏰ 2 hours</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('end_date', 4)}>
                          <Text style={styles.quickChipText}>⏰ 4 hours</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('end_date', 24)}>
                          <Text style={styles.quickChipText}>📅 1 day</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {showPicker.field === 'registration_deadline' && (
                      <>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('registration_deadline', 24)}>
                          <Text style={styles.quickChipText}>📅 Tomorrow</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('registration_deadline', 24 * 3)}>
                          <Text style={styles.quickChipText}>📅 3 days</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickChip} onPress={() => handleQuickDate('registration_deadline', 24 * 7)}>
                          <Text style={styles.quickChipText}>📅 1 week</Text>
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

const styles = StyleSheet.create({
  uploadButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#9ca3af',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  typeChipSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  typeIcon: {
    fontSize: 16,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  typeTextSelected: {
    color: '#fff',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#6366f1',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  toggleTextActive: {
    color: '#fff',
  },
  participantsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  participantsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantsCount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    minWidth: 50,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  // iOS Picker Styles
  iosPickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    width: '100%',
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  iosPickerButton: {
    fontSize: 16,
    color: '#6b7280',
  },
  iosPicker: {
    height: 200,
    backgroundColor: '#fff',
  },
  quickSelectContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  quickSelectTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
  },
  quickScrollView: {
    flexDirection: 'row',
  },
  quickChip: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});