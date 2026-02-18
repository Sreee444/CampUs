import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { signUp } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';

type SignupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Signup'>;

export default function SignupScreen() {
  const navigation = useNavigation<SignupScreenNavigationProp>();
  const { refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState('student');

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Please fill all fields' });
      return;
    }
    if (password.length < 6) {
      Toast.show({ type: 'error', text1: 'Password must be at least 6 characters' });
      return;
    }
    try {
      setIsLoading(true);
      const { user, session } = await signUp(email.trim(), password, fullName.trim(), role);
      if (user) {
        await refreshProfile();
      }
      if (!session) {
        navigation.navigate('VerifyEmail', { email: email.trim() });
      } else {
        Toast.show({ type: 'success', text1: 'Account created!' });
      }
    } catch (error: any) {
      let errorMessage = error?.message || 'Please try again';
      if (error?.message?.includes('Email not confirmed')) {
        errorMessage = 'Email confirmation is required.';
      } else if (error?.message?.includes('signups not allowed')) {
        errorMessage = 'Signups are disabled. Enable in Supabase dashboard.';
      }
      Toast.show({ type: 'error', text1: 'Signup failed', text2: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const roles = ['student', 'alumni', 'faculty', 'admin'];

  return (
    <SafeAreaView style={styles.container}>
      {/* Background blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <MaterialIcons name="school" size={28} color="#111818" />
              <Text style={styles.logoText}>CAMPUS</Text>
            </View>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join your academic community today.</Text>
          </View>

          {/* Role selection */}
          <View style={styles.section}>
            <Text style={styles.label}>I am a</Text>
            <View style={styles.roleRow}>
              {roles.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleChip, role === r && styles.roleChipActive]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="person" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Jane Doe"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Academic Email</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="school" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="jane@university.edu"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="lock" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* AI Tip */}
            <View style={styles.aiTip}>
              <MaterialIcons name="auto-awesome" size={16} color="#13ecec" />
              <Text style={styles.aiTipText}>
                <Text style={styles.aiTipBold}>AI Tip: </Text>
                Use your institutional email for faster verification.
              </Text>
            </View>

            {/* Signup button */}
            <TouchableOpacity
              style={[styles.signupButton, isLoading && styles.buttonDisabled]}
              onPress={handleSignup}
              activeOpacity={0.9}
              disabled={isLoading}
            >
              <Text style={styles.signupButtonText}>
                {isLoading ? 'Creating...' : 'Create Account'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Already a member?{' '}
              <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>
                Log In
              </Text>
            </Text>
            <Text style={styles.termsText}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfbf7',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  blob1: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(19,236,236,0.12)',
  },
  blob2: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(243,229,245,0.6)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    ...(Platform.OS === 'web' && ({ minHeight: '100vh' } as any)),
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111818',
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111818',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  roleChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roleChipActive: {
    backgroundColor: '#13ecec',
    borderColor: '#13ecec',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  roleChipTextActive: {
    color: '#111818',
    fontWeight: '700',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    paddingLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: '#111818',
  },
  eyeIcon: {
    padding: 4,
  },
  aiTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(19,236,236,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(19,236,236,0.2)',
    borderRadius: 12,
    padding: 12,
  },
  aiTipText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  aiTipBold: {
    fontWeight: '700',
    color: '#0d9488',
  },
  signupButton: {
    backgroundColor: '#13ecec',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#13ecec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signupButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111818',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 12,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
  },
  footerLink: {
    color: '#111818',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  termsText: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
});
