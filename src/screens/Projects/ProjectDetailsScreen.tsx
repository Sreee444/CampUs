import React, { useEffect, useState } from 'react';
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
  updateProjectStatus,
  sendJoinRequest,
  getUserJoinRequestStatus,
  getTeamJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  removeTeamMember,
} from '../../api/projects';
import { ProjectTeam } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import { getProjectStatusColor, PROJECT_STATUS_OPTIONS } from '../../utils/semanticColors';
import { createNotification } from '../../api/notifications';
import { supabase } from '../../api/supabase';

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
  
  // Status modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
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

  const creatorId = team?.creator?.id ?? team?.created_by;
  const isCreator = user?.id === creatorId;
  const isAdmin = profile?.role === 'admin';
  const canManageTeam = isCreator || isAdmin;
  const isMember = !!team?.members?.some((member) => member.id === user?.id);
  const isTeamFull = team?.max_members ? (team.members_count || 0) >= team.max_members : false;

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
      if (user?.id && !data.members?.some((m) => m.id === user.id)) {
        try {
          const requestStatus = await getUserJoinRequestStatus(teamId, user.id);
          setJoinRequestStatus(requestStatus);
        } catch (err) {
          // No request found, that's okay
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

  const handleAcceptRequest = async (request: JoinRequest) => {
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

  const handleRemoveMember = async () => {
    if (!memberToRemove || !canManageTeam) return;

    try {
      setIsRemovingMember(true);
      await removeTeamMember(teamId, memberToRemove.id);
      
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
      
      await removeTeamMember(teamId, user.id);
      
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
              {renderJoinButton()}
            </View>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <MaterialIcons name="group" size={24} color="#fb7185" />
              <Text style={styles.statValue}>{team?.members_count || 0}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="person-add" size={24} color="#10b981" />
              <Text style={styles.statValue}>{team?.max_members || 0}</Text>
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
          {team?.max_members && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Team Progress</Text>
                <Text style={styles.progressValue}>
                  {Math.round(((team.members_count || 0) / team.max_members) * 100)}%
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, ((team.members_count || 0) / team.max_members) * 100)}%`,
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
          {canManageTeam && pendingJoinRequests.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Join Requests</Text>
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsCount}>{pendingJoinRequests.length}</Text>
                </View>
              </View>
              {pendingJoinRequests.map((request) => (
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
            <Text style={styles.sectionTitle}>Team Members ({team?.members_count || 0})</Text>
            <View style={styles.teamList}>
              {(team?.members || []).map((member) => {
                const isLeader = member.id === creatorId;
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
                    {canManageTeam && !isLeader && (
                      <TouchableOpacity
                        style={styles.removeMemberButton}
                        onPress={() => setMemberToRemove(member)}
                      >
                        <MaterialIcons name="remove-circle-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

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
