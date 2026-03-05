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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { submitInterCampusEvent, submitInterCampusFestEvents } from '../api/intercampus';
import { InterCampusSubmissionInput } from '../types/intercampus';
import { buildInterCampusDetailsDescription } from '../utils/eventDetails';

type Nav = StackNavigationProp<RootStackParamList>;
type SubmissionType = 'single' | 'fest' | null;

type FestEventDraft = {
  event_title: string;
  event_description: string;
  event_type: string;
  participation_type: 'individual' | 'team';
  min_team_size: string;
  max_team_size: string;
  venue: string;
  is_online: boolean;
  online_link: string;
  registration_link: string;
  registration_deadline: Date | null;
  eligibility: string;
  event_start_date: Date | null;
};

const initialFestEvent = (): FestEventDraft => ({
  event_title: '',
  event_description: '',
  event_type: '',
  participation_type: 'individual',
  min_team_size: '',
  max_team_size: '',
  venue: '',
  is_online: false,
  online_link: '',
  registration_link: '',
  registration_deadline: null,
  eligibility: '',
  event_start_date: null,
});

const parseNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'url';
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

export default function InterCampusSubmitEventScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [submissionType, setSubmissionType] = useState<SubmissionType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Single event form
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [collegeLocation, setCollegeLocation] = useState('');
  const [collegeWebsite, setCollegeWebsite] = useState('');
  const [eventType, setEventType] = useState('');
  const [participationType, setParticipationType] = useState<'individual' | 'team'>('individual');
  const [minTeamSize, setMinTeamSize] = useState('');
  const [maxTeamSize, setMaxTeamSize] = useState('');
  const [eventStartDate, setEventStartDate] = useState<Date | null>(null);
  const [venue, setVenue] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [onlineLink, setOnlineLink] = useState('');
  const [registrationLink, setRegistrationLink] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState<Date | null>(null);
  const [eligibility, setEligibility] = useState('');
  const [bannerImage, setBannerImage] = useState('');

  // Fest details
  const [festName, setFestName] = useState('');
  const [festCollegeName, setFestCollegeName] = useState('');
  const [festCollegeLocation, setFestCollegeLocation] = useState('');
  const [festCollegeWebsite, setFestCollegeWebsite] = useState('');
  const [festStartDate, setFestStartDate] = useState<Date | null>(null);
  const [festEndDate, setFestEndDate] = useState<Date | null>(null);
  const [festBannerImage, setFestBannerImage] = useState('');

  const [festStep, setFestStep] = useState<1 | 2>(1);
  const [festEventDraft, setFestEventDraft] = useState<FestEventDraft>(initialFestEvent());
  const [festEvents, setFestEvents] = useState<FestEventDraft[]>([]);
  const [calendarState, setCalendarState] = useState<{
    field:
      | 'eventStartDate'
      | 'registrationDeadline'
      | 'festStartDate'
      | 'festEndDate'
      | 'festEventStartDate'
      | 'festRegistrationDeadline'
      | null;
    visible: boolean;
  }>({ field: null, visible: false });

  const formatDate = (date?: Date | null) => {
    if (!date) return null;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const openCalendar = (
    field:
      | 'eventStartDate'
      | 'registrationDeadline'
      | 'festStartDate'
      | 'festEndDate'
      | 'festEventStartDate'
      | 'festRegistrationDeadline',
  ) => {
    setCalendarState({ field, visible: true });
  };

  const handleDateSelected = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setCalendarState({ field: null, visible: false });
    }

    if (!selectedDate || !calendarState.field) return;

    if (calendarState.field === 'eventStartDate') setEventStartDate(selectedDate);
    if (calendarState.field === 'registrationDeadline') setRegistrationDeadline(selectedDate);
    if (calendarState.field === 'festStartDate') setFestStartDate(selectedDate);
    if (calendarState.field === 'festEndDate') setFestEndDate(selectedDate);
    if (calendarState.field === 'festEventStartDate') {
      setFestEventDraft((prev) => ({ ...prev, event_start_date: selectedDate }));
    }
    if (calendarState.field === 'festRegistrationDeadline') {
      setFestEventDraft((prev) => ({ ...prev, registration_deadline: selectedDate }));
    }

    if (Platform.OS === 'ios') {
      setCalendarState({ field: null, visible: false });
    }
  };

  const canSaveFestEvent = useMemo(() => {
    return (
      !!festEventDraft.event_title.trim() &&
      !!festEventDraft.registration_link.trim() &&
      !!festEventDraft.event_start_date &&
      !!festEventDraft.registration_deadline
    );
  }, [festEventDraft]);

  const validateSingle = () => {
    if (!eventTitle.trim() || !collegeName.trim()) {
      throw new Error('Event title and college name are required');
    }
    if (!eventStartDate) {
      throw new Error('Event start date is required');
    }
    if (!registrationDeadline) {
      throw new Error('Registration deadline is required');
    }
    if (registrationDeadline >= eventStartDate) {
      throw new Error('Registration deadline must be before the event start date.');
    }

    const min = parseNumber(minTeamSize);
    const max = parseNumber(maxTeamSize);
    if (participationType === 'team') {
      if (typeof min !== 'number' || typeof max !== 'number') {
        throw new Error('Team events require min and max team size');
      }
      if (min > max) {
        throw new Error('Minimum team size cannot exceed maximum team size');
      }
    }
  };

  const handleSubmitSingle = async () => {
    if (!user?.id) return;

    try {
      validateSingle();
      setIsSubmitting(true);

      const min = parseNumber(minTeamSize);
      const max = parseNumber(maxTeamSize);

      const enrichedDescription = buildInterCampusDetailsDescription(eventDescription, [
        eventType ? `Event Type: ${eventType}` : '',
        venue ? `Venue: ${venue}` : '',
        isOnline ? 'Mode: Online' : 'Mode: Offline',
        onlineLink ? `Online Link: ${onlineLink}` : '',
        registrationDeadline ? `Registration Deadline: ${registrationDeadline}` : '',
        eligibility ? `Eligibility: ${eligibility}` : '',
        bannerImage ? `Banner: ${bannerImage}` : '',
      ]);

      const payload: InterCampusSubmissionInput = {
        event_title: eventTitle.trim(),
        event_description: enrichedDescription,
        college_name: collegeName.trim(),
        college_location: collegeLocation.trim(),
        college_website: collegeWebsite.trim(),
        event_start_date: eventStartDate?.toISOString(),
        registration_deadline: registrationDeadline?.toISOString(),
        registration_link: registrationLink.trim(),
        participation_type: participationType,
        min_team_size: participationType === 'team' ? min : undefined,
        max_team_size: participationType === 'team' ? max : undefined,
      };

      await submitInterCampusEvent(user.id, payload);
      Toast.show({ type: 'success', text1: 'Your event has been submitted for faculty verification.' });
      Alert.alert(
        'Submission Sent',
        'Your event has been submitted for faculty verification.',
        [
          { text: 'View My Submissions', onPress: () => navigation.navigate('MySubmittedEvents') },
          { text: 'Close', onPress: () => navigation.goBack(), style: 'cancel' },
        ],
      );
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Submission failed', text2: error?.message || 'Please review form values' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addFestEvent = () => {
    if (!canSaveFestEvent) {
      Toast.show({ type: 'error', text1: 'Add event title and registration link first' });
      return;
    }

    if (festEventDraft.participation_type === 'team') {
      const min = parseNumber(festEventDraft.min_team_size);
      const max = parseNumber(festEventDraft.max_team_size);
      if (typeof min !== 'number' || typeof max !== 'number' || min > max) {
        Toast.show({ type: 'error', text1: 'Invalid team size range' });
        return;
      }
    }
    if (!festEventDraft.event_start_date || !festEventDraft.registration_deadline) {
      Toast.show({ type: 'error', text1: 'Event start date and registration deadline are required' });
      return;
    }
    if (festEventDraft.registration_deadline >= festEventDraft.event_start_date) {
      Toast.show({ type: 'error', text1: 'Registration deadline must be before the event start date.' });
      return;
    }

    setFestEvents((prev) => [...prev, festEventDraft]);
    setFestEventDraft(initialFestEvent());
  };

  const submitFest = async () => {
    if (!user?.id) return;

    if (!festName.trim() || !festCollegeName.trim()) {
      Toast.show({ type: 'error', text1: 'Fest name and college name are required' });
      return;
    }

    if (festEvents.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one fest event' });
      return;
    }

    try {
      setIsSubmitting(true);

      const mapped = festEvents.map((event) => {
        const min = parseNumber(event.min_team_size);
        const max = parseNumber(event.max_team_size);
        const enrichedDescription = buildInterCampusDetailsDescription(event.event_description, [
          event.event_type ? `Event Type: ${event.event_type}` : '',
          event.venue ? `Venue: ${event.venue}` : '',
          event.is_online ? 'Mode: Online' : 'Mode: Offline',
          event.online_link ? `Online Link: ${event.online_link}` : '',
          event.registration_deadline ? `Registration Deadline: ${event.registration_deadline.toISOString()}` : '',
          event.eligibility ? `Eligibility: ${event.eligibility}` : '',
          festBannerImage ? `Fest Banner: ${festBannerImage}` : '',
        ]);

        return {
          event_title: event.event_title,
          event_description: enrichedDescription,
          college_name: festCollegeName,
          registration_link: event.registration_link,
          event_start_date: event.event_start_date?.toISOString(),
          participation_type: event.participation_type,
          registration_deadline: event.registration_deadline?.toISOString(),
          min_team_size: event.participation_type === 'team' ? min : undefined,
          max_team_size: event.participation_type === 'team' ? max : undefined,
        } as InterCampusSubmissionInput;
      });

      await submitInterCampusFestEvents(
        user.id,
        festName,
        {
          college_name: festCollegeName,
          college_location: festCollegeLocation,
          college_website: festCollegeWebsite,
          fest_start_date: festStartDate?.toISOString(),
          fest_end_date: festEndDate?.toISOString(),
        },
        mapped,
      );

      Toast.show({ type: 'success', text1: 'Fest submitted', text2: `${festEvents.length} events sent for verification.` });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Fest submission failed', text2: error?.message || 'Please try again' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTypeSelector = () => (
    <View style={styles.selectWrap}>
      <Text style={styles.prompt}>What are you submitting?</Text>
      <TouchableOpacity style={styles.selectCard} onPress={() => setSubmissionType('single')}>
        <MaterialIcons name="event" size={22} color="#0f766e" />
        <View style={styles.selectTextWrap}>
          <Text style={styles.selectTitle}>Single Event</Text>
          <Text style={styles.selectSub}>One external event for verification</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.selectCard} onPress={() => setSubmissionType('fest')}>
        <MaterialIcons name="festival" size={22} color="#a16207" />
        <View style={styles.selectTextWrap}>
          <Text style={styles.selectTitle}>Fest (Multiple Events)</Text>
          <Text style={styles.selectSub}>Submit a fest and add multiple events</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderParticipationSelector = (
    selected: 'individual' | 'team',
    onChange: (next: 'individual' | 'team') => void,
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Submit Event</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!submissionType && renderTypeSelector()}

        {submissionType === 'single' && (
          <>
            <Field label="Event Title" value={eventTitle} onChangeText={setEventTitle} />
            <Field label="Description" value={eventDescription} onChangeText={setEventDescription} multiline />
            <Field label="College Name" value={collegeName} onChangeText={setCollegeName} />
            <Field label="College Location" value={collegeLocation} onChangeText={setCollegeLocation} />
            <Field label="College Website" value={collegeWebsite} onChangeText={setCollegeWebsite} keyboardType="url" />
            <Field label="Event Type" value={eventType} onChangeText={setEventType} />

            <Text style={styles.fieldLabel}>Participation Type</Text>
            {renderParticipationSelector(participationType, setParticipationType)}

            {participationType === 'team' && (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field label="Min Team Size" value={minTeamSize} onChangeText={setMinTeamSize} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Max Team Size" value={maxTeamSize} onChangeText={setMaxTeamSize} keyboardType="numeric" />
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>Event Start Date</Text>
            <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('eventStartDate')}>
              <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
              <Text style={styles.dateCardLabel}>
                {formatDate(eventStartDate) || 'Select Event Start Date'}
              </Text>
            </TouchableOpacity>
            <Field label="Venue" value={venue} onChangeText={setVenue} />

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Online Event</Text>
              <Switch value={isOnline} onValueChange={setIsOnline} trackColor={{ false: '#cbd5e1', true: '#34d399' }} />
            </View>
            {isOnline && <Field label="Online Link" value={onlineLink} onChangeText={setOnlineLink} keyboardType="url" />}

            <Field label="Registration Link" value={registrationLink} onChangeText={setRegistrationLink} keyboardType="url" />
            <Text style={styles.fieldLabel}>Registration Deadline</Text>
            <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('registrationDeadline')}>
              <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
              <Text style={styles.dateCardLabel}>
                {formatDate(registrationDeadline) || 'Select Registration Deadline'}
              </Text>
            </TouchableOpacity>
            <Field label="Eligibility" value={eligibility} onChangeText={setEligibility} multiline />
            <Field label="Banner Image URL" value={bannerImage} onChangeText={setBannerImage} keyboardType="url" />

            <TouchableOpacity style={styles.primaryBtn} disabled={isSubmitting} onPress={handleSubmitSingle}>
              <Text style={styles.primaryBtnText}>{isSubmitting ? 'Submitting...' : 'Submit'}</Text>
            </TouchableOpacity>
          </>
        )}

        {submissionType === 'fest' && (
          <>
            {festStep === 1 && (
              <>
                <Field label="Fest Name" value={festName} onChangeText={setFestName} />
                <Field label="College Name" value={festCollegeName} onChangeText={setFestCollegeName} />
                <Field label="College Location" value={festCollegeLocation} onChangeText={setFestCollegeLocation} />
                <Field label="College Website" value={festCollegeWebsite} onChangeText={setFestCollegeWebsite} keyboardType="url" />
                <Text style={styles.fieldLabel}>Fest Start Date</Text>
                <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('festStartDate')}>
                  <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
                  <Text style={styles.dateCardLabel}>{formatDate(festStartDate) || 'Select Fest Start Date'}</Text>
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>Fest End Date</Text>
                <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('festEndDate')}>
                  <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
                  <Text style={styles.dateCardLabel}>{formatDate(festEndDate) || 'Select Fest End Date'}</Text>
                </TouchableOpacity>
                <Field label="Banner Image URL" value={festBannerImage} onChangeText={setFestBannerImage} keyboardType="url" />

                <TouchableOpacity style={styles.primaryBtn} onPress={() => setFestStep(2)}>
                  <Text style={styles.primaryBtnText}>Next: Add Events</Text>
                </TouchableOpacity>
              </>
            )}

            {festStep === 2 && (
              <>
                <Text style={styles.sectionTitle}>Add Event to Fest</Text>
                <Field label="Event Title" value={festEventDraft.event_title} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, event_title: v }))} />
                <Field label="Description" value={festEventDraft.event_description} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, event_description: v }))} multiline />
                <Field label="Event Type" value={festEventDraft.event_type} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, event_type: v }))} />

                <Text style={styles.fieldLabel}>Participation Type</Text>
                {renderParticipationSelector(festEventDraft.participation_type, (next) => setFestEventDraft((p) => ({ ...p, participation_type: next })))}

                {festEventDraft.participation_type === 'team' && (
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Field label="Min Team Size" value={festEventDraft.min_team_size} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, min_team_size: v }))} keyboardType="numeric" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Max Team Size" value={festEventDraft.max_team_size} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, max_team_size: v }))} keyboardType="numeric" />
                    </View>
                  </View>
                )}

                <Field label="Venue" value={festEventDraft.venue} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, venue: v }))} />
                <View style={styles.switchRow}>
                  <Text style={styles.fieldLabel}>Online Event</Text>
                  <Switch value={festEventDraft.is_online} onValueChange={(v) => setFestEventDraft((p) => ({ ...p, is_online: v }))} trackColor={{ false: '#cbd5e1', true: '#34d399' }} />
                </View>
                {festEventDraft.is_online && (
                  <Field label="Online Link" value={festEventDraft.online_link} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, online_link: v }))} keyboardType="url" />
                )}
                <Field label="Registration Link" value={festEventDraft.registration_link} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, registration_link: v }))} keyboardType="url" />
                <Text style={styles.fieldLabel}>Registration Deadline</Text>
                <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('festRegistrationDeadline')}>
                  <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
                  <Text style={styles.dateCardLabel}>{formatDate(festEventDraft.registration_deadline) || 'Select Registration Deadline'}</Text>
                </TouchableOpacity>
                <Field label="Eligibility" value={festEventDraft.eligibility} onChangeText={(v) => setFestEventDraft((p) => ({ ...p, eligibility: v }))} multiline />
                <Text style={styles.fieldLabel}>Event Start Date</Text>
                <TouchableOpacity style={styles.dateCard} onPress={() => openCalendar('festEventStartDate')}>
                  <MaterialIcons name="calendar-month" size={18} color="#0f766e" />
                  <Text style={styles.dateCardLabel}>{formatDate(festEventDraft.event_start_date) || 'Select Event Start Date'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={addFestEvent}>
                  <Text style={styles.secondaryBtnText}>Add Event</Text>
                </TouchableOpacity>

                <View style={styles.addedEventsWrap}>
                  <Text style={styles.sectionTitle}>Added Events ({festEvents.length})</Text>
                  {festEvents.map((event, idx) => (
                    <View key={`${event.event_title}-${idx}`} style={styles.addedEventCard}>
                      <Text style={styles.addedEventTitle}>{event.event_title}</Text>
                      <Text style={styles.addedEventMeta}>{event.participation_type === 'team' ? 'Team' : 'Individual'} | {event.registration_link}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={styles.primaryBtn} disabled={isSubmitting} onPress={submitFest}>
                  <Text style={styles.primaryBtnText}>{isSubmitting ? 'Submitting...' : 'Submit Fest'}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>

      {calendarState.visible && calendarState.field && (
        <>
          {(() => {
            const pickerDate =
              calendarState.field === 'eventStartDate'
                ? eventStartDate
                : calendarState.field === 'registrationDeadline'
                ? registrationDeadline
                : calendarState.field === 'festStartDate'
                ? festStartDate
                : calendarState.field === 'festEndDate'
                ? festEndDate
                : calendarState.field === 'festEventStartDate'
                ? festEventDraft.event_start_date
                : festEventDraft.registration_deadline;
            const value = pickerDate || new Date();
            return Platform.OS === 'ios' ? (
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
                      value={value}
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
                value={value}
                mode="date"
                display="default"
                onChange={handleDateSelected}
                minimumDate={new Date()}
              />
            );
          })()}
        </>
      )}
    </SafeAreaView>
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 30, gap: 8 },
  selectWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  prompt: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  selectCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fffc',
  },
  selectTextWrap: { flex: 1 },
  selectTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  selectSub: { marginTop: 2, fontSize: 12, color: '#64748b' },
  fieldWrap: { marginBottom: 6 },
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
  inputMultiline: { minHeight: 82, textAlignVertical: 'top' },
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
  segmentBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
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
  primaryBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0f766e',
  },
  primaryBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
  },
  secondaryBtnText: { color: '#0f766e', fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 6, marginTop: 8 },
  addedEventsWrap: { marginTop: 8, gap: 8 },
  addedEventCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 10,
  },
  addedEventTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  addedEventMeta: { marginTop: 3, fontSize: 12, color: '#64748b' },
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
