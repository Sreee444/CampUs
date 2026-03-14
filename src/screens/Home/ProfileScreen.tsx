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
  Share,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminRole, isFacultyOrAdminRole } from '../../utils/roles';
import { getUserStats } from '../../api/users';
import { LinearGradient } from 'expo-linear-gradient';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  StackNavigationProp<RootStackParamList>
>;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, signOut } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  useRealtimeRefresh({
    enabled: Boolean(user?.id),
    tables: ['profiles', 'connections', 'project_team_members', 'event_registrations'],
    onChange: () => {
      loadStats();
    },
  });

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await getUserStats(user?.id || '');
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = () => {
    if (!profile?.full_name) return 'U';
    const parts = profile.full_name.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase();
  };

  const interests = Array.isArray(profile?.interests) ? profile.interests : [];
  const skills = Array.isArray(profile?.skills) ? profile.skills : [];

  const shareProfile = async () => {
    try {
      await Share.share({
        message: `${profile?.full_name || 'Check out my CAMPUS profile'} · ${profile?.department || 'Campus community'}`,
      });
    } catch (error) {
      console.error('Share failed', error);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      Toast.show({ type: 'info', text1: 'Logging out...' });
      await signOut();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to log out' });
    }
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const renderActionRow = (
    icon: keyof typeof MaterialIcons.glyphMap,
    iconColor: string,
    iconBg: string,
    title: string,
    subtitle: string,
    onPress: () => void,
    isLast = false,
    titleColor?: string,
  ) => (
    <TouchableOpacity
      style={[styles.actionRow, !isLast && styles.actionRowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.actionIconCircle, { backgroundColor: iconBg }]}>  
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.actionInfo}>
        <Text style={[styles.actionTitle, titleColor ? { color: titleColor } : null]}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#C4C9D4" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientBackground}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Header Bar (scrolls with content) */}
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>Profile</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="settings" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* ─── Hero Profile Card ─── */}
          <View style={styles.heroCard}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              <View style={styles.avatarWrapper}>
                <UserAvatar
                  uri={profile?.avatar_url}
                  name={profile?.full_name}
                  role={profile?.role}
                  size={96}
                  showRing={true}
                />
              </View>
              <TouchableOpacity
                style={styles.editAvatarButton}
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="camera-alt" size={14} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* User Info */}
            <Text style={styles.profileName}>{profile?.full_name || 'User'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'User'}
              </Text>
            </View>
            <Text style={styles.profileDepartment}>
              {profile?.department || 'No department set'}
            </Text>
          </View>

          {/* ─── Stats Row ─── */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
            </View>
          ) : stats ? (
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: '#E0F7FA' }]}>  
                <MaterialIcons name="group" size={22} color="#0d9488" />
                <Text style={styles.statValue}>{stats.total_connections || 0}</Text>
                <Text style={styles.statLabel}>Connections</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#F3E5F5' }]}>  
                <MaterialIcons name="folder" size={22} color="#9333ea" />
                <Text style={styles.statValue}>{stats.total_projects || 0}</Text>
                <Text style={styles.statLabel}>Projects</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#FFF5E6' }]}>  
                <MaterialIcons name="event" size={22} color="#ea580c" />
                <Text style={styles.statValue}>{stats.total_events || 0}</Text>
                <Text style={styles.statLabel}>Events</Text>
              </View>
            </View>
          ) : null}

          {/* ─── About Me Card ─── */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>About Me</Text>
            <Text style={styles.aboutText}>
              {profile?.bio || 'No bio added yet. Go to Edit Profile to add one!'}
            </Text>
          </View>

          {/* ─── Skills Card ─── */}
          {skills.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Skills</Text>
              <View style={styles.interestsContainer}>
                {skills.map((skill: string, index: number) => (
                  <View key={index} style={styles.skillPill}>
                    <Text style={styles.skillPillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ─── Interests Card ─── */}
          {interests.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.interestsContainer}>
                {interests.map((interest: string, index: number) => (
                  <View key={index} style={styles.interestPill}>
                    <Text style={styles.interestPillText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ─── InterCampus Tools Card ─── */}
          {isFacultyOrAdminRole(profile?.role) && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>InterCampus Tools</Text>
              {renderActionRow(
                'fact-check', '#047857', '#dcfce7',
                'InterCampus Dashboard',
                'Verify or reject external submissions',
                () => navigation.navigate('FacultyInterCampusDashboard'),
                true,
              )}
            </View>
          )}

          {/* ─── Quick Actions Card ─── */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            {renderActionRow(
              'edit', '#6366f1', '#EEF2FF',
              'Edit Profile', 'Update your information',
              () => navigation.navigate('EditProfile'),
            )}
            {renderActionRow(
              'school', '#10b981', '#D1FAE5',
              'Academic Records', 'View your achievements',
              () => navigation.navigate('AcademicDetails'),
            )}
            {renderActionRow(
              'workspace-premium', '#f59e0b', '#FEF3C7',
              'Certifications', 'Manage your certificates',
              () => navigation.navigate('SkillsInterests'),
            )}
            {renderActionRow(
              'share', '#6366f1', '#EEF2FF',
              'Share Profile', 'Share with connections',
              shareProfile,
            )}
            {renderActionRow(
              'logout', '#ef4444', '#FEE2E2',
              'Log Out', 'Sign out of your account',
              handleLogout,
              true,
              '#ef4444',
            )}
          </View>

          {/* ─── Admin Tools Card ─── */}
          {isAdminRole(profile?.role) && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Admin Tools</Text>
              {renderActionRow(
                'admin-panel-settings', '#1e40af', '#DBEAFE',
                'Admin Dashboard', 'Access admin panel',
                () => navigation.navigate('AdminDashboard'),
                true,
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </LinearGradient>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDialog}>
            <View style={styles.confirmHeader}>
              <View style={styles.confirmIconWrap}>
                <MaterialIcons name="logout" size={32} color="#ef4444" />
              </View>
              <Text style={styles.confirmTitle}>Log Out</Text>
              <Text style={styles.confirmMessage}>Are you sure you want to log out?</Text>
            </View>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={cancelLogout}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.logoutConfirmButton]}
                onPress={confirmLogout}
                activeOpacity={0.8}
              >
                <Text style={styles.logoutConfirmButtonText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  /* ─── Layout ─── */
  safeArea: {
    flex: 1,
    backgroundColor: '#F5E6D8',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  gradientBackground: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },

  /* ─── Hero Profile Card ─── */
  heroCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 0,
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(10px)' } as any
      : {}),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 6,
  },

  /* ─── Avatar ─── */
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    borderRadius: 56,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
    overflow: 'visible',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 2,
    right: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  /* ─── User Info ─── */
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  roleBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 6,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
  },
  profileDepartment: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },

  /* ─── Stats Row ─── */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },

  /* ─── Section Card ─── */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  aboutText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 22,
  },

  /* ─── Interests ─── */
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestPill: {
    backgroundColor: '#E6F7F1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  interestPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  skillPill: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skillPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
  },

  /* ─── Action Rows ─── */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },

  /* ─── Logout Confirm Dialog ─── */
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  confirmDialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '85%',
    maxWidth: 400,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 8,
  },
  confirmHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  confirmMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  logoutConfirmButton: {
    backgroundColor: '#ef4444',
  },
  logoutConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
