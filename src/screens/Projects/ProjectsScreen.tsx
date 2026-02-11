import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getProjectTeams } from '../../api/projects';
import { ProjectTeam } from '../../types/database';

type ProjectsScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Projects'>,
  StackNavigationProp<RootStackParamList>
>;

const categories = ['All', 'Web', 'Mobile', 'AI/ML', 'IoT', 'Other'];

export default function ProjectsScreen() {
  const navigation = useNavigation<ProjectsScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user } = useAuth();

  const [projectTeams, setProjectTeams] = useState<ProjectTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadProjects = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await getProjectTeams(user.id);
        if (isMounted) {
          setProjectTeams(data);
          setFetchError('');
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        if (isMounted) {
          setFetchError('Unable to load projects at the moment.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProjects();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return projectTeams.filter((project) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        (project.category || 'Other') === selectedCategory;
      const matchesSearch = normalizedSearch
        ? (project.name || '').toLowerCase().includes(normalizedSearch)
        : true;
      return matchesCategory && matchesSearch;
    });
  }, [projectTeams, searchQuery, selectedCategory]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Projects</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => {}}>
          <MaterialIcons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.resultsText}>
            {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
          </Text>

          {fetchError ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="cloud-off" size={48} color={Colors.textSecondary} />
              <Text style={styles.errorText}>{fetchError}</Text>
            </View>
          ) : filteredProjects.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="search-off" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No projects found for that filter.</Text>
              <Text style={styles.emptySubtext}>Try a different keyword or category.</Text>
            </View>
          ) : (
            filteredProjects.map((project) => {
              const progressPercent = project.max_members
                ? Math.min(100, Math.round(((project.members_count || 0) / project.max_members) * 100))
                : 0;
              return (
                <TouchableOpacity
                  key={project.id}
                  style={styles.projectCard}
                  onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                >
                  <View style={styles.projectHeader}>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectTitle}>{project.name}</Text>
                      <Text style={styles.projectCategory}>{project.category || 'General'}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        project.is_recruiting ? styles.statusRecruiting : styles.statusClosed,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          project.is_recruiting ? styles.statusDotActive : styles.statusDotClosed,
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          project.is_recruiting ? styles.statusTextActive : styles.statusTextClosed,
                        ]}
                      >
                        {project.is_recruiting ? 'Recruiting' : 'Closed'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.projectDescription}>
                    {project.description || 'Team description is coming soon.'}
                  </Text>

                  <View style={styles.creatorRow}>
                    <MaterialIcons name="person-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.creatorText}>
                      Created by {project.creator?.full_name || 'Campus'}
                    </Text>
                  </View>

                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressLabel}>Team fill</Text>
                      <Text style={styles.progressPercent}>{progressPercent}%</Text>
                    </View>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                    </View>
                  </View>

                  {(project.required_skills || []).length > 0 && (
                    <View style={styles.skillList}>
                      {(project.required_skills || []).slice(0, 4).map((skill) => (
                        <View key={skill} style={styles.skillChip}>
                          <Text style={styles.skillChipText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.projectFooter}>
                    <View style={styles.teamInfo}>
                      <MaterialIcons name="people" size={16} color={Colors.textSecondary} />
                      <Text style={styles.teamText}>
                        {project.members_count || 0}/{project.max_members || 0} members
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.viewButton}
                      onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                    >
                      <Text style={styles.viewButtonText}>View Details</Text>
                      <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 32 }} />
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
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  categoriesContainer: {
    maxHeight: 50,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoriesContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  resultsText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: 12,
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
  projectInfo: {
    flex: 1,
  },
  projectTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  projectCategory: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  statusRecruiting: {
    backgroundColor: '#d1fae5',
  },
  statusClosed: {
    backgroundColor: '#fee2e2',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
  },
  statusDotClosed: {
    backgroundColor: '#dc2626',
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
  },
  statusTextActive: {
    color: '#047857',
  },
  statusTextClosed: {
    color: '#991b1b',
  },
  projectDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  creatorText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  skillList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  skillChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#eef2ff',
  },
  skillChipText: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  projectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  loadingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  emptyText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  emptySubtext: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: Colors.error,
    textAlign: 'center',
  },
});