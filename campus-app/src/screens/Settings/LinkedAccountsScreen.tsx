import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { Toast } from '../../components/Toast';

type LinkedAccountsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'LinkedAccounts'>;

interface Account {
  id: string;
  name: string;
  icon: string;
  color: string;
  connected: boolean;
  username?: string;
}

export default function LinkedAccountsScreen() {
  const navigation = useNavigation<LinkedAccountsScreenNavigationProp>();
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });
  const [accounts, setAccounts] = useState<Account[]>([
    { id: 'google', name: 'Google', icon: 'g', color: '#EA4335', connected: true, username: 'student@campus.edu' },
    { id: 'github', name: 'GitHub', icon: 'code', color: '#24292e', connected: true, username: 'student-dev' },
    { id: 'linkedin', name: 'LinkedIn', icon: 'work', color: '#0A66C2', connected: false },
    { id: 'microsoft', name: 'Microsoft', icon: 'microsoft', color: '#0078D4', connected: false },
    { id: 'apple', name: 'Apple', icon: 'apple', color: '#000000', connected: false },
  ]);

  const toggleAccount = (accountId: string) => {
    setAccounts(accounts.map(acc => {
      if (acc.id === accountId) {
        const newConnected = !acc.connected;
        setToast({
          visible: true,
          message: `${acc.name} ${newConnected ? 'connected' : 'disconnected'}`,
          type: newConnected ? 'success' : 'info'
        });
        return { ...acc, connected: newConnected };
      }
      return acc;
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#111818" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Linked Accounts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={20} color={Colors.primary} />
          <Text style={styles.infoText}>
            Link your accounts to sign in faster and sync data across platforms
          </Text>
        </View>

        <View style={styles.accountsList}>
          {accounts.map((account) => (
            <View key={account.id} style={styles.accountCard}>
              <View style={[styles.iconContainer, { backgroundColor: account.color }]}>
                <MaterialIcons name={account.icon as any} size={24} color="#ffffff" />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{account.name}</Text>
                {account.connected && account.username && (
                  <Text style={styles.accountUsername}>{account.username}</Text>
                )}
                {!account.connected && (
                  <Text style={styles.accountStatus}>Not connected</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.connectButton, account.connected && styles.disconnectButton]}
                onPress={() => toggleAccount(account.id)}
              >
                <Text
                  style={[styles.connectButtonText, account.connected && styles.disconnectButtonText]}
                >
                  {account.connected ? 'Disconnect' : 'Connect'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.permissionsCard}>
          <Text style={styles.permissionsTitle}>Account Permissions</Text>
          <Text style={styles.permissionsText}>
            Connected accounts can access:
          </Text>
          <View style={styles.permissionItem}>
            <MaterialIcons name="check-circle" size={16} color="#10b981" />
            <Text style={styles.permissionText}>Your basic profile information</Text>
          </View>
          <View style={styles.permissionItem}>
            <MaterialIcons name="check-circle" size={16} color="#10b981" />
            <Text style={styles.permissionText}>Email address for notifications</Text>
          </View>
          <View style={styles.permissionItem}>
            <MaterialIcons name="check-circle" size={16} color="#10b981" />
            <Text style={styles.permissionText}>Academic records (with your permission)</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    padding: 16,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: '#1e40af',
    lineHeight: 20,
  },
  accountsList: {
    padding: Spacing.md,
    gap: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
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
    color: '#111818',
  },
  accountUsername: {
    fontSize: FontSizes.sm,
    color: '#64748b',
    marginTop: 2,
  },
  accountStatus: {
    fontSize: FontSizes.sm,
    color: '#94a3b8',
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  disconnectButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  connectButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
  disconnectButtonText: {
    color: '#64748b',
  },
  permissionsCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 12,
  },
  permissionsTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  permissionsText: {
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permissionText: {
    fontSize: FontSizes.sm,
    color: '#374151',
  },
});
