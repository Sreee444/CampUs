import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { getUserStats } from '../../api/users';
import { getProjectTeams } from '../../api/projects';
import { getEvents } from '../../api/events';
import { getCollaboratorSuggestions } from '../../api/ai';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  StackNavigationProp<RootStackParamList>
>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [stats, setStats] = useState({ posts: 0, events: 0, connections: 0, projects: 0 });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<string>('Find teammates that match your skills.');

  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        const [statsData, projects, events, suggestions] = await Promise.all([
          getUserStats(user.id),
          getProjectTeams(user.id, true),
          getEvents(user.id, undefined, true),
          getCollaboratorSuggestions(user.id),
        ]);

        setStats(statsData);
        setRecentProjects(projects.slice(0, 3));
        setUpcomingEvents(events.slice(0, 3));

        if (suggestions.length > 0) {
          setAiSuggestion(
            `You could collaborate with ${suggestions[0].full_name || 'a student'} based on skill alignment.`
          );
        }
      } catch (error) {
        console.error('Home load error:', error);
      }
    };

    loadData();
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#e0f7fa', '#f3e5f5', '#fff8f0']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome!</Text>
            <Text style={styles.userName}>{profile?.full_name || 'Student'}</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigation.navigate('Notifications')}
          >
            <MaterialIcons name="notifications-none" size={24} color="#111818" />
            <View style={styles.notificationBadge} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialIcons name="folder-open" size={24} color={Colors.primary} />
            <Text style={styles.statNumber}>{stats.projects}</Text>
            <Text style={styles.statLabel}>Active Projects</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="event" size={24} color="#10b981" />
            <Text style={styles.statNumber}>{stats.events}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="chat-bubble-outline" size={24} color="#f59e0b" />
            <Text style={styles.statNumber}>{stats.connections}</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
        </View>

        {/* AI Suggestion */}
        <View style={styles.section}>
          <View style={styles.aiSuggestion}>
            <MaterialIcons name="auto-awesome" size={20} color={Colors.primary} />
            <View style={styles.aiContent}>
              <Text style={styles.aiTitle}>AI Suggestion</Text>
              <Text style={styles.aiText}>
                {aiSuggestion}
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Projects</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Projects' as any)}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {recentProjects.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active projects yet</Text>
            </View>
          ) : recentProjects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={styles.projectCard}
              onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
            >
              <View style={styles.projectHeader}>
                <View>
                  <Text style={styles.projectTitle}>{project.name}</Text>
                  <Text style={styles.projectCategory}>{project.category || 'Project'}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  project.is_recruiting ? styles.statusActive : styles.statusPlanning
                ]}>
                  <Text style={styles.statusText}>
                    {project.is_recruiting ? 'Recruiting' : 'Closed'}
                  </Text>
                </View>
              </View>
              <View style={styles.progressSection}>
                <Text style={styles.progressText}>
                  {project.members_count || 0} members
                </Text>
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${Math.min(100, (project.members_count || 0) * 20)}%` }]}
                  />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upcoming Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Events' as any)}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {upcomingEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No upcoming events</Text>
            </View>
          ) : upcomingEvents.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventDate}>
                <MaterialIcons name="event" size={20} color={Colors.primary} />
                <Text style={styles.eventDateText}>
                  {new Date(event.start_date).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <View style={styles.eventTime}>
                  <MaterialIcons name="access-time" size={14} color="#64748b" />
                  <Text style={styles.eventTimeText}>
                    {new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            </View>
          ))}
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
  headerGradient: {
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginTop: 4,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  seeAllText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  aiSuggestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  aiContent: {
    flex: 1,
  },
  aiTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    marginBottom: 4,
  },
  aiText: {
    fontSize: FontSizes.sm,
    color: '#334155',
    lineHeight: 18,
  },
  projectCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    ...Shadows.sm,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  projectTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  projectCategory: {
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#d1fae5',
  },
  statusPlanning: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
    color: '#047857',
  },
  progressSection: {
    gap: 6,
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  eventCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
    ...Shadows.sm,
  },
  eventDate: {
    alignItems: 'center',
    gap: 4,
  },
  eventDateText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginBottom: 6,
  },
  eventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventTimeText: {
    fontSize: 12,
    color: '#64748b',
  },
});
