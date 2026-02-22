// @ts-nocheck
/**
 * eventGuards.ts
 * Registration guard utilities for team-gated screens.
 * Always uses a fresh DB query — never relies on React state.
 */
import { supabase } from '../api/supabase';

/**
 * Returns true if the user has an ACTIVE registration (status='registered') for this event.
 * Cancelled registrations are excluded — they do NOT count as registered.
 */
export async function isUserRegistered(
    eventId: string,
    userId: string
): Promise<boolean> {
    const { data } = await supabase
        .from('event_registrations')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'registered')
        .limit(1);

    return data?.[0]?.id != null;
}

/**
 * Returns true if registration deadline has NOT passed for the given event.
 * Use this to gate all team actions.
 */
export async function isRegistrationOpen(eventId: string): Promise<boolean> {
    const { data } = await supabase
        .from('events')
        .select('registration_deadline')
        .eq('id', eventId)
        .single();

    if (!data?.registration_deadline) return false;
    return new Date(data.registration_deadline) > new Date();
}

/**
 * Returns the registration record (if any) for a user with ACTIVE status.
 * Returns null if not registered or cancelled.
 */
export async function getUserRegistrationStatus(
    eventId: string,
    userId: string
): Promise<{ id: string; team_id: string | null } | null> {
    const { data } = await supabase
        .from('event_registrations')
        .select('id, team_id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'registered')
        .limit(1);

    return data?.[0] || null;
}

/**
 * Returns full registration row with id, team_id, looking_for_team.
 * Returns null if not registered (or registration was cancelled).
 * Use this before every team mutation — never trust cached state.
 */
export async function getRegistration(
    eventId: string,
    userId: string
): Promise<{ id: string; team_id: string | null; looking_for_team: boolean } | null> {
    const { data, error } = await supabase
        .from('event_registrations')
        .select('id, team_id, looking_for_team')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'registered')
        .single();

    return data || null;
}
