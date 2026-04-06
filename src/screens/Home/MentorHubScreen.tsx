// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import DropdownSheet from '../../components/DropdownSheet';
import Toast from 'react-native-toast-message';
import {
  getMentors,
  createMentorshipRequest,
  getMyMentorshipRequests,
  updateMentorshipRequestStatus,
  getMentorshipConversations,
} from '../../api/mentors';
import { suggestBestMentors } from '../../api/ai';
import { assignMentor } from '../../api/projects';
import { ensureMentorshipChat } from '../../api/mentorshipChat';
import { supabase } from '../../api/supabase';
import { Mentor, MentorshipPurpose } from '../../types/database';

type Nav = StackNavigationProp<RootStackParamList, 'MentorHub'>;
type Route = RouteProp<RootStackParamList, 'MentorHub'>;

const PURPOSES: { key: MentorshipPurpose; label: string; icon: string; helper: string }[] = [
  { key: 'career', label: 'Career', icon: 'work', helper: 'Resume review, placements, internships' },
  { key: 'academic', label: 'Academic', icon: 'school', helper: 'Subject-level guidance and doubt clearing' },
  { key: 'skill', label: 'Skill', icon: 'bolt', helper: 'Skill-building and portfolio growth' },
  { key: 'project', label: 'Project', icon: 'folder-open', helper: 'Entire team will be added to mentorship chat' },
  { key: 'startup', label: 'Startup', icon: 'rocket', helper: 'Business model and funding guidance' },
];

const ROLE_FILTERS = [
  { key: 'All', label: 'All Roles' },
  { key: 'alumni', label: 'Alumni' },
  { key: 'faculty', label: 'Faculty' },
];

const AI_RESULT_COUNT_OPTIONS = [1, 2, 3, 4, 5];

const ROLE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  alumni: { bg: '#EEF2FF', text: '#4F46E5' },
  faculty: { bg: '#F3E8FF', text: '#7C3AED' },
  senior: { bg: '#DBEAFE', text: '#1D4ED8' },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#F59E0B', label: 'Pending' },
  accepted: { bg: '#D1FAE5', text: '#10B981', label: 'Active' },
  rejected: { bg: '#FEE2E2', text: '#EF4444', label: 'Rejected' },
  closed: { bg: '#F3F4F6', text: '#9CA3AF', label: 'Closed' },
};

const MESSAGE_HIGHLIGHT_TERMS = [
  'project',
  'career',
  'startup',
  'skill',
  'academic',
  'mentor',
  'mentorship',
  'chat',
  'guidance',
];
const MESSAGE_HIGHLIGHT_REGEX = new RegExp(`(${MESSAGE_HIGHLIGHT_TERMS.join('|')})`, 'ig');

// Loading skeleton card
function SkeletonCard({ Colors }: { Colors: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ opacity, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 14, width: '60%', backgroundColor: Colors.border, borderRadius: 6 }} />
          <View style={{ height: 11, width: '40%', backgroundColor: Colors.border, borderRadius: 6 }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {[0, 1, 2].map(i => (
          <View key={i} style={{ height: 22, width: 60, backgroundColor: Colors.border, borderRadius: 999 }} />
        ))}
      </View>
      <View style={{ height: 38, backgroundColor: Colors.border, borderRadius: 8 }} />
    </Animated.View>
  );
}

