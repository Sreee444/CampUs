import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  StackNavigationProp<RootStackParamList>
>;

const stats = [
  { label: 'Projects', value: '3', icon: 'folder-open' },
  { label: 'Collaborations', value: '12', icon: 'people' },
  { label: 'Events', value: '8', icon: 'event' },
];

const interests = ['AI & ML', 'Robotics', 'IoT', 'Blockchain', 'Web Dev'];

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
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
        {/* Profile Header */}
        <LinearGradient
          colors={['#e0f7fa', '#f3e5f5', '#fff8f0']}
          style={styles.profileHeader}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>SN</Text>
            </View>
            <TouchableOpacity style={styles.editAvatarButton} onPress={() => {}/* TODO: Open image picker */}>
              <MaterialIcons name="camera-alt" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>Student Name</Text>
          <Text style={styles.profileRole}>Computer Science Student</Text>
          <Text style={styles.profileDepartment}>Department of Engineering</Text>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsContainer}>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statItem}>
              <MaterialIcons name={stat.icon as any} size={24} color={Colors.primary} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <Text style={styles.aboutText}>
            Passionate about technology and innovation. Currently working on AI and robotics projects. 
            Always eager to collaborate and learn from others.
          </Text>
        </View>

        {/* Interests */}
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

        {/* Quick Actions */}
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

          <TouchableOpacity style={styles.actionItem} onPress={() => {}/* TODO: Navigate to academic records */}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="school" size={20} color="#10b981" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Academic Records</Text>
              <Text style={styles.actionSubtitle}>View your achievements</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => {}/* TODO: Navigate to certifications */}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="workspace-premium" size={20} color="#f59e0b" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Certifications</Text>
              <Text style={styles.actionSubtitle}>Manage your certificates</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => {}/* TODO: Implement share functionality */}>
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
