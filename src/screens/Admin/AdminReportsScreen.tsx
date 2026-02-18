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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getReports, updateReportStatus, toggleUserBan } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';

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
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const loadReports = async () => {
    try {
      const data = await getReports(statusFilter ? { status: statusFilter } : undefined);
      setReports(data);
    } catch (error) {
      console.error('Error loading reports:', error);
      Toast.show({ type: 'error', text1: 'Failed to load reports' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBanUser = async (reportId: string, reportedUserId: string) => {
    if (!user?.id) return;
    try {
      await Promise.all([
        toggleUserBan(reportedUserId, user.id, 'User reported and banned'),
        updateReportStatus(reportId, 'resolved', user.id, 'User banned'),
      ]);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'User banned successfully' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to ban user' });
    }
  };

  const handleResolveReport = async (reportId: string, action: string) => {
    if (!user?.id) return;
    try {
      await updateReportStatus(reportId, 'resolved', user.id, action);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setModalVisible(false);
      Toast.show({ type: 'success', text1: 'Report resolved' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to resolve report' });
    }
  };

  const getReasonColor = (reason: string) => {
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('spam')) return '#3b82f6';
    if (reasonLower.includes('abuse')) return '#ef4444';
    if (reasonLower.includes('harassment')) return '#f59e0b';
    return Colors.primary;
  };

  const renderReportItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => {
        setSelectedReport(item);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{reports.length}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {['All', 'pending', 'reviewing', 'resolved'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              (statusFilter === null && status === 'All') || statusFilter === status
                ? styles.filterChipActive
                : null,
            ]}
            onPress={() => setStatusFilter(status === 'All' ? null : status)}
          >
            <Text
              style={[
                styles.filterChipText,
                (statusFilter === null && status === 'All') || statusFilter === status
                  ? styles.filterChipTextActive
                  : null,
              ]}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Reason</Text>
                    <Text style={styles.modalValue}>{selectedReport.reason}</Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Reported User</Text>
                    <Text style={styles.modalValue}>
                      {selectedReport.reported_user?.full_name || 'Unknown'}
                    </Text>
                    <Text style={styles.modalMeta}>
                      {selectedReport.reported_user?.email}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Reporter</Text>
                    <Text style={styles.modalValue}>
                      {selectedReport.reporter?.full_name || 'Anonymous'}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Status</Text>
                    <Text style={styles.modalValue}>{selectedReport.status.toUpperCase()}</Text>
                  </View>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() =>
                        handleResolveReport(selectedReport.id, 'Content removed')
                      }
                    >
                      <MaterialIcons name="delete" size={18} color="#fff" />
                      <Text style={styles.buttonText}>Remove Content</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.banButton}
                      onPress={() =>
                        handleBanUser(
                          selectedReport.id,
                          selectedReport.reported_user?.id
                        )
                      }
                    >
                      <MaterialIcons name="block" size={18} color="#fff" />
                      <Text style={styles.buttonText}>Ban User</Text>
                    </TouchableOpacity>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
      textAlign: 'center',
    },
    badge: {
      backgroundColor: '#ef4444',
      borderRadius: BorderRadius.full,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    filterScroll: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
      marginRight: Spacing.sm,
    },
    filterChipActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    filterChipText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    filterChipTextActive: {
      color: '#fff',
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
    modalSection: {
      marginBottom: Spacing.lg,
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
    actionButtons: {
      gap: Spacing.md,
      marginBottom: Spacing.md,
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
    buttonText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
  });
