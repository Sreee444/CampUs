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
import { isFacultyOrAdminRole } from '../../../utils/roles';
import {
  approveInterCampusEvent,
  approveInterCampusSubmission,
  getInterCampusPendingEvents,
  getInterCampusPendingSubmissions,
  rejectInterCampusEvent,
  rejectInterCampusSubmission,
} from '../api/intercampus';
import { InterCampusEventSubmission } from '../types/intercampus';
import InterCampusScreen from '../components/InterCampusScreen';

type Nav = StackNavigationProp<RootStackParamList>;

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
  notes,
  onNotesChange,
  onApprove,
  onReject,
  onViewDetails,
  actionLoading,
}: {
  item: any;
  notes: string;
  onNotesChange: (text: string) => void;
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
    if (canOpen) {
      Linking.openURL(url);
    }
  };

  return (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => onViewDetails(item.id)}
      activeOpacity={0.9}
    >
      {/* View details hint */}
      <View style={styles.eventCardHint}>
        <MaterialIcons name="open-in-new" size={12} color="#94a3b8" />
        <Text style={styles.eventCardHintText}>Tap to view full details</Text>
      </View>

      {/* Title & chips */}
      <Text style={styles.eventTitle} numberOfLines={2}>{item.title || 'Untitled'}</Text>
      <Text style={styles.eventCollege}>{item.college_name || 'Unknown college'}</Text>
      {!!item.submitted_by_name && <Text style={styles.eventDate}>Submitted by: {item.submitted_by_name}</Text>}

      <View style={styles.chipRow}>
        {item.event_type ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{item.event_type}</Text>
          </View>
        ) : null}
        {item.participation_type ? (
          <View style={[styles.chip, { backgroundColor: '#eff6ff' }]}>
            <Text style={[styles.chipText, { color: '#2563eb' }]}>{item.participation_type}</Text>
          </View>
        ) : null}
        {item.is_fest ? (
          <View style={[styles.chip, { backgroundColor: '#f5f3ff' }]}>
            <Text style={[styles.chipText, { color: '#6366F1' }]}>Fest</Text>
          </View>
        ) : null}
      </View>

      {dateStr ? <Text style={styles.eventDate}>{dateStr}</Text> : null}

      {!!item.description && (
        <Text style={styles.eventDesc} numberOfLines={3}>{item.description}</Text>
      )}
      {!!item.source_url && (
        <Text style={styles.eventLink} numberOfLines={1}>🔗 {item.source_url}</Text>
      )}

      <View style={styles.linkActionsRow}>
        <TouchableOpacity
          style={[styles.linkActionBtn, !(item.poster_image || item.banner_image) && styles.linkActionBtnDisabled]}
          disabled={!(item.poster_image || item.banner_image)}
          onPress={(e) => {
            e.stopPropagation?.();
            openLink(item.poster_image || item.banner_image);
          }}
        >
          <MaterialIcons name="image" size={13} color="#6366F1" />
          <Text style={styles.linkActionText}>View Image</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.linkActionBtn, !item.registration_link && styles.linkActionBtnDisabled]}
          disabled={!item.registration_link}
          onPress={(e) => {
            e.stopPropagation?.();
            openLink(item.registration_link);
          }}
        >
          <MaterialIcons name="open-in-new" size={13} color="#6366F1" />
          <Text style={styles.linkActionText}>Registration</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.linkActionBtn, !item.source_url && styles.linkActionBtnDisabled]}
          disabled={!item.source_url}
          onPress={(e) => {
            e.stopPropagation?.();
            openLink(item.source_url);
          }}
        >
          <MaterialIcons name="language" size={13} color="#6366F1" />
          <Text style={styles.linkActionText}>Website</Text>
        </TouchableOpacity>
      </View>

      {/* Faculty notes input */}
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={onNotesChange}
        placeholder="Add faculty notes (optional)…"
        placeholderTextColor="#94a3b8"
        multiline
      />

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <ActivityIndicator color="#10B981" />
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.approveBtn}
              onPress={(e) => { e.stopPropagation?.(); onApprove(item.id); }}
            >
              <MaterialIcons name="check" size={15} color="#fff" />
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={(e) => { e.stopPropagation?.(); onReject(item.id); }}
            >
              <MaterialIcons name="close" size={15} color="#b91c1c" />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
  notesById,
  onNotesChange,
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
  notesById: Record<string, string>;
  onNotesChange: (id: string, text: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: (festTitle: string, notes?: string) => void;
  onViewDetails: (id: string) => void;
  onViewFest: (festId: string) => void;
  actionLoading: string | null;
  bulkLoading: string | null;
}) {
  const festId = events.find((e) => e.is_fest)?.id || events[0]?.fest_id || events[0]?.parent_fest_id || null;
  const isBulkLoading = bulkLoading === festTitle;
  const [bulkNotes, setBulkNotes] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  
  const INITIAL_DISPLAY_LIMIT = 30;
  const hasMoreThan30 = events.length > INITIAL_DISPLAY_LIMIT;
  const eventsToDisplay = showAllEvents ? events : events.slice(0, INITIAL_DISPLAY_LIMIT);

  return (
    <View style={styles.festCard}>
      {/* Fest Header */}
      <TouchableOpacity style={styles.festHeader} onPress={onToggle} activeOpacity={0.85}>
        <View style={styles.festIcon}>
          <MaterialIcons name="celebration" size={20} color="#6366F1" />
        </View>
        <View style={{ flex: 1 }}>
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

      {/* View Fest Details button */}
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
          {eventsToDisplay.map((event) => (
            <EventRow
              key={event.id}
              item={event}
              notes={notesById[event.id] || ''}
              onNotesChange={(text) => onNotesChange(event.id, text)}
              onApprove={onApprove}
              onReject={onReject}
              onViewDetails={onViewDetails}
              actionLoading={actionLoading}
            />
          ))}

          {/* Show all events button */}
          {hasMoreThan30 && !showAllEvents && (
            <TouchableOpacity
              style={styles.showAllEventsBtn}
              onPress={() => setShowAllEvents(true)}
            >
              <MaterialIcons name="expand-more" size={16} color="#6366F1" />
              <Text style={styles.showAllEventsBtnText}>
                Show {events.length - INITIAL_DISPLAY_LIMIT} more events
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function FacultyInterCampusDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<InterCampusEventSubmission[]>([]);
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [capById, setCapById] = useState<Record<string, string>>({});
  const [expandedFests, setExpandedFests] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);

  const canModerate = isFacultyOrAdminRole(profile?.role);

  const loadData = useCallback(async () => {
    try {
      console.log('[Faculty InterCampus Dashboard] loadData:start', {
        userId: user?.id || null,
        role: profile?.role || null,
      });
      setLoading(true);
      const [submissionsData, eventsData] = await Promise.all([
        getInterCampusPendingSubmissions(),
        getInterCampusPendingEvents(),
      ]);
      setSubmissions(submissionsData);
      setPendingEvents(eventsData);
      console.log('[Faculty InterCampus Dashboard] loadData:success', {
        submissionsCount: submissionsData?.length || 0,
        pendingEventsCount: eventsData?.length || 0,
      });
    } catch (error: any) {
      console.error('[Faculty InterCampus Dashboard] loadData:error', {
        userId: user?.id || null,
        role: profile?.role || null,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error,
      });
      Toast.show({ type: 'error', text1: 'Failed to load submissions', text2: error?.message });
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

    const groups: Map<string, { college: string; events: any[] }> = new Map();

    festEvents.forEach((fest) => {
      const key = (fest.title || '').trim();
      if (!groups.has(key)) {
        groups.set(key, { college: fest.college_name || '', events: [] });
      }
    });

    childEvents.forEach((event) => {
      const key = (event.fest_name || '').trim();
      if (!groups.has(key)) {
        groups.set(key, { college: event.college_name || '', events: [] });
      }
      groups.get(key)!.events.push(event);
    });

    festEvents.forEach((fest) => {
      const key = (fest.title || '').trim();
      const group = groups.get(key);
      if (group && group.events.length === 0) {
        group.events.push(fest);
      }
    });

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
      const facultyNotes = notesById[eventId] || undefined;
      console.log('[Faculty InterCampus Dashboard] approveEvent:start', {
        eventId,
        approverId: user.id,
        facultyNotes: facultyNotes || '',
      });
      await approveInterCampusEvent(eventId, user.id, facultyNotes);
      setPendingEvents((prev) => prev.filter((item) => item.id !== eventId));
      console.log('[Faculty InterCampus Dashboard] approveEvent:success', {
        eventId,
        approverId: user.id,
      });
      Toast.show({ type: 'success', text1: 'Event approved ✓' });
    } catch (error: any) {
      console.error('[Faculty InterCampus Dashboard] approveEvent:error', {
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
            const facultyNotes = notesById[eventId] || undefined;
            console.log('[Faculty InterCampus Dashboard] rejectEvent:start', {
              eventId,
              approverId: user.id,
              facultyNotes: facultyNotes || '',
            });
            await rejectInterCampusEvent(eventId, user.id, facultyNotes);
            setPendingEvents((prev) => prev.filter((item) => item.id !== eventId));
            console.log('[Faculty InterCampus Dashboard] rejectEvent:success', {
              eventId,
              approverId: user.id,
            });
            Toast.show({ type: 'success', text1: 'Event rejected' });
          } catch (error: any) {
            console.error('[Faculty InterCampus Dashboard] rejectEvent:error', {
              eventId,
              approverId: user?.id || null,
              message: error?.message,
              details: error?.details,
              hint: error?.hint,
              code: error?.code,
              error,
            });
            Toast.show({ type: 'error', text1: 'Rejection failed', text2: error?.message });
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const approveAllFestEvents = async (festTitle: string, bulkNotes?: string) => {
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
            console.log('[Faculty InterCampus Dashboard] approveAllFestEvents:start', {
              festTitle,
              approverId: user.id,
              eventIds: group.events.map((e) => e.id),
              bulkNotes: bulkNotes || '',
            });
            try {
              await Promise.all(
                group.events.map((e) =>
                  // Use bulk notes if provided, else fall back to per-event notes
                  approveInterCampusEvent(e.id, user.id, bulkNotes ?? notesById[e.id] ?? undefined),
                ),
              );
              const approvedIds = new Set(group.events.map((e) => e.id));
              setPendingEvents((prev) => prev.filter((item) => !approvedIds.has(item.id)));
              console.log('[Faculty InterCampus Dashboard] approveAllFestEvents:success', {
                festTitle,
                approverId: user.id,
                approvedCount: group.events.length,
              });
              Toast.show({ type: 'success', text1: `All ${group.events.length} events approved ✓` });
            } catch (error: any) {
              console.error('[Faculty InterCampus Dashboard] approveAllFestEvents:error', {
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
      const capRaw = capById[submissionId];
      const cap = capRaw?.trim() ? Number(capRaw.trim()) : undefined;
      await approveInterCampusSubmission(user.id, {
        submission_id: submissionId,
        faculty_notes: notesById[submissionId] || undefined,
        participation_cap: Number.isFinite(cap) ? cap : undefined,
      });
      setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
      Toast.show({ type: 'success', text1: 'Submission approved', text2: 'Converted to verified InterCampus event.' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Approval failed', text2: error?.message });
    }
  };

  const rejectSubmission = async (submissionId: string) => {
    try {
      await rejectInterCampusSubmission(submissionId);
      setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
      Toast.show({ type: 'success', text1: 'Submission rejected' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Reject failed', text2: error?.message });
    }
  };

  if (!canModerate) {
    return (
      <InterCampusScreen style={styles.centerWrap}>
        <MaterialIcons name="lock" size={48} color="#cbd5e1" />
        <Text style={styles.accessTitle}>Faculty Access Required</Text>
        <Text style={styles.accessSub}>You don't have permission to view this page.</Text>
      </InterCampusScreen>
    );
  }

  if (loading) {
    return (
      <InterCampusScreen style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading pending events…</Text>
      </InterCampusScreen>
    );
  }

  const totalPending = pendingEvents.length;

  return (
    <InterCampusScreen style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Faculty Dashboard</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={loadData}>
          <MaterialIcons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Pending Events ── */}
        <View style={styles.section}>
          <SectionHeader title="Pending Events" count={totalPending} />

          {totalPending === 0 ? (
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
                  notesById={notesById}
                  onNotesChange={(id, text) => setNotesById((prev) => ({ ...prev, [id]: text }))}
                  onApprove={approveEvent}
                  onReject={rejectEvent}
                  onApproveAll={approveAllFestEvents}
                  onViewDetails={viewEventDetails}
                  onViewFest={(fId) => navigation.navigate('InterCampusFestDetails', { festId: fId })}
                  actionLoading={actionLoading}
                  bulkLoading={bulkLoading}
                />
              ))}

              {/* Standalone events */}
              {standaloneEvents.length > 0 && (
                <View style={styles.standaloneSection}>
                  {festGroups.length > 0 && (
                    <Text style={styles.standaloneDivider}>Standalone Events</Text>
                  )}
                  {standaloneEvents.map((item) => (
                    <EventRow
                      key={item.id}
                      item={item}
                      notes={notesById[item.id] || ''}
                      onNotesChange={(text) => setNotesById((prev) => ({ ...prev, [item.id]: text }))}
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
        {submissions.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Legacy Submissions" count={submissions.length} />
            {submissions.map((item) => (
              <View key={item.id} style={styles.legacyCard}>
                <Text style={styles.eventTitle}>{item.event_title || 'Untitled Event'}</Text>
                <Text style={styles.eventCollege}>{item.college_name || 'Unknown college'}</Text>
                {!!item.fest_name && (
                  <View style={styles.chipRow}>
                    <View style={[styles.chip, { backgroundColor: '#f5f3ff' }]}>
                      <Text style={[styles.chipText, { color: '#6366F1' }]}>Fest: {item.fest_name}</Text>
                    </View>
                  </View>
                )}
                {!!item.event_description && (
                  <Text style={styles.eventDesc} numberOfLines={3}>{item.event_description}</Text>
                )}
                {!!item.registration_link && (
                  <Text style={styles.eventLink} numberOfLines={1}>🔗 {item.registration_link}</Text>
                )}

                <TextInput
                  style={styles.notesInput}
                  value={notesById[item.id] || ''}
                  onChangeText={(text) => setNotesById((prev) => ({ ...prev, [item.id]: text }))}
                  placeholder="Add faculty notes (optional)…"
                  placeholderTextColor="#94a3b8"
                  multiline
                />
                <TextInput
                  style={styles.notesInput}
                  value={capById[item.id] || ''}
                  onChangeText={(text) => setCapById((prev) => ({ ...prev, [item.id]: text }))}
                  placeholder="Participation cap (optional)"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                />

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => approveSubmission(item.id)}>
                    <MaterialIcons name="check" size={15} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectSubmission(item.id)}>
                    <MaterialIcons name="close" size={15} color="#b91c1c" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {submissions.length === 0 && totalPending === 0 && (
          <View style={styles.emptyCard}>
            <MaterialIcons name="check-circle" size={40} color="#86efac" />
            <Text style={styles.emptyTitle}>Nothing to review</Text>
            <Text style={styles.emptySubtitle}>All events and submissions are up to date.</Text>
          </View>
        )}

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
  section: { gap: 10 },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  sectionHeaderText: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  badge: { backgroundColor: '#6366F1', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
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
  festHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  festIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center',
  },
  festTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  festCollege: { fontSize: 12, color: '#64748b', marginTop: 1 },
  festHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pendingBadge: { backgroundColor: '#fef3c7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
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
  festBody: { borderTopWidth: 1, borderTopColor: '#f1f5f9', padding: 12, gap: 10 },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
  },
  approveAllText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  showAllEventsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#f1f5f9', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    marginTop: 8, borderWidth: 1, borderColor: '#cbd5e1',
  },
  showAllEventsBtnText: { color: '#6366F1', fontSize: 13, fontWeight: '600' },

  // Event card (expandable)
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
  eventDate: { fontSize: 11, color: '#94a3b8' },
  eventDesc: { fontSize: 12, color: '#334155', lineHeight: 18 },
  eventLink: { fontSize: 11, color: '#3b82f6' },
  linkActionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#e6fffa',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkActionBtnDisabled: { opacity: 0.45 },
  linkActionText: { fontSize: 11, fontWeight: '700', color: '#6366F1' },

  // Chips
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { backgroundColor: '#f0fdf4', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '600', color: '#10B981' },

  // Standalone divider
  standaloneSection: { gap: 10 },
  standaloneDivider: { fontSize: 12, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 2 },

  // Notes input
  notesInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginTop: 4,
    minHeight: 40,
  },

  // Action buttons
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, backgroundColor: '#10B981', paddingVertical: 10,
  },
  approveBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, backgroundColor: '#fee2e2', paddingVertical: 10,
  },
  rejectBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '800' },

  // Legacy card
  legacyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
});
