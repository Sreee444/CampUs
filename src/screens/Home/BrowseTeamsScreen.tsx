import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { SKILL_ROLES } from '../../utils/teamUtils';
import { sendJoinRequest, cancelJoinRequest } from '../../utils/teamActions';

type BrowseTeamsNavProp = StackNavigationProp<RootStackParamList, 'BrowseTeams'>;
type BrowseTeamsRouteProp = RouteProp<RootStackParamList, 'BrowseTeams'>;

interface TeamItem {
    id: string;
    name: string;
    team_code: string;
    required_roles: string[];
    max_members: number;
    is_recruiting: boolean;
    members_count: number;
    my_request_status: 'none' | 'pending' | 'accepted' | 'rejected';
    my_request_id: string | null;
    i_am_member: boolean;
}

export default function BrowseTeamsScreen() {
    const navigation = useNavigation<BrowseTeamsNavProp>();
    const route = useRoute<BrowseTeamsRouteProp>();
    const { user } = useAuth();
    const { eventId } = route.params;

    const [teams, setTeams] = useState<TeamItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userHasTeam, setUserHasTeam] = useState(false);
    const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);

    const loadTeams = useCallback(async () => {
        try {
            // Fetch all recruiting teams for the event
            const { data: teamsData, error } = await supabase
                .from('event_teams')
                .select('id, name, team_code, required_roles, max_members, is_recruiting')
                .eq('event_id', eventId)
                .order('name');

            if (error) throw error;
            const teamList = (teamsData as any[]) ?? [];
            const teamIds = teamList.map((t: any) => t.id);

            if (teamIds.length === 0) { setTeams([]); return; }

            // Active member counts from event_team_members
            const { data: membersData } = await supabase
                .from('event_team_members')
                .select('team_id, user_id, status')
                .in('team_id', teamIds)
                .eq('status', 'active');

            const membersList = (membersData as any[]) ?? [];

            // Check if current user already has a team via event_registrations (source of truth)
            const { data: myReg } = await (supabase as any)
                .from('event_registrations')
                .select('team_id')
                .eq('event_id', eventId)
                .eq('user_id', user?.id ?? '')
                .eq('status', 'registered')
                .maybeSingle();
            const myTeamId = myReg?.team_id ?? null;
            setUserHasTeam(myTeamId !== null);

            // Fetch MY pending join requests from team_requests (not team_join_requests!)
            const { data: myRequests } = await (supabase as any)
                .from('team_requests')
                .select('id, team_id, status, type')
                .eq('event_id', eventId)
                .eq('requester_id', user?.id ?? '')
                .eq('type', 'join')
                .eq('status', 'pending');

            const myRequestMap: Record<string, { id: string; status: string }> = {};
            ((myRequests as any[]) ?? []).forEach((r: any) => {
                myRequestMap[r.team_id] = { id: r.id, status: r.status };
            });

            const enriched: TeamItem[] = teamList.map((t: any) => {
                const count = membersList.filter((m: any) => m.team_id === t.id).length;
                const isMember = t.id === myTeamId; // member iff their registration points here
                const req = myRequestMap[t.id];
                const reqStatus = req ? 'pending' : 'none';
                return {
                    id: t.id,
                    name: t.name,
                    team_code: t.team_code,
                    required_roles: t.required_roles ?? [],
                    max_members: t.max_members ?? 5,
                    is_recruiting: t.is_recruiting ?? true,
                    members_count: count,
                    my_request_status: reqStatus as TeamItem['my_request_status'],
                    my_request_id: req?.id ?? null,
                    i_am_member: isMember,
                };
            });

            setTeams(enriched);
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to load teams', text2: err.message });
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [eventId, user?.id]);

    // Reload on every focus — catches state changes from other screens
    useFocusEffect(
        useCallback(() => { loadTeams(); }, [eventId, user?.id])
    );

    const handleRefresh = () => { setRefreshing(true); loadTeams(); };

    const handleRequestJoin = async (team: TeamItem) => {
        if (!user?.id) return;
        try {
            setJoiningTeamId(team.id);
            await sendJoinRequest({ teamId: team.id, eventId, userId: user.id, teamName: team.name });
            Toast.show({ type: 'success', text1: '✅ Request sent!', text2: 'Wait for the team leader to accept' });
            loadTeams();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Request failed', text2: err.message });
        } finally {
            setJoiningTeamId(null);
        }
    };

    const handleCancelRequest = async (team: TeamItem) => {
        if (!user?.id) return;
        try {
            setJoiningTeamId(team.id);
            await cancelJoinRequest({ teamId: team.id, requesterId: user.id, eventId });
            Toast.show({ type: 'info', text1: 'Request cancelled' });
            loadTeams();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to cancel', text2: err.message });
        } finally {
            setJoiningTeamId(null);
        }
    };

    const getRequestButton = (team: TeamItem) => {
        const isLoading = joiningTeamId === team.id;

        if (team.i_am_member) {
            return (
                <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() => navigation.navigate('TeamDetails', { teamId: team.id, eventId })}
                >
                    <MaterialIcons name="group" size={16} color="#6366f1" />
                    <Text style={styles.viewBtnText}>My Team</Text>
                </TouchableOpacity>
            );
        }

        if (userHasTeam) {
            return (
                <View style={styles.inTeamBadge}>
                    <Text style={styles.inTeamBadgeText}>Already in a team</Text>
                </View>
            );
        }

        if (team.my_request_status === 'pending') {
            return (
                <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => handleCancelRequest(team)}
                    disabled={isLoading}
                >
                    {isLoading
                        ? <ActivityIndicator size="small" color="#6b7280" />
                        : <Text style={styles.cancelBtnText}>⏳ Pending — Cancel</Text>}
                </TouchableOpacity>
            );
        }

        if (team.my_request_status === 'rejected') {
            return (
                <View style={styles.rejectedBadge}>
                    <Text style={styles.rejectedText}>Request declined</Text>
                </View>
            );
        }

        if (!team.is_recruiting || team.members_count >= team.max_members) {
            return (
                <View style={styles.fullBadge}>
                    <Text style={styles.fullBadgeText}>{team.members_count >= team.max_members ? 'Full' : 'Closed'}</Text>
                </View>
            );
        }

        return (
            <TouchableOpacity
                style={styles.requestBtn}
                onPress={() => handleRequestJoin(team)}
                disabled={isLoading}
            >
                {isLoading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <MaterialIcons name="person-add" size={16} color="#fff" />
                        <Text style={styles.requestBtnText}>Request to Join</Text>
                    </>}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color="#111827" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Browse Teams</Text>
                    <Text style={styles.headerSub}>{teams.length} team{teams.length !== 1 ? 's' : ''} available</Text>
                </View>
                <TouchableOpacity onPress={handleRefresh}>
                    <MaterialIcons name="refresh" size={22} color="#6366f1" />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#6366f1" />
                    <Text style={styles.loadingText}>Loading teams…</Text>
                </View>
            ) : teams.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyEmoji}>🏗️</Text>
                    <Text style={styles.emptyTitle}>No teams yet</Text>
                    <Text style={styles.emptySub}>Be the first to create a team!</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" />}
                >
                    {teams.map((team) => {
                        const spotsLeft = team.max_members - team.members_count;
                        return (
                            <View key={team.id} style={styles.card}>
                                {/* Team header row */}
                                <View style={styles.cardTop}>
                                    <View style={styles.teamIconWrap}>
                                        <Text style={styles.teamIconText}>{team.name[0]?.toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.cardInfo}>
                                        <Text style={styles.teamName}>{team.name}</Text>
                                        <Text style={styles.teamCode}>Code: {team.team_code}</Text>
                                    </View>
                                    {/* Status dot */}
                                    <View style={[styles.statusDot,
                                    { backgroundColor: team.is_recruiting && spotsLeft > 0 ? '#10b981' : '#ef4444' }
                                    ]} />
                                </View>

                                {/* Stats */}
                                <View style={styles.statsRow}>
                                    <MaterialIcons name="people" size={14} color="#6b7280" />
                                    <Text style={styles.statText}>
                                        {team.members_count}/{team.max_members} members
                                    </Text>
                                    {spotsLeft > 0 && team.is_recruiting && (
                                        <View style={styles.spotsBadge}>
                                            <Text style={styles.spotsBadgeText}>{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Required roles */}
                                {team.required_roles.length > 0 && (
                                    <View style={styles.rolesRow}>
                                        {team.required_roles.map((roleId) => {
                                            const info = SKILL_ROLES.find((r) => r.id === roleId);
                                            return (
                                                <View
                                                    key={roleId}
                                                    style={[styles.roleChip, { borderColor: info?.color ?? '#6b7280' }]}
                                                >
                                                    <Text style={[styles.roleChipText, { color: info?.color ?? '#6b7280' }]}>
                                                        {info?.icon} {info?.label ?? roleId}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* Action button */}
                                <View style={styles.cardAction}>
                                    {getRequestButton(team)}
                                </View>
                            </View>
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
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        gap: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    headerSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    loadingText: { color: '#9ca3af', fontSize: 14 },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
    emptySub: { fontSize: 13, color: '#9ca3af' },
    list: { flex: 1, padding: 16 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    teamIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#6366f1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    teamIconText: { color: '#fff', fontWeight: '800', fontSize: 18 },
    cardInfo: { flex: 1 },
    teamName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    teamCode: { fontSize: 12, color: '#9ca3af', marginTop: 2, fontFamily: 'monospace' },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statText: { fontSize: 13, color: '#6b7280', flex: 1 },
    spotsBadge: {
        backgroundColor: '#d1fae5',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    spotsBadgeText: { fontSize: 11, color: '#059669', fontWeight: '600' },
    rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    roleChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: '#f9fafb',
    },
    roleChipText: { fontSize: 11, fontWeight: '600' },
    cardAction: { marginTop: 2 },
    requestBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#6366f1',
        borderRadius: 12,
        paddingVertical: 11,
    },
    requestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    viewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#eef2ff',
        borderRadius: 12,
        paddingVertical: 11,
        borderWidth: 1,
        borderColor: '#c7d2fe',
    },
    viewBtnText: { color: '#6366f1', fontWeight: '700', fontSize: 14 },
    cancelBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingVertical: 11,
    },
    cancelBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
    inTeamBadge: {
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingVertical: 10,
    },
    inTeamBadgeText: { color: '#9ca3af', fontSize: 13 },
    rejectedBadge: {
        alignItems: 'center',
        backgroundColor: '#fef2f2',
        borderRadius: 12,
        paddingVertical: 10,
    },
    rejectedText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
    fullBadge: {
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingVertical: 10,
    },
    fullBadgeText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
});
