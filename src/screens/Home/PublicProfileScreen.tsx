// ================================================
// PUBLIC PROFILE SCREEN - REDESIGNED
// ================================================
// View other users' profiles with connection management
// Features: Hero card, stat row, skills chips, project cards, connection actions
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
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
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
import { Profile } from '../../types/database';
import {
  sendConnectionRequest,
  cancelConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  getConnectionStatus,
  ConnectionStatusResult,
} from '../../api/connections';
import { getUserVerifications, getMutualConnections, createDirectConversation } from '../../api/chat';
import UserProfileCard from '../../components/UserProfileCard';

type PublicProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PublicProfile'>;
type PublicProfileScreenRouteProp = RouteProp<RootStackParamList, 'PublicProfile'>;

const { width } = Dimensions.get('window');

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

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusResult>({ status: 'none' });
  const [actionLoading, setActionLoading] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [connectionsCount, setConnectionsCount] = useState(0);
  const [verificationBadges, setVerificationBadges] = useState<any[]>([]);
  const [mutualConnectionsCount, setMutualConnectionsCount] = useState(0);

  const buttonScale = useSharedValue(1);

  useEffect(() => {
    loadProfile();
    loadConnectionStatus();
    loadUserProjects();
    loadConnectionsCount();
    loadVerificationBadges();
    loadMutualConnections();
  }, [userId]);

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
      const mutualConnections = await getMutualConnections(userId, user.id);
      setMutualConnectionsCount(mutualConnections?.mutual_count || 0);
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
      const result = await cancelConnectionRequest(userId);
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Request Cancelled' });
        loadConnectionStatus();
      } else {
        Toast.show({ type: 'error', text1: 'Failed', text2: result.error || 'Could not cancel' });
      }
    } catch {
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

  const handleMessage = async () => {
    if (!user?.id || !profile?.id) {
      Toast.show({ type: 'error', text1: 'Unavailable', text2: 'Unable to open chat right now' });
      return;
    }

    try {
      const conversation = await createDirectConversation(user.id, profile.id);
      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        name: profile.full_name || 'User',
        isGroup: false,
        partnerUserId: profile.id,
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not open chat',
        text2: error?.message || 'Please try again',
      });
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

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10b981';
      case 'completed': return '#3b82f6';
      case 'on_hold': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  // =====================================
  // RENDER: CONNECTION BUTTON
  // =====================================

  const renderConnectionButton = () => {
    if (user?.id === userId) return null;
    const { status } = connectionStatus;

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
          <TouchableOpacity style={[styles.connectBtn, styles.messageBtnFill]} onPress={handleMessage} activeOpacity={0.85}>
            <MaterialIcons name="chat-bubble-outline" size={18} color="#fff" />
            <Text style={styles.connectBtnText}>Message</Text>
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialIcons name="person-off" size={64} color={Colors.textSecondary} />
        <Text style={{ fontSize: FontSizes.lg, color: Colors.textSecondary, marginTop: Spacing.md }}>
          User not found
        </Text>
      </View>
    );
  }

  const roleConfig = getRoleConfig();

  // =====================================
  // RENDER
  // =====================================

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.screenGradient}
      >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── HERO CARD ── */}
        <View style={styles.heroCard}>
          {/* Gradient banner */}
          <LinearGradient
            colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.decCircle1} />
            <View style={styles.decCircle2} />
          </LinearGradient>

          {/* Avatar ring */}
          <View style={styles.avatarRingOuter}>
            <LinearGradient colors={roleConfig.gradient as any} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <LinearGradient colors={roleConfig.gradient as any} style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{getInitials()}</Text>
                  </LinearGradient>
                )}
              </View>
            </LinearGradient>
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
            <Text style={[styles.rolePillText, { color: roleConfig.color }]}>{roleConfig.label.toUpperCase()}</Text>
          </View>

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

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{connectionsCount}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </View>
            <View style={styles.statDivider} />
            {mutualConnectionsCount > 0 && (
              <>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{mutualConnectionsCount}</Text>
                  <Text style={styles.statLabel}>Mutual</Text>
                </View>
                <View style={styles.statDivider} />
              </>
            )}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userProjects.length}</Text>
              <Text style={styles.statLabel}>Projects</Text>
            </View>
            {profile.year ? (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>Y{profile.year}</Text>
                  <Text style={styles.statLabel}>Year</Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Connection actions */}
          <View style={styles.actionArea}>
            {renderConnectionButton()}
          </View>
        </View>

        {/* ── ACADEMIC INFO CARD ── */}
        {(profile.department || profile.enrollment_number || profile.year) && (
          <View style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#3b82f615' }]}>
                <MaterialIcons name="school" size={18} color="#3b82f6" />
              </View>
              <Text style={styles.cardTitle}>Academic Info</Text>
            </View>
            <View style={styles.infoGrid}>
              {profile.department ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Department</Text>
                  <Text style={styles.infoVal}>{profile.department}</Text>
                </View>
              ) : null}
              {profile.year ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Year</Text>
                  <Text style={styles.infoVal}>Year {profile.year}</Text>
                </View>
              ) : null}
              {profile.enrollment_number ? (
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.infoKey}>Enrollment</Text>
                  <Text style={styles.infoVal}>{profile.enrollment_number}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* ── SKILLS CARD ── */}
        {profile.skills && profile.skills.length > 0 && (
          <View style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#fb718515' }]}>
                <MaterialIcons name="code" size={18} color="#fb7185" />
              </View>
              <Text style={styles.cardTitle}>Skills</Text>
            </View>
            <View style={styles.chipWrap}>
              {profile.skills.map((skill, i) => (
                <View key={i} style={[styles.chip, styles.skillChip]}>
                  <Text style={[styles.chipText, { color: '#fb7185' }]}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── INTERESTS CARD ── */}
        {profile.interests && profile.interests.length > 0 && (
          <View style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#10b98115' }]}>
                <MaterialIcons name="favorite" size={18} color="#10b981" />
              </View>
              <Text style={styles.cardTitle}>Interests</Text>
            </View>
            <View style={styles.chipWrap}>
              {profile.interests.map((interest, i) => (
                <View key={i} style={[styles.chip, styles.interestChip]}>
                  <Text style={[styles.chipText, { color: '#10b981' }]}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── PROJECTS CARD ── */}
        {userProjects.length > 0 && (
          <View style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#6366f115' }]}>
                <MaterialIcons name="work" size={18} color="#6366f1" />
              </View>
              <Text style={styles.cardTitle}>Projects</Text>
              <Text style={styles.cardCount}>{userProjects.length}</Text>
            </View>
            {userProjects.map((p: any, i) => {
              const st = p.team?.status || 'active';
              const stColor = getProjectStatusColor(st);
              return (
                <View key={i} style={[styles.projectRow, i === userProjects.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.projectDot, { backgroundColor: stColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projectName} numberOfLines={1}>{p.team?.name || 'Unnamed Project'}</Text>
                    {p.team?.description ? (
                      <Text style={styles.projectDesc} numberOfLines={1}>{p.team.description}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.projectRolePill, { backgroundColor: stColor + '20', borderColor: stColor + '40' }]}>
                    <Text style={[styles.projectRoleText, { color: stColor }]}>{p.role || 'Member'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// =====================================
// STYLES
// =====================================

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0f0f13' : '#F5E6D8',
    },
    screenGradient: {
      flex: 1,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      backgroundColor: 'rgba(255,255,255,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },

    // Hero card
    heroCard: {
      margin: 16,
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      overflow: 'hidden',
      alignItems: 'center',
      paddingBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 30,
      elevation: 6,
    },
    heroBanner: {
      width: '100%',
      height: 110,
    },
    decCircle1: {
      position: 'absolute',
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: 'rgba(255,255,255,0.12)',
      top: -40,
      right: -20,
    },
    decCircle2: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(255,255,255,0.10)',
      bottom: -20,
      left: 30,
    },

    // Avatar
    avatarRingOuter: {
      marginTop: -52,
      marginBottom: 14,
      position: 'relative',
    },
    avatarRing: {
      width: 104,
      height: 104,
      borderRadius: 52,
      padding: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInner: {
      width: 98,
      height: 98,
      borderRadius: 49,
      overflow: 'hidden',
      backgroundColor: Colors.surface,
      borderWidth: 2,
      borderColor: Colors.surface,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitials: {
      fontSize: 36,
      fontWeight: FontWeights.bold,
      color: '#fff',
    },
    connectedDot: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#10b981',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: Colors.surface,
    },

    // Hero text
    heroName: {
      fontSize: 22,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 8,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    rolePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      marginBottom: 10,
    },
    rolePillText: {
      fontSize: 10,
      fontWeight: FontWeights.bold,
      letterSpacing: 1,
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

    // Stats
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? Colors.backgroundAlt : '#f9fafb',
      borderRadius: 16,
      marginHorizontal: 20,
      paddingVertical: 14,
      paddingHorizontal: 8,
      marginBottom: 20,
      width: width - 32 - 40,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 20,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    statLabel: {
      fontSize: 11,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      height: 32,
      backgroundColor: Colors.border,
    },

    // Action buttons
    actionArea: {
      width: '100%',
      paddingHorizontal: 20,
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
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: Colors.border,
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
      backgroundColor: '#ef444415',
      borderWidth: 1.5,
      borderColor: '#ef444440',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    connectedBtn: {
      flex: 1,
      backgroundColor: '#10b98115',
      borderWidth: 1.5,
      borderColor: '#10b98140',
    },
    messageBtnFill: {
      flex: 1,
      backgroundColor: '#fb7185',
    },

    // Info cards
    infoCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: '#FFFFFF',
      borderRadius: 20,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 30,
      elevation: 4,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
      gap: 10,
    },
    cardIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardTitle: {
      flex: 1,
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    cardCount: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      color: Colors.textSecondary,
      backgroundColor: Colors.backgroundAlt,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
    },

    // Academic info grid
    infoGrid: {
      gap: 0,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border + '60',
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

    // Chips
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    skillChip: {
      backgroundColor: '#fb718510',
      borderColor: '#fb718530',
    },
    interestChip: {
      backgroundColor: '#10b98110',
      borderColor: '#10b98130',
    },
    chipText: {
      fontSize: 13,
      fontWeight: FontWeights.medium,
    },

    // Projects
    projectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border + '60',
    },
    projectDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      flexShrink: 0,
    },
    projectName: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    projectDesc: {
      fontSize: 12,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    projectRolePill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      borderWidth: 1,
    },
    projectRoleText: {
      fontSize: 11,
      fontWeight: FontWeights.semibold,
    },
  });
