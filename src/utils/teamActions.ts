// @ts-nocheck
/**
 * teamActions.ts
 * Central team action utilities used across all team-related screens.
 * ALL mutations follow schema rules strictly:
 *   - event_registrations is the single source of truth
 *   - team_requests is the only table for invites + join requests
 *   - Never trust local state — always refetch from DB
 */
import { supabase } from '../api/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL STATE LOADER
// Call this after ANY team action and on screen focus.
// Returns a full snapshot of the current user's team state for an event.
// ─────────────────────────────────────────────────────────────────────────────
export interface MyTeamState {
    registration: { id: string; team_id: string | null; status: string } | null;
    teamId: string | null;
    userTeamId: string | null;
    isInTeam: boolean;
    isRegistered: boolean;
    pendingRequests: any[];            // all pending team_requests for this user+event
    hasSentJoinRequest: boolean;       // user sent a 'join' request to any team
    hasReceivedInvite: boolean;        // user received an 'invite' from any team
    sentJoinRequest: any | null;       // the specific pending join request row
    receivedInvite: any | null;        // the specific pending invite row
}

export async function loadMyTeamState(
    eventId: string,
    userId: string
): Promise<MyTeamState> {
    // 1. Fetch registration (be lenient: accept null status or 'registered')
    const { data: reg } = await (supabase as any)
        .from('event_registrations')
        .select('id, team_id, status')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .neq('status', 'cancelled') // Only ignore explicitly cancelled ones
        .maybeSingle();

    let teamId = reg?.team_id ?? null;

    // 1b. FALLBACK: If registration exists but team_id is null, check event-scoped membership.
    // Join through event_teams so membership cannot leak across events.
    if (!teamId) {
        const { data: memberEntry } = await (supabase as any)
            .from('event_team_members')
            .select(`
                team_id,
                team:event_teams!inner(
                    id,
                    event_id
                )
            `)
            .eq('user_id', userId)
            .eq('status', 'active')
            .eq('team.event_id', eventId)
            .limit(1)
            .maybeSingle();

        if (memberEntry) {
            teamId = memberEntry.team_id;
        }
    }

    // 2. Fetch ALL pending team_requests involving this user for this event
    const { data: requests } = await (supabase as any)
        .from('team_requests')
        .select('id, team_id, type, status, requester_id, target_user_id')
        .eq('event_id', eventId)
        .eq('status', 'pending')
        .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`);

    const pendingRequests: any[] = requests ?? [];

    const sentJoinRequest = pendingRequests.find(
        (r) => r.requester_id === userId && r.type === 'join'
    ) ?? null;
    const receivedInvite = pendingRequests.find(
        (r) => r.target_user_id === userId && r.type === 'invite'
    ) ?? null;

    return {
        registration: reg ?? null,
        teamId,
        userTeamId: teamId,
        isInTeam: teamId !== null,
        isRegistered: reg !== null,
        pendingRequests,
        hasSentJoinRequest: sentJoinRequest !== null,
        hasReceivedInvite: receivedInvite !== null,
        sentJoinRequest,
        receivedInvite,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE TEAM
// Does NOT unregister the user from the event — only removes team association.
// Cleans up all pending requests for this event to prevent ghost buttons.
// ─────────────────────────────────────────────────────────────────────────────
export async function leaveTeam(params: {
    teamId: string;
    eventId: string;
    userId: string;
}): Promise<void> {
    const { teamId, eventId, userId } = params;

    // 1. Remove from event_team_members
    const { error: memberErr } = await (supabase as any)
        .from('event_team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', userId);
    if (memberErr) throw memberErr;

    // 2. Null out team_id in event_registrations (keep registration!)
    const { error: regErr } = await (supabase as any)
        .from('event_registrations')
        .update({ team_id: null, looking_for_team: false })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'registered');
    if (regErr) throw regErr;

    // 3. Delete ALL pending team_requests to prevent ghost invite/request buttons
    const { error: reqErr } = await (supabase as any)
        .from('team_requests')
        .delete()
        .eq('event_id', eventId)
        .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`);
    // Ignore error here — cleanup is best-effort
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT INVITE (from target user's side)
// ─────────────────────────────────────────────────────────────────────────────
export async function acceptInvite(params: {
    requestId: string;
    teamId: string;
    eventId: string;
    userId: string;
}): Promise<void> {
    const { requestId, teamId, eventId, userId } = params;

    // 1. Verify request is still pending
    const { data: reqRow } = await (supabase as any)
        .from('team_requests')
        .select('id, status')
        .eq('id', requestId)
        .maybeSingle();

    if (!reqRow || reqRow.status !== 'pending') {
        throw new Error('This invitation is no longer valid.');
    }

    // 2. Check registration exists and has no team yet.
    // Some legacy rows may have null/non-standard statuses; only cancelled should block joining.
    const { data: reg } = await (supabase as any)
        .from('event_registrations')
        .select('id, team_id, status')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!reg) throw new Error('You must be registered for this event to join a team.');
    if (reg.status === 'cancelled') {
        throw new Error('Your event registration is cancelled. Please re-register first.');
    }
    if (reg.team_id) throw new Error('You are already in a team for this event.');

    // 3. Fresh team capacity check
    const { count: memberCount } = await supabase
        .from('event_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active');

    const { data: teamData } = await (supabase as any)
        .from('event_teams')
        .select('max_members')
        .eq('id', teamId)
        .single();

    if ((memberCount ?? 0) >= ((teamData as any)?.max_members ?? 999)) {
        throw new Error('This team is now full.');
    }

    // 4. Check not already a member
    const { data: existing } = await (supabase as any)
        .from('event_team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!existing) {
        const { error: memberErr } = await (supabase as any)
            .from('event_team_members')
            .insert({ team_id: teamId, user_id: userId, role: 'member', status: 'active' });
        if (memberErr) throw memberErr;
    }

    // 5. Update event_registrations.team_id AND force status='registered'
    const { error: regErr } = await (supabase as any)
        .from('event_registrations')
        .update({
            team_id: teamId,
            looking_for_team: false,
            status: 'registered' // FORCE STATUS CONSISTENCY
        })
        .eq('event_id', eventId)
        .eq('user_id', userId);
    if (regErr) throw regErr;

    // 6. Mark THIS request as accepted
    const { error: reqErr } = await (supabase as any)
        .from('team_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);
    if (reqErr) throw reqErr;

    // 7. Reject ALL other pending invites for this user + event (prevent ghost invites)
    await (supabase as any)
        .from('team_requests')
        .update({ status: 'rejected' })
        .eq('event_id', eventId)
        .eq('target_user_id', userId)
        .eq('type', 'invite')
        .eq('status', 'pending')
        .neq('id', requestId);
}

// ─────────────────────────────────────────────────────────────────────────────
// REJECT INVITE — updates status to 'rejected'
// ─────────────────────────────────────────────────────────────────────────────
export async function rejectInvite(requestId: string): Promise<void> {
    const { error } = await (supabase as any)
        .from('team_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);
    if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND JOIN REQUEST (user → team)
// Uses team_requests table with type='join'
// ─────────────────────────────────────────────────────────────────────────────
export async function sendJoinRequest(params: {
    teamId: string;
    eventId: string;
    userId: string;
    teamName?: string;
}): Promise<void> {
    const { teamId, eventId, userId, teamName } = params;

    // Check registration
    const { data: reg } = await (supabase as any)
        .from('event_registrations')
        .select('id, team_id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'registered')
        .maybeSingle();

    if (!reg) throw new Error('You must register for the event before joining a team.');
    if (reg.team_id) throw new Error('You are already in a team for this event.');

    const { data: teamRow, error: teamRowError } = await (supabase as any)
        .from('event_teams')
        .select('id, max_members, is_recruiting, leader_id, name')
        .eq('id', teamId)
        .eq('event_id', eventId)
        .maybeSingle();

    if (teamRowError) throw teamRowError;
    if (!teamRow) throw new Error('Team not found for this event.');
    if (!teamRow.is_recruiting) throw new Error('This team is not accepting new requests right now.');

    // Check capacity
    const { count: memberCount } = await supabase
        .from('event_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active');

    const { data: teamData } = await (supabase as any)
        .from('event_teams')
        .select('max_members')
        .eq('id', teamId)
        .single();

    if ((memberCount ?? 0) >= ((teamData as any)?.max_members ?? 999)) {
        throw new Error('This team is full.');
    }

    // No duplicate requests
    const { data: dup } = await (supabase as any)
        .from('team_requests')
        .select('id')
        .eq('team_id', teamId)
        .eq('requester_id', userId)
        .eq('type', 'join')
        .eq('status', 'pending')
        .maybeSingle();

    if (dup) throw new Error('You already have a pending request for this team.');

    const { data: insertedReq, error } = await (supabase as any)
        .from('team_requests')
        .insert({
            team_id: teamId,
            event_id: eventId,
            requester_id: userId,
            type: 'join',
            status: 'pending',
        })
        .select('id')
        .single();
    if (error) throw error;

    // Notify team leader about incoming join request
    if (teamRow.leader_id && teamRow.leader_id !== userId) {
        const { data: requesterProfile } = await (supabase as any)
            .from('profiles')
            .select('full_name, email')
            .eq('id', userId)
            .maybeSingle();

        await (supabase as any)
            .from('notifications')
            .insert({
                user_id: teamRow.leader_id,
                type: 'team_join_request',
                title: 'New Team Join Request',
                body: `${requesterProfile?.full_name || requesterProfile?.email || 'A user'} requested to join "${teamRow.name || teamName || 'your team'}"`,
                related_id: teamId,
                related_type: 'team',
                is_read: false,
                metadata: {
                    team_request_id: insertedReq?.id,
                    requester_user_id: userId,
                    team_id: teamId,
                    event_id: eventId,
                },
            });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL JOIN REQUEST (user withdraws their own join request)
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelJoinRequest(params: {
    teamId: string;
    requesterId: string;
    eventId?: string;
}): Promise<void> {
    let query = (supabase as any)
        .from('team_requests')
        .delete()
        .eq('team_id', params.teamId)
        .eq('requester_id', params.requesterId)
        .eq('type', 'join')
        .eq('status', 'pending');

    if (params.eventId) query = query.eq('event_id', params.eventId);

    const { error } = await query;
    if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND INVITE (leader → user)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendInvite(params: {
    teamId: string;
    eventId: string;
    leaderId: string;
    targetUserId: string;
    teamName: string;
    message?: string;
}): Promise<string> {
    const { teamId, eventId, leaderId, targetUserId, teamName, message } = params;

    const { data: existingMember } = await (supabase as any)
        .from('event_team_members')
        .select(`
            id,
            team:event_teams!inner(
                id,
                event_id
            )
        `)
        .eq('user_id', targetUserId)
        .eq('status', 'active')
        .eq('team.event_id', eventId)
        .limit(1)
        .maybeSingle();

    if (existingMember) {
        throw new Error('User is already in a team for this event.');
    }

    const { data: targetReg } = await (supabase as any)
        .from('event_registrations')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('user_id', targetUserId)
        .neq('status', 'cancelled')
        .maybeSingle();

    if (!targetReg) {
        throw new Error('User must register for this event before receiving team invites.');
    }

    const { count: memberCount } = await supabase
        .from('event_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active');

    const { data: teamData } = await (supabase as any)
        .from('event_teams')
        .select('max_members, is_recruiting')
        .eq('id', teamId)
        .eq('event_id', eventId)
        .maybeSingle();

    if (!teamData) throw new Error('Team not found for this event.');
    if (!teamData.is_recruiting) throw new Error('Team is not recruiting right now.');
    if ((memberCount ?? 0) >= (teamData.max_members ?? 999)) {
        throw new Error('This team is full.');
    }

    const { data: existingPendingInvite } = await (supabase as any)
        .from('team_requests')
        .select('id')
        .eq('team_id', teamId)
        .eq('event_id', eventId)
        .eq('target_user_id', targetUserId)
        .eq('type', 'invite')
        .eq('status', 'pending')
        .maybeSingle();

    if (existingPendingInvite) {
        throw new Error('Invite already pending for this user.');
    }

    const { data: reqRow, error: reqErr } = await (supabase as any)
        .from('team_requests')
        .insert({
            team_id: teamId,
            event_id: eventId,
            requester_id: leaderId,
            target_user_id: targetUserId,
            type: 'invite',
            status: 'pending',
            message: message ?? null,
        })
        .select('id')
        .single();

    if (reqErr) throw reqErr;

    await (supabase as any)
        .from('notifications')
        .insert({
            user_id: targetUserId,
            type: 'team_invite',
            title: '🎉 Team Invitation',
            body: `You've been invited to join "${teamName}"`,
            related_id: teamId,
            related_type: 'team',
            is_read: false,
            metadata: {
                team_request_id: reqRow.id,
                team_id: teamId,
                event_id: eventId,
            },
        });

    return reqRow.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL INVITE (leader cancels outgoing invite)
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelInvite(params: {
    teamId: string;
    targetUserId: string;
}): Promise<void> {
    const { error } = await (supabase as any)
        .from('team_requests')
        .delete()
        .eq('team_id', params.teamId)
        .eq('target_user_id', params.targetUserId)
        .eq('type', 'invite')
        .eq('status', 'pending');
    if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT JOIN REQUEST (leader accepts a user's join request)
// ─────────────────────────────────────────────────────────────────────────────
export async function acceptJoinRequest(params: {
    requestId: string;
    teamId: string;
    eventId: string;
    targetUserId: string;   // the user who sent the join request
}): Promise<void> {
    const { requestId, teamId, eventId, targetUserId } = params;

    // Verify request still pending and valid
    const { data: reqRow, error: reqLoadError } = await (supabase as any)
        .from('team_requests')
        .select('id, status, requester_id, target_user_id, type, team_id, event_id')
        .eq('id', requestId)
        .maybeSingle();

    if (reqLoadError) throw reqLoadError;
    if (!reqRow || reqRow.status !== 'pending' || reqRow.type !== 'join') {
        throw new Error('This join request is no longer pending.');
    }
    if (reqRow.team_id !== teamId || reqRow.event_id !== eventId || reqRow.requester_id !== targetUserId) {
        throw new Error('Join request does not match the target team/event/user.');
    }

    // Capacity check before accepting
    const { count: memberCount } = await supabase
        .from('event_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active');

    const { data: teamData } = await (supabase as any)
        .from('event_teams')
        .select('max_members')
        .eq('id', teamId)
        .eq('event_id', eventId)
        .maybeSingle();

    if (!teamData) throw new Error('Team not found for this event.');
    if ((memberCount ?? 0) >= (teamData.max_members ?? 999)) {
        throw new Error('This team is full.');
    }

    // Add to event_team_members
    const { data: existing } = await (supabase as any)
        .from('event_team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', targetUserId)
        .maybeSingle();

    if (!existing) {
        const { error: memberErr } = await (supabase as any)
            .from('event_team_members')
            .insert({ team_id: teamId, user_id: targetUserId, role: 'member', status: 'active' });
        if (memberErr) throw memberErr;
    }

    // Update registration team_id AND force status='registered'
    const { error: regErr } = await (supabase as any)
        .from('event_registrations')
        .update({
            team_id: teamId,
            looking_for_team: false,
            status: 'registered' // FORCE STATUS CONSISTENCY
        })
        .eq('event_id', eventId)
        .eq('user_id', targetUserId);
    if (regErr) throw regErr;

    // Mark request accepted
    const { error: reqErr } = await (supabase as any)
        .from('team_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);
    if (reqErr) throw reqErr;

    // Reject other pending join requests by same user in this event
    await (supabase as any)
        .from('team_requests')
        .update({ status: 'rejected' })
        .eq('event_id', eventId)
        .eq('requester_id', targetUserId)
        .eq('type', 'join')
        .eq('status', 'pending')
        .neq('id', requestId);

    // Notify requester
    await (supabase as any)
        .from('notifications')
        .insert({
            user_id: targetUserId,
            type: 'team_request_accepted',
            title: 'Join Request Accepted',
            body: 'Your request to join the team was accepted.',
            related_id: teamId,
            related_type: 'team',
            is_read: false,
            metadata: {
                team_request_id: requestId,
                team_id: teamId,
                event_id: eventId,
            },
        });
}

export async function rejectJoinRequest(params: {
    requestId: string;
    teamId: string;
    eventId: string;
    targetUserId: string;
}): Promise<void> {
    const { requestId, teamId, eventId, targetUserId } = params;

    const { error: reqErr } = await (supabase as any)
        .from('team_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .eq('team_id', teamId)
        .eq('event_id', eventId)
        .eq('requester_id', targetUserId)
        .eq('type', 'join')
        .eq('status', 'pending');

    if (reqErr) throw reqErr;

    await (supabase as any)
        .from('notifications')
        .insert({
            user_id: targetUserId,
            type: 'team_request_rejected',
            title: 'Join Request Rejected',
            body: 'Your request to join the team was rejected. You can send another request later.',
            related_id: teamId,
            related_type: 'team',
            is_read: false,
            metadata: {
                team_request_id: requestId,
                team_id: teamId,
                event_id: eventId,
            },
        });
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK NOTIFICATION READ
// ─────────────────────────────────────────────────────────────────────────────
export async function markNotifRead(notifId: string): Promise<void> {
    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notifId);
}
