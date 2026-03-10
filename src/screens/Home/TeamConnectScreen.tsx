/**
 * TeamConnectScreen (formerly HackathonConnectScreen)
 * Shows participants who are looking for a team in any team-based event.
 * Sorted by Team Compatibility % computed from skill matching.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { SkillRole, SKILL_ROLES } from '../../utils/teamUtils';
import { sortByMatch, ParticipantWithMatch } from '../../utils/matchingUtils';
import { sendInvite } from '../../utils/teamActions';

type TeamConnectScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TeamConnect'>;
type TeamConnectScreenRouteProp = RouteProp<RootStackParamList, 'TeamConnect'>;

export default function TeamConnectScreen() {
    const navigation = useNavigation<TeamConnectScreenNavigationProp>();
    const route = useRoute<TeamConnectScreenRouteProp>();
    const { profile, user } = useAuth();

    const { eventId, requiredRoles, teamId } = route.params;

    const [activeTab, setActiveTab] = useState<'looking' | 'all'>('looking');
    const [participants, setParticipants] = useState<ParticipantWithMatch[]>([]);
    const [filterTab, setFilterTab] = useState<'all' | 'best' | 'dept'>('all');
    const [onlyLooking, setOnlyLooking] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
    const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());

    const castRoles = (requiredRoles ?? []) as SkillRole[];

    const loadParticipants = useCallback(async () => {
        try {
            setIsLoading(true);

            let raw = [];

            if (activeTab === 'looking') {
                // "Looking for Team" tab: only registered users looking for team without a team
                let query = supabase
                    .from('event_registrations')
                    .select(`
                      user_id,
                      looking_for_team,
                      team_id,
                      profile:profiles!event_registrations_user_id_fkey(
                        id,
                        full_name,
                        avatar_url,
                        department,
                        year,
                        skills
                      )
                    `)
                    .eq('event_id', eventId)
                    .eq('looking_for_team', true)
                    .is('team_id', null);

                const { data, error } = await query as any;
                if (error) throw error;

                raw = ((data as any[]) ?? []).map((item: any) => ({
                    id: item.profile?.id ?? item.user_id,
                    full_name: item.profile?.full_name,
                    avatar_url: item.profile?.avatar_url,
                    department: item.profile?.department,
                    year: item.profile?.year,
                    skills: item.profile?.skills ?? [],
                    is_looking_for_team: item.looking_for_team,
                }));
            } else {
                // "All Eligible" tab: all users in the app (registered or not) who don't have a team
                const { data: allUsers, error: usersError } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url, department, year, skills')
                    .not('id', 'in', '(select user_id from event_team_members)')
                    .not('id', 'in', '(select user_id from event_registrations where team_id is not null and event_id = ' + "'" + eventId + "'" + ')') as any;

                if (usersError) {
                    // Fallback: fetch all profiles without complex filtering
                    const { data: fallbackUsers, error: fallbackError } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar_url, department, year, skills') as any;
                    
                    if (fallbackError) throw fallbackError;
                    
                    // Filter out users who have a team_id in this event
                    const { data: teamMembers } = await (supabase as any)
                        .from('event_team_members')
                        .select(`
                            user_id,
                            team:event_teams!inner(
                                id,
                                event_id
                            )
                        `)
                        .eq('team.event_id', eventId)
                        .eq('status', 'active');
                    
                    const { data: registeredWithTeam } = await (supabase as any)
                        .from('event_registrations')
                        .select('user_id')
                        .eq('event_id', eventId)
                        .not('team_id', 'is', null);
                    
                    const teamUserIds = new Set([
                        ...(teamMembers?.map((m: any) => m.user_id) ?? []),
                        ...(registeredWithTeam?.map((r: any) => r.user_id) ?? []),
                    ]);
                    
                    const { data: lookingRegs } = await (supabase as any)
                        .from('event_registrations')
                        .select('user_id')
                        .eq('event_id', eventId)
                        .eq('looking_for_team', true);

                    const lookingIds = new Set((lookingRegs ?? []).map((r: any) => r.user_id));

                    raw = ((fallbackUsers as any[]) ?? [])
                        .filter((user: any) => !teamUserIds.has(user.id))
                        .map((user: any) => ({
                            id: user.id,
                            full_name: user.full_name,
                            avatar_url: user.avatar_url,
                            department: user.department,
                            year: user.year,
                            skills: user.skills ?? [],
                            is_looking_for_team: lookingIds.has(user.id),
                        }));
                } else {
                    const { data: lookingRegs } = await (supabase as any)
                        .from('event_registrations')
                        .select('user_id')
                        .eq('event_id', eventId)
                        .eq('looking_for_team', true);

                    const lookingIds = new Set((lookingRegs ?? []).map((r: any) => r.user_id));

                    raw = ((allUsers as any[]) ?? []).map((user: any) => ({
                        id: user.id,
                        full_name: user.full_name,
                        avatar_url: user.avatar_url,
                        department: user.department,
                        year: user.year,
                        skills: user.skills ?? [],
                        is_looking_for_team: lookingIds.has(user.id),
                    }));
                }
            }

            const sorted = sortByMatch(raw, castRoles);
            setParticipants(sorted);

            // Load existing invitations if teamId is provided
            if (teamId) {
                const { data: invitesData } = await (supabase as any)
                    .from('team_requests')
                    .select('target_user_id')
                    .eq('team_id', teamId)
                    .eq('event_id', eventId)
                    .eq('type', 'invite')
                    .eq('status', 'pending');
                
                if (invitesData) {
                    const invitedIds = new Set<string>(invitesData.map((inv: any) => inv.target_user_id).filter(Boolean));
                    setInvitedUserIds(invitedIds);
                }
            }
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to load participants', text2: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [eventId, teamId, activeTab, castRoles]);

    useEffect(() => {
        loadParticipants();
    }, [loadParticipants, activeTab]);

    const getMatchColor = (pct: number) => {
        if (pct >= 75) return '#10b981';
        if (pct >= 40) return '#f59e0b';
        return '#6b7280';
    };

    const filteredParticipants = useMemo(() => {
        let list = participants;
        if (filterTab === 'best') {
            list = list.slice(0, 10);
        }
        if (filterTab === 'dept' && profile?.department) {
            const dept = profile.department.toLowerCase().trim();
            list = list.filter((p) => (p.department || '').toLowerCase().trim() === dept);
        }
        if (onlyLooking) {
            list = list.filter((p) => p.is_looking_for_team);
        }
        return list;
    }, [participants, filterTab, profile?.department, onlyLooking]);

    const handleInviteUser = async (userId: string) => {
        if (!teamId || !user?.id) return;
        try {
            setInvitingUserId(userId);
            const { data: teamData } = await (supabase as any)
                .from('event_teams')
                .select('name')
                .eq('id', teamId)
                .maybeSingle();

            await sendInvite({
                teamId,
                eventId,
                leaderId: user.id,
                targetUserId: userId,
                teamName: teamData?.name || 'Your Team',
            });
            setInvitedUserIds((prev) => new Set([...prev, userId]));
            Toast.show({ type: 'success', text1: 'Invitation sent' });
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to send invitation', text2: err?.message || 'Try again' });
        } finally {
            setInvitingUserId(null);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color="#111827" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Find Teammates</Text>
                    <Text style={styles.headerSubtitle}>
                        {filteredParticipants.length} user{filteredParticipants.length !== 1 ? 's' : ''} available
                    </Text>
                </View>
                <TouchableOpacity onPress={loadParticipants}>
                    <MaterialIcons name="refresh" size={22} color="#6366f1" />
                </TouchableOpacity>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'looking' && styles.tabActive]}
                    onPress={() => setActiveTab('looking')}
                >
                    <MaterialIcons 
                        name="search" 
                        size={18} 
                        color={activeTab === 'looking' ? '#6366f1' : '#9ca3af'} 
                    />
                    <Text style={[styles.tabText, activeTab === 'looking' && styles.tabTextActive]}>
                        Looking for Team
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'all' && styles.tabActive]}
                    onPress={() => setActiveTab('all')}
                >
                    <MaterialIcons 
                        name="people" 
                        size={18} 
                        color={activeTab === 'all' ? '#6366f1' : '#9ca3af'} 
                    />
                    <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
                        All Eligible
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Filters */}
            <View style={styles.filterBar}>
                <TouchableOpacity
                    style={[styles.filterChip, filterTab === 'all' && styles.filterChipActive]}
                    onPress={() => setFilterTab('all')}
                >
                    <Text style={[styles.filterText, filterTab === 'all' && styles.filterTextActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterChip, filterTab === 'best' && styles.filterChipActive]}
                    onPress={() => setFilterTab('best')}
                >
                    <Text style={[styles.filterText, filterTab === 'best' && styles.filterTextActive]}>Best match</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterChip, filterTab === 'dept' && styles.filterChipActive]}
                    onPress={() => setFilterTab('dept')}
                >
                    <Text style={[styles.filterText, filterTab === 'dept' && styles.filterTextActive]}>Same dept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterChip, onlyLooking && styles.filterChipActive]}
                    onPress={() => setOnlyLooking((prev) => !prev)}
                >
                    <Text style={[styles.filterText, onlyLooking && styles.filterTextActive]}>
                        Looking only
                    </Text>
                </TouchableOpacity>
            </View>
            {filterTab === 'dept' && !profile?.department && (
                <Text style={styles.filterHint}>Set your department to filter by department.</Text>
            )}

            {/* Required Roles Banner */}
            {castRoles.length > 0 && (
                <View style={styles.rolesBanner}>
                    <Text style={styles.rolesBannerLabel}>Matching against: </Text>
                    {castRoles.map((roleId) => {
                        const info = SKILL_ROLES.find((r) => r.id === roleId);
                        return (
                            <View key={roleId} style={[styles.bannerChip, { borderColor: info?.color ?? '#6b7280' }]}>
                                <Text style={styles.bannerChipText}>{info?.icon} {info?.label ?? roleId}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#6366f1" />
                    <Text style={styles.loadingText}>Finding teammates…</Text>
                </View>
            ) : filteredParticipants.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyEmoji}>🤝</Text>
                    <Text style={styles.emptyTitle}>
                        {activeTab === 'looking' ? 'No one looking yet' : 'No eligible users yet'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                        {activeTab === 'looking' 
                            ? 'Be the first to toggle "Looking for Team" in the event page!'
                            : 'Users will appear here as they register for the event'}
                    </Text>
                </View>
            ) : (
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                    {filteredParticipants.map((p) => {
                        const matchColor = getMatchColor(p.match.percentage);
                        return (
                            <TouchableOpacity 
                                key={p.id} 
                                style={styles.card}
                                activeOpacity={0.65}
                                onPress={() => navigation.navigate('PublicProfile', { userId: p.id })}
                            >
                                {/* Top Row: Avatar + Info + Compatibility */}
                                <View style={styles.cardTop}>
                                    {p.avatar_url ? (
                                        <Image source={{ uri: p.avatar_url }} style={styles.avatar} />
                                    ) : (
                                        <View style={styles.avatarFallback}>
                                            <Text style={styles.avatarInitial}>
                                                {(p.full_name ?? 'U')[0].toUpperCase()}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.cardInfo}>
                                        <Text style={styles.cardName}>{p.full_name ?? 'Anonymous'}</Text>
                                        <Text style={styles.cardMeta}>
                                            {[p.department, p.year ? `Year ${p.year}` : null]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Text>
                                    </View>

                                    {/* Team Compatibility % Ring */}
                                    <View style={[styles.matchBadge, { borderColor: matchColor }]}>
                                        <Text style={[styles.matchPct, { color: matchColor }]}>
                                            {p.match.percentage}%
                                        </Text>
                                        <Text style={styles.matchLabel}>compat.</Text>
                                    </View>
                                </View>

                                {/* Skill Tags */}
                                {p.match.detectedRoles.length > 0 && (
                                    <View style={styles.skillsRow}>
                                        {p.match.detectedRoles.map((roleId) => {
                                            const info = SKILL_ROLES.find((r) => r.id === roleId);
                                            return (
                                                <View
                                                    key={roleId}
                                                    style={[styles.skillChip, { backgroundColor: `${info?.color ?? '#6b7280'}18` }]}
                                                >
                                                    <Text style={[styles.skillChipText, { color: info?.color ?? '#6b7280' }]}>
                                                        {info?.icon} {info?.label ?? roleId}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* Match Reasons */}
                                {p.match.reasons.length > 0 && (
                                    <View style={styles.reasonsContainer}>
                                        {p.match.reasons.slice(0, 2).map((reason, i) => (
                                            <Text key={i} style={styles.reasonText}>{reason}</Text>
                                        ))}
                                    </View>
                                )}

                                {/* Invite Button (only if teamId is provided) */}
                                {teamId && (
                                    <TouchableOpacity
                                        style={[
                                            styles.inviteButton, 
                                            (invitingUserId === p.id || invitedUserIds.has(p.id)) && styles.inviteButtonDisabled
                                        ]}
                                        onPress={() => handleInviteUser(p.id)}
                                        disabled={invitingUserId === p.id || invitedUserIds.has(p.id)}
                                    >
                                        {invitingUserId === p.id ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : invitedUserIds.has(p.id) ? (
                                            <>
                                                <MaterialIcons name="check" size={18} color="#fff" />
                                                <Text style={styles.inviteButtonText}>Invited</Text>
                                            </>
                                        ) : (
                                            <>
                                                <MaterialIcons name="person-add" size={18} color="#fff" />
                                                <Text style={styles.inviteButtonText}>Invite to Team</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        gap: 12,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
    headerSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 6,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: '#6366f1',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9ca3af',
    },
    tabTextActive: {
        color: '#6366f1',
    },
    filterBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    filterChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#f9fafb',
    },
    filterChipActive: {
        backgroundColor: '#eef2ff',
        borderColor: '#c7d2fe',
    },
    filterText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
    },
    filterTextActive: {
        color: '#4f46e5',
    },
    filterHint: {
        fontSize: 12,
        color: '#9ca3af',
        paddingHorizontal: 20,
        paddingBottom: 6,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    rolesBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    rolesBannerLabel: { fontSize: 12, color: '#9ca3af' },
    bannerChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        borderWidth: 1,
    },
    bannerChipText: { fontSize: 11, fontWeight: '600', color: '#374151' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    loadingText: { fontSize: 14, color: '#9ca3af', marginTop: 8 },
    emptyEmoji: { fontSize: 52, marginBottom: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
    emptySubtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 32 },
    list: { flex: 1, padding: 16 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
        gap: 10,
        overflow: 'hidden',
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 23 },
    avatarFallback: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#6366f1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 18 },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    cardMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
    matchBadge: {
        width: 58,
        height: 58,
        borderRadius: 29,
        borderWidth: 2.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    matchPct: { fontSize: 14, fontWeight: '800' },
    matchLabel: { fontSize: 9, color: '#9ca3af', marginTop: -1 },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    skillChip: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 20,
    },
    skillChipText: { fontSize: 11, fontWeight: '600' },
    reasonsContainer: { gap: 3 },
    reasonText: { fontSize: 12, color: '#6b7280' },
    inviteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#7c3aed',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        marginTop: 12,
        marginHorizontal: -16,
        marginBottom: -16,
        marginLeft: -16,
        marginRight: -16,
        paddingLeft: 16,
        paddingRight: 16,
    },
    inviteButtonDisabled: {
        backgroundColor: '#a78bfa',
    },
    inviteButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
});
