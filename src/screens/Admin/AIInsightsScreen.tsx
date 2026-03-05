import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { predictEngagementRisk, scoreDiscussionQuality } from '../../api/ai';
import { getDiscussionTopics } from '../../api/discussions';
import Toast from 'react-native-toast-message';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminFilterChips from '../../components/admin/AdminFilterChips';

export default function AIInsightsScreen() {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [riskUsers, setRiskUsers] = useState<any[]>([]);
  const [discussionScores, setDiscussionScores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'engagement' | 'discussions'>('engagement');

  useEffect(() => {
    loadAIInsights();
  }, []);

  const loadAIInsights = async () => {
    try {
      setIsLoading(true);

      // Get engagement risk predictions
      const riskData = await predictEngagementRisk();
      setRiskUsers(riskData);

      // Get discussion quality scores
      const discussions = await getDiscussionTopics();
      if (discussions && discussions.length > 0) {
        const scores = await Promise.all(
          discussions.slice(0, 5).map((discussion) =>
            scoreDiscussionQuality(discussion.id)
          )
        );
        setDiscussionScores(scores.filter((s) => s !== null));
      }
    } catch (error) {
      console.error('Error loading AI insights:', error);
      Toast.show({ type: 'error', text1: 'Failed to load insights' });
    } finally {
      setIsLoading(false);
    }
  };

  const renderEngagementRiskCard = ({ item }: { item: any }) => {
    const riskColor =
      item.riskLevel === 'high' ? '#ef4444' : item.riskLevel === 'medium' ? '#f59e0b' : '#10b981';

    return (
      <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.riskBadge,
              {
                backgroundColor: riskColor + '20',
                borderLeftColor: riskColor,
              },
            ]}
          >
            <MaterialIcons name={
              item.riskLevel === 'high' ? 'warning' : 'info'
            } size={16} color={riskColor} />
            <Text style={[styles.riskLevel, { color: riskColor }]}>
              {item.riskLevel.toUpperCase()} RISK
            </Text>
          </View>
          <Text style={styles.engagementScore}>{item.engagementScore}/100</Text>
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metric}>
            <MaterialIcons name="edit" size={14} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{item.metrics.posts} posts</Text>
          </View>
          <View style={styles.metric}>
            <MaterialIcons name="chat" size={14} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{item.metrics.messages} messages</Text>
          </View>
          <View style={styles.metric}>
            <MaterialIcons name="event" size={14} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{item.metrics.eventsAttended} events</Text>
          </View>
        </View>

        {item.lastActivity && (
          <Text style={styles.lastActive}>
            Last active: {Math.round((Date.now() - new Date(item.lastActivity).getTime()) / (1000 * 60 * 60))}h ago
          </Text>
        )}
      </View>
    );
  };

  const renderDiscussionCard = ({ item }: { item: any }) => {
    const qualityLevel =
      item.qualityScore >= 75 ? 'excellent' : item.qualityScore >= 50 ? 'good' : 'needs improvement';
    const qualityColor =
      qualityLevel === 'excellent' ? '#10b981' : qualityLevel === 'good' ? '#3b82f6' : '#f59e0b';

    return (
      <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.discussionId}>{item.discussionId}</Text>
          </View>
          <View
            style={[
              styles.qualityBadge,
              { backgroundColor: qualityColor + '20' },
            ]}
          >
            <Text style={[styles.qualityText, { color: qualityColor }]}>
              {item.qualityScore}
            </Text>
          </View>
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metric}>
            <MaterialIcons name="comment" size={14} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{item.replyCount} replies</Text>
          </View>
          <View style={styles.metric}>
            <MaterialIcons name="favorite" size={14} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{item.avgEngagement} avg likes</Text>
          </View>
          <View style={styles.metric}>
            <MaterialIcons name="timeline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metricText}>{item.daysSinceLastReply}d ago</Text>
          </View>
        </View>

        <View
          style={[
            styles.sentimentBadge,
            {
              backgroundColor:
                item.sentiment === 'positive'
                  ? '#dcfce7'
                  : item.sentiment === 'negative'
                  ? '#fee2e2'
                  : '#f3f4f6',
            },
          ]}
        >
          <MaterialIcons
            name={
              item.sentiment === 'positive'
                ? 'sentiment-satisfied'
                : item.sentiment === 'negative'
                ? 'sentiment-dissatisfied'
                : 'sentiment-neutral'
            }
            size={14}
            color={
              item.sentiment === 'positive'
                ? '#10b981'
                : item.sentiment === 'negative'
                ? '#ef4444'
                : '#9ca3af'
            }
          />
          <Text style={styles.sentimentText}>{item.sentiment} sentiment</Text>
        </View>

        {item.recommendations && item.recommendations.length > 0 && (
          <View style={styles.recommendationsContainer}>
            {item.recommendations.map((rec: string, idx: number) => (
              <Text key={idx} style={styles.recommendation}>
                💡 {rec}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <AdminHeader
          title="AI Insights"
          subtitle="Community health and quality signals"
          onRefresh={loadAIInsights}
        />

        <AdminFilterChips<'engagement' | 'discussions'>
          selected={selectedTab}
          onSelect={setSelectedTab}
          options={[
            { label: 'Engagement', value: 'engagement', count: riskUsers.length },
            { label: 'Discussions', value: 'discussions', count: discussionScores.length },
          ]}
        />

        {/* Content */}
        <View style={styles.content}>
          {selectedTab === 'engagement' ? (
            <>
              <Text style={styles.sectionTitle}>Users at Risk</Text>
              {riskUsers.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="trending-up" size={48} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>All users are engaged!</Text>
                </View>
              ) : (
                <FlatList
                  data={riskUsers}
                  renderItem={renderEngagementRiskCard}
                  keyExtractor={(item, idx) => idx.toString()}
                  scrollEnabled={false}
                  contentContainerStyle={styles.listContainer}
                />
              )}
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Discussion Quality</Text>
              {discussionScores.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="forum" size={48} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>No discussions to analyze</Text>
                </View>
              ) : (
                <FlatList
                  data={discussionScores}
                  renderItem={renderDiscussionCard}
                  keyExtractor={(item, idx) => idx.toString()}
                  scrollEnabled={false}
                  contentContainerStyle={styles.listContainer}
                />
              )}
            </>
          )}
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
    content: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.md,
    },
    listContainer: {
      gap: Spacing.md,
    },
    card: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    riskBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      borderLeftWidth: 3,
      flex: 1,
    },
    riskLevel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
    },
    engagementScore: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    metricsContainer: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    metric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.background,
      flex: 1,
    },
    metricText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    lastActive: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontStyle: 'italic',
    },
    discussionId: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    qualityBadge: {
      width: 48,
      height: 48,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qualityText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
    },
    sentimentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.md,
    },
    sentimentText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      textTransform: 'capitalize',
    },
    recommendationsContainer: {
      gap: Spacing.sm,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    recommendation: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      lineHeight: 16,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: Spacing.xxl,
      gap: Spacing.md,
    },
    emptyText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
  });
