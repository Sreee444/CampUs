// ================================================
// PUBLIC PROFILE SCREEN - REDESIGNED
// ================================================
// View other users' profiles with connection management
// Gradient background, lightweight sections, message button
// ================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { supabase } from '../../api/supabase';
import { Profile, ReportContentType } from '../../types/database';
import ReportModal from '../../components/ReportModal';
import {
  sendConnectionRequest,
  cancelConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  getConnectionStatus,
  ConnectionStatusResult,
} from '../../api/connections';
import { getUserVerifications, getMutualConnections, createDirectConversation } from '../../api/chat';
import { formatFacultyDesignation, getRoleDisplayLabel, isAdminRole, isLeadershipDesignation } from '../../utils/roles';

type PublicProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PublicProfile'>;
type PublicProfileScreenRouteProp = RouteProp<RootStackParamList, 'PublicProfile'>;

const ROLE_CONFIG: Record<string, { color: string; icon: string; label: string; gradient: [string, string] }> = {
  student:  { color: '#3b82f6', icon: 'school',        label: 'Student', gradient: ['#3b82f6', '#6366f1'] },
  faculty:  { color: '#f59e0b', icon: 'person',         label: 'Faculty', gradient: ['#f59e0b', '#ef4444'] },
  alumni:   { color: '#10b981', icon: 'workspace-premium', label: 'Alumni', gradient: ['#10b981', '#0891b2'] },
  admin:    { color: '#ef4444', icon: 'shield',          label: 'Admin',  gradient: ['#ef4444', '#7c3aed'] },
  developer:{ color: '#0f172a', icon: 'code',            label: 'Developer', gradient: ['#0f172a', '#1d4ed8'] },
};

