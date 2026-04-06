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
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
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
  getUserJoinRequestStatus,
  getTeamJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  acceptProjectInvite,
  rejectProjectInvite,
  cancelProjectInvite,
  removeTeamMember,
  removeProjectMentor,
} from '../../api/projects';
import { updateMentorshipRequestStatus } from '../../api/mentors';
import { getProjectChatId, ensureProjectChat } from '../../api/projectChat';
import { ProjectTeam, ReportContentType } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';
import ReportModal from '../../components/ReportModal';
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import DropdownSheet from '../../components/DropdownSheet';
import { getProjectStatusColor, getTeamFillColor, PROJECT_STATUS_OPTIONS } from '../../utils/semanticColors';
import { createNotification } from '../../api/notifications';
import { supabase } from '../../api/supabase';
import { isAdminRole } from '../../utils/roles';
import { suggestBestProjectMembers } from '../../api/ai';

type ProjectDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ProjectDetails'>;
type ProjectDetailsScreenRouteProp = RouteProp<RootStackParamList, 'ProjectDetails'>;

const PROJECT_CATEGORIES = [
  'Web App', 'Mobile App', 'AI/ML', 'IoT', 'Game',
  'API/Backend', 'Desktop App', 'Data Science', 'Other',
];

const AI_RESULT_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];


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
  const [isHandlingInvite, setIsHandlingInvite] = useState(false);
  const [showRemoveMentorConfirmation, setShowRemoveMentorConfirmation] = useState(false);
  const [isRemovingMentor, setIsRemovingMentor] = useState(false);
  const [hasPendingProjectMentorRequest, setHasPendingProjectMentorRequest] = useState(false);
  const [pendingProjectMentorRequestId, setPendingProjectMentorRequestId] = useState<string | null>(null);
  const [isCancellingProjectMentorRequest, setIsCancellingProjectMentorRequest] = useState(false);

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
  const [editGithubUrl, setEditGithubUrl] = useState('');
  const [editDemoUrl, setEditDemoUrl] = useState('');

  // Join request modal
  const [showJoinRequestModal, setShowJoinRequestModal] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Report modal state
  const [reportModalState, setReportModalState] = useState({
    visible: false,
    contentType: 'project' as ReportContentType,
    contentId: '',
  });

  // Remove member confirmation
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  // Leave team confirmation
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);

  // Change leader
  const [isChangingLeader, setIsChangingLeader] = useState(false);

  // Project mentorship chat
  const [projectChatId, setProjectChatId] = useState<string | null>(null);
  const [isOpeningProjectChat, setIsOpeningProjectChat] = useState(false);
  const [isGeneratingAiPicks, setIsGeneratingAiPicks] = useState(false);
  const [aiResultCount, setAiResultCount] = useState(5);
  const [showAiCountModal, setShowAiCountModal] = useState(false);
  const [showAiCountDropdown, setShowAiCountDropdown] = useState(false);

  // Member action sheet (3-dot menu)
  const [memberActionTarget, setMemberActionTarget] = useState<any>(null);

  // Join request confirmation
  const [showJoinConfirmation, setShowJoinConfirmation] = useState(false);
  const [showDeleteProjectConfirmation, setShowDeleteProjectConfirmation] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);

  const creatorId = team?.creator?.id ?? team?.created_by;
  const isCreator = user?.id === creatorId;
  const isAdmin = isAdminRole(profile?.role);
  const canManageTeam = isCreator || isAdmin;
  const canManageMembers = canManageTeam;
  const teamMembers = team?.members || [];
  // Filter out advisors from team members list (they're shown in Project Mentor section)
  const nonAdvisorMembers = teamMembers.filter((m: any) => m.member_role !== 'advisor');
  const hasCreatorInMembers = !!creatorId && nonAdvisorMembers.some((member) => member.id === creatorId);
  const effectiveMembersCount = nonAdvisorMembers.length + (creatorId && !hasCreatorInMembers ? 1 : 0);
  const safeMembersCount = Math.max(0, effectiveMembersCount);
  const safeMaxMembers = Math.max(0, Number(team?.max_members) || 0);
  const teamProgressPercent = safeMaxMembers > 0
    ? Math.min(100, Math.round((safeMembersCount / safeMaxMembers) * 100))
    : 0;
  const teamFillColor = getTeamFillColor(teamProgressPercent);
  const displayMembers = hasCreatorInMembers || !team?.creator ? nonAdvisorMembers : [team.creator, ...nonAdvisorMembers];
  const isMember = !!user?.id && (isCreator || teamMembers.some((member) => member.id === user?.id));
  const isTeamFull = safeMaxMembers > 0 ? safeMembersCount >= safeMaxMembers : false;
  const normalizedProjectStatus = (team?.status || 'planning').toLowerCase().replace(/_/g, '-').trim();
  const closedProjectStatuses = new Set(['cancelled', 'canceled', 'completed', 'on-hold', 'on hold', 'closed']);
  const isProjectClosedForRecruitment =
    closedProjectStatuses.has(normalizedProjectStatus) ||
    closedProjectStatuses.has(normalizedProjectStatus.replace(/\s+/g, '-')) ||
    closedProjectStatuses.has(normalizedProjectStatus.replace(/-/g, ' '));
  const isRecruitingOpen = team?.is_recruiting !== false;
  const isRecruitingBlocked = isProjectClosedForRecruitment || !isRecruitingOpen;
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

  useFocusEffect(
    useCallback(() => {
      if (!teamId) return;
      loadTeamData();
    }, [teamId])
  );

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

        const isProjectCreator = user.id === (data.created_by || data.creator?.id);
        if (isProjectCreator && !(data as any)?.mentor_id) {
          try {
            const { data: pendingRequest, error: pendingMentorReqError } = await supabase
              .from('mentorship_requests')
              .select('id')
              .eq('mentee_id', user.id)
              .eq('project_id', teamId)
              .eq('purpose', 'project')
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle<{ id: string }>();

            if (pendingMentorReqError) throw pendingMentorReqError;
            setHasPendingProjectMentorRequest(!!pendingRequest?.id);
            setPendingProjectMentorRequestId(pendingRequest?.id || null);
          } catch (pendingErr) {
            console.error('Failed to load pending mentorship request state', pendingErr);
            setHasPendingProjectMentorRequest(false);
            setPendingProjectMentorRequestId(null);
          }
        } else {
          setHasPendingProjectMentorRequest(false);
          setPendingProjectMentorRequestId(null);
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

      // Load project team chat ID (non-fatal)
      try {
        const chatId = await getProjectChatId(teamId);
        setProjectChatId(chatId);
      } catch (err) {
        console.error('[ProjectDetails] Failed to load project chat ID:', err);
        // Non-fatal — chat may not exist yet
      }
    } catch (err) {
      console.error('Failed to load team details', err);
      setError('Unable to load team details at the moment.');
    } finally {
      setIsLoading(false);
    }
  };

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
    setEditGithubUrl((team as any).github_url || '');
    setEditDemoUrl((team as any).demo_url || '');
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

    if (parsedMaxMembers > 10) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Maximum members cannot exceed 10',
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
        github_url: editGithubUrl.trim() || null,
        demo_url: editDemoUrl.trim() || null,
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
      const isMentorshipConstraintError =
        err?.code === '23514' &&
        typeof err?.message === 'string' &&
        err.message.includes('chk_project_purpose');

      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: isMentorshipConstraintError
          ? 'Close or reject active project mentorship requests before deleting this project.'
          : err?.message || 'Unable to delete project',
      });
    }
  };

  const handleJoinRequestClick = () => {
    // Show confirmation after user has written message
    setShowJoinRequestModal(false);
    setShowJoinConfirmation(true);
  };

  const handleOpenInviteModal = () => {
    if (isRecruitingBlocked) {
      Toast.show({
        type: 'info',
        text1: 'Invites Disabled',
        text2: isProjectClosedForRecruitment
          ? `This project is ${normalizedProjectStatus.replace(/-/g, ' ')}.`
          : 'Recruitment is currently closed for this project.',
      });
      return;
    }

    if (isTeamFull) {
      Toast.show({
        type: 'info',
        text1: 'Team Full',
        text2: 'This project has reached the maximum members.',
      });
      return;
    }
    navigation.navigate('ProjectInviteMembers', { teamId });
  };

  const handleGenerateAiPicks = async () => {
    if (!isCreator || !team?.id || !user?.id || isGeneratingAiPicks) return;

    if (isRecruitingBlocked) {
      Toast.show({
        type: 'info',
        text1: 'Invites Disabled',
        text2: isProjectClosedForRecruitment
          ? `This project is ${normalizedProjectStatus.replace(/-/g, ' ')}.`
          : 'Recruitment is currently closed for this project.',
      });
      return;
    }

    if (isTeamFull) {
      Toast.show({
        type: 'info',
        text1: 'Team Full',
        text2: 'This project has reached the maximum members.',
      });
      return;
    }

    try {
      setIsGeneratingAiPicks(true);
      const result = await suggestBestProjectMembers(team.id, {
        requestingUserId: user.id,
        maxCandidates: Math.max(8, aiResultCount * 2),
        resultCount: aiResultCount,
      });

      const aiUserIds = (result.candidates || []).map((candidate) => candidate.id).filter(Boolean);
      navigation.navigate('ProjectInviteMembers', {
        teamId,
        aiRecommendedUserIds: aiUserIds,
        openWithAiPicks: true,
        aiFallbackMode: Boolean(result.usedFallback),
      });

      Toast.show({
        type: result.usedFallback ? 'info' : 'success',
        text1: result.usedFallback
          ? 'Fallback picks generated'
          : result.fromCache
            ? 'AI picks loaded from cache'
            : 'AI picks generated',
        text2: result.usedFallback
          ? `${aiUserIds.length} users ranked locally because backend AI is unavailable.`
          : `Top ${aiUserIds.length} AI-recommended users are ready to invite.`,
      });
    } catch (err: any) {
      console.error('Failed to generate AI team picks', err);
      Toast.show({
        type: 'error',
        text1: 'AI suggestion failed',
        text2: err?.message || 'Could not generate suggestions right now',
      });
    } finally {
      setIsGeneratingAiPicks(false);
    }
  };

  const handleSendJoinRequest = async () => {
    if (!user?.id || !team) return;

    if (isRecruitingBlocked) {
      Toast.show({
        type: 'error',
        text1: 'Cannot Join',
        text2: isProjectClosedForRecruitment
          ? `This project is ${normalizedProjectStatus.replace(/-/g, ' ')}`
          : 'Recruitment is currently closed for this project.',
      });
      setShowJoinConfirmation(false);
      return;
    }

    try {
      setIsSendingRequest(true);
      setShowJoinConfirmation(false);

      const request: any = await sendJoinRequest(teamId, user.id, joinMessage.trim() || undefined);

      // Try to send notifications (don't fail if this fails)
      try {
        // Notify team creator
        if (creatorId) {
          await createNotification({
            user_id: creatorId,
            title: 'New Join Request',
            body: `${profile?.full_name || user?.email || 'Someone'} wants to join ${team.name}`,
            type: 'project_request',
            related_id: teamId,
            metadata: {
              project_request_id: request?.id,
              requester_user_id: user.id,
              team_id: teamId,
            },
          });
        }

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

      if (creatorId) {
        await createNotification({
          user_id: creatorId,
          title: 'Invite Accepted',
          body: `${profile?.full_name || user.email || 'A user'} accepted the invite to ${team.name}`,
          type: 'project_update',
          related_id: teamId,
        });
      }

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

      if (creatorId) {
        await createNotification({
          user_id: creatorId,
          title: 'Invite Declined',
          body: `${profile?.full_name || user?.email || 'A user'} declined the invite to ${team.name}`,
          type: 'project_update',
          related_id: teamId,
        });
      }

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
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Cancel Failed',
        text2: err?.message || 'Unable to cancel invite',
      });
    }
  };

  // ─── Change Team Leader ──────────────────────────────────────────────────────
  const handleChangeLeader = (newLeaderId: string, newLeaderName: string) => {
    if (!isCreator || !team) return;

    Alert.alert(
      'Transfer Leadership',
      `Make ${newLeaderName} the new project leader? You will become a regular member.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsChangingLeader(true);
              // Supabase generic DB type maps this to `never` — casting via typed object
              const updatePayload: Record<string, string> = { created_by: newLeaderId };
              const { error: updateError } = await (supabase
                .from('project_teams') as any)
                .update(updatePayload)
                .eq('id', teamId);

              await createNotification({
                user_id: newLeaderId,
                title: 'You are now the Project Leader',
                body: `${profile?.full_name || user?.email || 'Previous leader'} made you the leader of ${team.name}`,
                type: 'project_update',
                related_id: teamId,
              });

              Toast.show({ type: 'success', text1: 'Leadership transferred', text2: `${newLeaderName} is now the project leader` });
              await loadTeamData();
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Transfer Failed', text2: err?.message || 'Unable to transfer leadership' });
            } finally {
              setIsChangingLeader(false);
            }
          },
        },
      ]
    );
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

    if (isAdminRole(memberToRemove.role)) {
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
        if (creatorId) {
          await createNotification({
            user_id: creatorId,
            title: 'Team Member Left',
            body: `${profile?.full_name || user?.email || 'A member'} left ${team.name}`,
            type: 'project_update',
            related_id: teamId,
          });
        }

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

  const handleRemoveMentor = async () => {
    if (!team || !canManageTeam || !user?.id || !(team as any)?.mentor_id) return;

    try {
      setIsRemovingMentor(true);
      await removeProjectMentor(teamId, user.id);

      try {
        await createNotification({
          user_id: (team as any).mentor_id,
          title: 'Removed from Project Mentor Role',
          body: `You have been removed as mentor from ${team.name}`,
          type: 'project_update',
          related_id: teamId,
        });
      } catch (notifErr) {
        console.error('Failed to notify removed mentor:', notifErr);
      }

      Toast.show({
        type: 'success',
        text1: 'Mentorship Ended',
        text2: `${(team as any)?.mentor?.full_name || 'Mentor'} removed from project mentor role`,
      });

      setShowRemoveMentorConfirmation(false);
      await loadTeamData();
    } catch (err: any) {
      console.error('Failed to remove mentor', err);
      Toast.show({
        type: 'error',
        text1: 'Remove Failed',
        text2: err?.message || 'Unable to remove mentor',
      });
    } finally {
      setIsRemovingMentor(false);
    }
  };

  const handleCancelProjectMentorRequest = async () => {
    if (!pendingProjectMentorRequestId) return;

    try {
      setIsCancellingProjectMentorRequest(true);
      await updateMentorshipRequestStatus(pendingProjectMentorRequestId, 'rejected');
      Toast.show({
        type: 'success',
        text1: 'Request Cancelled',
        text2: 'Pending mentor request has been cancelled.',
      });
      await loadTeamData();
    } catch (err: any) {
      console.error('Failed to cancel pending mentor request', err);
      Toast.show({
        type: 'error',
        text1: 'Cancel Failed',
        text2: err?.message || 'Unable to cancel mentor request',
      });
    } finally {
      setIsCancellingProjectMentorRequest(false);
    }
  };

  const notifyAdmins = async (title: string, body: string) => {
    try {
      // Get all admin users
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'developer']);

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

  const currentStatus = team?.status || 'planning';
  const statusInfo = getProjectStatusColor(currentStatus);

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
    if (isRecruitingBlocked) {
      const closedLabel = normalizedProjectStatus.replace(/-/g, ' ');
      return (
        <View style={styles.closedBadge}>
          <MaterialIcons name="block" size={16} color="#ef4444" />
          <Text style={styles.closedText}>
            {isProjectClosedForRecruitment
              ? (closedLabel === 'cancelled' || closedLabel === 'canceled'
                ? 'Project Cancelled'
                : closedLabel === 'completed'
                  ? 'Project Completed'
                  : closedLabel === 'on hold'
                    ? 'Project On Hold'
                    : 'Recruitment Closed')
              : 'Recruitment Closed'}
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
        style={[styles.joinButton, { backgroundColor: statusInfo.color }]}
        onPress={() => setShowJoinRequestModal(true)}
      >
        <MaterialIcons name="group-add" size={18} color="#fff" />
        <Text style={styles.joinButtonText}>Request to Join</Text>
      </TouchableOpacity>
    );
  };

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
        <TouchableOpacity style={styles.headerMenuBtn} onPress={() => setShowProjectMenu(true)}>
          <MaterialIcons name="more-vert" size={24} color={Colors.text} />
        </TouchableOpacity>
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
                    <MaterialIcons name="auto-awesome" size={12} color="#4f46e5" />
                    <Text style={styles.aiText}>AI</Text>
                  </View>
                )}
              </View>

              {canManageTeam ? (
                <TouchableOpacity
                  style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}
                  onPress={() => setShowStatusModal(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                  <Text style={[styles.statusText, { color: statusInfo.color }]}>
                    {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).replace(/-/g, ' ')}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={16} color={statusInfo.color} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                  <Text style={[styles.statusText, { color: statusInfo.color }]}>
                    {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).replace(/-/g, ' ')}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.projectTitle}>{team?.name}</Text>
            <Text style={styles.projectDescription}>
              {team?.description || 'No description provided yet.'}
            </Text>

            {/* Action Buttons */}
            {canManageTeam && (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: statusInfo.color }]}
                  onPress={() => setShowStatusModal(true)}
                >
                  <MaterialIcons name="swap-horiz" size={16} color={statusInfo.color} />
                  <Text style={[styles.actionBtnText, { color: statusInfo.color }]}>Status</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: '#4f46e5' }]}
                  onPress={handleOpenEditProject}
                >
                  <MaterialIcons name="edit" size={16} color="#4f46e5" />
                  <Text style={[styles.actionBtnText, { color: '#4f46e5' }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { borderColor: (isTeamFull || isRecruitingBlocked) ? '#94a3b8' : '#4f46e5' },
                    (isTeamFull || isRecruitingBlocked) && { opacity: 0.6 },
                  ]}
                  onPress={handleOpenInviteModal}
                >
                  <MaterialIcons
                    name={(isTeamFull || isRecruitingBlocked) ? 'group' : 'person-add'}
                    size={16}
                    color={(isTeamFull || isRecruitingBlocked) ? '#64748b' : '#4f46e5'}
                  />
                  <Text style={[styles.actionBtnText, { color: (isTeamFull || isRecruitingBlocked) ? '#64748b' : '#4f46e5' }]}> 
                    {isTeamFull ? 'Team Full' : isRecruitingBlocked ? 'Recruiting Closed' : 'Invite'}
                  </Text>
                </TouchableOpacity>
                {isCreator && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: '#0f766e' }, isGeneratingAiPicks && { opacity: 0.7 }]}
                    onPress={() => setShowAiCountModal(true)}
                    disabled={isGeneratingAiPicks}
                  >
                    {isGeneratingAiPicks ? (
                      <ActivityIndicator size="small" color="#0f766e" />
                    ) : (
                      <MaterialIcons name="auto-awesome" size={16} color="#0f766e" />
                    )}
                    <Text style={[styles.actionBtnText, { color: '#0f766e' }]}>
                      {isGeneratingAiPicks ? 'Thinking...' : 'AI Picks'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: '#dc2626' }]}
                  onPress={() => setShowDeleteProjectConfirmation(true)}
                >
                  <MaterialIcons name="delete-outline" size={16} color="#dc2626" />
                  <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Role-based action row */}
            <View style={styles.roleActions}>
              {renderJoinButton()}
              {isMember && (
                <TouchableOpacity
                  style={[styles.teamChatButton, { backgroundColor: statusInfo.color }]}
                  onPress={async () => {
                    if (isOpeningProjectChat) return;
                    try {
                      setIsOpeningProjectChat(true);
                      let chatId = projectChatId;
                      if (!chatId) {
                        const memberIds = (team?.members || []).map((m) => m.id).filter(Boolean);
                        if (team?.creator?.id) memberIds.push(team.creator.id);
                        chatId = await ensureProjectChat(teamId, memberIds);
                        setProjectChatId(chatId);
                      }
                      if (chatId) {
                        navigation.navigate('ProjectChat', { chatId, teamName: team?.name || 'Project Chat' });
                      }
                    } catch (e: any) {
                      console.error('[ProjectDetails] Failed to open Team Chat:', e);
                      Toast.show({ type: 'error', text1: 'Could not open chat', text2: e?.message });
                    } finally {
                      setIsOpeningProjectChat(false);
                    }
                  }}
                  disabled={isOpeningProjectChat}
                >
                  {isOpeningProjectChat
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                      <MaterialIcons name="chat" size={18} color="#fff" />
                      <Text style={styles.teamChatBtnText}>Team Chat</Text>
                    </>
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <MaterialIcons name="group" size={24} color={statusInfo.color} />
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
                <Text style={[styles.progressValue, { color: teamFillColor }]}>{teamProgressPercent}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${teamProgressPercent}%`,
                      backgroundColor: teamFillColor,
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
                {(team?.required_skills ?? []).map((skill) => (
                  <View key={skill} style={styles.skillChip}>
                    <Text style={styles.skillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Project Links */}
          {((team as any)?.github_url || (team as any)?.demo_url) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Project Links</Text>
              {(team as any)?.github_url && (
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => Linking.openURL((team as any).github_url)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.linkRowIcon, { backgroundColor: '#eef2ff' }]}>
                    <MaterialIcons name="code" size={18} color="#4f46e5" />
                  </View>
                  <View style={styles.linkRowContent}>
                    <Text style={styles.linkRowLabel}>GitHub Repository</Text>
                    <Text style={styles.linkRowUrl} numberOfLines={1}>{(team as any).github_url}</Text>
                  </View>
                  <MaterialIcons name="open-in-new" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
              {(team as any)?.demo_url && (
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => Linking.openURL((team as any).demo_url)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.linkRowIcon, { backgroundColor: '#ecfeff' }]}>
                    <MaterialIcons name="language" size={18} color="#0891b2" />
                  </View>
                  <View style={styles.linkRowContent}>
                    <Text style={styles.linkRowLabel}>Live Demo</Text>
                    <Text style={styles.linkRowUrl} numberOfLines={1}>{(team as any).demo_url}</Text>
                  </View>
                  <MaterialIcons name="open-in-new" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
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

          {/* ── Project Mentor ── */}
          {(team as any)?.mentor ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Project Mentor</Text>
              <TouchableOpacity
                style={styles.facultyCard}
                onPress={() => navigation.navigate('PublicProfile', { userId: (team as any).mentor.id })}
                activeOpacity={0.7}
              >
                <View style={styles.facultyInfo}>
                  <UserAvatar
                    uri={(team as any).mentor.avatar_url}
                    name={(team as any).mentor.full_name || 'Mentor'}
                    size={48}
                    role={(team as any).mentor.role}
                    showRing
                  />
                  <View>
                    <Text style={styles.mentorName}>{(team as any).mentor.full_name || 'Mentor'}</Text>
                    <Text style={styles.facultyRole}>{(team as any).mentor.department || (team as any).mentor.role || 'Mentor'}</Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
              {canManageTeam && (
                <TouchableOpacity
                  style={[styles.inviteMembersButton, { marginTop: 10, backgroundColor: '#ef4444' }]}
                  onPress={() => setShowRemoveMentorConfirmation(true)}
                  disabled={isRemovingMentor}
                >
                  <MaterialIcons name="person-remove" size={18} color="#fff" />
                  <Text style={styles.inviteMembersText}>{isRemovingMentor ? 'Removing...' : 'Remove Mentor'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isCreator ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Project Mentor</Text>
              <Text style={[styles.sectionSubtitle, { marginBottom: 8 }]}>
                {hasPendingProjectMentorRequest
                  ? 'Mentor request pending. Wait for mentor response before sending another request.'
                  : 'No mentor assigned yet.'}
              </Text>
              {hasPendingProjectMentorRequest ? (
                <TouchableOpacity
                  style={[styles.inviteMembersButton, { backgroundColor: '#ef4444' }]}
                  onPress={handleCancelProjectMentorRequest}
                  disabled={isCancellingProjectMentorRequest}
                >
                  {isCancellingProjectMentorRequest ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="cancel" size={18} color="#fff" />
                      <Text style={styles.inviteMembersText}>Cancel Pending Request</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.inviteMembersButton,
                    { backgroundColor: '#4F46E5' },
                  ]}
                  onPress={() => (navigation as any).navigate('MentorHub', { prefillProjectId: teamId })}
                >
                  <MaterialIcons name="school" size={18} color="#fff" />
                  <Text style={styles.inviteMembersText}>Find a Mentor</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Team Members */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Members ({safeMembersCount})</Text>
            <View style={styles.teamList}>
              {displayMembers.map((member) => {
                const isLeader = member.id === creatorId;
                const isAdminMember = isAdminRole(member.role);
                const canShowMenu = isCreator && !isLeader && !isAdminMember;
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
                      {canShowMenu && (
                        <TouchableOpacity
                          style={styles.memberMenuDots}
                          onPress={() => setMemberActionTarget(member)}
                        >
                          <MaterialIcons name="more-vert" size={22} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Invite Members — pending invites only (button moved to header actions) */}
          {isCreator && pendingInvites.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pending Invites</Text>
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

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Status Change Modal */}
      <Modal
        visible={showAiCountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAiCountModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAiCountModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.aiCountModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>AI Picks</Text>
            <Text style={styles.modalSubtitle}>Choose how many top AI results to show (max 10).</Text>

            <TouchableOpacity
              style={styles.aiCountPickerBtn}
              onPress={() => setShowAiCountDropdown(true)}
            >
              <Text style={styles.aiCountPickerText}>Top {aiResultCount}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.aiCountActions}>
              <TouchableOpacity
                style={styles.joinModalCancel}
                onPress={() => setShowAiCountModal(false)}
              >
                <Text style={styles.joinModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.joinModalSend, isGeneratingAiPicks && { opacity: 0.7 }]}
                onPress={async () => {
                  setShowAiCountModal(false);
                  await handleGenerateAiPicks();
                }}
                disabled={isGeneratingAiPicks}
              >
                <Text style={styles.joinModalSendText}>{isGeneratingAiPicks ? 'Thinking...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <DropdownSheet
        visible={showAiCountDropdown}
        title="Select AI result count"
        options={AI_RESULT_COUNT_OPTIONS.map((count) => `Top ${count}`)}
        onSelect={(value) => {
          const parsed = Number(String(value).replace(/[^0-9]/g, ''));
          if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
            setAiResultCount(parsed);
          }
          setShowAiCountDropdown(false);
        }}
        onClose={() => setShowAiCountDropdown(false)}
      />

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
                  {isActive && <MaterialIcons name="check" size={20} color="#4f46e5" />}
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

      {/* Edit Project Modal */}
      <Modal
        visible={showEditProjectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditProjectModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditProjectModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.editModal}>
            <View style={styles.modalHandle} />
            {/* Fixed header */}
            <View style={styles.editModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit Project</Text>
                <Text style={styles.modalSubtitle}>Update project details</Text>
              </View>
              <TouchableOpacity
                style={[styles.editSaveBtn, isSavingProject && { opacity: 0.6 }]}
                onPress={handleSaveProjectEdits}
                disabled={isSavingProject}
              >
                <Text style={styles.editSaveBtnText}>{isSavingProject ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable content */}
            <ScrollView
              style={styles.editModalScroll}
              contentContainerStyle={styles.editModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Project Name */}
              <Text style={styles.editFieldLabel}>Project Name *</Text>
              <TextInput
                style={styles.editInput}
                placeholder="Enter project name"
                placeholderTextColor={Colors.textSecondary}
                value={editProjectName}
                onChangeText={setEditProjectName}
              />

              {/* Description */}
              <Text style={styles.editFieldLabel}>Description *</Text>
              <TextInput
                style={styles.editInputMultiline}
                placeholder="Describe your project…"
                placeholderTextColor={Colors.textSecondary}
                multiline
                numberOfLines={4}
                value={editProjectDescription}
                onChangeText={setEditProjectDescription}
              />

              {/* Category — chip selector */}
              <Text style={styles.editFieldLabel}>Category</Text>
              <View style={styles.editCategoryGrid}>
                {PROJECT_CATEGORIES.map((cat) => {
                  const active = editProjectCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.editCategoryChip, active && styles.editCategoryChipActive]}
                      onPress={() => setEditProjectCategory(active ? '' : cat)}
                    >
                      <Text style={[styles.editCategoryChipText, active && styles.editCategoryChipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Max Members — stepper */}
              <Text style={styles.editFieldLabel}>Max Members</Text>
              <View style={styles.editStepper}>
                <TouchableOpacity
                  style={[styles.editStepperBtn, Number(editMaxMembers) <= safeMembersCount && styles.editStepperBtnDisabled]}
                  onPress={() => {
                    const n = Number(editMaxMembers);
                    if (n > safeMembersCount) setEditMaxMembers(String(n - 1));
                  }}
                  disabled={Number(editMaxMembers) <= safeMembersCount}
                >
                  <MaterialIcons name="remove" size={18} color={Number(editMaxMembers) <= safeMembersCount ? Colors.textSecondary : '#4f46e5'} />
                </TouchableOpacity>
                <View style={styles.editStepperValue}>
                  <Text style={styles.editStepperValueText}>{editMaxMembers}</Text>
                  <Text style={styles.editStepperHint}>/{safeMaxMembers} current max · {safeMembersCount} members</Text>
                </View>
                <TouchableOpacity
                  style={[styles.editStepperBtn, Number(editMaxMembers) >= 10 && styles.editStepperBtnDisabled]}
                  onPress={() => {
                    const n = Number(editMaxMembers);
                    if (n < 10) setEditMaxMembers(String(n + 1));
                  }}
                  disabled={Number(editMaxMembers) >= 10}
                >
                  <MaterialIcons name="add" size={18} color={Number(editMaxMembers) >= 10 ? Colors.textSecondary : '#4f46e5'} />
                </TouchableOpacity>
              </View>

              {/* GitHub URL */}
              <Text style={styles.editFieldLabel}>GitHub Repository</Text>
              <View style={styles.editInputRow}>
                <MaterialIcons name="code" size={18} color="#4f46e5" style={styles.editInputIcon} />
                <TextInput
                  style={styles.editInputInner}
                  placeholder="https://github.com/username/repo"
                  placeholderTextColor={Colors.textSecondary}
                  value={editGithubUrl}
                  onChangeText={setEditGithubUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>

              {/* Demo URL */}
              <Text style={styles.editFieldLabel}>Demo / Live URL</Text>
              <View style={styles.editInputRow}>
                <MaterialIcons name="language" size={18} color="#0891b2" style={styles.editInputIcon} />
                <TextInput
                  style={styles.editInputInner}
                  placeholder="https://your-demo.com"
                  placeholderTextColor={Colors.textSecondary}
                  value={editDemoUrl}
                  onChangeText={setEditDemoUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>

              <View style={{ height: 16 }} />
            </ScrollView>
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

      <ConfirmBottomSheet
        visible={showRemoveMentorConfirmation}
        onClose={() => setShowRemoveMentorConfirmation(false)}
        onConfirm={handleRemoveMentor}
        title="Remove Project Mentor?"
        message={`Are you sure you want to remove ${(team as any)?.mentor?.full_name || 'this mentor'} from ${team?.name}?`}
        confirmText={isRemovingMentor ? 'Removing...' : 'Remove'}
        cancelText="Cancel"
        confirmColor="#ef4444"
        icon="person-remove"
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
        confirmColor="#4f46e5"
        icon="send"
      />

      {/* Member Action Sheet (3-dot menu) */}
      <Modal
        visible={!!memberActionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setMemberActionTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMemberActionTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.memberActionSheet}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { marginBottom: 4 }]}>
              {memberActionTarget?.full_name || 'Member'}
            </Text>
            <Text style={[styles.modalSubtitle, { marginBottom: 8 }]}>
              {memberActionTarget?.department || 'Team Member'}
            </Text>
            <View style={styles.memberActionDivider} />
            <TouchableOpacity
              style={styles.memberActionItem}
              onPress={() => {
                setMemberActionTarget(null);
                handleChangeLeader(
                  memberActionTarget.id,
                  memberActionTarget.full_name || memberActionTarget.email || 'this member'
                );
              }}
              disabled={isChangingLeader}
            >
              <MaterialIcons name="star-outline" size={22} color="#f59e0b" />
              <Text style={styles.memberActionItemText}>Make Project Leader</Text>
            </TouchableOpacity>
            <View style={styles.memberActionDivider} />
            <TouchableOpacity
              style={styles.memberActionItem}
              onPress={() => {
                setMemberToRemove(memberActionTarget);
                setMemberActionTarget(null);
              }}
            >
              <MaterialIcons name="person-remove" size={22} color="#ef4444" />
              <Text style={[styles.memberActionItemText, { color: '#ef4444' }]}>Remove from Team</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Project Menu (3-dot) */}
      <Modal
        visible={showProjectMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProjectMenu(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.projectMenuOverlay}
          onPress={() => setShowProjectMenu(false)}
        >
          <View style={styles.projectMenuSheet}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { marginBottom: 12 }]}>Project Options</Text>
            <TouchableOpacity
              style={styles.projectMenuItem}
              onPress={() => {
                setShowProjectMenu(false);
                setShowStatusModal(true);
              }}
            >
              <View style={[styles.projectMenuIcon, { backgroundColor: statusInfo.bg }]}>  
                <MaterialIcons name="swap-horiz" size={20} color={statusInfo.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.projectMenuItemText}>Change Status</Text>
                <Text style={styles.projectMenuItemSub}>Currently: {currentStatus.replace(/-/g, ' ')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.projectMenuItem}
              onPress={() => {
                setShowProjectMenu(false);
                handleOpenEditProject();
              }}
            >
              <View style={[styles.projectMenuIcon, { backgroundColor: '#eef2ff' }]}>
                <MaterialIcons name="edit" size={20} color="#4f46e5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.projectMenuItemText}>Edit Project</Text>
                <Text style={styles.projectMenuItemSub}>Name, description, members</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <View style={styles.projectMenuDivider} />
            <TouchableOpacity
              style={styles.projectMenuItem}
              onPress={() => {
                setShowProjectMenu(false);
                setReportModalState({
                  visible: true,
                  contentType: 'project',
                  contentId: teamId,
                });
              }}
            >
              <View style={[styles.projectMenuIcon, { backgroundColor: '#fee2e2' }]}>
                <MaterialIcons name="flag" size={20} color="#dc2626" />
              </View>
              <Text style={[styles.projectMenuItemText, { color: '#dc2626', flex: 1 }]}>Report Project</Text>
              <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
            </TouchableOpacity>

            {canManageTeam && (
              <>
                <View style={styles.projectMenuDivider} />
                <TouchableOpacity
                  style={styles.projectMenuItem}
                  onPress={() => {
                    setShowProjectMenu(false);
                    setShowDeleteProjectConfirmation(true);
                  }}
                >
                  <View style={[styles.projectMenuIcon, { backgroundColor: '#fee2e2' }]}>
                    <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
                  </View>
                  <Text style={[styles.projectMenuItemText, { color: '#dc2626', flex: 1 }]}>Delete Project</Text>
                  <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

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

      <ReportModal
        isVisible={reportModalState.visible}
        onClose={() => setReportModalState({ ...reportModalState, visible: false })}
        contentType={reportModalState.contentType}
        reportedContentId={reportModalState.contentId}
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
      color: '#4f46e5',
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
      backgroundColor: '#eef2ff',
    },
    aiText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: '#4f46e5',
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
      gap: 8,
      marginTop: Spacing.md,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      backgroundColor: 'transparent',
      flexGrow: 1,
      flexBasis: '40%',
    },
    actionBtnText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    aiCountModal: {
      width: '100%',
      maxWidth: 420,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      backgroundColor: Colors.card,
      gap: 12,
      ...Shadows.md,
    },
    aiCountPickerBtn: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: Colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    aiCountPickerText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    aiCountActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    roleActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    teamChatButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: BorderRadius.lg,
    },
    teamChatBtnText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    headerMenuBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    joinButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#4f46e5',
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
      color: '#4f46e5',
    },
    progressBar: {
      height: 10,
      backgroundColor: Colors.border,
      borderRadius: 5,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#4f46e5',
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
      backgroundColor: '#4f46e5',
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
    mentorName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#0369a1',
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
      backgroundColor: '#eef2ff',
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
      color: '#4f46e5',
    },
    joinInput: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      textAlignVertical: 'top',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    // Edit Project Modal
    editModal: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      paddingTop: Spacing.md,
    },
    editModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    editSaveBtn: {
      backgroundColor: '#4f46e5',
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: BorderRadius.full,
    },
    editSaveBtnText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    editModalScroll: {
      flexGrow: 0,
    },
    editModalScrollContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.xl,
    },
    editInput: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: 11,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    editInputMultiline: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: 11,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
      minHeight: 96,
      textAlignVertical: 'top',
    },
    editInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    editInputIcon: {
      marginRight: 8,
    },
    editInputInner: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      paddingVertical: 11,
    },
    editCategoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: Spacing.md,
    },
    editCategoryChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    editCategoryChipActive: {
      borderColor: '#4f46e5',
      backgroundColor: '#eef2ff',
    },
    editCategoryChipText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
      color: Colors.textSecondary,
    },
    editCategoryChipTextActive: {
      color: '#4f46e5',
      fontWeight: FontWeights.semibold,
    },
    editStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.sm,
    },
    editStepperBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#eef2ff',
    },
    editStepperBtnDisabled: {
      backgroundColor: Colors.border,
    },
    editStepperValue: {
      flex: 1,
      alignItems: 'center',
    },
    editStepperValueText: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    editStepperHint: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
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
      backgroundColor: '#4f46e5',
      alignItems: 'center',
    },
    joinModalSendText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    makeLeaderButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(245,158,11,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },
    memberMenuDots: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberActionSheet: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.xl,
      paddingVertical: 8,
      paddingHorizontal: 12,
      minWidth: 220,
      ...Shadows.md,
    },
    memberActionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: BorderRadius.md,
    },
    memberActionItemText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.medium,
      color: Colors.text,
    },
    memberActionDivider: {
      height: 1,
      backgroundColor: Colors.border,
      marginVertical: 2,
    },

    // Project Menu (3-dot)
    projectMenuOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    projectMenuSheet: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: Spacing.lg,
      paddingBottom: Spacing.xl,
    },
    projectMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    projectMenuIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectMenuItemText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    projectMenuItemSub: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    projectMenuDivider: {
      height: 1,
      backgroundColor: Colors.border,
      marginVertical: 4,
    },

    // Project Links (section rows)
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    linkRowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkRowContent: {
      flex: 1,
    },
    linkRowLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    linkRowUrl: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 1,
    },
  });
