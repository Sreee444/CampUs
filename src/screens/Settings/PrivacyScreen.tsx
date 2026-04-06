import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile } from '../../api/auth';

type PrivacyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Privacy'>;

export default function PrivacyScreen() {
  const navigation = useNavigation<PrivacyScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });
  const [allowMessages, setAllowMessages] = useState(profile?.chat_enabled !== false);
  const [isSavingMessages, setIsSavingMessages] = useState(false);

  React.useEffect(() => {
    setAllowMessages(profile?.chat_enabled !== false);
  }, [profile?.chat_enabled]);

  const handleMessagesToggle = async (value: boolean) => {
    const userId = user?.id || profile?.id;
    if (!userId) return;

    const previous = allowMessages;
    setAllowMessages(value);
    setIsSavingMessages(true);

    try {
      await updateProfile(userId, { chat_enabled: value });
      await refreshProfile();
      setToast({
        visible: true,
        message: `Messages ${value ? 'enabled' : 'disabled'}`,
        type: 'success',
      });
    } catch (error: any) {
      setAllowMessages(previous);
      setToast({
        visible: true,
        message: error?.message || 'Failed to update privacy setting',
        type: 'error',
      });
    } finally {
      setIsSavingMessages(false);
    }
  };

  const handleDownloadData = () => {
    setToast({ visible: true, message: 'Data export is managed by admin support.', type: 'info' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <MaterialIcons name="lock-outline" size={20} color={Colors.primary} />
          <Text style={styles.infoText}>
            Privacy controls below are connected to your real CampUs account settings.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Visibility</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="public" size={22} color={Colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Campus Profile Visibility</Text>
                <Text style={styles.settingDescription}>Your profile is visible to verified campus users</Text>
              </View>
            </View>
            <Text style={styles.fixedStatus}>Managed</Text>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="email" size={22} color="#f59e0b" />
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Email Address</Text>
                <Text style={styles.settingDescription}>{profile?.email || user?.email || 'Not set'}</Text>
              </View>
            </View>
            <Text style={styles.fixedStatus}>Account</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Communication</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="chat-bubble-outline" size={22} color="#0ea5e9" />
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Allow Messages</Text>
                <Text style={styles.settingDescription}>Control whether users can message you</Text>
              </View>
            </View>
            {isSavingMessages ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Switch
                value={allowMessages}
                onValueChange={handleMessagesToggle}
                trackColor={{ false: '#e2e8f0', true: Colors.primary }}
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Analytics</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="insights" size={22} color="#8b5cf6" />
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Usage Analytics</Text>
                <Text style={styles.settingDescription}>Anonymous analytics helps improve app performance</Text>
              </View>
            </View>
            <Text style={styles.fixedStatus}>Enabled</Text>
          </View>
        </View>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Data Management</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleDownloadData}>
            <MaterialIcons name="download" size={20} color={Colors.primary} />
            <Text style={styles.dangerButtonText}>Download My Data</Text>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    padding: 16,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.primary,
    lineHeight: 20,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.md,
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {
    flex: 1,
  },
  settingName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.text,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  fixedStatus: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
  },
  dangerZone: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: 16,
    ...Shadows.sm,
  },
  dangerTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: 12,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dangerButtonText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.text,
  },
});
