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
import { getUserStats } from '../../api/users';
import { LinearGradient } from 'expo-linear-gradient';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  StackNavigationProp<RootStackParamList>
>;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

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

  const interests = profile?.interests || [];

  const shareProfile = async () => {
    try {
      await Share.share({
        message: `${profile?.full_name || 'Check out my CAMPUS profile'} · ${profile?.department || 'Campus community'}`,
      });
    } catch (error) {
      console.error('Share failed', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <MaterialIcons name="settings" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#e0f7fa', '#f3e5f5', '#fff8f0']}
          style={styles.profileHeader}
        >
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            )}
            <TouchableOpacity 
              style={styles.editAvatarButton} 
              onPress={() => navigation.navigate('EditProfile')}
            >
              <MaterialIcons name="camera-alt" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>{profile?.full_name || 'User'}</Text>
          <Text style={styles.profileRole}>{profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'User'}</Text>
          <Text style={styles.profileDepartment}>{profile?.department || 'No department set'}</Text>
        </LinearGradient>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : stats ? (
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <MaterialIcons name="group" size={24} color={Colors.primary} />
              <Text style={styles.statValue}>{stats.total_connections || 0}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialIcons name="folder" size={24} color={Colors.primary} />
              <Text style={styles.statValue}>{stats.total_projects || 0}</Text>
              <Text style={styles.statLabel}>Projects</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialIcons name="event" size={24} color={Colors.primary} />
              <Text style={styles.statValue}>{stats.total_events || 0}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <Text style={styles.aboutText}>
            {profile?.bio || 'No bio added yet. Go to Edit Profile to add one!'}
          </Text>
        </View>

        {interests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <View style={styles.interestsContainer}>
              {interests.map((interest, index) => (
                <View key={index} style={styles.interestChip}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))}
            </View>
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
              <Text style={styles.actionTitle}>Certifications</Text>
              <Text style={styles.actionSubtitle}>Manage your certificates</Text>
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
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
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
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: Spacing.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
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
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.card,
  },
  profileName: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  profileRole: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  profileDepartment: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 20,
    gap: 12,
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
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
    paddingHorizontal: Spacing.md,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: 12,
  },
  aboutText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestChip: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  interestText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    ...Shadows.sm,
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
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});