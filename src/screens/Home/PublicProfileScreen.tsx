// ================================================
// PHASE 3: PUBLIC PROFILE SCREEN
// ================================================
// View other users' profiles with connection management
// Features: Connection status tracking, animated buttons, premium UI
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
  withTiming, 
  useSharedValue,
  withSpring,
  interpolateColor
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

type PublicProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PublicProfile'>;
type PublicProfileScreenRouteProp = RouteProp<RootStackParamList, 'PublicProfile'>;

const { width } = Dimensions.get('window');

export default function PublicProfileScreen() {
  const navigation = useNavigation<PublicProfileScreenNavigationProp>();
  const route = useRoute<PublicProfileScreenRouteProp>();
  const { userId } = route.params;
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  // State
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusResult>({ status: 'none' });
  const [actionLoading, setActionLoading] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);

  // Animation values
  const buttonScale = useSharedValue(1);
  const buttonColorProgress = useSharedValue(0);

  useEffect(() => {
    loadProfile();
    loadConnectionStatus();
    loadUserProjects();
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

  // =====================================
  // CONNECTION ACTIONS
  // =====================================

  const handleConnect = async () => {
    try {
      setActionLoading(true);
      animateButton();

      const result = await sendConnectionRequest(userId);
      
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'Connection Request Sent',
          text2: `Request sent to ${profile?.full_name || 'user'}`,
        });
        loadConnectionStatus();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed',
          text2: result.error || 'Could not send request',
        });
      }
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'An error occurred',
      });
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
        Toast.show({
          type: 'success',
          text1: 'Request Cancelled',
        });
        loadConnectionStatus();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed',
          text2: result.error || 'Could not cancel request',
        });
      }
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'An error occurred',
      });
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
        Toast.show({
          type: 'success',
          text1: 'Connection Accepted',
          text2: `You are now connected with ${profile?.full_name || 'this user'}`,
        });
        loadConnectionStatus();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed',
          text2: result.error || 'Could not accept request',
        });
      }
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'An error occurred',
      });
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
        Toast.show({
          type: 'success',
          text1: 'Request Rejected',
        });
        loadConnectionStatus();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Failed',
          text2: result.error || 'Could not reject request',
        });
      }
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'An error occurred',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMessage = () => {
    // Navigate to chat conversation
    // Will be implemented in Phase 6
    Toast.show({
      type: 'info',
      text1: 'Coming Soon',
      text2: 'Direct messaging will be available soon',
    });
  };

  // =====================================
  // ANIMATIONS
  // =====================================

  const animateButton = () => {
    buttonScale.value = withSpring(0.95, {}, () => {
      buttonScale.value = withSpring(1);
    });
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: buttonScale.value }],
    };
  });

  // =====================================
  // RENDER HELPERS
  // =====================================

  const getInitials = () => {
    if (!profile?.full_name) return 'U';
    const parts = profile.full_name.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase();
  };

  const getRoleBadgeColor = () => {
    switch (profile?.role) {
      case 'student': return Colors.info;
      case 'faculty': return Colors.warning;
      case 'alumni': return Colors.success;
      case 'admin': return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  const renderConnectionButton = () => {
    // Don't show if viewing own profile
    if (user?.id === userId) return null;

    const { status } = connectionStatus;

    // No connection - show Connect button
    if (status === 'none' || status === 'rejected') {
      return (
        <Animated.View style={buttonAnimatedStyle}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleConnect}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <MaterialIcons name="person-add" size={20} color="#ffffff" />
                <Text style={styles.actionButtonText}>Connect</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Pending request sent - show Cancel button
    if (status === 'pending_sent') {
      return (
        <Animated.View style={buttonAnimatedStyle}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={handleCancelRequest}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color={Colors.text} size="small" />
            ) : (
              <>
                <MaterialIcons name="cancel" size={20} color={Colors.text} />
                <Text style={[styles.actionButtonText, { color: Colors.text }]}>
                  Cancel Request
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Pending request received - show Accept/Reject buttons
    if (status === 'pending_received') {
      return (
        <View style={styles.doubleButtonContainer}>
          <Animated.View style={[buttonAnimatedStyle, { flex: 1, marginRight: Spacing.sm }]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.successButton]}
              onPress={handleAccept}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="check" size={20} color="#ffffff" />
                  <Text style={styles.actionButtonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[styles.actionButton, styles.dangerButton]}
            onPress={handleReject}
            disabled={actionLoading}
          >
            <MaterialIcons name="close" size={20} color="#ffffff" />
            <Text style={styles.actionButtonText}>Reject</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Accepted connection - show Message button
    if (status === 'accepted') {
      return (
        <Animated.View style={buttonAnimatedStyle}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleMessage}
          >
            <MaterialIcons name="message" size={20} color="#ffffff" />
            <Text style={styles.actionButtonText}>Message</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    return null;
  };

  // =====================================
  // RENDER
  // =====================================

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <MaterialIcons name="person-off" size={64} color={Colors.textSecondary} />
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Gradient Header Background */}
        <LinearGradient
          colors={Colors.gradients.campus as any}
          style={styles.gradientHeader}
        />

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={Colors.gradients.softMesh as any}
                style={styles.avatarGradient}
              >
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </LinearGradient>
            )}
          </View>

          {/* Connection Status Indicator */}
          {connectionStatus.status === 'accepted' && (
            <View style={styles.connectionBadge}>
              <MaterialIcons name="check-circle" size={16} color={Colors.success} />
            </View>
          )}
        </View>

        {/* Name and Role */}
        <View style={styles.nameSection}>
          <Text style={styles.name}>{profile.full_name || 'Unknown User'}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() + '20' }]}>
            <Text style={[styles.roleText, { color: getRoleBadgeColor() }]}>
              {profile.role?.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Bio */}
        {profile.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtonContainer}>
          {renderConnectionButton()}
        </View>

        {/* Info Cards */}
        <View style={styles.infoContainer}>
          {/* Academic Info */}
          {(profile.department || profile.year) && (
            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <MaterialIcons name="school" size={24} color={Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Academic</Text>
                {profile.department && (
                  <Text style={styles.infoText}>{profile.department}</Text>
                )}
                {profile.year && (
                  <Text style={styles.infoText}>Year {profile.year}</Text>
                )}
              </View>
            </View>
          )}

          {/* Skills */}
          {profile.skills && profile.skills.length > 0 && (
            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <MaterialIcons name="code" size={24} color={Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Skills</Text>
                <View style={styles.tagsContainer}>
                  {profile.skills.map((skill, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{skill}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <MaterialIcons name="favorite" size={24} color={Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Interests</Text>
                <View style={styles.tagsContainer}>
                  {profile.interests.map((interest, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{interest}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Projects */}
          {userProjects.length > 0 && (
            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <MaterialIcons name="work" size={24} color={Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Projects ({userProjects.length})</Text>
                {userProjects.map((project: any, index) => (
                  <View key={index} style={styles.projectItem}>
                    <MaterialIcons name="folder" size={16} color={Colors.textSecondary} />
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.team?.name}
                    </Text>
                    <Text style={styles.projectRole}>{project.role}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: Spacing.xl }} />
      </ScrollView>
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
      backgroundColor: Colors.background,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.backgroundAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Spacing.xl,
    },
    gradientHeader: {
      height: 120,
      width: '100%',
    },
    avatarSection: {
      alignItems: 'center',
      marginTop: -60,
      marginBottom: Spacing.md,
    },
    avatarContainer: {
      position: 'relative',
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: BorderRadius.full,
      borderWidth: 4,
      borderColor: Colors.surface,
    },
    avatarGradient: {
      width: 120,
      height: 120,
      borderRadius: BorderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 4,
      borderColor: Colors.surface,
    },
    avatarText: {
      fontSize: FontSizes.xxxl,
      fontWeight: FontWeights.bold,
      color: '#ffffff',
    },
    connectionBadge: {
      position: 'absolute',
      bottom: 5,
      right: 5,
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.full,
      padding: 4,
    },
    nameSection: {
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    name: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.xs,
    },
    roleBadge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.md,
    },
    roleText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      letterSpacing: 1,
    },
    bioSection: {
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
    },
    bioText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    actionButtonContainer: {
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    doubleButtonContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.md,
      gap: Spacing.sm,
    },
    primaryButton: {
      backgroundColor: Colors.primary,
    },
    secondaryButton: {
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    successButton: {
      backgroundColor: Colors.success,
    },
    dangerButton: {
      backgroundColor: Colors.error,
      flex: 1,
    },
    actionButtonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#ffffff',
    },
    infoContainer: {
      paddingHorizontal: Spacing.md,
      gap: Spacing.md,
    },
    infoCard: {
      flexDirection: 'row',
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      ...Shadows.sm,
    },
    infoIcon: {
      width: 48,
      height: 48,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.primary + '15',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: Spacing.md,
    },
    infoContent: {
      flex: 1,
    },
    infoLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
      marginBottom: Spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    infoText: {
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: 2,
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    tag: {
      backgroundColor: Colors.backgroundAlt,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    tagText: {
      fontSize: FontSizes.xs,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    projectItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.xs,
      gap: Spacing.xs,
    },
    projectName: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    projectRole: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      backgroundColor: Colors.backgroundAlt,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    errorText: {
      fontSize: FontSizes.lg,
      color: Colors.textSecondary,
      marginTop: Spacing.md,
    },
  });
