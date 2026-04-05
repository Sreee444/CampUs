// @ts-nocheck
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isFacultyOrAdminRole } from '../../../utils/roles';
import { supabase } from '../../../api/supabase';
import InterCampusScreen from '../components/InterCampusScreen';
import {
  extractInterCampusEventFromLink,
  extractInterCampusFestFromLink,
  extractInterCampusFestFromPoster,
  extractInterCampusEventFromPoster,
} from '../api/intercampus';

type Nav = StackNavigationProp<RootStackParamList>;
type SubmissionType = 'single' | 'fest' | null;
type SourceType = 'manual' | 'link' | 'poster';
type FestStep = 'details' | 'events';
type ExtractTarget = 'single' | 'fest' | 'fest_event';
type PosterTarget = 'single' | 'fest_details' | 'fest_event';

type EventDraft = {
  title: string;
  description: string;
  event_start_datetime: string;
  event_start_time: string;
  event_start_date: string;
  event_end_date: string;
  venue: string;
  participation_type: 'individual' | 'team';
  min_team_size: string;
  max_team_size: string;
  registration_link: string;
  event_type: string;
  banner_image: string;
  source_type: SourceType;
  source_url: string;
  poster_image: string;
  ai_generated: boolean;
};

const emptyDraft = (sourceType: SourceType = 'manual'): EventDraft => ({
  title: '',
  description: '',
  event_start_datetime: '',
  event_start_time: '',
  event_start_date: '',
  event_end_date: '',
  venue: '',
  participation_type: 'individual',
  min_team_size: '',
  max_team_size: '',
  registration_link: '',
  event_type: '',
  banner_image: '',
  source_type: sourceType,
  source_url: '',
  poster_image: '',
  ai_generated: false,
});

const asString = (value: any) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const asTrimmed = (value: any) => asString(value).trim();

