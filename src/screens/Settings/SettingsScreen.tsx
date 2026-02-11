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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Toast } from '../../components/Toast';

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingItem {
  id: string;
  label: string;
  type: 'navigation' | 'switch';
  value?: boolean;
}

const profileSettings: SettingItem[] = [
  { id: '1', label: 'View / Edit Profile', type: 'navigation' },
  { id: '2', label: 'Academic Details', type: 'navigation' },
  { id: '3', label: 'Skills & Interests', type: 'navigation' },
];

const accountSettings: SettingItem[] = [
  { id: '4', label: 'Change Password', type: 'navigation' },
  { id: '5', label: 'Linked Accounts', type: 'navigation' },
  { id: '6', label: 'Email Verification', type: 'switch', value: true },
];

const preferencesSettings: SettingItem[] = [
  { id: '7', label: 'Dark Mode', type: 'switch', value: false },
  { id: '8', label: 'Notifications', type: 'navigation' },
  { id: '9', label: 'Privacy', type: 'navigation' },
];

export default function SettingsScreen() {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { isDark, toggleTheme } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  
  const [settings, setSettings] = useState({
    emailVerification: true,
  });
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'info' | 'warning' | 'error' });

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToast({ visible: true, message, type });
  };

  const toggleSetting = (key: string) => {
    if (key === 'darkMode') {
      toggleTheme();
      showToast(
        !isDark ? 'Dark Mode enabled!' : 'Dark Mode disabled',
        'success'
      );
    } else {
      setSettings((prev) => {
        const newValue = !prev[key as keyof typeof prev];
        if (key === 'emailVerification') {
          showToast(
            newValue ? 'Email verification enabled' : 'Email verification disabled',
            'success'
          );
        }
        return { ...prev, [key]: newValue };
      });
    }
  };

  const handleLogout = () => {
    showToast('Logging out...', 'info');
    setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }, 1000);
  };

  const handleSettingPress = (label: string) => {
    switch (label) {
      case 'View / Edit Profile':
        navigation.navigate('EditProfile');
        break;
      case 'Academic Details':
        navigation.navigate('AcademicDetails');
        break;
      case 'Skills & Interests':
        navigation.navigate('SkillsInterests');
        break;
      case 'Change Password':
        navigation.navigate('ChangePassword');
        break;
      case 'Linked Accounts':
        navigation.navigate('LinkedAccounts');
        break;
      case 'Notifications':
        navigation.navigate('Notifications');
        break;
      case 'Privacy':
        navigation.navigate('Privacy');
        break;
      case 'Help Center':
        showToast('Help documentation coming soon', 'info');
        break;
      case 'Terms of Service':
        showToast('Terms & Conditions coming soon', 'info');
        break;
      case 'Privacy Policy':
        showToast('Privacy Policy coming soon', 'info');
        break;
      default:
        showToast(`${label} feature under development`, 'info');
    }
  };

  const renderSettingItem = (item: SettingItem, isLast: boolean) => (
    <View key={item.id}>
      {item.type === 'navigation' ? (
        <TouchableOpacity
          style={styles.settingItem}
          activeOpacity={0.7}
          onPress={() => handleSettingPress(item.label)}
        >
          <Text style={styles.settingLabel}>{item.label}</Text>
          <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
        </TouchableOpacity>
      ) : (
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>{item.label}</Text>
          <Switch
            value={item.id === '6' ? settings.emailVerification : isDark}
            onValueChange={() =>
              toggleSetting(item.id === '6' ? 'emailVerification' : 'darkMode')
            }
            trackColor={{ false: '#cbd5e1', true: Colors.primary }}
            thumbColor="#ffffff"
          />
        </View>
      )}
      {!isLast && <View style={styles.divider} />}
    </View>
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to MainTabs if can't go back
      navigation.navigate('MainTabs');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <MaterialIcons name="chevron-left" size={30} color={Colors.primary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROFILE</Text>
          <View style={styles.settingCard}>
            {profileSettings.map((item, index) =>
              renderSettingItem(item, index === profileSettings.length - 1)
            )}
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.settingCard}>
            {accountSettings.map((item, index) =>
              renderSettingItem(item, index === accountSettings.length - 1)
            )}
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCES</Text>
          <View style={styles.settingCard}>
            {preferencesSettings.map((item, index) =>
              renderSettingItem(item, index === preferencesSettings.length - 1)
            )}
          </View>
        </View>

        {/* Help & Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HELP & SUPPORT</Text>
          <View style={styles.settingCard}>
            <TouchableOpacity 
              style={styles.settingItem} 
              activeOpacity={0.7} 
              onPress={() => handleSettingPress('Help Center')}
            >
              <Text style={styles.settingLabel}>Help Center</Text>
              <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity 
              style={styles.settingItem} 
              activeOpacity={0.7} 
              onPress={() => handleSettingPress('Terms of Service')}
            >
              <Text style={styles.settingLabel}>Terms of Service</Text>
              <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity 
              style={styles.settingItem} 
              activeOpacity={0.7} 
              onPress={() => handleSettingPress('Privacy Policy')}
            >
              <Text style={styles.settingLabel}>Privacy Policy</Text>
              <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} activeOpacity={0.8} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  backButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
    marginLeft: -4,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  headerSpacer: {
    width: 32,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.sm,
  },
  section: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: FontWeights.semibold,
    letterSpacing: 1.2,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    paddingLeft: 4,
  },
  settingCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
  },
  settingLabel: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md,
  },
  logoutButton: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: '#fee2e2',
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#dc2626',
  },
  versionInfo: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  versionText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
});
