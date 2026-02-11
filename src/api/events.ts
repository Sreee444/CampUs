import { supabase } from "./supabase";
import { Event, EventRegistration, EventDiscussion, EventType } from "../types/database";

// Get all events
export const getEvents = async (
  userId?: string,
  type?: EventType,
  upcoming = true
) => {
  let query = supabase
    .from("events")
    .select(`
      *,
      creator:profiles!events_created_by_fkey(*)
    `)
    .order("start_date", { ascending: true });

  if (type) {
    query = query.eq("event_type", type);
  }

  if (upcoming) {
    query = query.gte("start_date", new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  // Get registration counts and user registration status
  const eventsWithData = await Promise.all(
    (data || []).map(async (event) => {
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
              .single()
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
          .single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...data,
    registrations_count: registrationsCount.count || 0,
    is_registered: !!isRegistered.data,
  } as Event;
};

// Create event
export const createEvent = async (eventData: Partial<Event>) => {
  const { data, error } = await supabase
    .from("events")
    .insert(eventData)
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
  const { data, error } = await supabase
    .from("events")
    .update(updates)
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
  const { data, error } = await supabase
    .from("event_registrations")
    .insert({
      event_id: eventId,
      user_id: userId,
      status: "registered",
    })
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
  const { data, error } = await supabase
    .from("event_discussions")
    .insert({
      event_id: eventId,
      user_id: userId,
      message,
      is_pre_event: isPreEvent,
    })
    .select(`
      *,
      user:profiles!event_discussions_user_id_fkey(*) `)
    .single();

  if (error) throw error;
  return data as EventDiscussion;
};

// Upload event banner
export const uploadEventBanner = async (userId: string, fileUri: string) => {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const fileExt = fileUri.split(".").pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("event-banners")
    .upload(filePath, blob);

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-banners").getPublicUrl(filePath);

  return publicUrl;
};
