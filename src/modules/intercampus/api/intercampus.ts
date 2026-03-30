// @ts-nocheck
import { supabase } from '../../../api/supabase';
import { BASE_URL } from '../../../config/api';
import {
  InterCampusApprovePayload,
  InterCampusDiscussion,
  InterCampusDiscussionReply,
  InterCampusEvent,
  InterCampusEventSubmission,
  InterCampusFestGroup,
  InterCampusSubmissionInput,
  InterCampusTeamPost,
  InterCampusTeamPostReply,
} from '../types/intercampus';

type PaginationInput = {
  page?: number;
  pageSize?: number;
};

type PaginatedResult<T> = {
  data: T[];
  hasMore: boolean;
};

type InterCampusAIExtractPayload = Partial<{
  title: string;
  event_title: string;
  eventTitle: string;
  description: string;
  event_description: string;
  eventDescription: string;
  college_name: string;
  collegeName: string;
  college_location: string;
  collegeLocation: string;
  event_start_datetime: string;
  eventStartDateTime: string;
  event_start_time: string;
  eventStartTime: string;
  event_start_date: string;
  eventStartDate: string;
  event_end_date: string;
  eventEndDate: string;
  venue: string;
  participation_type: 'individual' | 'team';
  participationType: 'individual' | 'team';
  min_team_size: number;
  minTeamSize: number;
  max_team_size: number;
  maxTeamSize: number;
  registration_link: string;
  registrationLink: string;
  registration_qr_link: string;
  registrationQrLink: string;
  event_link: string;
  eventLink: string;
  event_type: string;
  eventType: string;
  banner_image: string;
  bannerImage: string;
  poster_image: string;
  posterImage: string;
  events: Array<Partial<{
    title: string;
    event_title: string;
    eventTitle: string;
    description: string;
    event_description: string;
    eventDescription: string;
    event_start_date: string;
    eventStartDate: string;
    event_start_datetime: string;
    eventStartDateTime: string;
    event_end_date: string;
    eventEndDate: string;
    date: string;
    venue: string;
    participation_type: 'individual' | 'team';
    participationType: 'individual' | 'team';
    min_team_size: number;
    minTeamSize: number;
    max_team_size: number;
    maxTeamSize: number;
    registration_link: string;
    registrationLink: string;
    registration_qr_link: string;
    registrationQrLink: string;
    event_type: string;
    eventType: string;
    banner_image: string;
    bannerImage: string;
    poster_image: string;
    posterImage: string;
  }>>;
}>;

type InterCampusAIExtractFestPayload = Partial<{
  festName: string;
  fest_name: string;
  collegeName: string;
  college_name: string;
  collegeLocation: string;
  college_location: string;
  events: Array<
    Partial<{
      title: string;
      event_title: string;
      eventTitle: string;
      description: string;
      event_description: string;
      eventDescription: string;
      date: string;
      event_start_date: string;
      eventStartDate: string;
      event_start_datetime: string;
      eventStartDateTime: string;
      event_start_time: string;
      eventStartTime: string;
      event_end_date: string;
      eventEndDate: string;
      venue: string;
      eventType: string;
      event_type: string;
      participationType: string;
      participation_type: string;
      minTeamSize: number;
      min_team_size: number;
      maxTeamSize: number;
      max_team_size: number;
      registrationLink: string;
      registration_link: string;
      registrationQrLink: string;
      registration_qr_link: string;
      eventLink: string;
      event_link: string;
      banner_image: string;
      bannerImage: string;
      poster_image: string;
      posterImage: string;
    }>
  >;
}>;

const DEFAULT_PAGE_SIZE = 10;

const ensureTeamSizeRange = (min?: number | null, max?: number | null, teamSize?: number | null) => {
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    throw new Error('Minimum team size cannot exceed maximum team size');
  }

  if (typeof teamSize === 'number') {
    if (typeof min === 'number' && teamSize < min) {
      throw new Error('Team size must be greater than or equal to minimum team size');
    }
    if (typeof max === 'number' && teamSize > max) {
      throw new Error('Team size must be less than or equal to maximum team size');
    }
  }
};

const normalizeSkills = (skills: string[] | undefined) => {
  return (skills || []).map((item) => item.trim()).filter(Boolean);
};

