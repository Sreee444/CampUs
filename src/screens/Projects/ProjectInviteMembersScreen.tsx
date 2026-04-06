import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { BorderRadius, FontSizes, FontWeights, getColors, Shadows, Spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import DropdownSheet from '../../components/DropdownSheet';
import { createNotification } from '../../api/notifications';
import {
  cancelProjectInvite,
  getProjectTeam,
  getTeamJoinRequests,
  sendProjectInvite,
} from '../../api/projects';
import { supabase } from '../../api/supabase';
import { DEPARTMENT_OPTIONS } from '../../constants/academic';
import { detectSkillRoles, ParticipantWithMatch, sortByMatch } from '../../utils/matchingUtils';
import { isAdminRole } from '../../utils/roles';

type ProjectInviteMembersNavigationProp = StackNavigationProp<RootStackParamList, 'ProjectInviteMembers'>;
type ProjectInviteMembersRouteProp = RouteProp<RootStackParamList, 'ProjectInviteMembers'>;

type InviteRequest = {
  id: string;
  user_id: string;
  message?: string;
  created_at?: string;
  user?: {
    id: string;
    full_name?: string;
    email?: string;
    avatar_url?: string;
    role?: string;
  };
};

type CandidateProfile = ParticipantWithMatch & {
  email?: string;
  role?: string;
  semester?: number;
  section?: string;
  interests?: string[];
};

type RoleFilter = 'all' | 'student' | 'faculty' | 'alumni';

type InviteFilters = {
  role: RoleFilter;
  department: string;
  year: string;
  semester: string;
  section: string;
};

const DEFAULT_INVITE_FILTERS: InviteFilters = {
  role: 'all',
  department: '',
  year: '',
  semester: '',
  section: '',
};

const ROLE_FILTER_OPTIONS: Array<{ label: string; value: RoleFilter }> = [
  { label: 'All roles', value: 'all' },
  { label: 'Student', value: 'student' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Alumni', value: 'alumni' },
];

const ALLOWED_PROJECT_ROLES = new Set(['student', 'faculty', 'alumni']);

const EMPTY_IDS: string[] = [];

export default function ProjectInviteMembersScreen() {
  const navigation = useNavigation<ProjectInviteMembersNavigationProp>();
  const route = useRoute<ProjectInviteMembersRouteProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user, profile } = useAuth();

  const teamId = route.params?.teamId;
  const aiRecommendedUserIds = route.params?.aiRecommendedUserIds ?? EMPTY_IDS;
  const openWithAiPicks = Boolean(route.params?.openWithAiPicks);
  const aiFallbackMode = Boolean(route.params?.aiFallbackMode);
  const aiRecommendedKey = useMemo(() => aiRecommendedUserIds.join('|'), [aiRecommendedUserIds]);
  const aiRecommendedSet = useMemo(() => new Set(aiRecommendedUserIds), [aiRecommendedKey]);

  const [team, setTeam] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInvitees, setIsLoadingInvitees] = useState(false);
  const [inviteCandidates, setInviteCandidates] = useState<CandidateProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRequest[]>([]);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [inviteSearch, setInviteSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<InviteFilters>(
    openWithAiPicks
      ? { ...DEFAULT_INVITE_FILTERS, role: 'student' }
      : DEFAULT_INVITE_FILTERS
  );
  const [draftFilters, setDraftFilters] = useState<InviteFilters>(
    openWithAiPicks
      ? { ...DEFAULT_INVITE_FILTERS, role: 'student' }
      : DEFAULT_INVITE_FILTERS
  );
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);

  const requiredRoles = useMemo(
    () => detectSkillRoles(team?.required_skills ?? []),
    [team?.required_skills]
  );

  const requiredSkillKeywords = useMemo(() => {
    const raw = Array.isArray((team as any)?.required_skills) ? (team as any).required_skills : [];
    return raw
      .map((item: any) => String(item || '').toLowerCase().trim())
      .filter(Boolean);
  }, [team?.required_skills]);

  const normalizeList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').toLowerCase().trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.toLowerCase().trim())
        .filter(Boolean);
    }
    return [];
  };

  const keywordOverlap = (keywords: string[], source: string[]) => {
    return keywords.filter((keyword) => {
      const token = keyword.toLowerCase();
      return source.some((entry) => entry.includes(token) || token.includes(entry));
    });
  };

  const getAiFit = useCallback(
    (candidate: CandidateProfile) => {
      const candidateSkills = normalizeList(candidate.skills);
      const candidateInterests = normalizeList(candidate.interests);
      const matchedSkills = keywordOverlap(requiredSkillKeywords, candidateSkills);
      const matchedInterests = keywordOverlap(requiredSkillKeywords, candidateInterests);

      const reasons: string[] = [];
      if (matchedSkills.length > 0) {
        reasons.push(`Skills match project needs: ${matchedSkills.slice(0, 3).join(', ')}`);
      }
      if (matchedInterests.length > 0) {
        reasons.push(`Interests align with project topics: ${matchedInterests.slice(0, 3).join(', ')}`);
      }
      if ((candidate.match?.detectedRoles || []).length > 0) {
        reasons.push(`Detected role fit: ${(candidate.match.detectedRoles || []).slice(0, 2).join(', ')}`);
      }

      const score = matchedSkills.length * 3 + matchedInterests.length * 2 + (candidate.match?.score || 0);

      if (reasons.length === 0) {
        reasons.push('No direct skill/interest keyword match, but still shown as a top available candidate after AI ranking and active filters.');
      }

      return {
        score,
        reasons: reasons.slice(0, 3),
      };
    },
    [requiredSkillKeywords]
  );

  const canManageTeam = useMemo(() => {
    if (!team || !user?.id) return false;
    return team.created_by === user.id || isAdminRole(profile?.role);
  }, [team, user?.id, profile?.role]);

  const loadInviteData = useCallback(async () => {
    if (!teamId) return;

    try {
      setIsLoading(true);
      const teamData = await getProjectTeam(teamId);
      setTeam(teamData);

      const requests = (await getTeamJoinRequests(teamId)) as InviteRequest[];
      const invites = (requests || []).filter((request) =>
        typeof request.message === 'string' && request.message.startsWith('[INVITE]')
      );
      setPendingInvites(invites);
      setInvitedUserIds(new Set(invites.map((invite) => invite.user_id)));

      setIsLoadingInvitees(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, department, year, semester, section, skills, interests, role');

      if (error) throw error;

      const memberIds = new Set<string>((teamData?.members || []).map((member: any) => member.id).filter(Boolean));
      if (teamData?.created_by) memberIds.add(teamData.created_by);
      if ((teamData as any)?.mentor_id) memberIds.add((teamData as any).mentor_id);
      if (user?.id) memberIds.add(user.id);

      const pendingIds = new Set<string>(invites.map((invite) => invite.user_id));

      const filtered = (data || [])
        .filter((profileItem: any) => ALLOWED_PROJECT_ROLES.has(String(profileItem.role || '').toLowerCase()))
        .filter((profileItem: any) => !memberIds.has(profileItem.id))
        .filter((profileItem: any) => !pendingIds.has(profileItem.id))
        .map((profileItem: any) => ({
          id: profileItem.id,
          full_name: profileItem.full_name,
          email: profileItem.email,
          avatar_url: profileItem.avatar_url,
          department: profileItem.department,
          year: profileItem.year,
          semester: profileItem.semester,
          section: profileItem.section,
          skills: profileItem.skills ?? [],
          interests: profileItem.interests ?? [],
          role: profileItem.role,
        }));

      let sorted = sortByMatch(filtered, detectSkillRoles(teamData?.required_skills ?? []));

      if (openWithAiPicks) {
        sorted = sorted.filter((candidate: any) => String(candidate.role || '').toLowerCase() === 'student');
      }

      if (openWithAiPicks && aiRecommendedSet.size > 0) {
        sorted = sorted.filter((candidate) => aiRecommendedSet.has(candidate.id));
      }

      if (openWithAiPicks) {
        const localRequiredKeywords = (Array.isArray((teamData as any)?.required_skills) ? (teamData as any).required_skills : [])
          .map((item: any) => String(item || '').toLowerCase().trim())
          .filter(Boolean);

        const computeLocalAiScore = (candidate: any) => {
          const skills = normalizeList(candidate.skills);
          const interests = normalizeList(candidate.interests);
          const matchedSkills = keywordOverlap(localRequiredKeywords, skills);
          const matchedInterests = keywordOverlap(localRequiredKeywords, interests);
          return matchedSkills.length * 3 + matchedInterests.length * 2 + (candidate.match?.score || 0);
        };

        sorted = [...sorted].sort((a: any, b: any) => computeLocalAiScore(b) - computeLocalAiScore(a));
      }

      setInviteCandidates(sorted);

      if (openWithAiPicks) {
        Toast.show({
          type: 'info',
          text1: 'AI Picks Loaded',
          text2: `${sorted.length} recommended users shown for quick invites.`,
        });
      }
    } catch (err: any) {
      console.error('Failed to load invite data', err);
      Toast.show({
        type: 'error',
        text1: 'Failed to load invite data',
        text2: err?.message || 'Please try again',
      });
    } finally {
      setIsLoadingInvitees(false);
      setIsLoading(false);
    }
  }, [teamId, user?.id, openWithAiPicks, aiRecommendedKey]);

  useFocusEffect(
    useCallback(() => {
      loadInviteData();
    }, [loadInviteData])
  );

  const filteredInviteCandidates = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase();
    let list = inviteCandidates.filter((candidate: any) => {
      if (activeFilters.role !== 'all' && (candidate.role || '').toLowerCase() !== activeFilters.role) return false;
      if (
        activeFilters.department &&
        (candidate.department || '').toLowerCase().trim() !== activeFilters.department.toLowerCase().trim()
      ) {
        return false;
      }
      if (activeFilters.year && String(candidate.year || '') !== activeFilters.year) return false;
      if (activeFilters.semester && String((candidate as any).semester || '') !== activeFilters.semester) return false;
      if (
        activeFilters.section &&
        String((candidate as any).section || '').toUpperCase() !== activeFilters.section.toUpperCase()
      ) {
        return false;
      }
      return true;
    });

    if (!query) return list;

    return list.filter((candidate: any) => {
      const name = (candidate.full_name || '').toLowerCase();
      const email = (candidate.email || '').toLowerCase();
      const dept = (candidate.department || '').toLowerCase();
      const role = (candidate.role || '').toLowerCase();
      const skills = (candidate.skills || []).join(' ').toLowerCase();
      return name.includes(query) || email.includes(query) || dept.includes(query) || role.includes(query) || skills.includes(query);
    });
  }, [inviteCandidates, inviteSearch, activeFilters]);

  const activeFilterCount = [
    activeFilters.role !== 'all',
    !!activeFilters.department,
    !!activeFilters.year,
    !!activeFilters.semester,
    !!activeFilters.section,
  ].filter(Boolean).length;

  const yearOptions = useMemo(() => ['1', '2', '3', '4'], []);
  const semesterOptions = useMemo(() => ['1', '2', '3', '4', '5', '6', '7', '8'], []);

  const selectedDeptForSection = draftFilters.department || activeFilters.department;
  const normalizedDept = String(selectedDeptForSection || '').trim().toLowerCase();
  const showSectionField =
    normalizedDept === 'computer science and engineering' ||
    normalizedDept === 'computer science with ai';

  const sectionOptions = useMemo(() => {
    if (!showSectionField) return [] as string[];
    return ['A', 'B', 'C'];
  }, [showSectionField, selectedDeptForSection]);

  const filteredPendingInvites = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase();
    if (!query) return pendingInvites;

    return pendingInvites.filter((invite) => {
      const name = (invite.user?.full_name || '').toLowerCase();
      const email = (invite.user?.email || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [pendingInvites, inviteSearch]);

  const applyDraftFilters = () => {
    setActiveFilters(draftFilters);
    setShowFiltersModal(false);
  };

  const resetAllFilters = () => {
    const next = openWithAiPicks
      ? { ...DEFAULT_INVITE_FILTERS, role: 'student' as RoleFilter }
      : DEFAULT_INVITE_FILTERS;
    setActiveFilters(next);
    setDraftFilters(next);
  };

  const handleInviteUser = async (targetUserId: string) => {
    if (!team || !canManageTeam || !user?.id) return;

    try {
      setInvitingUserId(targetUserId);
      const inviteRequest: any = await sendProjectInvite(
        teamId,
        targetUserId,
        profile?.full_name || user.email || 'Team leader'
      );

      await createNotification({
        user_id: targetUserId,
        title: 'Project Invitation',
        body: `${profile?.full_name || user.email || 'A team leader'} invited you to join ${team.name}`,
        type: 'project_invite',
        related_id: teamId,
        data: {
          project_request_id: inviteRequest?.id,
        },
      } as any);

      const invitedCandidate = inviteCandidates.find((candidate) => candidate.id === targetUserId) as any;

      setInvitedUserIds((prev) => new Set([...prev, targetUserId]));
      setInviteCandidates((prev) => prev.filter((candidate) => candidate.id !== targetUserId));
      setPendingInvites((prev) => [
        {
          id: inviteRequest?.id,
          user_id: targetUserId,
          message: inviteRequest?.message,
          created_at: inviteRequest?.created_at,
          user: {
            id: targetUserId,
            full_name: invitedCandidate?.full_name,
            email: invitedCandidate?.email,
            avatar_url: invitedCandidate?.avatar_url,
            role: invitedCandidate?.role,
          },
        },
        ...prev,
      ]);
      Toast.show({ type: 'success', text1: 'Invitation sent' });
    } catch (err: any) {
      console.error('Failed to invite user', err);
      Toast.show({
        type: 'error',
        text1: 'Invite Failed',
        text2: err?.message || 'Unable to send invite',
      });
    } finally {
      setInvitingUserId(null);
    }
  };

  const handleCancelInvite = async (invite: InviteRequest) => {
    try {
      await cancelProjectInvite(invite.id);

      if (invite.user_id) {
        await createNotification({
          user_id: invite.user_id,
          title: 'Invite Cancelled',
          body: `Your invite to join ${team?.name || 'the project'} was cancelled.`,
          type: 'project_invite',
          related_id: teamId,
        } as any);
      }

      Toast.show({ type: 'info', text1: 'Invite cancelled' });
      setPendingInvites((prev) => prev.filter((item) => item.id !== invite.id));
      setInvitedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(invite.user_id);
        return next;
      });
      await loadInviteData();
    } catch (err: any) {
      console.error('Failed to cancel invite', err);
      Toast.show({
        type: 'error',
        text1: 'Cancel Failed',
        text2: err?.message || 'Unable to cancel invite',
      });
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Members</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Find users and invite them to join this project.</Text>
        {!!team?.name && <Text style={styles.projectName}>{team.name}</Text>}
        {openWithAiPicks && (
          <View style={styles.aiBanner}>
            <MaterialIcons name="auto-awesome" size={14} color="#0f766e" />
            <Text style={styles.aiBannerText}>Showing AI-recommended users first.</Text>
            {aiFallbackMode && (
              <View style={styles.fallbackBadge}>
                <Text style={styles.fallbackBadgeText}>Fallback mode</Text>
              </View>
            )}
          </View>
        )}

        {!canManageTeam ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Access restricted</Text>
            <Text style={styles.emptySubtitle}>Only the project lead or admin can invite members.</Text>
          </View>
        ) : (
          <>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInputText}
                placeholder="Search by name, email, department, role, or skill"
                placeholderTextColor={Colors.textSecondary}
                value={inviteSearch}
                onChangeText={setInviteSearch}
                returnKeyType="search"
              />
              {!!inviteSearch && (
                <TouchableOpacity onPress={() => setInviteSearch('')}>
                  <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterActionRow}>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => {
                  setDraftFilters(activeFilters);
                  setShowFiltersModal(true);
                }}
              >
                <MaterialIcons name="filter-list" size={18} color={Colors.primary} />
                <Text style={styles.filterButtonText}>Filters</Text>
                {activeFilterCount > 0 && (
                  <View style={[styles.filterCountBadge, { backgroundColor: Colors.primary }]}>
                    <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {activeFilterCount > 0 && (
                <TouchableOpacity style={styles.clearFilterBtn} onPress={resetAllFilters}>
                  <Text style={styles.clearFilterText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterSummaryRow}>
              <Text style={styles.filterSummaryText}>
                Role: {ROLE_FILTER_OPTIONS.find((option) => option.value === activeFilters.role)?.label || 'All roles'}
              </Text>
              {!!activeFilters.department && (
                <Text style={styles.filterSummaryText}>Dept: {activeFilters.department}</Text>
              )}
              {!!activeFilters.year && (
                <Text style={styles.filterSummaryText}>Year: {activeFilters.year}</Text>
              )}
              {!!activeFilters.semester && (
                <Text style={styles.filterSummaryText}>Sem: {activeFilters.semester}</Text>
              )}
              {!!activeFilters.section && (
                <Text style={styles.filterSummaryText}>Section: {activeFilters.section}</Text>
              )}
            </View>

            {filteredPendingInvites.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Requests</Text>
                  <Text style={styles.sectionCount}>{filteredPendingInvites.length}</Text>
                </View>

                {filteredPendingInvites.map((invite) => (
                  <View key={invite.id} style={styles.card}>
                    <TouchableOpacity
                      style={styles.info}
                      onPress={() => navigation.navigate('PublicProfile', { userId: invite.user_id })}
                    >
                      <UserAvatar
                        uri={invite.user?.avatar_url}
                        name={invite.user?.full_name || 'User'}
                        size={44}
                        showRing
                      />
                      <View style={styles.details}>
                        <Text style={styles.name}>{invite.user?.full_name || 'Anonymous'}</Text>
                        <Text style={styles.meta}>{invite.user?.email || 'Invite pending approval'}</Text>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelInvite(invite)}>
                        <Text style={styles.cancelText}>Cancel Request</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {isLoadingInvitees ? (
              <View style={styles.centeredSmall}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading users...</Text>
              </View>
            ) : filteredInviteCandidates.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptySubtitle}>Try another filter or search query.</Text>
              </View>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Available Users</Text>
                  <Text style={styles.sectionCount}>{filteredInviteCandidates.length}</Text>
                </View>
                {filteredInviteCandidates.map((candidate) => {
                  const isInvited = invitedUserIds.has(candidate.id);
                  const aiReasonLines = openWithAiPicks ? getAiFit(candidate as CandidateProfile).reasons : [];

                  return (
                    <View key={candidate.id} style={styles.card}>
                      <TouchableOpacity
                        style={styles.info}
                        onPress={() => navigation.navigate('PublicProfile', { userId: candidate.id })}
                      >
                        <UserAvatar
                          uri={candidate.avatar_url}
                          name={candidate.full_name || 'User'}
                          size={44}
                          showRing
                        />
                        <View style={styles.details}>
                          <Text style={styles.name}>{candidate.full_name || 'Anonymous'}</Text>
                          <Text style={styles.meta}>
                            {[candidate.department, candidate.year ? `Year ${candidate.year}` : null]
                              .filter(Boolean)
                              .join(' • ')}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {openWithAiPicks && aiReasonLines.length > 0 && (
                        <View style={styles.aiReasonBox}>
                          <Text style={styles.aiReasonTitle}>Why AI picked</Text>
                          {aiReasonLines.map((line, idx) => (
                            <Text key={`${candidate.id}-ai-reason-${idx}`} style={styles.aiReasonItem}>
                              • {line}
                            </Text>
                          ))}
                        </View>
                      )}

                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.inviteBtn, (invitingUserId === candidate.id || isInvited) && styles.inviteBtnDisabled]}
                          onPress={() => handleInviteUser(candidate.id)}
                          disabled={invitingUserId === candidate.id || isInvited}
                        >
                          {invitingUserId === candidate.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.inviteText}>{isInvited ? 'Invited' : 'Invite'}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </>
        )}
      </View>

      <Modal visible={showFiltersModal} transparent animationType="slide" onRequestClose={() => setShowFiltersModal(false)}>
        <View style={styles.filterModalOverlay}>
          <View style={styles.filterModalCard}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter Users</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <MaterialIcons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterField}>
              <Text style={styles.filterFieldLabel}>Role</Text>
              <TouchableOpacity style={styles.filterInputBtn} onPress={() => setShowRolePicker(true)}>
                <Text style={styles.filterInputText}>
                  {ROLE_FILTER_OPTIONS.find((option) => option.value === draftFilters.role)?.label || 'All roles'}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterField}>
              <Text style={styles.filterFieldLabel}>Department</Text>
              <TouchableOpacity style={styles.filterInputBtn} onPress={() => setShowDepartmentPicker(true)}>
                <Text style={styles.filterInputText}>{draftFilters.department || 'All departments'}</Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterField}>
              <Text style={styles.filterFieldLabel}>Year</Text>
              <TouchableOpacity style={styles.filterInputBtn} onPress={() => setShowYearPicker(true)}>
                <Text style={styles.filterInputText}>{draftFilters.year ? `Year ${draftFilters.year}` : 'All years'}</Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterField}>
              <Text style={styles.filterFieldLabel}>Semester</Text>
              <TouchableOpacity style={styles.filterInputBtn} onPress={() => setShowSemesterPicker(true)}>
                <Text style={styles.filterInputText}>
                  {draftFilters.semester ? `Semester ${draftFilters.semester}` : 'All semesters'}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {showSectionField && (
              <View style={styles.filterField}>
                <Text style={styles.filterFieldLabel}>Section</Text>
                <TouchableOpacity style={styles.filterInputBtn} onPress={() => setShowSectionPicker(true)}>
                  <Text style={styles.filterInputText}>{draftFilters.section || 'All sections'}</Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.filterModalActions}>
              <TouchableOpacity style={styles.filterModalResetBtn} onPress={resetAllFilters}>
                <Text style={styles.filterModalResetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterModalApplyBtn} onPress={applyDraftFilters}>
                <Text style={styles.filterModalApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DropdownSheet
        visible={showRolePicker}
        title="Filter by Role"
        options={ROLE_FILTER_OPTIONS.map((option) => option.label)}
        onClose={() => setShowRolePicker(false)}
        onSelect={(value) => {
          const selected = ROLE_FILTER_OPTIONS.find((option) => option.label === value);
          setDraftFilters((prev) => ({
            ...prev,
            role: selected?.value || 'all',
          }));
          setShowRolePicker(false);
        }}
      />

      <DropdownSheet
        visible={showDepartmentPicker}
        title="Filter by Department"
        options={['All Departments', ...DEPARTMENT_OPTIONS] as string[]}
        onClose={() => setShowDepartmentPicker(false)}
        onSelect={(value) => {
          const nextDepartment = value === 'All Departments' ? '' : value;
          const normalizedNextDept = String(nextDepartment || '').trim().toLowerCase();
          const isNextCseDept =
            normalizedNextDept === 'computer science and engineering' ||
            normalizedNextDept === 'computer science with ai';
          const nextSectionOptions = isNextCseDept ? ['A', 'B', 'C'] : [];
          setDraftFilters((prev) => ({
            ...prev,
            department: nextDepartment,
            section: prev.section && nextSectionOptions.includes(prev.section) ? prev.section : '',
          }));
          setShowDepartmentPicker(false);
        }}
      />

      <DropdownSheet
        visible={showYearPicker}
        title="Filter by Year"
        options={['All Years', ...yearOptions.map((year) => `Year ${year}`)]}
        onClose={() => setShowYearPicker(false)}
        onSelect={(value) => {
          setDraftFilters((prev) => ({
            ...prev,
            year: value === 'All Years' ? '' : value.replace('Year ', ''),
          }));
          setShowYearPicker(false);
        }}
      />

      <DropdownSheet
        visible={showSemesterPicker}
        title="Filter by Semester"
        options={['All Semesters', ...semesterOptions.map((semester) => `Semester ${semester}`)]}
        onClose={() => setShowSemesterPicker(false)}
        onSelect={(value) => {
          setDraftFilters((prev) => ({
            ...prev,
            semester: value === 'All Semesters' ? '' : value.replace('Semester ', ''),
          }));
          setShowSemesterPicker(false);
        }}
      />

      <DropdownSheet
        visible={showSectionPicker}
        title="Filter by Section"
        options={['All Sections', ...sectionOptions]}
        onClose={() => setShowSectionPicker(false)}
        onSelect={(value) => {
          setDraftFilters((prev) => ({
            ...prev,
            section: value === 'All Sections' ? '' : value,
          }));
          setShowSectionPicker(false);
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      backgroundColor: Colors.card,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    content: {
      flex: 1,
      padding: Spacing.md,
    },
    subtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: 6,
    },
    projectName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    aiBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#ecfeff',
      borderWidth: 1,
      borderColor: '#99f6e4',
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: Spacing.sm,
    },
    aiBannerText: {
      fontSize: FontSizes.xs,
      color: '#0f766e',
      fontWeight: FontWeights.medium,
    },
    fallbackBadge: {
      marginLeft: 'auto',
      backgroundColor: '#ffedd5',
      borderColor: '#fdba74',
      borderWidth: 1,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    fallbackBadgeText: {
      fontSize: 10,
      fontWeight: FontWeights.bold,
      color: '#9a3412',
    },
    searchBar: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.card,
      gap: 8,
    },
    searchInputText: {
      flex: 1,
      color: Colors.text,
      fontSize: FontSizes.sm,
    },
    filterActionRow: {
      marginTop: Spacing.sm,
      marginBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.card,
      paddingHorizontal: 12,
      height: 36,
    },
    filterButtonText: {
      fontSize: FontSizes.xs,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    filterCountBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterCountText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: FontWeights.semibold,
    },
    filterSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: Spacing.xs,
    },
    filterSummaryText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      backgroundColor: Colors.card,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    filterModalOverlay: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
      paddingHorizontal: Spacing.md,
    },
    filterModalCard: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    filterModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    filterModalTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    filterField: {
      marginBottom: Spacing.sm,
    },
    filterFieldLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginBottom: 6,
    },
    filterInputBtn: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      height: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Colors.card,
    },
    filterInputText: {
      color: Colors.text,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    filterModalActions: {
      marginTop: Spacing.sm,
      flexDirection: 'row',
      gap: 10,
    },
    filterModalResetBtn: {
      flex: 1,
      height: 42,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.card,
    },
    filterModalResetText: {
      color: Colors.text,
      fontWeight: FontWeights.medium,
      fontSize: FontSizes.sm,
    },
    filterModalApplyBtn: {
      flex: 1,
      height: 42,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
    },
    filterModalApplyText: {
      color: '#fff',
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.sm,
    },
    clearFilterBtn: {
      paddingHorizontal: 10,
      height: 36,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      justifyContent: 'center',
    },
    clearFilterText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    sectionWrap: {
      marginBottom: Spacing.sm,
    },
    sectionHeader: {
      marginTop: Spacing.sm,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    sectionCount: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
    },
    list: {
      marginTop: Spacing.xs,
    },
    card: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      ...Shadows.sm,
    },
    info: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    details: {
      flex: 1,
    },
    name: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    meta: {
      marginTop: 2,
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    aiReasonBox: {
      marginTop: 10,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: '#99f6e4',
      backgroundColor: '#ecfeff',
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 4,
    },
    aiReasonTitle: {
      fontSize: FontSizes.xs,
      color: '#0f766e',
      fontWeight: FontWeights.semibold,
    },
    aiReasonItem: {
      fontSize: FontSizes.xs,
      color: '#115e59',
      lineHeight: 16,
    },
    actions: {
      marginTop: 10,
      width: '100%',
    },
    inviteBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: BorderRadius.full,
      backgroundColor: '#4f46e5',
    },
    inviteBtnDisabled: {
      opacity: 0.6,
    },
    inviteText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    cancelBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: BorderRadius.full,
      backgroundColor: '#fee2e2',
    },
    cancelText: {
      color: '#ef4444',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centeredSmall: {
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    emptyWrap: {
      marginTop: 16,
      padding: 16,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    emptyTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      lineHeight: 20,
    },
  });
