import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import { supabase } from '../../../api/supabase';
import { createInterCampusEventDirect } from '../api/intercampus';
import { buildInterCampusDetailsDescription } from '../utils/eventDetails';

type Nav = StackNavigationProp<RootStackParamList, 'CreateInterCampusEvent'>;

type CalendarField = 'event_start_date' | 'registration_deadline' | null;

type FormState = {
  title: string;
  description: string;
  college_name: string;
  college_location: string;
  college_website: string;
  fest_name: string;
  event_type: string;
  participation_type: 'individual' | 'team';
  min_team_size: string;
  max_team_size: string;
  venue: string;
  is_online: boolean;
  online_link: string;
  registration_link: string;
  event_start_date: Date | null;
  registration_deadline: Date | null;
  eligibility_text: string;
  banner_image: string;
  faculty_notes: string;
  participation_cap: string;
};

const Field = ({
  label,
  value,
  onChangeText,
  multiline,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'url';
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={[styles.input, multiline && styles.inputMultiline]}
      multiline={!!multiline}
      placeholder={placeholder || ''}
      placeholderTextColor="#94a3b8"
      keyboardType={keyboardType || 'default'}
    />
  </View>
);

const isValidHttpUrl = (value: string) => {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export default function CreateInterCampusEventScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calendarState, setCalendarState] = useState<{ field: CalendarField; visible: boolean }>({
    field: null,
    visible: false,
  });
  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    college_name: '',
    college_location: '',
    college_website: '',
    fest_name: '',
    event_type: '',
    participation_type: 'individual',
    min_team_size: '',
    max_team_size: '',
    venue: '',
    is_online: false,
    online_link: '',
    registration_link: '',
    event_start_date: null,
    registration_deadline: null,
    eligibility_text: '',
    banner_image: '',
    faculty_notes: '',
    participation_cap: '',
  });

  const canCreateDirect = isFacultyOrAdminRole(profile?.role);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const formatDate = (date?: Date | null) => {
    if (!date) return null;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const openCalendar = (field: Exclude<CalendarField, null>) => {
    setCalendarState({ field, visible: true });
  };

  const handleDateSelected = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setCalendarState({ field: null, visible: false });
    }

    if (!selectedDate || !calendarState.field) return;

    if (calendarState.field === 'event_start_date') {
      setField('event_start_date', selectedDate);
    } else {
      setField('registration_deadline', selectedDate);
    }

    if (Platform.OS === 'ios') {
      setCalendarState({ field: null, visible: false });
    }
  };

  const pickBanner = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Toast.show({ type: 'error', text1: 'Gallery permission is required' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
      aspect: [16, 9],
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    try {
      setUploading(true);
      const uri = result.assets[0].uri;
      const fileExt = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
      const fileName = `intercampus-banner-${Date.now()}.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const byteCharacters = atob(base64);
      const uint8Array = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i += 1) {
        uint8Array[i] = byteCharacters.charCodeAt(i);
      }

      const { error } = await supabase.storage.from('event-banners').upload(fileName, uint8Array, {
        contentType,
        upsert: true,
      });

      if (error) throw error;

      const { data } = supabase.storage.from('event-banners').getPublicUrl(fileName);
      setField('banner_image', data.publicUrl);
      Toast.show({ type: 'success', text1: 'Banner uploaded' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Banner upload failed', text2: error?.message || 'Try again' });
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    if (!form.title.trim()) return 'Event Title is required';
    if (!form.college_name.trim()) return 'College Name is required';
    if (!form.event_start_date) return 'Event Start Date is required';
    if (!form.registration_deadline) return 'Registration Deadline is required';

    if (form.registration_deadline >= form.event_start_date) {
      return 'Registration deadline must be before the event start date.';
    }

    if (form.college_website.trim() && !isValidHttpUrl(form.college_website)) {
      return 'College website must be a valid URL';
    }

    if (form.registration_link.trim() && !isValidHttpUrl(form.registration_link)) {
      return 'Registration link must be a valid URL';
    }

    if (form.is_online) {
      if (!form.online_link.trim()) return 'Online link is required for online events';
      if (!isValidHttpUrl(form.online_link)) return 'Online link must be a valid URL';
    }

    if (form.banner_image.trim() && !isValidHttpUrl(form.banner_image)) {
      return 'Uploaded banner URL is invalid';
    }

    if (form.participation_type === 'team') {
      const min = Number(form.min_team_size);
      const max = Number(form.max_team_size);
      if (!form.min_team_size.trim() || !form.max_team_size.trim()) {
        return 'Min and max team size are required for team events';
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return 'Team size fields must be numeric';
      }
      if (min > max) {
        return 'min_team_size must be less than or equal to max_team_size';
      }
    }

    return null;
  };

  const submit = async () => {
    if (!user?.id) return;
    if (!canCreateDirect) {
      Toast.show({ type: 'error', text1: 'Only faculty/admin can create InterCampus events' });
      return;
    }

    const validationError = validate();
    if (validationError) {
      Toast.show({ type: 'error', text1: validationError });
      return;
    }

    try {
      setSubmitting(true);

      const min = form.min_team_size.trim() ? Number(form.min_team_size) : undefined;
      const max = form.max_team_size.trim() ? Number(form.max_team_size) : undefined;
      const cap = form.participation_cap.trim() ? Number(form.participation_cap) : undefined;

      const normalizedDescription = buildInterCampusDetailsDescription(form.description, [
        form.event_type ? `Event Type: ${form.event_type}` : '',
        form.venue ? `Venue: ${form.venue}` : '',
        form.is_online ? 'Mode: Online' : 'Mode: Offline',
        form.online_link ? `Online Link: ${form.online_link}` : '',
        form.registration_deadline ? `Registration Deadline: ${form.registration_deadline.toISOString()}` : '',
        form.eligibility_text ? `Eligibility: ${form.eligibility_text}` : '',
        form.banner_image ? `Banner: ${form.banner_image}` : '',
      ]);

      await createInterCampusEventDirect(user.id, {
        title: form.title,
        description: normalizedDescription,
        college_name: form.college_name,
        college_location: form.college_location,
        college_website: form.college_website.trim() || undefined,
        fest_name: form.fest_name,
        event_type: form.event_type,
        participation_type: form.participation_type,
        min_team_size: form.participation_type === 'team' ? min : undefined,
        max_team_size: form.participation_type === 'team' ? max : undefined,
        venue: form.venue,
        is_online: form.is_online,
        registration_link: form.registration_link.trim() || undefined,
        registration_deadline: form.registration_deadline?.toISOString(),
        event_start_date: form.event_start_date?.toISOString() as string,
        eligibility_text: form.eligibility_text,
        banner_image: form.banner_image,
        faculty_notes: form.faculty_notes,
        participation_cap: Number.isFinite(cap) ? cap : undefined,
      });

      Toast.show({ type: 'success', text1: 'Event created successfully' });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not create event', text2: error?.message || 'Try again' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreateDirect) {
    return (
      <SafeAreaView style={styles.centerWrap}>
        <Text style={styles.restrictedTitle}>Faculty/Admin access required</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryBtnText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create InterCampus Event</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Field label="Event Title" value={form.title} onChangeText={(v) => setField('title', v)} />
        <Field label="Description" value={form.description} onChangeText={(v) => setField('description', v)} multiline />
        <Field label="College Name" value={form.college_name} onChangeText={(v) => setField('college_name', v)} />
        <Field label="College Location" value={form.college_location} onChangeText={(v) => setField('college_location', v)} />
        <Field label="College Website" value={form.college_website} onChangeText={(v) => setField('college_website', v)} keyboardType="url" />
        <Field label="Event Type" value={form.event_type} onChangeText={(v) => setField('event_type', v)} />

        <Text style={styles.fieldLabel}>Participation Type</Text>
        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, form.participation_type === 'individual' && styles.segmentBtnActive]}
            onPress={() => setField('participation_type', 'individual')}
          >
            <Text style={[styles.segmentText, form.participation_type === 'individual' && styles.segmentTextActive]}>Individual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, form.participation_type === 'team' && styles.segmentBtnActive]}
            onPress={() => setField('participation_type', 'team')}
          >
            <Text style={[styles.segmentText, form.participation_type === 'team' && styles.segmentTextActive]}>Team</Text>
          </TouchableOpacity>
        </View>

        {form.participation_type === 'team' && (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Min Team Size" value={form.min_team_size} onChangeText={(v) => setField('min_team_size', v)} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Max Team Size" value={form.max_team_size} onChangeText={(v) => setField('max_team_size', v)} keyboardType="numeric" />
            </View>
          </View>
        )}

        <Text style={styles.fieldLabel}>Event Start Date</Text>
        <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('event_start_date')}>
          <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
          <Text style={styles.dateCardLabel}>{formatDate(form.event_start_date) || 'Select Event Start Date'}</Text>
        </TouchableOpacity>

        <Field label="Venue" value={form.venue} onChangeText={(v) => setField('venue', v)} />

        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Online Event</Text>
          <Switch value={form.is_online} onValueChange={(v) => setField('is_online', v)} trackColor={{ false: '#cbd5e1', true: '#34d399' }} />
        </View>
        {form.is_online && <Field label="Online Link" value={form.online_link} onChangeText={(v) => setField('online_link', v)} keyboardType="url" />}

        <Field label="Registration Link" value={form.registration_link} onChangeText={(v) => setField('registration_link', v)} keyboardType="url" />
        <Text style={styles.fieldLabel}>Registration Deadline</Text>
        <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('registration_deadline')}>
          <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
          <Text style={styles.dateCardLabel}>{formatDate(form.registration_deadline) || 'Select Registration Deadline'}</Text>
        </TouchableOpacity>

        <Field label="Eligibility" value={form.eligibility_text} onChangeText={(v) => setField('eligibility_text', v)} multiline />

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Banner Image Upload</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickBanner} disabled={uploading}>
            <MaterialIcons name="image" size={18} color="#0f766e" />
            <Text style={styles.uploadText}>{uploading ? 'Uploading...' : form.banner_image ? 'Change Banner' : 'Upload Banner'}</Text>
          </TouchableOpacity>
          {!!form.banner_image && <Image source={{ uri: form.banner_image }} style={styles.previewImage} />}
        </View>

        <View style={styles.optionalCard}>
          <Text style={styles.optionalTitle}>Faculty/Admin Controls (Optional)</Text>
          <Field label="Fest Name" value={form.fest_name} onChangeText={(v) => setField('fest_name', v)} />
          <Field label="Faculty Notes" value={form.faculty_notes} onChangeText={(v) => setField('faculty_notes', v)} multiline />
          <Field label="Participation Cap" value={form.participation_cap} onChangeText={(v) => setField('participation_cap', v)} keyboardType="numeric" />
        </View>

        <TouchableOpacity style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]} onPress={submit} disabled={submitting}>
          <Text style={styles.primaryBtnText}>{submitting ? 'Creating...' : 'Create Event'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {calendarState.visible && calendarState.field && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal
              visible={calendarState.visible}
              transparent
              animationType="slide"
              onRequestClose={() => setCalendarState({ field: null, visible: false })}
            >
              <View style={styles.iosBackdrop}>
                <View style={styles.iosCard}>
                  <View style={styles.iosHeader}>
                    <TouchableOpacity onPress={() => setCalendarState({ field: null, visible: false })}>
                      <Text style={styles.iosHeaderText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.iosTitle}>Select Date</Text>
                    <TouchableOpacity onPress={() => setCalendarState({ field: null, visible: false })}>
                      <Text style={styles.iosHeaderText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={(calendarState.field === 'event_start_date' ? form.event_start_date : form.registration_deadline) || new Date()}
                    mode="date"
                    display="spinner"
                    onChange={handleDateSelected}
                    minimumDate={new Date()}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={(calendarState.field === 'event_start_date' ? form.event_start_date : form.registration_deadline) || new Date()}
              mode="date"
              display="default"
              onChange={handleDateSelected}
              minimumDate={new Date()}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: 16, gap: 14 },
  restrictedTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  content: { padding: 16, gap: 8, paddingBottom: 30 },
  fieldWrap: { marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  dateCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    padding: 3,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#0f766e' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  segmentTextActive: { color: '#ffffff' },
  row: { flexDirection: 'row', gap: 10 },
  switchRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  uploadBtn: {
    borderWidth: 1,
    borderColor: '#0f766e',
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
  },
  uploadText: { color: '#0f766e', fontWeight: '700', fontSize: 13 },
  previewImage: { width: '100%', height: 160, borderRadius: 12, marginTop: 8, backgroundColor: '#e2e8f0' },
  optionalCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 10,
  },
  optionalTitle: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 8 },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  iosBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iosCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  iosHeaderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f766e',
  },
  iosTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
});
