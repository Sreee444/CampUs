import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';
import {
  getProjectTeam,
  updateProjectTeam,
  deleteProjectTeam,
  updateProjectStatus,
  sendJoinRequest,
  sendProjectInvite,
  getUserJoinRequestStatus,
  getTeamJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  acceptProjectInvite,
  rejectProjectInvite,
  cancelProjectInvite,
  removeTeamMember,
} from '../../api/projects';
import { ProjectTeam } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import { getProjectStatusColor, PROJECT_STATUS_OPTIONS } from '../../utils/semanticColors';
import { createNotification } from '../../api/notifications';
import { supabase } from '../../api/supabase';
import { computeMatchScore, detectSkillRoles, ParticipantWithMatch, sortByMatch } from '../../utils/matchingUtils';

type ProjectDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ProjectDetails'>;
type ProjectDetailsScreenRouteProp = RouteProp<RootStackParamList, 'ProjectDetails'>;

interface JoinRequest {
  id: string;
  user_id: string;
  team_id: string;
  message?: string;
  status: string;
  created_at: string;
  user: {
    id: string;
    full_name?: string;
    email: string;
    avatar_url?: string;
    role?: string;
    department?: string;
  };
}

export default function ProjectDetailsScreen() {
  const navigation = useNavigation<ProjectDetailsScreenNavigationProp>();
  const route = useRoute<ProjectDetailsScreenRouteProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user, profile } = useAuth();

  const { teamId } = route.params;
  const [team, setTeam] = useState<ProjectTeam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinRequestStatus, setJoinRequestStatus] = useState<any>(null);
  const [pendingJoinRequests, setPendingJoinRequests] = useState<JoinRequest[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteCandidates, setInviteCandidates] = useState<ParticipantWithMatch[]>([]);
  const [isLoadingInvitees, setIsLoadingInvitees] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [isHandlingInvite, setIsHandlingInvite] = useState(false);
  const [inviteFilter, setInviteFilter] = useState<'all' | 'best' | 'dept'>('all');
  
  // Status modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Edit project modal
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectCategory, setEditProjectCategory] = useState('');
  const [editMaxMembers, setEditMaxMembers] = useState('');
  
  // Join request modal
  const [showJoinRequestModal, setShowJoinRequestModal] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  
  // Remove member confirmation
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  
  // Leave team confirmation
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  
  // Join request confirmation
  const [showJoinConfirmation, setShowJoinConfirmation] = useState(false);
  const [showDeleteProjectConfirmation, setShowDeleteProjectConfirmation] = useState(false);

  const creatorId = team?.creator?.id ?? team?.created_by;
  const isCreator = user?.id === creatorId;
  const isAdmin = profile?.role === 'admin';
  const canManageTeam = isCreator || isAdmin;
  const canManageMembers = canManageTeam;
  const teamMembers = team?.members || [];
  const hasCreatorInMembers = !!creatorId && teamMembers.some((member) => member.id === creatorId);
  const effectiveMembersCount = Math.max(team?.members_count || 0, teamMembers.length) + (creatorId && !hasCreatorInMembers ? 1 : 0);
  const safeMembersCount = Math.max(0, effectiveMembersCount);
  const safeMaxMembers = Math.max(0, Number(team?.max_members) || 0);
  const teamProgressPercent = safeMaxMembers > 0
    ? Math.min(100, Math.round((safeMembersCount / safeMaxMembers) * 100))
    : 0;
  const displayMembers = hasCreatorInMembers || !team?.creator ? teamMembers : [team.creator, ...teamMembers];
  const isMember = !!user?.id && (isCreator || teamMembers.some((member) => member.id === user?.id));
  const isTeamFull = safeMaxMembers > 0 ? safeMembersCount >= safeMaxMembers : false;
  const requiredRoles = useMemo(
    () => detectSkillRoles(team?.required_skills ?? []),
    [team?.required_skills]
  );

  const isInviteMessage = useCallback((message?: string) => {
    return typeof message === 'string' && message.startsWith('[INVITE]');
  }, []);

  const pendingInvites = useMemo(
    () => pendingJoinRequests.filter((request) => isInviteMessage(request.message)),
    [pendingJoinRequests, isInviteMessage]
  );

  const pendingInboundRequests = useMemo(
    () => pendingJoinRequests.filter((request) => !isInviteMessage(request.message)),
    [pendingJoinRequests, isInviteMessage]
  );

  useEffect(() => {
    if (!teamId) {
      setError('Team not found.');
      setIsLoading(false);
      return;
    }

    loadTeamData();
  }, [teamId]);

  const loadTeamData = async () => {
    try {
      setIsLoading(true);
      const data = await getProjectTeam(teamId);
      setTeam(data);
      setError('');

      // Check join request status if not a member
      if (user?.id) {
        const userIsMember =
          user.id === (data.created_by || data.creator?.id) ||
          !!data.members?.some((m) => m.id === user.id);

        if (!userIsMember) {
          try {
            const requestStatus = await getUserJoinRequestStatus(teamId, user.id);
            setJoinRequestStatus(requestStatus);
          } catch (err) {
            // No request found, that's okay
          }
        } else {
          setJoinRequestStatus(null);
        }
      }

      // Load pending join requests if creator
      if (user?.id && user.id === (data.created_by || data.creator?.id)) {
        try {
          const requests = await getTeamJoinRequests(teamId);
          setPendingJoinRequests(requests);
        } catch (err) {
          console.error('Failed to load join requests', err);
        }
      }
    } catch (err) {
      console.error('Failed to load team details', err);
      setError('Unable to load team details at the moment.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingInvites.length) {
      setInvitedUserIds(new Set());
      return;
    }
    setInvitedUserIds(new Set(pendingInvites.map((invite) => invite.user_id)));
  }, [pendingInvites]);

  const getMatchColor = (pct: number) => {
    if (pct >= 75) return '#10b981';
    if (pct >= 40) return '#f59e0b';
    return '#6b7280';
  };

  const loadInviteCandidates = useCallback(async () => {
    if (!team || !canManageTeam) return;

    try {
      setIsLoadingInvitees(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, department, year, skills, role');

      if (error) throw error;

      const memberIds = new Set(displayMembers.map((member) => member.id));
      const pendingIds = new Set(pendingJoinRequests.map((request) => request.user_id));
      if (user?.id) {
        memberIds.add(user.id);
      }

      const filtered = (data || [])
        .filter((profileItem: any) => !memberIds.has(profileItem.id))
        .filter((profileItem: any) => !pendingIds.has(profileItem.id))
        .map((profileItem: any) => ({
          id: profileItem.id,
          full_name: profileItem.full_name,
          avatar_url: profileItem.avatar_url,
          department: profileItem.department,
          year: profileItem.year,
          skills: profileItem.skills ?? [],
        }));

      const sorted = sortByMatch(filtered, requiredRoles);
      setInviteCandidates(sorted);
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to load users',
        text2: err?.message || 'Unable to load invite list',
      });
    } finally {
      setIsLoadingInvitees(false);
    }
  }, [team, canManageTeam, displayMembers, pendingJoinRequests, requiredRoles, user?.id]);

  useEffect(() => {
    if (showInviteModal) {
      loadInviteCandidates();
    }
  }, [showInviteModal, loadInviteCandidates]);

  const handleStatusChange = async (newStatus: string) => {
    if (!team || !canManageTeam) return;

    try {
      setIsUpdatingStatus(true);
      await updateProjectStatus(teamId, newStatus as any);
      Toast.show({
        type: 'success',
        text1: 'Status Updated',
        text2: `Project status changed to ${newStatus}`,
      });
      await loadTeamData();
      setShowStatusModal(false);
    } catch (err) {
      console.error('Failed to update status', err);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: 'Unable to update project status',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleOpenEditProject = () => {
    if (!team || !canManageTeam) return;

    setEditProjectName(team.name || '');
    setEditProjectDescription(team.description || '');
    setEditProjectCategory(team.category || '');
    setEditMaxMembers(String(Math.max(safeMaxMembers, safeMembersCount, 2)));
    setShowEditProjectModal(true);
  };

  const handleSaveProjectEdits = async () => {
    if (!team || !canManageTeam) return;

    const nextName = editProjectName.trim();
    const nextDescription = editProjectDescription.trim();
    const nextCategory = editProjectCategory.trim();
    const parsedMaxMembers = Number.parseInt(editMaxMembers, 10);

    if (!nextName) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Project name is required' });
      return;
    }

    if (!nextDescription) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Project description is required' });
      return;
    }

    if (!Number.isFinite(parsedMaxMembers) || parsedMaxMembers < safeMembersCount) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: `Maximum members must be at least ${safeMembersCount}`,
      });
      return;
    }

    try {
      setIsSavingProject(true);
      await updateProjectTeam(teamId, {
        name: nextName,
        description: nextDescription,
        category: nextCategory || null,
        max_members: parsedMaxMembers,
      } as any);

      Toast.show({
        type: 'success',
        text1: 'Project Updated',
        text2: 'Project details were updated successfully',
      });

      setShowEditProjectModal(false);
      await loadTeamData();
    } catch (err: any) {
      console.error('Failed to update project', err);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: err?.message || 'Unable to update project details',
      });
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!team || !canManageTeam) return;

    try {
      await deleteProjectTeam(teamId);
      setShowDeleteProjectConfirmation(false);
      Toast.show({
        type: 'success',
        text1: 'Project Deleted',
        text2: `${team.name} has been deleted`,
      });
      navigation.goBack();
    } catch (err: any) {
      console.error('Failed to delete project', err);
      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: err?.message || 'Unable to delete project',
      });
    }
  };

  const handleJoinRequestClick = () => {
    // Show confirmation after user has written message
    setShowJoinRequestModal(false);
    setShowJoinConfirmation(true);
  };

  const handleSendJoinRequest = async () => {
    if (!user?.id || !team) return;

    // Prevent joining closed projects
    const projectStatus = team.status || 'planning';
    const closedStatuses = ['cancelled', 'completed', 'on-hold'];
    
    if (closedStatuses.includes(projectStatus)) {
      Toast.show({
        type: 'error',
        text1: 'Cannot Join',
        text2: `This project is ${projectStatus}`,
      });
      setShowJoinConfirmation(false);
      return;
    }

    try {
      setIsSendingRequest(true);
      setShowJoinConfirmation(false);
      
      await sendJoinRequest(teamId, user.id, joinMessage.trim() || undefined);
      
      // Try to send notifications (don't fail if this fails)
      try {
        // Notify team creator
        await createNotification({
          user_id: creatorId,
          title: 'New Join Request',
          body: `${profile?.full_name || user?.email || 'Someone'} wants to join ${team.name}`,
          type: 'project_request',
          related_id: teamId,
        });
        
        // Notify all admins
        await notifyAdmins(
          'Project Join Request',
          `${profile?.full_name || user?.email || 'Someone'} requested to join ${team.name}`
        );
      } catch (notifErr) {
        console.error('Failed to send notifications, but join request was sent:', notifErr);
      }
      
      Toast.show({
        type: 'success',
        text1: 'Request Sent',
        text2: 'Your join request has been sent to the team creator',
      });
      setJoinMessage('');
      await loadTeamData();
    } catch (err: any) {
      console.error('Failed to send join request', err);
      const message = err?.message || 'Unable to send join request';
      Toast.show({
        type: 'error',
        text1: 'Request Failed',
        text2: message,
      });
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleInviteUser = async (userId: string) => {
    if (!team || !canManageTeam || !user?.id) return;

    const projectStatus = team.status || 'planning';
    const closedStatuses = ['cancelled', 'completed', 'on-hold'];

    if (closedStatuses.includes(projectStatus)) {
      Toast.show({
        type: 'error',
        text1: 'Cannot Invite',
        text2: `This project is ${projectStatus}`,
      });
      return;
    }

    if (isTeamFull) {
      Toast.show({
        type: 'error',
        text1: 'Team Full',
        text2: 'This project already has the maximum members.',
      });
      return;
    }

    try {
      setInvitingUserId(userId);
      await sendProjectInvite(teamId, userId, profile?.full_name || user.email || 'Team leader');

      await createNotification({
        user_id: userId,
        title: 'Project Invitation',
        body: `${profile?.full_name || user.email || 'A team leader'} invited you to join ${team.name}`,
        type: 'project_invite',
        related_id: teamId,
      });

      setInvitedUserIds((prev) => new Set([...prev, userId]));
      Toast.show({ type: 'success', text1: 'Invitation sent' });
      await loadTeamData();
      await loadInviteCandidates();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Invite Failed',
        text2: err?.message || 'Unable to send invite',
      });
    } finally {
      setInvitingUserId(null);
    }
  };

  const handleAcceptRequest = async (request: JoinRequest) => {
    if (!isCreator) return;

    try {
      await acceptJoinRequest(request.id, teamId, request.user_id);
      
      // Try to send notifications (don't fail if this fails)
      try {
        // Notify the user
        await createNotification({
          user_id: request.user_id,
          title: 'Join Request Accepted',
          body: `You have been accepted to join ${team?.name}!`,
          type: 'project_update',
          related_id: teamId,
        });
        
        // Notify admins
        await notifyAdmins(
          'Project Team Update',
          `${request.user.full_name || request.user.email} joined ${team?.name}`
        );
      } catch (notifErr) {
        console.error('Failed to send notifications, but request was accepted:', notifErr);
      }
      
      Toast.show({
        type: 'success',
        text1: 'Request Accepted',
        text2: `${request.user.full_name || request.user.email} joined the team`,
      });
      await loadTeamData();
    } catch (err: any) {
      console.error('Failed to accept request', err);
      Toast.show({
        type: 'error',
        text1: 'Accept Failed',
        text2: err?.message || 'Unable to accept join request',
      });
    }
  };

  const handleRejectRequest = async (request: JoinRequest) => {
    if (!isCreator) return;

    try {
      await rejectJoinRequest(request.id);
      Toast.show({
        type: 'info',
        text1: 'Request Rejected',
        text2: `Declined ${request.user.full_name || request.user.email}'s request`,
      });
      await loadTeamData();
    } catch (err) {
      console.error('Failed to reject request', err);
      Toast.show({
        type: 'error',
        text1: 'Reject Failed',
        text2: 'Unable to reject join request',
      });
    }
  };

  const handleAcceptInvite = async () => {
    if (!user?.id || !joinRequestStatus?.id || !team) return;
    try {
      setIsHandlingInvite(true);
      await acceptProjectInvite(joinRequestStatus.id, teamId, user.id);

      await createNotification({
        user_id: creatorId,
        title: 'Invite Accepted',
        body: `${profile?.full_name || user.email || 'A user'} accepted the invite to ${team.name}`,
        type: 'project_update',
        related_id: teamId,
      });

      Toast.show({ type: 'success', text1: 'Invitation accepted' });
      await loadTeamData();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to accept invite',
        text2: err?.message || 'Unable to accept invite',
      });
    } finally {
      setIsHandlingInvite(false);
    }
  };

  const handleRejectInvite = async () => {
    if (!joinRequestStatus?.id || !team) return;
    try {
      setIsHandlingInvite(true);
      await rejectProjectInvite(joinRequestStatus.id);

      await createNotification({
        user_id: creatorId,
        title: 'Invite Declined',
        body: `${profile?.full_name || user?.email || 'A user'} declined the invite to ${team.name}`,
        type: 'project_update',
        related_id: teamId,
      });

      Toast.show({ type: 'info', text1: 'Invitation declined' });
      await loadTeamData();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to decline invite',
        text2: err?.message || 'Unable to decline invite',
      });
    } finally {
      setIsHandlingInvite(false);
    }
  };

  const handleCancelInvite = async (invite: JoinRequest) => {
    if (!team || !canManageTeam) return;
    try {
      await cancelProjectInvite(invite.id);

      await createNotification({
        user_id: invite.user_id,
        title: 'Invite Cancelled',
        body: `The invitation to join ${team.name} was cancelled.`,
        type: 'project_update',
        related_id: teamId,
      });

      Toast.show({ type: 'info', text1: 'Invite cancelled' });
      await loadTeamData();
      await loadInviteCandidates();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Cancel Failed',
        text2: err?.message || 'Unable to cancel invite',
      });
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove || !canManageMembers || !user?.id) return;

    if (memberToRemove.id === creatorId) {
      Toast.show({
        type: 'error',
        text1: 'Remove Failed',
        text2: 'Project creator cannot be removed from the team',
      });
      return;
    }

    if (memberToRemove.role === 'admin') {
      Toast.show({
        type: 'error',
        text1: 'Remove Failed',
        text2: 'Admin members cannot be removed from the team',
      });
      return;
    }

    try {
      setIsRemovingMember(true);
      await removeTeamMember(teamId, memberToRemove.id, user.id);
      
      // Try to send notifications (don't fail if this fails)
      try {
        // Notify the removed member
        await createNotification({
          user_id: memberToRemove.id,
          title: 'Removed from Team',
          body: `You have been removed from ${team?.name}`,
          type: 'project_update',
          related_id: teamId,
        });
        
        // Notify admins
        await notifyAdmins(
          'Project Team Update',
          `${memberToRemove.full_name || memberToRemove.email} was removed from ${team?.name}`
        );
      } catch (notifErr) {
        console.error('Failed to send notifications, but member was removed:', notifErr);
      }
      
      Toast.show({
        type: 'success',
        text1: 'Member Removed',
        text2: `${memberToRemove.full_name || memberToRemove.email} has been removed from the team`,
      });
      setMemberToRemove(null);
      await loadTeamData();
    } catch (err: any) {
      console.error('Failed to remove member', err);
      Toast.show({
        type: 'error',
        text1: 'Remove Failed',
        text2: err?.message || 'Unable to remove team member',
      });
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!user?.id || !team) return;

    try {
      setIsLeavingTeam(true);
      setShowLeaveConfirmation(false);
      
      await removeTeamMember(teamId, user.id, user.id);
      
      // Try to send notifications (don't fail if this fails)
      try {
        // Notify team creator
        await createNotification({
          user_id: creatorId,
          title: 'Team Member Left',
          body: `${profile?.full_name || user?.email || 'A member'} left ${team.name}`,
          type: 'project_update',
          related_id: teamId,
        });
      
        // Notify admins
        await notifyAdmins(
          'Project Team Update',
          `${profile?.full_name || user?.email || 'A member'} left ${team.name}`
        );
      } catch (notifErr) {
        console.error('Failed to send notifications, but left team:', notifErr);
      }
      
      Toast.show({
        type: 'success',
        text1: 'Left Team',
        text2: `You have left ${team.name}`,
      });
      
      // Navigate back after leaving
      navigation.goBack();
    } catch (err: any) {
      console.error('Failed to leave team', err);
      Toast.show({
        type: 'error',
        text1: 'Leave Failed',
        text2: err?.message || 'Unable to leave team',
      });
    } finally {
      setIsLeavingTeam(false);
    }
  };

  const notifyAdmins = async (title: string, body: string) => {
    try {
      // Get all admin users
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin');
      
      if (admins && admins.length > 0) {
        // Create notification for each admin
        const notificationPromises = admins.map((admin: { id: string }) =>
          createNotification({
            user_id: admin.id,
            title,
            body,
            type: 'admin_alert',
            related_id: teamId,
          })
        );
        await Promise.all(notificationPromises);
      }
    } catch (err) {
      console.error('Failed to notify admins', err);
      // Don't throw - this is a non-critical error
    }
  };

  const renderJoinButton = () => {
    if (!user?.id) return null;

    const hasInvite =
      joinRequestStatus?.status === 'pending' &&
      isInviteMessage(joinRequestStatus?.message);
    
    if (isMember && !canManageTeam) {
      return (
        <TouchableOpacity
          style={styles.leaveButton}
          onPress={() => setShowLeaveConfirmation(true)}
        >
          <MaterialIcons name="exit-to-app" size={18} color="#ef4444" />
          <Text style={styles.leaveButtonText}>Leave Team</Text>
        </TouchableOpacity>
      );
    }
    
    if (isMember) return null;
    if (isCreator) return null;
    
    // Check if project status allows joining
    const projectStatus = team?.status || 'planning';
    const closedStatuses = ['cancelled', 'completed', 'on-hold'];
    
    if (closedStatuses.includes(projectStatus)) {
      return (
        <View style={styles.closedBadge}>
          <MaterialIcons name="block" size={16} color="#ef4444" />
          <Text style={styles.closedText}>
            {projectStatus === 'cancelled' ? 'Project Cancelled' :
             projectStatus === 'completed' ? 'Project Completed' :
             'Project On Hold'}
          </Text>
        </View>
      );
    }
    
    if (hasInvite) {
      return (
        <View style={styles.inviteInlineContainer}>
          <View style={styles.inviteInlineBadge}>
            <MaterialIcons name="mail" size={16} color="#6366f1" />
            <Text style={styles.inviteInlineText}>Project Invite</Text>
          </View>
          <View style={styles.inviteInlineActions}>
            <TouchableOpacity
              style={[styles.inviteAcceptButton, isHandlingInvite && styles.inviteActionDisabled]}
              onPress={handleAcceptInvite}
              disabled={isHandlingInvite}
            >
              <Text style={styles.inviteAcceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inviteRejectButton, isHandlingInvite && styles.inviteActionDisabled]}
              onPress={handleRejectInvite}
              disabled={isHandlingInvite}
            >
              <Text style={styles.inviteRejectText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (joinRequestStatus?.status === 'pending') {
      return (
        <View style={styles.pendingBadge}>
          <MaterialIcons name="schedule" size={16} color="#f59e0b" />
          <Text style={styles.pendingText}>Request Pending</Text>
        </View>
      );
    }

    if (isTeamFull) {
      return (
        <View style={styles.fullBadge}>
          <Text style={styles.fullText}>Team Full</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.joinButton}
        onPress={() => setShowJoinRequestModal(true)}
      >
        <MaterialIcons name="group-add" size={18} color="#fff" />
        <Text style={styles.joinButtonText}>Request to Join</Text>
      </TouchableOpacity>
    );
  };

  const currentStatus = team?.status || 'planning';
  const statusInfo = getProjectStatusColor(currentStatus);

  const filteredInviteCandidates = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase();
    let list = inviteCandidates;

    if (inviteFilter === 'best') {
      list = list.slice(0, 10);
    }

    if (inviteFilter === 'dept' && profile?.department) {
      const dept = profile.department.toLowerCase().trim();
      list = list.filter((candidate) => (candidate.department || '').toLowerCase().trim() === dept);
    }

    if (!query) return list;

    return list.filter((candidate) => {
      const name = (candidate.full_name || '').toLowerCase();
      const dept = (candidate.department || '').toLowerCase();
      const skills = (candidate.skills || []).join(' ').toLowerCase();
      return name.includes(query) || dept.includes(query) || skills.includes(query);
    });
  }, [inviteCandidates, inviteSearch, inviteFilter, profile?.department]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {team?.name || 'Project Details'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="error-outline" size={48} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Project Header */}
          <View style={styles.projectHeader}>
            <View style={styles.projectHeaderTop}>
              <View style={styles.categoryRow}>
                <Text style={styles.category}>{team?.category || 'General'}</Text>
                {team?.is_ai_generated && (
                  <View style={styles.aiBadge}>
                    <MaterialIcons name="auto-awesome" size={12} color="#fb7185" />
                    <Text style={styles.aiText}>AI</Text>
                  </View>
                )}
              </View>
              
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                <Text style={[styles.statusText, { color: statusInfo.color }]}>
                  {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).replace(/-/g, ' ')}
                </Text>
              </View>
            </View>

            <Text style={styles.projectTitle}>{team?.name}</Text>
            <Text style={styles.projectDescription}>
              {team?.description || 'No description provided yet.'}
            </Text>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {canManageTeam && (
                <TouchableOpacity
                  style={styles.changeStatusButton}
                  onPress={() => setShowStatusModal(true)}
                >
                  <MaterialIcons name="swap-horiz" size={18} color="#fb7185" />
                  <Text style={styles.changeStatusText}>Change Status</Text>
                </TouchableOpacity>
              )}
              {canManageTeam && (
                <TouchableOpacity
                  style={styles.editProjectButton}
                  onPress={handleOpenEditProject}
                >
                  <MaterialIcons name="edit" size={18} color="#fb7185" />
                  <Text style={styles.editProjectText}>Edit Project</Text>
                </TouchableOpacity>
              )}
              {canManageTeam && (
                <TouchableOpacity
                  style={styles.deleteProjectButton}
                  onPress={() => setShowDeleteProjectConfirmation(true)}
                >
                  <MaterialIcons name="delete-outline" size={18} color="#ef4444" />
                  <Text style={styles.deleteProjectText}>Delete Project</Text>
                </TouchableOpacity>
              )}
              {renderJoinButton()}
            </View>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <MaterialIcons name="group" size={24} color="#fb7185" />
              <Text style={styles.statValue}>{safeMembersCount}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="person-add" size={24} color="#10b981" />
              <Text style={styles.statValue}>{safeMaxMembers}</Text>
              <Text style={styles.statLabel}>Capacity</Text>
            </View>
            {typeof team?.match_score === 'number' && (
              <View style={styles.statCard}>
                <MaterialIcons name="stars" size={24} color="#f59e0b" />
                <Text style={styles.statValue}>{team.match_score}%</Text>
                <Text style={styles.statLabel}>Match</Text>
              </View>
            )}
          </View>

          {/* Progress Bar */}
          {safeMaxMembers > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Team Progress</Text>
                <Text style={styles.progressValue}>{teamProgressPercent}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${teamProgressPercent}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Required Skills */}
          {(team?.required_skills || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Required Skills</Text>
              <View style={styles.skillsRow}>
                {team.required_skills?.map((skill) => (
                  <View key={skill} style={styles.skillChip}>
                    <Text style={styles.skillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Pending Join Requests (Creator Only) */}
          {isCreator && pendingInboundRequests.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Join Requests</Text>
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsCount}>{pendingInboundRequests.length}</Text>
                </View>
              </View>
              {pendingInboundRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <TouchableOpacity
                    style={styles.requestUser}
                    onPress={() => navigation.navigate('PublicProfile', { userId: request.user_id })}
                  >
                    <UserAvatar
                      uri={request.user.avatar_url}
                      name={request.user.full_name || request.user.email}
                      size={44}
                      role={request.user.role}
                      showRing
                    />
                    <View style={styles.requestUserInfo}>
                      <Text style={styles.requestUserName}>
                        {request.user.full_name || request.user.email}
                      </Text>
                      <Text style={styles.requestUserDept}>{request.user.department || 'Student'}</Text>
                      {request.message && (
                        <Text style={styles.requestMessage}>"{request.message}"</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => handleRejectRequest(request)}
                    >
                      <MaterialIcons name="close" size={20} color="#ef4444" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleAcceptRequest(request)}
                    >
                      <MaterialIcons name="check" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Faculty Lead */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Project Lead</Text>
            <TouchableOpacity
              style={styles.facultyCard}
              onPress={() => {
                if (creatorId) {
                  navigation.navigate('PublicProfile', { userId: creatorId });
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.facultyInfo}>
                <UserAvatar
                  uri={team?.creator?.avatar_url}
                  name={team?.creator?.full_name || 'Faculty'}
                  size={48}
                  role={team?.creator?.role}
                  showRing
                />
                <View>
                  <Text style={styles.facultyName}>{team?.creator?.full_name || 'Faculty partner'}</Text>
                  <Text style={styles.facultyRole}>{team?.creator?.department || 'Faculty mentor'}</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Team Members */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Members ({safeMembersCount})</Text>
            <View style={styles.teamList}>
              {displayMembers.map((member) => {
                const isLeader = member.id === creatorId;
                const isAdminMember = member.role === 'admin';
                const matchInfo = computeMatchScore(member.skills ?? [], requiredRoles);
                const matchColor = getMatchColor(matchInfo.percentage);
                return (
                  <View key={member.id} style={styles.memberCard}>
                    <TouchableOpacity
                      style={styles.memberInfo}
                      onPress={() => navigation.navigate('PublicProfile', { userId: member.id })}
                      activeOpacity={0.7}
                    >
                      <UserAvatar
                        uri={member.avatar_url}
                        name={member.full_name || member.email}
                        size={44}
                        role={member.role}
                        showRing
                      />
                      <View style={styles.memberDetails}>
                        <View style={styles.memberNameRow}>
                          <Text style={styles.memberName}>{member.full_name || member.email}</Text>
                          {isLeader && (
                            <View style={styles.leaderBadge}>
                              <MaterialIcons name="star" size={12} color="#f59e0b" />
                              <Text style={styles.leaderText}>Leader</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.memberDept}>{member.department || member.role || 'Member'}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.memberActions}>
                      <View style={[styles.memberMatchBadge, { borderColor: matchColor }]}>
                        <Text style={[styles.memberMatchPct, { color: matchColor }]}>
                          {matchInfo.percentage}%
                        </Text>
                        <Text style={styles.memberMatchLabel}>match</Text>
                      </View>
                    {canManageMembers && !isLeader && !isAdminMember && (
                      <TouchableOpacity
                        style={styles.removeMemberButton}
                        onPress={() => setMemberToRemove(member)}
                      >
                        <MaterialIcons name="remove-circle-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Invite Members */}
          {canManageTeam && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Invite Members</Text>
              <Text style={styles.sectionSubtitle}>
                Invite students to join your project and see how well they match your required skills.
              </Text>
              <TouchableOpacity
                style={styles.inviteMembersButton}
                onPress={() => setShowInviteModal(true)}
              >
                <MaterialIcons name="person-add" size={18} color="#fff" />
                <Text style={styles.inviteMembersText}>Invite People</Text>
              </TouchableOpacity>
              {pendingInvites.length > 0 && (
                <View style={styles.pendingInvites}>
                  <Text style={styles.pendingInvitesTitle}>Pending Invites</Text>
                  {pendingInvites.slice(0, 3).map((invite) => (
                    <View key={invite.id} style={styles.pendingInviteItem}>
                      <UserAvatar
                        uri={invite.user.avatar_url}
                        name={invite.user.full_name || invite.user.email}
                        size={36}
                        role={invite.user.role}
                        showRing
                      />
                      <View style={styles.pendingInviteInfo}>
                        <Text style={styles.pendingInviteName}>
                          {invite.user.full_name || invite.user.email}
                        </Text>
                        <Text style={styles.pendingInviteMeta}>Invitation sent</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.cancelInviteButton}
                        onPress={() => handleCancelInvite(invite)}
                      >
                        <MaterialIcons name="close" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Status Change Modal */}
      <Modal
        visible={showStatusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStatusModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.statusModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Change Project Status</Text>
            {PROJECT_STATUS_OPTIONS.map((status) => {
              const info = getProjectStatusColor(status.value);
              const isActive = currentStatus === status.value;
              return (
                <TouchableOpacity
                  key={status.value}
                  style={[styles.statusOption, isActive && styles.statusOptionActive]}
                  onPress={() => handleStatusChange(status.value)}
                  disabled={isUpdatingStatus}
                >
                  <View style={styles.statusOptionLeft}>
                    <View style={[styles.statusOptionDot, { backgroundColor: info.color }]} />
                    <Text style={[styles.statusOptionLabel, isActive && styles.statusOptionLabelActive]}>
                      {status.label}
                    </Text>
                  </View>
                  {isActive && <MaterialIcons name="check" size={20} color="#fb7185" />}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Join Request Modal */}
      <Modal
        visible={showJoinRequestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJoinRequestModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowJoinRequestModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.joinModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Request to Join Team</Text>
            <Text style={styles.modalSubtitle}>
              Send a message to the team creator explaining why you want to join
            </Text>
            <TextInput
              style={styles.joinInput}
              placeholder="Your message (optional)..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
              value={joinMessage}
              onChangeText={setJoinMessage}
              maxLength={500}
            />
            <View style={styles.joinModalActions}>
              <TouchableOpacity
                style={styles.joinModalCancel}
                onPress={() => setShowJoinRequestModal(false)}
              >
                <Text style={styles.joinModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.joinModalSend}
                onPress={handleJoinRequestClick}
              >
                <Text style={styles.joinModalSendText}>Next</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Invite Members Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInviteModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.inviteModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Invite Members</Text>
            <Text style={styles.modalSubtitle}>
              Find users and invite them to join this project.
            </Text>
            <TextInput
              style={styles.inviteSearchInput}
              placeholder="Search by name, department, or skill"
              placeholderTextColor={Colors.textSecondary}
              value={inviteSearch}
              onChangeText={setInviteSearch}
            />
            <View style={styles.inviteFilterTabs}>
              <TouchableOpacity
                style={[styles.inviteFilterTab, inviteFilter === 'all' && styles.inviteFilterTabActive]}
                onPress={() => setInviteFilter('all')}
              >
                <Text style={[styles.inviteFilterText, inviteFilter === 'all' && styles.inviteFilterTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteFilterTab, inviteFilter === 'best' && styles.inviteFilterTabActive]}
                onPress={() => setInviteFilter('best')}
              >
                <Text style={[styles.inviteFilterText, inviteFilter === 'best' && styles.inviteFilterTextActive]}>Best match</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteFilterTab, inviteFilter === 'dept' && styles.inviteFilterTabActive]}
                onPress={() => setInviteFilter('dept')}
              >
                <Text style={[styles.inviteFilterText, inviteFilter === 'dept' && styles.inviteFilterTextActive]}>Same dept</Text>
              </TouchableOpacity>
            </View>
            {inviteFilter === 'dept' && !profile?.department && (
              <Text style={styles.inviteFilterHint}>Set your department to filter by department.</Text>
            )}
            {isLoadingInvitees ? (
              <View style={styles.inviteLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.inviteLoadingText}>Loading users...</Text>
              </View>
            ) : filteredInviteCandidates.length === 0 ? (
              <View style={styles.inviteEmpty}>
                <Text style={styles.inviteEmptyTitle}>No users available</Text>
                <Text style={styles.inviteEmptySubtitle}>
                  Everyone is already on the team or has a pending request.
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.inviteList} showsVerticalScrollIndicator={false}>
                    {filteredInviteCandidates.map((candidate) => {
                      const matchColor = getMatchColor(candidate.match.percentage);
                      const isInvited = invitedUserIds.has(candidate.id);
                      const pendingInvite = pendingInvites.find((invite) => invite.user_id === candidate.id);
                      return (
                        <View key={candidate.id} style={styles.inviteCard}>
                      <TouchableOpacity
                        style={styles.inviteInfo}
                        onPress={() => navigation.navigate('PublicProfile', { userId: candidate.id })}
                      >
                        <UserAvatar
                          uri={candidate.avatar_url}
                          name={candidate.full_name || 'User'}
                          size={44}
                          role={undefined}
                          showRing
                        />
                        <View style={styles.inviteDetails}>
                          <Text style={styles.inviteName}>{candidate.full_name || 'Anonymous'}</Text>
                          <Text style={styles.inviteMeta}>
                            {[candidate.department, candidate.year ? `Year ${candidate.year}` : null]
                              .filter(Boolean)
                              .join(' • ')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                        <View style={styles.inviteActions}>
                          <View style={[styles.inviteMatchBadge, { borderColor: matchColor }]}>
                            <Text style={[styles.inviteMatchPct, { color: matchColor }]}>
                              {candidate.match.percentage}%
                            </Text>
                            <Text style={styles.inviteMatchLabel}>match</Text>
                          </View>
                          {isInvited && pendingInvite ? (
                            <TouchableOpacity
                              style={styles.inviteCancelButton}
                              onPress={() => handleCancelInvite(pendingInvite)}
                            >
                              <Text style={styles.inviteCancelText}>Cancel Invite</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[
                                styles.inviteActionButton,
                                (invitingUserId === candidate.id || isInvited) && styles.inviteActionButtonDisabled,
                              ]}
                              onPress={() => handleInviteUser(candidate.id)}
                              disabled={invitingUserId === candidate.id || isInvited}
                            >
                              {invitingUserId === candidate.id ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.inviteActionText}>
                                  {isInvited ? 'Invited' : 'Invite'}
                                </Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        visible={showEditProjectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditProjectModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditProjectModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.joinModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Project</Text>
            <Text style={styles.modalSubtitle}>Update basic project details</Text>
            <Text style={styles.editFieldLabel}>Project Name</Text>
            <TextInput
              style={styles.joinInput}
              placeholder="Project name"
              placeholderTextColor={Colors.textSecondary}
              value={editProjectName}
              onChangeText={setEditProjectName}
            />
            <Text style={styles.editFieldLabel}>Description</Text>
            <TextInput
              style={[styles.joinInput, { minHeight: 96 }]}
              placeholder="Project description"
              placeholderTextColor={Colors.textSecondary}
              multiline
              value={editProjectDescription}
              onChangeText={setEditProjectDescription}
            />
            <Text style={styles.editFieldLabel}>Category</Text>
            <TextInput
              style={styles.joinInput}
              placeholder="Category"
              placeholderTextColor={Colors.textSecondary}
              value={editProjectCategory}
              onChangeText={setEditProjectCategory}
            />
            <Text style={styles.editFieldLabel}>Max Members</Text>
            <TextInput
              style={styles.joinInput}
              placeholder="Max members"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
              value={editMaxMembers}
              onChangeText={setEditMaxMembers}
            />
            <View style={styles.joinModalActions}>
              <TouchableOpacity
                style={styles.joinModalCancel}
                onPress={() => setShowEditProjectModal(false)}
              >
                <Text style={styles.joinModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.joinModalSend}
                onPress={handleSaveProjectEdits}
                disabled={isSavingProject}
              >
                <Text style={styles.joinModalSendText}>{isSavingProject ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Remove Member Confirmation */}
      <ConfirmBottomSheet
        visible={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleRemoveMember}
        title="Remove Team Member?"
        message={`Are you sure you want to remove ${memberToRemove?.full_name || memberToRemove?.email} from the team? This action cannot be undone.`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmColor="#ef4444"
        icon="person-remove"
      />

      {/* Leave Team Confirmation */}
      <ConfirmBottomSheet
        visible={showLeaveConfirmation}
        onClose={() => setShowLeaveConfirmation(false)}
        onConfirm={handleLeaveTeam}
        title="Leave Team?"
        message={`Are you sure you want to leave ${team?.name}? You will need to send another request to rejoin.`}
        confirmText="Leave"
        cancelText="Stay"
        confirmColor="#ef4444"
        icon="exit-to-app"
      />

      {/* Join Request Confirmation */}
      <ConfirmBottomSheet
        visible={showJoinConfirmation}
        onClose={() => {
          setShowJoinConfirmation(false);
          setShowJoinRequestModal(true);
        }}
        onConfirm={handleSendJoinRequest}
        title="Send Join Request?"
        message={`Send your request to join ${team?.name}? The team creator will review and respond to your request.`}
        confirmText={isSendingRequest ? 'Sending...' : 'Send Request'}
        cancelText="Go Back"
        confirmColor="#fb7185"
        icon="send"
      />

      {/* Delete Project Confirmation */}
      <ConfirmBottomSheet
        visible={showDeleteProjectConfirmation}
        onClose={() => setShowDeleteProjectConfirmation(false)}
        onConfirm={handleDeleteProject}
        title="Delete Project?"
        message={`Are you sure you want to delete ${team?.name}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="#ef4444"
        icon="delete-outline"
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      textAlign: 'center',
      marginHorizontal: Spacing.sm,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.lg,
      gap: 8,
    },
    errorText: {
      fontSize: FontSizes.sm,
      color: Colors.error,
      textAlign: 'center',
    },
    
    // Project Header
    projectHeader: {
      padding: Spacing.lg,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    projectHeaderTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.sm,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    category: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      color: '#fb7185',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    aiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
      backgroundColor: '#ffe4e6',
    },
    aiText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: '#fb7185',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      textTransform: 'capitalize',
    },
    projectTitle: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.sm,
      lineHeight: 32,
    },
    projectDescription: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      lineHeight: 22,
      marginBottom: Spacing.md,
    },
    actionButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    changeStatusButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: '#fb7185',
      backgroundColor: 'transparent',
    },
    changeStatusText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fb7185',
    },
    editProjectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: '#fb7185',
      backgroundColor: 'transparent',
    },
    editProjectText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fb7185',
    },
    deleteProjectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: '#ef4444',
      backgroundColor: 'transparent',
    },
    deleteProjectText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#ef4444',
    },
    joinButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#fb7185',
    },
    joinButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    pendingBadge: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#fef3c7',
    },
    pendingText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#f59e0b',
    },
    fullBadge: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.border,
    },
    fullText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
    },
    closedBadge: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#fee2e2',
    },
    closedText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#ef4444',
    },
    leaveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: '#ef4444',
      backgroundColor: 'transparent',
    },
    leaveButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#ef4444',
    },

    // Stats
    statsContainer: {
      flexDirection: 'row',
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    statCard: {
      flex: 1,
      alignItems: 'center',
      padding: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      ...Shadows.sm,
    },
    statValue: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: 6,
    },
    statLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },

    // Progress
    progressSection: {
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    progressLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
      color: Colors.textSecondary,
    },
    progressValue: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      color: '#fb7185',
    },
    progressBar: {
      height: 10,
      backgroundColor: Colors.border,
      borderRadius: 5,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#fb7185',
      borderRadius: 5,
    },

    // Sections
    section: {
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.lg,
    },
    sectionTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    sectionSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
      lineHeight: 20,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginBottom: Spacing.sm,
    },
    requestsBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#fb7185',
      alignItems: 'center',
      justifyContent: 'center',
    },
    requestsCount: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      color: '#fff',
    },

    // Skills
    skillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    skillChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      backgroundColor: '#f1f5f9',
    },
    skillText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
      color: '#64748b',
    },

    // Join Requests
    requestCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.sm,
      ...Shadows.sm,
    },
    requestUser: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    requestUserInfo: {
      flex: 1,
    },
    requestUserName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    requestUserDept: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    requestMessage: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 6,
    },
    requestActions: {
      flexDirection: 'row',
      gap: 8,
    },
    rejectButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#fee2e2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    acceptButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#10b981',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Faculty Card
    facultyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      ...Shadows.sm,
    },
    facultyInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    facultyName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    facultyRole: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },

    // Team Members
    teamList: {
      gap: Spacing.sm,
    },
    memberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      ...Shadows.sm,
    },
    memberInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    memberActions: {
      alignItems: 'center',
      gap: 8,
    },
    memberDetails: {
      flex: 1,
    },
    memberNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    memberName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    leaderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
      backgroundColor: '#fef3c7',
    },
    leaderText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: '#f59e0b',
    },
    memberDept: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    memberMatchBadge: {
      width: 54,
      height: 54,
      borderRadius: 27,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberMatchPct: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    memberMatchLabel: {
      fontSize: 10,
      color: Colors.textSecondary,
      marginTop: -2,
    },
    removeMemberButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Invite Members
    inviteMembersButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#6366f1',
    },
    inviteMembersText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    pendingInvites: {
      marginTop: Spacing.md,
      gap: Spacing.sm,
    },
    pendingInvitesTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
    },
    pendingInviteItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: Spacing.sm,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    pendingInviteInfo: {
      flex: 1,
    },
    pendingInviteName: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    pendingInviteMeta: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    cancelInviteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fee2e2',
    },

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    statusModal: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: Spacing.lg,
      paddingBottom: Spacing.xl,
    },
    joinModal: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: Spacing.lg,
      paddingBottom: Spacing.xl,
    },
    inviteModal: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: Spacing.lg,
      paddingBottom: Spacing.xl,
      maxHeight: '85%',
    },
    modalHandle: {
      width: 40,
      height: 4,
      backgroundColor: Colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: Spacing.md,
    },
    modalTitle: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.xs,
    },
    modalSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: Spacing.md,
      lineHeight: 20,
    },
    editFieldLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: 6,
      marginTop: 2,
    },
    statusOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.xs,
    },
    statusOptionActive: {
      backgroundColor: '#ffe4e6',
    },
    statusOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statusOptionDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    statusOptionLabel: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.medium,
      color: Colors.text,
    },
    statusOptionLabelActive: {
      fontWeight: FontWeights.semibold,
      color: '#fb7185',
    },
    joinInput: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      minHeight: 100,
      textAlignVertical: 'top',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    inviteSearchInput: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      fontSize: FontSizes.sm,
      color: Colors.text,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    inviteFilterTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: Spacing.sm,
    },
    inviteFilterTab: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    inviteFilterTabActive: {
      backgroundColor: '#eef2ff',
      borderColor: '#c7d2fe',
    },
    inviteFilterText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
    },
    inviteFilterTextActive: {
      color: '#6366f1',
    },
    inviteFilterHint: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    inviteList: {
      maxHeight: 420,
    },
    inviteCard: {
      padding: Spacing.sm,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    inviteInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    inviteDetails: {
      flex: 1,
    },
    inviteName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    inviteMeta: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    inviteActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    inviteMatchBadge: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inviteMatchPct: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    inviteMatchLabel: {
      fontSize: 9,
      color: Colors.textSecondary,
      marginTop: -2,
    },
    inviteActionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#6366f1',
    },
    inviteActionButtonDisabled: {
      backgroundColor: '#c7d2fe',
    },
    inviteActionText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    inviteCancelButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#fee2e2',
    },
    inviteCancelText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#ef4444',
    },
    inviteLoading: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: Spacing.md,
    },
    inviteLoadingText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    inviteEmpty: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: Spacing.md,
    },
    inviteEmptyTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    inviteEmptySubtitle: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      textAlign: 'center',
    },

    // Inline Invite Actions (for invitee)
    inviteInlineContainer: {
      flex: 1,
      gap: 8,
    },
    inviteInlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.full,
      backgroundColor: '#eef2ff',
      alignSelf: 'flex-start',
    },
    inviteInlineText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#6366f1',
    },
    inviteInlineActions: {
      flexDirection: 'row',
      gap: 10,
    },
    inviteAcceptButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#10b981',
      alignItems: 'center',
    },
    inviteAcceptText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    inviteRejectButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#fee2e2',
      alignItems: 'center',
    },
    inviteRejectText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#ef4444',
    },
    inviteActionDisabled: {
      opacity: 0.6,
    },
    joinModalActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    joinModalCancel: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.border,
      alignItems: 'center',
    },
    joinModalCancelText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    joinModalSend: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#fb7185',
      alignItems: 'center',
    },
    joinModalSendText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
  });
