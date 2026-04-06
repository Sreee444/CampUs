import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Toast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';

type LinkedAccountsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'LinkedAccounts'>;

interface Account {
  id: string;
  name: string;
  icon: string;
  color: string;
  connected: boolean;
  detail: string;
}

const providerMap: Record<string, { name: string; icon: string; color: string }> = {
  email: { name: 'Email & Password', icon: 'email', color: '#2563eb' },
  google: { name: 'Google', icon: 'g-translate', color: '#ea4335' },
  github: { name: 'GitHub', icon: 'code', color: '#24292e' },
  apple: { name: 'Apple', icon: 'apple', color: '#111827' },
  microsoft: { name: 'Microsoft', icon: 'window', color: '#0078d4' },
};

export default function LinkedAccountsScreen() {
  const navigation = useNavigation<LinkedAccountsScreenNavigationProp>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const primaryEmail = useMemo(() => user?.email || 'No email found', [user?.email]);

  useEffect(() => {
    let mounted = true;

    const loadLinkedProviders = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const authUser = data?.user;
        const providers = new Set<string>();

        const identities = Array.isArray((authUser as any)?.identities) ? (authUser as any).identities : [];
        identities.forEach((identity: any) => {
          const provider = String(identity?.provider || identity?.identity_data?.provider || '').toLowerCase();
          if (provider) providers.add(provider);
        });

        const appProviders = Array.isArray((authUser as any)?.app_metadata?.providers)
          ? (authUser as any).app_metadata.providers
          : [];
        appProviders.forEach((provider: string) => providers.add(String(provider || '').toLowerCase()));

        const defaultProvider = String((authUser as any)?.app_metadata?.provider || 'email').toLowerCase();
        providers.add(defaultProvider || 'email');

        const linked = Array.from(providers)
          .filter(Boolean)
          .map((provider) => {
            const meta = providerMap[provider] || {
              name: provider.charAt(0).toUpperCase() + provider.slice(1),
              icon: 'link',
              color: '#475569',
            };

            return {
              id: provider,
              name: meta.name,
              icon: meta.icon,
              color: meta.color,
              connected: true,
              detail: provider === 'email' ? primaryEmail : 'Connected',
            } as Account;
          });

        if (mounted) {
          setAccounts(linked.length ? linked : [{
            id: 'email',
            name: providerMap.email.name,
            icon: providerMap.email.icon,
            color: providerMap.email.color,
            connected: true,
            detail: primaryEmail,
          }]);
        }
      } catch (error: any) {
        if (mounted) {
          setToast({ visible: true, message: error?.message || 'Failed to load linked accounts', type: 'error' });
          setAccounts([{ id: 'email', name: providerMap.email.name, icon: providerMap.email.icon, color: providerMap.email.color, connected: true, detail: primaryEmail }]);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadLinkedProviders();
    return () => { mounted = false; };
  }, [primaryEmail]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Linked Accounts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={20} color={Colors.primary} />
          <Text style={styles.infoText}>
            These are your real sign-in providers linked to this CampUs account.
          </Text>
        </View>

        <View style={styles.accountsList}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading linked providers...</Text>
            </View>
          ) : accounts.map((account) => (
            <View key={account.id} style={styles.accountCard}>
              <View style={[styles.iconContainer, { backgroundColor: account.color }]}>
                <MaterialIcons name={account.icon as any} size={22} color="#ffffff" />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountUsername}>{account.detail}</Text>
              </View>
              <View style={styles.connectedBadge}>
                <MaterialIcons name="check-circle" size={16} color="#16a34a" />
                <Text style={styles.connectedText}>Linked</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.permissionsCard}>
          <Text style={styles.permissionsTitle}>Account Notes</Text>
          <Text style={styles.permissionsText}>
            Account providers are controlled by your authentication setup.
          </Text>
          <View style={styles.permissionItem}>
            <MaterialIcons name="check-circle" size={16} color="#10b981" />
            <Text style={styles.permissionText}>Primary login is managed through Supabase Auth</Text>
          </View>
          <View style={styles.permissionItem}>
            <MaterialIcons name="check-circle" size={16} color="#10b981" />
            <Text style={styles.permissionText}>Contact admin if you need provider changes</Text>
          </View>
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
  accountsList: {
    padding: Spacing.md,
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
    marginLeft: 16,
  },
  accountName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  accountUsername: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  accountStatus: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  connectedText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#166534',
  },
  permissionsCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 12,
  },
  permissionsTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  permissionsText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permissionText: {
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
});
