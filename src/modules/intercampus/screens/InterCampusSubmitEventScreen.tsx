import React, { useMemo, useState } from 'react';
import {
  Alert,
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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../api/supabase';

type Nav = StackNavigationProp<RootStackParamList>;
type SubmissionType = 'single' | 'fest' | null;

/* ─── Fest Event Draft ─── */
type FestEventDraft = {
  event_title: string;
  description: string;
  event_type: string;
  participation_type: 'individual' | 'team';
  venue: string;
  is_online: boolean;
  registration_link: string;
  registration_deadline: Date | null;
  eligibility_text: string;
  event_start_date: Date | null;
  event_end_date: Date | null;
};

const initialFestEvent = (): FestEventDraft => ({
  event_title: '',
  description: '',
  event_type: '',
  participation_type: 'individual',
  venue: '',
  is_online: false,
  registration_link: '',
  registration_deadline: null,
  eligibility_text: '',
  event_start_date: null,
  event_end_date: null,
});

/* ─── Shared Components ─── */
const Field = ({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'url';
  placeholder?: string;
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={[styles.input, multiline && styles.inputMultiline]}
      multiline={!!multiline}
      keyboardType={keyboardType || 'default'}
      placeholder={placeholder || ''}
      placeholderTextColor="#94a3b8"
    />
  </View>
);

const formatDate = (date?: Date | null) => {
  if (!date) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const uploadBannerImage = async (userId: string, imageUri: string) => {
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const timestamp = Date.now();
  const filePath = `events/${userId}/${timestamp}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('event-banners')
    .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('event-banners').getPublicUrl(filePath);
  return data.publicUrl;
};

/* ─── Step Labels ─── */
const SINGLE_STEPS = ['Basic', 'Location', 'Participation', 'Dates', 'Media', 'Review'];
const FEST_STEPS = ['Fest Details', 'Add Events', 'Submit'];

/* ─── Progress Bar ─── */
function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={styles.stepIndicatorWrap}>
      {steps.map((label, idx) => {
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <View key={label} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isDone && styles.stepDotDone,
              ]}
            >
              {isDone ? (
                <MaterialIcons name="check" size={12} color="#ffffff" />
              ) : (
                <Text style={[styles.stepDotText, (isActive || isDone) && styles.stepDotTextActive]}>
                  {idx + 1}
                </Text>
              )}
            </View>
            <Text
              style={[styles.stepLabel, isActive && styles.stepLabelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {idx < steps.length - 1 && (
              <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function InterCampusSubmitEventScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [submissionType, setSubmissionType] = useState<SubmissionType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Single event state ── */
  const [singleStep, setSingleStep] = useState(0);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventType, setEventType] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [collegeLocation, setCollegeLocation] = useState('');
  const [collegeWebsite, setCollegeWebsite] = useState('');
  const [venue, setVenue] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [participationType, setParticipationType] = useState<'individual' | 'team'>('individual');
  const [minTeamSize, setMinTeamSize] = useState('');
  const [maxTeamSize, setMaxTeamSize] = useState('');
  const [eligibility, setEligibility] = useState('');
  const [eventStartDate, setEventStartDate] = useState<Date | null>(null);
  const [eventEndDate, setEventEndDate] = useState<Date | null>(null);
  const [registrationDeadline, setRegistrationDeadline] = useState<Date | null>(null);
  const [registrationLink, setRegistrationLink] = useState('');
  const [bannerImageUri, setBannerImageUri] = useState<string | null>(null);

  /* ── Fest state ── */
  const [festStep, setFestStep] = useState(0);
  const [festName, setFestName] = useState('');
  const [festCollegeName, setFestCollegeName] = useState('');
  const [festCollegeLocation, setFestCollegeLocation] = useState('');
  const [festCollegeWebsite, setFestCollegeWebsite] = useState('');
  const [festStartDate, setFestStartDate] = useState<Date | null>(null);
  const [festEndDate, setFestEndDate] = useState<Date | null>(null);
  const [festBannerImageUri, setFestBannerImageUri] = useState<string | null>(null);
  const [createdFestId, setCreatedFestId] = useState<string | null>(null);
  const [festEventDraft, setFestEventDraft] = useState<FestEventDraft>(initialFestEvent());
  const [festEvents, setFestEvents] = useState<FestEventDraft[]>([]);

  /* ── Calendar ── */
  const [calendarState, setCalendarState] = useState<{
    field: string | null;
    visible: boolean;
  }>({ field: null, visible: false });

  /* ─── Image Picker ─── */
  const pickBannerImage = async (setter: (value: string | null) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission required', text2: 'Allow photo library access to upload banners.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  /* ─── Calendar Helpers ─── */
  const openCalendar = (field: string) => {
    setCalendarState({ field, visible: true });
  };

  const getCalendarDate = (): Date => {
    const { field } = calendarState;
    if (field === 'eventStartDate') return eventStartDate || new Date();
    if (field === 'eventEndDate') return eventEndDate || new Date();
    if (field === 'registrationDeadline') return registrationDeadline || new Date();
    if (field === 'festStartDate') return festStartDate || new Date();
    if (field === 'festEndDate') return festEndDate || new Date();
    if (field === 'festEventStartDate') return festEventDraft.event_start_date || new Date();
    if (field === 'festEventEndDate') return festEventDraft.event_end_date || new Date();
    if (field === 'festEventDeadline') return festEventDraft.registration_deadline || new Date();
    return new Date();
  };

  const handleDateSelected = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setCalendarState({ field: null, visible: false });
    if (!selectedDate || !calendarState.field) return;

    const { field } = calendarState;
    if (field === 'eventStartDate') setEventStartDate(selectedDate);
    else if (field === 'eventEndDate') setEventEndDate(selectedDate);
    else if (field === 'registrationDeadline') setRegistrationDeadline(selectedDate);
    else if (field === 'festStartDate') setFestStartDate(selectedDate);
    else if (field === 'festEndDate') setFestEndDate(selectedDate);
    else if (field === 'festEventStartDate') setFestEventDraft((p) => ({ ...p, event_start_date: selectedDate }));
    else if (field === 'festEventEndDate') setFestEventDraft((p) => ({ ...p, event_end_date: selectedDate }));
    else if (field === 'festEventDeadline') setFestEventDraft((p) => ({ ...p, registration_deadline: selectedDate }));

    if (Platform.OS === 'ios') setCalendarState({ field: null, visible: false });
  };

  /* ─── Participation Selector ─── */
  const renderParticipationSelector = (
    selected: 'individual' | 'team',
    onChange: (val: 'individual' | 'team') => void,
  ) => (
    <View style={styles.segmentWrap}>
      {(['individual', 'team'] as const).map((type) => (
        <TouchableOpacity
          key={type}
          style={[styles.segmentBtn, selected === type && styles.segmentBtnActive]}
          onPress={() => onChange(type)}
        >
          <Text style={[styles.segmentText, selected === type && styles.segmentTextActive]}>
            {type === 'individual' ? 'Individual' : 'Team'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  /* ─── Date Card ─── */
  const DateCard = ({ label, date, field }: { label: string; date: Date | null; field: string }) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar(field)}>
        <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
        <Text style={styles.dateCardLabel}>{formatDate(date) || `Select ${label}`}</Text>
      </TouchableOpacity>
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════
     SINGLE EVENT — MULTI STEP
  ═══════════════════════════════════════════════════════════════ */

  const handleSubmitSingle = async () => {
    if (!user?.id) return;
    try {
      if (!eventTitle.trim() || !collegeName.trim()) throw new Error('Event title and college name are required');
      if (!eventStartDate) throw new Error('Event start date is required');
      if (!registrationDeadline) throw new Error('Registration deadline is required');

      setIsSubmitting(true);
      const bannerUrl = bannerImageUri ? await uploadBannerImage(user.id, bannerImageUri) : null;

      const { error } = await supabase.from('intercampus_events').insert({
        title: eventTitle.trim(),
        description: eventDescription.trim() || null,
        college_name: collegeName.trim(),
        college_location: collegeLocation.trim() || null,
        college_website: collegeWebsite.trim() || null,
        is_fest: false,
        parent_fest_id: null,
        event_start_date: eventStartDate.toISOString(),
        event_end_date: eventEndDate?.toISOString() || null,
        event_type: eventType.trim() || null,
        participation_type: participationType,
        min_team_size: participationType === 'team' ? parseInt(minTeamSize) || null : null,
        max_team_size: participationType === 'team' ? parseInt(maxTeamSize) || null : null,
        venue: venue.trim() || null,
        is_online: isOnline,
        registration_link: registrationLink.trim() || null,
        registration_deadline: registrationDeadline.toISOString(),
        eligibility_text: eligibility.trim() || null,
        banner_image: bannerUrl,
        verification_status: 'pending',
        status: 'upcoming',
        created_by: user.id,
      } as any);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Event submitted', text2: 'Awaiting verification.' });
      Alert.alert('Success', 'Your event has been submitted for verification.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Submission failed', text2: error?.message || 'Check form values' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSingleStep = () => {
    switch (singleStep) {
      /* Step 0 — Basic Details */
      case 0:
        return (
          <>
            <Text style={styles.stepTitle}>Basic Details</Text>
            <Field label="Event Title *" value={eventTitle} onChangeText={setEventTitle} placeholder="e.g. Hackathon 2026" />
            <Field label="Description" value={eventDescription} onChangeText={setEventDescription} multiline placeholder="What is this event about?" />
            <Field label="Event Type" value={eventType} onChangeText={setEventType} placeholder="e.g. Technical, Cultural, Sports" />
          </>
        );

      /* Step 1 — Location */
      case 1:
        return (
          <>
            <Text style={styles.stepTitle}>Location & College</Text>
            <Field label="College Name *" value={collegeName} onChangeText={setCollegeName} placeholder="e.g. CUSAT" />
            <Field label="College Location" value={collegeLocation} onChangeText={setCollegeLocation} placeholder="e.g. Kochi, Kerala" />
            <Field label="College Website" value={collegeWebsite} onChangeText={setCollegeWebsite} keyboardType="url" placeholder="https://..." />
            <Field label="Venue" value={venue} onChangeText={setVenue} placeholder="e.g. Auditorium, Main Block" />
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Online Event</Text>
              <Switch value={isOnline} onValueChange={setIsOnline} trackColor={{ false: '#cbd5e1', true: '#34d399' }} />
            </View>
          </>
        );

      /* Step 2 — Participation */
      case 2:
        return (
          <>
            <Text style={styles.stepTitle}>Participation</Text>
            <Text style={styles.fieldLabel}>Participation Type</Text>
            {renderParticipationSelector(participationType, setParticipationType)}
            {participationType === 'team' && (
              <>
                <Field label="Min Team Size" value={minTeamSize} onChangeText={setMinTeamSize} keyboardType="default" placeholder="e.g. 2" />
                <Field label="Max Team Size" value={maxTeamSize} onChangeText={setMaxTeamSize} keyboardType="default" placeholder="e.g. 5" />
              </>
            )}
            <Field label="Eligibility" value={eligibility} onChangeText={setEligibility} multiline placeholder="Who can participate?" />
          </>
        );

      /* Step 3 — Dates */
      case 3:
        return (
          <>
            <Text style={styles.stepTitle}>Dates</Text>
            <DateCard label="Event Start Date *" date={eventStartDate} field="eventStartDate" />
            <DateCard label="Event End Date" date={eventEndDate} field="eventEndDate" />
            <DateCard label="Registration Deadline *" date={registrationDeadline} field="registrationDeadline" />
            <Field label="Registration Link" value={registrationLink} onChangeText={setRegistrationLink} keyboardType="url" placeholder="https://..." />
          </>
        );

      /* Step 4 — Media */
      case 4:
        return (
          <>
            <Text style={styles.stepTitle}>Banner Image</Text>
            <Text style={styles.helperText}>Upload an eye-catching banner for your event (16:9 ratio recommended)</Text>
            <TouchableOpacity style={styles.imageBtn} onPress={() => pickBannerImage(setBannerImageUri)}>
              <MaterialIcons name="add-photo-alternate" size={20} color="#0f766e" />
              <Text style={styles.imageBtnText}>{bannerImageUri ? 'Change Image' : 'Select Image'}</Text>
            </TouchableOpacity>
            {!!bannerImageUri && (
              <Image source={{ uri: bannerImageUri }} style={styles.previewImage} contentFit="cover" />
            )}
          </>
        );

      /* Step 5 — Review */
      case 5:
        return (
          <>
            <Text style={styles.stepTitle}>Review & Submit</Text>
            {!!bannerImageUri && (
              <Image source={{ uri: bannerImageUri }} style={styles.reviewBanner} contentFit="cover" />
            )}
            <View style={styles.reviewCard}>
              <ReviewRow label="Title" value={eventTitle} />
              <ReviewRow label="College" value={collegeName} />
              <ReviewRow label="Location" value={collegeLocation || '–'} />
              <ReviewRow label="Type" value={eventType || '–'} />
              <ReviewRow label="Participation" value={participationType} />
              <ReviewRow label="Start Date" value={formatDate(eventStartDate) || '–'} />
              <ReviewRow label="End Date" value={formatDate(eventEndDate) || '–'} />
              <ReviewRow label="Deadline" value={formatDate(registrationDeadline) || '–'} />
              <ReviewRow label="Venue" value={venue || (isOnline ? 'Online' : '–')} />
              <ReviewRow label="Eligibility" value={eligibility || '–'} />
            </View>
            <TouchableOpacity style={styles.submitBtn} disabled={isSubmitting} onPress={handleSubmitSingle}>
              <MaterialIcons name="send" size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>{isSubmitting ? 'Submitting...' : 'Submit Event'}</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return null;
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     FEST — MULTI STEP
  ═══════════════════════════════════════════════════════════════ */

  const handleCreateFest = async () => {
    if (!user?.id) return;
    if (!festName.trim() || !festCollegeName.trim() || !festStartDate || !festEndDate) {
      Toast.show({ type: 'error', text1: 'Fill all required fest fields' });
      return;
    }
    if (festEndDate < festStartDate) {
      Toast.show({ type: 'error', text1: 'End date must be after start date' });
      return;
    }
    try {
      setIsSubmitting(true);
      const bannerUrl = festBannerImageUri ? await uploadBannerImage(user.id, festBannerImageUri) : null;

      const { data, error } = await supabase
        .from('intercampus_events')
        .insert({
          title: festName.trim(),
          description: null,
          college_name: festCollegeName.trim(),
          college_location: festCollegeLocation.trim() || null,
          college_website: festCollegeWebsite.trim() || null,
          is_fest: true,
          parent_fest_id: null,
          event_start_date: festStartDate.toISOString(),
          event_end_date: festEndDate.toISOString(),
          banner_image: bannerUrl,
          verification_status: 'pending',
          status: 'upcoming',
          created_by: user.id,
        } as any)
        .select('id')
        .single();

      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Fest created', text2: 'Now add events under this fest.' });
      setCreatedFestId((data as any)?.id);
      setFestStep(1);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Fest creation failed', text2: error?.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addFestEvent = () => {
    if (!festEventDraft.event_title.trim()) {
      Toast.show({ type: 'error', text1: 'Event title is required' });
      return;
    }
    if (!festEventDraft.event_start_date) {
      Toast.show({ type: 'error', text1: 'Event start date is required' });
      return;
    }
    setFestEvents((prev) => [...prev, festEventDraft]);
    setFestEventDraft(initialFestEvent());
    Toast.show({ type: 'success', text1: 'Event added' });
  };

  const submitFest = async () => {
    if (!user?.id || !createdFestId) return;
    if (festEvents.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one event' });
      return;
    }
    try {
      setIsSubmitting(true);
      for (const event of festEvents) {
        const { error } = await supabase.from('intercampus_events').insert({
          title: event.event_title.trim(),
          description: event.description.trim() || null,
          college_name: festCollegeName.trim(),
          college_location: festCollegeLocation.trim() || null,
          college_website: festCollegeWebsite.trim() || null,
          is_fest: false,
          parent_fest_id: createdFestId,
          event_start_date: event.event_start_date?.toISOString() || null,
          event_end_date: event.event_end_date?.toISOString() || null,
          event_type: event.event_type.trim() || null,
          participation_type: event.participation_type,
          venue: event.venue.trim() || null,
          is_online: event.is_online,
          registration_link: event.registration_link.trim() || null,
          registration_deadline: event.registration_deadline?.toISOString() || null,
          eligibility_text: event.eligibility_text.trim() || null,
          banner_image: null,
          verification_status: 'pending',
          status: 'upcoming',
          created_by: user.id,
        } as any);
        if (error) throw error;
      }
      Toast.show({ type: 'success', text1: 'Fest submitted', text2: `${festEvents.length} events submitted.` });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Submission failed', text2: error?.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFestStep = () => {
    switch (festStep) {
      /* Step 0 — Fest Details */
      case 0:
        return (
          <>
            <Text style={styles.stepTitle}>Fest Details</Text>
            <Field label="Fest Name *" value={festName} onChangeText={setFestName} placeholder="e.g. TechFest 2026" />
            <Field label="College Name *" value={festCollegeName} onChangeText={setFestCollegeName} placeholder="e.g. CUSAT" />
            <Field label="College Location" value={festCollegeLocation} onChangeText={setFestCollegeLocation} placeholder="e.g. Kochi, Kerala" />
            <Field label="College Website" value={festCollegeWebsite} onChangeText={setFestCollegeWebsite} keyboardType="url" />
            <DateCard label="Fest Start Date *" date={festStartDate} field="festStartDate" />
            <DateCard label="Fest End Date *" date={festEndDate} field="festEndDate" />

            <Text style={styles.fieldLabel}>Banner Image</Text>
            <TouchableOpacity style={styles.imageBtn} onPress={() => pickBannerImage(setFestBannerImageUri)}>
              <MaterialIcons name="add-photo-alternate" size={20} color="#0f766e" />
              <Text style={styles.imageBtnText}>{festBannerImageUri ? 'Change' : 'Select Image'}</Text>
            </TouchableOpacity>
            {!!festBannerImageUri && (
              <Image source={{ uri: festBannerImageUri }} style={styles.previewImage} contentFit="cover" />
            )}

            <TouchableOpacity style={styles.submitBtn} disabled={isSubmitting} onPress={handleCreateFest}>
              <Text style={styles.submitBtnText}>{isSubmitting ? 'Creating Fest...' : 'Create Fest & Next →'}</Text>
            </TouchableOpacity>
          </>
        );

      /* Step 1 — Add Events */
      case 1:
        return (
          <>
            <Text style={styles.stepTitle}>Add Events to Fest</Text>

            {/* Current draft */}
            <View style={styles.draftCard}>
              <Field label="Event Title *" value={festEventDraft.event_title} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, event_title: v }))} />
              <Field label="Description" value={festEventDraft.description} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, description: v }))} multiline />
              <Field label="Event Type" value={festEventDraft.event_type} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, event_type: v }))} />

              <Text style={styles.fieldLabel}>Participation Type</Text>
              {renderParticipationSelector(festEventDraft.participation_type, (next) =>
                setFestEventDraft((p) => ({ ...p, participation_type: next }))
              )}

              <Field label="Venue" value={festEventDraft.venue} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, venue: v }))} />

              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Online</Text>
                <Switch
                  value={festEventDraft.is_online}
                  onValueChange={(v) => setFestEventDraft((p) => ({ ...p, is_online: v }))}
                  trackColor={{ false: '#cbd5e1', true: '#34d399' }}
                />
              </View>

              <Field label="Registration Link" value={festEventDraft.registration_link} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, registration_link: v }))} keyboardType="url" />
              <DateCard label="Event Start Date *" date={festEventDraft.event_start_date} field="festEventStartDate" />
              <DateCard label="Event End Date" date={festEventDraft.event_end_date} field="festEventEndDate" />
              <DateCard label="Registration Deadline" date={festEventDraft.registration_deadline} field="festEventDeadline" />
              <Field label="Eligibility" value={festEventDraft.eligibility_text} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, eligibility_text: v }))} multiline />

              <TouchableOpacity style={styles.addEventBtn} onPress={addFestEvent}>
                <MaterialIcons name="add" size={18} color="#0f766e" />
                <Text style={styles.addEventBtnText}>Add Event</Text>
              </TouchableOpacity>
            </View>

            {/* Added events */}
            <Text style={styles.sectionLabel}>Added Events ({festEvents.length})</Text>
            {festEvents.map((event, idx) => (
              <View key={`${event.event_title}-${idx}`} style={styles.addedEventCard}>
                <Text style={styles.addedEventTitle}>{event.event_title}</Text>
                <Text style={styles.addedEventMeta}>
                  {event.participation_type === 'team' ? 'Team' : 'Individual'} | {formatDate(event.event_start_date)}
                </Text>
              </View>
            ))}

            <TouchableOpacity style={styles.submitBtn} onPress={() => setFestStep(2)}>
              <Text style={styles.submitBtnText}>Next: Review →</Text>
            </TouchableOpacity>
          </>
        );

      /* Step 2 — Submit */
      case 2:
        return (
          <>
            <Text style={styles.stepTitle}>Submit Fest</Text>
            <View style={styles.reviewCard}>
              <ReviewRow label="Fest Name" value={festCollegeName} />
              <ReviewRow label="Events" value={`${festEvents.length} event(s)`} />
            </View>

            {festEvents.map((event, idx) => (
              <View key={`review-${idx}`} style={styles.reviewCard}>
                <ReviewRow label="Event" value={event.event_title} />
                <ReviewRow label="Date" value={formatDate(event.event_start_date) || '–'} />
                <ReviewRow label="Type" value={event.participation_type} />
              </View>
            ))}

            <TouchableOpacity style={styles.submitBtn} disabled={isSubmitting} onPress={submitFest}>
              <MaterialIcons name="send" size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>{isSubmitting ? 'Submitting...' : 'Submit Fest & Events'}</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return null;
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     TYPE SELECTOR
  ═══════════════════════════════════════════════════════════════ */

  const renderTypeSelector = () => (
    <View style={styles.typeWrap}>
      <Text style={styles.typePrompt}>What are you submitting?</Text>
      <TouchableOpacity style={styles.typeCard} onPress={() => setSubmissionType('single')}>
        <View style={styles.typeIconWrap}>
          <MaterialIcons name="event" size={26} color="#0f766e" />
        </View>
        <View style={styles.typeTextWrap}>
          <Text style={styles.typeTitle}>Single Event</Text>
          <Text style={styles.typeSub}>One standalone event submission</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.typeCard} onPress={() => setSubmissionType('fest')}>
        <View style={[styles.typeIconWrap, { backgroundColor: '#fef9c3' }]}>
          <MaterialIcons name="celebration" size={26} color="#a16207" />
        </View>
        <View style={styles.typeTextWrap}>
          <Text style={styles.typeTitle}>Fest (Multiple Events)</Text>
          <Text style={styles.typeSub}>Create a fest and add events under it</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════
     MAIN RENDER
  ═══════════════════════════════════════════════════════════════ */

  const currentSteps = submissionType === 'fest' ? FEST_STEPS : SINGLE_STEPS;
  const currentStep = submissionType === 'fest' ? festStep : singleStep;
  const canGoBack = submissionType === 'fest' ? festStep > 0 && !createdFestId : singleStep > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (!submissionType) {
              navigation.goBack();
            } else if (canGoBack) {
              submissionType === 'fest' ? setFestStep((p) => Math.max(0, p - 1) as any) : setSingleStep((p) => p - 1);
            } else {
              setSubmissionType(null);
              setSingleStep(0);
              setFestStep(0);
            }
          }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {!submissionType ? 'Submit Event' : submissionType === 'fest' ? 'Create Fest' : 'Submit Event'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Step Indicator */}
      {!!submissionType && (
        <StepIndicator steps={currentSteps} current={currentStep} />
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!submissionType && renderTypeSelector()}
        {submissionType === 'single' && renderSingleStep()}
        {submissionType === 'fest' && renderFestStep()}

        {/* Next Button (for single event, steps 0-4) */}
        {submissionType === 'single' && singleStep < 5 && (
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => {
              if (singleStep === 0 && !eventTitle.trim()) {
                Toast.show({ type: 'error', text1: 'Event title is required' });
                return;
              }
              if (singleStep === 1 && !collegeName.trim()) {
                Toast.show({ type: 'error', text1: 'College name is required' });
                return;
              }
              if (singleStep === 3 && !eventStartDate) {
                Toast.show({ type: 'error', text1: 'Event start date is required' });
                return;
              }
              if (singleStep === 3 && !registrationDeadline) {
                Toast.show({ type: 'error', text1: 'Registration deadline is required' });
                return;
              }
              setSingleStep((p) => p + 1);
            }}
          >
            <Text style={styles.nextBtnText}>Next</Text>
            <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Date Picker */}
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
                  <DateTimePicker value={getCalendarDate()} mode="date" display="spinner" onChange={handleDateSelected} minimumDate={new Date()} />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker value={getCalendarDate()} mode="date" display="default" onChange={handleDateSelected} minimumDate={new Date()} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

/* ─── Review Row ─── */
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },

  /* ─── Step Indicator ─── */
  stepIndicatorWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotActive: { backgroundColor: '#0f766e' },
  stepDotDone: { backgroundColor: '#0f766e' },
  stepDotText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  stepDotTextActive: { color: '#ffffff' },
  stepLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', textAlign: 'center' },
  stepLabelActive: { color: '#0f766e', fontWeight: '700' },
  stepLine: {
    position: 'absolute',
    top: 13,
    left: '60%',
    right: '-40%',
    height: 2,
    backgroundColor: '#e2e8f0',
    zIndex: -1,
  },
  stepLineDone: { backgroundColor: '#0f766e' },

  /* ─── Type Selector ─── */
  typeWrap: { gap: 12 },
  typePrompt: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  typeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  typeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTextWrap: { flex: 1 },
  typeTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  typeSub: { marginTop: 2, fontSize: 12, color: '#64748b' },

  /* ─── Step Content ─── */
  stepTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  helperText: { fontSize: 13, color: '#64748b', marginBottom: 4 },

  /* ─── Fields ─── */
  fieldWrap: { marginBottom: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0f172a',
  },
  inputMultiline: { minHeight: 82, textAlignVertical: 'top' },
  dateCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateCardLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },

  /* ─── Segments ─── */
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    padding: 3,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#0f766e' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  segmentTextActive: { color: '#ffffff' },

  /* ─── Switch ─── */
  switchRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },

  /* ─── Image ─── */
  imageBtn: {
    borderWidth: 1.5,
    borderColor: '#0f766e',
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  imageBtnText: { color: '#0f766e', fontSize: 14, fontWeight: '700' },
  previewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    marginTop: 8,
    backgroundColor: '#e2e8f0',
  },

  /* ─── Next / Submit ─── */
  nextBtn: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  submitBtn: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },

  /* ─── Review ─── */
  reviewBanner: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    marginBottom: 8,
  },
  reviewCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 6,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  reviewLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  reviewValue: { fontSize: 13, color: '#0f172a', fontWeight: '500', textAlign: 'right', flex: 1 },

  /* ─── Fest Events ─── */
  draftCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 6,
  },
  addEventBtn: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addEventBtnText: { color: '#0f766e', fontWeight: '700', fontSize: 14 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  addedEventCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
    backgroundColor: '#ecfdf5',
    padding: 12,
  },
  addedEventTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  addedEventMeta: { marginTop: 3, fontSize: 12, color: '#64748b' },

  /* ─── iOS Date Picker Modal ─── */
  iosBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iosHeaderText: { fontSize: 15, color: '#0f766e', fontWeight: '700' },
  iosTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
});
