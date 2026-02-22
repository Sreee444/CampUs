import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getEngagementMetrics } from '../../api/admin';
import Loader from '../../components/Loader';

export default function AdminAnalyticsScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const data = await getEngagementMetrics();
      setMetrics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !metrics) {
    return <Loader />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Engagement Analytics</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Key Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { borderLeftColor: '#3b82f6' }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="people" size={24} color="#3b82f6" />
                <Text style={styles.metricValue}>{metrics.totalUsers}</Text>
              </View>
              <Text style={styles.metricLabel}>Total Users</Text>
            </View>

            <View style={[styles.metricCard, { borderLeftColor: '#10b981' }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="article" size={24} color="#10b981" />
                <Text style={styles.metricValue}>{metrics.totalPosts}</Text>
              </View>
              <Text style={styles.metricLabel}>Posts Created</Text>
            </View>

            <View style={[styles.metricCard, { borderLeftColor: '#f59e0b' }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="event" size={24} color="#f59e0b" />
                <Text style={styles.metricValue}>{metrics.totalEvents}</Text>
              </View>
              <Text style={styles.metricLabel}>Events</Text>
            </View>

            <View style={[styles.metricCard, { borderLeftColor: '#8b5cf6' }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="groups" size={24} color="#8b5cf6" />
                <Text style={styles.metricValue}>{metrics.totalTeams}</Text>
              </View>
              <Text style={styles.metricLabel}>Project Teams</Text>
            </View>
          </View>
        </View>

        {/* Engagement Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity (30 days)</Text>
          <View style={[styles.activityCard, { backgroundColor: Colors.surface }]}>
            <View style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <MaterialIcons name="message" size={20} color="#3b82f6" />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Messages Sent</Text>
                <Text style={styles.activityValue}>{metrics.recentMessages}</Text>
              </View>
              <Text style={styles.activityPercent}>+12%</Text>
            </View>
          </View>
        </View>

        {/* User Distribution */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Distribution</Text>
          {Object.entries(metrics.usersByRole).map(([role, count]: [string, any], index: number) => {
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
            const roleName = role.charAt(0).toUpperCase() + role.slice(1);
            const percentage = Math.round((count / metrics.totalUsers) * 100);

            return (
              <View key={role} style={styles.distributionItem}>
                <View style={styles.distributionLabel}>
                  <View
                    style={[styles.colorDot, { backgroundColor: colors[index % colors.length] }]}
                  />
                  <Text style={styles.distributionRole}>{roleName}</Text>
                </View>
                <View style={styles.distributionChart}>
                  <View
                    style={[
                      styles.distributionBar,
                      {
                        width: `${Math.max(percentage, 10)}%`,
                        backgroundColor: colors[index % colors.length],
                      },
                    ]}
                  />
                </View>
                <Text style={styles.distributionStat}>
                  {count} ({percentage}%)
                </Text>
              </View>
            );
          })}
        </View>

        {/* Engagement Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engagement Overview</Text>
          <View style={[styles.statGridSmall, { backgroundColor: Colors.surface }]}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {Math.round(metrics.totalPosts / (metrics.totalUsers || 1))}
              </Text>
              <Text style={styles.statName}>Posts per User</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {Math.round(metrics.recentMessages / 30)}
              </Text>
              <Text style={styles.statName}>Daily Messages</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {Math.round(metrics.totalTeams / (metrics.totalEvents || 1))}
              </Text>
              <Text style={styles.statName}>Teams per Event</Text>
            </View>
          </View>
        </View>

        {/* Last Updated */}
        <View style={[styles.footer, { backgroundColor: Colors.surface }]}>
          <MaterialIcons name="access-time" size={16} color={Colors.textSecondary} />
          <Text style={styles.footerText}>
            Last updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}
          </Text>
        </View>

        <View style={{ height: Spacing.lg }} />
      </ScrollView>
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
    content: {
      flex: 1,
      padding: Spacing.md,
    },
    section: {
      marginBottom: Spacing.xl,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.md,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
    },
    metricCard: {
      flex: 0.48,
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      borderLeftWidth: 4,
      padding: Spacing.md,
    },
    metricHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    metricValue: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    metricLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    activityCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    activityIcon: {
      width: 48,
      height: 48,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#3b82f620',
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityContent: {
      flex: 1,
    },
    activityTitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    activityValue: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: 4,
    },
    activityPercent: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: '#10b981',
    },
    distributionItem: {
      marginBottom: Spacing.md,
    },
    distributionLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: BorderRadius.full,
    },
    distributionRole: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    distributionChart: {
      height: 24,
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
    },
    distributionBar: {
      height: '100%',
      borderRadius: BorderRadius.md,
    },
    distributionStat: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: Spacing.sm,
    },
    statGridSmall: {
      flexDirection: 'row',
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.md,
    },
    statDivider: {
      width: 1,
      backgroundColor: Colors.border,
    },
    statNumber: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.primary,
    },
    statName: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: Spacing.sm,
      textAlign: 'center',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
    },
    footerText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
  });
