import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { UserAvatar } from '../../components/UserAvatar';
import { updateMentorshipRequestStatus } from '../../api/mentors';
import { ensureMentorshipChat } from '../../api/mentorshipChat';

type Nav = StackNavigationProp<RootStackParamList, 'MentorshipRequestDetails'>;
type Route = RouteProp<RootStackParamList, 'MentorshipRequestDetails'>;

const PURPOSE_LABELS: Record<string, string> = {
  career: 'Career',
  academic: 'Academic',
  skill: 'Skill',
  project: 'Project',
  startup: 'Startup',
};

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: '#fef3c7', text: '#b45309' },
  accepted: { label: 'Active', bg: '#dcfce7', text: '#166534' },
  rejected: { label: 'Rejected', bg: '#fee2e2', text: '#b91c1c' },
  closed: { label: 'Closed', bg: '#e5e7eb', text: '#4b5563' },
};

function formatDate(input?: string) {
  if (!input) return 'Unknown date';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function MentorshipRequestDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { isDark } = useTheme();
  useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const { request, viewer } = route.params;
  const [isUpdating, setIsUpdating] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  const status = request?.status || 'pending';
  const statusMeta = STATUS_META[status] || STATUS_META.pending;
  const purposeLabel = PURPOSE_LABELS[request?.purpose] || request?.purpose || 'Mentorship';

  const counterpart = useMemo(() => {
    if (viewer === 'mentor') {
      return {
        id: request?.mentee?.id || request?.mentee_id,
        name: request?.mentee?.full_name || 'Student',
        subtitle: request?.mentee?.department || request?.mentee?.role || 'Mentee',
        avatar: request?.mentee?.avatar_url,
      };
    }
    return {
      id: request?.mentor?.profile?.id,
      name: request?.mentor?.profile?.full_name || 'Mentor',
      subtitle: request?.mentor?.role || request?.mentor?.profile?.department || 'Mentor',
      avatar: request?.mentor?.profile?.avatar_url,
    };
  }, [request, viewer]);

  const withConfirm = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ]);
  };

  const handleUpdateStatus = async (nextStatus: 'accepted' | 'rejected' | 'closed') => {
    if (!request?.id) return;
    try {
      setIsUpdating(true);
      await updateMentorshipRequestStatus(request.id, nextStatus);
      Toast.show({
        type: nextStatus === 'accepted' ? 'success' : 'info',
        text1:
          nextStatus === 'accepted'
            ? 'Request accepted'
            : nextStatus === 'rejected'
              ? 'Request updated'
              : 'Mentorship closed',
      });
      navigation.goBack();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Action failed', text2: e?.message || 'Try again' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenChat = async () => {
    if (!request?.id || request?.purpose === 'project') return;
    try {
      setIsOpeningChat(true);
      const mentorUserId = request?.mentor?.profile?.id;
      const menteeUserId = request?.mentee_id || request?.mentee?.id;
      if (!mentorUserId || !menteeUserId) throw new Error('Missing chat participants');
      const chatId = await ensureMentorshipChat(request.id, mentorUserId, menteeUserId);
      navigation.navigate('MentorshipChat', { chatId });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not open chat', text2: e?.message || 'Try again' });
    } finally {
      setIsOpeningChat(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.gradientBg}
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardPillsRow}>
              <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
                <Text style={[styles.statusPillText, { color: statusMeta.text }]}>{statusMeta.label}</Text>
              </View>
              <View style={styles.purposePill}>
                <Text style={styles.purposePillText}>{purposeLabel}</Text>
              </View>
            </View>
            <Text style={styles.metaText}>Request</Text>
          </View>

          <TouchableOpacity
            style={styles.userRow}
            onPress={() => counterpart.id && navigation.navigate('PublicProfile', { userId: counterpart.id })}
            activeOpacity={0.8}
          >
            <UserAvatar uri={counterpart.avatar} name={counterpart.name} size={50} showRing={false} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{counterpart.name}</Text>
              <Text style={styles.subtitle}>{counterpart.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.metaStack}>
            <View style={styles.metaItem}>
              <MaterialIcons name="schedule" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>Requested: {formatDate(request?.created_at)}</Text>
            </View>
            {request?.project_id ? (
              <TouchableOpacity
                style={[styles.metaItem, styles.metaItemAction]}
                onPress={() => navigation.navigate('ProjectDetails', { teamId: request.project_id })}
              >
                <MaterialIcons name="folder" size={14} color="#4f46e5" />
                <Text style={[styles.metaText, { color: '#4f46e5' }]}>Open Project</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Message</Text>
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{request?.description || 'No message provided.'}</Text>
          </View>

          {status === 'accepted' && request?.purpose !== 'project' && (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.fullWidthBtn, isOpeningChat && { opacity: 0.6 }]}
              onPress={handleOpenChat}
              disabled={isOpeningChat}
            >
              {isOpeningChat ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="chat" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Open Chat</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {viewer === 'mentor' && status === 'pending' && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isUpdating && { opacity: 0.6 }]}
                onPress={() => withConfirm('Decline request?', 'This request will be marked as declined.', () => handleUpdateStatus('rejected'))}
                disabled={isUpdating}
              >
                <Text style={styles.secondaryBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isUpdating && { opacity: 0.6 }]}
                onPress={() => handleUpdateStatus('accepted')}
                disabled={isUpdating}
              >
                {isUpdating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Accept</Text>}
              </TouchableOpacity>
            </View>
          )}

          {viewer === 'mentee' && status === 'pending' && (
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.fullWidthBtn, isUpdating && { opacity: 0.6 }]}
              onPress={() => withConfirm('Cancel request?', 'You can send a new request later.', () => handleUpdateStatus('rejected'))}
              disabled={isUpdating}
            >
              {isUpdating ? <ActivityIndicator size="small" color={Colors.text} /> : <Text style={styles.secondaryBtnText}>Cancel Request</Text>}
            </TouchableOpacity>
          )}

          {status === 'accepted' && (
            <TouchableOpacity
              style={[styles.dangerBtn, styles.fullWidthBtn, isUpdating && { opacity: 0.6 }]}
              onPress={() => withConfirm('End mentorship?', 'This mentorship will be moved to closed.', () => handleUpdateStatus('closed'))}
              disabled={isUpdating}
            >
              {isUpdating ? <ActivityIndicator size="small" color="#dc2626" /> : <Text style={styles.dangerBtnText}>End Mentorship</Text>}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    gradientBg: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 12,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      borderRadius: 20,
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.text },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 12, paddingBottom: 28, paddingTop: 12 },
    card: {
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      borderRadius: 20,
      padding: 12,
      gap: 14,
      marginBottom: 16,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    statusPillText: { fontSize: 11, fontWeight: '700' },
    purposePill: { backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    purposePillText: { fontSize: 11, fontWeight: '700', color: '#4338ca' },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    name: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.text },
    subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary },
    metaStack: { gap: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaItemAction: {
      borderWidth: 1,
      borderColor: '#c7d2fe',
      borderRadius: 999,
      backgroundColor: '#eef2ff',
      paddingHorizontal: 8,
      paddingVertical: 5,
      alignSelf: 'flex-start',
    },
    metaText: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: '600' },
    sectionTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.text },
    messageBox: {
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      borderRadius: BorderRadius.md,
      backgroundColor: 'transparent',
      padding: 11,
    },
    messageText: { fontSize: FontSizes.sm, color: Colors.text, lineHeight: 20 },
    actionRow: { flexDirection: 'row', gap: 10 },
    fullWidthBtn: { width: '100%' },
    primaryBtn: {
      flex: 1,
      height: 44,
      borderRadius: BorderRadius.md,
      backgroundColor: '#4f46e5',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    primaryBtnText: { color: '#fff', fontWeight: FontWeights.bold, fontSize: FontSizes.sm },
    secondaryBtn: {
      flex: 1,
      height: 44,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { color: Colors.text, fontWeight: FontWeights.semibold, fontSize: FontSizes.sm },
    dangerBtn: {
      height: 44,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: '#fca5a5',
      backgroundColor: '#fff1f2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerBtnText: { color: '#dc2626', fontWeight: FontWeights.semibold, fontSize: FontSizes.sm },
  });