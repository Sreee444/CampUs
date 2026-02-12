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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExt = uri.split('.').pop();
      const fileName = `event-poster-${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage.from('event-posters').upload(fileName, blob, {
        contentType: blob.type,
        upsert: true,
      });
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from('event-posters').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, banner_image: publicUrlData.publicUrl }));
      Toast.show({ type: 'success', text1: 'Poster uploaded!' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Failed to upload poster' });
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
    setShowPicker({ field: null, show: false });
    
    if (selectedDate && showPicker.field) {
      setFormData(prev => ({
        ...prev,
        [showPicker.field as string]: selectedDate,
      }));
    }
  };

  const showDatePicker = (field: keyof EventFormData) => {
    setShowPicker({ field, show: true });
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
        })
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
      {/* Header */}
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
        {/* Poster/Notice Upload */}
        <View style={styles.section}>
          <Text style={styles.label}>Event Poster/Notice</Text>
          {formData.banner_image ? (
            <Image source={{ uri: formData.banner_image }} style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 8 }} resizeMode="cover" />
          ) : null}
          <TouchableOpacity style={styles.uploadButton} onPress={pickImage} disabled={uploading}>
            <Text style={styles.uploadButtonText}>{uploading ? 'Uploading...' : (formData.banner_image ? 'Change Poster' : 'Upload Poster')}</Text>
          </TouchableOpacity>
        </View>
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Details</Text>
          
          <Text style={styles.label}>Event Title *</Text>
          <TextInput
            style={styles.textInput}
            value={formData.title}
            onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
            placeholder="Enter event title"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={formData.description}
            onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
            placeholder="Describe the event, agenda, speakers, etc."
            placeholderTextColor="#999"
            multiline
            numberOfLines={5}
          />

          <Text style={styles.label}>Event Type *</Text>
          <View style={styles.typeContainer}>
            {EVENT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeChip,
                  formData.event_type === type.id && styles.typeChipSelected
                ]}
                onPress={() => setFormData(prev => ({ ...prev, event_type: type.id }))}
              >
                <Text style={styles.typeIcon}>{type.icon}</Text>
                <Text style={[
                  styles.typeText,
                  formData.event_type === type.id && styles.typeTextSelected
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date & Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>

          <Text style={styles.label}>Start Date & Time *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => showDatePicker('start_date')}
          >
            <MaterialIcons name="schedule" size={20} color="#6366f1" />
            <Text style={styles.dateText}>
              {formData.start_date.toLocaleString()}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>End Date & Time *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => showDatePicker('end_date')}
          >
            <MaterialIcons name="schedule" size={20} color="#6366f1" />
            <Text style={styles.dateText}>
              {formData.end_date.toLocaleString()}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>Registration Deadline *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => showDatePicker('registration_deadline')}
          >
            <MaterialIcons name="schedule" size={20} color="#6366f1" />
            <Text style={styles.dateText}>
              {formData.registration_deadline.toLocaleString()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, !formData.is_online && styles.toggleButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, is_online: false }))}
            >
              <Text style={[styles.toggleText, !formData.is_online && styles.toggleTextActive]}>
                🏢 Offline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, formData.is_online && styles.toggleButtonActive]}
              onPress={() => setFormData(prev => ({ ...prev, is_online: true }))}
            >
              <Text style={[styles.toggleText, formData.is_online && styles.toggleTextActive]}>
                💻 Online
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
                placeholder="https://meet.google.com/..."
                placeholderTextColor="#999"
                autoCapitalize="none"
                keyboardType="url"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Venue *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.venue}
                onChangeText={(text) => setFormData(prev => ({ ...prev, venue: text }))}
                placeholder="Enter venue location"
                placeholderTextColor="#999"
              />
            </>
          )}
        </View>

        {/* Registration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Registration</Text>
          
          <Text style={styles.label}>Maximum Participants</Text>
          <View style={styles.participantsContainer}>
            <TouchableOpacity
              style={styles.participantsButton}
              onPress={() => formData.max_participants > 10 && setFormData(prev => ({ ...prev, max_participants: prev.max_participants - 10 }))}
              disabled={formData.max_participants <= 10}
            >
              <MaterialIcons name="remove" size={20} color={formData.max_participants <= 10 ? "#ccc" : "#6366f1"} />
            </TouchableOpacity>
            <Text style={styles.participantsCount}>{formData.max_participants}</Text>
            <TouchableOpacity
              style={styles.participantsButton}
              onPress={() => formData.max_participants < 500 && setFormData(prev => ({ ...prev, max_participants: prev.max_participants + 10 }))}
              disabled={formData.max_participants >= 500}
            >
              <MaterialIcons name="add" size={20} color={formData.max_participants >= 500 ? "#ccc" : "#6366f1"} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Date Time Picker */}
      {showPicker.show && (
        <DateTimePicker
          value={showPicker.field ? formData[showPicker.field] as Date : new Date()}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
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
});