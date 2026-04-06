import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';

import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors } from '../../theme';
import { getReportsByReporter } from '../../api/reports';
import { Report, ReportStatus } from '../../types/database';

type MyReportsNavigationProp = StackNavigationProp<RootStackParamList>;
type FilterKey = 'all' | 'open' | 'closed';
type JourneyStep = 'pending' | 'reviewing' | 'in_progress' | 'resolved';

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  in_progress: 'In Progress',
  awaiting_info: 'Awaiting Info',
  on_hold: 'On Hold',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#B45309' },
  reviewing: { bg: '#DBEAFE', text: '#1D4ED8' },
  in_progress: { bg: '#CFFAFE', text: '#0E7490' },
  awaiting_info: { bg: '#FCE7F3', text: '#BE185D' },
  on_hold: { bg: '#EDE9FE', text: '#6D28D9' },
  resolved: { bg: '#DCFCE7', text: '#166534' },
  dismissed: { bg: '#F3F4F6', text: '#4B5563' },
};

const OPEN_STATUSES: ReportStatus[] = ['pending', 'reviewing', 'in_progress', 'awaiting_info', 'on_hold'];
const CLOSED_STATUSES: ReportStatus[] = ['resolved', 'dismissed'];
const JOURNEY_STEPS: JourneyStep[] = ['pending', 'reviewing', 'in_progress', 'resolved'];

const JOURNEY_STEP_LABELS: Record<JourneyStep, string> = {
  pending: 'Submitted',
  reviewing: 'Under Review',
  in_progress: 'Action in Progress',
  resolved: 'Resolved',
};

const STATUS_PROGRESS: Record<ReportStatus, number> = {
  pending: 25,
  reviewing: 50,
  in_progress: 75,
  awaiting_info: 62,
  on_hold: 60,
  resolved: 100,
  dismissed: 100,
};

const formatTypeLabel = (value?: string) => {
  if (!value) return 'other';
  return value.replace(/_/g, ' ');
};

const getStatusDescription = (status: ReportStatus) => {
  if (status === 'pending') return 'Your report is queued for moderation review.';
  if (status === 'reviewing') return 'A moderator is currently reviewing your submission.';
  if (status === 'in_progress') return 'Action is being taken on this issue.';
  if (status === 'awaiting_info') return 'Moderation needs extra information to proceed.';
  if (status === 'on_hold') return 'Review is temporarily paused and will resume soon.';
  if (status === 'resolved') return 'This issue has been resolved by moderation.';
  return 'This report was reviewed and closed with no further action.';
};

