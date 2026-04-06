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
  }), [reports]);

  const renderReport = ({ item }: { item: Report }) => {
    const statusTone = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const statusLabel = STATUS_LABELS[item.status] || item.status;

    return (
      <View style={styles.reportCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.reportTitle} numberOfLines={1}>{item.title || 'Report'}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
            <Text style={[styles.statusPillText, { color: statusTone.text }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.reportMeta}>
          {String(item.reported_content_type || 'other').replace(/_/g, ' ')} • {new Date(item.created_at).toLocaleDateString()}
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

        {item.resolved_at && (
          <Text style={styles.resolvedText}>
            Resolved on {new Date(item.resolved_at).toLocaleDateString()}
          </Text>
        )}
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
  });