const cleanAiText = (value: any) =>
  asTrimmed(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[©®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const INSTITUTION_NOISE_WORDS = [
  'autonomous',
  'department',
  'dept',
  'college',
  'university',
  'society',
  'assistant professor',
  'prof',
  'students',
  'cse',
  'ece',
];

const removeInstitutionNoise = (value: string) => {
  let result = value;
  INSTITUTION_NOISE_WORDS.forEach((word) => {
    const pattern = new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    result = result.replace(pattern, ' ');
  });
  return result.replace(/\s+/g, ' ').trim();
};

const normalizePosterTitle = (rawTitle: any, rawDescription: any) => {
  const baseTitle = cleanAiText(rawTitle);
  const baseDescription = cleanAiText(rawDescription);

  let cleaned = removeInstitutionNoise(baseTitle);
  cleaned = cleaned.replace(/^on\s+/i, '').trim();

  if (!cleaned || cleaned.length < 4) {
    if (/\blatex\b/i.test(`${baseTitle} ${baseDescription}`)) {
      return 'Workshop on LaTeX';
    }
    if (/\bworkshop\b/i.test(baseDescription)) {
      return 'Workshop';
    }
    return baseTitle;
  }

  if (/\blatex\b/i.test(cleaned) && !/\bworkshop\b/i.test(cleaned)) {
    return `Workshop on ${cleaned.replace(/\blatex\b/i, 'LaTeX')}`;
  }

  return cleaned;
};

const normalizePosterDescription = (rawDescription: any, normalizedTitle: string) => {
  const desc = cleanAiText(rawDescription);
  if (!desc) return '';

  const descLower = desc.toLowerCase();
  const titleLower = cleanAiText(normalizedTitle).toLowerCase();

  const hasEventKeyword = /\b(workshop|seminar|hackathon|competition|contest|talk|session|bootcamp|expo|event)\b/i.test(desc);
  const looksInstitutional = INSTITUTION_NOISE_WORDS.some((word) => descLower.includes(word));

  if (!hasEventKeyword && looksInstitutional) return '';
  if (titleLower && descLower === titleLower) return '';

  return desc;
};

const isLikelyValidPosterUrl = (value: any) => {
  const raw = cleanAiText(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.')) return false;
    if (host.includes('dept.') || host.includes('department')) return false;
    const tld = host.split('.').pop() || '';
    const commonTlds = new Set(['com', 'org', 'net', 'edu', 'in', 'ac', 'co', 'io', 'gov']);
    if (!commonTlds.has(tld)) return false;
    return true;
  } catch {
    return false;
  }
};

const sanitizePosterExtractedPayload = (extracted: any) => {
  const normalizedTitle = normalizePosterTitle(extracted?.title, extracted?.description);
  const normalizedDescription = normalizePosterDescription(extracted?.description, normalizedTitle);

  return {
    ...extracted,
    title: normalizedTitle,
    description: normalizedDescription,
    event_link: isLikelyValidPosterUrl(extracted?.event_link || extracted?.eventLink) ? asString(extracted?.event_link || extracted?.eventLink) : '',
    registration_link: isLikelyValidPosterUrl(extracted?.registration_link || extracted?.registrationLink || extracted?.registration_qr_link || extracted?.registrationQrLink)
      ? asString(extracted?.registration_link || extracted?.registrationLink || extracted?.registration_qr_link || extracted?.registrationQrLink)
      : '',
  };
};

const dateOnlyFromDateTime = (value: any) => {
  const raw = asTrimmed(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const timeOnlyFromDateTime = (value: any) => {
  const raw = asTrimmed(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(11, 16);
  }
  const match = raw.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : '';
};

const combineDateAndTime = (dateValue: string, timeValue: string) => {
  const dateOnly = asTrimmed(dateValue);
  const timeOnly = asTrimmed(timeValue);
  if (!dateOnly) return '';
  if (!timeOnly) return dateOnly;
  return `${dateOnly}T${timeOnly}:00`;
};

const normalizeTimeValue = (value: string) => {
  const raw = asTrimmed(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
};

const logAutoFillDiagnostics = (target: string, extracted: any, draftPatch: Partial<EventDraft>) => {
  const required = ['title', 'event_type', 'participation_type', 'event_start_date', 'registration_link'];
  const missingFromExtracted = required.filter((field) => !asTrimmed(extracted?.[field]) && !asTrimmed(extracted?.[field.replace('_', '')]));
  const missingInDraft = required.filter((field) => !asTrimmed((draftPatch as any)?.[field]));

  console.log('[InterCampus AI UI] autofill diagnostics', {
    target,
    extractedKeys: Object.keys(extracted || {}),
    appliedDraft: draftPatch,
    missingFromExtracted,
    missingInDraft,
    hasPosterImage: !!asTrimmed((draftPatch as any)?.poster_image),
    hasBannerImage: !!asTrimmed((draftPatch as any)?.banner_image),
  });

  if (missingInDraft.length) {
    console.warn('[InterCampus AI UI] required fields still empty after autofill', {
      target,
      missingInDraft,
    });
  }
};

const toDraftFromExtracted = (
  extracted: any,
  sourceType: SourceType,
  sourceUrl = '',
  posterUri = '',
): Partial<EventDraft> => {
  const safeExtracted = sourceType === 'poster' ? sanitizePosterExtractedPayload(extracted) : extracted;

  const eventStartDateTime = asString(safeExtracted?.event_start_datetime || safeExtracted?.eventStartDateTime);
  const eventStartDate = asString(safeExtracted?.event_start_date) || dateOnlyFromDateTime(eventStartDateTime);
  const eventStartTime = asString(safeExtracted?.event_start_time || safeExtracted?.eventStartTime) || timeOnlyFromDateTime(eventStartDateTime);
  const eventLink = asString(safeExtracted?.event_link || safeExtracted?.eventLink);
  const resolvedSourceUrl = eventLink || sourceUrl;

  return {
    title: asString(safeExtracted?.title),
    description: asString(safeExtracted?.description),
    event_start_datetime: eventStartDateTime,
    event_start_time: eventStartTime,
    event_start_date: eventStartDate,
    event_end_date: asString(safeExtracted?.event_end_date),
    venue: asString(safeExtracted?.venue),
    participation_type: asString(safeExtracted?.participation_type).toLowerCase() === 'team' ? 'team' : 'individual',
    min_team_size: safeExtracted?.min_team_size === null || safeExtracted?.min_team_size === undefined ? '' : asString(safeExtracted?.min_team_size),
    max_team_size: safeExtracted?.max_team_size === null || safeExtracted?.max_team_size === undefined ? '' : asString(safeExtracted?.max_team_size),
    registration_link: asString(safeExtracted?.registration_link || safeExtracted?.registration_qr_link || safeExtracted?.registrationQrLink),
    event_type: asString(safeExtracted?.event_type),
    banner_image: asString(safeExtracted?.banner_image || safeExtracted?.bannerImage),
    source_type: sourceType,
    source_url: resolvedSourceUrl,
    poster_image: posterUri || asString(safeExtracted?.poster_image || safeExtracted?.posterImage || safeExtracted?.banner_image || safeExtracted?.bannerImage),
    ai_generated: true,
  };
};

const dedupeRepeatedEventImages = (events: EventDraft[]) => {
  const seenImages = new Set<string>();

  return events.map((event) => {
    const primaryImage = asTrimmed(event.poster_image || event.banner_image);
    if (!primaryImage) return event;

    if (seenImages.has(primaryImage)) {
      return {
        ...event,
        poster_image: '',
        banner_image: '',
      };
    }

    seenImages.add(primaryImage);
    return event;
  });
};

const getEventCompleteness = (event: EventDraft) => {
  const hasTitle = !!asTrimmed(event.title);
  const hasStartDate = !!asTrimmed(event.event_start_date);
  const hasStartTime = !!asTrimmed(event.event_start_time) || !!asTrimmed(event.event_start_datetime);
  const hasParticipation = !!asTrimmed(event.participation_type);
  const hasRegistration = !!asTrimmed(event.registration_link);
  const full = hasTitle && hasStartDate && hasStartTime && hasParticipation && hasRegistration;
  return {
    full,
    missing: [
      !hasStartDate ? 'date' : '',
      !hasStartTime ? 'time' : '',
      !hasParticipation ? 'mode' : '',
      !hasRegistration ? 'registration' : '',
    ].filter(Boolean),
  };
};

const formatEventDateLabel = (event: EventDraft) => {
  const raw = asTrimmed(event.event_start_date) || dateOnlyFromDateTime(event.event_start_datetime);
  if (!raw) return 'Date TBA';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatEventTimeLabel = (event: EventDraft) => {
  const raw = asTrimmed(event.event_start_time) || timeOnlyFromDateTime(event.event_start_datetime);
  return raw || 'Time TBA';
};

const toIso = (value: string) => {
  const raw = asTrimmed(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const inferYearFromDates = (start?: string, end?: string) => {
  const raw = asTrimmed(start || end || '');
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear();
};

const isValidHttpUrl = (value: string) => {
  const raw = asTrimmed(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const validateDraft = (draft: EventDraft) => {
  if (!asTrimmed(draft.title)) return 'Event title is required';

  const startIso = toIso(draft.event_start_date);
  if (!startIso) return 'Event start date is required in valid format';

  if (asTrimmed(draft.event_start_time) && !/^\d{1,2}:\d{2}$/.test(asTrimmed(draft.event_start_time))) {
    return 'Event start time must be in HH:mm format';
  }

  if (draft.participation_type === 'team') {
    const min = Number(draft.min_team_size || '0');
    const max = Number(draft.max_team_size || '0');
    if (!asTrimmed(draft.min_team_size) || !asTrimmed(draft.max_team_size)) {
      return 'Team size fields are required for team events';
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Team size fields must be numeric';
    if (min > max) return 'Minimum team size cannot exceed maximum team size';
  }

  if (asTrimmed(draft.registration_link) && !isValidHttpUrl(draft.registration_link)) {
    return 'Registration link must be a valid URL';
  }

  if (draft.source_type === 'link') {
    if (!asTrimmed(draft.source_url)) return 'Source URL is required for website-imported events';
    if (!isValidHttpUrl(draft.source_url)) return 'Source URL is invalid';
  }

  if (asTrimmed(draft.banner_image) && !isValidHttpUrl(draft.banner_image)) {
    return 'Extracted banner URL is invalid';
  }

  return null;
};

const TextField = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder || ''}
      placeholderTextColor="#94a3b8"
      multiline={!!multiline}
      style={[styles.input, multiline && styles.inputMultiline]}
    />
  </View>
);

function SourcePicker({
  selected,
  onSelect,
  includeLink = true,
}: {
  selected: SourceType;
  onSelect: (value: SourceType) => void;
  includeLink?: boolean;
}) {
  const options = [
    includeLink ? { key: 'link', label: 'Import from Website', icon: 'language' } : null,
    { key: 'poster', label: 'Upload Poster', icon: 'image' },
    { key: 'manual', label: 'Manual Entry', icon: 'edit' },
  ].filter(Boolean) as Array<{ key: SourceType; label: string; icon: 'language' | 'image' | 'edit' }>;

  return (
    <View style={styles.sourceGrid}>
      {options.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.sourceCard, selected === item.key && styles.sourceCardActive]}
          onPress={() => onSelect(item.key)}
        >
          <MaterialIcons name={item.icon} size={18} color={selected === item.key ? '#ffffff' : '#6366F1'} />
          <Text style={[styles.sourceText, selected === item.key && styles.sourceTextActive]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function EventEditor({
  draft,
  setDraft,
}: {
  draft: EventDraft;
  setDraft: React.Dispatch<React.SetStateAction<EventDraft>>;
}) {
  return (
    <View style={styles.card}>
      <TextField label="Title *" value={draft.title} onChangeText={(v) => setDraft((p) => ({ ...p, title: v }))} />
      <TextField
        label="Description"
        value={draft.description}
        onChangeText={(v) => setDraft((p) => ({ ...p, description: v }))}
        multiline
      />
      <TextField
        label="Event Start Date (YYYY-MM-DD) *"
        value={draft.event_start_date}
        onChangeText={(v) => setDraft((p) => ({ ...p, event_start_date: v }))}
        placeholder="2026-04-20"
      />
      <TextField
        label="Event Start Time (HH:mm)"
        value={draft.event_start_time}
        onChangeText={(v) => setDraft((p) => ({ ...p, event_start_time: normalizeTimeValue(v) }))}
        placeholder="13:00"
      />
      <TextField label="Venue" value={draft.venue} onChangeText={(v) => setDraft((p) => ({ ...p, venue: v }))} />

      <Text style={styles.fieldLabel}>Participation Type</Text>
      <View style={styles.segmentWrap}>
        {(['individual', 'team'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.segmentBtn, draft.participation_type === type && styles.segmentBtnActive]}
            onPress={() => setDraft((p) => ({ ...p, participation_type: type }))}
          >
            <Text style={[styles.segmentText, draft.participation_type === type && styles.segmentTextActive]}>
              {type === 'team' ? 'Team' : 'Individual'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {draft.participation_type === 'team' && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Min Team Size"
              value={draft.min_team_size}
              onChangeText={(v) => setDraft((p) => ({ ...p, min_team_size: v }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Max Team Size"
              value={draft.max_team_size}
              onChangeText={(v) => setDraft((p) => ({ ...p, max_team_size: v }))}
            />
          </View>
        </View>
      )}

      <TextField
        label="Registration Link"
        value={draft.registration_link}
        onChangeText={(v) => setDraft((p) => ({ ...p, registration_link: v }))}
        placeholder="https://..."
      />
      <TextField
        label="Event Type"
        value={draft.event_type}
        onChangeText={(v) => setDraft((p) => ({ ...p, event_type: v }))}
        placeholder="Technical / Cultural / Sports"
      />
      <TextField
        label="Event Web Link"
        value={draft.source_url}
        onChangeText={(v) => setDraft((p) => ({ ...p, source_url: v }))}
        placeholder="https://..."
      />

      {!!asTrimmed(draft.poster_image || draft.banner_image) && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.fieldLabel}>Extracted Event Image</Text>
          <Image source={{ uri: asTrimmed(draft.poster_image || draft.banner_image) }} style={styles.posterPreview} contentFit="cover" />
        </View>
      )}
    </View>
  );
}

export default function InterCampusSubmitEventScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const isAutoApprove = isFacultyOrAdminRole(profile?.role);

  const [submissionType, setSubmissionType] = useState<SubmissionType>(null);
  const [festStep, setFestStep] = useState<FestStep>('details');
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sourceType, setSourceType] = useState<SourceType>('manual');
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [singleDraft, setSingleDraft] = useState<EventDraft>(emptyDraft('manual'));
  const [previewRequired, setPreviewRequired] = useState(false);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);

  const [collegeName, setCollegeName] = useState('');
  const [collegeLocation, setCollegeLocation] = useState('');

  const [festName, setFestName] = useState('');
  const [festStartDate, setFestStartDate] = useState('');
  const [festEndDate, setFestEndDate] = useState('');
  const [festCollegeName, setFestCollegeName] = useState('');
  const [festCollegeLocation, setFestCollegeLocation] = useState('');
  const [festEvents, setFestEvents] = useState<EventDraft[]>([]);

  const [festEventSourceType, setFestEventSourceType] = useState<SourceType>('manual');
  const [festSourceUrlInput, setFestSourceUrlInput] = useState('');
  const [festPosterUri, setFestPosterUri] = useState('');
  const [festEventLinkInput, setFestEventLinkInput] = useState('');
  const [festEventDraft, setFestEventDraft] = useState<EventDraft>(emptyDraft('manual'));
  const [editingFestEventIndex, setEditingFestEventIndex] = useState<number | null>(null);
  const [festPreviewRequired, setFestPreviewRequired] = useState(false);
  const [festPreviewConfirmed, setFestPreviewConfirmed] = useState(false);

  const canSaveSingle = useMemo(() => {
    const baseValid = !validateDraft(singleDraft);
    if (!baseValid) return false;
    if (previewRequired && !previewConfirmed) return false;
    return true;
  }, [singleDraft, previewRequired, previewConfirmed]);

  const getSingleSubmitBlocker = () => {
    if (!asTrimmed(collegeName)) return 'College name is required';
    const draftError = validateDraft(singleDraft);
    if (draftError) return draftError;
    if (previewRequired && !previewConfirmed) return 'Confirm extracted preview first';
    return null;
  };

  const confirmSinglePreview = () => {
    setPreviewConfirmed(true);
    console.log('[InterCampus AI UI] single preview confirmed', {
      title: asTrimmed(singleDraft.title),
      hasStartDate: !!asTrimmed(singleDraft.event_start_date),
      hasRegistration: !!asTrimmed(singleDraft.registration_link),
    });
    Toast.show({ type: 'success', text1: 'Preview confirmed', text2: 'Now click Submit Event' });
  };

  const confirmFestPreview = () => {
    setFestPreviewConfirmed(true);
    console.log('[InterCampus AI UI] fest event preview confirmed', {
      title: asTrimmed(festEventDraft.title),
      hasStartDate: !!asTrimmed(festEventDraft.event_start_date),
      hasRegistration: !!asTrimmed(festEventDraft.registration_link),
    });
    Toast.show({ type: 'success', text1: 'Preview confirmed', text2: 'Now click Add Event to Fest' });
  };

  const pickPoster = async (target: PosterTarget) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Toast.show({ type: 'error', text1: 'Photo permission required' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
      aspect: [4, 5],
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;

    try {
      setLoadingExtract(true);
      console.log('[InterCampus AI UI] poster extraction requested', { target, uri });
      if (target === 'single') {
        const extracted = await extractInterCampusEventFromPoster(uri);
        const patch = toDraftFromExtracted(extracted, 'poster', '', uri);
        logAutoFillDiagnostics('single_poster', extracted, patch);
        setSingleDraft((prev) => ({
          ...prev,
          ...patch,
        }));
        if (extracted.college_name) setCollegeName((prev) => prev || extracted.college_name);
        if (extracted.college_location) setCollegeLocation((prev) => prev || extracted.college_location);
        setPreviewRequired(true);
        setPreviewConfirmed(false);
      } else if (target === 'fest_details') {
        const festExtracted = await extractInterCampusFestFromPoster(uri);
        setFestPosterUri(uri);
        setFestName((prev) => festExtracted.fest_name || prev);
        setFestCollegeName((prev) => festExtracted.college_name || prev);
        setFestCollegeLocation((prev) => festExtracted.college_location || prev);

        const mappedEvents: EventDraft[] = festExtracted.events.map((event, index) => {
          const patch = toDraftFromExtracted(
            {
              title: event.title,
              description: event.description,
              event_start_date: event.event_start_date,
              event_end_date: event.event_end_date,
              event_start_datetime: event.event_start_datetime,
              event_start_time: event.event_start_time,
              venue: event.venue,
              participation_type: event.participation_type,
              min_team_size: event.min_team_size,
              max_team_size: event.max_team_size,
              registration_link: event.registration_link,
              registration_qr_link: event.registration_qr_link,
              event_link: event.event_link,
              event_type: event.event_type,
              banner_image: event.banner_image,
              poster_image: event.poster_image,
            },
            'poster',
            '',
            '',
          );
          logAutoFillDiagnostics('fest_details_poster_event', event, patch);
          return {
            ...emptyDraft('poster'),
            ...patch,
          } as EventDraft;
        });
        const normalizedEvents = dedupeRepeatedEventImages(mappedEvents);

        if (normalizedEvents.length) {
          const datedEvents = normalizedEvents.filter((event) => !!event.event_start_date);
          if (datedEvents.length) {
            const start = [...datedEvents]
              .map((event) => event.event_start_date)
              .sort((a, b) => String(a).localeCompare(String(b)))[0];
            const end = [...datedEvents]
              .map((event) => event.event_end_date || event.event_start_date)
              .sort((a, b) => String(a).localeCompare(String(b)))
              .slice(-1)[0];
            if (start) setFestStartDate((prev) => prev || start);
            if (end) setFestEndDate((prev) => prev || end);
          }

          setFestEvents(normalizedEvents);
          setFestEventDraft({ ...normalizedEvents[0] });
          setFestPreviewRequired(true);
          setFestPreviewConfirmed(false);
        }
      } else {
        const extracted = await extractInterCampusEventFromPoster(uri);
        const patch = toDraftFromExtracted(extracted, 'poster', '', uri);
        logAutoFillDiagnostics('fest_event_poster', extracted, patch);
        setFestEventDraft((prev) => ({
          ...prev,
          ...patch,
        }));
        setFestPreviewRequired(true);
        setFestPreviewConfirmed(false);
      }
      Toast.show({ type: 'success', text1: 'Poster parsed successfully' });
    } catch (error: any) {
      console.error('[InterCampus AI UI] poster extraction error', {
        target,
        message: error?.message,
        error,
      });
      Toast.show({ type: 'error', text1: 'Poster extraction failed', text2: error?.message || 'Try manual entry' });
    } finally {
      setLoadingExtract(false);
    }
  };

  const extractFromLink = async (target: ExtractTarget, overrideUrl?: string) => {
    const sourceValue = target === 'single' ? sourceUrlInput : target === 'fest' ? festSourceUrlInput : festEventLinkInput;
    const url = asTrimmed(overrideUrl || sourceValue);
    if (!url) {
      Toast.show({ type: 'error', text1: 'Enter event link' });
      return;
    }
    if (!isValidHttpUrl(url)) {
      Toast.show({ type: 'error', text1: 'Enter a valid website URL' });
      return;
    }

    try {
      setLoadingExtract(true);
      console.log('[InterCampus AI UI] website extraction requested', { target, url });
      if (target === 'single') {
        const extracted = await extractInterCampusEventFromLink(url);
        const patch = toDraftFromExtracted(extracted, 'link', url, '');
        logAutoFillDiagnostics('single_link', extracted, patch);
        setSingleDraft((prev) => ({ ...prev, ...patch }));
        if (extracted.college_name) setCollegeName((prev) => prev || extracted.college_name);
        if (extracted.college_location) setCollegeLocation((prev) => prev || extracted.college_location);
        setPreviewRequired(true);
        setPreviewConfirmed(false);
      } else if (target === 'fest') {
        const festExtracted = await extractInterCampusFestFromLink(url);

        setFestName((prev) => festExtracted.fest_name || prev);
        setFestCollegeName((prev) => festExtracted.college_name || prev);
        setFestCollegeLocation((prev) => festExtracted.college_location || prev);

        // Use fest-level dates if AI extracted them
        if (festExtracted.fest_start_date) {
          setFestStartDate((prev) => prev || festExtracted.fest_start_date);
        }
        if (festExtracted.fest_end_date) {
          setFestEndDate((prev) => prev || festExtracted.fest_end_date);
        }

        const mappedEvents: EventDraft[] = festExtracted.events.map((event, index) => {
          const patch = toDraftFromExtracted(
            {
              title: event.title,
              description: event.description,
              event_start_date: event.event_start_date,
              event_end_date: event.event_end_date,
              event_start_datetime: event.event_start_datetime,
              event_start_time: event.event_start_time,
              venue: event.venue,
              participation_type: event.participation_type,
              min_team_size: event.min_team_size,
              max_team_size: event.max_team_size,
              registration_link: event.registration_link,
              registration_qr_link: event.registration_qr_link,
              event_link: event.event_link,
              event_type: event.event_type,
              banner_image: event.banner_image,
              poster_image: event.poster_image,
            },
            'link',
            url,
            '',
          );
          logAutoFillDiagnostics('fest_link_event', event, patch);
          if (!asTrimmed((patch as any)?.event_start_date) && !asTrimmed((patch as any)?.event_start_datetime) && !asTrimmed((patch as any)?.event_start_time)) {
            console.warn('[InterCampus AI UI] fest event missing start date/time', {
              index,
              title: event?.title || '',
            });
          }
          return {
            ...emptyDraft('link'),
            ...patch,
          } as EventDraft;
        });
        const normalizedEvents = dedupeRepeatedEventImages(mappedEvents);

        console.log('[InterCampus AI UI] fest mapped events summary', {
          total: normalizedEvents.length,
          withStartDateOrTime: normalizedEvents.filter((e) => asTrimmed(e.event_start_date) || asTrimmed(e.event_start_datetime) || asTrimmed(e.event_start_time)).length,
          withRegistration: normalizedEvents.filter((e) => asTrimmed(e.registration_link)).length,
          withParticipation: normalizedEvents.filter((e) => asTrimmed(e.participation_type)).length,
        });

        if (normalizedEvents.length) {
          // Only calculate dates from events if fest-level dates weren't extracted
          if (!festExtracted.fest_start_date || !festExtracted.fest_end_date) {
            const datedEvents = normalizedEvents.filter((event) => !!event.event_start_date);
            if (datedEvents.length) {
              const start = [...datedEvents]
                .map((event) => event.event_start_date)
                .sort((a, b) => String(a).localeCompare(String(b)))[0];
              const end = [...datedEvents]
                .map((event) => event.event_end_date || event.event_start_date)
                .sort((a, b) => String(a).localeCompare(String(b)))
                .slice(-1)[0];
              if (start && !festExtracted.fest_start_date) setFestStartDate((prev) => prev || start);
              if (end && !festExtracted.fest_end_date) setFestEndDate((prev) => prev || end);
            }
          }

          setFestEvents(normalizedEvents);
          setFestEventDraft({ ...normalizedEvents[0] });
          setFestPreviewRequired(true);
          setFestPreviewConfirmed(false);
        }
      } else {
        const extracted = await extractInterCampusEventFromLink(url);
        const patch = toDraftFromExtracted(extracted, 'link', url, '');
        logAutoFillDiagnostics('fest_event_link', extracted, patch);
        setFestEventDraft((prev) => ({ ...prev, ...patch }));
        setFestPreviewRequired(true);
        setFestPreviewConfirmed(false);
      }
      Toast.show({
        type: 'success',
        text1: target === 'fest' ? 'Fest details extracted' : target === 'fest_event' ? 'Fest event extracted' : 'Event details extracted',
      });
    } catch (error: any) {
      console.error('[InterCampus AI UI] website extraction error', {
        target,
        url,
        message: error?.message,
        error,
      });
      Toast.show({ type: 'error', text1: 'Website extraction failed', text2: error?.message || 'Try manual entry' });
    } finally {
      setLoadingExtract(false);
    }
  };

  const saveSingle = async () => {
    if (!user?.id) return;

    if (!asTrimmed(collegeName)) {
      Toast.show({ type: 'error', text1: 'College name is required' });
      return;
    }

    const draftError = validateDraft(singleDraft);
    if (draftError) {
      Toast.show({ type: 'error', text1: draftError });
      return;
    }

    try {
      setSaving(true);
      const payload: any = {
        title: asTrimmed(singleDraft.title),
        description: asTrimmed(singleDraft.description) || null,
        is_fest: false,
        parent_fest_id: null,
        fest_year: inferYearFromDates(singleDraft.event_start_date, singleDraft.event_end_date),
        college_name: asTrimmed(collegeName),
        college_location: asTrimmed(collegeLocation) || null,
        event_start_date: toIso(singleDraft.event_start_datetime) || toIso(singleDraft.event_start_date),
        event_end_date: toIso(singleDraft.event_end_date),
        venue: asTrimmed(singleDraft.venue) || null,
        participation_type: singleDraft.participation_type,
        min_team_size: singleDraft.participation_type === 'team' ? Number(singleDraft.min_team_size) || null : null,
        max_team_size: singleDraft.participation_type === 'team' ? Number(singleDraft.max_team_size) || null : null,
        registration_link: asTrimmed(singleDraft.registration_link) || null,
        event_type: asTrimmed(singleDraft.event_type) || null,
        banner_image: asTrimmed(singleDraft.banner_image) || null,
        source_type: singleDraft.source_type,
        source_url: asTrimmed(singleDraft.source_url) || null,
        poster_image: asTrimmed(singleDraft.poster_image) || null,
        ai_generated: !!singleDraft.ai_generated,
        verification_status: isAutoApprove ? 'verified' : 'pending',
        status: 'upcoming',
        created_by: user.id,
        ...(isAutoApprove ? { verified_by: user.id } : {}),
      };

      const { error } = await supabase.from('intercampus_events').insert(payload);
      if (error) throw error;

      Toast.show({ type: 'success', text1: isAutoApprove ? 'Event published ✓' : 'Event submitted for verification' });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not submit event', text2: error?.message || 'Try again' });
    } finally {
      setSaving(false);
    }
  };

  const addFestEvent = () => {
    if (!festEventDraft.title.trim() || !toIso(festEventDraft.event_start_date)) {
      Toast.show({ type: 'error', text1: 'Fest event title and start date are required' });
      return;
    }

    if (festPreviewRequired && !festPreviewConfirmed) {
      Toast.show({ type: 'info', text1: 'Confirm extracted preview first' });
      return;
    }

    const draftToSave = {
      ...festEventDraft,
      event_start_datetime: combineDateAndTime(festEventDraft.event_start_date, festEventDraft.event_start_time),
    };

    if (editingFestEventIndex !== null) {
      setFestEvents((prev) => prev.map((item, index) => (index === editingFestEventIndex ? draftToSave : item)));
      Toast.show({ type: 'success', text1: 'Fest event updated' });
    } else {
      setFestEvents((prev) => [...prev, draftToSave]);
      Toast.show({ type: 'success', text1: 'Fest event added' });
    }

    setFestEventDraft(emptyDraft(festEventSourceType));
    setEditingFestEventIndex(null);
    setFestEventLinkInput('');
    setFestPreviewRequired(false);
    setFestPreviewConfirmed(false);
  };

  const continueToFestEvents = () => {
    if (!festName.trim() || !festCollegeName.trim()) {
      Toast.show({ type: 'error', text1: 'Fest name and college name are required' });
      return;
    }

    if (festSourceUrlInput.trim() && !isValidHttpUrl(festSourceUrlInput)) {
      Toast.show({ type: 'error', text1: 'Fest website URL is invalid' });
      return;
    }

    if (festStartDate.trim() && !toIso(festStartDate)) {
      Toast.show({ type: 'error', text1: 'Fest start date is invalid' });
      return;
    }

    if (festEndDate.trim() && !toIso(festEndDate)) {
      Toast.show({ type: 'error', text1: 'Fest end date is invalid' });
      return;
    }

    if (toIso(festStartDate) && toIso(festEndDate) && new Date(toIso(festEndDate) as string) < new Date(toIso(festStartDate) as string)) {
      Toast.show({ type: 'error', text1: 'Fest end date cannot be before start date' });
      return;
    }

    setFestStep('events');
  };

  const submitFest = async () => {
    if (!user?.id) return;
    if (!festName.trim() || !festCollegeName.trim()) {
      Toast.show({ type: 'error', text1: 'Fest name and college name are required' });
      return;
    }
    if (festEvents.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one event under this fest' });
      return;
    }

    if (festSourceUrlInput.trim() && !isValidHttpUrl(festSourceUrlInput)) {
      Toast.show({ type: 'error', text1: 'Fest website URL is invalid' });
      return;
    }

    if (festStartDate.trim() && !toIso(festStartDate)) {
      Toast.show({ type: 'error', text1: 'Fest start date is invalid' });
      return;
    }

    if (festEndDate.trim() && !toIso(festEndDate)) {
      Toast.show({ type: 'error', text1: 'Fest end date is invalid' });
      return;
    }

    if (toIso(festStartDate) && toIso(festEndDate) && new Date(toIso(festEndDate) as string) < new Date(toIso(festStartDate) as string)) {
      Toast.show({ type: 'error', text1: 'Fest end date cannot be before start date' });
      return;
    }

    for (let index = 0; index < festEvents.length; index += 1) {
      const error = validateDraft(festEvents[index]);
      if (error) {
        Toast.show({ type: 'error', text1: `Fest event ${index + 1}: ${error}` });
        return;
      }
    }

    try {
      setSaving(true);
      console.log('[Fest Submission] Starting fest proposal submission', {
        festName: asTrimmed(festName),
        collegeName: asTrimmed(festCollegeName),
        numEvents: festEvents.length,
        userId: user.id,
      });

      const festPayload = {
        title: asTrimmed(festName),
        description: `${asTrimmed(festName)} fest proposal`,
        is_fest: true,
        parent_fest_id: null,
        fest_year: inferYearFromDates(festStartDate, festEndDate),
        college_name: asTrimmed(festCollegeName),
        college_location: asTrimmed(festCollegeLocation) || null,
        event_start_date: toIso(festStartDate),
        event_end_date: toIso(festEndDate),
        banner_image: null,
        source_type: asTrimmed(festSourceUrlInput) ? 'link' : 'manual',
        source_url: asTrimmed(festSourceUrlInput) || null,
        poster_image: null,
        ai_generated: festEvents.some((event) => !!event.ai_generated),
        verification_status: isAutoApprove ? 'verified' : 'pending',
        status: 'upcoming',
        created_by: user.id,
        ...(isAutoApprove ? { verified_by: user.id } : {}),
      };

      console.log('[Fest Submission] Fest payload:', festPayload);

      const { data: festRow, error: festErr } = await supabase
        .from('intercampus_events')
        .insert(festPayload as any)
        .select('id')
        .single();

      if (festErr) {
        console.error('[Fest Submission] Fest insert failed:', {
          error: festErr,
          message: festErr.message,
          details: festErr.details,
          hint: festErr.hint,
          code: festErr.code,
        });
        throw festErr;
      }

      console.log('[Fest Submission] Fest created successfully:', festRow);

      console.log('[Fest Submission] Fest created successfully:', festRow);

      const childRows = festEvents.map((event) => ({
        title: asTrimmed(event.title),
        description: asTrimmed(event.description) || null,
        is_fest: false,
        parent_fest_id: festRow.id,
        fest_name: asTrimmed(festName),
        fest_year: inferYearFromDates(event.event_start_date, event.event_end_date) || inferYearFromDates(festStartDate, festEndDate),
        college_name: asTrimmed(festCollegeName),
        college_location: asTrimmed(festCollegeLocation) || null,
        event_start_date: toIso(event.event_start_datetime || combineDateAndTime(event.event_start_date, event.event_start_time)) || toIso(event.event_start_date),
        event_end_date: toIso(event.event_end_date),
        venue: asTrimmed(event.venue) || null,
        participation_type: event.participation_type,
        min_team_size: event.participation_type === 'team' ? Number(event.min_team_size) || null : null,
        max_team_size: event.participation_type === 'team' ? Number(event.max_team_size) || null : null,
        registration_link: asTrimmed(event.registration_link) || null,
        event_type: asTrimmed(event.event_type) || null,
        banner_image: asTrimmed(event.banner_image) || null,
        source_type: event.source_type,
        source_url: asTrimmed(event.source_url) || null,
        poster_image: asTrimmed(event.poster_image) || null,
        ai_generated: !!event.ai_generated,
        verification_status: isAutoApprove ? 'verified' : 'pending',
        status: 'upcoming',
        created_by: user.id,
        ...(isAutoApprove ? { verified_by: user.id } : {}),
      }));

      console.log('[Fest Submission] Inserting child events:', {
        count: childRows.length,
        parentFestId: festRow.id,
        events: childRows.map((e) => ({ title: e.title, participation_type: e.participation_type })),
      });

      const { error: childErr } = await supabase.from('intercampus_events').insert(childRows as any);

      if (childErr) {
        console.error('[Fest Submission] Child events insert failed:', {
          error: childErr,
          message: childErr.message,
          details: childErr.details,
          hint: childErr.hint,
          code: childErr.code,
          childRowsCount: childRows.length,
        });
        throw childErr;
      }

      console.log('[Fest Submission] All events inserted successfully');
      Toast.show({ type: 'success', text1: isAutoApprove ? 'Fest published ✓' : 'Fest submitted for verification' });
      Alert.alert(
        isAutoApprove ? 'Published!' : 'Submitted',
        isAutoApprove
          ? 'Your fest and all events are now live.'
          : 'Your fest and linked events are now pending verification.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (error: any) {
      console.error('[Fest Submission] Complete error:', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        stack: error?.stack,
      });
      Toast.show({ type: 'error', text1: 'Fest submission failed', text2: error?.message || 'Try again' });
    } finally {
      setSaving(false);
    }
  };

  const showBottomBar = submissionType === 'single' || (submissionType === 'fest' && festStep === 'events');

  return (
    <InterCampusScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.keyboardAvoidingContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (!submissionType) navigation.goBack();
              else setSubmissionType(null);
            }}
          >
            <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>InterCampus Submit</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {!submissionType && (
            <>
              <Text style={styles.title}>What do you want to submit?</Text>
              <TouchableOpacity style={styles.choiceCard} onPress={() => setSubmissionType('single')}>
                <MaterialIcons name="event" size={20} color="#6366F1" />
                <Text style={styles.choiceTitle}>Standalone Event</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.choiceCard}
                onPress={() => {
                  setSubmissionType('fest');
                  setFestStep('details');
                }}
              >
                <MaterialIcons name="celebration" size={20} color="#6366F1" />
                <Text style={styles.choiceTitle}>Fest + Events</Text>
              </TouchableOpacity>
            </>
          )}

          {submissionType === 'single' && (
            <>
              <Text style={styles.title}>Choose import method</Text>
              <SourcePicker
                selected={sourceType}
                onSelect={(value) => {
                  setSourceType(value);
                  setSingleDraft((prev) => ({ ...prev, source_type: value }));
                }}
              />

              {sourceType === 'link' && (
                <View style={styles.card}>
                  <TextField
                    label="Website URL"
                    value={sourceUrlInput}
                    onChangeText={setSourceUrlInput}
                    placeholder="https://example.com/event"
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => extractFromLink('single')} disabled={loadingExtract}>
                    <Text style={styles.primaryBtnText}>{loadingExtract ? 'Extracting...' : 'Extract with AI'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {sourceType === 'poster' && (
                <View style={styles.card}>
                  {!!singleDraft.poster_image && (
                    <Image source={{ uri: singleDraft.poster_image }} style={styles.posterPreview} contentFit="cover" />
                  )}
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => pickPoster('single')} disabled={loadingExtract}>
                    <Text style={styles.primaryBtnText}>{loadingExtract ? 'Processing...' : 'Pick Poster & Extract'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.sectionTitle}>{singleDraft.ai_generated ? 'Preview (Editable)' : 'Event Form'}</Text>
              <EventEditor draft={singleDraft} setDraft={setSingleDraft} />

              {singleDraft.ai_generated && (
                <TouchableOpacity
                  style={[styles.outlineBtn, previewConfirmed && styles.confirmedBtn]}
                  onPress={confirmSinglePreview}
                >
                  <Text style={[styles.outlineBtnText, previewConfirmed && styles.confirmedText]}>
                    {previewConfirmed ? 'Preview Confirmed (Ready to Submit)' : 'Confirm Extracted Preview'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.card}>
                <TextField label="College Name *" value={collegeName} onChangeText={setCollegeName} />
                <TextField label="College Location" value={collegeLocation} onChangeText={setCollegeLocation} />
              </View>

              {/* Event Preview */}
              {singleDraft.title && (
                <View style={styles.previewCard}>
                  <Text style={styles.previewTitle}>Event Preview</Text>
                  {singleDraft.banner_image && (
                    <Image
                      source={{ uri: singleDraft.banner_image }}
                      style={styles.previewBanner}
                      contentFit="cover"
                    />
                  )}
                  <View style={styles.previewDetails}>
                    <Text style={styles.previewEventTitle}>{singleDraft.title}</Text>
                    <View style={styles.previewMetaRow}>
                      <MaterialIcons name="event" size={14} color="#6366F1" />
                      <Text style={styles.previewMeta}>{singleDraft.event_start_date || 'Date TBA'}</Text>
                    </View>
                    {singleDraft.venue && (
                      <View style={styles.previewMetaRow}>
                        <MaterialIcons name="location-on" size={14} color="#6366F1" />
                        <Text style={styles.previewMeta}>{singleDraft.venue}</Text>
                      </View>
                    )}
                    <View style={styles.previewMetaRow}>
                      <MaterialIcons name="group" size={14} color="#6366F1" />
                      <Text style={styles.previewMeta}>{singleDraft.participation_type === 'team' ? `Team Event (${singleDraft.min_team_size}-${singleDraft.max_team_size})` : 'Individual Event'}</Text>
                    </View>
                    {singleDraft.description && (
                      <Text style={styles.previewDesc} numberOfLines={2}>{singleDraft.description}</Text>
                    )}
                  </View>
                </View>
              )}
              <View style={{ height: 20 }} />
            </>
          )}

          {submissionType === 'fest' && (
            <>
              {festStep === 'details' && (
                <>
                  <Text style={styles.title}>Step 1: Fest Details</Text>
                  <View style={styles.card}>
                    <TextField label="Fest Name *" value={festName} onChangeText={setFestName} />
                    <TextField label="College Name *" value={festCollegeName} onChangeText={setFestCollegeName} />
                    <TextField label="College Location" value={festCollegeLocation} onChangeText={setFestCollegeLocation} />
                    <TextField label="Fest Start Date (YYYY-MM-DD)" value={festStartDate} onChangeText={setFestStartDate} />
                    <TextField label="Fest End Date (YYYY-MM-DD)" value={festEndDate} onChangeText={setFestEndDate} />

                    <TextField
                      label="Fest Website URL"
                      value={festSourceUrlInput}
                      onChangeText={setFestSourceUrlInput}
                      placeholder="https://example.com/fest"
                    />
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => extractFromLink('fest')} disabled={loadingExtract}>
                      <Text style={styles.primaryBtnText}>{loadingExtract ? 'Extracting...' : 'Extract Fest with AI'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickPoster('fest_details')} disabled={loadingExtract}>
                      <Text style={styles.secondaryBtnText}>{loadingExtract ? 'Processing...' : 'Upload Fest Poster & Extract'}</Text>
                    </TouchableOpacity>
                    {!!festPosterUri && (
                      <Image source={{ uri: festPosterUri }} style={styles.posterPreview} contentFit="cover" />
                    )}
                  </View>

                  <TouchableOpacity style={styles.primaryBtn} onPress={continueToFestEvents}>
                    <Text style={styles.primaryBtnText}>Continue to Event Builder</Text>
                  </TouchableOpacity>
                </>
              )}

              {festStep === 'events' && (
                <>
                  <Text style={styles.title}>Step 2: Add Fest Events One by One</Text>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{festName || 'Fest'}</Text>
                    <Text style={styles.muted}>{festCollegeName || 'College'}{festStartDate ? ` • Starts ${festStartDate}` : ''}</Text>
                  </View>

                  <View style={styles.quickImportCard}>
                    <Text style={styles.quickImportTitle}>Quick add event</Text>
                    <Text style={styles.quickImportText}>
                      Choose link or poster import. The input section below updates based on your selection.
                    </Text>
                    <View style={styles.quickModeRow}>
                      <TouchableOpacity
                        style={[styles.quickModeBtn, festEventSourceType === 'link' && styles.quickModeBtnActive]}
                        onPress={() => setFestEventSourceType('link')}
                      >
                        <MaterialIcons name="language" size={16} color={festEventSourceType === 'link' ? '#ffffff' : '#6366F1'} />
                        <Text style={[styles.quickModeBtnText, festEventSourceType === 'link' && styles.quickModeBtnTextActive]}>Use Event Link</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.quickModeBtn, festEventSourceType === 'poster' && styles.quickModeBtnActive]}
                        onPress={() => setFestEventSourceType('poster')}
                      >
                        <MaterialIcons name="image" size={16} color={festEventSourceType === 'poster' ? '#ffffff' : '#6366F1'} />
                        <Text style={[styles.quickModeBtnText, festEventSourceType === 'poster' && styles.quickModeBtnTextActive]}>Upload Poster</Text>
                      </TouchableOpacity>
                    </View>

                    {festEventSourceType === 'poster' ? (
                      <>
                        {!!festEventDraft.poster_image && (
                          <Image source={{ uri: festEventDraft.poster_image }} style={styles.posterPreview} contentFit="cover" />
                        )}
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => {
                            setFestEventSourceType('poster');
                            pickPoster('fest_event');
                          }}
                          disabled={loadingExtract}
                        >
                          <Text style={styles.secondaryBtnText}>{loadingExtract ? 'Processing...' : 'Pick Poster & Extract'}</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TextField
                          label="Event URL"
                          value={festEventLinkInput}
                          onChangeText={setFestEventLinkInput}
                          placeholder="https://example.com/event"
                        />
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => {
                            setFestEventSourceType('link');
                            extractFromLink('fest_event');
                          }}
                          disabled={loadingExtract}
                        >
                          <Text style={styles.primaryBtnText}>{loadingExtract ? 'Extracting...' : 'Fetch Event with AI'}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>

                  <EventEditor draft={festEventDraft} setDraft={setFestEventDraft} />

                  {festEventDraft.ai_generated && (
                    <TouchableOpacity
                      style={[styles.outlineBtn, festPreviewConfirmed && styles.confirmedBtn]}
                      onPress={confirmFestPreview}
                    >
                      <Text style={[styles.outlineBtnText, festPreviewConfirmed && styles.confirmedText]}>
                        {festPreviewConfirmed ? 'Preview Confirmed (Ready to Add)' : 'Confirm Extracted Preview'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.secondaryBtn} onPress={addFestEvent}>
                    <Text style={styles.secondaryBtnText}>{editingFestEventIndex !== null ? 'Update Event' : 'Add Event to Fest'}</Text>
                  </TouchableOpacity>

                  {editingFestEventIndex !== null && (
                    <TouchableOpacity
                      style={styles.outlineBtn}
                      onPress={() => {
                        setEditingFestEventIndex(null);
                        setFestEventDraft(emptyDraft(festEventSourceType));
                        setFestEventLinkInput('');
                        setFestPreviewRequired(false);
                        setFestPreviewConfirmed(false);
                      }}
                    >
                      <Text style={styles.outlineBtnText}>Cancel Edit</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Added Events ({festEvents.length})</Text>
                    {festEvents.length === 0 ? (
                      <Text style={styles.muted}>No events added yet.</Text>
                    ) : (
                      festEvents.map((event, index) => (
                        <View key={`${event.title}-${index}`} style={styles.addedEvent}>
                          {asTrimmed(event.poster_image || event.banner_image) && (
                            <Image
                              source={{ uri: asTrimmed(event.poster_image || event.banner_image) }}
                              style={styles.addedEventBanner}
                              contentFit="cover"
                            />
                          )}
                          <View style={styles.addedEventContent}>
                            <Text style={styles.addedEventTitle}>{event.title}</Text>
                            <View style={styles.addedEventMetaGrid}>
                              <View style={styles.addedEventMetaRow}>
                                <MaterialIcons name="event" size={14} color="#6366F1" />
                                <Text style={styles.addedEventMetaText}>{formatEventDateLabel(event)}</Text>
                              </View>
                              <View style={styles.addedEventMetaRow}>
                                <MaterialIcons name="schedule" size={14} color="#6366F1" />
                                <Text style={styles.addedEventMetaText}>{formatEventTimeLabel(event)}</Text>
                              </View>
                              <View style={styles.addedEventMetaRow}>
                                <MaterialIcons name="location-on" size={14} color="#6366F1" />
                                <Text style={styles.addedEventMetaText}>{asTrimmed(event.venue) || 'Venue TBA'}</Text>
                              </View>
                              <View style={styles.addedEventMetaRow}>
                                <MaterialIcons name="category" size={14} color="#6366F1" />
                                <Text style={styles.addedEventMetaText}>{asTrimmed(event.event_type) || 'General'}</Text>
                              </View>
                            </View>

                            {asTrimmed(event.description) ? (
                              <Text style={styles.addedEventDesc} numberOfLines={2}>{asTrimmed(event.description)}</Text>
                            ) : null}

                            <View style={styles.addedEventBadgeRow}>
                              <View style={styles.addedEventBadge}>
                                <MaterialIcons name="group" size={12} color="#4338ca" />
                                <Text style={styles.addedEventBadgeText}>
                                  {event.participation_type === 'team'
                                    ? `Team ${asTrimmed(event.min_team_size) || '?'}-${asTrimmed(event.max_team_size) || '?'} members`
                                    : 'Individual'}
                                </Text>
                              </View>
                              <View style={styles.addedEventBadge}>
                                <MaterialIcons name="travel-explore" size={12} color="#4338ca" />
                                <Text style={styles.addedEventBadgeText}>
                                  {event.source_type === 'link' ? 'From Website' : event.source_type === 'poster' ? 'From Poster' : 'Manual Entry'}
                                </Text>
                              </View>
                            </View>

                            <Text style={styles.addedEventLinkText} numberOfLines={1}>
                              Registration: {asTrimmed(event.registration_link) || 'Not added yet'}
                            </Text>

                            {(() => {
                              const status = getEventCompleteness(event);
                              return (
                                <View style={[styles.completenessChip, status.full ? styles.completenessChipGood : styles.completenessChipWarn]}>
                                  <MaterialIcons
                                    name={status.full ? 'check-circle' : 'warning-amber'}
                                    size={13}
                                    color={status.full ? '#166534' : '#b45309'}
                                  />
                                  <Text style={[styles.completenessText, { color: status.full ? '#166534' : '#b45309' }]}>
                                    {status.full ? 'Ready: all key fields added' : `Missing: ${status.missing.join(', ')}`}
                                  </Text>
                                </View>
                              );
                            })()}
                          </View>
                          <View style={styles.row}>
                            <TouchableOpacity
                              style={[styles.outlineBtn, { flex: 1 }]}
                              onPress={() => {
                                setEditingFestEventIndex(index);
                                setFestEventDraft({ ...event });
                                setFestEventSourceType(event.source_type || 'manual');
                                setFestEventLinkInput(event.source_type === 'link' ? asTrimmed(event.source_url) : '');
                                setFestPreviewRequired(!!event.ai_generated);
                                setFestPreviewConfirmed(true);
                              }}
                            >
                              <Text style={styles.outlineBtnText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.secondaryBtn, { flex: 1 }]}
                              onPress={() => {
                                setFestEvents((prev) => prev.filter((_, i) => i !== index));
                                if (editingFestEventIndex === index) {
                                  setEditingFestEventIndex(null);
                                  setFestEventDraft(emptyDraft(festEventSourceType));
                                }
                              }}
                            >
                              <Text style={styles.secondaryBtnText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={styles.festActionRow}>
                    <TouchableOpacity style={[styles.outlineBtn, styles.festActionBtn]} onPress={() => setFestStep('details')}>
                      <Text style={styles.outlineBtnText}>Back to Fest Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.bottomSubmitBtn, styles.festActionBtn]} onPress={submitFest} disabled={saving}>
                      <MaterialIcons name="check-circle" size={20} color="#ffffff" />
                      <Text style={styles.bottomSubmitBtnText}>
                        {saving ? 'Submitting...' : 'Submit Fest'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ height: 20 }} />
                </>
              )}
            </>
          )}
        </ScrollView>

              {/* Fixed Bottom Button Bar - Single Event */}
              {submissionType === 'single' && (
                <View style={styles.bottomDock}>
                  <View style={styles.footerLabelRow}>
                    <MaterialIcons name="bolt" size={14} color="#4f46e5" />
                    <Text style={styles.footerLabel}>Ready to publish</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.bottomSubmitBtn}
                    disabled={saving}
                    onPress={() => {
                      const blocker = getSingleSubmitBlocker();
                      if (blocker) {
                        console.warn('[InterCampus AI UI] submit blocked', { blocker });
                        Toast.show({ type: 'info', text1: blocker });
                        return;
                      }
                      saveSingle();
                    }}
                  >
                    <MaterialIcons name="check-circle" size={20} color="#ffffff" />
                    <Text style={styles.bottomSubmitBtnText}>
                      {saving ? 'Submitting...' : 'Submit Event'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

            </View>
            </KeyboardAvoidingView>
    </InterCampusScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  keyboardAvoidingContainer: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  contentWithFixedBtn: { padding: 16, gap: 12, paddingBottom: 132 },
  festActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  festActionBtn: {
    flex: 1,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  muted: { fontSize: 12, color: '#64748b' },

  choiceCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  choiceTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },

  card: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 16,
    gap: 8,
  },
  quickImportCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.16)',
  },
  quickImportTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  quickImportText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  quickModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickModeBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99,102,241,0.1)',
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickModeBtnActive: {
    backgroundColor: '#6366F1',
  },
  quickModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  quickModeBtnTextActive: {
    color: '#ffffff',
  },

  sourceGrid: { gap: 8 },
  sourceCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99,102,241,0.1)',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceCardActive: { backgroundColor: '#6366F1' },
  sourceText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  sourceTextActive: { color: '#ffffff' },

  fieldWrap: { marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },

  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 4,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, borderRadius: 999, paddingVertical: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#6366F1' },
  segmentText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  segmentTextActive: { color: '#ffffff' },

  primaryBtn: {
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: { color: '#6366F1', fontSize: 14, fontWeight: '700' },
  outlineBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  outlineBtnText: { color: '#6366F1', fontSize: 13, fontWeight: '700' },
  confirmedBtn: { backgroundColor: '#dcfce7', borderColor: '#15803d' },
  confirmedText: { color: '#166534' },

  posterPreview: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#e2e8f0' },
  row: { flexDirection: 'row', gap: 8 },

  addedEvent: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: 'rgba(99,102,241,0.08)',
    padding: 10,
    marginTop: 10,
  },
  addedEventTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  addedEventBanner: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#e2e8f0',
  },
  addedEventContent: {
    paddingHorizontal: 4,
    gap: 8,
  },
  addedEventMetaGrid: {
    gap: 6,
  },
  addedEventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addedEventMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
  },
  addedEventDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  addedEventBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  addedEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  addedEventBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
  },
  addedEventLinkText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  completenessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  completenessChipGood: {
    backgroundColor: '#dcfce7',
  },
  completenessChipWarn: {
    backgroundColor: '#fef3c7',
  },
  completenessText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },

  /* Event Preview Card */
  previewCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ddd6fe',
    backgroundColor: 'rgba(99,102,241,0.08)',
    overflow: 'hidden',
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4c1d95',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  previewBanner: {
    width: '100%',
    height: 180,
    marginTop: 8,
    backgroundColor: '#e2e8f0',
  },
  previewDetails: {
    padding: 12,
    gap: 8,
  },
  previewEventTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewMeta: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  previewDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginTop: 4,
  },

  /* Fixed Bottom Submit Button Bar */
  bottomDock: {
    marginHorizontal: 12,
    marginBottom: Platform.OS === 'android' ? 12 : 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.18)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    borderRadius: 20,
    gap: 10,
    alignItems: 'stretch',
    zIndex: 30,
    elevation: 24,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  footerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerLabel: {
    color: '#4f46e5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  bottomSubmitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  bottomSubmitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
