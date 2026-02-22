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
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [registrationDeadline, setRegistrationDeadline] = useState<string | undefined>();
    const [joinRequests, setJoinRequests] = useState<any[]>([]);
    const [isProcessingRequest, setIsProcessingRequest] = useState<string | null>(null);
    const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
    const [isKickingMember, setIsKickingMember] = useState<string | null>(null);
    const [removeMemberDialog, setRemoveMemberDialog] = useState({ visible: false, userId: '', memberName: '' });
    const [leaveDialog, setLeaveDialog] = useState(false);

    const currentUserMember = members.find((m) => m.user_id === user?.id);
    const isLeader = currentUserMember?.role === 'leader';

    const loadTeam = useCallback(async () => {
        try {
            setIsLoading(true);

            // Fetch from event_teams table (generalised)
            const { data: teamData, error: teamError } = await supabase
                .from('event_teams')
                .select('*')
                .eq('id', teamId)
                .single();

            if (teamError) throw teamError;

            // Fetch members from event_team_members table
            const { data: membersData, error: membersError } = await (supabase
                .from('event_team_members')
                .select(`
          id,
          user_id,
          role,
          user:profiles!event_team_members_user_id_fkey(
            full_name,
            avatar_url,
            department,
            year
          )
        `)
                .eq('team_id', teamId) as any);

            if (membersError) throw membersError;

            const safeMembers: TeamMember[] = (membersData as any[]) ?? [];

            // Get event registration deadline
            const { data: eventData } = await supabase
                .from('events')
                .select('registration_deadline')
                .eq('id', eventId)
                .single();

            setTeam(teamData as TeamData);
            setMembers(safeMembers);
            setRegistrationDeadline((eventData as any)?.registration_deadline);

            // Fetch join requests if current user is leader
            const currentUserMember = safeMembers.find((m: any) => m.user_id === user?.id);
            if (currentUserMember?.role === 'leader') {
                const { data: requestsData } = await (supabase as any)
                    .from('team_join_requests')
                    .select(`
                        id,
                        user_id,
                        user:profiles!team_join_requests_user_id_fkey(
                            full_name,
                            avatar_url,
                            department,
                            year,
                            skills
                        )
                    `)
                    .eq('team_id', teamId)
                    .eq('status', 'pending');
                setJoinRequests((requestsData as any[]) ?? []);
            }
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to load team', text2: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [teamId, eventId]);

    useEffect(() => {
        loadTeam();
    }, [loadTeam]);

    const handleCopyCode = async () => {
        if (!team) return;
        await Clipboard.setString(team.team_code);
        Toast.show({ type: 'success', text1: 'Team code copied!' });
    };

    const toggleRecruiting = async (value: boolean) => {
        if (!team) return;
        try {
            setIsUpdating(true);
            const { error } = await (supabase as any)
                .from('event_teams')
                .update({ is_recruiting: value })
                .eq('id', teamId);
            if (error) throw error;
            setTeam({ ...team, is_recruiting: value });
            Toast.show({
                type: 'success',
                text1: value ? '🟢 Now accepting members' : '🔴 Stopped accepting members',
            });
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Update failed', text2: err.message });
        } finally {
            setIsUpdating(false);
        }
    };

    const handleLeave = () => {
        setLeaveDialog(true);
    };

    const confirmLeave = async () => {
        if (!user?.id) return;
        try {
            setIsLeaving(true);
            setLeaveDialog(false);

            // Delete current user's membership
            const { error: deleteError } = await (supabase as any)
                .from('event_team_members')
                .delete()
                .eq('team_id', teamId)
                .eq('user_id', user.id);

            if (deleteError) throw deleteError;

            // Unregister user from the event when leaving team
            const { error: unregError } = await (supabase as any)
                .from('event_registrations')
                .delete()
                .eq('event_id', eventId)
                .eq('user_id', user.id);

            if (unregError) throw unregError;

            // If leader and no other members → delete team + unregister all members
            if (isLeader && members.length <= 1) {
                // Unregister all team members
                const { error: delRegError } = await (supabase as any)
                    .from('event_registrations')
                    .delete()
                    .eq('event_id', eventId)
                    .in('user_id', members.map((m: any) => m.user_id));

                if (delRegError) throw delRegError;

                const { error: delTeamError } = await (supabase as any)
                    .from('event_teams')
                    .delete()
                    .eq('id', teamId);

                if (delTeamError) throw delTeamError;

                Toast.show({ type: 'info', text1: 'Team deleted and all members unregistered' });
            } else if (isLeader) {
                // Promote next member to leader
                const nextMember = members.find((m) => m.user_id !== user.id);
                if (nextMember) {
                    const { error: promoteError } = await (supabase as any)
                        .from('event_team_members')
                        .update({ role: 'leader' })
                        .eq('id', nextMember.id);

                    if (promoteError) throw promoteError;
                }
                Toast.show({ type: 'info', text1: 'Left team and unregistered', text2: 'Leadership transferred' });
            } else {
                Toast.show({ type: 'info', text1: 'Left team and unregistered from event' });
            }

            setTimeout(() => {
                navigation.goBack();
            }, 500);
        } catch (err: any) {
            console.error('Leave team error:', err);
            Toast.show({ type: 'error', text1: 'Failed to leave', text2: err.message });
            setLeaveDialog(false);
        } finally {
            setIsLeaving(false);
        }
    };

    const handleAcceptRequest = async (request: any) => {
        try {
            setIsProcessingRequest(request.id);

            // 1. Check if user is already a team member
            const { data: existingMember } = await (supabase as any)
                .from('event_team_members')
                .select('id')
                .eq('team_id', teamId)
                .eq('user_id', request.user_id)
                .limit(1);

            if (!existingMember || existingMember.length === 0) {
                // Add to event_team_members only if not already a member
                const { error: memberError } = await (supabase as any)
                    .from('event_team_members')
                    .insert({
                        team_id: teamId,
                        user_id: request.user_id,
                        role: 'member'
                    });
                if (memberError) throw memberError;
            }

            // 2. Update existing registration or create new one
            const { data: existingRegs, error: regCheckError } = await (supabase as any)
                .from('event_registrations')
                .select('id')
                .eq('event_id', eventId)
                .eq('user_id', request.user_id);

            if (regCheckError) throw regCheckError;

            if (existingRegs && existingRegs.length > 0) {
                // User already registered - just add them to team
                const { error: updateError } = await (supabase as any)
                    .from('event_registrations')
                    .update({ team_id: teamId, looking_for_team: false })
                    .eq('event_id', eventId)
                    .eq('user_id', request.user_id);
                if (updateError) throw updateError;
            } else {
                // User not registered yet - create registration with team
                const { error: insertError } = await (supabase as any)
                    .from('event_registrations')
                    .insert({
                        event_id: eventId,
                        user_id: request.user_id,
                        team_id: teamId,
                        looking_for_team: false,
                        status: 'registered'
                    } as any);
                if (insertError) throw insertError;
            }

            // 3. Mark request as accepted
            const { error: reqError } = await (supabase as any)
                .from('team_join_requests')
                .update({ status: 'accepted' })
                .eq('id', request.id);
            if (reqError) throw reqError;

            // 4. Send notification to user
            await supabase
                .from('notifications')
                .insert({
                    user_id: request.user_id,
                    type: 'team',
                    title: '✅ Team Request Accepted',
                    body: `You've been accepted into ${team?.name || 'the team'}!`,
                    related_id: teamId,
                    related_type: 'team',
                    is_read: false,
                } as any);

            Toast.show({ type: 'success', text1: 'Request accepted!' });
            loadTeam(); // Refresh
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to accept', text2: err.message });
        } finally {
            setIsProcessingRequest(null);
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            setIsProcessingRequest(requestId);
            const { error } = await (supabase as any)
                .from('team_join_requests')
                .update({ status: 'rejected' })
                .eq('id', requestId);
            if (error) throw error;
            Toast.show({ type: 'info', text1: 'Request rejected' });
            loadTeam();
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to reject', text2: err.message });
        } finally {
            setIsProcessingRequest(null);
        }
    };

    const kickMember = (userId: string, memberName: string) => {
        setRemoveMemberDialog({ visible: true, userId, memberName });
    };

    const confirmRemoveMember = async () => {
        const { userId } = removeMemberDialog;
        try {
            setIsKickingMember(userId);
            setRemoveMemberDialog({ visible: false, userId: '', memberName: '' });

            // Remove from event_team_members
            const { data: deleteData, error: deleteError } = await (supabase as any)
                .from('event_team_members')
                .delete()
                .eq('team_id', teamId)
                .eq('user_id', userId)
                .select();

            if (deleteError) {
                console.error('Delete error:', deleteError);
                throw deleteError;
            }

            console.log('Delete response:', deleteData);

            // Update event_registrations to remove team_id
            const { data: updateData, error: updateError } = await (supabase as any)
                .from('event_registrations')
                .update({ team_id: null, looking_for_team: true })
                .eq('event_id', eventId)
                .eq('user_id', userId)
                .select();

            if (updateError) {
                console.error('Update error:', updateError);
                throw updateError;
            }

            console.log('Update response:', updateData);

            Toast.show({ type: 'success', text1: 'Member removed successfully' });
            await loadTeam();
        } catch (err: any) {
            console.error('Full error:', err);
            Toast.show({ type: 'error', text1: 'Failed to remove member', text2: err.message });
        } finally {
            setIsKickingMember(null);
        }
    };

    const getRequesterStrength = (userSkills: string[] = []) => {
        const userHasRequiredSkills: string[] = [];
        team?.required_roles?.forEach((role: string) => {
            if (userSkills.includes(role)) {
                userHasRequiredSkills.push(role);
            }
        });

        const skillCoverage = team?.required_roles && team.required_roles.length > 0
            ? Math.round((userHasRequiredSkills.length / team.required_roles.length) * 100)
            : 100;

        let rating: string;
        let color: string;

        if (skillCoverage >= 80) {
            rating = 'Excellent';
            color = '#10b981';
        } else if (skillCoverage >= 60) {
            rating = 'Good';
            color = '#3b82f6';
        } else if (skillCoverage >= 40) {
            rating = 'Fair';
            color = '#f59e0b';
        } else {
            rating = 'Limited';
            color = '#ef4444';
        }

        return { skillCoverage, rating, color };
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#6366f1" />
            </View>
        );
    }

    if (!team) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.errorText}>Team not found.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backLink}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const status = computeTeamStatus(members.length, team.max_members, registrationDeadline);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{team.name}</Text>
                <StatusBadge status={status} size="sm" />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Team Code Card */}
                <View style={styles.codeCard}>
                    <View>
                        <Text style={styles.codeCardLabel}>Team Code</Text>
                        <Text style={styles.codeValue}>{team.team_code}</Text>
                    </View>
                    <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
                        <MaterialIcons name="content-copy" size={16} color="#6366f1" />
                        <Text style={styles.copyText}>Copy</Text>
                    </TouchableOpacity>
                </View>

                {/* Find Teammates Button (Leader only) */}
                {isLeader && members.length < team.max_members && (
                    <TouchableOpacity
                        style={styles.findTeammatesBtn}
                        onPress={() => navigation.navigate('TeamConnect', {
                            eventId,
                            requiredRoles: team.required_roles || [],
                            teamId: team.id,
                        })}
                    >
                        <MaterialIcons name="person-add" size={20} color="#fff" />
                        <Text style={styles.findTeammatesBtnText}>Find Teammates</Text>
                    </TouchableOpacity>
                )}

                {/* Stats Row */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{members.length}</Text>
                        <Text style={styles.statLabel}>Members</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{team.max_members}</Text>
                        <Text style={styles.statLabel}>Max Size</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{team.max_members - members.length}</Text>
                        <Text style={styles.statLabel}>Spots Left</Text>
                    </View>
                </View>

                {/* Required Roles */}
                {team.required_roles && team.required_roles.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Required Roles</Text>
                        <View style={styles.rolesRow}>
                            {team.required_roles.map((roleId) => {
                                const roleInfo = SKILL_ROLES.find((r) => r.id === roleId);
                                return (
                                    <View
                                        key={roleId}
                                        style={[styles.rolePill, { borderColor: roleInfo?.color ?? '#6b7280' }]}
                                    >
                                        <Text style={styles.roleIcon}>{roleInfo?.icon ?? '🔩'}</Text>
                                        <Text style={[styles.roleText, { color: roleInfo?.color ?? '#6b7280' }]}>
                                            {roleInfo?.label ?? roleId}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Team Strength Analysis */}
                {(() => {
                    const memberSkills = members.map(m => (m.user?.skills as string[]) || []);
                    const strength = analyzeTeamStrength(
                        members.length,
                        team.max_members,
                        team.required_roles,
                        memberSkills
                    );

                    return (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Team Strength</Text>
                            <View style={[styles.strengthCard, {
                                backgroundColor: strength.rating === 'excellent' ? '#d1fae5' :
                                               strength.rating === 'good' ? '#fef3c7' : '#fee2e2',
                                borderColor: strength.rating === 'excellent' ? '#10b981' :
                                           strength.rating === 'good' ? '#f59e0b' : '#ef4444',
                            }]}>
                                <View style={styles.strengthHeader}>
                                    <View style={styles.strengthScoreWrap}>
                                        <Text style={[styles.strengthScore, {
                                            color: strength.rating === 'excellent' ? '#059669' :
                                                   strength.rating === 'good' ? '#d97706' : '#dc2626',
                                        }]}>{strength.overallScore}/100</Text>
                                        <Text style={styles.strengthRating}>{strength.rating}</Text>
                                    </View>
                                    <View style={styles.strengthMetrics}>
                                        <View style={styles.metricRow}>
                                            <MaterialIcons name="star" size={14} color="#6b7280" />
                                            <Text style={styles.metricLabel}>Skills:</Text>
                                            <Text style={styles.metricValue}>{strength.skillCoverage}%</Text>
                                        </View>
                                        <View style={styles.metricRow}>
                                            <MaterialIcons name="people" size={14} color="#6b7280" />
                                            <Text style={styles.metricLabel}>Size:</Text>
                                            <Text style={styles.metricValue}>{strength.teamCompleteness}%</Text>
                                        </View>
                                    </View>
                                </View>
                                {strength.insights.length > 0 && (
                                    <View style={styles.strengthInsights}>
                                        {strength.insights.slice(0, 2).map((insight, idx) => (
                                            <Text key={idx} style={styles.insightText}>• {insight}</Text>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })()}

                {/* Members List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Members</Text>
                    {members.map((member) => (
                        <View 
                            key={member.id} 
                            style={styles.memberRow}
                        >
                            <TouchableOpacity 
                                style={styles.memberRowContent}
                                onPress={() => navigation.navigate('PublicProfile', { userId: member.user_id })}
                            >
                                <View style={styles.memberAvatar}>
                                    <Text style={styles.memberAvatarText}>
                                        {(member.user?.full_name ?? 'U')[0].toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.memberInfo}>
                                    <Text style={styles.memberName}>{member.user?.full_name ?? 'Unknown'}</Text>
                                    <Text style={styles.memberMeta}>
                                        {[member.user?.department, member.user?.year ? `Year ${member.user.year}` : null]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </Text>
                                </View>
                                {member.role === 'leader' && (
                                    <View style={styles.leaderBadge}>
                                        <MaterialIcons name="star" size={12} color="#f59e0b" />
                                        <Text style={styles.leaderText}>Leader</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            {isLeader && member.user_id !== user?.id && (
                                <TouchableOpacity
                                    style={[styles.kickBtn, isKickingMember === member.user_id && styles.kickBtnDisabled]}
                                    onPress={() => kickMember(member.user_id, member.user?.full_name ?? 'Member')}
                                    disabled={isKickingMember === member.user_id}
                                >
                                    <MaterialIcons name="close" size={18} color="#ef4444" />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>

                {/* Join Requests Section (Leader only) */}
                {isLeader && joinRequests.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Join Requests</Text>
                            <View style={styles.requestCountBadge}>
                                <Text style={styles.requestCountText}>{joinRequests.length}</Text>
                            </View>
                        </View>
                        {joinRequests.map((req) => {
                            const strength = getRequesterStrength(req.user?.skills || []);
                            return (
                            <View 
                                key={req.id} 
                                style={styles.requestCard}
                            >
                                <TouchableOpacity
                                    onPress={() => navigation.navigate('PublicProfile', { userId: req.user_id })}
                                    style={styles.requestCardTop}
                                >
                                    {/* User Avatar */}
                                    {req.user?.avatar_url ? (
                                        <Image source={{ uri: req.user.avatar_url }} style={styles.requestAvatar} />
                                    ) : (
                                        <View style={styles.memberAvatar}>
                                            <Text style={styles.memberAvatarText}>
                                                {(req.user?.full_name ?? 'U')[0].toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.memberInfo}>
                                        <Text style={styles.memberName}>{req.user?.full_name ?? 'Unknown'}</Text>
                                        <Text style={styles.memberMeta}>
                                            {[req.user?.department, req.user?.year ? `Year ${req.user.year}` : null]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>

                                {/* Strength Badge Inline */}
                                <View style={[styles.strengthBadgeSmall, { borderColor: strength.color }]}>
                                    <Text style={[styles.strengthPercentSmall, { color: strength.color }]}>
                                        {strength.skillCoverage}%
                                    </Text>
                                    <Text style={styles.strengthRatingSmall}>{strength.rating}</Text>
                                </View>

                                <View style={styles.requestActions}>
                                    <TouchableOpacity
                                        style={styles.rejectBtn}
                                        onPress={() => handleRejectRequest(req.id)}
                                        disabled={!!isProcessingRequest}
                                    >
                                        <MaterialIcons name="close" size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.acceptBtn}
                                        onPress={() => handleAcceptRequest(req)}
                                        disabled={!!isProcessingRequest}
                                    >
                                        <MaterialIcons name="check" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                        })}
                    </View>
                )}

                {/* Looking for Members Toggle (leader only) */}
                {isLeader && status !== 'locked' && (
                    <View style={styles.section}>
                        <View style={styles.toggleRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.toggleLabel}>Looking for Members</Text>
                                <Text style={styles.toggleSublabel}>
                                    Allow others to discover and join your team
                                </Text>
                            </View>
                            <Switch
                                value={team.is_recruiting}
                                onValueChange={toggleRecruiting}
                                disabled={isUpdating}
                                trackColor={{ true: '#6366f1', false: '#d1d5db' }}
                                thumbColor="#fff"
                            />
                        </View>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
                {isLeader && members.length < team.max_members && (
                    <TouchableOpacity
                        style={styles.inviteButton}
                        onPress={() => navigation.navigate('TeamConnect', {
                            eventId,
                            requiredRoles: team.required_roles || [],
                            teamId: team.id,
                        })}
                    >
                        <MaterialIcons name="person-add" size={18} color="#fff" />
                        <Text style={styles.inviteButtonText}>Invite Teammates</Text>
                    </TouchableOpacity>
                )}
                {currentUserMember && (
                    <TouchableOpacity
                        style={[styles.leaveButton, isLeaving && styles.leaveButtonDisabled]}
                        onPress={handleLeave}
                        disabled={isLeaving}
                    >
                        <MaterialIcons name="exit-to-app" size={18} color="#ef4444" />
                        <Text style={styles.leaveButtonText}>
                            {isLeaving ? 'Leaving...' : isLeader && members.length === 1 ? 'Delete Team' : 'Leave Team'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* User Analysis Modal - REMOVED */}

            <ConfirmDialog
                visible={removeMemberDialog.visible}
                title="Remove Team Member"
                message={`Remove ${removeMemberDialog.memberName} from this team?\n\nThey will be unregistered from the team and can look for another one.`}
                confirmText="Yes, Remove"
                cancelText="Cancel"
                type="danger"
                onConfirm={confirmRemoveMember}
                onCancel={() => setRemoveMemberDialog({ visible: false, userId: '', memberName: '' })}
            />

            <ConfirmDialog
                visible={leaveDialog}
                title={isLeader && members.length === 1 ? 'Delete Team?' : 'Leave Team?'}
                message={
                    isLeader && members.length === 1
                        ? 'You are the only member. Leaving will delete the team.'
                        : isLeader
                            ? 'As the leader, leaving will remove you but the team will remain.'
                            : 'Are you sure you want to leave this team?'
                }
                confirmText={isLeader && members.length === 1 ? 'Delete' : 'Leave'}
                cancelText="Cancel"
                type="danger"
                onConfirm={confirmLeave}
                onCancel={() => setLeaveDialog(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    centered: { alignItems: 'center', justifyContent: 'center' },
    errorText: { fontSize: 16, color: '#6b7280', marginBottom: 12 },
    backLink: { color: '#6366f1', fontWeight: '600' },
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1 },
    content: { flex: 1, padding: 20 },
    codeCard: {
        backgroundColor: '#eef2ff',
        borderRadius: 16,
        padding: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#c7d2fe',
        marginBottom: 16,
    },
    codeCardLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
    codeValue: {
        fontSize: 26,
        fontWeight: '800',
        color: '#6366f1',
        letterSpacing: 4,
        fontFamily: 'monospace',
    },
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#c7d2fe',
    },
    copyText: { color: '#6366f1', fontWeight: '600', fontSize: 13 },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        padding: 16,
        marginBottom: 16,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
    statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
    statDivider: { width: 1, backgroundColor: '#e5e7eb' },
    section: {
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        padding: 16,
        marginBottom: 12,
        gap: 12,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
    rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    rolePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1.5,
        backgroundColor: '#f9fafb',
    },
    roleIcon: { fontSize: 12 },
    roleText: { fontSize: 12, fontWeight: '600' },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    memberAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#6366f1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    memberAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    memberMeta: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
    leaderBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#fef3c7',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    leaderText: { fontSize: 11, fontWeight: '700', color: '#d97706' },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    toggleLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
    toggleSublabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    requestCountBadge: {
        backgroundColor: '#ef4444',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 1,
    },
    requestCountText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    requestCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#f3f4f6',
    },
    requestActions: { flexDirection: 'row', gap: 8 },
    acceptBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#10b981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rejectBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fee2e2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        padding: 20,
        paddingBottom: 34,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        gap: 12,
    },
    inviteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6366f1',
        paddingVertical: 16,
        borderRadius: 14,
        gap: 8,
    },
    inviteButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    findTeammatesBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6366f1',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        marginHorizontal: 20,
        marginTop: 16,
        gap: 8,
    },
    findTeammatesBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
    leaveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 16,
        borderWidth: 1.5,
        borderColor: '#fca5a5',
        backgroundColor: '#fef2f2',
    },
    leaveButtonDisabled: { opacity: 0.5 },
    leaveButtonText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
    // Team Strength Styles
    strengthCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 12,
    },
    strengthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    strengthScoreWrap: {
        alignItems: 'center',
        gap: 4,
    },
    strengthScore: {
        fontSize: 28,
        fontWeight: '800',
    },
    strengthRating: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
    },
    strengthMetrics: {
        flex: 1,
        gap: 8,
    },
    metricRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metricLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
    },
    metricValue: {
        fontSize: 11,
        color: '#374151',
        fontWeight: '700',
        marginLeft: 4,
    },
    strengthInsights: {
        gap: 4,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.1)',
    },
    insightText: {
        fontSize: 11,
        color: '#6b7280',
        lineHeight: 16,
    },
    // Request Card Styles - Updated
    requestCardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    requestAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    // Strength Badge Inline
    strengthBadgeSmall: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
    },
    strengthPercentSmall: {
        fontSize: 14,
        fontWeight: '700',
    },
    strengthRatingSmall: {
        fontSize: 9,
        color: '#6b7280',
        marginTop: -2,
    },
    // Member Row Content
    memberRowContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    // Kick Member Button
    kickBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fecaca',
        alignItems: 'center',
        justifyContent: 'center',
    },
    kickBtnDisabled: {
        opacity: 0.5,
    },
});