export default function MyReportsScreen() {
  const navigation = useNavigation<MyReportsNavigationProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const loadReports = useCallback(async () => {
    if (!user?.id) {
      setReports([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await getReportsByReporter(user.id, { limit: 200, offset: 0 });
      setReports(result.reports || []);
    } catch (error) {
      console.error('Failed to load my reports:', error);
      Toast.show({
        type: 'error',
        text1: 'Unable to load reports',
        text2: 'Please try again in a moment.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  }, [loadReports]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const filteredReports = useMemo(() => {
    if (activeFilter === 'open') {
      return reports.filter((report) => OPEN_STATUSES.includes(report.status));
    }

    if (activeFilter === 'closed') {
      return reports.filter((report) => CLOSED_STATUSES.includes(report.status));
    }

    return reports;
  }, [activeFilter, reports]);

  const counts = useMemo(() => ({
    all: reports.length,
    open: reports.filter((report) => OPEN_STATUSES.includes(report.status)).length,
    closed: reports.filter((report) => CLOSED_STATUSES.includes(report.status)).length,
    awaitingInfo: reports.filter((report) => report.status === 'awaiting_info' || report.status === 'on_hold').length,
    resolved: reports.filter((report) => report.status === 'resolved').length,
  }), [reports]);

  const openDetails = (report: Report) => {
    setSelectedReport(report);
    setIsDetailOpen(true);
  };

  const closeDetails = () => {
    setIsDetailOpen(false);
    setSelectedReport(null);
  };

  const renderReport = ({ item }: { item: Report }) => {
    const statusTone = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const statusLabel = STATUS_LABELS[item.status] || item.status;
    const progress = STATUS_PROGRESS[item.status] || 25;
    const needsAttention = item.status === 'awaiting_info' || item.status === 'on_hold';

    return (
      <View style={styles.reportCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.reportTitle} numberOfLines={1}>{item.title || 'Report'}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
            <Text style={[styles.statusPillText, { color: statusTone.text }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.reportMeta}>
          {formatTypeLabel(item.reported_content_type)} • {new Date(item.created_at).toLocaleDateString()}
        </Text>

        <Text style={styles.reportDescription} numberOfLines={3}>
          {item.description || 'No description provided.'}
        </Text>

        {!!item.admin_notes && (
          <View style={styles.updateBox}>
            <Text style={styles.updateLabel}>Latest update</Text>
            <Text style={styles.updateText} numberOfLines={3}>{item.admin_notes}</Text>
          </View>
        )}

        <View style={styles.progressWrap}>
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressPercent}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressHint}>{getStatusDescription(item.status)}</Text>
        </View>

        {needsAttention && (
          <View style={styles.attentionPill}>
            <MaterialIcons name="info-outline" size={14} color="#92400E" />
            <Text style={styles.attentionText}>Action may be needed from you</Text>
          </View>
        )}

        {item.resolved_at && (
          <Text style={styles.resolvedText}>
            Resolved on {new Date(item.resolved_at).toLocaleDateString()}
          </Text>
        )}

        <View style={styles.cardActionsRow}>
          <Text style={styles.lastUpdatedText}>
            Updated {new Date(item.updated_at || item.created_at).toLocaleDateString()}
          </Text>
          <TouchableOpacity style={styles.viewDetailsButton} onPress={() => openDetails(item)}>
            <Text style={styles.viewDetailsText}>View Details</Text>
            <MaterialIcons name="arrow-forward" size={14} color="#4F46E5" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.gradientBg}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={20} color="#374151" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>My Reports</Text>
            <Text style={styles.headerSubtitle}>Track status, updates, and actions</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {([
            { key: 'all', label: 'All', count: counts.all },
            { key: 'open', label: 'Open', count: counts.open },
            { key: 'closed', label: 'Closed', count: counts.closed },
          ] as Array<{ key: FilterKey; label: string; count: number }>).map((item) => {
            const active = item.key === activeFilter;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setActiveFilter(item.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
                <Text style={[styles.filterChipCount, active && styles.filterChipCountActive]}>
                  {item.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#EEF2FF' }]}>
            <Text style={styles.summaryLabel}>Open</Text>
            <Text style={styles.summaryValue}>{counts.open}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#ECFDF5' }]}>
            <Text style={styles.summaryLabel}>Resolved</Text>
            <Text style={styles.summaryValue}>{counts.resolved}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
            <Text style={styles.summaryLabel}>Need Info</Text>
            <Text style={styles.summaryValue}>{counts.awaitingInfo}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading your reports...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredReports}
            keyExtractor={(item) => item.id}
            renderItem={renderReport}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#6366F1"
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name="report-gmailerrorred" size={46} color={Colors.textSecondary} />
                <Text style={styles.emptyTitle}>No reports in this section</Text>
                <Text style={styles.emptySubtitle}>
                  Your submitted reports and moderation updates will appear here.
                </Text>
              </View>
            }
          />
        )}

        <Modal
          visible={isDetailOpen}
          transparent
          animationType="slide"
          onRequestClose={closeDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailSheet}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderTextWrap}>
                  <Text style={styles.detailTitle}>Report Details</Text>
                  <Text style={styles.detailSubtitle}>Track the complete moderation journey</Text>
                </View>
                <TouchableOpacity style={styles.detailCloseBtn} onPress={closeDetails}>
                  <MaterialIcons name="close" size={20} color="#374151" />
                </TouchableOpacity>
              </View>

              {selectedReport ? (
                <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>{selectedReport.title || 'Report'}</Text>
                    <Text style={styles.detailMetaText}>
                      {formatTypeLabel(selectedReport.reported_content_type)} • Submitted {new Date(selectedReport.created_at).toLocaleString()}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[selectedReport.status] || STATUS_COLORS.pending).bg, alignSelf: 'flex-start', marginTop: 8 }]}>
                      <Text style={[styles.statusPillText, { color: (STATUS_COLORS[selectedReport.status] || STATUS_COLORS.pending).text }]}>
                        {STATUS_LABELS[selectedReport.status] || selectedReport.status}
                      </Text>
                    </View>
                    <Text style={styles.detailBodyText}>{selectedReport.description || 'No description provided.'}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionLabel}>Status Timeline</Text>
                    {JOURNEY_STEPS.map((step, index) => {
                      const stepIndex = JOURNEY_STEPS.indexOf(step);
                      const currentPercent = STATUS_PROGRESS[selectedReport.status] || 25;
                      const threshold = ((stepIndex + 1) / JOURNEY_STEPS.length) * 100;
                      const completed = currentPercent >= threshold;

                      return (
                        <View key={step} style={styles.timelineRow}>
                          <View style={[styles.timelineDot, completed && styles.timelineDotActive]} />
                          {index < JOURNEY_STEPS.length - 1 && (
                            <View style={[styles.timelineLine, completed && styles.timelineLineActive]} />
                          )}
                          <Text style={[styles.timelineLabel, completed && styles.timelineLabelActive]}>
                            {JOURNEY_STEP_LABELS[step]}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {!!selectedReport.admin_notes && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionLabel}>Latest Moderator Update</Text>
                      <View style={styles.detailUpdateCard}>
                        <Text style={styles.detailUpdateText}>{selectedReport.admin_notes}</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionLabel}>Reference</Text>
                    <Text style={styles.referenceText}>Report ID: {selectedReport.id}</Text>
                    <Text style={styles.referenceText}>Last Updated: {new Date(selectedReport.updated_at || selectedReport.created_at).toLocaleString()}</Text>
                    {!!selectedReport.resolved_at && (
                      <Text style={styles.referenceText}>Resolved At: {new Date(selectedReport.resolved_at).toLocaleString()}</Text>
                    )}
                  </View>
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5E6D8',
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    gradientBg: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
      gap: 12,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.8)',
    },
    headerTextWrap: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#1F2937',
    },
    headerSubtitle: {
      fontSize: 13,
      color: '#6B7280',
      marginTop: 2,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 2,
      paddingBottom: 8,
    },
    summaryCard: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,0.06)',
    },
    summaryLabel: {
      fontSize: 11,
      color: '#6B7280',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    summaryValue: {
      marginTop: 6,
      fontSize: 20,
      color: '#111827',
      fontWeight: '800',
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.72)',
    },
    filterChipActive: {
      backgroundColor: '#111827',
    },
    filterChipText: {
      fontSize: 12,
      color: '#4B5563',
      fontWeight: '600',
    },
    filterChipTextActive: {
      color: '#FFFFFF',
    },
    filterChipCount: {
      fontSize: 12,
      color: '#6B7280',
      fontWeight: '700',
    },
    filterChipCountActive: {
      color: '#FFFFFF',
    },
    loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 10,
      color: '#6B7280',
      fontSize: 13,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 28,
      paddingTop: 2,
      gap: 10,
      flexGrow: 1,
    },
    reportCard: {
      backgroundColor: 'rgba(255,255,255,0.82)',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,0.08)',
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    reportTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: '#111827',
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    reportMeta: {
      marginTop: 8,
      fontSize: 12,
      color: '#6B7280',
      textTransform: 'capitalize',
    },
    reportDescription: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 19,
      color: '#374151',
    },
    progressWrap: {
      marginTop: 10,
    },
    progressHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    progressLabel: {
      fontSize: 11,
      color: '#6B7280',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    progressPercent: {
      fontSize: 12,
      color: '#4F46E5',
      fontWeight: '700',
    },
    progressTrack: {
      height: 7,
      borderRadius: 999,
      backgroundColor: '#E5E7EB',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#6366F1',
      borderRadius: 999,
    },
    progressHint: {
      marginTop: 6,
      fontSize: 12,
      color: '#6B7280',
      lineHeight: 17,
    },
    updateBox: {
      marginTop: 10,
      borderRadius: 10,
      padding: 10,
      backgroundColor: '#F3F4F6',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    updateLabel: {
      fontSize: 11,
      color: '#6B7280',
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    updateText: {
      fontSize: 12,
      color: '#111827',
      lineHeight: 18,
    },
    resolvedText: {
      marginTop: 8,
      fontSize: 12,
      color: '#166534',
      fontWeight: '600',
    },
    attentionPill: {
      marginTop: 10,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: '#FEF3C7',
      borderWidth: 1,
      borderColor: '#FDE68A',
    },
    attentionText: {
      fontSize: 11,
      color: '#92400E',
      fontWeight: '700',
    },
    cardActionsRow: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    lastUpdatedText: {
      flex: 1,
      fontSize: 11,
      color: '#6B7280',
    },
    viewDetailsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#EEF2FF',
    },
    viewDetailsText: {
      fontSize: 11,
      color: '#4F46E5',
      fontWeight: '700',
    },
    emptyState: {
      flex: 1,
      minHeight: 260,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    emptyTitle: {
      marginTop: 10,
      fontSize: 16,
      fontWeight: '700',
      color: '#111827',
    },
    emptySubtitle: {
      marginTop: 6,
      fontSize: 13,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    detailSheet: {
      maxHeight: '86%',
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    detailHeaderTextWrap: {
      flex: 1,
      paddingRight: 10,
    },
    detailTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: '#111827',
    },
    detailSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: '#6B7280',
    },
    detailCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F3F4F6',
    },
    detailScroll: {
      flex: 1,
    },
    detailSection: {
      borderRadius: 14,
      backgroundColor: '#F9FAFB',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      padding: 12,
      marginBottom: 10,
    },
    detailSectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: '#111827',
    },
    detailMetaText: {
      marginTop: 5,
      fontSize: 12,
      color: '#6B7280',
      textTransform: 'capitalize',
    },
    detailBodyText: {
      marginTop: 9,
      fontSize: 13,
      lineHeight: 19,
      color: '#374151',
    },
    detailSectionLabel: {
      fontSize: 12,
      color: '#6B7280',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.35,
      marginBottom: 8,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 34,
      position: 'relative',
      paddingLeft: 2,
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#D1D5DB',
      marginRight: 10,
      zIndex: 2,
    },
    timelineDotActive: {
      backgroundColor: '#4F46E5',
    },
    timelineLine: {
      position: 'absolute',
      left: 6,
      top: 18,
      width: 2,
      height: 20,
      backgroundColor: '#D1D5DB',
      zIndex: 1,
    },
    timelineLineActive: {
      backgroundColor: '#4F46E5',
    },
    timelineLabel: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: '600',
    },
    timelineLabelActive: {
      color: '#111827',
      fontWeight: '700',
    },
    detailUpdateCard: {
      borderRadius: 10,
      padding: 10,
      backgroundColor: '#EEF2FF',
      borderWidth: 1,
      borderColor: '#C7D2FE',
    },
    detailUpdateText: {
      fontSize: 13,
      color: '#1E1B4B',
      lineHeight: 18,
    },
    referenceText: {
      fontSize: 12,
      color: '#4B5563',
      lineHeight: 18,
      marginBottom: 3,
    },
  });
