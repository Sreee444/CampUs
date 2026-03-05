import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getEngagementMetrics, EngagementMetrics, TimeRange } from '../../api/admin';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminFilterChips from '../../components/admin/AdminFilterChips';

const TIME_RANGE_TABS: { label: string; value: TimeRange }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
];

export default function AdminAnalyticsScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const loadMetrics = useCallback(async (range: TimeRange) => {
    setIsLoading(true);
    try {
      const data = await getEngagementMetrics(range);
      setMetrics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadMetrics(timeRange); }, [timeRange]);

  const roleColors: Record<string, string> = {
    student: '#3b82f6',
    faculty: '#10b981',
    alumni: '#f59e0b',
    admin: '#8b5cf6',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="Analytics"
        subtitle="Usage, growth and engagement trends"
        onBack={() => navigation.goBack()}
        onRefresh={() => loadMetrics(timeRange)}
      />

      <AdminFilterChips<TimeRange>
        selected={timeRange}
        onSelect={setTimeRange}
        options={TIME_RANGE_TABS.map((tab) => ({ label: tab.label, value: tab.value }))}
      />

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>Loading analytics…</Text>
          {/* Skeleton cards */}
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: Colors.surface }]} />
          ))}
        </View>
      ) : metrics ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Static Totals */}
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>Platform Overview</Text>
          <View style={styles.grid2}>
            {[
              { label: 'Total Users', value: metrics.totalUsers, icon: 'people', color: '#3b82f6' },
              { label: 'Total Events', value: metrics.totalEvents, icon: 'event', color: '#f59e0b' },
              { label: 'Total Posts', value: metrics.totalPosts, icon: 'article', color: '#10b981' },
              { label: 'Project Teams', value: metrics.totalTeams, icon: 'groups', color: '#8b5cf6' },
            ].map((item) => (
              <View key={item.label} style={[styles.statCard, { backgroundColor: Colors.surface, borderLeftColor: item.color }]}>
                <View style={[styles.statIcon, { backgroundColor: item.color + '20' }]}>
                  <MaterialIcons name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text style={[styles.statValue, { color: Colors.text }]}>{item.value}</Text>
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Time-range sensitive */}
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>
            Activity ({timeRange === '7d' ? 'Last 7 Days' : timeRange === '30d' ? 'Last 30 Days' : 'Last 90 Days'})
          </Text>
          <View style={styles.grid2}>
            {[
              { label: 'Messages Sent', value: metrics.recentMessages, color: '#3b82f6', icon: 'message' },
              { label: 'New Posts', value: metrics.recentPosts, color: '#10b981', icon: 'article' },
              { label: 'New Registrations', value: metrics.recentRegistrations, color: '#f59e0b', icon: 'how-to-reg' },
              { label: 'New Users', value: metrics.newUsers, color: '#ec4899', icon: 'person-add' },
            ].map((item) => (
              <View key={item.label} style={[styles.statCard, { backgroundColor: Colors.surface, borderLeftColor: item.color }]}>
                <View style={[styles.statIcon, { backgroundColor: item.color + '20' }]}>
                  <MaterialIcons name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text style={[styles.statValue, { color: Colors.text }]}>{item.value}</Text>
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* User Distribution */}
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>User Distribution</Text>
          <View style={[styles.card, { backgroundColor: Colors.surface }]}>
            {Object.entries(metrics.usersByRole).map(([role, count]) => {
              const pct = metrics.totalUsers > 0 ? Math.round((count / metrics.totalUsers) * 100) : 0;
              const color = roleColors[role] ?? '#94a3b8';
              return (
                <View key={role} style={styles.barRow}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <Text style={[styles.barLabel, { color: Colors.text }]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: Colors.border }]}>
                    <View style={[styles.barFill, { width: `${Math.max(pct, 3)}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={[styles.barStat, { color: Colors.textSecondary }]}>{count} ({pct}%)</Text>
                </View>
              );
            })}
          </View>

          {/* Computed ratios */}
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>Engagement Ratios</Text>
          <View style={[styles.ratioRow, { backgroundColor: Colors.surface }]}>
            {[
              { label: 'Posts/User', value: (metrics.totalPosts / Math.max(metrics.totalUsers, 1)).toFixed(1) },
              { label: 'Msgs/Day', value: (metrics.recentMessages / (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90)).toFixed(1) },
              { label: 'Teams/Event', value: (metrics.totalTeams / Math.max(metrics.totalEvents, 1)).toFixed(1) },
            ].map((r, i) => (
              <React.Fragment key={r.label}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: Colors.border }]} />}
                <View style={styles.ratioItem}>
                  <Text style={[styles.ratioValue, { color: Colors.primary }]}>{r.value}</Text>
                  <Text style={[styles.ratioLabel, { color: Colors.textSecondary }]}>{r.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <View style={styles.footer}>
            <MaterialIcons name="access-time" size={14} color={Colors.textSecondary} />
            <Text style={[styles.footerText, { color: Colors.textSecondary }]}>
              Updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}
            </Text>
          </View>
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
    loadingWrap: { flex: 1, alignItems: 'center', paddingTop: Spacing.xl, gap: 12 },
    loadingText: { fontSize: FontSizes.sm, marginBottom: 12 },
    skeletonCard: { width: '90%', height: 70, borderRadius: BorderRadius.lg, opacity: 0.4 },
    scroll: { flex: 1, padding: Spacing.md },
    sectionTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: 10, marginTop: 14 },
    grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    statCard: { flex: 0.48, borderRadius: BorderRadius.lg, borderLeftWidth: 4, padding: 12, gap: 4 },
    statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    statValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
    statLabel: { fontSize: FontSizes.xs },
    card: { borderRadius: BorderRadius.lg, padding: 14, gap: 12, marginBottom: 4 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    colorDot: { width: 10, height: 10, borderRadius: 5 },
    barLabel: { width: 64, fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
    barTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 6 },
    barStat: { fontSize: FontSizes.xs, width: 68, textAlign: 'right' },
    ratioRow: { flexDirection: 'row', borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: 4 },
    ratioItem: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    divider: { width: 1 },
    ratioValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
    ratioLabel: { fontSize: FontSizes.xs, marginTop: 4, textAlign: 'center' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 14 },
    footerText: { fontSize: FontSizes.xs },
  });