export default function PublicProfileScreen() {
  const navigation = useNavigation<PublicProfileScreenNavigationProp>();
  const route = useRoute<PublicProfileScreenRouteProp>();
  const { userId } = route.params;
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);
  const isLeadership = isLeadershipDesignation(profile?.faculty_designation);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusResult>({ status: 'none' });
  const [actionLoading, setActionLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [connectionsCount, setConnectionsCount] = useState(0);
  const [verificationBadges, setVerificationBadges] = useState<any[]>([]);
  const [mutualConnectionsCount, setMutualConnectionsCount] = useState(0);
  const [connectionStatusOverride, setConnectionStatusOverride] = useState<ConnectionStatusResult['status'] | null>(null);
  const [reportModalState, setReportModalState] = useState({
    visible: false,
    contentType: 'user' as ReportContentType,
    contentId: '',
  });

  const buttonScale = useSharedValue(1);

  useEffect(() => {
    loadProfile();
    loadConnectionStatus();
    loadUserProjects();
    loadConnectionsCount();
    loadVerificationBadges();
    loadMutualConnections();
  }, [userId]);

  useFocusEffect(
    React.useCallback(() => {
      loadConnectionStatus();
      loadMutualConnections();
    }, [userId])
  );

  // =====================================
  // DATA LOADING
  // =====================================

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load profile',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadConnectionStatus = async () => {
    try {
      const status = await getConnectionStatus(userId);
      setConnectionStatus(status);
      if (status.status !== 'pending_sent') {
        setConnectionStatusOverride(null);
      }
    } catch (error) {
      console.error('Error loading connection status:', error);
    }
  };

  const loadUserProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('project_team_members')
        .select(`
          team_id,
          role,
          team:project_teams (
            id,
            name,
            description,
            status
          )
        `)
        .eq('user_id', userId)
        .limit(5);

      if (error) throw error;
      setUserProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadConnectionsCount = async () => {
    try {
      const { count } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .eq('status', 'accepted');
      setConnectionsCount(count || 0);
    } catch (_) {}
  };

  const loadVerificationBadges = async () => {
    try {
      const badges = await getUserVerifications(userId);
      setVerificationBadges(badges || []);
    } catch (error) {
      console.error('Error loading verification badges:', error);
    }
  };

  const loadMutualConnections = async () => {
    try {
      if (!user?.id) return;
      const mutualConnections = await getMutualConnections(user.id, userId);
      const mutualUsers = Array.isArray(mutualConnections?.mutual_users)
        ? mutualConnections.mutual_users.filter(
            (mutualUser: any) => mutualUser?.id && mutualUser.id !== user.id && mutualUser.id !== userId
          )
        : [];

      const safeCount = mutualUsers.length > 0
        ? mutualUsers.length
        : Math.max(0, Number(mutualConnections?.mutual_count || 0));

      setMutualConnectionsCount(safeCount);
    } catch (error) {
      console.error('Error loading mutual connections:', error);
    }
  };

  // =====================================
  // CONNECTION ACTIONS
  // =====================================

  const handleConnect = async () => {
    try {
      setActionLoading(true);
      animateButton();
      const result = await sendConnectionRequest(userId);
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Request Sent', text2: `Request sent to ${profile?.full_name || 'user'}` });
        loadConnectionStatus();
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: result.error || 'Could not send request' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'An error occurred' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    try {
      setActionLoading(true);
      animateButton();
      setConnectionStatusOverride('none');
      setConnectionStatus({ status: 'none' });
      const result = await cancelConnectionRequest(userId);
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Request Cancelled' });
        navigation.replace('PublicProfile' as never, { userId } as never);
      } else {
        setConnectionStatusOverride(null);
        loadConnectionStatus();
        Toast.show({ type: 'error', text1: 'Failed', text2: result.error || 'Could not cancel' });
      }
    } catch {
      setConnectionStatusOverride(null);
      loadConnectionStatus();
      Toast.show({ type: 'error', text1: 'Error', text2: 'An error occurred' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!connectionStatus.connectionId) return;
    try {
      setActionLoading(true);
      animateButton();
      const result = await acceptConnectionRequest(connectionStatus.connectionId);
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Connected!', text2: `You are now connected with ${profile?.full_name || 'this user'}` });
        loadConnectionStatus();
        loadConnectionsCount();
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: result.error || 'Could not accept' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'An error occurred' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!connectionStatus.connectionId) return;
    try {
      setActionLoading(true);
      const result = await rejectConnectionRequest(connectionStatus.connectionId);
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Request Rejected' });
        loadConnectionStatus();
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: result.error || 'Could not reject' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'An error occurred' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    if (!connectionStatus.connectionId) return;

    Alert.alert(
      'Unfriend user?',
      `You will remove ${profile?.full_name || 'this user'} from your connections.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              const result = await removeConnection(connectionStatus.connectionId!);
              if (result.success) {
                Toast.show({ type: 'success', text1: 'Connection removed' });
                loadConnectionStatus();
                loadConnectionsCount();
                loadMutualConnections();
              } else {
                Toast.show({ type: 'error', text1: 'Failed', text2: result.error || 'Could not remove connection' });
              }
            } catch {
              Toast.show({ type: 'error', text1: 'Error', text2: 'An error occurred' });
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // =====================================
  // MESSAGE BUTTON LOGIC
  // =====================================

  const handleMessage = async () => {
    if (!user?.id) return;
    try {
      setMessageLoading(true);
      const conversation = await createDirectConversation(user.id, userId);
      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        name: profile?.full_name || 'User',
        isGroup: false,
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Unable to start chat',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setMessageLoading(false);
    }
  };

  // =====================================
  // ANIMATIONS
  // =====================================

  const animateButton = () => {
    buttonScale.value = withSpring(0.95, {}, () => {
      buttonScale.value = withSpring(1);
    });
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  // =====================================
  // HELPERS
  // =====================================

  const getInitials = () => {
    if (!profile?.full_name) return 'U';
    const parts = profile.full_name.trim().split(' ');
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
  };

  const getRoleConfig = () => {
    return ROLE_CONFIG[profile?.role || ''] || {
      color: '#8b5cf6', icon: 'person', label: profile?.role || 'User',
      gradient: ['#8b5cf6', '#6366f1'] as [string, string],
    };
  };

  const formatYearValue = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '-';
    const raw = String(value).trim();
    if (!raw) return '-';

    // Row label already says "Year", so return only the value part.
    if (/^year\s*/i.test(raw)) {
      const withoutPrefix = raw.replace(/^year\s*/i, '').trim();
      return withoutPrefix || '-';
    }

    if (/^\d+$/.test(raw)) {
      return raw;
    }

    return raw;
  };

  // =====================================
  // RENDER: CONNECTION BUTTON
  // =====================================

  const renderConnectionButton = () => {
    if (user?.id === userId) return null;
    const status = connectionStatusOverride || connectionStatus.status;

    if (status === 'none' || status === 'rejected') {
      return (
        <Animated.View style={[buttonAnimatedStyle, styles.connectBtnWrap]}>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect} disabled={actionLoading} activeOpacity={0.85}>
            <LinearGradient colors={['#fb7185', '#f43f5e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.connectBtnGradient}>
              {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <MaterialIcons name="person-add" size={18} color="#fff" />
                  <Text style={styles.connectBtnText}>Connect</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    if (status === 'pending_sent') {
      return (
        <Animated.View style={[buttonAnimatedStyle, styles.connectBtnWrap]}>
          <TouchableOpacity style={[styles.connectBtn, styles.connectBtnOutline]} onPress={handleCancelRequest} disabled={actionLoading} activeOpacity={0.85}>
            {actionLoading ? <ActivityIndicator color={Colors.textSecondary} size="small" /> : (
              <>
                <MaterialIcons name="schedule" size={18} color={Colors.textSecondary} />
                <Text style={[styles.connectBtnText, { color: Colors.textSecondary }]}>Pending · Cancel</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    }

    if (status === 'pending_received') {
      return (
        <View style={styles.dualBtnRow}>
          <Animated.View style={[buttonAnimatedStyle, { flex: 1 }]}>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} disabled={actionLoading} activeOpacity={0.85}>
              {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.connectBtnText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
          <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} disabled={actionLoading} activeOpacity={0.85}>
            <MaterialIcons name="close" size={18} color="#ef4444" />
            <Text style={[styles.connectBtnText, { color: '#ef4444' }]}>Decline</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'accepted') {
      return (
        <View style={styles.dualBtnRow}>
          <View style={[styles.connectBtn, styles.connectedBtn]}>
            <MaterialIcons name="check-circle" size={18} color="#10b981" />
            <Text style={[styles.connectBtnText, { color: '#10b981' }]}>Connected</Text>
          </View>
          <TouchableOpacity
            style={[styles.rejectBtn, actionLoading && { opacity: 0.65 }]}
            onPress={handleUnfriend}
            disabled={actionLoading}
            activeOpacity={0.85}
          >
            {actionLoading ? (
              <ActivityIndicator color="#ef4444" size="small" />
            ) : (
              <>
                <MaterialIcons name="person-remove" size={18} color="#ef4444" />
                <Text style={[styles.connectBtnText, { color: '#ef4444' }]}>Unfriend</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  // =====================================
  // LOADING / ERROR
  // =====================================

  if (isLoading) {
    return (
      <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <MaterialIcons name="person-off" size={64} color={Colors.textSecondary} />
        <Text style={{ fontSize: FontSizes.lg, color: Colors.textSecondary, marginTop: Spacing.md }}>
          User not found
        </Text>
      </LinearGradient>
    );
  }

  const roleConfig = getRoleConfig();
  const roleLabel = getRoleDisplayLabel(profile?.role, profile?.faculty_designation);
  const role = profile?.role;
  const isStudent = role === 'student';
  const isFaculty = role === 'faculty';
  const isAlumni = role === 'alumni';
  const isDeveloper = role === 'developer';
  const isAdmin = isAdminRole(role);
  const isFacultyLike = isFaculty || isAdmin;
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const academicStatusLabel = profile.academic_status
    ? profile.academic_status.charAt(0).toUpperCase() + profile.academic_status.slice(1)
    : '';
  const hasAcademicRows = Boolean(
    (isStudent && (profile.year_of_admission || profile.section || profile.department || profile.specialization || profile.roll_number || profile.year || profile.semester)) ||
    (isFacultyLike && (profile.faculty_designation || (!isLeadership && (profile.department || profile.specialization)))) ||
    (isAlumni && (profile.department || profile.specialization || profile.batch || profile.academic_status))
  );

  // =====================================
  // RENDER
  // =====================================

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.gradientBg}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          {user?.id !== userId && (
            <TouchableOpacity 
              onPress={() => setReportModalState({
                visible: true,
                contentType: 'user',
                contentId: userId
              })}
              style={styles.menuBtn}
            >
              <MaterialIcons name="more-vert" size={22} color={Colors.text} />
            </TouchableOpacity>
          )}
          {user?.id === userId && <View style={{ width: 40 }} />}
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>

          {/* ── HERO SECTION ── */}
          <View style={styles.heroSection}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <LinearGradient colors={roleConfig.gradient as any} style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{getInitials()}</Text>
                </LinearGradient>
              )}
              {connectionStatus.status === 'accepted' && (
                <View style={styles.connectedDot}>
                  <MaterialIcons name="check" size={10} color="#fff" />
                </View>
              )}
            </View>

            {/* Name */}
            <Text style={styles.heroName}>{profile.full_name || 'Unknown User'}</Text>

            {/* Role pill */}
            <View style={[styles.rolePill, { backgroundColor: roleConfig.color + '22', borderColor: roleConfig.color + '44' }]}>
              <MaterialIcons name={roleConfig.icon as any} size={12} color={roleConfig.color} />
              <Text style={[styles.rolePillText, { color: roleConfig.color }]}>{roleLabel.toUpperCase()}</Text>
            </View>

            {/* Department */}
            {!isDeveloper && profile.department && !isLeadership ? (
              <Text style={styles.heroDepartment}>{profile.department}</Text>
            ) : (!isDeveloper && profile.faculty_designation ? (
              <Text style={styles.heroDepartment}>{formatFacultyDesignation(profile.faculty_designation)}</Text>
            ) : null)}

            {/* Special badges & Verification badges */}
            {(profile.is_club_coordinator || profile.is_volunteer || profile.is_verified || verificationBadges.length > 0) && (
              <View style={styles.badgeRow}>
                {profile.is_club_coordinator && (
                  <View style={[styles.specialBadge, { backgroundColor: '#7c3aed22', borderColor: '#7c3aed44' }]}>
                    <MaterialIcons name="groups" size={12} color="#7c3aed" />
                    <Text style={[styles.specialBadgeText, { color: '#7c3aed' }]}>Club Coordinator</Text>
                  </View>
                )}
                {profile.is_volunteer && (
                  <View style={[styles.specialBadge, { backgroundColor: '#0891b222', borderColor: '#0891b244' }]}>
                    <MaterialIcons name="volunteer-activism" size={12} color="#0891b2" />
                    <Text style={[styles.specialBadgeText, { color: '#0891b2' }]}>Volunteer</Text>
                  </View>
                )}
                {profile.is_verified && (
                  <View style={[styles.specialBadge, { backgroundColor: '#06b6d422', borderColor: '#06b6d444' }]}>
                    <MaterialIcons name="verified" size={12} color="#06b6d4" />
                    <Text style={[styles.specialBadgeText, { color: '#06b6d4' }]}>Verified</Text>
                  </View>
                )}
                {verificationBadges.map((badge, idx) => (
                  <View key={idx} style={[styles.specialBadge, { backgroundColor: '#8b5cf615', borderColor: '#8b5cf644' }]}>
                    <MaterialIcons name={badge.type === 'mentor' ? 'school' : 'admin-panel-settings'} size={12} color="#8b5cf6" />
                    <Text style={[styles.specialBadgeText, { color: '#8b5cf6' }]}>{badge.type.toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Bio */}
            {profile.bio ? (
              <Text style={styles.heroBio} numberOfLines={3}>{profile.bio}</Text>
            ) : null}

            {/* Stats row - colored blocks */}
            <View style={styles.statsRow}>
              <View style={[styles.statBlock, { backgroundColor: '#DBEAFE' }]}>
                <Text style={styles.statBlockValue}>{connectionsCount}</Text>
                <Text style={styles.statBlockLabel}>Connections</Text>
              </View>
              <View style={[styles.statBlock, { backgroundColor: '#EDE9FE' }]}>
                <Text style={styles.statBlockValue}>{userProjects.length}</Text>
                <Text style={styles.statBlockLabel}>Projects</Text>
              </View>
              <View style={[styles.statBlock, { backgroundColor: '#FEF3C7' }]}>
                <Text style={styles.statBlockValue}>{mutualConnectionsCount}</Text>
                <Text style={styles.statBlockLabel}>Mutual</Text>
              </View>
            </View>

            {/* Connection actions */}
            <View style={styles.actionArea}>
              {renderConnectionButton()}
            </View>

            {/* Message button */}
            {user?.id !== userId && (
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={handleMessage}
                disabled={messageLoading}
                activeOpacity={0.85}
              >
                {messageLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="chat-bubble-outline" size={18} color="#fff" />
                    <Text style={styles.messageBtnText}>Message</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* ── ACADEMIC INFO SECTION ── */}
          {hasAcademicRows && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="school" size={18} color="#3b82f6" />
                <Text style={styles.sectionTitle}>Academic Info</Text>
              </View>
              {isStudent && profile.year_of_admission ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Year of Admission</Text>
                  <Text style={styles.infoVal}>{profile.year_of_admission}</Text>
                </View>
              ) : null}
              {isStudent && profile.section ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Section</Text>
                  <Text style={styles.infoVal}>{profile.section}</Text>
                </View>
              ) : null}
              {(isStudent || isFacultyLike || isAlumni) && profile.department && !isLeadership ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Department</Text>
                  <Text style={styles.infoVal}>{profile.department}</Text>
                </View>
              ) : null}
              {(isStudent || isFacultyLike || isAlumni) && profile.specialization && !isLeadership ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Specialization</Text>
                  <Text style={styles.infoVal}>{profile.specialization}</Text>
                </View>
              ) : null}
              {isStudent && profile.roll_number ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Roll Number</Text>
                  <Text style={styles.infoVal}>{profile.roll_number}</Text>
                </View>
              ) : null}
              {isStudent && profile.year ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Year</Text>
                  <Text style={styles.infoVal}>{formatYearValue(profile.year)}</Text>
                </View>
              ) : null}
              {isStudent && profile.semester ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Semester</Text>
                  <Text style={styles.infoVal}>{profile.semester}</Text>
                </View>
              ) : null}
              {isFacultyLike && profile.faculty_designation ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Designation</Text>
                  <Text style={styles.infoVal}>{formatFacultyDesignation(profile.faculty_designation)}</Text>
                </View>
              ) : null}
              {isAlumni && profile.batch ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Batch</Text>
                  <Text style={styles.infoVal}>{profile.batch}</Text>
                </View>
              ) : null}
              {isAlumni && academicStatusLabel ? (
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}> 
                  <Text style={styles.infoKey}>Academic Status</Text>
                  <Text style={styles.infoVal}>{academicStatusLabel}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ── SKILLS SECTION ── */}
          {skills.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="code" size={18} color="#fb7185" />
                <Text style={styles.sectionTitle}>Skills</Text>
              </View>
              <View style={styles.chipWrap}>
                {skills.map((skill, i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── INTERESTS SECTION ── */}
          {interests.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="favorite" size={18} color="#10b981" />
                <Text style={styles.sectionTitle}>Interests</Text>
              </View>
              <View style={styles.chipWrap}>
                {interests.map((interest, i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── PROJECTS SECTION ── */}
          {userProjects.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="work" size={18} color="#6366f1" />
                <Text style={styles.sectionTitle}>Projects</Text>
                <View style={styles.projectCount}>
                  <Text style={styles.projectCountText}>{userProjects.length}</Text>
                </View>
              </View>
              {userProjects.map((p: any, i) => (
                <View key={i} style={[styles.projectRow, i === userProjects.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.projectName} numberOfLines={1}>{p.team?.name || 'Unnamed Project'}</Text>
                  <View style={styles.projectRolePill}>
                    <Text style={styles.projectRoleText}>{p.role || 'Member'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
      </LinearGradient>

      <ReportModal
        isVisible={reportModalState.visible}
        onClose={() => setReportModalState({ ...reportModalState, visible: false })}
        contentType={reportModalState.contentType}
        reportedUserId={reportModalState.contentId}
      />
    </SafeAreaView>
  );
}

// =====================================
// STYLES
// =====================================

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    gradientBg: {
      flex: 1,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },

    // Hero section
    heroSection: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 20,
    },

    // Avatar
    avatarContainer: {
      position: 'relative',
      marginBottom: 16,
    },
    avatarImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 3,
      borderColor: '#ffffff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    avatarFallback: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: '#ffffff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    avatarInitials: {
      fontSize: 36,
      fontWeight: FontWeights.bold,
      color: '#fff',
    },
    connectedDot: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#10b981',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#ffffff',
    },

    // Hero text
    heroName: {
      fontSize: 22,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    rolePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      marginBottom: 6,
    },
    rolePillText: {
      fontSize: 10,
      fontWeight: FontWeights.bold,
      letterSpacing: 1,
    },
    heroDepartment: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: 10,
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
      flexWrap: 'wrap',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    specialBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    specialBadgeText: {
      fontSize: 11,
      fontWeight: FontWeights.medium,
    },
    heroBio: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 24,
      marginBottom: 16,
    },

    // Stats row – colored blocks
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
      paddingHorizontal: 4,
    },
    statBlock: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    statBlockValue: {
      fontSize: 20,
      fontWeight: FontWeights.bold,
      color: '#1e293b',
    },
    statBlockLabel: {
      fontSize: 11,
      color: '#64748b',
      marginTop: 2,
    },

    // Action buttons
    actionArea: {
      width: '100%',
      marginBottom: 10,
    },
    connectBtnWrap: {
      width: '100%',
    },
    connectBtn: {
      borderRadius: 14,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      gap: 8,
    },
    connectBtnGradient: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      gap: 8,
      paddingHorizontal: 20,
    },
    connectBtnText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
    connectBtnOutline: {
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderWidth: 1.5,
      borderColor: 'rgba(0,0,0,0.1)',
    },
    dualBtnRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    acceptBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      backgroundColor: '#10b981',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    rejectBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 1.5,
      borderColor: 'rgba(239,68,68,0.25)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    connectedBtn: {
      flex: 1,
      backgroundColor: 'rgba(16,185,129,0.08)',
      borderWidth: 1.5,
      borderColor: 'rgba(16,185,129,0.25)',
    },

    // Message button
    messageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#6366F1',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 18,
      width: '100%',
    },
    messageBtnText: {
      fontSize: FontSizes.md,
      fontWeight: '500' as any,
      color: '#ffffff',
    },

    // Sections
    section: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    sectionTitle: {
      flex: 1,
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },

    // Academic info rows
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    infoKey: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    infoVal: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
      maxWidth: '60%',
      textAlign: 'right',
    },

    // Chips (glassmorphic pills)
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: {
      fontSize: 12,
      fontWeight: FontWeights.medium,
      color: '#374151',
    },

    // Projects
    projectRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    projectName: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      flex: 1,
      marginRight: 12,
    },
    projectRolePill: {
      backgroundColor: 'rgba(99,102,241,0.1)',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    projectRoleText: {
      fontSize: 11,
      fontWeight: FontWeights.semibold,
      color: '#6366f1',
    },
    projectCount: {
      backgroundColor: 'rgba(0,0,0,0.05)',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
    },
    projectCountText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      color: Colors.textSecondary,
    },
  });