export default function MentorHubScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const S = styles(Colors);

  const prefillProjectId = route.params?.prefillProjectId;
  const lockedProjectId = prefillProjectId || undefined;

  const tabAnim = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<'discover' | 'requests' | 'active'>('discover');
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [mentorshipConvs, setMentorshipConvs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [roleFilter, setRoleFilter] = useState('All');
  const [availOnly, setAvailOnly] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);
  const [purpose, setPurpose] = useState<MentorshipPurpose>('career');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(lockedProjectId);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [creatorProjectIds, setCreatorProjectIds] = useState<Set<string>>(new Set());
  const [projectMentorMap, setProjectMentorMap] = useState<Record<string, string | null>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // End mentorship
  const [endingId, setEndingId] = useState<string | null>(null);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

  // AI mentor picks
  const [showAiMatchModal, setShowAiMatchModal] = useState(false);
  const [aiPurpose, setAiPurpose] = useState<MentorshipPurpose>(lockedProjectId ? 'project' : 'career');
  const [aiProjectId, setAiProjectId] = useState<string | undefined>(lockedProjectId);
  const [aiNeed, setAiNeed] = useState('');
  const [isGeneratingAiPicks, setIsGeneratingAiPicks] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiFallbackMode, setAiFallbackMode] = useState(false);
  const [aiMentorPickMap, setAiMentorPickMap] = useState<Record<string, { rank: number; score: number; reasons: string[] }>>({});
  const [showAiOnly, setShowAiOnly] = useState(false);
  const [aiResultCount, setAiResultCount] = useState(5);
  const [showAiResultCountDropdown, setShowAiResultCountDropdown] = useState(false);

  const switchTab = (tab: 'discover' | 'requests' | 'active') => {
    Animated.timing(tabAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      Animated.timing(tabAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  useEffect(() => {
    Animated.timing(tabAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, []);

  // Faculty/alumni/senior mentors should use MentorDashboard; students (mentees) use MentorHub
  useEffect(() => {
    if (!profile?.role) return;
    // faculty and alumni always go to dashboard
    if (profile.role === 'faculty' || profile.role === 'alumni') {
      navigation.replace('MentorDashboard');
    }
    // senior students who have a mentor profile go to dashboard too
    // We check after data loads (mentorshipConvs from getMentors won't exist, but
    // a simpler heuristic: if role is 'senior', navigate to dashboard so they can see requests)
    if (profile.role === 'senior') {
      navigation.replace('MentorDashboard');
    }
  }, [profile?.role, navigation]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      console.log('[MentorHub] loadData - user:', user.id, '| roleFilter:', roleFilter, '| availOnly:', availOnly);
      const [mentorList, requests, convs] = await Promise.all([
        getMentors({
          role: roleFilter === 'All' ? undefined : roleFilter,
          // Availability is calculated from open slots on client side.
          available: undefined,
        }),
        getMyMentorshipRequests(user.id),
        getMentorshipConversations(user.id).catch(() => []),
      ]);

      setMentors(mentorList);
      setMyRequests(requests);
      setMentorshipConvs(convs);

      console.log('[MentorHub] loadData - mentors:', mentorList.length, '| requests:', requests.length, '| discoverBlocking:', 'disabled (purpose-level checks in API)');

      // Load projects
      const { data: createdProjects } = await supabase.from('project_teams').select('id, name').eq('created_by', user.id);
      const { data: memberProjects } = await supabase.from('project_team_members').select('team_id, team:project_teams(id, name)').eq('user_id', user.id);
      const seen = new Set<string>();
      const all: any[] = [];
      for (const p of [...(createdProjects || [])]) { if (!seen.has(p.id)) { seen.add(p.id); all.push(p); } }
      for (const m of (memberProjects || [])) { const p = m.team; if (p && !seen.has(p.id)) { seen.add(p.id); all.push(p); } }
      setMyProjects(all);
      setCreatorProjectIds(new Set((createdProjects || []).map((p: any) => p.id)));

      const projectIds = Array.from(
        new Set(
          (requests || [])
            .filter((r: any) => r?.purpose === 'project' && !!r?.project_id)
            .map((r: any) => r.project_id)
        )
      );

      if (projectIds.length > 0) {
        const { data: projectRows, error: projectsError } = await supabase
          .from('project_teams')
          .select('id, mentor_id')
          .in('id', projectIds);

        if (projectsError) {
          console.error('[MentorHub] loadData - failed loading project mentor map:', projectsError);
        } else {
          const map: Record<string, string | null> = {};
          for (const row of projectRows || []) {
            map[row.id] = row.mentor_id || null;
          }
          setProjectMentorMap(map);
          console.log('[MentorHub] loadData - projectMentorMap entries:', Object.keys(map).length);
        }
      } else {
        setProjectMentorMap({});
      }
    } catch (e: any) {
      console.error('[MentorHub] loadData failed:', e);
      Toast.show({ type: 'error', text1: 'Failed to load mentors', text2: e?.message });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, roleFilter, availOnly]);

  useEffect(() => { loadData(); }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      loadData();
    }, [user?.id, loadData])
  );

  // Auto-open modal if project prefill
  useEffect(() => {
    if (lockedProjectId && !isLoading) {
      setPurpose('project');
      setProjectId(lockedProjectId);
      // open modal with first available mentor if any
    }
  }, [lockedProjectId, isLoading]);

  useEffect(() => {
    if (lockedProjectId) {
      setAiPurpose('project');
      setAiProjectId(lockedProjectId);
    }
  }, [lockedProjectId]);

  const openModal = (mentor: Mentor) => {
    setSelectedMentor(mentor);
    setPurpose(lockedProjectId ? 'project' : 'career');
    setProjectId(lockedProjectId);
    setDescription('');
    setModalVisible(true);
  };

  const handleGenerateAiMentorPicks = async () => {
    if (!user?.id) return;

    const trimmedNeed = aiNeed.trim();
    if (!trimmedNeed) {
      Toast.show({ type: 'error', text1: 'Tell AI your need', text2: 'Describe why you need a mentor first.' });
      return;
    }

    const finalPurpose = lockedProjectId ? 'project' : aiPurpose;
    const finalProjectId = lockedProjectId || aiProjectId;

    if (finalPurpose === 'project' && !finalProjectId) {
      Toast.show({ type: 'error', text1: 'Select a project', text2: 'Project purpose needs a project context.' });
      return;
    }

    if (finalPurpose === 'project' && finalProjectId && !creatorProjectIds.has(finalProjectId)) {
      Toast.show({
        type: 'error',
        text1: 'Project ownership required',
        text2: 'Only your own created projects can be used for project mentor matching.',
      });
      return;
    }

    try {
      setIsGeneratingAiPicks(true);

      const result = await suggestBestMentors(trimmedNeed, {
        requestingUserId: user.id,
        purpose: finalPurpose,
        projectId: finalPurpose === 'project' ? finalProjectId : undefined,
        maxMentors: Math.max(8, aiResultCount * 2),
        resultCount: aiResultCount,
        candidateMentors: filteredMentors,
      });

      const nextMap: Record<string, { rank: number; score: number; reasons: string[] }> = {};
      (result.mentors || []).forEach((mentor, index) => {
        nextMap[mentor.id] = {
          rank: index + 1,
          score: mentor.score || 0,
          reasons: mentor.reasons || [],
        };
      });

      setAiMentorPickMap(nextMap);
      setAiSummary(result.reply || '');
      setAiFallbackMode(Boolean(result.usedFallback));
      setShowAiOnly(true);
      setShowAiMatchModal(false);

      Toast.show({
        type: result.usedFallback ? 'info' : 'success',
        text1: result.usedFallback
          ? 'Fallback mentor picks ready'
          : result.fromCache
            ? 'AI mentor picks loaded'
            : 'AI mentor picks ready',
        text2: result.usedFallback
          ? `${Object.keys(nextMap).length} mentors ranked locally because backend AI is unavailable.`
          : `${Object.keys(nextMap).length} mentors ranked for your need.`,
      });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'AI match failed', text2: e?.message || 'Please try again.' });
    } finally {
      setIsGeneratingAiPicks(false);
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !selectedMentor) return;
    const requestPurpose: MentorshipPurpose = lockedProjectId ? 'project' : purpose;
    const requestProjectId = lockedProjectId || projectId;
    if (!description.trim()) { Toast.show({ type: 'error', text1: 'Please describe your mentorship goal' }); return; }
    if (requestPurpose === 'project' && !requestProjectId) { Toast.show({ type: 'error', text1: 'Please select a project' }); return; }
    if (requestPurpose === 'project' && requestProjectId && !creatorProjectIds.has(requestProjectId)) {
      Toast.show({
        type: 'error',
        text1: 'Cannot Send Request',
        text2: 'Only the project creator can send project mentorship requests.',
      });
      return;
    }
    try {
      console.log('[MentorHub] handleSubmit - mentor:', selectedMentor.id, '| purpose:', requestPurpose, '| project:', requestProjectId || 'none');
      setIsSubmitting(true);
      await createMentorshipRequest({
        mentor_id: selectedMentor.id,
        mentee_id: user.id,
        purpose: requestPurpose,
        project_id: requestPurpose === 'project' ? requestProjectId : undefined,
        description: description.trim(),
      });
      Toast.show({ type: 'success', text1: '🎓 Request sent!', text2: 'You\'ll be notified when the mentor responds.' });
      setModalVisible(false);
      switchTab('requests');
      await loadData();
    } catch (e: any) {
      console.error('[MentorHub] handleSubmit failed:', e);
      Toast.show({ type: 'error', text1: 'Failed', text2: e?.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndMentorship = async (requestId: string) => {
    try {
      setEndingId(requestId);
      await updateMentorshipRequestStatus(requestId, 'closed');
      Toast.show({ type: 'success', text1: 'Mentorship ended' });
      await loadData();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Failed', text2: e?.message });
    } finally {
      setEndingId(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      setCancellingRequestId(requestId);
      await updateMentorshipRequestStatus(requestId, 'rejected');
      Toast.show({ type: 'success', text1: 'Request cancelled' });
      await loadData();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Failed', text2: e?.message });
    } finally {
      setCancellingRequestId(null);
    }
  };

  const handleAssignMentorToProject = async (req: any) => {
    if (!req?.project_id) {
      Toast.show({ type: 'error', text1: 'Missing project', text2: 'Project not linked on this request.' });
      return;
    }

    const mentorProfileId = req?.mentor?.profile?.id;
    const mentorTableId = req?.mentor_id;

    if (!mentorProfileId || !mentorTableId) {
      Toast.show({ type: 'error', text1: 'Missing mentor details' });
      return;
    }

    try {
      console.log('[MentorHub] assignMentorToProject - requestId:', req.id, '| projectId:', req.project_id, '| mentorTableId:', mentorTableId, '| mentorProfileId:', mentorProfileId);
      setAssigningId(req.id);
      await assignMentor(req.project_id, mentorTableId, mentorProfileId);

      const { data: verifyTeam, error: verifyErr } = await supabase
        .from('project_teams')
        .select('id, mentor_id')
        .eq('id', req.project_id)
        .maybeSingle();

      if (verifyErr) {
        console.error('[MentorHub] assignMentorToProject - verify failed:', verifyErr);
      } else {
        console.log('[MentorHub] assignMentorToProject - verify team mentor_id:', verifyTeam?.mentor_id || 'null');
      }

      Toast.show({ type: 'success', text1: 'Mentor assigned to project' });
      await loadData();
    } catch (e: any) {
      console.error('[MentorHub] assignMentorToProject failed:', e);
      Toast.show({
        type: 'error',
        text1: 'Could not assign mentor',
        text2: e?.message || 'Only project creator can assign mentor.',
      });
    } finally {
      setAssigningId(null);
    }
  };

  const getConvForRequest = (req: any) => {
    return mentorshipConvs.find((c: any) => c.mentorship_id === req.id);
  };

  const openRequestDetails = (request: any) => {
    navigation.navigate('MentorshipRequestDetails', {
      request,
      viewer: 'mentee',
    });
  };

  const requestPreview = (text?: string) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return 'No message provided';
    return trimmed.length > 88 ? `${trimmed.slice(0, 88)}...` : trimmed;
  };

  const renderHighlightedMessage = (text?: string) => {
    const preview = requestPreview(text);
    const parts = preview.split(MESSAGE_HIGHLIGHT_REGEX);
    return (
      <Text style={S.requestMessageText} numberOfLines={2}>
        {parts.map((part, index) => {
          const isHighlighted = MESSAGE_HIGHLIGHT_TERMS.some(
            (term) => term.toLowerCase() === part.toLowerCase()
          );
          return isHighlighted
            ? <Text key={`msg-hl-${index}`} style={S.requestMessageHighlight}>{part}</Text>
            : part;
        })}
      </Text>
    );
  };

  const formatShortDate = (value?: string) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };

  // Opens existing chat or creates one on-demand for any accepted mentorship
  const openOrCreateChat = async (req: any) => {
    if (openingChatId === req.id) return;
    const conv = getConvForRequest(req);
    if (conv) {
      navigation.navigate('MentorshipChat', { chatId: conv.id });
      return;
    }
    try {
      setOpeningChatId(req.id);
      const mentorUserId = req.mentor?.profile?.id;
      if (!mentorUserId || !user?.id) throw new Error('Missing user IDs');
      const chatId = await ensureMentorshipChat(req.id, mentorUserId, user.id);
      await loadData();
      navigation.navigate('MentorshipChat', { chatId });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not open chat', text2: e?.message });
    } finally {
      setOpeningChatId(null);
    }
  };

  const pendingRequests = myRequests.filter((r) => r.status === 'pending');
  const activeMentorships = myRequests.filter((r) => r.status === 'accepted');
  const hasOpenSlots = useCallback((mentor: Mentor) => {
    const active = Number((mentor as any)?.active_mentees_count || 0);
    const max = Number((mentor as any)?.max_mentees || 0);
    const slots = Math.max(0, Number((mentor as any)?.available_slots ?? (max - active)));
    return slots > 0;
  }, []);

  const filteredMentors = mentors.filter((m) => {
    if (roleFilter !== 'All' && m.role !== roleFilter) return false;
    if (availOnly && !hasOpenSlots(m)) return false;
    return true;
  });

  const displayMentors = useMemo(() => {
    if (!Object.keys(aiMentorPickMap).length) return filteredMentors;

    const sorted = [...filteredMentors].sort((a, b) => {
      const aPick = aiMentorPickMap[a.id];
      const bPick = aiMentorPickMap[b.id];

      if (aPick && bPick) return aPick.rank - bPick.rank;
      if (aPick) return -1;
      if (bPick) return 1;
      return 0;
    });

    if (!showAiOnly) return sorted;
    return sorted.filter((mentor) => Boolean(aiMentorPickMap[mentor.id]));
  }, [filteredMentors, aiMentorPickMap, showAiOnly]);

  const currentPurpose = PURPOSES.find(p => p.key === purpose);

  const buildAiPrefillMessage = useCallback((mentorId: string) => {
    const pick = aiMentorPickMap[mentorId];
    const purposeLabel = (lockedProjectId ? 'project' : purpose).toUpperCase();
    const projectName = (lockedProjectId || projectId || aiProjectId)
      ? myProjects.find((project: any) => project.id === (lockedProjectId || projectId || aiProjectId))?.name
      : null;

    const reasonLines = (pick?.reasons || []).slice(0, 2);
    const lines: string[] = [];

    lines.push(`Need: ${aiNeed.trim() || 'I am looking for mentorship guidance.'}`);
    lines.push(`Purpose: ${purposeLabel}`);

    if (projectName) {
      lines.push(`Project Context: ${projectName}`);
    }

    if (reasonLines.length > 0) {
      lines.push('Why I picked you:');
      reasonLines.forEach((reason) => lines.push(`- ${reason}`));
    }

    lines.push('Could you mentor me on this and suggest a practical roadmap?');

    return lines.join('\n');
  }, [aiMentorPickMap, aiNeed, lockedProjectId, purpose, projectId, aiProjectId, myProjects]);

  return (
    <SafeAreaView style={S.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={S.gradientBg}
      >
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>Mentorship Hub</Text>
          <Text style={S.headerSub}>Connect · Learn · Grow</Text>
        </View>
        {profile?.role === 'faculty' || profile?.role === 'alumni' ? (
          <TouchableOpacity onPress={() => navigation.navigate('MentorDashboard')}>
            <View style={S.dashBtn}>
              <MaterialIcons name="dashboard" size={18} color="#4F46E5" />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34, height: 34 }} />
        )}
      </View>

      {/* Mentorship Chats Banner */}
      {mentorshipConvs.length > 0 && (
        <TouchableOpacity
          style={S.chatBanner}
          onPress={() => navigation.navigate('MentorshipChatList')}
          activeOpacity={0.8}
        >
          <View style={S.chatBannerLeft}>
            <View style={S.chatBannerIcon}>
              <MaterialIcons name="chat" size={18} color="#fff" />
            </View>
            <View>
              <Text style={S.chatBannerTitle}>Mentorship Chats</Text>
              <Text style={S.chatBannerSub}>{mentorshipConvs.length} active conversation{mentorshipConvs.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="#4F46E5" />
        </TouchableOpacity>
      )}

      {/* Tabs */}
      <View style={S.tabRow}>
        {([
          { key: 'discover', label: 'Discover', icon: 'explore' },
          { key: 'requests', label: 'Requests', icon: 'send', count: pendingRequests.length },
          { key: 'active', label: 'My Mentors', icon: 'people', count: activeMentorships.length },
        ] as any[]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[S.tab, activeTab === tab.key && S.tabActive]}
            onPress={() => switchTab(tab.key)}
          >
            <View style={S.tabInner}>
              <MaterialIcons name={tab.icon} size={14} color={activeTab === tab.key ? '#fff' : Colors.textSecondary} />
              <Text style={[S.tabText, activeTab === tab.key && S.tabTextActive]}>{tab.label}</Text>
              {!!tab.count && tab.count > 0 && (
                <View style={S.tabBadge}><Text style={S.tabBadgeText}>{tab.count}</Text></View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content with fade animation */}
      <Animated.View style={{ flex: 1, opacity: tabAnim }}>

        {/* ── DISCOVER ── */}
        {activeTab === 'discover' && (
          <>
          <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={S.aiCtaCard} onPress={() => setShowAiMatchModal(true)} activeOpacity={0.85}>
              <View style={S.aiCtaIconWrap}>
                <MaterialIcons name="auto-awesome" size={16} color="#0F766E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.aiCtaTitle}>AI Mentor Match</Text>
                <Text style={S.aiCtaSub}>Tell AI your need and get ranked mentor picks instantly.</Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="#0F766E" />
            </TouchableOpacity>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={S.chipRow}>
                {ROLE_FILTERS.map((r) => (
                  <TouchableOpacity key={r.key} style={[S.chip, roleFilter === r.key && S.chipActive]} onPress={() => setRoleFilter(r.key)}>
                    <Text style={[S.chipText, roleFilter === r.key && S.chipTextActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[S.chip, availOnly && S.chipActive]} onPress={() => setAvailOnly(p => !p)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: availOnly ? '#fff' : '#10B981' }} />
                    <Text style={[S.chipText, availOnly && S.chipTextActive]}>Available</Text>
                  </View>
                </TouchableOpacity>
                {!!Object.keys(aiMentorPickMap).length && (
                  <TouchableOpacity style={[S.chip, showAiOnly && S.chipActive]} onPress={() => setShowAiOnly((prev) => !prev)}>
                    <Text style={[S.chipText, showAiOnly && S.chipTextActive]}>{showAiOnly ? 'Showing AI only' : 'Show AI only'}</Text>
                  </TouchableOpacity>
                )}
                {!!Object.keys(aiMentorPickMap).length && (
                  <TouchableOpacity
                    style={S.chip}
                    onPress={() => {
                      setAiMentorPickMap({});
                      setAiSummary('');
                      setAiFallbackMode(false);
                      setShowAiOnly(false);
                    }}
                  >
                    <Text style={S.chipText}>Clear AI picks</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            {!!Object.keys(aiMentorPickMap).length && (
              <View style={S.aiSummaryBox}>
                <View style={S.aiSummaryHeader}>
                  <MaterialIcons name="psychology" size={14} color="#0F766E" />
                  <Text style={S.aiSummaryTitle}>AI Mentor Match</Text>
                  {aiFallbackMode && (
                    <View style={S.fallbackBadge}>
                      <Text style={S.fallbackBadgeText}>Fallback mode</Text>
                    </View>
                  )}
                </View>
                <Text style={S.aiSummaryText} numberOfLines={3}>
                  {aiSummary || 'Mentors ranked based on your need, profile, and context.'}
                </Text>
              </View>
            )}

            {isLoading ? (
              [0, 1, 2].map(i => <SkeletonCard key={i} Colors={Colors} />)
            ) : displayMentors.length === 0 ? (
              <View style={S.empty}>
                <MaterialIcons name="person-search" size={52} color={Colors.border} />
                <Text style={S.emptyTitle}>No mentors found</Text>
                <Text style={S.emptyText}>Try changing your filters</Text>
              </View>
            ) : (
              displayMentors.map((mentor) => (
                <MentorCard
                  key={mentor.id}
                  mentor={mentor}
                  Colors={Colors}
                  S={S}
                  aiPick={aiMentorPickMap[mentor.id]}
                  onViewProfile={() => {
                    if (mentor?.profile?.id) {
                      navigation.navigate('PublicProfile', { userId: mentor.profile.id });
                    }
                  }}
                  onRequest={() => openModal(mentor)}
                />
              ))
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
          </>
        )}

        {/* ── REQUESTS ── */}
        {activeTab === 'requests' && (
          <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
            {pendingRequests.length === 0 ? (
              <View style={S.empty}>
                <MaterialIcons name="send" size={52} color={Colors.border} />
                <Text style={S.emptyTitle}>No requests yet</Text>
                <TouchableOpacity style={S.emptyBtn} onPress={() => switchTab('discover')}>
                  <Text style={S.emptyBtnText}>Find a Mentor</Text>
                </TouchableOpacity>
              </View>
            ) : (
              pendingRequests.map((req) => {
                const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                const conv = getConvForRequest(req);
                return (
                  <View key={req.id} style={S.card}>
                    <TouchableOpacity activeOpacity={0.88} onPress={() => openRequestDetails(req)}>
                      <View style={S.cardRow}>
                        <UserAvatar uri={req.mentor?.profile?.avatar_url} name={req.mentor?.profile?.full_name || 'Mentor'} size={44} showRing={false} />
                        <View style={S.reqIdentity}>
                          <Text style={S.cardTitle}>{req.mentor?.profile?.full_name || 'Mentor'}</Text>
                          <Text style={S.cardSub}>{req.mentor?.role} · {req.mentor?.profile?.department || ''}</Text>
                        </View>
                        <View style={[S.statusBadge, { backgroundColor: sc.bg }]}>
                          <Text style={[S.statusText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                      </View>
                      <View style={S.purposeRow}>
                        <View style={S.purposePillSmall}>
                          <Text style={S.purposePillSmallText}>{req.purpose}</Text>
                        </View>
                        <View style={S.requestMessageBox}>
                          <MaterialIcons name="chat-bubble-outline" size={14} color="#6366F1" />
                          <Text style={S.requestMessageText} numberOfLines={2}>{requestPreview(req.description)}</Text>
                        </View>
                      </View>
                      <View style={S.reqMetaRow}>
                        <Text style={S.reqMetaText}>Requested {formatShortDate(req.created_at)}</Text>
                        <View style={S.reqMetaAction}>
                          <Text style={S.reqMetaText}>View details</Text>
                          <MaterialIcons name="chevron-right" size={14} color={Colors.textSecondary} />
                        </View>
                      </View>
                    </TouchableOpacity>
                    {req.status === 'pending' && (
                      <View style={S.actionRow}>
                        <TouchableOpacity
                          style={S.endBtn}
                          onPress={() => handleCancelRequest(req.id)}
                          disabled={cancellingRequestId === req.id}
                        >
                          {cancellingRequestId === req.id
                            ? <ActivityIndicator size="small" color="#4F46E5" />
                            : <Text style={S.endBtnText}>Cancel Request</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    )}
                    {req.status === 'accepted' && req.purpose !== 'project' && conv && (
                      <TouchableOpacity
                        style={S.openChatBtn}
                        onPress={() => navigation.navigate('MentorshipChat', { chatId: conv.id })}
                      >
                        <MaterialIcons name="chat" size={15} color="#fff" />
                        <Text style={S.openChatBtnText}>Open Chat</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}

        {/* ── ACTIVE MENTORS ── */}
        {activeTab === 'active' && (
          <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
            {activeMentorships.length === 0 ? (
              <View style={S.empty}>
                <MaterialIcons name="people" size={52} color={Colors.border} />
                <Text style={S.emptyTitle}>No active mentors</Text>
                <Text style={S.emptyText}>Accept a request to begin</Text>
              </View>
            ) : (
              activeMentorships.map((req) => {
                const conv = getConvForRequest(req);
                const roleColors = ROLE_BADGE_COLORS[req.mentor?.role] || ROLE_BADGE_COLORS.alumni;
                return (
                  <View key={req.id} style={S.card}>
                    <TouchableOpacity activeOpacity={0.88} onPress={() => openRequestDetails(req)}>
                      <View style={S.cardRow}>
                        <UserAvatar uri={req.mentor?.profile?.avatar_url} name={req.mentor?.profile?.full_name || 'Mentor'} size={48} showRing={false} />
                        <View style={S.reqIdentity}>
                          <Text style={S.cardTitle}>{req.mentor?.profile?.full_name || 'Mentor'}</Text>
                          <Text style={S.cardSub}>{req.mentor?.profile?.department || ''}</Text>
                        </View>
                        <View style={[S.roleBadge, { backgroundColor: roleColors.bg }]}>
                          <Text style={[S.roleText, { color: roleColors.text }]}>{req.mentor?.role}</Text>
                        </View>
                      </View>
                      <View style={S.purposePillSmall}>
                        <Text style={S.purposePillSmallText}>{req.purpose} mentorship</Text>
                      </View>
                      <View style={S.requestMessageBox}>
                        <MaterialIcons name="chat-bubble-outline" size={14} color="#6366F1" />
                        <Text style={S.requestMessageText} numberOfLines={2}>{requestPreview(req.description)}</Text>
                      </View>
                      <View style={S.reqMetaRow}>
                        <Text style={S.reqMetaText}>Started {formatShortDate(req.created_at)}</Text>
                        <View style={S.reqMetaAction}>
                          <Text style={S.reqMetaText}>View details</Text>
                          <MaterialIcons name="chevron-right" size={14} color={Colors.textSecondary} />
                        </View>
                      </View>
                    </TouchableOpacity>
                    <View style={S.actionRow}>
                      {req.purpose !== 'project' && (
                        <TouchableOpacity
                          style={S.openChatBtn}
                          onPress={() => openOrCreateChat(req)}
                          disabled={openingChatId === req.id}
                        >
                          {openingChatId === req.id
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <><MaterialIcons name="chat" size={14} color="#fff" /><Text style={S.openChatBtnText}>Open Chat</Text></>
                          }
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={S.endBtn}
                        onPress={() => handleEndMentorship(req.id)}
                        disabled={endingId === req.id}
                      >
                        {endingId === req.id
                          ? <ActivityIndicator size="small" color="#4F46E5" />
                          : <Text style={S.endBtnText}>End Mentorship</Text>
                        }
                      </TouchableOpacity>

                      {req.purpose === 'project'
                        && req.project_id
                        && creatorProjectIds.has(req.project_id)
                        && projectMentorMap[req.project_id] !== req?.mentor?.profile?.id && (
                        <TouchableOpacity
                          style={S.endBtn}
                          onPress={() => handleAssignMentorToProject(req)}
                          disabled={assigningId === req.id}
                        >
                          {assigningId === req.id
                            ? <ActivityIndicator size="small" color="#4F46E5" />
                            : <Text style={S.endBtnText}>Assign to Project</Text>
                          }
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </Animated.View>

      {/* ── AI Mentor Match Modal ── */}
      <Modal visible={showAiMatchModal} transparent animationType="slide" onRequestClose={() => setShowAiMatchModal(false)}>
        <View style={S.modalOverlay}>
          <View style={S.aiModalSheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14 }}
            >
              <View style={S.modalHeader}>
                <Text style={S.modalTitle}>AI Mentor Match</Text>
                <TouchableOpacity onPress={() => setShowAiMatchModal(false)}>
                  <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={S.helperBox}>
                <MaterialIcons name="auto-awesome" size={12} color="#0F766E" />
                <Text style={S.helperText}>Tell AI why you need a mentor before matching.</Text>
              </View>

              <Text style={S.fieldLabel}>Mentorship Purpose</Text>
              <View style={S.purposePills}>
                {PURPOSES.map((p) => (
                  <TouchableOpacity
                    key={`ai-purpose-${p.key}`}
                    style={[S.purposePill, aiPurpose === p.key && S.purposePillActive]}
                    onPress={() => {
                      if (lockedProjectId) return;
                      setAiPurpose(p.key);
                      if (p.key !== 'project') setAiProjectId(undefined);
                    }}
                    disabled={!!lockedProjectId}
                  >
                    <MaterialIcons name={p.icon as any} size={13} color={aiPurpose === p.key ? '#fff' : Colors.textSecondary} />
                    <Text style={[S.purposePillText, aiPurpose === p.key && { color: '#fff' }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(lockedProjectId || aiPurpose === 'project') && (
                <>
                  <Text style={S.fieldLabel}>Project Context</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {myProjects.length === 0
                        ? <Text style={S.cardSub}>No projects found.</Text>
                        : myProjects.map((proj: any) => (
                          <TouchableOpacity
                            key={`ai-proj-${proj.id}`}
                            style={[S.chip, aiProjectId === proj.id && S.chipActive]}
                            onPress={() => setAiProjectId(proj.id)}
                            disabled={!!lockedProjectId}
                          >
                            <Text style={[S.chipText, aiProjectId === proj.id && S.chipTextActive]}>{proj.name}</Text>
                          </TouchableOpacity>
                        ))
                      }
                    </View>
                  </ScrollView>
                </>
              )}

              <Text style={S.fieldLabel}>Why do you need this mentor?</Text>
              <TextInput
                style={S.textArea}
                placeholder="Example: Need guidance on backend architecture, scaling, and interview-ready project decisions"
                placeholderTextColor={Colors.textSecondary}
                value={aiNeed}
                onChangeText={setAiNeed}
                multiline
                textAlignVertical="top"
              />

              <Text style={S.fieldLabel}>How many results?</Text>
              <TouchableOpacity
                style={S.aiCountDropdownBtn}
                onPress={() => setShowAiResultCountDropdown(true)}
              >
                <Text style={S.aiCountDropdownText}>Top {aiResultCount} (max 5)</Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[S.submitBtn, isGeneratingAiPicks && { opacity: 0.6 }]}
                onPress={handleGenerateAiMentorPicks}
                disabled={isGeneratingAiPicks}
              >
                {isGeneratingAiPicks
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={S.submitBtnText}>Generate Top {aiResultCount} AI Picks</Text>
                }
              </TouchableOpacity>
            
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DropdownSheet
        visible={showAiResultCountDropdown}
        title="Select mentor result count"
        options={AI_RESULT_COUNT_OPTIONS.map((count) => `Top ${count}`)}
        onSelect={(value) => {
          const parsed = Number(String(value).replace(/[^0-9]/g, ''));
          if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) {
            setAiResultCount(parsed);
          }
          setShowAiResultCountDropdown(false);
        }}
        onClose={() => setShowAiResultCountDropdown(false)}
      />

      {/* ── Request Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={S.modalOverlay}>
          <ScrollView>
            <View style={S.modalCard}>
              <View style={S.modalHeader}>
                <Text style={S.modalTitle}>Request Mentorship</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {selectedMentor && (
                <View style={S.selectedMentorRow}>
                  <UserAvatar uri={selectedMentor.profile?.avatar_url} name={selectedMentor.profile?.full_name || 'Mentor'} size={38} showRing={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.selectedMentorName}>{selectedMentor.profile?.full_name}</Text>
                    <Text style={S.selectedMentorSub}>{selectedMentor.role} · {selectedMentor.profile?.department || ''}</Text>
                  </View>
                </View>
              )}

              <Text style={S.fieldLabel}>Purpose</Text>
              <View style={S.purposePills}>
                {PURPOSES.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    style={[S.purposePill, purpose === p.key && S.purposePillActive]}
                    onPress={() => {
                      if (lockedProjectId) return;
                      setPurpose(p.key);
                      if (p.key !== 'project') setProjectId(undefined);
                    }}
                    disabled={!!lockedProjectId}
                  >
                    <MaterialIcons name={p.icon as any} size={13} color={purpose === p.key ? '#fff' : Colors.textSecondary} />
                    <Text style={[S.purposePillText, purpose === p.key && { color: '#fff' }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!!lockedProjectId && (
                <View style={S.helperBox}>
                  <MaterialIcons name="lock" size={12} color="#6B7280" />
                  <Text style={S.helperText}>From project flow, mentorship purpose is locked to Project.</Text>
                </View>
              )}
              {/* Helper text */}
              {currentPurpose && (
                <View style={S.helperBox}>
                  <MaterialIcons name="info-outline" size={12} color="#6B7280" />
                  <Text style={S.helperText}>{currentPurpose.helper}</Text>
                </View>
              )}

              {purpose === 'project' && (
                <>
                  <Text style={S.fieldLabel}>Select Project</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {myProjects.length === 0
                        ? <Text style={S.cardSub}>No projects found.</Text>
                        : myProjects.map((proj: any) => (
                          <TouchableOpacity
                            key={proj.id}
                            style={[S.chip, projectId === proj.id && S.chipActive]}
                            onPress={() => setProjectId(proj.id)}
                          >
                            <Text style={[S.chipText, projectId === proj.id && S.chipTextActive]}>{proj.name}</Text>
                          </TouchableOpacity>
                        ))
                      }
                    </View>
                  </ScrollView>
                </>
              )}

              <Text style={S.fieldLabel}>Describe your goal</Text>
              {selectedMentor && (
                <TouchableOpacity
                  style={S.aiPrefillBtn}
                  onPress={() => {
                    const text = buildAiPrefillMessage(selectedMentor.id);
                    setDescription(text);
                    Toast.show({ type: 'success', text1: 'Request prefilled from AI context' });
                  }}
                >
                  <MaterialIcons name="auto-awesome" size={14} color="#0F766E" />
                  <Text style={S.aiPrefillBtnText}>Use AI reason for this mentor</Text>
                </TouchableOpacity>
              )}
              <TextInput
                style={S.textArea}
                placeholder="What do you hope to achieve from this mentorship?"
                placeholderTextColor={Colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity style={[S.submitBtn, isSubmitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={S.submitBtnText}>Send Request</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ── Mentor Card Component ──────────────────────────────────────

function MentorCard({ mentor, Colors, S, onRequest, onViewProfile, aiPick }: any) {
  const name = mentor.profile?.full_name || 'Mentor';
  const roleColors = ROLE_BADGE_COLORS[mentor.role] || ROLE_BADGE_COLORS.alumni;
  const department = String(mentor.profile?.department || mentor.department || '').trim();
  const company = String(mentor.company || '').replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
  const subtitle = [department, company].filter(Boolean).join(' · ');

  const activeMentees = Number(mentor?.active_mentees_count || 0);
  const maxMentees = Number(mentor?.max_mentees || 0);
  const availableSlots = Math.max(0, Number(mentor?.available_slots ?? (maxMentees - activeMentees)));
  const isFull = availableSlots <= 0;
  const isDisabled = isFull;

  let btnLabel = 'Request Mentorship';
  if (isFull) btnLabel = 'Unavailable';
  else btnLabel = 'Request Mentor';

  return (
    <TouchableOpacity style={S.card} activeOpacity={0.9} onPress={onViewProfile}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <UserAvatar uri={mentor.profile?.avatar_url} name={name} size={48} showRing={false} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={S.cardTitle}>{name}</Text>
            <View style={[S.roleBadge, { backgroundColor: roleColors.bg }]}>
              <Text style={[S.roleText, { color: roleColors.text }]}>{mentor.role}</Text>
            </View>
          </View>
          {!!subtitle && <Text style={S.cardSub} numberOfLines={2}>{subtitle}</Text>}
          {/* Capacity indicator */}
          <Text style={[S.capacityText, isFull && { color: '#EF4444' }]}>
            {`${availableSlots} slot${availableSlots !== 1 ? 's' : ''} available`}
          </Text>

          <View style={S.mentorMetaRow}>
            <View style={S.mentorMetaItem}>
              <MaterialIcons name="star" size={16} color="#f59e0b" />
              <Text style={S.mentorMetaText}>{mentor?.rating ? Number(mentor.rating).toFixed(1) : 'New'}</Text>
            </View>
            <View style={S.mentorMetaItem}>
              <MaterialIcons name="calendar-today" size={16} color={isFull ? '#9CA3AF' : '#10B981'} />
              <Text style={S.mentorMetaText}>{isFull ? 'Unavailable' : 'Available'}</Text>
            </View>
          </View>
        </View>
        {/* Availability dot top-right */}
        <View style={[S.availDotLg, { backgroundColor: isFull ? '#CBD5E1' : '#10B981' }]} />
      </View>

      {mentor.expertise_tags?.length > 0 && (
        <View style={S.tagRow}>
          {mentor.expertise_tags.slice(0, 5).map((tag: string) => (
            <View key={tag} style={S.tag}>
              <Text style={S.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {aiPick && (
        <View style={S.aiReasonCard}>
          <View style={S.aiReasonHeader}>
            <Text style={S.aiReasonRank}>AI Rank #{aiPick.rank}</Text>
            <Text style={S.aiReasonScore}>Score {aiPick.score}</Text>
          </View>
          {(aiPick.reasons || []).slice(0, 2).map((reason: string, idx: number) => (
            <Text key={`${mentor.id}-reason-${idx}`} style={S.aiReasonText}>• {reason}</Text>
          ))}
        </View>
      )}

      <View style={S.mentorCardActionRow}>
        <TouchableOpacity
          style={S.viewProfileBtn}
          onPress={onViewProfile}
          activeOpacity={0.85}
        >
          <MaterialIcons name="person" size={16} color="#6366F1" />
          <Text style={S.viewProfileBtnText}>View Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.requestBtn, isDisabled && S.requestBtnDisabled]}
          onPress={isDisabled ? undefined : onRequest}
          disabled={isDisabled}
          activeOpacity={isDisabled ? 1 : 0.8}
        >
          <Text style={[S.requestBtnText, isDisabled && { color: Colors.textSecondary }]}>{btnLabel}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  gradientBg: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 11,
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.text },
  headerSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  dashBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  aiHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  chatBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 12, marginTop: 10, marginBottom: 2,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: BorderRadius.lg,
    padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 16,
  },
  chatBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatBannerIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#4F46E5',
    alignItems: 'center', justifyContent: 'center',
  },
  chatBannerTitle: { fontSize: 13, fontWeight: '700', color: '#312E81' },
  chatBannerSub: { fontSize: 11, color: '#4F46E5', marginTop: 1 },

  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: BorderRadius.lg, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  tabActive: { backgroundColor: '#6366F1' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabText: { fontSize: 11, fontWeight: FontWeights.semibold, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  tabBadge: {
    backgroundColor: '#EF4444', borderRadius: 8, minWidth: 15, height: 15,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 12, gap: 10, paddingBottom: 90 },
  discoverQuickActionWrap: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 4,
  },
  discoverQuickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  aiCtaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 2,
  },
  aiCtaIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CCFBF1',
  },
  aiCtaTitle: { fontSize: 13, fontWeight: '800', color: '#0F766E' },
  aiCtaSub: { fontSize: 11, color: '#115E59', fontWeight: '600', marginTop: 1 },

  chipRow: { flexDirection: 'row', gap: 7, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  chipActive: { backgroundColor: '#6366F1' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: '#fff' },
  aiChip: { borderColor: '#99F6E4', backgroundColor: '#ECFEFF' },
  aiChipText: { fontSize: 12, fontWeight: '700', color: '#0F766E' },
  aiSummaryBox: {
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 12,
    padding: 10,
    marginBottom: 4,
    gap: 5,
  },
  aiSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiSummaryTitle: { fontSize: 12, color: '#0F766E', fontWeight: '700' },
  aiSummaryText: { fontSize: 12, color: '#115E59', lineHeight: 17, fontWeight: '500' },
  fallbackBadge: {
    marginLeft: 'auto',
    backgroundColor: '#FFEDD5',
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fallbackBadgeText: { fontSize: 10, color: '#9A3412', fontWeight: '800' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    padding: 12, gap: 12,
    marginBottom: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqIdentity: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  capacityText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '500' },
  mentorMetaRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  mentorMetaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'transparent', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  mentorMetaText: { fontSize: 11, color: '#475569', fontWeight: '700' },
  availDotLg: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },

  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  roleText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#4F46E514', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },
  aiReasonCard: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  aiReasonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiReasonRank: { fontSize: 11, color: '#4338CA', fontWeight: '700' },
  aiReasonScore: { fontSize: 11, color: '#6366F1', fontWeight: '700' },
  aiReasonText: { fontSize: 11, color: '#3730A3', lineHeight: 16, fontWeight: '600' },

  requestBtn: {
    flex: 1,
    backgroundColor: '#6366F1', borderRadius: BorderRadius.md,
    paddingVertical: 10, alignItems: 'center',
  },
  requestBtnDisabled: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  requestBtnText: { color: '#fff', fontWeight: FontWeights.bold, fontSize: FontSizes.sm },
  mentorCardActionRow: { flexDirection: 'row', gap: 8 },
  viewProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99,102,241,0.1)',
    paddingVertical: 10,
  },
  viewProfileBtnText: { color: '#6366F1', fontWeight: FontWeights.bold, fontSize: FontSizes.sm },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  purposeRow: { gap: 6 },
  purposePillSmall: { backgroundColor: '#EEF2FF', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  purposePillSmallText: { fontSize: 10, color: '#4F46E5', fontWeight: '700', textTransform: 'capitalize' },
  descText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  requestMessageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  requestMessageText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#3730A3',
    fontWeight: '600',
  },
  reqMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reqMetaAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reqMetaText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openChatBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#6366F1', borderRadius: BorderRadius.md, minHeight: 42, paddingVertical: 9,
  },
  openChatBtnText: { color: '#fff', fontWeight: FontWeights.bold, fontSize: 12 },
  endBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingVertical: 9,
    borderWidth: 1.5, borderColor: '#6366F1', borderRadius: BorderRadius.md,
  },
  endBtnText: { color: '#6366F1', fontWeight: FontWeights.semibold, fontSize: 12 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.text },
  emptyText: { color: Colors.textSecondary, fontSize: 13 },
  emptyBtn: {
    marginTop: 10, backgroundColor: '#4F46E5',
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: BorderRadius.md,
  },
  emptyBtnText: { color: '#fff', fontWeight: FontWeights.bold },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, gap: 14,
  },
  aiModalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '84%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.text },

  selectedMentorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: '#4F46E510', borderRadius: BorderRadius.lg,
  },
  selectedMentorName: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.text },
  selectedMentorSub: { fontSize: 11, color: Colors.textSecondary },

  fieldLabel: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.text },
  purposePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  purposePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: 'transparent',
  },
  purposePillActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  purposePillText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  helperBox: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 2 },
  helperText: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', lineHeight: 16 },
  aiPrefillBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  aiPrefillBtnText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '700',
  },

  textArea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: 11, minHeight: 90, color: Colors.text, fontSize: FontSizes.sm,
    backgroundColor: 'transparent',
  },
  aiCountDropdownBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
  },
  aiCountDropdownText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  submitBtn: { backgroundColor: '#4F46E5', borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: FontWeights.bold, fontSize: FontSizes.md },
});
