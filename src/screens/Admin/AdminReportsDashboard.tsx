import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors } from '../../theme';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import {
  getAllReports,
  getReportStatistics,
  assignReportToAdmin,
  updateReportStatus,
  resolveReport,
  getReportAuditLogs,
  getReportResolution,
  notifyReporterOfAction,
} from '../../api/reports';
import {
  getPriorityColor,
  getPriorityLabel,
  getStatusColor,
  getStatusLabel,
  getCategoryLabel,
  getContentTypeLabel,
  formatDate,
  getTimeAgo,
  REPORT_CATEGORIES,
  ADMIN_ACTIONS,
} from '../../utils/reportHelpers';
import { Report, ReportStatus, ReportPriority, ReportCategory, AdminActionType, ReportAuditLog, ReportResolution } from '../../types/database';

const { width } = Dimensions.get('window');

interface Filters {
  status: ReportStatus | null;
  category: ReportCategory | null;
  priority: ReportPriority | null;
  search: string;
}

export const AdminReportsDashboard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { isDark } = useTheme();
  const Colors = getColors(Boolean(isDark)) || getColors(false);
  const colors = Colors;
  const { user } = useAuth();

  // Data states
  const [reports, setReports] = useState<Report[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [filters, setFilters] = useState<Filters>({
    status: null,
    category: null,
    priority: null,
    search: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<ReportAuditLog[]>([]);
  const [resolution, setResolution] = useState<ReportResolution | null>(null);

  // Resolution modal states
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<AdminActionType>('warning');
  const [resolutionDescription, setResolutionDescription] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [actionDuration, setActionDuration] = useState<number>(24);
  const [submittingResolution, setSubmittingResolution] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [reportsData, statsData] = await Promise.all([
        getAllReports({
          status: filters.status || undefined,
          category: filters.category || undefined,
          priority: filters.priority || undefined,
          search: filters.search || undefined,
          limit: 100,
        }),
        getReportStatistics(),
      ]);

      setReports(reportsData.reports);
      setStatistics(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleReportPress = async (report: Report) => {
    setSelectedReport(report);
    setShowDetailModal(true);

    try {
      const [logsData, resolutionData] = await Promise.all([
        getReportAuditLogs(report.id),
        getReportResolution(report.id),
      ]);

      setAuditLogs(logsData);
      setResolution(resolutionData);
    } catch (error) {
      console.error('Error loading report details:', error);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedReport || !user) return;

    try {
      await assignReportToAdmin(selectedReport.id, user.id);
      Alert.alert('Success', 'Report assigned to you');
      setSelectedReport(null);
      setShowDetailModal(false);
      loadData();
    } catch (error) {
      console.error('Error assigning report:', error);
      Alert.alert('Error', 'Failed to assign report');
    }
  };

  const handleUpdateStatus = async (newStatus: ReportStatus) => {
    if (!selectedReport || !user) return;

    try {
      await updateReportStatus(selectedReport.id, newStatus, '', user.id);
      Alert.alert('Success', 'Report status updated');
      setSelectedReport(null);
      setShowDetailModal(false);
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleResolveReport = async () => {
    if (!selectedReport || !user) return;

    if (!resolutionDescription.trim()) {
      Alert.alert('Error', 'Please enter a resolution description');
      return;
    }

    setSubmittingResolution(true);

    try {
      await resolveReport(selectedReport.id, {
        action_type: resolutionAction,
        admin_id: user.id,
        resolution_description: resolutionDescription.trim(),
        feedback_to_reporter: feedbackMessage.trim() || undefined,
        action_duration_hours: resolutionAction === 'temporary_ban' ? actionDuration : undefined,
      });

      Alert.alert('Success', 'Report resolved');
      setShowResolutionModal(false);
      setResolutionDescription('');
      setFeedbackMessage('');
      setSelectedReport(null);
      setShowDetailModal(false);
      loadData();
    } catch (error) {
      console.error('Error resolving report:', error);
      Alert.alert('Error', 'Failed to resolve report');
    } finally {
      setSubmittingResolution(false);
    }
  };

  const StatisticCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <View style={[styles.statCard, { borderLeftColor: color, backgroundColor: Colors.card }]}>
      <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );

  const ReportListItem = ({ report }: { report: Report }) => (
    <TouchableOpacity
      style={[styles.reportItem, { borderLeftColor: getPriorityColor(report.priority), backgroundColor: Colors.card }]}
      onPress={() => handleReportPress(report)}
    >
      <View style={styles.reportItemHeader}>
        <Text style={[styles.reportTitle, { color: Colors.text }]} numberOfLines={2}>{report.title}</Text>
        <View
          style={[
            styles.priorityBadge,
            { backgroundColor: getPriorityColor(report.priority) + '20' },
          ]}
        >
          <Text style={{ color: getPriorityColor(report.priority), fontSize: 11, fontWeight: '600' }}>
            {getPriorityLabel(report.priority)}
          </Text>
        </View>
      </View>

      <View style={styles.reportItemMeta}>
        <Text style={[styles.metaLabel, { color: Colors.textSecondary }]}>
          {getCategoryLabel(report.category)}
        </Text>
        <Text style={[styles.metaLabel, { color: Colors.textSecondary }]}>•</Text>
        <Text style={[styles.metaLabel, { color: Colors.textSecondary }]}>
          {getTimeAgo(report.created_at)}
        </Text>
      </View>

      <View style={styles.reportItemFooter}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(report.status) + '20' },
          ]}
        >
          <Text style={{ color: getStatusColor(report.status), fontSize: 11, fontWeight: '600' }}>
            {getStatusLabel(report.status)}
          </Text>
        </View>
        <Text style={[styles.contentType, { color: Colors.textSecondary }]}>
          {getContentTypeLabel(report.reported_content_type)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenWrapper>
      <View style={[styles.container, { backgroundColor: Colors.background }]}> 
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.screenTitle, { color: Colors.text }]}>Reports Dashboard</Text>
          <TouchableOpacity
            style={[styles.filterButton, { borderColor: Colors.primary }]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Text style={[styles.filterButtonText, { color: Colors.primary }]}>⚙️ Filters</Text>
          </TouchableOpacity>
        </View>

        {/* Statistics */}
        {statistics && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
            <StatisticCard label="Total" value={statistics.total_reports} color="#3B82F6" />
            <StatisticCard label="Pending" value={statistics.pending_reports} color="#F59E0B" />
            <StatisticCard label="Critical" value={statistics.critical_reports} color="#DC2626" />
            <StatisticCard label="Resolved" value={statistics.resolved_reports} color="#10B981" />
          </ScrollView>
        )}

        {/* Filters */}
        {showFilters && (
          <View style={[styles.filtersContainer, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={[styles.filterTitle, { color: Colors.text }]}>Filter Reports</Text>

            {/* Search */}
            <TextInput
              style={[styles.searchInput, { borderColor: Colors.border, color: Colors.text }]}
              placeholder="Search title or description..."
              placeholderTextColor={Colors.textSecondary}
              value={filters.search}
              onChangeText={(text) => setFilters((prev) => ({ ...prev, search: text }))}
            />

            {/* Status Filter */}
            <Text style={[styles.filterLabel, { color: Colors.text }]}>Status</Text>
            <View style={styles.filterChips}>
              {['pending', 'reviewing', 'in_progress', 'resolved'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterChip,
                    filters.status === status && { backgroundColor: Colors.primary },
                    filters.status !== status && { backgroundColor: Colors.background, borderColor: Colors.border, borderWidth: 1 },
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      status: prev.status === status ? null : (status as ReportStatus),
                    }))
                  }
                >
                  <Text
                    style={[styles.filterChipText, { color: filters.status === status ? '#FFF' : Colors.text }]}
                  >
                    {getStatusLabel(status as ReportStatus)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Priority Filter */}
            <Text style={[styles.filterLabel, { color: Colors.text, marginTop: 12 }]}>Priority</Text>
            <View style={styles.filterChips}>
              {['critical', 'high', 'medium', 'low'].map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.filterChip,
                    filters.priority === priority && { backgroundColor: getPriorityColor(priority as ReportPriority) },
                    filters.priority !== priority && { backgroundColor: Colors.background, borderColor: Colors.border, borderWidth: 1 },
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      priority: prev.priority === priority ? null : (priority as ReportPriority),
                    }))
                  }
                >
                  <Text
                    style={[styles.filterChipText, { color: filters.priority === priority ? '#FFF' : Colors.text }]}
                  >
                    {getPriorityLabel(priority as ReportPriority)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Reset Filters */}
            {(filters.status || filters.priority || filters.search) && (
              <TouchableOpacity
                style={[styles.resetButton, { backgroundColor: Colors.primary }]}
                onPress={() => setFilters({ status: null, category: null, priority: null, search: '' })}
              >
                <Text style={styles.resetButtonText}>Reset Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Reports List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: Colors.textSecondary }]}>No reports found</Text>
          </View>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ReportListItem report={item} />}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            scrollEnabled
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}

        {/* Report Detail Modal */}
        <Modal visible={showDetailModal} transparent animationType="slide">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={[styles.detailModal, { backgroundColor: Colors.card }]}>
              {/* Modal Header */}
              <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
                <Text style={[styles.modalTitle, { color: Colors.text }]}>Report Details</Text>
                <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                  <Text style={{ fontSize: 24, color: Colors.primary }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.detailContent}>
                {selectedReport && (
                  <>
                    {/* Title and Category */}
                    <View>
                      <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedReport.title}</Text>
                      <View style={styles.badgesRow}>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: getPriorityColor(selectedReport.priority) + '20' },
                          ]}
                        >
                          <Text style={{ color: getPriorityColor(selectedReport.priority), fontWeight: '600' }}>
                            {getPriorityLabel(selectedReport.priority)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: getStatusColor(selectedReport.status) + '20' },
                          ]}
                        >
                          <Text style={{ color: getStatusColor(selectedReport.status), fontWeight: '600' }}>
                            {getStatusLabel(selectedReport.status)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Status Change Section */}
                    <View style={{ marginTop: 16 }}>
                      <Text style={[styles.detailLabel, { color: colors.text }]}>Change Status</Text>
                      <View style={styles.statusGrid}>
                        {(['pending', 'reviewing', 'in_progress', 'resolved', 'dismissed', 'awaiting_info'] as ReportStatus[]).map((status) => (
                          <TouchableOpacity
                            key={status}
                            style={[
                              styles.statusButton,
                              {
                                backgroundColor: selectedReport.status === status ? getStatusColor(status) : colors.background,
                                borderColor: getStatusColor(status),
                                borderWidth: 1.5,
                              },
                            ]}
                            onPress={() => handleUpdateStatus(status)}
                          >
                            <Text style={[
                              styles.statusButtonText,
                              { color: selectedReport.status === status ? '#FFF' : getStatusColor(status) },
                            ]}>
                              {getStatusLabel(status)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Description */}
                    <View style={{ marginTop: 16 }}>
                      <Text style={[styles.detailLabel, { color: colors.text }]}>Description</Text>
                      <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
                        {selectedReport.description}
                      </Text>
                    </View>

                    {/* Meta Information */}
                    <View style={{ marginTop: 16 }}>
                      <Text style={[styles.detailLabel, { color: colors.text }]}>Information</Text>
                      <View style={[styles.metaBox, { backgroundColor: colors.background }]}>
                        <View style={styles.metaRow}>
                          <Text style={[styles.metaKey, { color: colors.textSecondary }]}>Category:</Text>
                          <Text style={[styles.metaValue, { color: colors.text }]}>{getCategoryLabel(selectedReport.category)}</Text>
                        </View>
                        <View style={styles.metaRow}>
                          <Text style={[styles.metaKey, { color: colors.textSecondary }]}>Type:</Text>
                          <Text style={[styles.metaValue, { color: colors.text }]}>{getContentTypeLabel(selectedReport.reported_content_type)}</Text>
                        </View>
                        <View style={styles.metaRow}>
                          <Text style={[styles.metaKey, { color: colors.textSecondary }]}>Created:</Text>
                          <Text style={[styles.metaValue, { color: colors.text }]}>{formatDate(selectedReport.created_at)}</Text>
                        </View>
                        {selectedReport.resolved_at && (
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaKey, { color: colors.textSecondary }]}>Resolved:</Text>
                            <Text style={[styles.metaValue, { color: colors.text }]}>{formatDate(selectedReport.resolved_at)}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Audit Logs */}
                    {auditLogs.length > 0 && (
                      <View style={{ marginTop: 16 }}>
                        <Text style={[styles.detailLabel, { color: colors.text }]}>Activity Log</Text>
                        {auditLogs.map((log, index) => (
                          <View key={log.id} style={[styles.auditLogItem, { backgroundColor: colors.background }]}>
                            <Text style={[styles.auditAction, { color: colors.text }]}>{log.action}</Text>
                            <Text style={[styles.auditDescription, { color: colors.textSecondary }]}>{log.description}</Text>
                            <Text style={[styles.auditTime, { color: colors.textSecondary }]}>{getTimeAgo(log.created_at)}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Resolution Info */}
                    {resolution && (
                      <View style={{ marginTop: 16 }}>
                        <Text style={[styles.detailLabel, { color: colors.text }]}>Resolution</Text>
                        <View style={[styles.resolutionBox, { backgroundColor: colors.background, borderColor: '#10B981' }]}>
                          <Text style={[styles.resolutionAction, { color: colors.text }]}>
                            Action: {ADMIN_ACTIONS.find((a: any) => a.value === resolution.action_type)?.label}
                          </Text>
                          <Text style={[styles.resolutionDescription, { color: colors.textSecondary }]}>
                            {resolution.resolution_description}
                          </Text>
                          {resolution.feedback_to_reporter && (
                            <View style={{ marginTop: 8 }}>
                              <Text style={[styles.detailLabel, { color: colors.text, fontSize: 12 }]}>Feedback</Text>
                              <Text style={[styles.resolutionDescription, { color: colors.textSecondary }]}>
                                {resolution.feedback_to_reporter}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Modal Actions */}
              <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
                {selectedReport?.status !== 'resolved' && (
                  <>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        setShowDetailModal(false);
                        setShowResolutionModal(true);
                      }}
                    >
                      <Text style={styles.actionButtonText}>Resolve Report</Text>
                    </TouchableOpacity>
                    {!selectedReport?.assigned_admin_id && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
                        onPress={handleAssignToMe}
                      >
                        <Text style={styles.actionButtonText}>Assign to Me</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.textSecondary }]}
                  onPress={() => setShowDetailModal(false)}
                >
                  <Text style={styles.actionButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Resolution Modal */}
        <Modal visible={showResolutionModal} transparent animationType="slide">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={[styles.detailModal, { backgroundColor: colors.card }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Resolve Report</Text>
                <TouchableOpacity onPress={() => setShowResolutionModal(false)}>
                  <Text style={{ fontSize: 24, color: colors.primary }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.detailContent}>
                {/* Action Type Selection */}
                <View>
                  <Text style={[styles.detailLabel, { color: colors.text }]}>Action Type</Text>
                  {ADMIN_ACTIONS.map((action: any) => (
                    <TouchableOpacity
                      key={action.value}
                      style={[
                        styles.actionTypeButton,
                        {
                          borderColor: colors.border,
                          backgroundColor: resolutionAction === action.value ? colors.primary + '20' : colors.background,
                        },
                      ]}
                      onPress={() => setResolutionAction(action.value)}
                    >
                      <View
                        style={[
                          styles.radioButton,
                          {
                            borderColor: colors.primary,
                            backgroundColor: resolutionAction === action.value ? colors.primary : 'transparent',
                          },
                        ]}
                      />
                      <View>
                        <Text style={[styles.actionTypeLabel, { color: colors.text }]}>{action.label}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Action Duration (for temporary ban) */}
                {resolutionAction === 'temporary_ban' && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.detailLabel, { color: colors.text }]}>Ban Duration (hours)</Text>
                    <TextInput
                      style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                      placeholder="24"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="numeric"
                      value={actionDuration.toString()}
                      onChangeText={(text) => setActionDuration(parseInt(text) || 24)}
                    />
                  </View>
                )}

                {/* Resolution Description */}
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.detailLabel, { color: colors.text }]}>Action Description *</Text>
                  <TextInput
                    style={[styles.textArea, { borderColor: colors.border, color: colors.text }]}
                    placeholder="Explain the action taken and why..."
                    placeholderTextColor={colors.textSecondary}
                    value={resolutionDescription}
                    onChangeText={setResolutionDescription}
                    multiline
                    numberOfLines={5}
                  />
                </View>

                {/* Feedback to Reporter */}
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.detailLabel, { color: colors.text }]}>Feedback to Reporter (Optional)</Text>
                  <TextInput
                    style={[styles.textArea, { borderColor: colors.border, color: colors.text }]}
                    placeholder="Message to send to the reporter..."
                    placeholderTextColor={colors.textSecondary}
                    value={feedbackMessage}
                    onChangeText={setFeedbackMessage}
                    multiline
                    numberOfLines={4}
                  />
                </View>
              </ScrollView>

              <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                  onPress={handleResolveReport}
                  disabled={submittingResolution || !resolutionDescription.trim()}
                >
                  {submittingResolution ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.actionButtonText}>Submit Resolution</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.textSecondary }]}
                  onPress={() => setShowResolutionModal(false)}
                  disabled={submittingResolution}
                >
                  <Text style={styles.actionButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsScroll: {
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  statCard: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    minWidth: 120,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  filtersContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 12,
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  resetButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  reportItem: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  reportItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reportItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 11,
  },
  reportItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  contentType: {
    fontSize: 11,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  detailModal: {
    maxHeight: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  detailContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  detailDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  metaBox: {
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: {
    fontSize: 12,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  auditLogItem: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  auditAction: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  auditDescription: {
    fontSize: 11,
    marginBottom: 4,
  },
  auditTime: {
    fontSize: 10,
  },
  resolutionBox: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
  },
  resolutionAction: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  resolutionDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Resolution Modal Specific
  actionTypeButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginTop: 2,
  },
  actionTypeLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: '30%',
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default AdminReportsDashboard;
