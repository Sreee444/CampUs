import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Switch,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Clipboard } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import StatusBadge from '../../components/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog';
import DropdownSheet from '../../components/DropdownSheet';
import { computeTeamStatus, SKILL_ROLES, analyzeTeamStrength } from '../../utils/teamUtils';

type TeamDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TeamDetails'>;
type TeamDetailsScreenRouteProp = RouteProp<RootStackParamList, 'TeamDetails'>;

interface TeamMember {
    id: string;
    user_id: string;
    role: 'leader' | 'member';
    user?: {
        full_name?: string;
        avatar_url?: string;
        department?: string;
        year?: number;
        skills?: string[];
    };
}

interface TeamData {
    id: string;
    name: string;
    team_code: string;
    required_roles: string[];
    max_members: number;
    is_recruiting: boolean;
    created_by: string;
    event_id: string;
}

export default function TeamDetailsScreen() {
    const navigation = useNavigation<TeamDetailsScreenNavigationProp>();
    const route = useRoute<TeamDetailsScreenRouteProp>();
    const { user } = useAuth();

    const { teamId, eventId } = route.params;

    const [team, setTeam] = useState<TeamData | null>(null);
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [joinRequests, setJoinRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRecruiting, setIsRecruiting] = useState(false);
    const [leaveDialog, setLeaveDialog] = useState(false);
    const [removeDialog, setRemoveDialog] = useState<{ visible: boolean; userId: string; name: string }>({
        visible: false,
        userId: '',
        name: '',
    });
    const [promoteDialog, setPromoteDialog] = useState<{ visible: boolean; userId: string; name: string }>({
        visible: false,
        userId: '',
        name: '',
    });
    const [memberMenuVisible, setMemberMenuVisible] = useState(false);
    const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
    const [isKickingMember, setIsKickingMember] = useState<string | null>(null);
    const [isPromotingMember, setIsPromotingMember] = useState<string | null>(null);
    const [registrationDeadline, setRegistrationDeadline] = useState<string | null>(null);

    const isLeader = members.some((m) => m.user_id === user?.id && m.role === 'leader');

    const loadTeam = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data: teamData, error: teamError } = await supabase
                .from('event_teams')
                .select('*')
                .eq('id', teamId)
                .single();

            if (teamError) throw teamError;
            setTeam(teamData as any);
            setIsRecruiting((teamData as any).is_recruiting);

            const { data: membersData, error: membersError } = await supabase
                .from('event_team_members')
                .select('*, user:profiles(full_name, avatar_url, department, year, skills)')
                .eq('team_id', teamId);

            if (membersError) throw membersError;
            const sorted = (membersData || []).sort((a: any, b: any) =>
                a.role === 'leader' ? -1 : b.role === 'leader' ? 1 : 0
            );
            setMembers(sorted);

            // Load join requests (for leader)
            if (sorted.some((m: any) => m.user_id === user?.id && m.role === 'leader')) {
                const { data: requests } = await supabase
                    .from('team_join_requests')
                    .select('*, user:profiles(full_name, avatar_url, department, year, skills)')
                    .eq('team_id', teamId)
                    .eq('status', 'pending');
                setJoinRequests(requests || []);
            }

            // Load event deadline
            const { data: eventData } = await supabase
                .from('events')
                .select('registration_deadline')
                .eq('id', eventId)
                .single();
            setRegistrationDeadline((eventData as any)?.registration_deadline || null);
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to load team', text2: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [teamId, eventId, user?.id]);

    useEffect(() => {
        loadTeam();
    }, [loadTeam]);

    const handleCopyCode = () => {
        if (team?.team_code) {
            Clipboard.setString(team.team_code);
            Toast.show({ type: 'success', text1: 'Team code copied!' });
        }
    };

    const toggleRecruiting = async (value: boolean) => {
        try {
            setIsRecruiting(value);
            await (supabase.from('event_teams') as any).update({ is_recruiting: value }).eq('id', teamId);
            Toast.show({ type: 'success', text1: value ? 'Now recruiting members' : 'Recruiting paused' });
        } catch (err: any) {
            setIsRecruiting(!value);
            Toast.show({ type: 'error', text1: 'Failed to update' });
        }
    };

    const handleLeave = () => setLeaveDialog(true);

    const confirmLeave = async () => {
        if (!user) return;
        try {
            setLeaveDialog(false);
            await supabase.from('event_team_members').delete().eq('team_id', teamId).eq('user_id', user.id);

            if (isLeader) {
                const remaining = members.filter((m) => m.user_id !== user.id);
                if (remaining.length === 0) {
                    await supabase.from('event_teams').delete().eq('id', teamId);
                } else {
                    await (supabase.from('event_team_members') as any)
                        .update({ role: 'leader' })
                        .eq('team_id', teamId)
                        .eq('user_id', remaining[0].user_id);
                }
            }

            // Reset registration team reference
            await (supabase.from('event_registrations') as any)
                .update({ team_id: null, looking_for_team: true })
                .eq('event_id', eventId)
                .eq('user_id', user.id);

            Toast.show({ type: 'success', text1: 'Left the team' });
            navigation.goBack();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to leave team', text2: err.message });
        }
    };

    const handleAcceptRequest = async (requestId: string, userId: string) => {
        try {
            await (supabase.from('team_join_requests') as any).update({ status: 'accepted' }).eq('id', requestId);
            await (supabase.from('event_team_members') as any).insert({ team_id: teamId, user_id: userId, role: 'member' });
            await (supabase.from('event_registrations') as any)
                .upsert(
                    { event_id: eventId, user_id: userId, status: 'registered', team_id: teamId, looking_for_team: false },
                    { onConflict: 'event_id,user_id' }
                );

            // Notify user
            const { createNotification } = require('../../api/notifications');
            await createNotification({
                user_id: userId,
                type: 'team',
                title: 'Request Accepted',
                body: 'Your request to join ' + team?.name + ' has been accepted!',
                related_id: teamId,
                related_type: 'team',
            });

            Toast.show({ type: 'success', text1: 'Request accepted' });
            await loadTeam();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to accept request', text2: err.message });
        }
    };

    const handleRejectRequest = async (requestId: string, userId: string) => {
        try {
            await (supabase.from('team_join_requests') as any).update({ status: 'rejected' }).eq('id', requestId);

            const { createNotification } = require('../../api/notifications');
            await createNotification({
                user_id: userId,
                type: 'team',
                title: 'Request Declined',
                body: 'Your request to join ' + team?.name + ' was declined.',
                related_id: teamId,
                related_type: 'team',
            });

            Toast.show({ type: 'success', text1: 'Request rejected' });
            await loadTeam();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to reject request', text2: err.message });
        }
    };

    const kickMember = (userId: string, name: string) => {
        setRemoveDialog({ visible: true, userId, name });
    };

    const openMemberMenu = (member: TeamMember) => {
        setSelectedMember(member);
        setMemberMenuVisible(true);
    };

    const onMemberMenuSelect = (action: string) => {
        setMemberMenuVisible(false);
        if (!selectedMember) return;
        const name = selectedMember.user?.full_name || 'this member';
        if (action === 'Promote to Leader') {
            setPromoteDialog({ visible: true, userId: selectedMember.user_id, name });
            return;
        }
        if (action === 'Remove Member') {
            kickMember(selectedMember.user_id, name);
        }
    };

    const confirmRemoveMember = async () => {
        const { userId } = removeDialog;
        setRemoveDialog({ visible: false, userId: '', name: '' });
        try {
            setIsKickingMember(userId);
            await supabase.from('event_team_members').delete().eq('team_id', teamId).eq('user_id', userId);

            const { data: updateData, error: updateError } = await (supabase.from('event_registrations') as any)
                .update({ team_id: null, looking_for_team: true })
                .eq('event_id', eventId)
                .eq('user_id', userId)
                .select();

            if (updateError) throw updateError;
            Toast.show({ type: 'success', text1: 'Member removed successfully' });
            await loadTeam();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to remove member', text2: err.message });
        } finally {
            setIsKickingMember(null);
        }
    };

    const confirmPromoteMember = async () => {
        if (!user) return;
        const { userId, name } = promoteDialog;
        setPromoteDialog({ visible: false, userId: '', name: '' });
        try {
            setIsPromotingMember(userId);

            const { error: demoteErr } = await (supabase.from('event_team_members') as any)
                .update({ role: 'member' })
                .eq('team_id', teamId)
                .eq('user_id', user.id);
            if (demoteErr) throw demoteErr;

            const { error: promoteErr } = await (supabase.from('event_team_members') as any)
                .update({ role: 'leader' })
                .eq('team_id', teamId)
                .eq('user_id', userId);
            if (promoteErr) throw promoteErr;

            await (supabase.from('event_teams') as any)
                .update({ leader_id: userId })
                .eq('id', teamId);

            Toast.show({ type: 'success', text1: `${name} is now team leader` });
            await loadTeam();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to promote member', text2: err.message });
        } finally {
            setIsPromotingMember(null);
            setSelectedMember(null);
        }
    };

    const getRequesterStrength = (userSkills: string[] = []) => {
        const userHasRequiredSkills: string[] = [];
        team?.required_roles?.forEach((role: string) => {
            if (userSkills.includes(role)) userHasRequiredSkills.push(role);
        });
        const skillCoverage = team?.required_roles && team.required_roles.length > 0
            ? Math.round((userHasRequiredSkills.length / team.required_roles.length) * 100)
            : 100;

        let rating: string, color: string;
        if (skillCoverage >= 80) { rating = 'Excellent'; color = '#16a34a'; }
        else if (skillCoverage >= 60) { rating = 'Good'; color = '#4f46e5'; }
        else if (skillCoverage >= 40) { rating = 'Fair'; color = '#d97706'; }
        else { rating = 'Limited'; color = '#ef4444'; }

        return { skillCoverage, rating, color };
    };

    if (isLoading) {
        return (
            <View style={[st.container, st.centered]}>
                <ActivityIndicator size="large" color="#7c3aed" />
            </View>
        );
    }

    if (!team) {
        return (
            <View style={[st.container, st.centered]}>
                <Text style={{ fontSize: 15, color: '#6b7280' }}>Team not found.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
                    <Text style={{ color: '#4f46e5', fontWeight: '600' }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const status = computeTeamStatus(members.length, team.max_members, registrationDeadline ?? undefined);
    const spotsLeft = team.max_members - members.length;
    const isCurrentUserMember = members.some((m) => m.user_id === user?.id);
    const strength = analyzeTeamStrength(
        members.length,
        team.max_members,
        team.required_roles || [],
        members.map((m) => m.user?.skills || [])
    );

    const getStrengthColor = () => {
        if (strength.rating === 'excellent') return '#16a34a';
        if (strength.rating === 'good') return '#d97706';
        return '#ef4444';
    };

    return (
        <View style={st.container}>
            {/* Nav bar */}
            <View style={st.navBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={st.navBtn}>
                    <MaterialIcons name="arrow-back" size={22} color="#1f2937" />
                </TouchableOpacity>
                <Text style={st.navTitle} numberOfLines={1}>{team.name}</Text>
                <StatusBadge status={status} size="sm" />
            </View>

            <ScrollView style={st.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Team code card */}
                <LinearGradient
                    colors={['#f5f3ff', '#faf5ff']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={st.codeCard}
                >
                    <View>
                        <Text style={st.codeLabel}>Team Code</Text>
                        <Text style={st.codeValue}>{team.team_code}</Text>
                    </View>
                    <TouchableOpacity style={st.copyBtn} onPress={handleCopyCode}>
                        <MaterialIcons name="content-copy" size={16} color="#7c3aed" />
                        <Text style={st.copyText}>Copy</Text>
                    </TouchableOpacity>
                </LinearGradient>

                {/* Stats */}
                <View style={st.statsRow}>
                    <View style={st.statItem}>
                        <Text style={st.statNum}>{members.length}</Text>
                        <Text style={st.statLabel}>Members</Text>
                    </View>
                    <View style={st.statDivider} />
                    <View style={st.statItem}>
                        <Text style={st.statNum}>{team.max_members}</Text>
                        <Text style={st.statLabel}>Max Size</Text>
                    </View>
                    <View style={st.statDivider} />
                    <View style={st.statItem}>
                        <Text style={[st.statNum, spotsLeft === 0 && { color: '#ef4444' }]}>{spotsLeft}</Text>
                        <Text style={st.statLabel}>Spots Left</Text>
                    </View>
                </View>

                {/* Required Roles */}
                {team.required_roles && team.required_roles.length > 0 && (
                    <View style={st.section}>
                        <View style={st.sectionHeader}>
                            <MaterialIcons name="assessment" size={16} color="#7c3aed" />
                            <Text style={st.sectionLabel}>Required Roles</Text>
                        </View>
                        <View style={st.rolesWrap}>
                            {team.required_roles.map((role: string, i: number) => {
                                const info = SKILL_ROLES.find((r) => r.id === role);
                                const hasMember = members.some((m) => m.user?.skills?.includes(role));
                                return (
                                    <View key={i} style={[st.rolePill, hasMember && st.roleFilled]}>
                                        <Text style={st.roleEmoji}>{info?.icon || '🔧'}</Text>
                                        <Text style={[st.roleText, hasMember && { color: '#16a34a' }]}>
                                            {info?.label || role}
                                        </Text>
                                        {hasMember && <MaterialIcons name="check" size={12} color="#16a34a" />}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Team Strength */}
                <View style={st.section}>
                    <View style={st.sectionHeader}>
                        <MaterialIcons name="flash-on" size={16} color="#f59e0b" />
                        <Text style={st.sectionLabel}>Team Strength</Text>
                    </View>
                    <LinearGradient
                        colors={getStrengthColor() === '#16a34a' ? ['#f0fdf4', '#ecfdf5'] : getStrengthColor() === '#d97706' ? ['#fffbeb', '#fef3c7'] : ['#fef2f2', '#fecaca']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={st.strengthCard}
                    >
                        <View style={st.strengthTop}>
                            <View style={[st.scoreCircle, { backgroundColor: getStrengthColor(), borderRadius: 50, paddingHorizontal: 20, paddingVertical: 14 }]}>
                                <Text style={[st.scoreNum, { color: '#fff' }]}>{strength.overallScore}</Text>
                                <Text style={[st.scoreOf, { color: 'rgba(255,255,255,0.8)' }]}>/100</Text>
                            </View>
                            <View style={st.strengthMeta}>
                                <Text style={[st.ratingLabel, { color: getStrengthColor(), textTransform: 'capitalize' }]}>Team {strength.rating}</Text>
                                <View style={st.metricRow}>
                                    <Text style={st.metricLabel}>Skills Coverage</Text>
                                    <Text style={[st.metricVal, { color: '#7c3aed' }]}>{strength.skillCoverage}%</Text>
                                </View>
                                <View style={st.metricRow}>
                                    <Text style={st.metricLabel}>Team Size</Text>
                                    <Text style={[st.metricVal, { color: '#7c3aed' }]}>{strength.teamCompleteness}%</Text>
                                </View>
                            </View>
                        </View>
                        {strength.insights && strength.insights.length > 0 && (
                            <View style={st.insightsWrap}>
                                {strength.insights.map((insight: string, i: number) => (
                                    <Text key={i} style={st.insightText}>• {insight}</Text>
                                ))}
                            </View>
                        )}
                    </LinearGradient>
                </View>

                {/* Members */}
                <View style={st.section}>
                    <View style={st.sectionHeader}>
                        <MaterialIcons name="people" size={16} color="#7c3aed" />
                        <Text style={st.sectionLabel}>Members ({members.length})</Text>
                    </View>
                    {members.map((member) => {
                        const initials = (member.user?.full_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                        return (
                            <View key={member.id} style={st.memberRow}>
                                <View style={st.memberRowContent}>
                                    {member.user?.avatar_url ? (
                                        <Image source={{ uri: member.user.avatar_url }} style={st.avatar} />
                                    ) : (
                                        <View style={st.avatarFallback}>
                                            <Text style={st.avatarText}>{initials}</Text>
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={st.memberName}>{member.user?.full_name || 'Unknown'}</Text>
                                        <Text style={st.memberMeta}>
                                            {member.user?.department || ''}{member.user?.year ? ' · Year ' + member.user.year : ''}
                                        </Text>
                                    </View>
                                    {member.role === 'leader' && (
                                        <View style={st.leaderBadge}>
                                            <MaterialIcons name="star" size={12} color="#d97706" />
                                            <Text style={st.leaderText}>Leader</Text>
                                        </View>
                                    )}
                                </View>
                                {isLeader && member.user_id !== user?.id && (
                                    <TouchableOpacity
                                        style={st.memberMenuBtn}
                                        onPress={() => openMemberMenu(member)}
                                        disabled={isKickingMember === member.user_id || isPromotingMember === member.user_id}
                                        activeOpacity={0.8}
                                    >
                                        <MaterialIcons name="more-vert" size={18} color="#6b7280" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* Join Requests (leader only) */}
                {isLeader && joinRequests.length > 0 && (
                    <View style={st.section}>
                        <View style={st.sectionHeaderTop}>
                            <MaterialIcons name="mail" size={16} color="#3b82f6" />
                            <Text style={st.sectionLabel}>Join Requests</Text>
                            <View style={st.countBadge}>
                                <Text style={st.countText}>{joinRequests.length}</Text>
                            </View>
                        </View>
                        {joinRequests.map((req) => {
                            const s = getRequesterStrength(req.user?.skills || []);
                            return (
                                <View key={req.id} style={st.requestCard}>
                                    <View style={st.requestTop}>
                                        {req.user?.avatar_url ? (
                                            <Image source={{ uri: req.user.avatar_url }} style={st.avatar} />
                                        ) : (
                                            <View style={st.avatarFallback}>
                                                <Text style={st.avatarText}>
                                                    {(req.user?.full_name || '?')[0].toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={st.memberName}>{req.user?.full_name || 'Unknown'}</Text>
                                            <Text style={st.memberMeta}>
                                                {req.user?.department || ''}{req.user?.year ? ' · Year ' + req.user.year : ''}
                                            </Text>
                                        </View>
                                        <View style={[st.strengthBadge, { borderColor: s.color }]}>
                                            <Text style={[st.strengthPct, { color: s.color }]}>{s.skillCoverage}%</Text>
                                            <Text style={st.strengthRating}>{s.rating}</Text>
                                        </View>
                                    </View>
                                    <View style={st.requestActions}>
                                        <TouchableOpacity
                                            style={st.acceptBtn}
                                            onPress={() => handleAcceptRequest(req.id, req.user_id)}
                                        >
                                            <MaterialIcons name="check" size={18} color="#fff" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={st.rejectBtn}
                                            onPress={() => handleRejectRequest(req.id, req.user_id)}
                                        >
                                            <MaterialIcons name="close" size={18} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Recruiting toggle (leader only) */}
                {isLeader && (
                    <View style={st.section}>
                        <View style={st.toggleRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={st.toggleLabel}>Looking for Members</Text>
                                <Text style={st.toggleSub}>Allow others to find and request to join</Text>
                            </View>
                            <Switch
                                value={isRecruiting}
                                onValueChange={toggleRecruiting}
                                trackColor={{ false: '#e5e7eb', true: '#c7d2fe' }}
                                thumbColor={isRecruiting ? '#7c3aed' : '#fff'}
                            />
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Footer */}
            {isCurrentUserMember && (
                <View style={st.footer}>
                    {isLeader && spotsLeft > 0 && (
                        <TouchableOpacity
                            style={{ borderRadius: 12, overflow: 'hidden' }}
                            onPress={() => navigation.navigate('TeamConnect', {
                                eventId,
                                requiredRoles: team.required_roles || [],
                                teamId: team.id,
                            })}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#7c3aed', '#6d28d9']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={st.primaryBtn}
                            >
                                <MaterialIcons name="person-add" size={18} color="#fff" />
                                <Text style={st.primaryBtnText}>Invite Members</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={st.leaveBtn} onPress={handleLeave} activeOpacity={0.8}>
                        <MaterialIcons name="logout" size={18} color="#ef4444" />
                        <Text style={st.leaveBtnText}>Leave Team</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Dialogs */}
            <ConfirmDialog
                visible={leaveDialog}
                title="Leave Team?"
                message={isLeader && members.length > 1
                    ? 'As team leader, leadership will transfer to another member.'
                    : isLeader
                        ? 'You are the only member. The team will be deleted.'
                        : 'Are you sure you want to leave this team?'}
                confirmText="Leave"
                onConfirm={confirmLeave}
                onCancel={() => setLeaveDialog(false)}
            />
            <ConfirmDialog
                visible={removeDialog.visible}
                title="Remove Member?"
                message={'Remove ' + removeDialog.name + ' from the team?'}
                confirmText="Remove"
                onConfirm={confirmRemoveMember}
                onCancel={() => setRemoveDialog({ visible: false, userId: '', name: '' })}
            />
            <ConfirmDialog
                visible={promoteDialog.visible}
                title="Promote to Leader?"
                message={'Make ' + promoteDialog.name + ' the team leader? You will become a member.'}
                confirmText="Promote"
                onConfirm={confirmPromoteMember}
                onCancel={() => setPromoteDialog({ visible: false, userId: '', name: '' })}
            />
            <DropdownSheet
                visible={memberMenuVisible}
                title={selectedMember?.user?.full_name || 'Member Actions'}
                options={selectedMember?.role === 'leader' ? ['Remove Member'] : ['Promote to Leader', 'Remove Member']}
                onSelect={onMemberMenuSelect}
                onClose={() => {
                    setMemberMenuVisible(false);
                    setSelectedMember(null);
                }}
            />
        </View>
    );
}

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f7' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Nav
    navBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        gap: 12,
    },
    navBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
        color: '#1f2937',
    },
    scroll: { flex: 1 },

    // Code card
    codeCard: {
        marginHorizontal: 20,
        marginTop: 16,
        borderRadius: 14,
        padding: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#e9d5ff',
    },
    codeLabel: { fontSize: 11, color: '#8b5cf6', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
    codeValue: {
        fontSize: 24,
        fontWeight: '800',
        color: '#7c3aed',
        letterSpacing: 4,
        fontFamily: 'monospace',
        marginTop: 2,
    },
    copyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#e9d5ff',
    },
    copyText: { color: '#7c3aed', fontWeight: '600', fontSize: 13 },

    // Stats
    statsRow: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginTop: 16,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        padding: 16,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 22, fontWeight: '700', color: '#111827' },
    statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontWeight: '500' },
    statDivider: { width: 1, backgroundColor: '#f0f0f0' },

    // Sections
    section: {
        marginHorizontal: 20,
        marginTop: 16,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        padding: 16,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        marginBottom: 0,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    sectionHeaderTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        justifyContent: 'space-between',
    },

    // Roles
    rolesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    rolePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#f9fafb',
    },
    roleFilled: {
        borderColor: '#bbf7d0',
        backgroundColor: '#f0fdf4',
    },
    roleEmoji: { fontSize: 12 },
    roleText: { fontSize: 12, fontWeight: '600', color: '#374151' },

    // Strength
    strengthCard: {
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.2)',
    },
    strengthTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    scoreCircle: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreNum: {
        fontSize: 28,
        fontWeight: '800',
    },
    scoreOf: {
        fontSize: 11,
        marginTop: -4,
    },
    strengthMeta: {
        flex: 1,
        gap: 6,
    },
    ratingLabel: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 4,
    },
    metricRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    metricLabel: {
        fontSize: 12,
        color: '#9ca3af',
        fontWeight: '500',
    },
    metricVal: {
        fontSize: 12,
        fontWeight: '700',
        color: '#374151',
    },
    insightsWrap: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        gap: 3,
    },
    insightText: {
        fontSize: 12,
        color: '#6b7280',
        lineHeight: 18,
    },

    // Members
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    memberRowContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    avatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#7c3aed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    memberName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    memberMeta: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
    leaderBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#fffbeb',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    leaderText: { fontSize: 11, fontWeight: '700', color: '#d97706' },
    kickBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fef2f2',
        borderWidth: 1,
        borderColor: '#fecaca',
        alignItems: 'center',
        justifyContent: 'center',
    },
    memberMenuBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.5 },

    // Join requests
    countBadge: {
        backgroundColor: '#ef4444',
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    countText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    requestCard: {
        padding: 12,
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    requestTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
    },
    requestActions: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'flex-end',
    },
    acceptBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#7c3aed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rejectBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fef2f2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    strengthBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    strengthPct: {
        fontSize: 13,
        fontWeight: '700',
    },
    strengthRating: {
        fontSize: 9,
        color: '#9ca3af',
        marginTop: -2,
    },

    // Toggle
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
    toggleSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

    // Footer
    footer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: 34,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        gap: 10,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    leaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        paddingVertical: 14,
        borderWidth: 1.5,
        borderColor: '#fca5a5',
        backgroundColor: '#fef2f2',
    },
    leaveBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
});