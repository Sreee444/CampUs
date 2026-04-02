import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { FontSizes, getColors } from '../../theme';
import { Profile, UserRole } from '../../types/database';
import { RootStackParamList } from '../../navigation/types';
import { createDirectConversation } from '../../api/chat';
import { createNotification } from '../../api/notifications';
import { UserAvatar } from '../../components/UserAvatar';

type Nav = StackNavigationProp<RootStackParamList>;
type SupportedRole = 'student' | 'faculty' | 'alumni' | 'admin';

type InsightState = {
  role: SupportedRole;
  activityScore: number;
  scoreMessage: string;
  streakDays: number;
  projectsCount: number;
  eventsCount: number;
  messagesCount: number;
  inactivityDays: number;
  inactivityWarning: boolean;
  suggestions: string[];
  roleHighlights: string[];
};

type InactiveUserCard = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  department?: string | null;
  last_active?: string | null;
  inactivityDays: number;
  projectsCount: number;
  messagesCount: number;
};

type TopPerformerCard = InactiveUserCard & {
  activityScore: number;
  activitySummary: string;
};

const HIGH_SCORE_MESSAGES = [
  "🔥 You're on fire this week!",
  '🚀 Keep up the momentum!',
  '✨ Nice consistency this week!',
];

const MID_SCORE_MESSAGES = [
  "👍 You're doing well, keep improving!",
  '🌟 Steady progress, keep it going!',
  '💪 Good rhythm so far, stay active!',
];

const LOW_SCORE_MESSAGES = [
  '⚠️ Your activity is low. Try engaging more.',
  '💡 Small actions daily can boost your progress.',
  '📅 Start with one discussion or event today.',
];

const pickRandom = (items: string[]) => items[Math.floor(Math.random() * items.length)] || items[0] || '';

const daysSince = (dateValue?: string | null) => {
  if (!dateValue) return 999;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
};

const normalizeRole = (role?: UserRole | null): SupportedRole => {
  if (role === 'faculty') return 'faculty';
  if (role === 'alumni') return 'alumni';
  if (role === 'admin' || role === 'developer') return 'admin';
  return 'student';
};

const safeCount = async (queryBuilder: any) => {
  const { count, error } = await queryBuilder;
  if (error) return 0;
  return count || 0;
};

const getPerformanceComment = (score: number) => {
  if (score >= 80) return "🔥 You're leading the pack this week";
  if (score >= 50) return '🚀 Strong momentum, keep it going';
  return '💡 Good activity, keep building consistency';
};

