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
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';

type ProjectDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ProjectDetails'>;

const milestones = [
  { id: '1', label: 'Initial Hardware Spec', completed: true },
  { id: '2', label: 'Code Review Phase', current: true },
  { id: '3', label: 'Integration Testing', completed: false },
];

const teamMembers = [
  { id: '1', name: 'Sarah Lee', role: 'Lead Dev', initials: 'SL', color: '#7c3aed' },
  { id: '2', name: 'Mark Johnson', role: 'Hardware', initials: 'MJ', color: '#0891b2' },
  { id: '3', name: 'Emma Davis', role: 'Research', initials: 'ED', color: '#dc2626' },
];

export default function ProjectDetailsScreen() {
  const navigation = useNavigation<ProjectDetailsScreenNavigationProp>();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#60707d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Project Details</Text>
        <TouchableOpacity style={styles.headerButton} onPress={() => {}/* TODO: Implement more options */}>
          <MaterialIcons name="more-horiz" size={24} color="#60707d" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Project Overview */}
        <View style={styles.overviewSection}>
          <View style={styles.overviewHeader}>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Project Active</Text>
            </View>
            <Text style={styles.categoryText}>ENGINEERING</Text>
          </View>

          <Text style={styles.projectTitle}>Robotics Control Logic</Text>
          <Text style={styles.projectDescription}>
            Developing fuzzy logic controllers for hexapod movement and stability
            analysis. Focus on terrain adaptation algorithms.
          </Text>

          {/* AI Insight */}
          <View style={styles.aiInsight}>
            <MaterialIcons name="psychology" size={20} color={Colors.primary} />
            <View style={styles.aiInsightContent}>
              <Text style={styles.aiInsightTitle}>AI Insight</Text>
              <Text style={styles.aiInsightText}>
                Team balance could benefit from a backend-focused member.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Phase 2 Progress</Text>
            <Text style={styles.progressPercent}>50%</Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarFill} />
          </View>

          {/* Milestones */}
          <View style={styles.milestones}>
            {milestones.map((milestone) => (
              <View key={milestone.id} style={styles.milestoneItem}>
                <View
                  style={[
                    styles.milestoneIcon,
                    milestone.completed && styles.milestoneIconCompleted,
                    milestone.current && styles.milestoneIconCurrent,
                  ]}
                >
                  {milestone.completed ? (
                    <MaterialIcons name="check" size={14} color="#10b981" />
                  ) : milestone.current ? (
                    <View style={styles.currentDot} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.milestoneText,
                    milestone.completed && styles.milestoneTextCompleted,
                    milestone.current && styles.milestoneTextCurrent,
                  ]}
                >
                  {milestone.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Faculty Supervision */}
        <View style={styles.facultySection}>
          <Text style={styles.sectionTitle}>FACULTY SUPERVISION</Text>
          <View style={styles.facultyCard}>
            <View style={styles.facultyInfo}>
              <View style={styles.facultyAvatar}>
                <Text style={styles.facultyInitials}>HC</Text>
              </View>
              <View>
                <Text style={styles.facultyName}>Prof. H. Chen</Text>
                <Text style={styles.facultyRole}>Department Head</Text>
              </View>
            </View>
            <View style={styles.viewOnlyBadge}>
              <Text style={styles.viewOnlyText}>View-only</Text>
            </View>
          </View>
        </View>

        {/* Team Members */}
        <View style={styles.teamSection}>
          <Text style={styles.sectionTitle}>TEAM MEMBERS</Text>
          <View style={styles.teamList}>
            {teamMembers.map((member) => (
              <View key={member.id} style={styles.teamMemberCard}>
                <View style={styles.teamMemberInfo}>
                  <View
                    style={[
                      styles.teamMemberAvatar,
                      { backgroundColor: member.color },
                    ]}
                  >
                    <Text style={styles.teamMemberInitials}>{member.initials}</Text>
                  </View>
                  <View>
                    <Text style={styles.teamMemberName}>{member.name}</Text>
                    <Text style={styles.teamMemberRole}>{member.role}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => {}/* TODO: Open chat with team member */}>
                  <MaterialIcons name="chat-bubble-outline" size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: 'rgba(246, 247, 248, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  overviewSection: {
    padding: Spacing.md,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
    color: '#047857',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
    color: '#94a3b8',
    letterSpacing: 1.2,
  },
  projectTitle: {
    fontSize: 30,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: 12,
    lineHeight: 36,
  },
  projectDescription: {
    fontSize: FontSizes.sm,
    color: '#60707d',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  aiInsight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  aiInsightContent: {
    flex: 1,
  },
  aiInsightTitle: {
    fontSize: 12,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    marginBottom: 2,
  },
  aiInsightText: {
    fontSize: FontSizes.sm,
    color: '#334155',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  progressSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  progressTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  progressPercent: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  progressBarFill: {
    width: '50%',
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  milestones: {
    gap: 12,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  milestoneIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneIconCompleted: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  milestoneIconCurrent: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}1A`,
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  milestoneText: {
    fontSize: FontSizes.sm,
    color: '#94a3b8',
  },
  milestoneTextCompleted: {
    textDecorationLine: 'line-through',
  },
  milestoneTextCurrent: {
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  facultySection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: FontWeights.bold,
    color: '#94a3b8',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  facultyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BorderRadius.lg,
    padding: 12,
    ...Shadows.sm,
  },
  facultyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  facultyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facultyInitials: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#4f46e5',
  },
  facultyName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  facultyRole: {
    fontSize: 12,
    color: '#64748b',
  },
  viewOnlyBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewOnlyText: {
    fontSize: 10,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  teamSection: {
    paddingHorizontal: Spacing.md,
  },
  teamList: {
    gap: 12,
  },
  teamMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BorderRadius.lg,
    padding: 12,
    ...Shadows.sm,
  },
  teamMemberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamMemberInitials: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  teamMemberName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  teamMemberRole: {
    fontSize: 12,
    color: '#64748b',
  },
});
