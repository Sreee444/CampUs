import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { banUser, deleteReport, getReports, insertAdminLog, resolveAppealWithFeedback, updateReportStatus } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';
import AdminHeader from '../../components/admin/AdminHeader';

type ReportFilter = 'all' | 'pending' | 'reviewing' | 'in_progress' | 'on_hold' | 'awaiting_info' | 'resolved' | 'dismissed' | 'appeals';

export default function AdminReportsScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showCountsDropdown, setShowCountsDropdown] = useState(false);
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportFilter>('all');
  const [appealFeedback, setAppealFeedback] = useState('');
  const [adminAction, setAdminAction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const ON_HOLD_TAG = '[ON_HOLD]';

  const normalizeStatusForDb = (status: string) => (status === 'on_hold' ? 'awaiting_info' : status);
  const hasOnHoldTag = (notes?: string | null) => String(notes || '').includes(ON_HOLD_TAG);
  const sanitizeAdminNotes = (notes?: string | null) => String(notes || '').replace(ON_HOLD_TAG, '').trim();
  const encodeAdminNotesForStatus = (status: string, notes: string) => {
    const clean = sanitizeAdminNotes(notes);
    return status === 'on_hold' ? `${ON_HOLD_TAG} ${clean}`.trim() : clean;
  };
  const mapDbStatusToUi = (status?: string, notes?: string | null) => {
    if (status === 'awaiting_info' && hasOnHoldTag(notes)) return 'on_hold';
    return status || 'pending';
  };

  const isAppealReport = (report: any) => {
    const text = `${report?.reason || ''} ${report?.title || ''}`.toLowerCase();
    return text.includes('appeal');
  };

  const parseAppealDescription = (description?: string | null) => {
    const raw = String(description || '').trim();
    if (!raw) return { content: '', contact: '' };

    const marker = /\bPreferred contact\s*:\s*/i;
    const match = raw.match(marker);
    if (!match || match.index === undefined) {
      return { content: raw, contact: '' };
    }

    const start = match.index;
    const content = raw.slice(0, start).trim();
    const contact = raw.slice(start).replace(marker, '').trim();
    return { content, contact };
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const loadReports = async () => {
    try {
      const normalizedFilterStatus = normalizeStatusForDb(statusFilter);
      const data = await getReports(
        statusFilter === 'all' || statusFilter === 'appeals'
          ? undefined
          : { status: normalizedFilterStatus }
      );
      const normalizedData = (data || []).map((r: any) => ({
        ...r,
        status: mapDbStatusToUi(r?.status, r?.admin_notes),
      }));
      setReports(statusFilter === 'appeals' ? normalizedData.filter((r: any) => isAppealReport(r)) : normalizedData);
    } catch (error) {
      console.error('Error loading reports:', error);
      Toast.show({ type: 'error', text1: 'Failed to load reports' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBanUser = async (reportId: string, reportedUserId?: string | null, reason?: string, adminAction?: string) => {
    if (!user?.id) return;
    if (isProcessing) return;
    if (!reportedUserId) {
      Toast.show({ type: 'error', text1: 'No target user found for this report' });
      return;
    }

    try {
      setIsProcessing(true);
      const actionNote = adminAction || 'User banned';
      await banUser(reportedUserId, user.id, reason || 'User reported and banned by moderation');

      try {
        await updateReportStatus(reportId, 'resolved', user.id, actionNote);
      } catch (statusError: any) {
        // Ban already succeeded; do not fail the whole flow for report-status metadata issues.
        console.warn('Ban succeeded but report status update failed:', statusError?.message || statusError);
      }

      await insertAdminLog(user.id, 'ban_user', reportedUserId, { source: 'report', report_id: reportId });
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: 'resolved', admin_notes: actionNote } : r));
      setAdminAction('');
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'User banned successfully' });
    } catch (error: any) {
      if (String(error?.message || '').toLowerCase().includes('already has an active ban')) {
        const actionNote = adminAction || 'User already banned';
        await updateReportStatus(reportId, 'resolved', user.id, actionNote);
        setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: 'resolved', admin_notes: actionNote } : r));
        setAdminAction('');
        setModalVisible(false);
        Toast.show({ type: 'success', text1: 'User already banned, report resolved' });
        return;
      }
      console.error('Ban user error:', error);
      Toast.show({ type: 'error', text1: 'Failed to ban user', text2: error?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveAppealWithDecision = async (report: any, decision: 'approved' | 'denied') => {
    if (!user?.id) return;
    const reportedUserId = report?.reported_user?.id || report?.reported_user_id || report?.reporter_id || report?.reported_by;
    if (!reportedUserId) {
      Toast.show({ type: 'error', text1: 'Could not identify user for appeal' });
      return;
    }
    if (!appealFeedback.trim()) {
      Toast.show({ type: 'error', text1: 'Feedback required', text2: 'Add a message for the user before resolving.' });
      return;
    }

    try {
      setIsProcessing(true);
      await resolveAppealWithFeedback(report.id, user.id, reportedUserId, decision, appealFeedback);
      if (decision === 'approved') {
        await insertAdminLog(user.id, 'unban_user', reportedUserId, {
          source: 'appeal',
          report_id: report.id,
          reason: 'Appeal approved',
        });
      }
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setAppealFeedback('');
      setAdminAction('');
      setModalVisible(false);
      Toast.show({
        type: 'success',
        text1: decision === 'approved' ? 'Appeal approved and user unbanned' : 'Appeal resolved as denied',
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to process appeal', text2: error?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      setIsProcessing(true);
      await deleteReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setAdminAction('');
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'Report deleted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to delete report', text2: error?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveReport = async (reportId: string, status: string, action: string) => {
    if (!user?.id) return;
    if (isProcessing) return;
    try {
      setIsProcessing(true);
      const dbStatus = normalizeStatusForDb(status);
      const encodedNotes = encodeAdminNotesForStatus(status, action);
      await updateReportStatus(reportId, dbStatus, user.id, encodedNotes);
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status, admin_notes: encodedNotes } : r));
      setSelectedReport((prev: any) => (prev?.id === reportId ? { ...prev, status, admin_notes: encodedNotes } : prev));
      setAdminAction('');
      Toast.show({ type: 'success', text1: `Report status changed to ${status}` });
    } catch (error: any) {
      console.error('Status update error:', error);
      Toast.show({ type: 'error', text1: 'Failed to update report', text2: error?.message || 'Unknown error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getReasonColor = (reason?: string) => {
    const reasonLower = (reason || '').toLowerCase();
    if (reasonLower.includes('spam')) return '#3b82f6';
    if (reasonLower.includes('abuse')) return '#ef4444';
    if (reasonLower.includes('harassment')) return '#f59e0b';
    return Colors.primary;
  };

  const getStatusTone = (status?: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending') return { bg: '#f59e0b20', text: '#f59e0b' };
    if (s === 'reviewing') return { bg: '#3b82f620', text: '#3b82f6' };
    if (s === 'in_progress') return { bg: '#06b6d420', text: '#06b6d4' };
    if (s === 'on_hold') return { bg: '#a78bfa20', text: '#a78bfa' };
    if (s === 'resolved') return { bg: '#10b98120', text: '#10b981' };
    if (s === 'dismissed') return { bg: '#6b7280220', text: '#6b7280' };
    if (s === 'awaiting_info') return { bg: '#ec407a20', text: '#ec407a' };
    return { bg: Colors.border, text: Colors.textSecondary };
  };

  const summary = {
    all: reports.length,
    pending: reports.filter((r) => r.status === 'pending').length,
    reviewing: reports.filter((r) => r.status === 'reviewing').length,
    in_progress: reports.filter((r) => r.status === 'in_progress').length,
    on_hold: reports.filter((r) => r.status === 'on_hold').length,
    awaiting_info: reports.filter((r) => r.status === 'awaiting_info').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
    dismissed: reports.filter((r) => r.status === 'dismissed').length,
    appeals: reports.filter((r) => isAppealReport(r)).length,
    event: reports.filter((r) => r.reported_content_type === 'event').length,
    project: reports.filter((r) => r.reported_content_type === 'project').length,
    group_chat: reports.filter((r) => r.reported_content_type === 'group_chat').length,
  };

  const filterOptions: { label: string; value: ReportFilter; count: number }[] = [
    { label: 'All', value: 'all', count: summary.all },
    { label: 'Pending', value: 'pending', count: summary.pending },
    { label: 'Reviewing', value: 'reviewing', count: summary.reviewing },
    { label: 'In Progress', value: 'in_progress', count: summary.in_progress },
    { label: 'On Hold', value: 'on_hold', count: summary.on_hold },
    { label: 'Awaiting Info', value: 'awaiting_info', count: summary.awaiting_info },
    { label: 'Resolved', value: 'resolved', count: summary.resolved },
    { label: 'Dismissed', value: 'dismissed', count: summary.dismissed },
    { label: 'Appeals', value: 'appeals', count: summary.appeals },
  ];

  const isResolvedReport = (report: any) => String(report?.status || '').toLowerCase() === 'resolved';

  const getReportHeadline = (report: any) => {
    return report?.title || report?.reason || report?.category || 'Report';
  };

  const getReportSnippet = (report: any) => {
    return report?.description || sanitizeAdminNotes(report?.admin_notes) || 'No description available';
  };

  const getReportedSubject = (report: any) => {
    const type = String(report?.reported_content_type || 'other');
    const entityName =
      report?.reported_entity_name ||
      report?.title ||
      report?.reason ||
      report?.reported_content_id ||
      report?.category ||
      'Not specified';

    if (type === 'user') {
      return `User: ${report?.reported_user?.full_name || report?.reported_user?.email || report?.reported_user_id || 'Not specified'}`;
    }

    if (type === 'group_chat') {
      return `Group Chat: ${entityName}`;
    }

    if (type === 'project') {
      return `Project: ${entityName}`;
    }

    if (type === 'event') {
      return `Event: ${entityName}`;
    }

    if (report?.reported_entity_name) {
      return `${String(type).replace('_', ' ')}: ${report.reported_entity_name}`;
    }

    return `${String(type).replace('_', ' ')}: ${report?.reported_content_id || entityName}`;
  };

  const renderReportItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => {
        setSelectedReport(item);
        setAppealFeedback('');
        setAdminAction('');
        setModalVisible(true);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.reportHeader}>
        <View style={styles.reportStatus}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  item.status === 'pending'
                    ? '#f59e0b'
                    : item.status === 'reviewing'
                    ? '#3b82f6'
                    : '#10b981',
              },
            ]}
          />
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.reportContent}>
        <Text style={styles.reason}>{getReportHeadline(item)}</Text>
        <Text style={styles.reportSnippet} numberOfLines={2}>{getReportSnippet(item)}</Text>
        <View style={[styles.reasonBadge, { backgroundColor: getReasonColor(item.reason) + '20' }]}>
          <Text style={[styles.reasonBadgeText, { color: getReasonColor(item.reason) }]}>
            {String(item?.reported_content_type || 'other').replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        {isAppealReport(item) && (
          <View style={[styles.appealBadge, { backgroundColor: '#2563eb22', borderColor: '#2563eb55' }]}>
            <MaterialIcons name="support-agent" size={12} color="#2563eb" />
            <Text style={styles.appealBadgeText}>APPEAL</Text>
          </View>
        )}
      </View>

      <View style={styles.reportMeta}>
        <Text style={styles.reportedUser}>
          Reported: {getReportedSubject(item)}
        </Text>
        <Text style={styles.reportDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      {!!item?.reported_entity_creator_name && (
        <Text style={styles.reportCreatorMeta}>Creator: {item.reported_entity_creator_name}</Text>
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="Reports"
        subtitle="Escalations, abuse and moderation actions"
        count={reports.length}
        onBack={() => navigation.goBack()}
        onRefresh={loadReports}
      />

      <View style={styles.countsDropdownWrap}>
        <TouchableOpacity
          style={[styles.countsDropdownTrigger, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
          onPress={() => setShowCountsDropdown((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Text style={[styles.countsDropdownTitle, { color: Colors.text }]}>Report Counts</Text>
          <View style={styles.countsDropdownRight}>
            <Text style={[styles.countsDropdownHint, { color: Colors.textSecondary }]}>Tap to {showCountsDropdown ? 'hide' : 'view'}</Text>
            <MaterialIcons
              name={showCountsDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={20}
              color={Colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {showCountsDropdown && (
          <View style={[styles.countsDropdownPanel, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>All</Text>
                <Text style={[styles.summaryValue, { color: Colors.text }]}>{summary.all}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Pending</Text>
                <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{summary.pending}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Reviewing</Text>
                <Text style={[styles.summaryValue, { color: '#3b82f6' }]}>{summary.reviewing}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>In Progress</Text>
                <Text style={[styles.summaryValue, { color: '#06b6d4' }]}>{summary.in_progress}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>On Hold</Text>
                <Text style={[styles.summaryValue, { color: '#a78bfa' }]}>{summary.on_hold}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Awaiting Info</Text>
                <Text style={[styles.summaryValue, { color: '#ec407a' }]}>{summary.awaiting_info}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Resolved</Text>
                <Text style={[styles.summaryValue, { color: '#10b981' }]}>{summary.resolved}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Dismissed</Text>
                <Text style={[styles.summaryValue, { color: '#6b7280' }]}>{summary.dismissed}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Appeals</Text>
                <Text style={[styles.summaryValue, { color: '#2563eb' }]}>{summary.appeals}</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Events</Text>
                <Text style={[styles.summaryValue, { color: '#22c55e' }]}>{summary.event}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Projects</Text>
                <Text style={[styles.summaryValue, { color: '#f97316' }]}>{summary.project}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Group Chats</Text>
                <Text style={[styles.summaryValue, { color: '#0ea5e9' }]}>{summary.group_chat}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.filtersDropdownWrap}>
        <TouchableOpacity
          style={[styles.filtersDropdownTrigger, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
          onPress={() => setShowFiltersDropdown((prev) => !prev)}
          activeOpacity={0.8}
        >
          <View style={styles.filtersDropdownTitleWrap}>
            <Text style={[styles.filtersDropdownTitle, { color: Colors.text }]}>Filters</Text>
            <Text style={[styles.filtersDropdownActive, { color: Colors.textSecondary }]}>Active: {filterOptions.find((opt) => opt.value === statusFilter)?.label || 'All'}</Text>
          </View>
          <MaterialIcons
            name={showFiltersDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showFiltersDropdown && (
          <View style={[styles.filtersDropdownPanel, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <View style={styles.filtersGrid}>
              {filterOptions.map((option) => {
                const active = option.value === statusFilter;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.filterOptionButton,
                      { borderColor: Colors.border, backgroundColor: Colors.background },
                      active && { borderColor: Colors.primary, backgroundColor: Colors.primary + '14' },
                    ]}
                    onPress={() => {
                      setStatusFilter(option.value);
                      setShowFiltersDropdown(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterOptionLabel, { color: active ? Colors.primary : Colors.text }]}>{option.label}</Text>
                    <View style={[styles.filterOptionCountBadge, { backgroundColor: active ? Colors.primary : Colors.surface, borderColor: active ? Colors.primary : Colors.border }]}>
                      <Text style={[styles.filterOptionCountText, { color: active ? '#fff' : Colors.textSecondary }]}>{option.count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="done-all" size={64} color={Colors.primary} />
            <Text style={styles.emptyText}>No reports</Text>
            <Text style={styles.emptySubtext}>All reports have been handled</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}>
            {selectedReport && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Report Details</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <MaterialIcons name="close" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={[styles.modalHero, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                    <View style={styles.modalHeroTop}>
                      <View style={[styles.heroStatusPill, { backgroundColor: getStatusTone(selectedReport.status).bg }]}> 
                        <Text style={[styles.heroStatusText, { color: getStatusTone(selectedReport.status).text }]}>
                          {String(selectedReport.status || 'pending').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.heroDateText, { color: Colors.textSecondary }]}>
                        {new Date(selectedReport.created_at).toLocaleString()}
                      </Text>
                    </View>

                    <Text style={[styles.heroReasonText, { color: Colors.text }]}>{getReportHeadline(selectedReport)}</Text>

                    <View style={[styles.heroReasonTag, { backgroundColor: getReasonColor(selectedReport.reason) + '20' }]}> 
                      <Text style={[styles.heroReasonTagText, { color: getReasonColor(selectedReport.reason) }]}>
                        {String(selectedReport?.reported_content_type || 'other').replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>

                    {selectedReport.title && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.modalLabel, { color: Colors.textSecondary }]}>Title</Text>
                        <Text style={[styles.heroReasonText, { color: Colors.text, fontSize: 14 }]}>{selectedReport.title}</Text>
                      </View>
                    )}

                    {selectedReport.description && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.modalLabel, { color: Colors.textSecondary }]}>Description</Text>
                        <Text style={[styles.detailDescription, { color: Colors.text }]}>{selectedReport.description}</Text>
                      </View>
                    )}

                    {selectedReport.reported_content_type && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.modalLabel, { color: Colors.textSecondary }]}>Reported Content Type</Text>
                        <Text style={[{ color: Colors.text, fontWeight: '600' }]}>{selectedReport.reported_content_type.replace('_', ' ').toUpperCase()}</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.detailCard, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                    <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Participants & Details</Text>
                    
                    {selectedReport.reported_content_type === 'user' && (
                      <>
                        <View style={styles.participantRow}>
                          <MaterialIcons name="person" size={16} color={Colors.textSecondary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.participantLabel, { color: Colors.textSecondary }]}>
                              {isAppealReport(selectedReport) ? 'Account Holder' : 'Reported User'}
                            </Text>
                            <Text style={[styles.participantValue, { color: Colors.text }]}>
                              {selectedReport.reported_user?.full_name || selectedReport.reported_user?.email || selectedReport.reported_user_id || 'Unknown user'}
                            </Text>
                            {!!selectedReport.reported_user?.email && (
                              <Text style={[styles.participantMeta, { color: Colors.textSecondary }]}>{selectedReport.reported_user.email}</Text>
                            )}
                          </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                      </>
                    )}

                    {selectedReport.reported_content_type !== 'user' && selectedReport.reported_content_id && (
                      <>
                        <View style={styles.participantRow}>
                          <MaterialIcons name="description" size={16} color={Colors.textSecondary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.participantLabel, { color: Colors.textSecondary }]}>Reported Content</Text>
                            <Text style={[styles.participantValue, { color: Colors.text }]}> 
                              {getReportedSubject(selectedReport)}
                            </Text>
                            {!!selectedReport.reported_entity_creator_name && (
                              <Text style={[styles.participantMeta, { color: Colors.textSecondary }]}>Creator: {selectedReport.reported_entity_creator_name}</Text>
                            )}
                            <Text style={[styles.participantLabel, { color: Colors.textSecondary, marginTop: 6 }]}>Content ID</Text>
                            <Text style={[styles.participantValue, { color: Colors.text }]} numberOfLines={2}>
                              {selectedReport.reported_content_id}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                      </>
                    )}

                    <View style={styles.participantRow}>
                      <MaterialIcons name="how-to-reg" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.participantLabel, { color: Colors.textSecondary }]}>
                          {isAppealReport(selectedReport) ? 'Appeal Submitted By' : 'Reported By'}
                        </Text>
                        <Text style={[styles.participantValue, { color: Colors.text }]}>
                          {selectedReport.reporter?.full_name || selectedReport.reporter?.email || selectedReport.reporter_id || 'Anonymous'}
                        </Text>
                        {isAppealReport(selectedReport) && selectedReport.reporter?.id === selectedReport.reported_user?.id && (
                          <Text style={[styles.participantMeta, { color: Colors.textSecondary }]}>Same as account holder</Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {isAppealReport(selectedReport) && (
                    <View style={[styles.detailCard, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                      <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Appeal Details</Text>

                      <View style={styles.modalSectionCompact}>
                        <Text style={styles.modalLabel}>Appeal Request</Text>
                        <Text style={styles.modalValue}>{parseAppealDescription(selectedReport.description).content || 'No appeal content provided.'}</Text>
                      </View>

                      <View style={styles.modalSectionCompact}>
                        <Text style={styles.modalLabel}>Contact Details</Text>
                        <Text style={styles.modalValue}>{parseAppealDescription(selectedReport.description).contact || 'Not provided'}</Text>
                      </View>
                    </View>
                  )}

                  {(String(selectedReport?.status || '').toLowerCase() === 'resolved' || !!selectedReport?.admin_notes) && (
                    <View style={[styles.detailCard, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                      <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Resolution Feedback</Text>
                      <Text style={styles.modalValue}>{sanitizeAdminNotes(selectedReport?.admin_notes) || 'No feedback provided.'}</Text>
                      {!!selectedReport?.updated_at && (
                        <Text style={styles.modalMeta}>Updated on {new Date(selectedReport.updated_at).toLocaleString()}</Text>
                      )}
                    </View>
                  )}

                  <View style={[styles.actionDock, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                    <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Admin Response</Text>
                    <Text style={[styles.modalLabel, { marginTop: 12 }]}>Action Notes *</Text>
                    <TextInput
                      style={[styles.feedbackInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                      placeholder="Describe the action taken or decision made on this report..."
                      placeholderTextColor={Colors.textSecondary}
                      value={adminAction}
                      onChangeText={setAdminAction}
                      multiline
                      numberOfLines={4}
                      editable
                    />
                    <Text style={[styles.modalMeta, { marginTop: 8 }]}>
                      This message will be visible to the reporter and reported user.
                    </Text>
                  </View>

                  <View style={[styles.actionDock, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                    <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Status</Text>
                    <View style={styles.statusGrid}>
                      {(['pending', 'reviewing', 'in_progress', 'on_hold', 'resolved', 'dismissed', 'awaiting_info'] as const).map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.statusButton,
                            {
                              backgroundColor: selectedReport.status === status ? getStatusTone(status).text : Colors.background,
                              borderColor: getStatusTone(status).text,
                              borderWidth: 1.5,
                            },
                          ]}
                          onPress={() => {
                            if (!adminAction.trim()) {
                              Toast.show({ type: 'error', text1: 'Action notes required', text2: 'Please add admin response before changing status.' });
                              return;
                            }
                            handleResolveReport(selectedReport.id, status, adminAction.trim());
                          }}
                          disabled={isProcessing}
                        >
                          <Text style={[
                            styles.statusButtonText,
                            { color: selectedReport.status === status ? '#FFF' : getStatusTone(status).text },
                          ]}>
                            {(status === 'in_progress' ? 'In Progress' : status === 'on_hold' ? 'On Hold' : status === 'awaiting_info' ? 'Awaiting Info' : status).toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.actionDock, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                    <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Actions</Text>
                    <View style={styles.actionButtons}>
                    {isAppealReport(selectedReport) ? (
                      <>
                        <View style={styles.modalSectionCompact}>
                          <Text style={styles.modalLabel}>Feedback for user *</Text>
                          <TextInput
                            style={[styles.feedbackInput, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.background }]}
                            placeholder="Write the decision feedback visible to the user..."
                            placeholderTextColor={Colors.textSecondary}
                            value={appealFeedback}
                            onChangeText={setAppealFeedback}
                            multiline
                            editable={!isResolvedReport(selectedReport)}
                          />
                        </View>
                        <TouchableOpacity
                          style={[styles.deleteButton, isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() => handleResolveAppealWithDecision(selectedReport, 'denied')}
                          disabled={isProcessing || isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="task-alt" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Deny with Feedback</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.appealApproveButton, isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() => handleResolveAppealWithDecision(selectedReport, 'approved')}
                          disabled={isProcessing || isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="verified-user" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Approve + Unban</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.dangerDeleteButton, !isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() => handleDeleteReport(selectedReport.id)}
                          disabled={isProcessing || !isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="delete-forever" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Delete Report</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.deleteButton, isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() => {
                            if (!adminAction.trim()) {
                              Toast.show({ type: 'error', text1: 'Action notes required', text2: 'Please add admin response before resolving.' });
                              return;
                            }
                            handleResolveReport(selectedReport.id, 'resolved', adminAction.trim());
                          }}
                          disabled={isProcessing || isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="delete" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Remove Content</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.banButton, isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() => {
                            if (!adminAction.trim()) {
                              Toast.show({ type: 'error', text1: 'Action notes required', text2: 'Please add admin response before banning user.' });
                              return;
                            }
                            handleBanUser(
                              selectedReport.id,
                              selectedReport.reported_user?.id || selectedReport.reported_user_id,
                              `User banned from report: ${getReportHeadline(selectedReport)}`,
                              adminAction.trim()
                            );
                          }}
                          disabled={isProcessing || isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="block" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Ban User</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.dangerDeleteButton, !isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() => handleDeleteReport(selectedReport.id)}
                          disabled={isProcessing || !isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="delete-forever" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Delete Report</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    countsDropdownWrap: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    countsDropdownTrigger: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    countsDropdownTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    countsDropdownRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    countsDropdownHint: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    countsDropdownPanel: {
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingBottom: Spacing.sm,
    },
    filtersDropdownWrap: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.sm,
    },
    filtersDropdownTrigger: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    filtersDropdownTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    filtersDropdownTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    filtersDropdownActive: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    filtersDropdownPanel: {
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.sm,
    },
    filtersGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    filterOptionButton: {
      width: '48%',
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    filterOptionLabel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    filterOptionCountBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    filterOptionCountText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingTop: Spacing.sm,
      paddingBottom: 2,
    },
    summaryCard: {
      width: '31%',
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    summaryLabel: {
      fontSize: FontSizes.xs,
      marginBottom: 3,
    },
    summaryValue: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.lg,
    },
    reportCard: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    reportHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    reportStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: BorderRadius.full,
    },
    statusText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    reportContent: {
      marginBottom: Spacing.md,
    },
    reason: {
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    reportSnippet: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    reasonBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.md,
    },
    appealBadge: {
      marginTop: 8,
      alignSelf: 'flex-start',
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    appealBadgeText: {
      color: '#2563eb',
      fontSize: 11,
      fontWeight: FontWeights.bold,
      letterSpacing: 0.3,
    },
    reasonBadgeText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    reportMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    reportedUser: {
      flex: 1,
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    reportDate: {
      textAlign: 'right',
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    reportCreatorMeta: {
      marginTop: 6,
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: Spacing.md,
    },
    emptySubtext: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.sm,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      maxHeight: '90%',
      paddingTop: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    modalBody: {
      padding: Spacing.md,
    },
    modalHero: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      gap: 8,
    },
    modalHeroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    heroStatusPill: {
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroStatusText: {
      fontSize: 11,
      fontWeight: FontWeights.bold,
      letterSpacing: 0.5,
    },
    heroDateText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    heroReasonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      lineHeight: 22,
    },
    heroReasonTag: {
      alignSelf: 'flex-start',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    heroReasonTagText: {
      fontSize: 11,
      fontWeight: FontWeights.bold,
    },
    detailCard: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      gap: 10,
    },
    detailCardTitle: {
      fontSize: FontSizes.xs,
      textTransform: 'uppercase',
      fontWeight: FontWeights.bold,
      letterSpacing: 0.5,
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    participantLabel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
      marginBottom: 2,
    },
    participantValue: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    participantMeta: {
      fontSize: FontSizes.xs,
      marginTop: 2,
    },
    divider: {
      height: 1,
      width: '100%',
    },
    modalSection: {
      marginBottom: Spacing.lg,
    },
    modalSectionCompact: {
      marginBottom: 6,
    },
    modalLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    modalValue: {
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    modalMeta: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 4,
    },
    detailDescription: {
      fontSize: FontSizes.md,
      lineHeight: 20,
      marginTop: 4,
    },
    feedbackInput: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      minHeight: 84,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: FontSizes.sm,
      textAlignVertical: 'top',
    },
    actionDock: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      gap: 10,
    },
    actionButtons: {
      gap: Spacing.md,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f59e0b',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    banButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef4444',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    appealApproveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563eb',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    dangerDeleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#7f1d1d',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    disabledActionButton: {
      opacity: 0.45,
    },
    buttonText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    statusGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 12,
    },
    statusButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      width: '31%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusButtonText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
  });