export default function AIInsightsScreen() {
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const { user, profile } = useAuth();
  const styles = useMemo(() => createStyles(Colors), [Colors]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [insights, setInsights] = useState<InsightState | null>(null);
  const [inactiveUsers, setInactiveUsers] = useState<InactiveUserCard[]>([]);
  const [inactiveWeekCount, setInactiveWeekCount] = useState(0);
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [topPerformerTab, setTopPerformerTab] = useState<'student' | 'faculty' | 'alumni'>('student');
  const [topPerformers, setTopPerformers] = useState<Record<'student' | 'faculty' | 'alumni', TopPerformerCard[]>>({
    student: [],
    faculty: [],
    alumni: [],
  });
  const [sendingReminderTo, setSendingReminderTo] = useState<string | null>(null);
  const [reminderSentMap, setReminderSentMap] = useState<Record<string, string>>({});

  const loadInsights = useCallback(async (refresh = false) => {
    if (!user?.id) return;

    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let currentProfile = profile;
      const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      if (!currentProfile) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (data) currentProfile = data as Profile;
      }

      const role = normalizeRole(currentProfile?.role);
      const inactivityDays = daysSince(currentProfile?.last_active);
      const inactivityWarning = inactivityDays > 3;

      const [messagesCount, projectsCount, eventsCount] = await Promise.all([
        safeCount(
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('sender_id', user.id)
            .gte('created_at', weekAgoISO)
        ),
        safeCount(
          supabase
            .from('project_team_members')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('joined_at', weekAgoISO)
        ),
        safeCount(
          supabase
            .from('event_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', weekAgoISO)
        ),
      ]);

      const scoreRaw = (messagesCount * 2) + (projectsCount * 5) + (eventsCount * 3);
      const activityScore = Math.min(100, Math.max(0, scoreRaw));
      const streakDays = inactivityDays <= 0 ? Math.max(1, Math.min(10, 1 + Math.floor(scoreRaw / 8))) : 0;

      let scoreMessage = '';
      if (activityScore > 80) scoreMessage = pickRandom(HIGH_SCORE_MESSAGES);
      else if (activityScore >= 50) scoreMessage = pickRandom(MID_SCORE_MESSAGES);
      else scoreMessage = pickRandom(LOW_SCORE_MESSAGES);

      const skills = currentProfile?.skills || [];
      const interests = currentProfile?.interests || [];
      const primarySkill = skills[0] || interests[0] || 'your interests';

      let suggestions: string[] = [];
      let roleHighlights: string[] = [];

      if (role === 'student') {
        if (projectsCount === 0) suggestions.push(`Join a project that matches ${primarySkill}.`);
        else suggestions.push('Contribute consistently in your current project to improve visibility.');

        if (eventsCount === 0) suggestions.push('Attend an upcoming event to increase your activity score.');
        else suggestions.push('Register for one more event this week to keep momentum.');

        if (messagesCount < 5) suggestions.push('Connect with a student in your field and start one discussion.');
        else suggestions.push('Keep discussions active by replying to peers in shared topics.');

        roleHighlights = [
          skills.length === 0
            ? 'Add skills to improve visibility.'
            : `Your skills profile is ${skills.length} items strong. Keep it updated.`,
          (!currentProfile?.bio || !currentProfile?.department)
            ? 'Complete your profile to get more invites.'
            : 'Complete profile details improve quality of suggestions.',
        ];
      } else if (role === 'faculty') {
        const studentsQuery = supabase
          .from('profiles')
          .select('id, last_active')
          .eq('role', 'student');

        const scopedStudentsQuery = currentProfile?.department
          ? studentsQuery.eq('department', currentProfile.department)
          : studentsQuery;

        const { data: students } = await scopedStudentsQuery;
        const activeStudents = (students || []).filter((s: any) => daysSince(s.last_active) <= 3).length;
        const inactiveStudents = Math.max(0, (students || []).length - activeStudents);

        const { data: ownedProjects } = await supabase
          .from('project_teams')
          .select('id')
          .eq('created_by', user.id)
          .limit(50);

        const ownedProjectIds = (ownedProjects || []).map((project: any) => project.id).filter(Boolean);
        const participationCount = ownedProjectIds.length > 0
          ? await safeCount(
              supabase
                .from('project_team_members')
                .select('id', { count: 'exact', head: true })
                .in('team_id', ownedProjectIds)
            )
          : 0;

        suggestions = [
          'Encourage discussions in active student groups.',
          'Guide inactive students with a quick mentoring check-in.',
          'Start a short project review session this week.',
        ];

        roleHighlights = [
          `👥 ${activeStudents} active students`,
          `⚠️ ${inactiveStudents} students inactive`,
          `📁 ${ownedProjectIds.length} active projects with ${participationCount} student participations`,
        ];
      } else if (role === 'alumni') {
        const { data: studentProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, skills, interests')
          .eq('role', 'student')
          .limit(40);

        const rankedStudents = (studentProfiles || [])
          .map((student: any) => {
            const sharedSkills = (student.skills || []).filter((s: string) => skills.includes(s));
            const sharedInterests = (student.interests || []).filter((i: string) => interests.includes(i));
            return {
              id: student.id,
              full_name: student.full_name,
              sharedSkills,
              score: (sharedSkills.length * 2) + sharedInterests.length,
            };
          })
          .filter((student: any) => student.score > 0)
          .sort((a: any, b: any) => b.score - a.score);

        const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [helpedCount, repliesCount] = await Promise.all([
          safeCount(
            supabase
              .from('mentorship_messages')
              .select('id', { count: 'exact', head: true })
              .eq('sender_id', user.id)
              .gte('created_at', weekAgoISO)
          ),
          safeCount(
            supabase
              .from('discussion_replies')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', weekAgoISO)
          ),
        ]);

        const topStudent = rankedStudents[0];
        const topTopic = topStudent?.sharedSkills?.[0] || 'skill growth';

        suggestions = [
          'Share your experience in one focused guidance post.',
          'Mentor more students through short weekly check-ins.',
          'Respond to one student question in discussions today.',
        ];

        roleHighlights = [
          `👨‍🎓 ${rankedStudents.length} students need guidance in your skill areas`,
          topStudent
            ? `🤝 Connect with ${topStudent.full_name || 'a student'} (${topTopic})`
            : '🤝 Explore student profiles to find your best mentorship match',
          `🌟 You helped ${helpedCount} students this week`,
          `💬 ${repliesCount} replies in discussions`,
        ];
      } else {
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, last_active')
          .limit(300);

        const activeUsers = (allProfiles || []).filter((p: any) => daysSince(p.last_active) <= 3).length;
        const inactiveUsers = Math.max(0, (allProfiles || []).length - activeUsers);
        const healthMessage = inactiveUsers <= Math.max(2, Math.floor(activeUsers * 0.2))
          ? '🚀 Platform is highly active'
          : '👥 Most users are engaged';

        suggestions = [
          '💡 Encourage engagement through quick weekly challenges.',
          '📅 Promote upcoming events for low-activity segments.',
          '🤝 Highlight active communities to motivate participation.',
        ];

        roleHighlights = [
          `📈 ${healthMessage}`,
          `👥 ${activeUsers} users active recently`,
          `⚠️ ${inactiveUsers} users need re-engagement`,
        ];

        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role, department, last_active')
          .neq('role', 'developer')
          .limit(300);

        const inactiveCandidates = (profileRows || [])
          .map((row: any) => ({ ...row, inactivityDays: daysSince(row.last_active) }))
          .filter((row: any) => row.id !== user.id && row.inactivityDays > 3)
          .sort((a: any, b: any) => b.inactivityDays - a.inactivityDays);

        const weeklyInactive = inactiveCandidates.filter((row: any) => row.inactivityDays <= 7).length;
        const weeklyActive = (profileRows || []).filter((row: any) => daysSince(row.last_active) <= 3).length;

        const inactiveWithStats = await Promise.all(
          inactiveCandidates.slice(0, 20).map(async (inactiveUser: any) => {
            const [projectsCountByUser, messagesCountByUser] = await Promise.all([
              safeCount(
                supabase
                  .from('project_team_members')
                  .select('id', { count: 'exact', head: true })
                  .eq('user_id', inactiveUser.id)
              ),
              safeCount(
                supabase
                  .from('messages')
                  .select('id', { count: 'exact', head: true })
                  .eq('sender_id', inactiveUser.id)
              ),
            ]);

            return {
              id: inactiveUser.id,
              full_name: inactiveUser.full_name,
              avatar_url: inactiveUser.avatar_url,
              role: inactiveUser.role,
              department: inactiveUser.department,
              last_active: inactiveUser.last_active,
              inactivityDays: inactiveUser.inactivityDays,
              projectsCount: projectsCountByUser,
              messagesCount: messagesCountByUser,
            } as InactiveUserCard;
          })
        );

        setInactiveUsers(inactiveWithStats);
        setInactiveWeekCount(weeklyInactive || inactiveWithStats.length);
        setActiveUsersCount(weeklyActive);

        const buildTopPerformers = async (roleFilter: 'student' | 'faculty' | 'alumni') => {
          const { data: roleProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role, department, last_active')
            .eq('role', roleFilter)
            .limit(30);

          const cards = await Promise.all(
            (roleProfiles || []).map(async (row: any) => {
              const [messageCount, projectCount, eventCount] = await Promise.all([
                safeCount(
                  supabase
                    .from('messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('sender_id', row.id)
                    .gte('created_at', weekAgoISO)
                ),
                safeCount(
                  supabase
                    .from('project_team_members')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', row.id)
                    .gte('joined_at', weekAgoISO)
                ),
                safeCount(
                  supabase
                    .from('event_registrations')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', row.id)
                    .gte('created_at', weekAgoISO)
                ),
              ]);

              const activityScore = Math.min(100, (messageCount * 2) + (projectCount * 5) + (eventCount * 3));
              return {
                id: row.id,
                full_name: row.full_name,
                avatar_url: row.avatar_url,
                role: row.role,
                department: row.department,
                last_active: row.last_active,
                inactivityDays: daysSince(row.last_active),
                projectsCount: projectCount,
                messagesCount: messageCount,
                activityScore,
                activitySummary: getPerformanceComment(activityScore),
              } as TopPerformerCard;
            })
          );

          return cards
            .filter((item) => item.activityScore > 0)
            .filter((item) => daysSince(item.last_active) <= 3)
            .sort((a, b) => b.activityScore - a.activityScore)
            .slice(0, 3);
        };

        const [studentTop, facultyTop, alumniTop] = await Promise.all([
          buildTopPerformers('student'),
          buildTopPerformers('faculty'),
          buildTopPerformers('alumni'),
        ]);

        setTopPerformers({
          student: studentTop,
          faculty: facultyTop,
          alumni: alumniTop,
        });
      }

      setInsights({
        role,
        activityScore,
        scoreMessage,
        streakDays,
        projectsCount,
        eventsCount,
        messagesCount,
        inactivityDays,
        inactivityWarning,
        suggestions: suggestions.slice(0, 3),
        roleHighlights,
      });

      if (role !== 'admin') {
        setInactiveUsers([]);
        setInactiveWeekCount(0);
        setActiveUsersCount(0);
        setTopPerformers({ student: [], faculty: [], alumni: [] });
      }
    } catch (error) {
      console.error('Failed to load personal AI insights:', error);
      setInsights(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadInsights();
  }, [user?.id]);

  const roleTitle = useMemo(() => {
    if (!insights) return 'Personal summary';
    if (insights.role === 'student') return 'Student activity summary';
    if (insights.role === 'faculty') return 'Faculty engagement summary';
    if (insights.role === 'alumni') return 'Alumni contribution summary';
    return 'Platform engagement summary';
  }, [insights]);

  const handleMessageInactiveUser = useCallback(async (inactiveUser: InactiveUserCard) => {
    if (!user?.id) return;

    try {
      const conversation = await createDirectConversation(user.id, inactiveUser.id);
      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        name: inactiveUser.full_name || 'User',
        isGroup: false,
        partnerUserId: inactiveUser.id,
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Unable to open chat',
        text2: error?.message || 'Please try again',
      });
    }
  }, [navigation, user?.id]);

  const handleSendReminder = useCallback(async (inactiveUser: InactiveUserCard) => {
    try {
      setSendingReminderTo(inactiveUser.id);
      await createNotification({
        user_id: inactiveUser.id,
        type: 'admin_reminder',
        title: 'Activity Reminder',
        body: 'You’ve been inactive recently. Check out new projects and discussions 🚀',
        related_id: inactiveUser.id,
        related_type: 'profile',
      });
      setReminderSentMap((prev) => ({
        ...prev,
        [inactiveUser.id]: new Date().toISOString(),
      }));
      Toast.show({ type: 'success', text1: 'Reminder sent' });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to send reminder',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setSendingReminderTo(null);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Insights</Text>
            <Text style={styles.headerSub}>Smart insights based on your activity</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadInsights(true)}
                tintColor="#6366F1"
              />
            }
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity Summary</Text>
              <Text style={styles.sectionSubtitle}>{roleTitle}</Text>

              <View style={styles.scoreRow}>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreValue}>{insights?.activityScore ?? 0}</Text>
                  <Text style={styles.scoreLabel}>Score</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLine}>{insights?.scoreMessage || 'Insights are ready.'}</Text>
                  <Text style={styles.summaryLine}>🔥 {insights?.streakDays || 0}-day streak</Text>
                  <Text style={styles.summaryHint}>💡 Keep it going!</Text>
                </View>
              </View>

              <View style={styles.chipsRow}>
                <View style={styles.chip}><Text style={styles.chipText}>💬 {insights?.messagesCount || 0} messages</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>👥 {insights?.projectsCount || 0} projects</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>📅 {insights?.eventsCount || 0} events</Text></View>
              </View>

              {insights?.inactivityWarning ? (
                <Text style={styles.warningText}>⚠️ You were inactive for {insights.inactivityDays} days. A quick action today can improve your score.</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suggestions</Text>
              <View style={styles.suggestionsWrap}>
                {(insights?.suggestions || []).map((suggestion, index) => (
                  <View key={`${suggestion}-${index}`} style={styles.suggestionPill}>
                    <Text style={styles.suggestionPillText}> {suggestion}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Role Insights</Text>
              {(insights?.roleHighlights || []).map((item, index) => (
                <Text key={`${item}-${index}`} style={styles.listItem}>{item}</Text>
              ))}
            </View>

            {insights?.role === 'admin' ? (
              <View style={styles.adminSectionWrap}>
                <Text style={styles.sectionTitle}>Inactive Users</Text>
                <Text style={styles.inactiveHeaderText}>⚠️ {inactiveWeekCount} users inactive this week</Text>
                <Text style={styles.activeHeaderText}>✅ {activeUsersCount} users active this week</Text>

                {inactiveUsers.length === 0 ? (
                  <View style={styles.emptyAdminState}>
                    <Text style={styles.emptyAdminStateText}>No inactive users found right now.</Text>
                  </View>
                ) : (
                  inactiveUsers.map((inactiveUser) => (
                    <View key={inactiveUser.id} style={styles.inactiveUserCard}>
                      <View style={styles.inactiveUserTopRow}>
                        <View style={styles.inactiveUserIdentityRow}>
                          <UserAvatar
                            uri={inactiveUser.avatar_url}
                            name={inactiveUser.full_name}
                            role={inactiveUser.role as any}
                            size={42}
                            showRing={false}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.inactiveUserName}>{inactiveUser.full_name || 'Campus User'}</Text>
                            <Text style={styles.inactiveUserMeta}>
                              {(inactiveUser.role || 'student').toString()} {inactiveUser.department ? `• ${inactiveUser.department}` : ''}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.inactiveBadge}>
                          <Text style={styles.inactiveBadgeText}>Inactive</Text>
                        </View>
                      </View>

                      <Text style={styles.lastActiveText}>Last active: {inactiveUser.inactivityDays} days ago</Text>

                      <View style={styles.activityStatsRow}>
                        <Text style={styles.activityStatText}>Projects: {inactiveUser.projectsCount}</Text>
                        <Text style={styles.activityStatText}>Messages: {inactiveUser.messagesCount}</Text>
                      </View>

                      <View style={styles.actionButtonsRow}>
                        <TouchableOpacity
                          style={styles.messageButton}
                          onPress={() => handleMessageInactiveUser(inactiveUser)}
                          activeOpacity={0.85}
                        >
                          <MaterialIcons name="chat-bubble-outline" size={14} color="#4F46E5" />
                          <Text style={styles.messageButtonText}>Message</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.reminderButton}
                          onPress={() => handleSendReminder(inactiveUser)}
                          activeOpacity={0.85}
                          disabled={sendingReminderTo === inactiveUser.id}
                        >
                          <MaterialIcons name="notifications-active" size={14} color="#FFFFFF" />
                          <Text style={styles.reminderButtonText}>
                            {sendingReminderTo === inactiveUser.id ? 'Sending...' : 'Send Reminder'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {reminderSentMap[inactiveUser.id] ? (
                        <Text style={styles.reminderStatusText}>Reminder sent just now</Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {insights?.role === 'admin' ? (
              <View style={styles.adminSectionWrap}>
                <Text style={styles.sectionTitle}>Top Performers</Text>
                <Text style={styles.topPerformerSub}>
                  {topPerformers[topPerformerTab].length} users with points above zero
                </Text>

                <View style={styles.performerTabsRow}>
                  {(['student', 'faculty', 'alumni'] as const).map((roleKey) => (
                    <TouchableOpacity
                      key={roleKey}
                      style={[styles.performerTab, topPerformerTab === roleKey && styles.performerTabActive]}
                      onPress={() => setTopPerformerTab(roleKey)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.performerTabText, topPerformerTab === roleKey && styles.performerTabTextActive]}>
                        {roleKey.charAt(0).toUpperCase() + roleKey.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {(topPerformers[topPerformerTab] || []).length === 0 ? (
                  <View style={styles.emptyAdminState}>
                    <Text style={styles.emptyAdminStateText}>No users with points above zero right now.</Text>
                  </View>
                ) : (
                  topPerformers[topPerformerTab].map((item) => (
                    <View key={item.id} style={styles.performerCard}>
                      <View style={styles.inactiveUserTopRow}>
                        <View style={styles.inactiveUserIdentityRow}>
                          <UserAvatar
                            uri={item.avatar_url}
                            name={item.full_name}
                            role={item.role as any}
                            size={42}
                            showRing={false}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.inactiveUserName}>{item.full_name || 'Campus User'}</Text>
                            <Text style={styles.inactiveUserMeta}>
                              {(item.role || 'student').toString()} {item.department ? `• ${item.department}` : ''}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.performerScoreBadge}>
                          <Text style={styles.performerScoreText}>{item.activityScore}</Text>
                        </View>
                      </View>

                      <Text style={styles.performerCommentText}>{item.activitySummary}</Text>
                      <Text style={styles.lastActiveText}>
                        Last active: {item.inactivityDays === 0 ? 'today' : `${item.inactivityDays} days ago`}
                      </Text>

                      <View style={styles.activityStatsRow}>
                        <Text style={styles.activityStatText}>Projects: {item.projectsCount}</Text>
                        <Text style={styles.activityStatText}>Messages: {item.messagesCount}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </ScrollView>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: '#F5E6D8',
    },
    container: {
      flex: 1,
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    backBtn: {
      marginRight: 10,
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.75)',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: '#111827',
    },
    headerSub: {
      marginTop: 3,
      fontSize: FontSizes.sm,
      color: '#6B7280',
      fontWeight: '500',
    },
    loaderWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 90,
      gap: 18,
    },
    section: {
      backgroundColor: '#FFFFFF',
      borderRadius: 20,
      padding: 16,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: '#1F2937',
    },
    sectionSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: '#6B7280',
      fontWeight: '500',
    },
    scoreRow: {
      marginTop: 12,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    scoreCircle: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreValue: {
      fontSize: 22,
      fontWeight: '800',
      color: '#4338CA',
      lineHeight: 30,
    },
    scoreLabel: {
      fontSize: 12,
      color: '#6B7280',
      fontWeight: '600',
    },
    summaryLine: {
      fontSize: 14,
      color: '#1F2937',
      fontWeight: '600',
      marginBottom: 4,
    },
    summaryHint: {
      fontSize: 13,
      color: '#4B5563',
      fontWeight: '500',
    },
    chipsRow: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: '#FFFFFF',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      shadowColor: '#000',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    chipText: {
      fontSize: 12,
      color: '#4B5563',
      fontWeight: '700',
    },
    warningText: {
      marginTop: 10,
      color: '#B45309',
      fontSize: 13,
      fontWeight: '600',
    },
    listItem: {
      marginTop: 10,
      fontSize: 14,
      color: '#374151',
      fontWeight: '500',
      lineHeight: 20,
    },
    reminderStatusText: {
      marginTop: 8,
      color: '#059669',
      fontSize: 12,
      fontWeight: '700',
    },
    suggestionsWrap: {
      marginTop: 12,
      gap: 10,
    },
    suggestionPill: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      shadowColor: '#000',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    suggestionPillText: {
      color: '#374151',
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    adminSectionWrap: {
      paddingHorizontal: 16,
    },
    inactiveHeaderText: {
      marginTop: 6,
      fontSize: 14,
      color: '#B45309',
      fontWeight: '700',
    },
    activeHeaderText: {
      marginTop: 4,
      fontSize: 14,
      color: '#059669',
      fontWeight: '700',
    },
    inactiveUserCard: {
      marginTop: 12,
      marginBottom: 16,
      padding: 16,
      borderRadius: 18,
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    inactiveUserTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    inactiveUserIdentityRow: {
      flex: 1,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    inactiveUserName: {
      fontSize: 15,
      color: '#111827',
      fontWeight: '800',
    },
    inactiveUserMeta: {
      marginTop: 2,
      fontSize: 12,
      color: '#6B7280',
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    inactiveBadge: {
      backgroundColor: '#FEE2E2',
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    inactiveBadgeText: {
      color: '#DC2626',
      fontSize: 12,
      fontWeight: '700',
    },
    performerCommentText: {
      marginTop: 8,
      color: '#1F2937',
      fontSize: 13,
      fontWeight: '700',
    },
    lastActiveText: {
      marginTop: 8,
      color: '#4B5563',
      fontSize: 13,
      fontWeight: '500',
    },
    activityStatsRow: {
      marginTop: 8,
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    activityStatText: {
      color: '#374151',
      fontSize: 13,
      fontWeight: '600',
    },
    actionButtonsRow: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    messageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#EEF2FF',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    messageButtonText: {
      color: '#4F46E5',
      fontSize: 13,
      fontWeight: '700',
    },
    reminderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#6366F1',
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    reminderButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    emptyAdminState: {
      marginTop: 12,
      marginBottom: 16,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 14,
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    emptyAdminStateText: {
      color: '#6B7280',
      fontSize: 13,
      fontWeight: '600',
    },
    topPerformerSub: {
      marginTop: 4,
      color: '#6B7280',
      fontSize: 13,
      fontWeight: '500',
    },
    performerTabsRow: {
      marginTop: 12,
      flexDirection: 'row',
      gap: 8,
    },
    performerTab: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: 999,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    performerTabActive: {
      backgroundColor: '#EEF2FF',
    },
    performerTabText: {
      color: '#6B7280',
      fontSize: 12,
      fontWeight: '700',
    },
    performerTabTextActive: {
      color: '#4338CA',
    },
    performerCard: {
      marginTop: 12,
      marginBottom: 16,
      padding: 16,
      borderRadius: 18,
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    performerScoreBadge: {
      minWidth: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    performerScoreText: {
      color: '#4338CA',
      fontSize: 14,
      fontWeight: '800',
    },
  });
