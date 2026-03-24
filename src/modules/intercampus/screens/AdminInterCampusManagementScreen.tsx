// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { isAdminRole } from '../../../utils/roles';
import {
  approveInterCampusEvent,
  approveInterCampusSubmission,
  deleteInterCampusDiscussionReply,
  deleteInterCampusTeamPost,
  getInterCampusAdminOverview,
  getInterCampusAllDiscussionReplies,
  getInterCampusAllDiscussions,
  getInterCampusAllTeamPosts,
  getInterCampusInterestedUsers,
  getInterCampusPendingEvents,
  getInterCampusPendingSubmissions,
  lockInterCampusDiscussion,
  rejectInterCampusEvent,
  rejectInterCampusSubmission,
} from '../api/intercampus';
import InterCampusScreen from '../components/InterCampusScreen';

type Nav = StackNavigationProp<RootStackParamList>;

type Pending = {
  id: string;
  event_title?: string;
  college_name?: string;
};

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────
function StatCard({
  value,
  label,
  iconName,
  color,
}: {
  value: number;
  label: string;
  iconName: string;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <MaterialIcons name={iconName as any} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────
function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      {count !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// Event Row (inside a fest or standalone)
// ─────────────────────────────────────────────
function EventRow({
  item,
  onApprove,
  onReject,
  onViewDetails,
  actionLoading,
}: {
  item: any;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewDetails: (id: string) => void;
  actionLoading: string | null;
}) {
  const isLoading = actionLoading === item.id;
  const dateStr = item.event_start_date
    ? new Date(item.event_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const openLink = async (url?: string) => {
    if (!url) return;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) Linking.openURL(url);
  };

  return (
    <TouchableOpacity style={styles.eventCard} onPress={() => onViewDetails(item.id)} activeOpacity={0.85}>
      {/* Tap hint */}
      <View style={styles.eventCardHint}>
        <MaterialIcons name="open-in-new" size={11} color="#94a3b8" />
        <Text style={styles.eventCardHintText}>Tap to view full details</Text>
      </View>

      {/* Title */}
      <Text style={styles.eventTitle} numberOfLines={2}>{item.title || 'Untitled'}</Text>

      {/* College */}
      <Text style={styles.eventCollege}>{item.college_name}</Text>

      {/* Submitted by */}
      {!!item.submitted_by_name && (
        <Text style={styles.eventMeta}>Submitted by: {item.submitted_by_name}</Text>
      )}

      {/* Type chips */}
      <View style={styles.chipRow}>
        {!!item.event_type && (
          <View style={styles.chip}><Text style={styles.chipText}>{item.event_type}</Text></View>
        )}
        {!!item.participation_type && (
          <View style={[styles.chip, { backgroundColor: '#eff6ff' }]}>
            <Text style={[styles.chipText, { color: '#2563eb' }]}>{item.participation_type}</Text>
          </View>
        )}
      </View>

      {/* Date */}
      {!!dateStr && <Text style={styles.eventDate}>{dateStr}</Text>}

      {/* Description */}
      {!!item.description && (
        <Text style={styles.eventDesc} numberOfLines={3}>{item.description}</Text>
      )}

      {/* Source URL */}
      {!!item.source_url && (
        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openLink(item.source_url); }}>
          <Text style={styles.eventLink} numberOfLines={1}>🔗 {item.source_url}</Text>
        </TouchableOpacity>
      )}

      {/* Quick link buttons */}
      <View style={styles.quickBtnRow}>
        {!!(item.poster_image || item.banner_image) && (
          <TouchableOpacity style={styles.quickBtn} onPress={(e) => { e.stopPropagation?.(); openLink(item.poster_image || item.banner_image); }}>
            <MaterialIcons name="image" size={13} color="#6366F1" />
            <Text style={styles.quickBtnText}>Image</Text>
          </TouchableOpacity>
        )}
        {!!item.registration_link && (
          <TouchableOpacity style={styles.quickBtn} onPress={(e) => { e.stopPropagation?.(); openLink(item.registration_link); }}>
            <MaterialIcons name="open-in-new" size={13} color="#6366F1" />
            <Text style={styles.quickBtnText}>Registration</Text>
          </TouchableOpacity>
        )}
        {!!item.source_url && (
          <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]} onPress={(e) => { e.stopPropagation?.(); openLink(item.source_url); }}>
            <MaterialIcons name="language" size={13} color="#3b82f6" />
            <Text style={[styles.quickBtnText, { color: '#3b82f6' }]}>Website</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Approve / Reject */}
      {isLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : (
        <View style={styles.eventActionsRow}>
          <TouchableOpacity
            style={styles.eventApproveBtn}
            onPress={(e) => { e.stopPropagation?.(); onApprove(item.id); }}
          >
            <MaterialIcons name="check" size={15} color="#fff" />
            <Text style={styles.eventApproveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.eventRejectBtn}
            onPress={(e) => { e.stopPropagation?.(); onReject(item.id); }}
          >
            <MaterialIcons name="close" size={15} color="#b91c1c" />
            <Text style={styles.eventRejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// Fest Group Card (collapsible)
// ─────────────────────────────────────────────
function FestGroupCard({
  festTitle,
  college,
  events,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  onApproveAll,
  onViewDetails,
  onViewFest,
  actionLoading,
  bulkLoading,
}: {
  festTitle: string;
  college: string;
  events: any[];
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: (festTitle: string, notes?: string) => void;
  onViewDetails: (id: string) => void;
  onViewFest: (festId: string) => void;
  actionLoading: string | null;
  bulkLoading: string | null;
}) {
  // Find the fest row id — either the is_fest event itself, or fest_id/parent_fest_id from a child event
  const festId = events.find((e) => e.is_fest)?.id || events[0]?.fest_id || events[0]?.parent_fest_id || null;
  const isBulkLoading = bulkLoading === festTitle;
  const [bulkNotes, setBulkNotes] = useState('');

  return (
    <View style={styles.festCard}>
      {/* Fest Header */}
      <TouchableOpacity style={styles.festHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.festIcon}>
          <MaterialIcons name="celebration" size={20} color="#6366F1" />
        </View>
        <View style={{ flex: 1 }} >
          <Text style={styles.festTitle} numberOfLines={1}>{festTitle}</Text>
          <Text style={styles.festCollege}>{college} · {events.length} event{events.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.festHeaderRight}>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{events.length} pending</Text>
          </View>
          <MaterialIcons
            name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={22}
            color="#64748b"
          />
        </View>
      </TouchableOpacity>

      {/* View Fest Details button (outside expand toggle) */}
      {!!festId && (
        <TouchableOpacity
          style={styles.viewFestBtn}
          onPress={() => onViewFest(festId)}
        >
          <MaterialIcons name="open-in-new" size={13} color="#6366F1" />
          <Text style={styles.viewFestBtnText}>View Fest Details</Text>
        </TouchableOpacity>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <View style={styles.festBody}>
          {/* Bulk notes for Approve All */}
          <TextInput
            style={styles.bulkNotesInput}
            value={bulkNotes}
            onChangeText={setBulkNotes}
            placeholder="Add faculty notes for all events (optional)…"
            placeholderTextColor="#94a3b8"
            multiline
          />

          {/* Approve All button */}
          <TouchableOpacity
            style={[styles.approveAllBtn, isBulkLoading && { opacity: 0.6 }]}
            onPress={() => onApproveAll(festTitle, bulkNotes.trim() || undefined)}
            disabled={isBulkLoading}
          >
            {isBulkLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="done-all" size={15} color="#fff" />
                <Text style={styles.approveAllText}>Approve All {events.length} Events</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Individual events */}
          {events.map((event) => (
            <EventRow
              key={event.id}
              item={event}
              onApprove={onApprove}
              onReject={onReject}
              onViewDetails={onViewDetails}
              actionLoading={actionLoading}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function AdminInterCampusManagementScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [teamPosts, setTeamPosts] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [expandedFests, setExpandedFests] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);

  const isAdmin = isAdminRole(profile?.role);

  const loadData = useCallback(async () => {
    try {
      console.log('[Admin InterCampus Management] loadData:start', {
        userId: user?.id || null,
        role: profile?.role || null,
      });
      setLoading(true);
      const [overviewData, pendingData, pendingEventsData, postsData, discussionsData, repliesData] = await Promise.all([
        getInterCampusAdminOverview(),
        getInterCampusPendingSubmissions(),
        getInterCampusPendingEvents(),
        getInterCampusAllTeamPosts(),
        getInterCampusAllDiscussions(),
        getInterCampusAllDiscussionReplies(),
      ]);

      setOverview(overviewData);
      setPending((pendingData || []) as Pending[]);
      setPendingEvents(pendingEventsData || []);
      setTeamPosts(postsData || []);
      setDiscussions(discussionsData || []);
      setReplies(repliesData || []);
      console.log('[Admin InterCampus Management] loadData:success', {
        pendingSubmissionsCount: pendingData?.length || 0,
        pendingEventsCount: pendingEventsData?.length || 0,
        teamPostsCount: postsData?.length || 0,
        discussionsCount: discussionsData?.length || 0,
        repliesCount: repliesData?.length || 0,
      });
    } catch (error: any) {
      console.error('[Admin InterCampus Management] loadData:error', {
        userId: user?.id || null,
        role: profile?.role || null,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error,
      });
      Toast.show({ type: 'error', text1: 'Failed to load management data', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [profile?.role, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Grouping logic ──
  const { festGroups, standaloneEvents } = useMemo(() => {
    const festEvents = pendingEvents.filter((e) => e.is_fest);
    const childEvents = pendingEvents.filter((e) => !e.is_fest && !!e.fest_name);
    const standalone = pendingEvents.filter((e) => !e.is_fest && !e.fest_name);

    // Build fest groups
    const groups: Map<string, { college: string; events: any[] }> = new Map();

    festEvents.forEach((fest) => {
      const key = (fest.title || '').trim();
      if (!groups.has(key)) {
        groups.set(key, { college: fest.college_name || '', events: [] });
      }
    });

    childEvents.forEach((event) => {
      const key = (event.fest_name || '').trim();
      if (groups.has(key)) {
        groups.get(key)!.events.push(event);
      } else {
        // Fest not in pending but child event is — treat as a group
        if (!groups.has(key)) {
          groups.set(key, { college: event.college_name || '', events: [] });
        }
        groups.get(key)!.events.push(event);
      }
    });

    // Also add fest events themselves (is_fest rows) as standalone if no child events fetched
    festEvents.forEach((fest) => {
      const key = (fest.title || '').trim();
      const group = groups.get(key);
      if (group && !group.events.some((e) => e.id === fest.id)) {
        // we treat the fest entry itself as a representational item
        // if there are child events, we list those; otherwise list the fest itself
        if (group.events.length === 0) {
          group.events.push(fest);
        }
      }
    });

    // Filter out empty groups
    const festGroupsArr = Array.from(groups.entries())
      .filter(([, g]) => g.events.length > 0)
      .map(([festTitle, g]) => ({ festTitle, college: g.college, events: g.events }));

    return { festGroups: festGroupsArr, standaloneEvents: standalone };
  }, [pendingEvents]);

  const toggleFest = (festTitle: string) => {
    setExpandedFests((prev) => {
      const next = new Set(prev);
      if (next.has(festTitle)) next.delete(festTitle);
      else next.add(festTitle);
      return next;
    });
  };

  // ── Handlers ──
  const approveEvent = async (eventId: string) => {
    if (!user?.id) return;
    setActionLoading(eventId);
    try {
      console.log('[Admin InterCampus Management] approveEvent:start', {
        eventId,
        approverId: user.id,
      });
      await approveInterCampusEvent(eventId, user.id);
      setPendingEvents((prev) => prev.filter((item) => item.id !== eventId));
      console.log('[Admin InterCampus Management] approveEvent:success', {
        eventId,
        approverId: user.id,
      });
      Toast.show({ type: 'success', text1: 'Event approved ✓' });
    } catch (error: any) {
      console.error('[Admin InterCampus Management] approveEvent:error', {
        eventId,
        approverId: user?.id || null,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error,
      });
      Toast.show({ type: 'error', text1: 'Approval failed', text2: error?.message });
    } finally {
      setActionLoading(null);
    }
  };

  const rejectEvent = async (eventId: string) => {
    if (!user?.id) return;
    Alert.alert('Reject Event', 'Are you sure you want to reject this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(eventId);
          try {
            console.log('[Admin InterCampus Management] rejectEvent:start', {
              eventId,
              approverId: user.id,
            });
            await rejectInterCampusEvent(eventId, user.id);
            setPendingEvents((prev) => prev.filter((item) => item.id !== eventId));
            console.log('[Admin InterCampus Management] rejectEvent:success', {
              eventId,
              approverId: user.id,
            });
            Toast.show({ type: 'success', text1: 'Event rejected' });
          } catch (error: any) {
            console.error('[Admin InterCampus Management] rejectEvent:error', {
              eventId,
              approverId: user?.id || null,
              message: error?.message,
              details: error?.details,
              hint: error?.hint,
              code: error?.code,
              error,
            });
            Toast.show({ type: 'error', text1: 'Reject failed', text2: error?.message });
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const approveAllFestEvents = async (festTitle: string, notes?: string) => {
    if (!user?.id) return;
    const group = festGroups.find((g) => g.festTitle === festTitle);
    if (!group) return;

    Alert.alert(
      'Approve All Events',
      `Approve all ${group.events.length} events in "${festTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          onPress: async () => {
            setBulkLoading(festTitle);
            console.log('[Admin InterCampus Management] approveAllFestEvents:start', {
              festTitle,
              approverId: user.id,
              eventIds: group.events.map((e) => e.id),
            });
            try {
              await Promise.all(group.events.map((e) => approveInterCampusEvent(e.id, user.id, notes)));
              const approvedIds = new Set(group.events.map((e) => e.id));
              setPendingEvents((prev) => prev.filter((item) => !approvedIds.has(item.id)));
              console.log('[Admin InterCampus Management] approveAllFestEvents:success', {
                festTitle,
                approverId: user.id,
                approvedCount: group.events.length,
              });
              Toast.show({ type: 'success', text1: `All ${group.events.length} events approved ✓` });
            } catch (error: any) {
              console.error('[Admin InterCampus Management] approveAllFestEvents:error', {
                festTitle,
                approverId: user?.id || null,
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code,
                error,
              });
              Toast.show({ type: 'error', text1: 'Bulk approval failed', text2: error?.message });
            } finally {
              setBulkLoading(null);
            }
          },
        },
      ],
    );
  };

  const viewEventDetails = (eventId: string) => {
    navigation.navigate('InterCampusEventDetails', { eventId });
  };

  const approveSubmission = async (submissionId: string) => {
    if (!user?.id) return;
    try {
      console.log('[Admin InterCampus Management] approveSubmission:start', {
        submissionId,
        approverId: user.id,
      });
      await approveInterCampusSubmission(user.id, { submission_id: submissionId });
      setPending((prev) => prev.filter((item) => item.id !== submissionId));
      console.log('[Admin InterCampus Management] approveSubmission:success', {
        submissionId,
        approverId: user.id,
      });
      Toast.show({ type: 'success', text1: 'Submission approved' });
    } catch (error: any) {
      console.error('[Admin InterCampus Management] approveSubmission:error', {
        submissionId,
        approverId: user?.id || null,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error,
      });
      Toast.show({ type: 'error', text1: 'Approval failed', text2: error?.message });
    }
  };

  const rejectSubmission = async (submissionId: string) => {
    try {
      console.log('[Admin InterCampus Management] rejectSubmission:start', {
        submissionId,
        approverId: user?.id || null,
      });
      await rejectInterCampusSubmission(submissionId);
      setPending((prev) => prev.filter((item) => item.id !== submissionId));
      console.log('[Admin InterCampus Management] rejectSubmission:success', {
        submissionId,
        approverId: user?.id || null,
      });
      Toast.show({ type: 'success', text1: 'Submission rejected' });
    } catch (error: any) {
      console.error('[Admin InterCampus Management] rejectSubmission:error', {
        submissionId,
        approverId: user?.id || null,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error,
      });
      Toast.show({ type: 'error', text1: 'Reject failed', text2: error?.message });
    }
  };

  const removeTeamPost = async (postId: string) => {
    try {
      await deleteInterCampusTeamPost(postId);
      setTeamPosts((prev) => prev.filter((item) => item.id !== postId));
      Toast.show({ type: 'success', text1: 'Team post removed' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not remove team post', text2: error?.message });
    }
  };

  const toggleDiscussionLock = async (discussionId: string, currentState: boolean) => {
    try {
      await lockInterCampusDiscussion(discussionId, !currentState);
      setDiscussions((prev) => prev.map((item) => (item.id === discussionId ? { ...item, is_locked: !currentState } : item)));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not lock discussion', text2: error?.message });
    }
  };

  const removeReply = async (replyId: string) => {
    try {
      await deleteInterCampusDiscussionReply(replyId);
      setReplies((prev) => prev.filter((item) => item.id !== replyId));
      Toast.show({ type: 'success', text1: 'Reply deleted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not delete reply', text2: error?.message });
    }
  };

  if (!isAdmin) {
    return (
      <InterCampusScreen style={styles.centerWrap}>
        <MaterialIcons name="lock" size={48} color="#cbd5e1" />
        <Text style={styles.accessTitle}>Admin Access Required</Text>
        <Text style={styles.accessSub}>You don't have permission to view this page.</Text>
      </InterCampusScreen>
    );
  }

  if (loading) {
    return (
      <InterCampusScreen style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading management data…</Text>
      </InterCampusScreen>
    );
  }

  const totalPendingEvents = pendingEvents.length;

  return (
    <InterCampusScreen style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>InterCampus Management</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={loadData}>
          <MaterialIcons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Stats Row ── */}
        <View style={styles.statsGrid}>
          <StatCard value={overview?.pending_submissions ?? 0} label="Pending" iconName="hourglass-top" color="#f59e0b" />
          <StatCard value={overview?.open_team_posts ?? 0} label="Team Posts" iconName="group" color="#3b82f6" />
          <StatCard value={overview?.locked_discussions ?? 0} label="Locked" iconName="lock" color="#ef4444" />
          <StatCard value={overview?.interested_users ?? 0} label="Interested" iconName="star" color="#10b981" />
        </View>

        {/* ── Approve Events ── */}
        <View style={styles.section}>
          <SectionHeader title="Pending Events" count={totalPendingEvents} />

          {totalPendingEvents === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="check-circle" size={36} color="#86efac" />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>No pending events to review.</Text>
            </View>
          ) : (
            <>
              {/* Fest groups */}
              {festGroups.map(({ festTitle, college, events }) => (
                <FestGroupCard
                  key={festTitle}
                  festTitle={festTitle}
                  college={college}
                  events={events}
                  isExpanded={expandedFests.has(festTitle)}
                  onToggle={() => toggleFest(festTitle)}
                  onApprove={approveEvent}
                  onReject={rejectEvent}
                  onApproveAll={approveAllFestEvents}
                  onViewDetails={viewEventDetails}
                  onViewFest={(festId) => navigation.navigate('InterCampusFestDetails', { festId })}
                  actionLoading={actionLoading}
                  bulkLoading={bulkLoading}
                />
              ))}

              {/* Standalone events */}
              {standaloneEvents.length > 0 && (
                <View style={styles.standaloneSection}>
                  {standaloneEvents.length > 0 && festGroups.length > 0 && (
                    <Text style={styles.standaloneDivider}>Standalone Events</Text>
                  )}
                  {standaloneEvents.map((item) => (
                    <EventRow
                      key={item.id}
                      item={item}
                      onApprove={approveEvent}
                      onReject={rejectEvent}
                      onViewDetails={viewEventDetails}
                      actionLoading={actionLoading}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Legacy Submissions ── */}
        <View style={styles.section}>
          <SectionHeader title="Legacy Submissions" count={pending.length} />
          {pending.length === 0 ? (
            <Text style={styles.emptyText}>No pending legacy submissions.</Text>
          ) : (
            pending.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{item.event_title || 'Untitled'}</Text>
                  <Text style={styles.listRowMeta}>{item.college_name || 'Unknown college'}</Text>
                </View>
                <TouchableOpacity style={styles.approveBtn} onPress={() => approveSubmission(item.id)}>
                  <MaterialIcons name="check" size={13} color="#10B981" />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectSubmission(item.id)}>
                  <MaterialIcons name="close" size={13} color="#b91c1c" />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Remove Team Posts ── */}
        <View style={styles.section}>
          <SectionHeader title="Team Posts" />
          {teamPosts.length === 0 ? (
            <Text style={styles.emptyText}>No team posts.</Text>
          ) : (
            teamPosts.slice(0, 10).map((post) => (
              <View key={post.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle} numberOfLines={1}>{post.event?.title || 'Event'}</Text>
                  <Text style={styles.listRowMeta} numberOfLines={2}>{post.message}</Text>
                </View>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => removeTeamPost(post.id)}>
                  <MaterialIcons name="delete-outline" size={13} color="#b91c1c" />
                  <Text style={styles.rejectBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Lock Discussions ── */}
        <View style={styles.section}>
          <SectionHeader title="Discussions" />
          {discussions.length === 0 ? (
            <Text style={styles.emptyText}>No discussions.</Text>
          ) : (
            discussions.slice(0, 10).map((discussion) => (
              <View key={discussion.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle} numberOfLines={1}>{discussion.title || 'Untitled topic'}</Text>
                  <Text style={styles.listRowMeta}>{discussion.event?.title || 'Event'}</Text>
                </View>
                <TouchableOpacity
                  style={discussion.is_locked ? styles.rejectBtn : styles.approveBtn}
                  onPress={() => toggleDiscussionLock(discussion.id, !!discussion.is_locked)}
                >
                  <MaterialIcons
                    name={discussion.is_locked ? 'lock-open' : 'lock'}
                    size={13}
                    color={discussion.is_locked ? '#b91c1c' : '#10B981'}
                  />
                  <Text style={discussion.is_locked ? styles.rejectBtnText : styles.approveBtnText}>
                    {discussion.is_locked ? 'Unlock' : 'Lock'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Delete Replies ── */}
        <View style={styles.section}>
          <SectionHeader title="Discussion Replies" />
          {replies.length === 0 ? (
            <Text style={styles.emptyText}>No replies.</Text>
          ) : (
            replies.slice(0, 10).map((reply) => (
              <View key={reply.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowMeta} numberOfLines={2}>{reply.message}</Text>
                  <Text style={[styles.listRowMeta, { color: '#94a3b8' }]}>
                    Topic: {reply.discussion?.title || '-'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => removeReply(reply.id)}>
                  <MaterialIcons name="delete-outline" size={13} color="#b91c1c" />
                  <Text style={styles.rejectBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </InterCampusScreen>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', gap: 8, padding: 24 },
  accessTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  accessSub: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  loadingText: { fontSize: 13, color: '#64748b', marginTop: 12 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },

  // Content
  content: { padding: 16, gap: 16 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '47.5%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },

  // Section
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionHeaderText: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  badge: {
    backgroundColor: '#6366F1',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Empty state
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  emptySubtitle: { fontSize: 12, color: '#64748b' },
  emptyText: { fontSize: 12, color: '#94a3b8', paddingHorizontal: 4 },

  // Fest group card
  festCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  festHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  festIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  festTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  festCollege: { fontSize: 12, color: '#64748b', marginTop: 1 },
  festHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: '#d97706' },
  viewFestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  viewFestBtnText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  festBody: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 12,
    gap: 8,
  },
  bulkNotesInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  approveAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  approveAllText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Event row
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  eventRowLeft: { flex: 1, gap: 4 },
  eventRowTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', lineHeight: 18 },
  eventRowMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  eventRowDate: { fontSize: 11, color: '#94a3b8' },
  eventRowActions: { flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 70 },

  // Full-width event card (new)
  eventCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  eventCardHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventCardHintText: { fontSize: 10, color: '#94a3b8' },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  eventCollege: { fontSize: 12, color: '#64748b' },
  eventMeta: { fontSize: 12, color: '#94a3b8' },
  eventDate: { fontSize: 11, color: '#94a3b8' },
  eventDesc: { fontSize: 12, color: '#334155', lineHeight: 18 },
  eventLink: { fontSize: 11, color: '#3b82f6' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quickBtnRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    backgroundColor: '#f0fdf4', borderRadius: 999, borderWidth: 1, borderColor: '#bbf7d0',
  },
  quickBtnText: { fontSize: 11, fontWeight: '600', color: '#6366F1' },
  eventActionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  eventApproveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, backgroundColor: '#10B981', paddingVertical: 10,
  },
  eventApproveBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  eventRejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, backgroundColor: '#fee2e2', paddingVertical: 10,
  },
  eventRejectBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },

  chip: {
    backgroundColor: '#f0fdf4',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipText: { fontSize: 10, fontWeight: '600', color: '#10B981' },

  // Standalone divider
  standaloneSection: { gap: 8 },
  standaloneDivider: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },

  // Generic list row (legacy / team posts / discussions / replies)
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  listRowTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  listRowMeta: { fontSize: 12, color: '#64748b', flexShrink: 1 },

  // Buttons
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#dcfce7',
  },
  approveBtnText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
  },
  rejectBtnText: { color: '#b91c1c', fontSize: 11, fontWeight: '700' },
});
