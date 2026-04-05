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
import { formatFacultyDesignation, getRoleDisplayLabel, isAdminRole, isFacultyOrAdminRole, isLeadershipDesignation } from '../../utils/roles';
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
  const role = profile?.role;
  const isStudent = role === 'student';
  const isFaculty = role === 'faculty';
  const isAlumni = role === 'alumni';
  const isAdmin = isAdminRole(role);
  const isFacultyLike = isFaculty || isAdmin;
  const isLeadership = isLeadershipDesignation(profile?.faculty_designation);

  const academicStatusLabel = profile?.academic_status
    ? profile.academic_status.charAt(0).toUpperCase() + profile.academic_status.slice(1)
    : '';

  const hasAcademicInfo = Boolean(
    (isStudent && (profile?.year || profile?.semester || profile?.roll_number || profile?.section || profile?.year_of_admission || profile?.department || profile?.specialization)) ||
    (isFacultyLike && (profile?.faculty_designation || (!isLeadership && (profile?.department || profile?.specialization)))) ||
    (isAlumni && (profile?.department || profile?.specialization || profile?.batch || profile?.academic_status))
  );

  const shareProfile = async () => {
    try {
      await Share.share({
        message: `${profile?.full_name || 'Check out my CAMPUS profile'} · ${profile?.department || 'Campus community'}`,
      });
    } catch (error) {
      console.error('Share failed', error);
    }
  };

  const viewPublicProfile = () => {
    const userId = user?.id || profile?.id;
    if (!userId) return;
    navigation.navigate('PublicProfile', { userId });
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

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.gradientBg}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
              <MaterialIcons name="settings" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <UserAvatar
                uri={profile?.avatar_url}
                name={profile?.full_name}
                role={profile?.role}
                size={96}
                showRing={true}
              />
              <TouchableOpacity
                style={styles.editAvatarButton}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <MaterialIcons name="camera-alt" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.profileName}>{profile?.full_name || 'User'}</Text>
            <Text style={styles.profileRole}>{getRoleDisplayLabel(profile?.role, profile?.faculty_designation)}</Text>
            {profile?.department && !isLeadership ? (
              <Text style={styles.profileDepartment}>{profile.department}</Text>
            ) : (isFacultyLike && profile?.faculty_designation ? (
              <Text style={styles.profileDepartment}>{formatFacultyDesignation(profile.faculty_designation)}</Text>
            ) : null)}
          </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : stats ? (
          <View style={styles.statsContainer}>
            <LinearGradient colors={['#e0f7fa', '#ccfbfb']} style={styles.statItem}>
              <MaterialIcons name="group" size={22} color="#0d9488" />
              <Text style={styles.statValue}>{stats.total_connections || 0}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </LinearGradient>
            <LinearGradient colors={['#f3e5f5', '#ecdcf7']} style={styles.statItem}>
              <MaterialIcons name="folder" size={22} color="#9333ea" />
              <Text style={styles.statValue}>{stats.total_projects || 0}</Text>
              <Text style={styles.statLabel}>Projects</Text>
            </LinearGradient>
            <LinearGradient colors={['#fff5e6', '#ffe0cc']} style={styles.statItem}>
              <MaterialIcons name="event" size={22} color="#ea580c" />
              <Text style={styles.statValue}>{stats.total_events || 0}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </LinearGradient>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <View style={styles.bioCard}>
            <MaterialIcons name="format-quote" size={20} color="#6366F1" style={{ marginBottom: 4 }} />
            <Text style={profile?.bio ? styles.bioText : styles.bioPlaceholder}>
              {profile?.bio || 'No bio added yet. Tap Edit Profile to introduce yourself!'}
            </Text>
          </View>
        </View>

        {hasAcademicInfo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Academic Info</Text>
            <View style={styles.infoCard}>
              {isStudent && (
                <>
                  {profile?.department && !isLeadership ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#e0f2fe' }]}>
                        <MaterialIcons name="business" size={15} color="#0284c7" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Department</Text>
                        <Text style={styles.infoValue}>{profile.department}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.specialization && !isLeadership ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#f0fdf4' }]}>
                        <MaterialIcons name="auto-awesome" size={15} color="#16a34a" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Specialization</Text>
                        <Text style={styles.infoValue}>{profile.specialization}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.year_of_admission ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#fef9c3' }]}>
                        <MaterialIcons name="event" size={15} color="#ca8a04" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Year of Admission</Text>
                        <Text style={styles.infoValue}>{profile.year_of_admission}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.roll_number ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#ede9fe' }]}>
                        <MaterialIcons name="badge" size={15} color="#7c3aed" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Roll Number</Text>
                        <Text style={styles.infoValue}>{profile.roll_number}</Text>
                      </View>
                    </View>
                  ) : null}
                  {(profile?.year || profile?.semester) ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#fff1f2' }]}>
                        <MaterialIcons name="layers" size={15} color="#e11d48" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Year / Semester</Text>
                        <Text style={styles.infoValue}>
                          {[profile.year ? `Year ${profile.year}` : null, profile.semester ? `Sem ${profile.semester}` : null].filter(Boolean).join('  ·  ')}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.section ? (
                    <View style={[styles.infoRow, styles.infoRowLast]}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#ecfdf5' }]}>
                        <MaterialIcons name="groups" size={15} color="#059669" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Section</Text>
                        <Text style={styles.infoValue}>{profile.section}</Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}

              {isFacultyLike && (
                <>
                  {profile?.faculty_designation ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#ede9fe' }]}>
                        <MaterialIcons name="military-tech" size={15} color="#7c3aed" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Designation</Text>
                        <Text style={styles.infoValue}>{formatFacultyDesignation(profile.faculty_designation)}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.department && !isLeadership ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#e0f2fe' }]}>
                        <MaterialIcons name="business" size={15} color="#0284c7" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Department</Text>
                        <Text style={styles.infoValue}>{profile.department}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.specialization && !isLeadership ? (
                    <View style={[styles.infoRow, styles.infoRowLast]}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#f0fdf4' }]}>
                        <MaterialIcons name="auto-awesome" size={15} color="#16a34a" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Specialization</Text>
                        <Text style={styles.infoValue}>{profile.specialization}</Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}

              {isAlumni && (
                <>
                  {profile?.department ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#e0f2fe' }]}>
                        <MaterialIcons name="business" size={15} color="#0284c7" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Department</Text>
                        <Text style={styles.infoValue}>{profile.department}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.specialization ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#f0fdf4' }]}>
                        <MaterialIcons name="auto-awesome" size={15} color="#16a34a" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Specialization</Text>
                        <Text style={styles.infoValue}>{profile.specialization}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile?.batch ? (
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#fef9c3' }]}>
                        <MaterialIcons name="event" size={15} color="#ca8a04" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Batch</Text>
                        <Text style={styles.infoValue}>{profile.batch}</Text>
                      </View>
                    </View>
                  ) : null}
                  {academicStatusLabel ? (
                    <View style={[styles.infoRow, styles.infoRowLast]}>
                      <View style={[styles.infoIconBox, { backgroundColor: '#fff1f2' }]}>
                        <MaterialIcons name="verified" size={15} color="#e11d48" />
                      </View>
                      <View style={styles.infoTextBlock}>
                        <Text style={styles.infoLabel}>Academic Status</Text>
                        <Text style={styles.infoValue}>{academicStatusLabel}</Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.interestsContainer}>
              {skills.length > 0 ? (
                skills.map((skill, index) => (
                  <View key={`skill_${index}`} style={styles.interestChip}>
                    <Text style={styles.interestText}>{skill}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.aboutText}>No skills added yet.</Text>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <View style={styles.interestsContainer}>
              {interests.length > 0 ? (
                interests.map((interest, index) => (
                  <View key={`interest_${index}`} style={styles.interestChip}>
                    <Text style={styles.interestText}>{interest}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.aboutText}>No interests added yet.</Text>
              )}
            </View>
          </View>

        {isFacultyOrAdminRole(profile?.role) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>InterCampus Tools</Text>

            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('FacultyInterCampusDashboard')}>
              <View style={[styles.actionIcon, { backgroundColor: '#dcfce7' }]}>
                <MaterialIcons name="fact-check" size={20} color="#047857" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>InterCampus Dashboard</Text>
                <Text style={styles.actionSubtitle}>Verify or reject external submissions</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('EditProfile')}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="edit" size={20} color={Colors.primary} />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Edit Profile</Text>
              <Text style={styles.actionSubtitle}>Update your information</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={viewPublicProfile} disabled={!user?.id && !profile?.id}>
            <View style={[styles.actionIcon, { backgroundColor: '#fff1e8' }]}>
              <MaterialIcons name="visibility" size={20} color="#c2410c" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>View Public Profile</Text>
              <Text style={styles.actionSubtitle}>See how others see you</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('AcademicDetails')}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="school" size={20} color="#10b981" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Academic Records</Text>
              <Text style={styles.actionSubtitle}>View your achievements</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('SkillsInterests')}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="workspace-premium" size={20} color="#f59e0b" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Skills & Interests</Text>
              <Text style={styles.actionSubtitle}>Manage your skills and interests</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={shareProfile}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="share" size={20} color="#6366f1" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Share Profile</Text>
              <Text style={styles.actionSubtitle}>Share with connections</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
            <View style={[styles.actionIcon, { backgroundColor: '#fee2e2' }]}>
              <MaterialIcons name="logout" size={20} color="#ef4444" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={[styles.actionTitle, { color: '#ef4444' }]}>Log Out</Text>
              <Text style={styles.actionSubtitle}>Sign out of your account</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {isAdminRole(profile?.role) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Tools</Text>

            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('AdminDashboard')}>
              <View style={[styles.actionIcon, { backgroundColor: '#dbeafe' }]}>
                <MaterialIcons name="admin-panel-settings" size={20} color="#1e40af" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Admin Dashboard</Text>
                <Text style={styles.actionSubtitle}>Access admin panel</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}

        </ScrollView>
      </LinearGradient>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDialog}>
            <View style={styles.confirmHeader}>
              <MaterialIcons name="logout" size={48} color="#ef4444" />
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
  container: {
    flex: 1,
    backgroundColor: '#F5E6D8',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  gradientBg: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.card,
    ...Shadows.md,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.card,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  profileRole: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
    marginBottom: 2,
  },
  profileDepartment: {
    fontSize: 13,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    letterSpacing: 0.1,
  },
  aboutText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
  bioCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.12)',
  },
  bioText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  bioPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoTextBlock: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestChip: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  interestText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  confirmDialog: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    width: '85%',
    maxWidth: 400,
    padding: Spacing.xl,
    ...Shadows.lg,
  },
  confirmHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  confirmTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  confirmMessage: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.border,
  },
  cancelButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  logoutConfirmButton: {
    backgroundColor: '#ef4444',
  },
  logoutConfirmButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
});