const normalizePagination = (input?: PaginationInput) => {
  const pageSize = Math.max(1, input?.pageSize || DEFAULT_PAGE_SIZE);
  const page = Math.max(1, input?.page || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
};

const attachInterCampusEventActors = async (events: InterCampusEvent[]): Promise<InterCampusEvent[]> => {
  if (!events.length) return events;

  const userIds = Array.from(
    new Set(
      events
        .flatMap((event) => [event.created_by, event.verified_by])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  if (!userIds.length) return events;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  if (error || !profiles) {
    return events;
  }

  const profileMap = new Map<string, { id: string; full_name?: string | null }>();
  profiles.forEach((profile: any) => {
    profileMap.set(profile.id, { id: profile.id, full_name: profile.full_name || null });
  });

  return events.map((event) => {
    const submitter = event.created_by ? profileMap.get(event.created_by) || null : null;
    const verifier = event.verified_by ? profileMap.get(event.verified_by) || null : null;

    return {
      ...event,
      submitter,
      verifier,
      submitted_by_name: submitter?.full_name || null,
      verified_by_name: verifier?.full_name || null,
    };
  });
};

const normalizeExtractedEvent = (payload: InterCampusAIExtractPayload) => {
  const primaryEvent = Array.isArray(payload?.events) && payload.events.length ? payload.events[0] : null;

  const read = (...values: Array<any>) => {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '';
  };

  const parseTeamNumber = (...values: Array<any>) => {
    const raw = read(...values);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const participationRaw = read(
    payload.participation_type,
    payload.participationType,
    primaryEvent?.participation_type,
    primaryEvent?.participationType,
  ).toLowerCase();

  return {
    // Prefer explicit event item title/details over fest-level summary fields.
    title: read(primaryEvent?.title, primaryEvent?.event_title, primaryEvent?.eventTitle, payload.title, payload.event_title, payload.eventTitle),
    description: read(primaryEvent?.description, primaryEvent?.event_description, primaryEvent?.eventDescription, payload.description, payload.event_description, payload.eventDescription),
    college_name: read(payload.college_name, payload.collegeName),
    college_location: read(payload.college_location, payload.collegeLocation),
    event_start_date: read(payload.event_start_date, payload.eventStartDate, primaryEvent?.event_start_date, primaryEvent?.eventStartDate, primaryEvent?.date),
    event_end_date: read(payload.event_end_date, payload.eventEndDate, primaryEvent?.event_end_date, primaryEvent?.eventEndDate, primaryEvent?.date),
    event_start_datetime: read(
      payload.event_start_datetime,
      payload.eventStartDateTime,
      primaryEvent?.event_start_datetime,
      primaryEvent?.eventStartDateTime,
    ),
    event_start_time: read(
      payload.event_start_time,
      payload.eventStartTime,
      primaryEvent?.event_start_time,
      primaryEvent?.eventStartTime,
    ),
    venue: read(payload.venue, primaryEvent?.venue),
    participation_type: participationRaw === 'team' ? 'team' : 'individual',
    min_team_size: parseTeamNumber(payload.min_team_size, payload.minTeamSize, primaryEvent?.min_team_size, primaryEvent?.minTeamSize),
    max_team_size: parseTeamNumber(payload.max_team_size, payload.maxTeamSize, primaryEvent?.max_team_size, primaryEvent?.maxTeamSize),
    registration_link: read(
      payload.registration_link,
      payload.registrationLink,
      payload.registration_qr_link,
      payload.registrationQrLink,
      primaryEvent?.registration_link,
      primaryEvent?.registrationLink,
      primaryEvent?.registration_qr_link,
      primaryEvent?.registrationQrLink,
    ),
    event_link: read(payload.event_link, payload.eventLink, primaryEvent?.event_link, primaryEvent?.eventLink),
    event_type: read(payload.event_type, payload.eventType, primaryEvent?.event_type, primaryEvent?.eventType),
    banner_image: read(payload.banner_image, payload.bannerImage, primaryEvent?.banner_image, primaryEvent?.bannerImage),
    poster_image: read(payload.poster_image, payload.posterImage, primaryEvent?.poster_image, primaryEvent?.posterImage),
  };
};

const normalizeDateTimeText = (value?: string) => {
  const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  let text = String(value || '');
  if (!text) return '';

  text = text.replace(new RegExp(`([A-Za-z])(${monthPattern})`, 'g'), '$1 $2');
  text = text.replace(new RegExp(`((?:${monthPattern})\s*[0-3]?\\d(?:st|nd|rd|th)?)([0-2]?\\d[:.]\\d{2}\s?(?:AM|PM|am|pm)?)`, 'g'), '$1 $2');
  text = text.replace(/(\d{1,2}[:.]\d{2}\s*)(AM|PM|am|pm)(?=[A-Za-z])/g, '$1$2 ');
  return text;
};

const parseMonthDayFromText = (value?: string) => {
  const raw = normalizeDateTimeText(value);
  if (!raw) return '';

  const monthDay = raw.match(/((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(20\d{2}))?/i);
  if (!monthDay) return '';

  const month = monthDay[1];
  const day = Number(monthDay[2]);
  const year = Number(monthDay[3] || new Date().getFullYear());
  const parsed = new Date(`${month} ${day}, ${year}`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const toIsoDateOnly = (value?: string) => {
  const raw = normalizeDateTimeText(value).trim();
  if (!raw) return '';
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const rangeMatch = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/i);
  if (rangeMatch) {
    const monthText = rangeMatch[1];
    const day = Number(rangeMatch[2]);
    const monthDate = new Date(`${monthText} 1, ${new Date().getFullYear()}`);
    if (!Number.isNaN(monthDate.getTime()) && day >= 1 && day <= 31) {
      const parsed = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }

  const monthDay = parseMonthDayFromText(raw);
  if (monthDay) return monthDay;

  return '';
};

const toTimeOnly = (value?: string) => {
  const raw = normalizeDateTimeText(value).trim();
  if (!raw) return '';

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(11, 16);
  }

  const ampmMatch = raw.match(/\b(\d{1,2})[:.](\d{2})\s*(AM|PM)\b/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2]);
    const meridiem = String(ampmMatch[3]).toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  const hhmmMatch = raw.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (hhmmMatch) {
    const hour = Number(hhmmMatch[1]);
    const minute = Number(hhmmMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  return '';
};

const inferFestYear = (input: {
  fest_year?: number | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
}) => {
  if (typeof input.fest_year === 'number' && Number.isFinite(input.fest_year)) {
    return input.fest_year;
  }

  const dateRaw = input.event_start_date || input.event_end_date;
  if (!dateRaw) return null;

  const parsed = new Date(dateRaw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear();
};

const normalizeExtractedFestFromWebsite = (payload: InterCampusAIExtractFestPayload) => {
  console.log('[Fest Normalization] Input payload:', {
    festName: payload.festName || payload.fest_name,
    collegeName: payload.collegeName || payload.college_name,
    collegeLocation: payload.collegeLocation || payload.college_location,
    festStartDate: payload.festStartDate || payload.fest_start_date,
    festEndDate: payload.festEndDate || payload.fest_end_date,
    eventCount: Array.isArray(payload?.events) ? payload.events.length : 0,
  });

  const eventsRaw = Array.isArray(payload?.events) ? payload.events : [];
  const events = eventsRaw
    .map((event) => {
      const startDateTimeRaw = String(event.event_start_datetime || event.eventStartDateTime || '').trim();
      const startDateRaw = String(event.event_start_date || event.eventStartDate || event.date || startDateTimeRaw || '').trim();
      const endDateRaw = String(event.event_end_date || event.eventEndDate || event.date || '').trim();
      const startTimeRaw = String(event.event_start_time || event.eventStartTime || '').trim();
      return {
        title: String(event.title || event.event_title || event.eventTitle || '').trim(),
        description: String(event.description || event.event_description || event.eventDescription || '').trim(),
        event_start_datetime: startDateTimeRaw,
        event_start_time: toTimeOnly(startTimeRaw || startDateTimeRaw),
        event_start_date: toIsoDateOnly(startDateRaw),
        event_end_date: toIsoDateOnly(endDateRaw),
        venue: String(event.venue || '').trim(),
        registration_link: String(event.registrationLink || event.registration_link || event.registrationQrLink || event.registration_qr_link || '').trim(),
        event_link: String(event.eventLink || event.event_link || '').trim(),
        event_type: String(event.eventType || event.event_type || '').trim(),
        participation_type: String(event.participationType || event.participation_type || '').trim(),
        min_team_size: event.minTeamSize ?? event.min_team_size ?? null,
        max_team_size: event.maxTeamSize ?? event.max_team_size ?? null,
        banner_image: String(event.banner_image || event.bannerImage || '').trim(),
        poster_image: String(event.poster_image || event.posterImage || '').trim(),
      };
    })
    .filter((event) => !!event.title);

  const eventDates = events
    .flatMap((event) => [event.event_start_date, event.event_end_date, toIsoDateOnly(event.event_start_datetime)])
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));

  const festStartRaw = String(payload.festStartDate || payload.fest_start_date || '').trim();
  const festEndRaw = String(payload.festEndDate || payload.fest_end_date || '').trim();

  const normalized = {
    fest_name: (payload.festName || payload.fest_name || '').trim(),
    college_name: (payload.collegeName || payload.college_name || '').trim(),
    college_location: (payload.collegeLocation || payload.college_location || '').trim(),
    college_website: (payload.collegeWebsite || payload.college_website || '').trim(),
    fest_start_date: toIsoDateOnly(festStartRaw) || (eventDates[0] || ''),
    fest_end_date: toIsoDateOnly(festEndRaw) || (eventDates.length ? eventDates[eventDates.length - 1] : ''),
    events,
  };

  console.log('[Fest Normalization] Output normalized:', {
    fest_name: normalized.fest_name,
    college_name: normalized.college_name,
    college_location: normalized.college_location,
    fest_start_date: normalized.fest_start_date,
    fest_end_date: normalized.fest_end_date,
    eventCount: normalized.events.length,
  });

  return normalized;
};

export const getVerifiedInterCampusEvents = async (userId?: string): Promise<InterCampusEvent[]> => {
  const { data: events, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('verification_status', 'verified')
    .order('is_fest', { ascending: false })
    .order('event_start_date', { ascending: true, nullsFirst: false });

  if (error) throw error;
  const rows = await attachInterCampusEventActors((events || []) as InterCampusEvent[]);
  if (!rows.length) return [];

  const eventIds = rows.map((event) => event.id);

  const [{ data: interestedRows, error: interestedError }, userInterestedResult] = await Promise.all([
    supabase
      .from('intercampus_interested_users')
      .select('event_id, user_id')
      .in('event_id', eventIds),
    userId
      ? supabase
        .from('intercampus_interested_users')
        .select('event_id')
        .eq('user_id', userId)
        .in('event_id', eventIds)
      : Promise.resolve({ data: null as any, error: null as any }),
  ]);

  if (interestedError) throw interestedError;
  if (userInterestedResult?.error) throw userInterestedResult.error;

  const countMap = new Map<string, number>();
  (interestedRows || []).forEach((row: any) => {
    countMap.set(row.event_id, (countMap.get(row.event_id) || 0) + 1);
  });

  const interestedSet = new Set<string>((userInterestedResult?.data || []).map((row: any) => row.event_id));

  return rows.map((event) => ({
    ...event,
    interested_count: countMap.get(event.id) || 0,
    is_interested: interestedSet.has(event.id),
  }));
};

export const getInterCampusEventById = async (eventId: string, userId?: string, anyStatus?: boolean): Promise<InterCampusEvent | null> => {
  let query = supabase
    .from('intercampus_events')
    .select('*')
    .eq('id', eventId);

  if (!anyStatus) {
    query = query.eq('verification_status', 'verified');
  }

  const { data: event, error } = await query.single();

  if (error) throw error;

  const [{ count }, userInterestedResult] = await Promise.all([
    supabase
      .from('intercampus_interested_users')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId),
    userId
      ? supabase
        .from('intercampus_interested_users')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle()
      : Promise.resolve({ data: null as any, error: null as any }),
  ]);

  if (userInterestedResult?.error) throw userInterestedResult.error;

  const [enrichedEvent] = await attachInterCampusEventActors([event as InterCampusEvent]);

  return {
    ...enrichedEvent,
    interested_count: count || 0,
    is_interested: !!userInterestedResult?.data,
  };
};

export const getInterCampusFests = (events: InterCampusEvent[]): InterCampusFestGroup[] => {
  const festRows = events.filter((event) => event.is_fest);
  const festEvents = events.filter((event) => !event.is_fest && !!event.fest_name);

  return festRows
    .map((fest) => ({
      fest_name: fest.title,
      college_name: fest.college_name,
      college_location: fest.college_location,
      banner_image: fest.banner_image,
      events: festEvents.filter((event) => event.fest_name?.trim() === fest.title?.trim()),
    }))
    .sort((a, b) => a.fest_name.localeCompare(b.fest_name));
};

export const submitInterCampusEvent = async (submittedBy: string, payload: InterCampusSubmissionInput) => {
  ensureTeamSizeRange(payload.min_team_size, payload.max_team_size);

  const festYear = inferFestYear(payload as any);

  const baseInsert: any = {
    submitted_by: submittedBy,
    event_title: payload.event_title,
    event_description: payload.event_description || null,
    college_name: payload.college_name,
    college_location: payload.college_location || null,
    college_website: payload.college_website || null,
    fest_name: payload.fest_name || null,
    event_start_date: payload.event_start_date || null,
    event_end_date: payload.event_end_date || null,
    fest_year: festYear,
    registration_link: payload.registration_link || null,
    registration_deadline: payload.registration_deadline || null,
    participation_type: payload.participation_type || null,
    min_team_size: payload.min_team_size ?? null,
    max_team_size: payload.max_team_size ?? null,
    source_type: payload.source_type || 'manual',
    source_url: payload.source_url || null,
    poster_image: payload.poster_image || null,
    ai_generated: !!payload.ai_generated,
  };

  let { data, error } = await supabase
    .from('intercampus_event_submissions')
    .insert(baseInsert as any)
    .select('*')
    .single();

  if (error && String(error.message || '').toLowerCase().includes('registration_deadline')) {
    const { registration_deadline: _ignored, ...withoutDeadline } = baseInsert;
    const retry = await supabase
      .from('intercampus_event_submissions')
      .insert(withoutDeadline as any)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data as InterCampusEventSubmission;
};

export const submitInterCampusFestEvents = async (
  submittedBy: string,
  festName: string,
  common: {
    college_name: string;
    college_location?: string;
    college_website?: string;
    fest_start_date?: string;
    fest_end_date?: string;
  },
  events: InterCampusSubmissionInput[],
) => {
  if (!events.length) throw new Error('At least one event is required for fest submission');

  const insertRows = events.map((event) => {
    ensureTeamSizeRange(event.min_team_size, event.max_team_size);

    const eventStartDate = event.event_start_date || common.fest_start_date || null;
    const eventEndDate = event.event_end_date || common.fest_end_date || null;
    const festYear = inferFestYear({
      fest_year: event.fest_year,
      event_start_date: eventStartDate,
      event_end_date: eventEndDate,
    });

    return {
      submitted_by: submittedBy,
      event_title: event.event_title,
      event_description: event.event_description || null,
      college_name: common.college_name,
      college_location: common.college_location || null,
      college_website: common.college_website || null,
      fest_name: festName,
      event_start_date: eventStartDate,
      event_end_date: eventEndDate,
      fest_year: festYear,
      registration_link: event.registration_link || null,
      participation_type: event.participation_type || null,
      min_team_size: event.min_team_size ?? null,
      max_team_size: event.max_team_size ?? null,
      source_type: event.source_type || 'fest_import',
      source_url: event.source_url || null,
      poster_image: event.poster_image || null,
      ai_generated: !!event.ai_generated,
    };
  });

  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .insert(insertRows as any)
    .select('*');

  if (error) throw error;
  return (data || []) as InterCampusEventSubmission[];
};

export const toggleInterCampusInterested = async (eventId: string, userId: string) => {
  const { data: existing, error: existingError } = await supabase
    .from('intercampus_interested_users')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from('intercampus_interested_users')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from('intercampus_interested_users')
    .insert({ event_id: eventId, user_id: userId } as any);

  if (error) throw error;
  return true;
};

export const getInterCampusInterestedUsers = async (eventId: string) => {
  const { data, error } = await supabase
    .from('intercampus_interested_users')
    .select('id, created_at, user_id, user:profiles!intercampus_interested_users_user_id_fkey(id, full_name, avatar_url, role, department)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getInterCampusTeamPosts = async (eventId: string): Promise<InterCampusTeamPost[]> => {
  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .select('*, creator:profiles!intercampus_team_posts_created_by_fkey(id, full_name, avatar_url, department, role)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusTeamPost[];
};

export const createInterCampusTeamPost = async (
  createdBy: string,
  payload: {
    event_id: string;
    message: string;
    required_skills?: string[];
    team_size_needed?: number;
    min_team_size?: number;
    max_team_size?: number;
  },
) => {
  ensureTeamSizeRange(payload.min_team_size, payload.max_team_size, payload.team_size_needed);

  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .insert({
      event_id: payload.event_id,
      created_by: createdBy,
      message: payload.message,
      required_skills: normalizeSkills(payload.required_skills),
      team_size_needed: payload.team_size_needed ?? null,
      status: 'open',
    } as any)
    .select('*, creator:profiles!intercampus_team_posts_created_by_fkey(id, full_name, avatar_url, department, role)')
    .single();

  if (error) throw error;
  return data as InterCampusTeamPost;
};

export const closeInterCampusTeamPost = async (postId: string) => {
  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .update({ status: 'closed' } as any)
    .eq('id', postId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const deleteInterCampusTeamPost = async (postId: string) => {
  const { error } = await supabase
    .from('intercampus_team_posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
  return true;
};

export const getInterCampusTeamPostReplies = async (postId: string): Promise<InterCampusTeamPostReply[]> => {
  const { data, error } = await supabase
    .from('intercampus_team_post_replies')
    .select('*, user:profiles!intercampus_team_post_replies_user_id_fkey(id, full_name, avatar_url, department, role)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as InterCampusTeamPostReply[];
};

export const replyToInterCampusTeamPost = async (userId: string, postId: string, message: string) => {
  const { data, error } = await supabase
    .from('intercampus_team_post_replies')
    .insert({ post_id: postId, user_id: userId, message } as any)
    .select('*, user:profiles!intercampus_team_post_replies_user_id_fkey(id, full_name, avatar_url, department, role)')
    .single();

  if (error) throw error;
  return data as InterCampusTeamPostReply;
};

export const getInterCampusDiscussions = async (eventId: string): Promise<InterCampusDiscussion[]> => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .select('*, creator:profiles!intercampus_discussions_created_by_fkey(id, full_name, avatar_url, role)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusDiscussion[];
};

export const createInterCampusDiscussion = async (eventId: string, userId: string, title: string) => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .insert({ event_id: eventId, created_by: userId, title } as any)
    .select('*, creator:profiles!intercampus_discussions_created_by_fkey(id, full_name, avatar_url, role)')
    .single();

  if (error) throw error;
  return data as InterCampusDiscussion;
};

export const lockInterCampusDiscussion = async (discussionId: string, locked = true) => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .update({ is_locked: locked } as any)
    .eq('id', discussionId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const getInterCampusDiscussionReplies = async (discussionId: string): Promise<InterCampusDiscussionReply[]> => {
  const { data, error } = await supabase
    .from('intercampus_discussion_replies')
    .select('*, user:profiles!intercampus_discussion_replies_user_id_fkey(id, full_name, avatar_url, role)')
    .eq('discussion_id', discussionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as InterCampusDiscussionReply[];
};

export const createInterCampusDiscussionReply = async (discussionId: string, userId: string, message: string) => {
  const { data, error } = await supabase
    .from('intercampus_discussion_replies')
    .insert({ discussion_id: discussionId, user_id: userId, message } as any)
    .select('*, user:profiles!intercampus_discussion_replies_user_id_fkey(id, full_name, avatar_url, role)')
    .single();

  if (error) throw error;
  return data as InterCampusDiscussionReply;
};

export const deleteInterCampusDiscussionReply = async (replyId: string) => {
  const { error } = await supabase
    .from('intercampus_discussion_replies')
    .delete()
    .eq('id', replyId);

  if (error) throw error;
  return true;
};

export const getInterCampusPendingSubmissions = async (): Promise<InterCampusEventSubmission[]> => {
  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusEventSubmission[];
};

export const getInterCampusPendingEvents = async (): Promise<InterCampusEvent[]> => {
  const { data, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return await attachInterCampusEventActors((data || []) as InterCampusEvent[]);
};

export const approveInterCampusEvent = async (eventId: string, approverId: string, notes?: string) => {
  const { data, error } = await supabase
    .from('intercampus_events')
    .update({
      verification_status: 'verified',
      faculty_notes: notes || null,
      verified_by: approverId,
    })
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) throw error;
  const [enriched] = await attachInterCampusEventActors([data as InterCampusEvent]);
  return enriched;
};

export const rejectInterCampusEvent = async (eventId: string, approverId: string, notes?: string) => {
  const { data, error } = await supabase
    .from('intercampus_events')
    .update({
      verification_status: 'rejected',
      faculty_notes: notes || null,
      verified_by: approverId,
    })
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) throw error;
  const [enriched] = await attachInterCampusEventActors([data as InterCampusEvent]);
  return enriched;
};

export const deleteInterCampusEvent = async (eventId: string) => {
  const { data: targetEvent, error: targetError } = await supabase
    .from('intercampus_events')
    .select('id, title, is_fest, college_name, fest_year')
    .eq('id', eventId)
    .single();

  if (targetError) throw targetError;

  if (targetEvent?.is_fest) {
    const { error: linkedChildDeleteError } = await supabase
      .from('intercampus_events')
      .delete()
      .eq('parent_fest_id', targetEvent.id);

    if (linkedChildDeleteError) throw linkedChildDeleteError;

    const festTitle = String(targetEvent.title || '').trim();
    if (festTitle) {
      let legacyChildrenDeleteQuery = supabase
        .from('intercampus_events')
        .delete()
        .eq('is_fest', false)
        .is('parent_fest_id', null)
        .eq('fest_name', festTitle);

      if (targetEvent.college_name) {
        legacyChildrenDeleteQuery = legacyChildrenDeleteQuery.eq('college_name', targetEvent.college_name);
      }
      if (typeof targetEvent.fest_year === 'number') {
        legacyChildrenDeleteQuery = legacyChildrenDeleteQuery.eq('fest_year', targetEvent.fest_year);
      }

      const { error: legacyChildDeleteError } = await legacyChildrenDeleteQuery;
      if (legacyChildDeleteError) throw legacyChildDeleteError;
    }
  }

  const { error } = await supabase
    .from('intercampus_events')
    .delete()
    .eq('id', eventId);
  if (error) throw error;
};

export const deleteInterCampusFest = async (festOrEventId: string) => {
  try {
    const { data: targetEvent, error: targetError } = await supabase
      .from('intercampus_events')
      .select('id, title, fest_name, is_fest, parent_fest_id, college_name, fest_year')
      .eq('id', festOrEventId)
      .single();

    if (targetError) throw targetError;

    let festRow = targetEvent;
    if (!targetEvent?.is_fest) {
      if (targetEvent?.parent_fest_id) {
        const { data: parentFest, error: parentError } = await supabase
          .from('intercampus_events')
          .select('id, title, fest_name, is_fest, parent_fest_id, college_name, fest_year')
          .eq('id', targetEvent.parent_fest_id)
          .single();
        if (parentError) throw parentError;
        festRow = parentFest;
      } else {
        const festName = String(targetEvent?.fest_name || '').trim();
        if (!festName) {
          throw new Error('Selected record is not a fest');
        }

        let festQuery = supabase
          .from('intercampus_events')
          .select('id, title, fest_name, is_fest, parent_fest_id, college_name, fest_year')
          .eq('is_fest', true)
          .eq('title', festName)
          .limit(1);

        if (targetEvent?.college_name) {
          festQuery = festQuery.eq('college_name', targetEvent.college_name);
        }
        if (typeof targetEvent?.fest_year === 'number') {
          festQuery = festQuery.eq('fest_year', targetEvent.fest_year);
        }

        const { data: fests, error: festLookupError } = await festQuery;
        if (festLookupError) throw festLookupError;

        const matchedFest = (fests || [])[0];
        if (!matchedFest) {
          throw new Error('Could not resolve fest record to delete');
        }

        festRow = matchedFest;
      }
    }

    if (!festRow?.is_fest) {
      throw new Error('Selected record is not a fest');
    }

    const { error: linkedChildDeleteError } = await supabase
      .from('intercampus_events')
      .delete()
      .eq('parent_fest_id', festRow.id);

    if (linkedChildDeleteError) throw linkedChildDeleteError;

    const festTitle = String(festRow.title || '').trim();
    if (festTitle) {
      let legacyChildrenDeleteQuery = supabase
        .from('intercampus_events')
        .delete()
        .eq('is_fest', false)
        .is('parent_fest_id', null)
        .eq('fest_name', festTitle);

      if (festRow.college_name) {
        legacyChildrenDeleteQuery = legacyChildrenDeleteQuery.eq('college_name', festRow.college_name);
      }
      if (typeof festRow.fest_year === 'number') {
        legacyChildrenDeleteQuery = legacyChildrenDeleteQuery.eq('fest_year', festRow.fest_year);
      }

      const { error: legacyChildDeleteError } = await legacyChildrenDeleteQuery;
      if (legacyChildDeleteError) throw legacyChildDeleteError;
    }

    const { error: festDeleteError } = await supabase
      .from('intercampus_events')
      .delete()
      .eq('id', festRow.id);

    if (festDeleteError) throw festDeleteError;
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('permission denied') || message.includes('row-level security')) {
      throw new Error('Delete blocked by database permissions. Apply latest Supabase migrations and retry.');
    }
    throw error;
  }
};

export const updateInterCampusEvent = async (eventId: string, payload: Record<string, any>) => {
  const { data, error } = await supabase
    .from('intercampus_events')
    .update(payload)
    .eq('id', eventId)
    .select('*')
    .single();
  if (error) throw error;
  const [enriched] = await attachInterCampusEventActors([data as InterCampusEvent]);
  return enriched;
};

export const approveInterCampusSubmission = async (
  approverId: string,
  payload: InterCampusApprovePayload,
) => {
  const { data: submission, error: submissionError } = await supabase
    .from('intercampus_event_submissions')
    .select('*')
    .eq('id', payload.submission_id)
    .single();

  if (submissionError) throw submissionError;
  if (!submission) throw new Error('Submission not found');

  const { data: insertedEvent, error: insertError } = await supabase
    .from('intercampus_events')
    .insert({
      title: submission.event_title || 'Untitled Event',
      description: submission.event_description || null,
      college_name: submission.college_name || 'Unknown College',
      college_location: submission.college_location || null,
      college_website: submission.college_website || null,
      fest_name: submission.fest_name || null,
      event_start_date: submission.event_start_date || null,
      event_end_date: submission.event_end_date || null,
      fest_year: inferFestYear(submission as any),
      registration_link: submission.registration_link || null,
      participation_type: submission.participation_type || null,
      min_team_size: submission.min_team_size ?? null,
      max_team_size: submission.max_team_size ?? null,
      source_type: submission.source_type || 'manual',
      source_url: submission.source_url || null,
      poster_image: submission.poster_image || null,
      ai_generated: !!submission.ai_generated,
      verification_status: 'verified',
      faculty_notes: payload.faculty_notes || null,
      participation_cap: payload.participation_cap ?? null,
      created_by: approverId,
      verified_by: approverId,
    } as any)
    .select('*')
    .single();

  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('intercampus_event_submissions')
    .update({ status: 'approved' } as any)
    .eq('id', payload.submission_id);

  if (updateError) throw updateError;

  return insertedEvent as InterCampusEvent;
};

export const rejectInterCampusSubmission = async (submissionId: string) => {
  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .update({ status: 'rejected' } as any)
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error) throw error;
  return data as InterCampusEventSubmission;
};

export const getInterCampusMyCollaborations = async (userId: string) => {
  const [{ data: myPosts, error: postsError }, { data: myReplies, error: repliesError }] = await Promise.all([
    supabase
      .from('intercampus_team_posts')
      .select('*, event:intercampus_events!intercampus_team_posts_event_id_fkey(id, title, college_name, participation_type, verification_status)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('intercampus_team_post_replies')
      .select('*, post:intercampus_team_posts!intercampus_team_post_replies_post_id_fkey(id, event_id, message, status, event:intercampus_events!intercampus_team_posts_event_id_fkey(id, title, college_name, participation_type, verification_status))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (postsError) throw postsError;
  if (repliesError) throw repliesError;

  return {
    my_posts: myPosts || [],
    my_replies: myReplies || [],
  };
};

export const getMyInterCampusSubmissions = async (userId: string): Promise<InterCampusEventSubmission[]> => {
  const { data, error } = await supabase
    .from('intercampus_event_submissions')
    .select('*')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as InterCampusEventSubmission[];
};

export const resolveApprovedEventForSubmission = async (submission: InterCampusEventSubmission) => {
  if (!submission.event_title || !submission.college_name) return null;

  let query = supabase
    .from('intercampus_events')
    .select('id')
    .eq('verification_status', 'verified')
    .eq('title', submission.event_title)
    .eq('college_name', submission.college_name)
    .order('created_at', { ascending: false })
    .limit(1);

  if (submission.event_start_date) {
    query = query.eq('event_start_date', submission.event_start_date);
  }

  if (submission.fest_name) {
    query = query.eq('fest_name', submission.fest_name);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id || null;
};

export const getInterCampusAdminOverview = async () => {
  const [
    pendingSubmissions,
    openTeamPosts,
    lockedDiscussions,
    interestedUsers,
  ] = await Promise.all([
    supabase.from('intercampus_event_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('intercampus_team_posts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('intercampus_discussions').select('id', { count: 'exact', head: true }).eq('is_locked', true),
    supabase.from('intercampus_interested_users').select('id', { count: 'exact', head: true }),
  ]);

  return {
    pending_submissions: pendingSubmissions.count || 0,
    open_team_posts: openTeamPosts.count || 0,
    locked_discussions: lockedDiscussions.count || 0,
    interested_users: interestedUsers.count || 0,
  };
};

export const getInterCampusAllTeamPosts = async () => {
  const { data, error } = await supabase
    .from('intercampus_team_posts')
    .select('*, event:intercampus_events!intercampus_team_posts_event_id_fkey(id, title, college_name), creator:profiles!intercampus_team_posts_created_by_fkey(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
};

export const getInterCampusAllDiscussions = async () => {
  const { data, error } = await supabase
    .from('intercampus_discussions')
    .select('*, event:intercampus_events!intercampus_discussions_event_id_fkey(id, title, college_name), creator:profiles!intercampus_discussions_created_by_fkey(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
};

export const getInterCampusAllDiscussionReplies = async () => {
  const { data, error } = await supabase
    .from('intercampus_discussion_replies')
    .select('*, discussion:intercampus_discussions!intercampus_discussion_replies_discussion_id_fkey(id, title), user:profiles!intercampus_discussion_replies_user_id_fkey(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data || [];
};

/* ─── Dedicated fest / event queries using parent_fest_id ─── */

export const getVerifiedFestsPaginated = async (
  input?: PaginationInput,
): Promise<PaginatedResult<InterCampusEvent>> => {
  const { from, to, pageSize } = normalizePagination(input);
  const { data, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('is_fest', true)
    .is('parent_fest_id', null)
    .eq('verification_status', 'verified')
    .order('event_start_date', { ascending: true, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  const rows = await attachInterCampusEventActors((data || []) as InterCampusEvent[]);
  return { data: rows, hasMore: rows.length === pageSize };
};

export const getVerifiedStandaloneEventsPaginated = async (
  input?: PaginationInput,
): Promise<PaginatedResult<InterCampusEvent>> => {
  const { from, to, pageSize } = normalizePagination(input);
  const { data, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('is_fest', false)
    .is('parent_fest_id', null)
    .eq('verification_status', 'verified')
    .order('event_start_date', { ascending: true, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  const rows = await attachInterCampusEventActors((data || []) as InterCampusEvent[]);
  return { data: rows, hasMore: rows.length === pageSize };
};

export const getFestEventsPaginated = async (
  festId: string,
  input?: PaginationInput,
): Promise<PaginatedResult<InterCampusEvent>> => {
  const { from, to, pageSize } = normalizePagination(input);
  const { data, error } = await supabase
    .from('intercampus_events')
    .select('*')
    .eq('is_fest', false)
    .eq('parent_fest_id', festId)
    .eq('verification_status', 'verified')
    .order('event_start_date', { ascending: true, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  const rows = await attachInterCampusEventActors((data || []) as InterCampusEvent[]);
  return { data: rows, hasMore: rows.length === pageSize };
};

export const getVerifiedFests = async (): Promise<InterCampusEvent[]> => {
  const result = await getVerifiedFestsPaginated({ page: 1, pageSize: 500 });
  return result.data;
};

export const getVerifiedStandaloneEvents = async (): Promise<InterCampusEvent[]> => {
  const result = await getVerifiedStandaloneEventsPaginated({ page: 1, pageSize: 500 });
  return result.data;
};

export const getFestEvents = async (festId: string): Promise<InterCampusEvent[]> => {
  const result = await getFestEventsPaginated(festId, { page: 1, pageSize: 500 });
  return result.data;
};

export const createInterCampusEventDirect = async (
  creatorId: string,
  payload: {
    title: string;
    description?: string;
    college_name: string;
    college_location?: string;
    college_website?: string;
    fest_name?: string;
    event_type?: string;
    participation_type?: 'individual' | 'team';
    min_team_size?: number;
    max_team_size?: number;
    venue?: string;
    is_online?: boolean;
    registration_link?: string;
    registration_deadline?: string;
    fest_year?: number;
    event_start_date: string;
    event_end_date?: string;
    eligibility_text?: string;
    banner_image?: string;
    faculty_notes?: string;
    participation_cap?: number;
  },
) => {
  ensureTeamSizeRange(payload.min_team_size, payload.max_team_size);
  const festYear = inferFestYear(payload as any);

  const insertData: any = {
    title: payload.title.trim(),
    is_fest: false,
    description: payload.description?.trim() || null,
    college_name: payload.college_name.trim(),
    college_location: payload.college_location?.trim() || null,
    college_website: payload.college_website?.trim() || null,
    fest_name: payload.fest_name?.trim() || null,
    event_type: payload.event_type?.trim() || null,
    participation_type: payload.participation_type || null,
    min_team_size: payload.participation_type === 'team' ? payload.min_team_size ?? null : null,
    max_team_size: payload.participation_type === 'team' ? payload.max_team_size ?? null : null,
    venue: payload.venue?.trim() || null,
    is_online: !!payload.is_online,
    registration_link: payload.registration_link?.trim() || null,
    registration_deadline: payload.registration_deadline || null,
    fest_year: festYear,
    event_start_date: payload.event_start_date,
    event_end_date: payload.event_end_date || null,
    eligibility_text: payload.eligibility_text?.trim() || null,
    banner_image: payload.banner_image?.trim() || null,
    faculty_notes: payload.faculty_notes?.trim() || null,
    participation_cap: payload.participation_cap ?? null,
    source_type: 'manual',
    source_url: null,
    poster_image: null,
    ai_generated: false,
    verification_status: 'verified',
    verified_by: creatorId,
    created_by: creatorId,
    status: 'upcoming',
  };

  let result = await supabase.from('intercampus_events').insert(insertData).select('*').single();

  // Backward-compatible fallback when `status` column is not present.
  if (result.error && String(result.error.message || '').toLowerCase().includes('status')) {
    const { status: _ignored, ...withoutStatus } = insertData;
    result = await supabase.from('intercampus_events').insert(withoutStatus).select('*').single();
  }

  if (result.error) throw result.error;
  return result.data as InterCampusEvent;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

const getAIBaseUrl = () => normalizeBaseUrl(BASE_URL);

const requestAiJson = async (path: string, body: Record<string, any>) => {
  const endpoint = `${getAIBaseUrl()}${path}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { response, endpoint };
  } catch (error: any) {
    const message = String(error?.message || 'Network request failed');
    console.warn('[InterCampus AI] endpoint request failed', { endpoint, message });
    throw new Error(`Network request failed. Could not reach AI server at ${endpoint}. ${message}`);
  }
};

const requestAiForm = async (path: string, form: FormData) => {
  const endpoint = `${getAIBaseUrl()}${path}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
    });
    return { response, endpoint };
  } catch (error: any) {
    const message = String(error?.message || 'Network request failed');
    console.warn('[InterCampus AI] endpoint request failed', { endpoint, message });
    throw new Error(`Network request failed. Could not reach AI server at ${endpoint}. ${message}`);
  }
};

export const extractInterCampusEventFromLink = async (sourceUrl: string) => {
  const { response, endpoint } = await requestAiJson('/extractEvent', { url: sourceUrl });
  console.log('[InterCampus AI] extract-event start', { endpoint, sourceUrl });

  if (!response.ok) {
    const text = await response.text();
    console.error('[InterCampus AI] extract-event failed', {
      status: response.status,
      statusText: response.statusText,
      responseText: text,
    });
    throw new Error(text || 'AI website extraction failed');
  }

  const payload = await response.json();
  console.log('[InterCampus AI] extract-event success', { payload });
  return normalizeExtractedEvent(payload || {});
};

export const extractInterCampusFestFromLink = async (sourceUrl: string) => {
  const { response, endpoint } = await requestAiJson('/extractEvent', { url: sourceUrl });
  console.log('[InterCampus AI] extract-fest start', { endpoint, sourceUrl });

  if (!response.ok) {
    const text = await response.text();
    console.error('[InterCampus AI] extract-fest failed', {
      status: response.status,
      statusText: response.statusText,
      responseText: text,
    });
    throw new Error(text || 'AI fest extraction failed');
  }

  const payload = await response.json();
  console.log('[InterCampus AI] extract-fest success', { payload });
  return normalizeExtractedFestFromWebsite(payload || {});
};

export const extractInterCampusEventFromPoster = async (imageUri: string) => {
  const form = new FormData();
  form.append('file', {
    uri: imageUri,
    name: `poster-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);

  const { response, endpoint } = await requestAiForm('/extractPoster', form);
  console.log('[InterCampus AI] extract-poster start', { endpoint, imageUri });

  if (!response.ok) {
    const text = await response.text();
    console.error('[InterCampus AI] extract-poster failed', {
      status: response.status,
      statusText: response.statusText,
      responseText: text,
    });
    throw new Error(text || 'AI poster extraction failed');
  }

  const payload = await response.json();
  console.log('[InterCampus AI] extract-poster success', { payload });
  const normalized = normalizeExtractedEvent(payload || {});
  return {
    ...normalized,
    poster_image: normalized.poster_image || imageUri,
  };
};

export const extractInterCampusFestFromPoster = async (imageUri: string) => {
  const form = new FormData();
  form.append('file', {
    uri: imageUri,
    name: `fest-poster-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);

  const { response, endpoint } = await requestAiForm('/extractPoster', form);
  console.log('[InterCampus AI] extract-fest-poster start', { endpoint, imageUri });

  if (!response.ok) {
    const text = await response.text();
    console.error('[InterCampus AI] extract-fest-poster failed', {
      status: response.status,
      statusText: response.statusText,
      responseText: text,
    });
    throw new Error(text || 'AI fest poster extraction failed');
  }

  const payload = await response.json();
  console.log('[InterCampus AI] extract-fest-poster success', { payload });
  return normalizeExtractedFestFromWebsite(payload || {});
};
