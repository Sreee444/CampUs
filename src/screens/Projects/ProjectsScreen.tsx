import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Platform,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { InlineBanner } from '../../components/InlineBanner';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';

import {
  SEMANTIC_COLORS,
  getTeamFillColor,
  getProjectStatusColor,
} from '../../utils/semanticColors';
import { supabase } from '../../api/supabase';
import Toast from 'react-native-toast-message';
import { canCreateMentorProjects } from '../../utils/roles';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

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

  const isFacultyOrAlumni = canCreateMentorProjects(profile?.role);
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

  useRealtimeRefresh({
    enabled: Boolean(user?.id && profile?.role),
    tables: [
      'project_teams',
      'project_team_members',
      'project_team_join_requests',
      'profiles',
    ],
    onChange: () => {
      loadProjects(false);
    },
  });

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadProjects(false);
  }, [loadProjects]);

  const canCreateProject = profile && [
    'student', 'faculty', 'alumni', 'admin', 'developer'
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
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Projects</Text>
          {canCreateProject && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleCreateProject}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Create project"
            >
              <MaterialIcons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Pill Segmented Tabs */}
        <View style={styles.segmentedRow}>
          <TouchableOpacity
            style={[styles.segmentPill, selectedTab === 'all' && styles.segmentPillActive]}
            onPress={() => setSelectedTab('all')}
          >
            <Text style={[styles.segmentPillText, selectedTab === 'all' && styles.segmentPillTextActive]}>
              All Projects
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentPill, selectedTab === 'my' && styles.segmentPillActive]}
            onPress={() => setSelectedTab('my')}
          >
            <Text style={[styles.segmentPillText, selectedTab === 'my' && styles.segmentPillTextActive]}>
              My Projects
            </Text>
          </TouchableOpacity>
          {isFacultyOrAlumni && (
            <TouchableOpacity
              style={[styles.segmentPill, selectedTab === 'mentoring' && styles.segmentPillActive]}
              onPress={() => setSelectedTab('mentoring')}
            >
              <Text style={[styles.segmentPillText, selectedTab === 'mentoring' && styles.segmentPillTextActive]}>
                Mentoring
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search projects..."
              placeholderTextColor="#9CA3AF"
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={applySearch}
              returnKeyType="search"
            />
            {!!searchInput && (
              <TouchableOpacity onPress={() => { setSearchInput(''); setSearchQuery(''); }}>
                <MaterialIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoriesContent}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[styles.categoryChip, selectedCategory === category && styles.categoryChipActive]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[styles.categoryText, selectedCategory === category && styles.categoryTextActive]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <LoadingState message="Loading projects..." />
        ) : (
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.resultsText}>
              {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
            </Text>

            {fetchError ? (
              <InlineBanner
                type="error"
                title="Projects unavailable"
                message={fetchError}
                actionLabel="Retry"
                onAction={() => loadProjects(false)}
              />
            ) : filteredProjects.length === 0 ? (
              <EmptyState
                icon="search-off"
                title="No projects found"
                message="Try a different keyword or category."
              />
            ) : (
              filteredProjects.map((project) => {
                const hasMembersData = Array.isArray(project.members);
                const members: any[] = Array.isArray(project.members) ? project.members : [];
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
                const projectStatus = getProjectStatusColor(project.status || 'planning');

                // Status badge colours per reference design
                const statusLabel = project.status
                  ? project.status.charAt(0).toUpperCase() + project.status.slice(1).replace(/-/g, ' ')
                  : 'Planning';
                const statusIsRecruiting = (project.status || '').toLowerCase().includes('recruit') || (project.status || '').toLowerCase() === 'open';
                const statusIsInProgress = (project.status || '').toLowerCase().includes('progress') || (project.status || '').toLowerCase() === 'active';
                const badgeBg = statusIsRecruiting ? '#DBEAFE' : statusIsInProgress ? '#FEF3C7' : projectStatus.bg;
                const badgeColor = statusIsRecruiting ? '#2563EB' : statusIsInProgress ? '#D97706' : projectStatus.color;

                return (
                  <TouchableOpacity
                    key={project.id}
                    style={styles.projectCard}
                    onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                    activeOpacity={0.85}
                  >
                    {/* Header row */}
                    <View style={styles.projectHeader}>
                      <View style={styles.projectInfo}>
                        <Text style={styles.projectTitle}>{project.name}</Text>
                        <Text style={styles.projectCategory}>{project.category || 'General'}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <View style={[styles.statusDot, { backgroundColor: badgeColor }]} />
                        <Text style={[styles.statusText, { color: badgeColor }]}>
                          {statusLabel}
                          {project.completion_percentage !== undefined && project.completion_percentage > 0
                            ? ` Â· ${project.completion_percentage}%` : ''}
                        </Text>
                      </View>
                    </View>

                    {/* Stage / description */}
                    <Text style={styles.projectDescription} numberOfLines={2}>
                      {project.description || 'Team description is coming soon.'}
                    </Text>

                    {/* Creator */}
                    <View style={styles.creatorRow}>
                      <UserAvatar uri={project.creator?.avatar_url} name={project.creator?.full_name} size={20} showRing={false} />
                      <Text style={styles.creatorText}>
                        Created by {project.creator?.full_name || 'Campus Member'}
                      </Text>
                    </View>

                    {/* Mentor */}
                    {project.mentor && (
                      <View style={[styles.creatorRow, { marginTop: 4 }]}>
                        <UserAvatar uri={project.mentor.avatar_url} name={project.mentor.full_name} role="faculty" size={20} showRing={false} />
                        <Text style={[styles.creatorText, { color: '#0369a1' }]}>
                          Mentor: {project.mentor.full_name}
                        </Text>
                      </View>
                    )}

                    {/* Progress bar */}
                    <View style={styles.progressSection}>
                      <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>Team fill</Text>
                        <Text style={[styles.progressPercent, { color: '#3B82F6' }]}>{progressPercent}%</Text>
                      </View>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
                      </View>
                    </View>

                    {/* Tech tags */}
                    {Array.isArray(project.required_skills) && project.required_skills.length > 0 && (
                      <View style={styles.skillList}>
                        {project.required_skills.slice(0, 5).map((skill) => (
                          <View key={skill} style={styles.skillChip}>
                            <Text style={styles.skillChipText}>{skill}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Footer: members + view details */}
                    <View style={styles.projectFooter}>
                      <View style={styles.teamInfo}>
                        <View style={styles.avatarStack}>
                          {displayMembers.slice(0, 3).map((member, index) => (
                            <View key={member.id || index} style={[styles.stackedAvatar, { marginLeft: index > 0 ? -10 : 0, zIndex: 3 - index }]}>
                              <UserAvatar uri={member.avatar_url} name={member.full_name} size={26} showRing={true} role={member.role} />
                            </View>
                          ))}
                          {effectiveMembersCount > 3 && (
                            <View style={[styles.moreMembersBadge, { marginLeft: -10, zIndex: 0 }]}>
                              <Text style={styles.moreMembersText}>+{effectiveMembersCount - 3}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.teamText}>{effectiveMembersCount}/{project.max_members || 0} members</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.viewButton}
                        onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                      >
                        <Text style={styles.viewButtonText}>View Details</Text>
                        <MaterialIcons name="arrow-forward-ios" size={12} color="#6366F1" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5E6D8',
  },
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },

  // â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },

  // â”€â”€ Segmented pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  segmentedRow: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    gap: 4,
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentPillActive: {
    backgroundColor: '#EDEBFF',
  },
  segmentPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  segmentPillTextActive: {
    color: '#6366F1',
    fontWeight: '700',
  },

  // â”€â”€ Search bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  searchSection: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },

  // â”€â”€ Category chips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  categoriesContainer: {
    maxHeight: 48,
  },
  categoriesContent: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  categoryTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // â”€â”€ Scroll / list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  loadingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 90,
  },
  resultsText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
  },

  // â”€â”€ Project Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  projectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 35,
    elevation: 6,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  projectInfo: {
    flex: 1,
    paddingRight: 8,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  projectCategory: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 10,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  creatorText: {
    fontSize: 13,
    color: '#6B7280',
  },

  // â”€â”€ Progress bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    color: '#6B7280',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },

  // â”€â”€ Tech tags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  skillList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  skillChipText: {
    fontSize: 12,
    color: '#374151',
  },

  // â”€â”€ Footer: members + view details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 999,
  },
  moreMembersBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  moreMembersText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  teamText: {
    fontSize: 13,
    color: '#6B7280',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366F1',
  },

  // â”€â”€ Legacy/unused stubs kept to avoid import errors â”€â”€
  featuredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featuredText: { fontSize: 11, color: '#d97706' },
});
