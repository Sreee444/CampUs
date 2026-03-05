import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    Animated,
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
    
    const scrollY = useRef(new Animated.Value(0)).current;
    const headerOpacity = scrollY.interpolate({
        inputRange: [0, 100],
        outputRange: [1, 0.8],
        extrapolate: 'clamp',
    });

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
            return (
                <View style={[styles.stateButton, styles.stateSuccess]}>
                    <MaterialIcons name="check-circle" size={16} color="#16a34a" />
                    <Text style={styles.stateSuccessText}>You're in this team</Text>
                </View>
            );
        }

        if (team.my_request_status === 'pending') {
            return (
                <TouchableOpacity
                    style={[styles.stateButton, styles.statePending, disabled && styles.buttonDisabled]}
                    onPress={() => handleCancelRequest(team)}
                    disabled={disabled}
                    activeOpacity={0.8}
                >
                    <MaterialIcons name="schedule" size={16} color="#d97706" />
                    <Text style={styles.statePendingText}>{disabled ? 'Cancelling...' : 'Request Pending · Tap to Cancel'}</Text>
                </TouchableOpacity>
            );
        }

        if (userTeamId && userTeamId !== team.id) {
            return (
                <View style={[styles.stateButton, styles.stateMuted]}>
                    <MaterialIcons name="info" size={16} color="#6b7280" />
                    <Text style={styles.stateMutedText}>Already in a team</Text>
                </View>
            );
        }

        if (!team.is_recruiting || isFull) {
            return (
                <View style={[styles.stateButton, styles.stateMuted]}>
                    <MaterialIcons name="lock" size={16} color="#6b7280" />
                    <Text style={styles.stateMutedText}>{isFull ? 'Team Full' : 'Closed'}</Text>
                </View>
            );
        }

        return (
            <TouchableOpacity
                style={[styles.joinButton, disabled && styles.buttonDisabled]}
                onPress={() => handleRequestJoin(team)}
                disabled={disabled}
                activeOpacity={0.8}
            >
                <LinearGradient
                    colors={['#7c3aed', '#6d28d9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.joinButtonGradient}
                >
                    {disabled ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <MaterialIcons name="person-add" size={16} color="#fff" />
                            <Text style={styles.joinButtonText}>Request to Join</Text>
                        </>
                    )}
                </LinearGradient>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.headerGradient, { opacity: headerOpacity }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
                        <MaterialIcons name="arrow-back" size={22} color="#111827" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Browse Teams</Text>
                        <Text style={styles.headerSub}>{teams.length} team{teams.length !== 1 ? 's' : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={handleRefresh} style={styles.headerIconBtn}>
                        <MaterialIcons name="refresh" size={22} color="#7c3aed" />
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#7c3aed" />
                    <Text style={styles.loadingText}>Loading teams...</Text>
                </View>
            ) : teams.length === 0 ? (
                <View style={styles.centered}>
                    <MaterialIcons name="groups" size={48} color="#c7d2fe" />
                    <Text style={styles.emptyTitle}>No teams yet</Text>
                    <Text style={styles.emptySub}>Create one or join an existing team</Text>
                </View>
            ) : (
                <Animated.ScrollView
                    style={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7c3aed" />}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                    scrollEventThrottle={16}
                >
                    {teams.map((team) => (
                        <TouchableOpacity
                            key={team.id}
                            style={styles.cardWrapper}
                            onPress={() => navigation.navigate('TeamDetails', { teamId: team.id, eventId })}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={['#ffffff', '#f8fafc']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.card}
                            >
                                <View style={styles.cardTop}>
                                    <LinearGradient
                                        colors={['#0ea5e9', '#3b82f6']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.teamIconWrap}
                                    >
                                        <Text style={styles.teamIconText}>{team.name[0]?.toUpperCase()}</Text>
                                    </LinearGradient>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.teamName}>{team.name}</Text>
                                        <View style={styles.teamMetaRow}>
                                            <View style={styles.metaBadge}>
                                                <MaterialIcons name="people" size={12} color="#7c3aed" />
                                                <Text style={styles.metaText}>{team.members_count}/{team.max_members}</Text>
                                            </View>
                                            <View style={styles.metaBadge}>
                                                <MaterialIcons name="person" size={12} color="#f59e0b" />
                                                <Text style={styles.metaText}>{team.leader_name}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {team.required_roles.length > 0 && (
                                    <View style={styles.rolesRow}>
                                        {team.required_roles.slice(0, 3).map((roleId) => {
                                            const role = SKILL_ROLES.find((r) => r.id === roleId);
                                            return (
                                                <LinearGradient
                                                    key={roleId}
                                                    colors={['#f1f5f9', '#e2e8f0']}
                                                    style={styles.rolePill}
                                                >
                                                    <Text style={styles.rolePillIcon}>{role?.icon || '🔧'}</Text>
                                                    <Text style={styles.rolePillText}>{role?.label || roleId}</Text>
                                                </LinearGradient>
                                            );
                                        })}
                                        {team.required_roles.length > 3 && (
                                            <View style={styles.rolePillMore}>
                                                <Text style={styles.rolePillMoreText}>+{team.required_roles.length - 3}</Text>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {renderTeamAction(team)}
                            </LinearGradient>
                        </TouchableOpacity>
                    ))}
                    <View style={{ height: 28 }} />
                </Animated.ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f4f2' },
    headerGradient: {
        paddingTop: 8,
        paddingBottom: 14,
        backgroundColor: '#fff',
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
        backgroundColor: '#f3e8ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    headerSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: '#6b7280', fontSize: 14 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
    emptySub: { fontSize: 13, color: '#6b7280' },
    list: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    
    cardWrapper: {
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    card: {
        paddingHorizontal: 18,
        paddingVertical: 18,
        borderRadius: 18,
        gap: 14,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    cardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    teamIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    teamIconText: { color: '#fff', fontWeight: '800', fontSize: 20 },
    teamName: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
    teamMetaRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    metaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    metaText: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
    
    rolesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    rolePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 8,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: '#cbd5e1',
    },
    rolePillIcon: { fontSize: 12 },
    rolePillText: { color: '#334155', fontSize: 12, fontWeight: '600' },
    rolePillMore: {
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        justifyContent: 'center',
    },
    rolePillMoreText: { color: '#334155', fontSize: 12, fontWeight: '600' },
    
    joinButton: {
        borderRadius: 10,
        overflow: 'hidden',
        height: 44,
    },
    joinButtonGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    joinButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    
    stateButton: {
        height: 44,
        borderRadius: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
    },
    stateSuccess: {
        backgroundColor: '#f0fdf4',
        borderColor: '#bbf7d0',
    },
    statePending: {
        backgroundColor: '#fffbeb',
        borderColor: '#fcd34d',
    },
    stateMuted: {
        backgroundColor: '#f9fafb',
        borderColor: '#e5e7eb',
    },
    stateSuccessText: { color: '#16a34a', fontWeight: '700', fontSize: 13 },
    statePendingText: { color: '#d97706', fontWeight: '700', fontSize: 13 },
    stateMutedText: { color: '#6b7280', fontWeight: '700', fontSize: 13 },
    
    buttonDisabled: { opacity: 0.5 },
});
