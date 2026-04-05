import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getEngagementMetrics, getPendingAppealsCount } from '../../api/admin';
import { supabase } from '../../api/supabase';
import Loader from '../../components/Loader';
import AdminHeader from '../../components/admin/AdminHeader';

type AdminDashboardScreenNavigationProp = StackNavigationProp<RootStackParamList>;

type ModuleItem = {
  title: string;
  icon: string;
  description: string;
  screen: keyof RootStackParamList | string;
  color: string;
};

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminDashboardScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [metrics, setMetrics] = useState<any>(null);
  const [pendingAppeals, setPendingAppeals] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadInProgressRef = useRef(false);
  const queuedReloadRef = useRef(false);
  const mountedRef = useRef(true);
  const hasLoadedOnceRef = useRef(false);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, []);

  const loadMetrics = useCallback(async () => {
    if (loadInProgressRef.current) {
      queuedReloadRef.current = true;
      return;
    }

    loadInProgressRef.current = true;
    const firstLoad = !hasLoadedOnceRef.current;
    try {
      if (mountedRef.current) {
        if (firstLoad) setIsInitialLoading(true);
        else setIsRefreshing(true);
      }
      const [data, appealCount] = await Promise.all([
        getEngagementMetrics(),
        getPendingAppealsCount(),
      ]);
      if (mountedRef.current) {
        setMetrics(data);
        setPendingAppeals(appealCount);
      }
      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      if (mountedRef.current) {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
      loadInProgressRef.current = false;
      if (queuedReloadRef.current) {
        queuedReloadRef.current = false;
        loadMetrics();
      }
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useFocusEffect(
    useCallback(() => {
      loadMetrics();
    }, [loadMetrics])
  );

  useEffect(() => {
    const triggerRealtimeRefresh = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        loadMetrics();
      }, 450);
    };

    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, triggerRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, triggerRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, triggerRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_teams' }, triggerRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, triggerRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_registrations' }, triggerRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, triggerRealtimeRefresh)
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadMetrics]);

  const coreModules: ModuleItem[] = [
    {
      title: 'User Management',
      icon: 'people',
      description: 'Roles, bans, and access operations',
      screen: 'AdminUsers',
      color: '#3b82f6',
    },
    {
      title: 'Add User',
      icon: 'person-add',
      description: 'Create accounts with default password',
      screen: 'AdminAddUser',
      color: '#2563eb',
    },
    {
      title: 'Content Moderation',
      icon: 'fact-check',
      description: 'Approve and reject feed content',
      screen: 'AdminModeration',
      color: '#10b981',
    },
    {
      title: 'Reports Center',
      icon: 'warning',
      description: 'Escalations and abuse handling',
      screen: 'AdminReports',
      color: '#ef4444',
    },
    {
      title: 'Discussion Control',
      icon: 'forum',
      description: 'Pin and lock discussions',
      screen: 'AdminDiscussions',
      color: '#8b5cf6',
    },
    {
      title: 'InterCampus Management',
      icon: 'public',
      description: 'External event moderation suite',
      screen: 'AdminInterCampusManagement',
      color: '#0f766e',
    },
  ];

  const intelligenceModules: ModuleItem[] = [
    {
      title: 'Broadcast Studio',
      icon: 'campaign',
      description: 'Send announcements by audience',
      screen: 'AdminBroadcast',
      color: '#f59e0b',
    },
    {
      title: 'Analytics',
      icon: 'bar-chart',
      description: 'Platform engagement and usage',
      screen: 'AdminAnalytics',
      color: '#06b6d4',
    },
    {
      title: 'AI Insights',
      icon: 'auto-awesome',
      description: 'Risk and quality signal analysis',
      screen: 'AIInsights',
      color: '#ec4899',
    },
    {
      title: 'Audit Log',
      icon: 'history',
      description: 'Trace every admin action',
      screen: 'AdminAudit',
      color: '#64748b',
    },
  ];

  const quickActions = [
    { label: 'Open Users', icon: 'manage-accounts', screen: 'AdminUsers' },
    { label: pendingAppeals > 0 ? `Appeals (${pendingAppeals})` : 'View Reports', icon: 'report-problem', screen: 'AdminReports' },
    { label: 'Broadcast', icon: 'notifications-active', screen: 'AdminBroadcast' },
    { label: 'Audit', icon: 'rule-folder', screen: 'AdminAudit' },
  ];

  const handleNavigate = (item: ModuleItem) => {
    navigation.navigate(item.screen as any);
  };

  const roleBreakdown = useMemo(() => {
    if (!metrics?.usersByRole || !metrics?.totalUsers) return [];
    const entries = Object.entries(metrics.usersByRole) as Array<[string, number]>;
    return entries.map(([role, count]) => ({
      role,
      count,
      percent: Math.round((count / Math.max(metrics.totalUsers, 1)) * 100),
    }));
  }, [metrics]);

  if (isInitialLoading || !metrics) {
    return <Loader />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="Admin Command Center"
        subtitle="Operations, moderation, and intelligence modules"
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.navigate('MainTabs', { screen: 'Home' });
        }}
        onRefresh={loadMetrics}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={[styles.heroCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.heroKicker, { color: Colors.textSecondary }]}>SYSTEM STATUS</Text>
              <Text style={[styles.heroTitle, { color: Colors.text }]}>All admin systems are active</Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          {isRefreshing && (
            <View style={styles.inlineRefreshRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={[styles.inlineRefreshText, { color: Colors.textSecondary }]}>Refreshing live metrics...</Text>
            </View>
          )}

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
              <Text style={[styles.statValue, { color: '#3b82f6' }]}>{metrics.totalUsers}</Text>
              <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Users</Text>
            </View>
            <View style={[styles.statCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
              <Text style={[styles.statValue, { color: '#10b981' }]}>{metrics.totalPosts}</Text>
              <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Posts</Text>
            </View>
            <View style={[styles.statCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
              <Text style={[styles.statValue, { color: '#f59e0b' }]}>{metrics.totalEvents}</Text>
              <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Events</Text>
            </View>
            <View style={[styles.statCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
              <Text style={[styles.statValue, { color: '#8b5cf6' }]}>{metrics.totalProjects ?? metrics.totalTeams ?? 0}</Text>
              <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Projects</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: Colors.text }]}>Quick Actions</Text>
            {isRefreshing && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          <View style={styles.quickGrid}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.quickActionCard,
                  {
                    backgroundColor: Colors.surface,
                    borderColor: Colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => navigation.navigate(action.screen as any)}
                hitSlop={6}
              >
                <MaterialIcons name={action.icon as any} size={18} color={Colors.primary} />
                <Text style={[styles.quickLabel, { color: Colors.text }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: Colors.text }]}>Role Distribution</Text>
            {isRefreshing && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          <View style={[styles.distributionCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            {roleBreakdown.map((item) => (
              <View key={item.role} style={styles.distributionItem}>
                <Text style={[styles.distributionRole, { color: Colors.text }]}>
                  {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
                </Text>
                <View style={[styles.distributionBar, { backgroundColor: Colors.border }]}>
                  <View style={[styles.distributionFill, { width: `${Math.max(item.percent, 4)}%` }]} />
                </View>
                <Text style={[styles.distributionCount, { color: Colors.textSecondary }]}>
                  {item.count} ({item.percent}%)
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: Colors.text }]}>Management Modules</Text>
            {isRefreshing && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          <View style={styles.menuGrid}>
            {coreModules.map((item) => (
              <Pressable
                key={item.title}
                style={({ pressed }) => [
                  styles.menuCard,
                  {
                    backgroundColor: Colors.surface,
                    borderColor: Colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => handleNavigate(item)}
                hitSlop={6}
              >
                <View style={[styles.iconContainer, { backgroundColor: item.color + '18' }]}>
                  <MaterialIcons name={item.icon as any} size={24} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuTitle, { color: Colors.text }]}>{item.title}</Text>
                  <Text style={[styles.menuDescription, { color: Colors.textSecondary }]}>{item.description}</Text>
                </View>
                <MaterialIcons name="arrow-forward" size={18} color={Colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: Colors.text }]}>Intelligence and Communications</Text>
            {isRefreshing && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          <View style={styles.menuGrid}>
            {intelligenceModules.map((item) => (
              <Pressable
                key={item.title}
                style={({ pressed }) => [
                  styles.menuCard,
                  {
                    backgroundColor: Colors.surface,
                    borderColor: Colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => handleNavigate(item)}
                hitSlop={6}
              >
                <View style={[styles.iconContainer, { backgroundColor: item.color + '18' }]}>
                  <MaterialIcons name={item.icon as any} size={24} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuTitle, { color: Colors.text }]}>{item.title}</Text>
                  <Text style={[styles.menuDescription, { color: Colors.textSecondary }]}>{item.description}</Text>
                </View>
                <MaterialIcons name="arrow-forward" size={18} color={Colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    heroCard: {
      marginHorizontal: Spacing.md,
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    heroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    heroKicker: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      letterSpacing: 0.7,
      marginBottom: 3,
    },
    heroTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#dcfce7',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#16a34a',
    },
    liveText: {
      fontSize: 11,
      color: '#166534',
      fontWeight: FontWeights.bold,
      letterSpacing: 0.4,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    inlineRefreshRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inlineRefreshText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    statCard: {
      width: '48%',
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingVertical: 10,
      alignItems: 'center',
    },
    statValue: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
    },
    statLabel: {
      fontSize: FontSizes.xs,
      marginTop: 2,
    },
    section: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.lg,
    },
    sectionTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      marginBottom: Spacing.sm,
    },
    sectionHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    quickActionCard: {
      width: '48%',
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingVertical: 12,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    quickLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    distributionCard: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    distributionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    distributionRole: {
      width: 74,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    distributionBar: {
      flex: 1,
      height: 10,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },
    distributionFill: {
      height: '100%',
      backgroundColor: '#0ea5e9',
      borderRadius: BorderRadius.full,
    },
    distributionCount: {
      width: 74,
      textAlign: 'right',
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    menuGrid: {
      gap: Spacing.sm,
    },
    menuCard: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      marginBottom: 1,
    },
    menuDescription: {
      fontSize: FontSizes.xs,
    },
  });
