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
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getEngagementMetrics } from '../../api/admin';
import Loader from '../../components/Loader';

type AdminDashboardScreenNavigationProp = StackNavigationProp<RootStackParamList>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<AdminDashboardScreenNavigationProp>();
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
      console.error('Error loading metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const adminMenuItems = [
    {
      title: 'User Management',
      icon: 'people',
      description: 'Manage users, roles & bans',
      screen: 'AdminUsers',
      color: '#3b82f6',
    },
    {
      title: 'Moderate Content',
      icon: 'fact-check',
      description: 'Approve/reject posts',
      screen: 'AdminModeration',
      color: '#10b981',
    },
    {
      title: 'Reports & Bans',
      icon: 'warning',
      description: 'View reports & actions',
      screen: 'AdminReports',
      color: '#ef4444',
    },
    {
      title: 'Discussions',
      icon: 'forum',
      description: 'Moderate discussions',
      screen: 'AdminDiscussions',
      color: '#8b5cf6',
    },
    {
      title: 'Broadcast',
      icon: 'notification-important',
      description: 'Send announcements',
      screen: 'AdminBroadcast',
      color: '#f59e0b',
    },
    {
      title: 'Analytics',
      icon: 'show-chart',
      description: 'Engagement metrics',
      screen: 'AdminAnalytics',
      color: '#06b6d4',
    },
    {
      title: 'AI Insights',
      icon: 'auto-awesome',
      description: 'Engagement & quality analysis',
      screen: 'AIInsights',
      color: '#ec4899',
    },
    {
      title: 'Audit Log',
      icon: 'history',
      description: 'Admin actions & changes',
      screen: 'AdminAudit',
      color: '#64748b',
    },
  ];

  const handleNavigate = (screen: string) => {
    navigation.navigate(screen as any);
  };

  if (isLoading || !metrics) {
    return <Loader />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>Campus Management Center</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.statValue}>{metrics.totalUsers}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#10b981' }]}>
            <Text style={styles.statValue}>{metrics.totalPosts}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.statValue}>{metrics.totalEvents}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={styles.statValue}>{metrics.totalTeams}</Text>
            <Text style={styles.statLabel}>Teams</Text>
          </View>
        </View>

        {/* User Distribution */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Distribution</Text>
          <View style={styles.distributionList}>
            {Object.entries(metrics.usersByRole).map(([role, count]: [string, any]) => (
              <View key={role} style={styles.distributionItem}>
                <Text style={styles.distributionRole}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
                <View style={styles.distributionBar}>
                  <View
                    style={[
                      styles.distributionFill,
                      { width: `${Math.min((count / metrics.totalUsers) * 100, 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>{count}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <View style={styles.menuGrid}>
            {adminMenuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuCard}
                onPress={() => handleNavigate(item.screen)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                  <MaterialIcons name={item.icon as any} size={28} color={item.color} />
                </View>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuDescription}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: Spacing.xxl }} />
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
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    title: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: Spacing.md,
      gap: Spacing.md,
    },
    statCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      borderLeftWidth: 4,
      padding: Spacing.md,
      alignItems: 'center',
    },
    statValue: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    section: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.md,
    },
    distributionList: {
      gap: Spacing.md,
    },
    distributionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    distributionRole: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      width: 70,
    },
    distributionBar: {
      flex: 1,
      height: 8,
      backgroundColor: Colors.border,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },
    distributionFill: {
      height: '100%',
      backgroundColor: '#3b82f6',
    },
    distributionCount: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      width: 30,
      textAlign: 'right',
    },
    menuGrid: {
      gap: Spacing.md,
    },
    menuCard: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      flex: 1,
    },
    menuDescription: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
  });
