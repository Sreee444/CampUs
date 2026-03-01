// @ts-nocheck
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from "./supabase";
import { Event, EventRegistration, EventDiscussion, EventType } from "../types/database";
import { evaluateEventEligibility } from "../utils/eventEligibility";

// Get all events — tab can be 'upcoming' | 'live' | 'past' | 'all'
export const getEvents = async (
  userId?: string,
  type?: EventType,
  tab: 'upcoming' | 'live' | 'past' | 'all' = 'upcoming'
) => {
  const now = new Date().toISOString();

  let query = supabase
    .from("events")
    .select(`
      *,
      creator:profiles!events_created_by_fkey(*)
    `);

  if (type) {
    query = query.eq("event_type", type);
  }

  if (tab === 'upcoming') {
    // Events that haven't started yet
    query = query.gt("start_date", now).order("start_date", { ascending: true });
  } else if (tab === 'live') {
    // Events currently in progress: started but not ended
    query = query.lte("start_date", now).gte("end_date", now).order("start_date", { ascending: true });
  } else if (tab === 'past') {
    // Events that have already ended
    query = query.lt("end_date", now).order("start_date", { ascending: false });
  } else {
    query = query.order("start_date", { ascending: true });
  }

  const { data, error } = await query;
  if (error) throw error;

  // Get registration counts and user registration status
  const eventsWithData = await Promise.all(
    (data || []).map(async (event: any) => {
      const [registrationsCount, isRegistered] = await Promise.all([
        supabase
          .from("event_registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("status", "registered"),
        userId
          ? supabase
            .from("event_registrations")
            .select("id")
            .eq("event_id", event.id)
            .eq("user_id", userId)
            .eq("status", "registered")
            .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...event,
        registrations_count: registrationsCount.count || 0,
        is_registered: !!isRegistered.data,
      };
    })
  );

  return eventsWithData as Event[];
};

// Get single event
export const getEvent = async (eventId: string, userId?: string) => {
  const { data, error } = await supabase
    .from("events")
    .select(`
      *,
      creator:profiles!events_created_by_fkey(*)
    `)
    .eq("id", eventId)
    .single();

  if (error) throw error;

  // Get registration count and user status
  const [registrationsCount, isRegistered] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "registered"),
    userId
      ? supabase
        .from("event_registrations")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "registered")
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...data as any,
    registrations_count: registrationsCount.count || 0,
    is_registered: !!isRegistered.data,
  } as Event;
};

// Create event
export const createEvent = async (eventData: Partial<Event>) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("events")
    .insert(eventData as any)
    .select()
    .single();

  if (error) throw error;
  return data as Event;
};

// Update event
export const updateEvent = async (
  eventId: string,
  updates: Partial<Event>
) => {
  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("events")
    .update(updates as any)
    .eq("id", eventId)
    .select()
    .single();

  if (error) throw error;
  return data as Event;
};

// Delete event
export const deleteEvent = async (eventId: string) => {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;
};

// Register for event
export const registerForEvent = async (eventId: string, userId: string) => {
  const [{ data: event, error: eventError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("events")
      .select("id, registration_deadline, eligibility_type, eligible_departments, eligible_years")
      .eq("id", eventId)
      .single(),
    supabase
      .from("profiles")
      .select("department, year")
      .eq("id", userId)
      .single(),
  ]);

  if (eventError) throw eventError;
  if (profileError) throw profileError;

  const now = new Date();
  if (event?.registration_deadline && new Date(event.registration_deadline) <= now) {
    throw new Error("Registration is closed for this event.");
  }

  const eligibility = evaluateEventEligibility(
    {
      eligibility_type: event?.eligibility_type,
      eligible_departments: event?.eligible_departments,
      eligible_years: event?.eligible_years,
    },
    {
      department: profile?.department,
      year: profile?.year,
    }
  );

  if (!eligibility.isEligible) {
    throw new Error(eligibility.reason || "You are not eligible to register for this event.");
  }

  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from("event_registrations")
    .upsert({
      event_id: eventId,
      user_id: userId,
      status: "registered",
      team_id: null,
      looking_for_team: false,
    } as any, { onConflict: 'event_id,user_id' })
    .select()
    .single();

  if (error) throw error;
  return data as EventRegistration;
};

// Unregister from event
export const unregisterFromEvent = async (eventId: string, userId: string) => {
  const { error } = await supabase
    .from("event_registrations")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) throw error;
};

// Get event registrations
export const getEventRegistrations = async (eventId: string) => {
  const { data, error } = await supabase
    .from("event_registrations")
    .select(`
      *,
      user:profiles!event_registrations_user_id_fkey(*)
    `)
    .eq("event_id", eventId)
    .eq("status", "registered");

  if (error) throw error;
  return data;
};

// Get event discussions
export const getEventDiscussions = async (
  eventId: string,
  isPreEvent = true
) => {
  const { data, error } = await supabase
    .from("event_discussions")
    .select(`
      *,
      user:profiles!event_discussions_user_id_fkey(*)
    `)
    .eq("event_id", eventId)
    .eq("is_pre_event", isPreEvent)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as EventDiscussion[];
};

// Add event discussion message
export const addEventDiscussion = async (
  eventId: string,
  userId: string,
  message: string,
  isPreEvent = true
) => {
  // Ensure user_id is set to current user for RLS compliance
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = userId || sessionData?.session?.user?.id;

  if (!currentUserId) {
    throw new Error('User must be authenticated to post in event discussions');
  }

  const { data, error } = await supabase
    .from("event_discussions")
    .insert({
      event_id: eventId,
      user_id: currentUserId,
      message,
      is_pre_event: isPreEvent,
    } as any)
    .select(`
      *,
      user:profiles!event_discussions_user_id_fkey(*) `)
    .single();

  if (error) {
    console.error('Error adding event discussion:', error);
    throw error;
  }
  return data as EventDiscussion;
};

// Delete all messages for an event discussion thread
export const deleteEventDiscussionThread = async (
  eventId: string,
  isPreEvent = true
) => {
  const { error } = await supabase
    .from('event_discussions')
    .delete()
    .eq('event_id', eventId)
    .eq('is_pre_event', isPreEvent);

  if (error) {
    console.error('Error deleting event discussion thread:', error);
    throw error;
  }
};



// Upload event banner
export const uploadEventBanner = async (userId: string, fileUri: string) => {
  const fileExt = (fileUri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const byteCharacters = atob(base64);
  const uint8Array = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    uint8Array[i] = byteCharacters.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from('event-banners')
    .upload(fileName, uint8Array, { contentType, upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from('event-banners').getPublicUrl(fileName);
  return publicUrl;
};

