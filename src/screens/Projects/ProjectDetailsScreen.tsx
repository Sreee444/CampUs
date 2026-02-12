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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';
import { getProjectTeam, joinProjectTeam } from '../../api/projects';
import { ProjectTeam } from '../../types/database';

type ProjectDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ProjectDetails'>;
type ProjectDetailsScreenRouteProp = RouteProp<RootStackParamList, 'ProjectDetails'>;

export default function ProjectDetailsScreen() {
  const navigation = useNavigation<ProjectDetailsScreenNavigationProp>();
  const route = useRoute<ProjectDetailsScreenRouteProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user } = useAuth();

  const { teamId } = route.params;
  const [team, setTeam] = useState<ProjectTeam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teamId) {
      setError('Team not found.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadTeam = async () => {
      try {
        setIsLoading(true);
        const data = await getProjectTeam(teamId);
        if (isMounted) {
          setTeam(data);
          setError('');
        }
      } catch (err) {
        console.error('Failed to load team details', err);
        if (isMounted) {
          setError('Unable to load team details at the moment.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadTeam();

    return () => {
      isMounted = false;
    };
  }, [teamId]);

  const handleJoin = async () => {
    if (!team || !teamId || !user?.id || isMember || !team.is_recruiting) return;

    try {
      setIsJoining(true);
      await joinProjectTeam(teamId, user.id);
      const refreshed = await getProjectTeam(teamId);
      setTeam(refreshed);
      Toast.show({ type: 'success', text1: 'Joined team', text2: team.name });
    } catch (err) {
      console.error('Failed to join team', err);
      Toast.show({ type: 'error', text1: 'Unable to join', text2: 'Try again in a moment.' });
    } finally {
      setIsJoining(false);
    }
  };

  const progressPercent = team?.max_members
    ? Math.min(100, Math.round(((team.members_count || 0) / team.max_members) * 100))
    : 0;
  const isMember = !!team?.members?.some((member) => member.id === user?.id);

  const canJoin = !!team?.is_recruiting && !isMember && !!user?.id;
  const joinLabel = isMember
    ? 'Joined'
    : team?.is_recruiting
      ? isJoining
        ? 'Joining...'
        : 'Join Team'
      : 'Closed';

  const getInitials = (displayName: string) => {
    const parts = displayName.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase() || 'U';
  };

  const getColorFromString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#dc2626'];
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{team?.name || 'Project Details'}</Text>
        <TouchableOpacity
          style={[
            styles.joinButton,
            (!canJoin && !isMember) || isJoining ? styles.joinButtonDisabled : {},
          ]}
          onPress={handleJoin}
          disabled={!canJoin || isJoining}
        >
          <Text style={styles.joinLabel}>{joinLabel}</Text>
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
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.overviewSection}>
            <View style={styles.headerRow}>
              <Text style={styles.category}>{team?.category || 'General'}</Text>
              {team?.is_ai_generated && (
                <View style={styles.aiBadge}>
                  <Text style={styles.aiText}>AI suggested</Text>
                </View>
              )}
            </View>
            <Text style={styles.projectTitle}>{team?.name}</Text>
            <Text style={styles.projectDescription}>{team?.description || 'No description provided yet.'}</Text>

            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Team fill</Text>
                <Text style={styles.progressValue}>{progressPercent}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{team?.members_count || 0}</Text>
                <Text style={styles.statLabel}>Members</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{team?.max_members || 0}</Text>
                <Text style={styles.statLabel}>Capacity</Text>
              </View>
              {typeof team?.match_score === 'number' && (
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{team.match_score}%</Text>
                  <Text style={styles.statLabel}>Match</Text>
                </View>
              )}
            </View>
          </View>

          {(team?.required_skills || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Required skills</Text>
              <View style={styles.skillsRow}>
                {team.required_skills?.map((skill) => (
                  <View key={skill} style={styles.skillBadge}>
                    <Text style={styles.skillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Faculty lead</Text>
            <View style={styles.facultyCard}>
              <View style={styles.facultyInfo}>
                <View style={styles.facultyAvatar}>
                  <Text style={styles.facultyInitials}>{getInitials(team?.creator?.full_name || 'F')}</Text>
                </View>
                <View>
                  <Text style={styles.facultyName}>{team?.creator?.full_name || 'Faculty partner'}</Text>
                  <Text style={styles.facultyRole}>{team?.creator?.department || 'Faculty mentor'}</Text>
                </View>
              </View>
              <View style={styles.facultyBadge}>
                <Text style={styles.facultyBadgeText}>View-only</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Members</Text>
            <View style={styles.teamList}>
              {(team?.members || []).map((member) => (
                <View key={member.id} style={styles.teamMemberCard}>
                  <View style={styles.teamMemberInfo}>
                    <View
                      style={[
                        styles.teamMemberAvatar,
                        { backgroundColor: getColorFromString(member.full_name || member.email || 'Member') },
                      ]}
                    >
                      <Text style={styles.teamMemberInitials}>{getInitials(member.full_name || member.email || 'M')}</Text>
                    </View>
                    <View>
                      <Text style={styles.teamMemberName}>{member.full_name || member.email}</Text>
                      <Text style={styles.teamMemberRole}>{member.role || 'Member'}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  joinButton: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: {
    backgroundColor: Colors.border,
  },
  joinLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
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
  overviewSection: {
    padding: Spacing.md,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  category: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
    letterSpacing: 1.5,
  },
  aiBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  aiText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  projectTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  projectDescription: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  progressValue: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#edf2ff',
  },
  skillText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  facultyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  facultyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  facultyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facultyInitials: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#fff',
  },
  facultyName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  facultyRole: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  facultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  facultyBadgeText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  teamList: {
    gap: 12,
  },
  teamMemberCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
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
    color: '#fff',
  },
  teamMemberName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  teamMemberRole: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});