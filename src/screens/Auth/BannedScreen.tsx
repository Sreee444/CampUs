import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { BanAppealStatus, getLatestBanAppealStatus, submitBanAppeal } from '../../api/admin';
import { supabase } from '../../api/supabase';

export default function BannedScreen() {
  const { isDark } = useTheme();
  const { user, banReason, banUntil, banDuration, signOut } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [appealMessage, setAppealMessage] = React.useState('');
  const [contactPref, setContactPref] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [appealStatus, setAppealStatus] = React.useState<BanAppealStatus | null>(null);
  const [isLoadingAppeal, setIsLoadingAppeal] = React.useState(false);

  const untilText = banUntil ? new Date(banUntil).toLocaleString() : 'Permanent suspension';
  const durationText = banDuration || (banUntil ? 'Temporary suspension' : 'Permanent');
  const appealStatusKey = String(appealStatus?.status || '').toLowerCase();
  const hasOpenAppeal = Boolean(
    appealStatus?.id && appealStatusKey && appealStatusKey !== 'resolved' && appealStatusKey !== 'dismissed'
  );

  const loadAppealStatus = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoadingAppeal(true);
      const latest = await getLatestBanAppealStatus(user.id);
      setAppealStatus(latest);
    } catch {
      // Keep the screen functional if the appeal status fetch fails.
    } finally {
      setIsLoadingAppeal(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    loadAppealStatus();
  }, [loadAppealStatus]);

  React.useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`ban-appeals:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reports',
          filter: `reported_user_id=eq.${user.id}`,
        },
        () => {
          loadAppealStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadAppealStatus]);

  const appealStatusText =
    appealStatusKey === 'resolved'
      ? 'Resolved'
      : appealStatusKey === 'reviewing'
      ? 'Under Review'
      : appealStatusKey === 'pending'
      ? 'Pending'
      : 'No Appeal Yet';

  const statusTone =
    appealStatusKey === 'resolved'
      ? { bg: '#10b98120', text: '#10b981' }
      : appealStatusKey === 'reviewing'
      ? { bg: '#3b82f620', text: '#3b82f6' }
      : appealStatusKey === 'pending'
      ? { bg: '#f59e0b20', text: '#f59e0b' }
      : { bg: Colors.border, text: Colors.textSecondary };

  const handleSubmitAppeal = async () => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Session issue', text2: 'Please sign in again and retry.' });
      return;
    }
    if (!appealMessage.trim()) {
      Toast.show({ type: 'error', text1: 'Appeal message required', text2: 'Please explain your request.' });
      return;
    }
    if (!contactPref.trim()) {
      Toast.show({ type: 'error', text1: 'Contact details required', text2: 'Please add your email or phone.' });
      return;
    }
    if (hasOpenAppeal) {
      Toast.show({ type: 'info', text1: 'Appeal already submitted', text2: 'You already have an open appeal under review.' });
      return;
    }

    try {
      setIsSubmitting(true);
      await submitBanAppeal(user.id, appealMessage, contactPref.trim());
      setAppealMessage('');
      setContactPref('');
      await loadAppealStatus();
      Toast.show({
        type: 'success',
        text1: 'Appeal sent',
        text2: 'Admin/developer team will review your request.',
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to submit appeal', text2: error?.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.glowTopLeft} />
      <View style={styles.glowBottomRight} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.shell, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <View style={styles.heroRow}>
              <View style={styles.heroIconWrap}>
                <MaterialIcons name="gpp-bad" size={36} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, { color: Colors.textSecondary }]}>ACCESS RESTRICTED</Text>
                <Text style={[styles.title, { color: Colors.text }]}>Account Suspended</Text>
                <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>Your CAMPUS access is temporarily restricted.</Text>
              </View>
            </View>

            <View style={styles.statGrid}>
              <View style={[styles.statCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Reason</Text>
                <Text style={[styles.statValue, { color: Colors.text }]} numberOfLines={3}>
                  {banReason || 'Suspended by an administrator.'}
                </Text>
              </View>
              <View style={[styles.statCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Duration</Text>
                <Text style={[styles.statValue, { color: Colors.text }]}>{durationText}</Text>
              </View>
            </View>

            <View style={[styles.block, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
              <Text style={[styles.blockLabel, { color: Colors.textSecondary }]}>Suspension Ends</Text>
              <Text style={[styles.blockValue, { color: Colors.text }]}>{untilText}</Text>
            </View>

            <View style={[styles.block, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
              <View style={styles.statusHeaderRow}>
                <Text style={[styles.blockLabel, { color: Colors.textSecondary }]}>Appeal Status</Text>
                {isLoadingAppeal ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}> 
                    <Text style={[styles.statusPillText, { color: statusTone.text }]}>{appealStatusText}</Text>
                  </View>
                )}
              </View>

              {!!appealStatus?.action_taken && (
                <View style={[styles.feedbackCard, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <Text style={[styles.feedbackTitle, { color: Colors.textSecondary }]}>Admin Decision</Text>
                  <Text style={[styles.feedbackText, { color: Colors.text }]}>{appealStatus.action_taken}</Text>
                </View>
              )}

              {!!appealStatus?.reviewed_at && (
                <Text style={[styles.metaText, { color: Colors.textSecondary }]}>Reviewed on {new Date(appealStatus.reviewed_at).toLocaleString()}</Text>
              )}

              <Text style={[styles.metaText, { color: Colors.textSecondary }]}>Only one appeal request is allowed per account.</Text>
              <Text style={[styles.metaText, { color: Colors.textSecondary }]}>Appeal cooldown: 1 request every 2 days.</Text>
            </View>

            <View style={[styles.block, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
              <Text style={[styles.blockLabel, { color: Colors.textSecondary }]}>Contact Admin / Developer</Text>

              {hasOpenAppeal ? (
                <View style={[styles.lockedCard, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <MaterialIcons name="lock" size={18} color="#f59e0b" />
                  <Text style={[styles.lockedText, { color: Colors.text }]}>You already have an appeal under review. Please wait for admin response.</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.metaText, { color: Colors.textSecondary }]}>Submit one appeal with both details below (maximum 1 appeal in 2 days).</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.surface }]}
                    placeholder="Appeal message"
                    placeholderTextColor={Colors.textSecondary}
                    multiline
                    value={appealMessage}
                    onChangeText={setAppealMessage}
                  />
                  <TextInput
                    style={[styles.input, { color: Colors.text, borderColor: Colors.border, backgroundColor: Colors.surface }]}
                    placeholder="Your contact details (email/phone)"
                    placeholderTextColor={Colors.textSecondary}
                    value={contactPref}
                    onChangeText={setContactPref}
                  />

                  <TouchableOpacity
                    style={[styles.appealBtn, isSubmitting && styles.disabledBtn]}
                    onPress={handleSubmitAppeal}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <MaterialIcons name="send" size={16} color="#fff" />
                        <Text style={styles.appealBtnText}>Submit Appeal</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <MaterialIcons name="logout" size={18} color="#fff" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    glowTopLeft: {
      position: 'absolute',
      top: -40,
      left: -30,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(239, 68, 68, 0.13)',
    },
    glowBottomRight: {
      position: 'absolute',
      bottom: -55,
      right: -40,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: 'rgba(37, 99, 235, 0.12)',
    },
    scrollContent: {
      padding: Spacing.lg,
      flexGrow: 1,
      justifyContent: 'center',
    },
    shell: {
      borderWidth: 1,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      gap: 12,
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
    },
    heroRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    heroIconWrap: {
      width: 58,
      height: 58,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    kicker: {
      fontSize: 11,
      letterSpacing: 0.7,
      fontWeight: FontWeights.bold,
      marginBottom: 2,
    },
    title: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: FontSizes.sm,
    },
    statGrid: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    statCard: {
      flexGrow: 1,
      minWidth: 150,
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: 10,
      gap: 4,
    },
    statLabel: {
      fontSize: FontSizes.xs,
      textTransform: 'uppercase',
      fontWeight: FontWeights.medium,
    },
    statValue: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    block: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: 12,
      gap: 6,
    },
    blockLabel: {
      fontSize: FontSizes.xs,
      textTransform: 'uppercase',
      fontWeight: FontWeights.medium,
    },
    blockValue: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    statusHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    statusPill: {
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: FontWeights.bold,
    },
    feedbackCard: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      padding: 10,
      gap: 4,
    },
    feedbackTitle: {
      fontSize: FontSizes.xs,
      textTransform: 'uppercase',
      fontWeight: FontWeights.medium,
    },
    feedbackText: {
      fontSize: FontSizes.sm,
      lineHeight: 20,
    },
    metaText: {
      fontSize: FontSizes.xs,
      lineHeight: 18,
    },
    lockedCard: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    lockedText: {
      flex: 1,
      fontSize: FontSizes.sm,
      lineHeight: 20,
      fontWeight: FontWeights.medium,
    },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: FontSizes.sm,
      textAlignVertical: 'top',
      minHeight: 46,
      marginTop: 2,
    },
    appealBtn: {
      marginTop: 6,
      backgroundColor: '#2563eb',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    disabledBtn: {
      opacity: 0.7,
    },
    appealBtnText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
    signOutBtn: {
      marginTop: 4,
      alignSelf: 'center',
      backgroundColor: '#ef4444',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    signOutText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
  });
