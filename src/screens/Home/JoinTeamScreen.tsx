import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../api/supabase';
import TeamCard, { TeamCardData } from '../../components/TeamCard';

type NavProp = StackNavigationProp<RootStackParamList, 'JoinTeam'>;
type RouteProps = RouteProp<RootStackParamList, 'JoinTeam'>;

export default function JoinTeamScreen() {
    const navigation = useNavigation<NavProp>();
    const route = useRoute<RouteProps>();
    const { eventId } = route.params;

    const [code, setCode] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [foundTeam, setFoundTeam] = useState<any>(null);
    const [membersCount, setMembersCount] = useState(0);
    const [alreadyMember, setAlreadyMember] = useState(false);

    // 🔎 SEARCH TEAM
    const handleSearch = async () => {
        if (!code.trim()) {
            Toast.show({ type: 'error', text1: 'Enter a team code' });
            return;
        }

        try {
            setIsSearching(true);
            setFoundTeam(null);

            const { data, error } = await supabase
                .from('event_teams')
                .select('*')
                .eq('team_code', code.trim().toUpperCase())
                .eq('event_id', eventId)
                .single();

            if (error || !data) {
                Toast.show({
                    type: 'error',
                    text1: 'Team not found',
                    text2: 'Check the code and try again',
                });
                return;
            }

            // 🔢 Accurate Member Count
            const { count } = await (supabase as any)
                .from('event_team_members')
                .select('*', { count: 'exact', head: true })
                .eq('team_id', (data as any).id)
                .eq('status', 'active');

            // Check if current user already in team
            const {
                data: { user: authUser },
            } = await supabase.auth.getUser();

            const { data: existing } = await (supabase as any)
                .from('event_team_members')
                .select(`
                    id,
                    team_id,
                    team:event_teams!inner(
                        id,
                        event_id
                    )
                `)
                .eq('user_id', authUser?.id)
                .eq('status', 'active')
                .eq('team.event_id', eventId)
                .limit(1)
                .maybeSingle();

            setFoundTeam(data);
            setMembersCount(count ?? 0);
            setAlreadyMember(!!existing);
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Search failed', text2: err.message });
        } finally {
            setIsSearching(false);
        }
    };

    // 🚀 JOIN TEAM
    const handleJoin = async () => {
        if (!foundTeam) return;

        try {
            setIsJoining(true);

            const {
                data: { user: authUser },
            } = await supabase.auth.getUser();

            if (!authUser) {
                Alert.alert('Authentication Required');
                return;
            }

            // 1️⃣ REGISTRATION CHECK
            const { data: regRow } = await (supabase as any)
                .from('event_registrations')
                .select('id, team_id')
                .eq('event_id', eventId)
                .eq('user_id', authUser.id)
                .single();

            if (!regRow) {
                Alert.alert(
                    'Registration Required',
                    'Please register for this event first.'
                );
                return;
            }

            if (regRow.team_id) {
                Alert.alert('Already in a Team');
                return;
            }

            const { data: scopedMembership, error: scopedMembershipError } = await (supabase as any)
                .from('event_team_members')
                .select(`
                    id,
                    team_id,
                    team:event_teams!inner(
                        id,
                        event_id
                    )
                `)
                .eq('user_id', authUser.id)
                .eq('status', 'active')
                .eq('team.event_id', eventId)
                .limit(1)
                .maybeSingle();

            if (scopedMembershipError) throw scopedMembershipError;
            if (scopedMembership) {
                Alert.alert('Already in a Team', 'You are already in a team for this event.');
                return;
            }

            // 2️⃣ FRESH MEMBER COUNT
            const { count: freshCount } = await supabase
                .from('event_team_members')
                .select('*', { count: 'exact', head: true })
                .eq('team_id', foundTeam.id)
                .eq('status', 'active');

            if ((freshCount ?? 0) >= foundTeam.max_members) {
                Toast.show({ type: 'error', text1: 'Team is full' });
                return;
            }

            // 3️⃣ DUPLICATE MEMBER CHECK
            const { data: existingMember } = await supabase
                .from('event_team_members')
                .select('id')
                .eq('team_id', foundTeam.id)
                .eq('user_id', authUser.id)
                .maybeSingle();

            if (existingMember) {
                Toast.show({ type: 'error', text1: 'Already a member' });
                return;
            }

            // 4️⃣ INSERT MEMBER
            const { error: insertError } = await supabase
                .from('event_team_members')
                .insert({
                    team_id: foundTeam.id,
                    user_id: authUser.id,
                    role: 'member',
                    status: 'active',
                } as any);

            if (insertError) throw insertError;

            // 5️⃣ UPDATE REGISTRATION
            const { error: updateError } = await (supabase as any)
                .from('event_registrations')
                .update({
                    team_id: (foundTeam as any).id,
                    looking_for_team: false,
                })
                .eq('event_id', eventId)
                .eq('user_id', authUser.id);

            if (updateError) throw updateError;

            Toast.show({ type: 'success', text1: 'Joined successfully!' });

            navigation.replace('TeamDetails', {
                teamId: foundTeam.id,
                eventId,
            });
        } catch (err: any) {
            console.error('Join error:', err);
            Toast.show({ type: 'error', text1: 'Failed to join', text2: err.message });
        } finally {
            setIsJoining(false);
        }
    };

    const teamCardData: TeamCardData | null = foundTeam
        ? {
            id: foundTeam.id,
            name: foundTeam.name,
            team_code: foundTeam.team_code,
            required_roles: foundTeam.required_roles ?? [],
            members_count: membersCount,
            max_members: foundTeam.max_members ?? 5,
            is_recruiting: foundTeam.is_recruiting ?? false,
        }
        : null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Join via Team Code</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.searchSection}>
                    <Text style={styles.sectionTitle}>Enter Team Code</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="AB1234"
                            value={code}
                            onChangeText={(text) => setCode(text.toUpperCase())}
                            maxLength={6}
                        />
                        <TouchableOpacity
                            style={styles.searchBtn}
                            onPress={handleSearch}
                        >
                            {isSearching ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <MaterialIcons name="search" size={20} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {teamCardData && (
                    <View style={styles.resultSection}>
                        <TeamCard team={teamCardData} />

                        {alreadyMember ? (
                            <Text style={{ marginTop: 10 }}>
                                You are already a member.
                            </Text>
                        ) : (
                            <TouchableOpacity
                                style={styles.joinButton}
                                onPress={handleJoin}
                                disabled={isJoining}
                            >
                                {isJoining ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.joinButtonText}>
                                        Join This Team
                                    </Text>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 20,
        backgroundColor: '#fff',
    },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { padding: 20 },
    searchSection: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 16,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700' },
    inputContainer: { flexDirection: 'row', marginTop: 10 },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        padding: 12,
    },
    searchBtn: {
        backgroundColor: '#6366f1',
        padding: 12,
        marginLeft: 10,
        borderRadius: 12,
    },
    resultSection: { marginTop: 20 },
    joinButton: {
        backgroundColor: '#6366f1',
        padding: 16,
        borderRadius: 14,
        marginTop: 10,
        alignItems: 'center',
    },
    joinButtonText: { color: '#fff', fontWeight: '700' },
});
