import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { updateProfile } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';

type RoleSelectionScreenNavigationProp = StackNavigationProp<RootStackParamList, 'RoleSelection'>;

type Role = 'student' | 'alumni' | 'faculty' | 'admin' | null;

interface RoleOption {
  id: string;
  label: string;
  value: Role;
}

const roleOptions: RoleOption[] = [
  { id: '1', label: 'Student', value: 'student' },
  { id: '2', label: 'Alumni', value: 'alumni' },
  { id: '3', label: 'Faculty', value: 'faculty' },
  { id: '4', label: 'Admin', value: 'admin' },
];

export default function RoleSelectionScreen() {
  const navigation = useNavigation<RoleSelectionScreenNavigationProp>();
  const { user, profile, refreshProfile } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role>('student');
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = async () => {
    if (!user?.id || !selectedRole) {
      Toast.show({ type: 'error', text1: 'Please select a role' });
      return;
    }

    try {
      setIsSaving(true);

      // Only allow role selection if role is 'student' or missing
      if (profile && profile.role && profile.role !== 'student') {
        // Already has a real role, skip
        navigation.replace(profile.full_name ? 'MainTabs' : 'CompleteProfile');
        return;
      }
      
      // Update profile role (profile is always created by Supabase trigger)
      if (!profile) {
        Toast.show({ type: 'error', text1: 'Profile not found. Please try logging in again.' });
        return;
      }
      
      await updateProfile(user.id, { role: selectedRole });
      await refreshProfile();
      
      // Navigate based on profile completeness
      // If profile already has full_name, go to MainTabs; otherwise, complete profile
      if (profile?.full_name) {
        navigation.replace('MainTabs');
      } else {
        navigation.replace('CompleteProfile');
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not save role',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#e0f7fa', '#f3e5f5']} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialIcons name="arrow-back" size={24} color="#111818" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>CAMPUS</Text>
          </View>

          {/* Main Content */}
          <View style={styles.mainContent}>
            <Text style={styles.title}>Identify your role</Text>
            <Text style={styles.subtitle}>
              Select the profile that matches your university status to continue.
            </Text>

            {/* Role Selection Grid */}
            <View style={styles.roleGrid}>
              {roleOptions.map((role) => (
                <TouchableOpacity
                  key={role.id}
                  style={[
                    styles.roleCard,
                    selectedRole === role.value && styles.roleCardSelected,
                  ]}
                  onPress={() => setSelectedRole(role.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.roleLabel,
                      selectedRole === role.value && styles.roleLabelSelected,
                    ]}
                  >
                    {role.label}
                  </Text>
                  <View
                    style={[
                      styles.radioOuter,
                      selectedRole === role.value && styles.radioOuterSelected,
                    ]}
                  >
                    {selectedRole === role.value && (
                      <MaterialIcons name="check" size={16} color="#111818" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
              activeOpacity={0.9}
              disabled={isSaving}
            >
              <Text style={styles.continueButtonText}>
                {isSaving ? 'Saving...' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  gradient: {
    flex: 1,
    ...(Platform.OS === 'web' && ({ minHeight: '100vh' } as any)),
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    letterSpacing: 1.2,
    color: '#111818',
    opacity: 0.7,
    paddingRight: 48,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    maxWidth: 448,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: FontWeights.bold,
    color: '#111818',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: 'rgba(17, 24, 24, 0.7)',
    textAlign: 'center',
    maxWidth: 300,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  roleGrid: {
    gap: Spacing.md,
    flex: 1,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    ...Shadows.sm,
  },
  roleCardSelected: {
    backgroundColor: '#ffffff',
    borderColor: Colors.primary,
    borderWidth: 2,
    ...Shadows.md,
  },
  roleLabel: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.medium,
    color: '#111818',
    opacity: 0.8,
    letterSpacing: 0.5,
  },
  roleLabelSelected: {
    opacity: 1,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  continueButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.xl,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
    letterSpacing: 0.5,
  },
  bottomSpacer: {
    height: 24,
  },
});
