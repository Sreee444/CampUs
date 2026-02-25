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
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { SKILL_ROLES } from '../../utils/teamUtils';
import { loadMyTeamState, sendJoinRequest, cancelJoinRequest } from '../../utils/teamActions';

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
    leader_name: string;
    my_request_status: 'none' | 'pending';
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
    const [userTeamId, setUserTeamId] = useState<string | null>(null);
    const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);

    const loadTeams = useCallback(async () => {
        if (!user?.id) return;
        try {
            const myState = await loadMyTeamState(eventId, user.id);
            setUserTeamId(myState.userTeamId ?? null);

            const { data: teamsData, error } = await (supabase as any)
                .from('event_teams')
                .select('id, name, team_code, required_roles, max_members, is_recruiting, leader_id')
                .eq('event_id', eventId)
                .order('name');

            if (error) throw error;
            const teamList = (teamsData as any[]) ?? [];
            const teamIds = teamList.map((t: any) => t.id);
            const leaderIds = Array.from(new Set(teamList.map((t: any) => t.leader_id).filter(Boolean)));

            if (teamIds.length === 0) {
                setTeams([]);
                return;
            }

            const [{ data: membersData }, { data: myRequests }, { data: leadersData }] = await Promise.all([
                (supabase as any)
                    .from('event_team_members')
                    .select('team_id')
                    .in('team_id', teamIds)
                    .eq('status', 'active'),
                (supabase as any)
                    .from('team_requests')
                    .select('id, team_id')
                    .eq('event_id', eventId)
                    .eq('requester_id', user.id)
                    .eq('type', 'join')
                    .eq('status', 'pending'),
                leaderIds.length > 0
                    ? (supabase as any)
                        .from('profiles')
                        .select('id, full_name')
                        .in('id', leaderIds)
                    : Promise.resolve({ data: [] }),
            ]);

            const membersList = (membersData as any[]) ?? [];
            const requestMap: Record<string, string> = {};
            ((myRequests as any[]) ?? []).forEach((r: any) => {
                requestMap[r.team_id] = r.id;
            });

            const leaderMap: Record<string, string> = {};
            ((leadersData as any[]) ?? []).forEach((leader: any) => {
                leaderMap[leader.id] = leader.full_name || 'Unknown leader';
            });

            const enriched: TeamItem[] = teamList.map((team: any) => {
                const count = membersList.filter((m: any) => m.team_id === team.id).length;
                return {
                    id: team.id,
                    name: team.name,
                    team_code: team.team_code,
                    required_roles: team.required_roles ?? [],
                    max_members: team.max_members ?? 5,
                    is_recruiting: team.is_recruiting ?? true,
                    members_count: count,
                    leader_name: leaderMap[team.leader_id] || 'Unknown leader',
                    my_request_status: requestMap[team.id] ? 'pending' : 'none',
                    my_request_id: requestMap[team.id] ?? null,
                    i_am_member: (myState.userTeamId ?? null) === team.id,
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

    useFocusEffect(
        useCallback(() => {
            loadTeams();
        }, [loadTeams])
    );

    const handleRefresh = () => {
        setRefreshing(true);
        loadTeams();
    };

    const handleRequestJoin = async (team: TeamItem) => {
        if (!user?.id) return;
        try {
            setJoiningTeamId(team.id);
            await sendJoinRequest({ teamId: team.id, eventId, userId: user.id, teamName: team.name });
            setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, my_request_status: 'pending' } : t)));
            Toast.show({ type: 'success', text1: 'Request sent' });
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
            setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, my_request_status: 'none', my_request_id: null } : t)));
            Toast.show({ type: 'info', text1: 'Request cancelled' });
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to cancel', text2: err.message });
        } finally {
            setJoiningTeamId(null);
        }
    };

    const renderTeamAction = (team: TeamItem) => {
        const disabled = joiningTeamId === team.id;
        const isFull = team.members_count >= team.max_members;

        if (team.i_am_member) {
            return <Text style={styles.inTeamText}>You are in this team</Text>;
        }

        if (team.my_request_status === 'pending') {
            return (
                <TouchableOpacity
                    style={[styles.outlineDangerButton, disabled && styles.buttonDisabled]}
                    onPress={() => handleCancelRequest(team)}
                    disabled={disabled}
                >
                    <Text style={styles.outlineDangerButtonText}>
                        {disabled ? 'Cancelling...' : 'Cancel Request'}
                    </Text>
                </TouchableOpacity>
            );
        }

        if (userTeamId && userTeamId !== team.id) {
            return (
                <View style={[styles.outlineButton, styles.buttonDisabled]}>
                    <Text style={styles.outlineButtonText}>Already in a Team</Text>
                </View>
            );
        }

        if (!team.is_recruiting || isFull) {
            return (
                <View style={[styles.outlineButton, styles.buttonDisabled]}>
                    <Text style={styles.outlineButtonText}>{isFull ? 'Team Full' : 'Closed'}</Text>
                </View>
            );
        }

        return (
            <TouchableOpacity
                style={[styles.primaryButton, disabled && styles.buttonDisabled]}
                onPress={() => handleRequestJoin(team)}
                disabled={disabled}
            >
                {disabled
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.primaryButtonText}>Request to Join</Text>}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#dff8f0', '#f2eefc']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
                        <MaterialIcons name="arrow-back" size={22} color="#111827" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Browse Teams</Text>
                        <Text style={styles.headerSub}>{teams.length} team{teams.length !== 1 ? 's' : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={handleRefresh} style={styles.headerIconBtn}>
                        <MaterialIcons name="refresh" size={22} color="#6366f1" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#6366f1" />
                    <Text style={styles.loadingText}>Loading teams...</Text>
                </View>
            ) : teams.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>No teams yet</Text>
                    <Text style={styles.emptySub}>Be the first to create one.</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" />}
                >
                    {teams.map((team) => (
                        <View key={team.id} style={styles.card}>
                            <View style={styles.cardTop}>
                                <View style={styles.teamIconWrap}>
                                    <Text style={styles.teamIconText}>{team.name[0]?.toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.teamName}>{team.name}</Text>
                                    <Text style={styles.teamMeta}>{team.members_count} / {team.max_members} members</Text>
                                    <Text style={styles.teamMeta}>Leader: {team.leader_name}</Text>
                                </View>
                            </View>

                            {team.required_roles.length > 0 && (
                                <View style={styles.rolesRow}>
                                    {team.required_roles.map((roleId) => {
                                        const role = SKILL_ROLES.find((r) => r.id === roleId);
                                        return (
                                            <View key={roleId} style={styles.rolePill}>
                                                <Text style={styles.rolePillText}>{role?.label || roleId}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}

                            {renderTeamAction(team)}
                        </View>
                    ))}
                    <View style={{ height: 28 }} />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f4f2' },
    headerGradient: {
        paddingTop: 8,
        paddingBottom: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    headerIconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    headerSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    loadingText: { color: '#6b7280', fontSize: 14 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
    emptySub: { fontSize: 13, color: '#6b7280' },
    list: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
    card: {
        backgroundColor: '#fffdfb',
        borderRadius: 20,
        padding: 20,
        marginBottom: 18,
        gap: 12,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    teamIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#e9d5ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    teamIconText: { color: '#7c3aed', fontWeight: '800', fontSize: 15 },
    teamName: { fontSize: 17, fontWeight: '800', color: '#111827' },
    teamMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    rolePill: {
        backgroundColor: '#f1f5f9',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    rolePillText: { color: '#4f46e5', fontSize: 12, fontWeight: '600' },
    primaryButton: {
        backgroundColor: '#13ecec',
        borderRadius: 28,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: { color: '#062b2b', fontWeight: '700', fontSize: 15 },
    outlineButton: {
        borderWidth: 1.5,
        borderColor: '#6366f1',
        borderRadius: 28,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.65)',
    },
    outlineButtonText: { color: '#6366f1', fontWeight: '700', fontSize: 15 },
    outlineDangerButton: {
        borderWidth: 1.5,
        borderColor: '#ef4444',
        borderRadius: 28,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.65)',
    },
    outlineDangerButtonText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
    buttonDisabled: { opacity: 0.6 },
    inTeamText: {
        color: '#16a34a',
        fontWeight: '700',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 4,
    },
});
