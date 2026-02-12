import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Toast } from '../../components/Toast';

type PrivacyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Privacy'>;

export default function PrivacyScreen() {
  const navigation = useNavigation<PrivacyScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });
  
  const [profilePublic, setProfilePublic] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [allowMessages, setAllowMessages] = useState(true);
  const [showProjects, setShowProjects] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const [analytics, setAnalytics] = useState(true);

  const handleToggle = (name: string, value: boolean) => {
    setToast({ 
      visible: true, 
      message: `${name} ${value ? 'enabled' : 'disabled'}`, 
      type: 'info' 
    });
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
            Control who can see your information and how your data is used
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Visibility</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Public Profile</Text>
                <Text style={styles.settingDescription}>Anyone in campus can view your profile</Text>
              </View>
            </View>
            <Switch
              value={profilePublic}
              onValueChange={(val) => { setProfilePublic(val); handleToggle('Public profile', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Show Email Address</Text>
                <Text style={styles.settingDescription}>Display email on your profile</Text>
              </View>
            </View>
            <Switch
              value={showEmail}
              onValueChange={(val) => { setShowEmail(val); handleToggle('Show email', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Show Phone Number</Text>
                <Text style={styles.settingDescription}>Display phone on your profile</Text>
              </View>
            </View>
            <Switch
              value={showPhone}
              onValueChange={(val) => { setShowPhone(val); handleToggle('Show phone', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Show Projects</Text>
                <Text style={styles.settingDescription}>Display your projects publicly</Text>
              </View>
            </View>
            <Switch
              value={showProjects}
              onValueChange={(val) => { setShowProjects(val); handleToggle('Show projects', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Show Activity</Text>
                <Text style={styles.settingDescription}>Display your recent activity</Text>
              </View>
            </View>
            <Switch
              value={showActivity}
              onValueChange={(val) => { setShowActivity(val); handleToggle('Show activity', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Communication</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Allow Messages</Text>
                <Text style={styles.settingDescription}>Anyone can send you messages</Text>
              </View>
            </View>
            <Switch
              value={allowMessages}
              onValueChange={(val) => { setAllowMessages(val); handleToggle('Allow messages', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Analytics</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingText}>
                <Text style={styles.settingName}>Usage Analytics</Text>
                <Text style={styles.settingDescription}>Help improve app by sharing usage data</Text>
              </View>
            </View>
            <Switch
              value={analytics}
              onValueChange={(val) => { setAnalytics(val); handleToggle('Usage analytics', val); }}
              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
            />
          </View>
        </View>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Data Management</Text>
          <TouchableOpacity style={styles.dangerButton}>
            <MaterialIcons name="download" size={20} color={Colors.primary} />
            <Text style={styles.dangerButtonText}>Download My Data</Text>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dangerButton, styles.deleteButton]}>
            <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
            <Text style={[styles.dangerButtonText, styles.deleteText]}>Delete Account</Text>
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
  deleteButton: {
    marginTop: 4,
  },
  dangerButtonText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.text,
  },
  deleteText: {
    color: '#ef4444',
  },
});
