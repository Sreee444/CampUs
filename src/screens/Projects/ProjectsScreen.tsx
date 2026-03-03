import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getProjectTeams, getProjectsByRole, getMentoredProjects } from '../../api/projects';
import { ProjectTeam } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';

import {
  SEMANTIC_COLORS,
  getTeamFillColor,
  getProjectStatusColor,
} from '../../utils/semanticColors';
import { supabase } from '../../api/supabase';
import Toast from 'react-native-toast-message';

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
  const { user, profile } = useAuth();

  const [projectTeams, setProjectTeams] = useState<ProjectTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'all' | 'my' | 'mentoring'>('all');

  const isFacultyOrAlumni = profile?.role === 'faculty' || profile?.role === 'alumni';
  const isStudent = profile?.role === 'student';

  const [refreshing, setRefreshing] = useState(false);


  const loadProjects = useCallback(async (showLoading = true) => {
    if (!user?.id || !profile?.role) return;

    try {
      if (showLoading) setIsLoading(true);
      let data: ProjectTeam[] = [];

      if (selectedTab === 'all') {
        data = await getProjectsByRole(profile.role, user.id);
      } else if (selectedTab === 'my') {
        const allData = await getProjectTeams(user.id);
        data = allData.filter(p => p.created_by === user.id || p.is_member);
      } else if (selectedTab === 'mentoring' && isFacultyOrAlumni) {
        data = await getMentoredProjects(user.id);
      }

      setProjectTeams([...data]); // Force a new array to ensure re-render
      setFetchError('');
    } catch (error) {
      console.error('Failed to load projects:', error);
      setFetchError('Unable to load projects at the moment.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, profile?.role, selectedTab, isFacultyOrAlumni]);

  // Load projects when component mounts or when tab changes
  useEffect(() => {
    if (user?.id && profile?.role) {
      loadProjects();
    }
  }, [loadProjects, user?.id, profile?.role]);

  // Also refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id && profile?.role) {
        loadProjects();
      }
      return () => {
        // Cleanup if needed
      };
    }, [loadProjects, user?.id, profile?.role])
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadProjects(false);
  }, [loadProjects]);

  const canCreateProject = profile && [
    'student', 'faculty', 'alumni', 'admin'
  ].includes(profile.role);

  const applySearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleCreateProject = () => {
    if (canCreateProject) {
      navigation.navigate('CreateProject');
    }
  };

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
        {canCreateProject && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleCreateProject}
            activeOpacity={0.7}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Selection */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'all' && styles.tabActive]}
          onPress={() => setSelectedTab('all')}
        >
          <Text style={[styles.tabText, selectedTab === 'all' && styles.tabTextActive]}>
            All Projects
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTab === 'my' && styles.tabActive]}
          onPress={() => setSelectedTab('my')}
        >
          <Text style={[styles.tabText, selectedTab === 'my' && styles.tabTextActive]}>
            My Projects
          </Text>
        </TouchableOpacity>

        {isFacultyOrAlumni && (
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'mentoring' && styles.tabActive]}
            onPress={() => setSelectedTab('mentoring')}
          >
            <Text style={[styles.tabText, selectedTab === 'mentoring' && styles.tabTextActive]}>
              Mentoring
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor="#94a3b8"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={applySearch}
            returnKeyType="search"
          />
          {!!searchInput && (
            <TouchableOpacity
              onPress={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
            >
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
              const hasMembersData = Array.isArray(project.members);
              const members: any[] = Array.isArray(project.members) ? project.members : [];
              // Filter out advisors from member count (they're shown in Project Mentor section)
              const nonAdvisorMembers = members.filter((m: any) => m.member_role !== 'advisor');
              const creatorId = project.creator?.id || project.created_by;
              const hasCreatorInMembers = !!creatorId && nonAdvisorMembers.some((member) => member.id === creatorId);
              const effectiveMembersCount = nonAdvisorMembers.length + (hasMembersData && creatorId && !hasCreatorInMembers ? 1 : 0);
              const displayMembers = (hasMembersData && (hasCreatorInMembers || !project.creator)
                ? nonAdvisorMembers
                : (hasMembersData ? [project.creator, ...nonAdvisorMembers] : [])
              ).filter((member): member is NonNullable<typeof member> => !!member);
              const progressPercent = project.max_members
                ? Math.min(100, Math.round((effectiveMembersCount / project.max_members) * 100))
                : 0;
              const teamFillColor = getTeamFillColor(progressPercent);
              const projectStatus = getProjectStatusColor(project.status || 'planning');

              return (
                <TouchableOpacity
                  key={project.id}
                  style={[
                    styles.projectCard,
                    { borderLeftColor: projectStatus.color }
                  ]}
                  onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                >
                  {/* Featured Badge */}
                  {project.is_featured && (
                    <View style={styles.featuredBadge}>
                      <MaterialIcons name="star" size={14} color="#fbbf24" />
                      <Text style={styles.featuredText}>Featured</Text>
                    </View>
                  )}

                  <View style={styles.projectHeader}>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectTitle}>{project.name}</Text>
                      <Text style={styles.projectCategory}>{project.category || 'General'}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: projectStatus.bg }
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: projectStatus.color }
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          { color: projectStatus.color }
                        ]}
                      >
                        {project.status ? project.status.charAt(0).toUpperCase() + project.status.slice(1).replace(/-/g, ' ') : 'Planning'}
                        {project.completion_percentage !== undefined && project.completion_percentage > 0
                          ? ` · ${project.completion_percentage}%`
                          : ''}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.projectDescription}>
                    {project.description || 'Team description is coming soon.'}
                  </Text>

                  <View style={styles.creatorRow}>
                    <UserAvatar
                      uri={project.creator?.avatar_url}
                      name={project.creator?.full_name}
                      size={20}
                      showRing={false}
                    />
                    <Text style={styles.creatorText}>
                      Created by {project.creator?.full_name || 'Campus Member'}
                    </Text>
                  </View>

                  {/* Mentor Information */}
                  {project.mentor && (
                    <View style={[styles.creatorRow, { marginTop: 4 }]}>
                      <UserAvatar
                        uri={project.mentor.avatar_url}
                        name={project.mentor.full_name}
                        role="faculty"
                        size={20}
                        showRing={false}
                      />
                      <Text style={[styles.creatorText, { color: Colors.primary }]}>
                        Mentor: {project.mentor.full_name}
                      </Text>
                    </View>
                  )}

                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressLabel}>Team fill</Text>
                      <Text style={[styles.progressPercent, { color: teamFillColor }]}>
                        {progressPercent}%
                      </Text>
                    </View>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${progressPercent}%`,
                            backgroundColor: teamFillColor
                          }
                        ]}
                      />
                    </View>
                  </View>

                  {Array.isArray(project.required_skills) && project.required_skills.length > 0 && (
                    <View style={styles.skillList}>
                      {project.required_skills.slice(0, 4).map((skill) => (
                        <View key={skill} style={styles.skillChip}>
                          <Text style={styles.skillChipText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.projectFooter}>
                    <View style={styles.teamInfo}>
                      <View style={styles.avatarStack}>
                        {displayMembers.slice(0, 3).map((member, index) => (
                          <View key={member.id || index} style={[styles.stackedAvatar, { marginLeft: index > 0 ? -12 : 0, zIndex: 3 - index }]}>
                            <UserAvatar
                              uri={member.avatar_url}
                              name={member.full_name}
                              size={24}
                              showRing={true}
                              role={member.role}
                            />
                          </View>
                        ))}
                        {effectiveMembersCount > 3 && (
                          <View style={[styles.moreMembersBadge, { marginLeft: -12, zIndex: 0 }]}>
                            <Text style={styles.moreMembersText}>+{effectiveMembersCount - 3}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.teamText}>
                        {effectiveMembersCount}/{project.max_members || 0} members
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.viewButton}
                      onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                    >
                      <Text style={styles.viewButtonText}>View Details</Text>
                      <MaterialIcons name="arrow-forward-ios" size={12} color="#a855f7" />
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
    backgroundColor: '#fdfbf7',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
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
    backgroundColor: '#fb7185',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fb7185',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: Spacing.md,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#fb7185',
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#fb7185',
    fontWeight: FontWeights.semibold,
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  categoriesContainer: {
    maxHeight: 50,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
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
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  categoryChipActive: {
    backgroundColor: '#fb7185',
    borderColor: '#fb7185',
  },
  categoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: SEMANTIC_COLORS.textSecondary,
  },
  categoryTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
    borderLeftWidth: 4,
    borderLeftColor: '#fda4af',
    overflow: 'hidden',
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fef3c7',
    borderRadius: BorderRadius.full,
    ...Shadows.sm,
  },
  featuredText: {
    fontSize: 11,
    fontWeight: FontWeights.semibold,
    color: '#d97706',
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
    overflow: 'hidden',
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
  statusFull: {
    backgroundColor: '#fde2e4',
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
  statusDotFull: {
    backgroundColor: '#f43f5e',
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
    textTransform: 'capitalize',
  },
  statusTextActive: {
    color: '#047857',
  },
  statusTextClosed: {
    color: '#991b1b',
  },
  statusTextFull: {
    color: '#be123c',
  },
  projectStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    marginBottom: 12,
    gap: 6,
  },
  projectStatusText: {
    fontSize: 12,
    fontWeight: FontWeights.medium,
  },
  changeStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffe4e6',
    borderRadius: BorderRadius.md,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  changeStatusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#fb7185',
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
  },
  progressBar: {
    height: 6,
    backgroundColor: SEMANTIC_COLORS.neutralLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
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
    backgroundColor: '#f1f5f9',
  },
  skillChipText: {
    fontSize: FontSizes.xs,
    color: '#64748b',
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
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  stackedAvatar: {
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 999,
  },
  moreMembersBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  moreMembersText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#fb7185',
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