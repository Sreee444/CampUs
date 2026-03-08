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
import AdminFilterChips from '../../components/admin/AdminFilterChips';

type ReportFilter = 'all' | 'pending' | 'reviewing' | 'resolved';

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
  const [statusFilter, setStatusFilter] = useState<ReportFilter>('all');
  const [appealFeedback, setAppealFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const isAppealReport = (report: any) => String(report?.reason || '').toLowerCase().includes('appeal');

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
      const data = await getReports(statusFilter === 'all' ? undefined : { status: statusFilter });
      setReports(data);
    } catch (error) {
      console.error('Error loading reports:', error);
      Toast.show({ type: 'error', text1: 'Failed to load reports' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBanUser = async (reportId: string, reportedUserId?: string | null, reason?: string) => {
    if (!user?.id) return;
    if (isProcessing) return;
    if (!reportedUserId) {
      Toast.show({ type: 'error', text1: 'No target user found for this report' });
      return;
    }

    try {
      setIsProcessing(true);
      await Promise.all([
        banUser(reportedUserId, user.id, reason || 'User reported and banned by moderation'),
        updateReportStatus(reportId, 'resolved', user.id, 'User banned'),
      ]);
      await insertAdminLog(user.id, 'ban_user', reportedUserId, { source: 'report', report_id: reportId });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'User banned successfully' });
    } catch (error: any) {
      if (String(error?.message || '').toLowerCase().includes('already has an active ban')) {
        await updateReportStatus(reportId, 'resolved', user.id, 'User already banned');
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        setModalVisible(false);
        Toast.show({ type: 'success', text1: 'User already banned, report resolved' });
        return;
      }
      Toast.show({ type: 'error', text1: 'Failed to ban user', text2: error?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveAppealWithDecision = async (report: any, decision: 'approved' | 'denied') => {
    if (!user?.id) return;
    const reportedUserId = report?.reported_user?.id || report?.reported_user_id;
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
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'Report deleted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to delete report', text2: error?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveReport = async (reportId: string, action: string) => {
    if (!user?.id) return;
    if (isProcessing) return;
    try {
      setIsProcessing(true);
      await updateReportStatus(reportId, 'resolved', user.id, action);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'Report resolved' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to resolve report' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getReasonColor = (reason: string) => {
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('spam')) return '#3b82f6';
    if (reasonLower.includes('abuse')) return '#ef4444';
    if (reasonLower.includes('harassment')) return '#f59e0b';
    return Colors.primary;
  };

  const getStatusTone = (status?: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending') return { bg: '#f59e0b20', text: '#f59e0b' };
    if (s === 'reviewing') return { bg: '#3b82f620', text: '#3b82f6' };
    if (s === 'resolved') return { bg: '#10b98120', text: '#10b981' };
    return { bg: Colors.border, text: Colors.textSecondary };
  };

  const summary = {
    all: reports.length,
    pending: reports.filter((r) => r.status === 'pending').length,
    reviewing: reports.filter((r) => r.status === 'reviewing').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
    appeals: reports.filter((r) => isAppealReport(r)).length,
  };

  const isResolvedReport = (report: any) => String(report?.status || '').toLowerCase() === 'resolved';

  const renderReportItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => {
        setSelectedReport(item);
        setAppealFeedback('');
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
        <Text style={styles.reason}>{item.reason}</Text>
        <View style={[styles.reasonBadge, { backgroundColor: getReasonColor(item.reason) + '20' }]}>
          <Text style={[styles.reasonBadgeText, { color: getReasonColor(item.reason) }]}>
            {item.reason.split(' ')[0]}
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
          Reported: {item.reported_user?.full_name || 'Unknown'}
        </Text>
        <Text style={styles.reportDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
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

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Pending</Text>
          <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{summary.pending}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Reviewing</Text>
          <Text style={[styles.summaryValue, { color: '#3b82f6' }]}>{summary.reviewing}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Resolved</Text>
          <Text style={[styles.summaryValue, { color: '#10b981' }]}>{summary.resolved}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>Appeals</Text>
          <Text style={[styles.summaryValue, { color: '#2563eb' }]}>{summary.appeals}</Text>
        </View>
      </View>

      <AdminFilterChips<ReportFilter>
        selected={statusFilter}
        onSelect={setStatusFilter}
        options={[
          { label: 'All', value: 'all', count: summary.all },
          { label: 'Pending', value: 'pending', count: summary.pending },
          { label: 'Reviewing', value: 'reviewing', count: summary.reviewing },
          { label: 'Resolved', value: 'resolved', count: summary.resolved },
        ]}
      />

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

                    <Text style={[styles.heroReasonText, { color: Colors.text }]}>{selectedReport.reason}</Text>

                    <View style={[styles.heroReasonTag, { backgroundColor: getReasonColor(selectedReport.reason) + '20' }]}> 
                      <Text style={[styles.heroReasonTagText, { color: getReasonColor(selectedReport.reason) }]}>
                        {selectedReport.reason.split(' ')[0]}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.detailCard, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                    <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Participants</Text>
                    <View style={styles.participantRow}>
                      <MaterialIcons name="person" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.participantLabel, { color: Colors.textSecondary }]}>
                          {isAppealReport(selectedReport) ? 'Account Holder' : 'Reported User'}
                        </Text>
                        <Text style={[styles.participantValue, { color: Colors.text }]}>
                          {selectedReport.reported_user?.full_name || 'Unknown'}
                        </Text>
                        {!!selectedReport.reported_user?.email && (
                          <Text style={[styles.participantMeta, { color: Colors.textSecondary }]}>{selectedReport.reported_user.email}</Text>
                        )}
                      </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: Colors.border }]} />

                    <View style={styles.participantRow}>
                      <MaterialIcons name="how-to-reg" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.participantLabel, { color: Colors.textSecondary }]}>
                          {isAppealReport(selectedReport) ? 'Appeal Submitted By' : 'Reporter'}
                        </Text>
                        <Text style={[styles.participantValue, { color: Colors.text }]}>
                          {selectedReport.reporter?.full_name || 'Anonymous'}
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

                  {(String(selectedReport?.status || '').toLowerCase() === 'resolved' || !!selectedReport?.action_taken) && (
                    <View style={[styles.detailCard, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                      <Text style={[styles.detailCardTitle, { color: Colors.textSecondary }]}>Resolution Feedback</Text>
                      <Text style={styles.modalValue}>{selectedReport?.action_taken || 'No feedback provided.'}</Text>
                      {!!selectedReport?.reviewed_at && (
                        <Text style={styles.modalMeta}>Resolved on {new Date(selectedReport.reviewed_at).toLocaleString()}</Text>
                      )}
                    </View>
                  )}

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
                          onPress={() =>
                            handleResolveReport(selectedReport.id, 'Content removed')
                          }
                          disabled={isProcessing || isResolvedReport(selectedReport)}
                        >
                          <MaterialIcons name="delete" size={18} color="#fff" />
                          <Text style={styles.buttonText}>Remove Content</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.banButton, isResolvedReport(selectedReport) && styles.disabledActionButton]}
                          onPress={() =>
                            handleBanUser(
                              selectedReport.id,
                              selectedReport.reported_user?.id || selectedReport.reported_user_id,
                              `User banned from report: ${selectedReport.reason}`
                            )
                          }
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
    summaryRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: 2,
    },
    summaryCard: {
      flex: 1,
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
      alignItems: 'center',
    },
    reportedUser: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    reportDate: {
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
  });
