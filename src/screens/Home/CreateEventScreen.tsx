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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';

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
    end_date: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours later
    venue: '',
    is_online: false,
    meeting_link: '',
    max_participants: 50,
    registration_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
    banner_image: '',
  });
  const [showPicker, setShowPicker] = useState<{ field: keyof EventFormData | null; show: boolean }>({ field: null, show: false });

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
      console.log('Starting image upload from URI:', uri);

      // For React Native/Expo Go compatibility, use base64 instead of blob
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `event-poster-${Date.now()}.${fileExt}`;

      console.log('Uploading to Supabase:', fileName);

      // Convert ArrayBuffer to Uint8Array for Supabase
      const uint8Array = new Uint8Array(arrayBuffer);

      const { data, error } = await supabase.storage
        .from('event-banners')
        .upload(fileName, uint8Array, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw error;
      }

      console.log('Upload successful!', data);

      const { data: publicUrlData } = supabase.storage
        .from('event-banners')
        .getPublicUrl(fileName);

      console.log('Public URL:', publicUrlData.publicUrl);

      setFormData(prev => ({ ...prev, banner_image: publicUrlData.publicUrl }));
      Toast.show({ type: 'success', text1: 'Poster uploaded successfully!' });
    } catch (err: any) {
      console.error('Upload error:', err);
      Toast.show({
        type: 'error',
        text1: 'Failed to upload poster',
        text2: err.message || 'Please try again'
      });
    } finally {
      setUploading(false);
    }
  };

  // Check if user can create events
  const canCreateEvent = profile && (
    profile.role === 'faculty' ||
    profile.role === 'admin' ||
    profile.is_club_coordinator ||
    profile.is_volunteer
  );

  const handleDateChange = (event: any, selectedDate?: Date) => {
    console.log('Date picker event:', event.type, 'Selected date:', selectedDate);

    const isAndroid = Platform.OS === 'android';
    const wasDismissed = event.type === 'dismissed' || event.type === 'neutral';

    // Always close picker on Android (it doesn't auto-close)
    if (isAndroid) {
      setShowPicker({ field: null, show: false });
    }

    // Update date only if user actually selected one (not cancelled/dismissed)
    if (!wasDismissed && selectedDate && showPicker.field) {
      console.log('Updating field:', showPicker.field, 'with date:', selectedDate);
      setFormData(prev => ({
        ...prev,
        [showPicker.field as string]: selectedDate,
      }));
    }

    // On iOS, manually close when user taps "Done" or "Cancel"
    if (!isAndroid && wasDismissed) {
      setShowPicker({ field: null, show: false });
    }
  };

  const showDatePicker = (field: keyof EventFormData) => {
    setShowPicker({ field, show: true });
  };

  const closeDatePicker = () => {
    setShowPicker({ field: null, show: false });
  };

  const handleQuickDate = (field: keyof EventFormData, hoursToAdd: number) => {
    const newDate = new Date(Date.now() + hoursToAdd * 60 * 60 * 1000);
    setFormData(prev => ({
      ...prev,
      [field]: newDate,
    }));
    closeDatePicker();
    Toast.show({
      type: 'success',
      text1: `Date set to ${newDate.toLocaleString()}`
    });
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
          organizers: [user.id], // User as main organizer
        } as any) // Type assertion until database types are generated
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

  const handleManualDateTime = (dateStr: string, timeStr: string) => {
    if (!showPicker.field) return;

    // specific format checks could be added here
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);

    if (
      !isNaN(year) && !isNaN(month) && !isNaN(day) &&
      !isNaN(hours) && !isNaN(minutes) &&
      year > 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
      hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ) {
      const newDate = new Date(year, month - 1, day, hours, minutes);
      setFormData(prev => ({
        ...prev,
        [showPicker.field as string]: newDate,
      }));
    }
  };

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>

          <Text style={styles.label}>Start Date *</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => showDatePicker('start_date')}>
            <MaterialIcons name="event" size={20} color="#6b7280" />
            <Text style={styles.dateText}>{formData.start_date.toLocaleString()}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>End Date *</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => showDatePicker('end_date')}>
            <MaterialIcons name="event" size={20} color="#6b7280" />
            <Text style={styles.dateText}>{formData.end_date.toLocaleString()}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Registration Deadline *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => showDatePicker('registration_deadline')}
          >
            <MaterialIcons name="event" size={20} color="#6b7280" />
            <Text style={styles.dateText}>{formData.registration_deadline.toLocaleString()}</Text>
          </TouchableOpacity>
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

      {/* Custom Date Time Picker Modal (Expo Go Compatible) */}
      <Modal
        visible={showPicker.show}
        transparent={true}
        animationType="slide"
        onRequestClose={closeDatePicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select {showPicker.field?.replace('_', ' ').toUpperCase()}
              </Text>
              <TouchableOpacity onPress={closeDatePicker}>
                <MaterialIcons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.quickOptions}>
              {/* Manual Date/Time Input */}
              <View style={styles.manualInputSection}>
                <Text style={styles.sectionLabel}>Enter Date & Time:</Text>

                <View style={styles.dateTimeInputs}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Date</Text>
                    <TextInput
                      style={styles.dateTimeInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                      defaultValue={showPicker.field && formData[showPicker.field] instanceof Date ?
                        (formData[showPicker.field] as Date).toISOString().split('T')[0] :
                        new Date().toISOString().split('T')[0]
                      }
                      onChangeText={(text) => {
                        if (showPicker.field && formData[showPicker.field] instanceof Date) {
                          const currentTime = (formData[showPicker.field] as Date).toTimeString().slice(0, 5);
                          handleManualDateTime(text, currentTime);
                        }
                      }}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Time</Text>
                    <TextInput
                      style={styles.dateTimeInput}
                      placeholder="HH:MM"
                      placeholderTextColor="#9ca3af"
                      defaultValue={showPicker.field && formData[showPicker.field] instanceof Date ?
                        (formData[showPicker.field] as Date).toTimeString().slice(0, 5) :
                        '12:00'
                      }
                      onChangeText={(text) => {
                        if (showPicker.field && formData[showPicker.field] instanceof Date) {
                          const currentDate = (formData[showPicker.field] as Date).toISOString().split('T')[0];
                          handleManualDateTime(currentDate, text);
                        }
                      }}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <Text style={styles.sectionLabel}>Quick Select:</Text>

              {showPicker.field === 'start_date' && (
                <>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('start_date', 1)}>
                    <Text style={styles.quickButtonText}>📅 In 1 hour</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('start_date', 24)}>
                    <Text style={styles.quickButtonText}>📅 Tomorrow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('start_date', 24 * 7)}>
                    <Text style={styles.quickButtonText}>📅 Next week</Text>
                  </TouchableOpacity>
                </>
              )}

              {showPicker.field === 'end_date' && (
                <>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('end_date', 2)}>
                    <Text style={styles.quickButtonText}>⏰ In 2 hours</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('end_date', 4)}>
                    <Text style={styles.quickButtonText}>⏰ In 4 hours</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('end_date', 24)}>
                    <Text style={styles.quickButtonText}>⏰ In 1 day</Text>
                  </TouchableOpacity>
                </>
              )}

              {showPicker.field === 'registration_deadline' && (
                <>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('registration_deadline', 24)}>
                    <Text style={styles.quickButtonText}>⏳ Tomorrow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('registration_deadline', 24 * 3)}>
                    <Text style={styles.quickButtonText}>⏳ In 3 days</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickButton} onPress={() => handleQuickDate('registration_deadline', 24 * 7)}>
                    <Text style={styles.quickButtonText}>⏳ In 1 week</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.closeButton} onPress={closeDatePicker}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingTop: 60,
    paddingBottom: 20,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  dateText: {
    fontSize: 16,
    color: '#374151',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  quickOptions: {
    maxHeight: 300,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
  },
  quickButton: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickButtonText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  closeButton: {
    backgroundColor: '#6366f1',
    padding: 14,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manualInputSection: {
    marginBottom: 20,
  },
  dateTimeInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
  },
  dateTimeInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
});