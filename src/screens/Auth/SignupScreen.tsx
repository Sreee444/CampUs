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
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
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
        // Profile will be created by Supabase trigger. Optionally, refresh profile here.
        await refreshProfile();
      }

      if (!session) {
        Toast.show({
          type: 'info',
          text1: 'Check your email to verify your account',
        });
      } else {
        Toast.show({ type: 'success', text1: 'Account created!' });
      }

      // Don't navigate manually - let auth state change handle routing
    } catch (error: any) {
      console.error('Signup error:', error);
      
      let errorMessage = error?.message || 'Please try again';
      
      // Check for common Supabase errors
      if (error?.message?.includes('Email not confirmed')) {
        errorMessage = 'Email confirmation is required. Check Supabase settings.';
      } else if (error?.message?.includes('signups not allowed')) {
        errorMessage = 'Signups are disabled. Enable in Supabase dashboard.';
      } else if (error?.status === 401) {
        errorMessage = 'Auth error: Check Supabase email settings (disable email confirmation for dev)';
      }
      
      Toast.show({
        type: 'error',
        text1: 'Signup failed',
        text2: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={['#e0f7fa', '#f3e5f5']} style={styles.gradient}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>CAMPUS</Text>
            </View>
            <View style={styles.form}>
              <Text style={styles.title}>Create your account</Text>
              
              {/* Role selection */}
              <Text style={{ marginTop: 16, marginBottom: 8, fontWeight: 'bold', color: '#333' }}>Select your role</Text>
              <View style={{ flexDirection: 'row', marginBottom: 16, flexWrap: 'wrap' }}>
                {['student', 'alumni', 'faculty', 'admin'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={{
                      backgroundColor: role === r ? '#6366f1' : '#e5e7eb',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                    onPress={() => setRole(r)}
                  >
                    <Text style={{ color: role === r ? '#fff' : '#333', fontWeight: 'bold' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
                  {/* Full Name Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Full Name</Text>
                    <View style={styles.inputWrapper}>
                      <MaterialIcons
                        name="person"
                        size={20}
                        color="#94a3b8"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Jane Doe"
                        value={fullName}
                        onChangeText={setFullName}
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                  </View>

                  {/* Academic Email Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Academic Email</Text>
                    <View style={styles.inputWrapper}>
                      <MaterialIcons
                        name="school"
                        size={20}
                        color="#94a3b8"
                        style={styles.inputIcon}
                      />
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

                  {/* Password Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputWrapper}>
                      <MaterialIcons
                        name="lock"
                        size={20}
                        color="#94a3b8"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        placeholderTextColor="#94a3b8"
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeIcon}
                      >
                        <MaterialIcons
                          name={showPassword ? 'visibility' : 'visibility-off'}
                          size={20}
                          color="#94a3b8"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* AI Tip */}
                  <View style={styles.aiTipContainer}>
                    <MaterialIcons name="auto-awesome" size={18} color={Colors.primary} />
                    <Text style={styles.aiTipText}>
                      <Text style={styles.aiTipLabel}>AI Tip: </Text>
                      Use your institutional email for faster verification. We prioritize .edu domains.
                    </Text>
                  </View>

                  {/* Signup Button */}
                  <TouchableOpacity
                    style={styles.signupButton}
                    onPress={handleSignup}
                    activeOpacity={0.9}
                    disabled={isLoading}
                  >
                    <Text style={styles.signupButtonText}>
                      {isLoading ? 'Creating...' : 'Create Account'}
                    </Text>
                    <MaterialIcons name="arrow-forward" size={18} color="#111818" />
                  </TouchableOpacity>
                </View>

              {/* Footer Link */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Already a member?{' '}
                  <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>Log In</Text>
                </Text>
              </View>

              {/* Terms */}
              <View style={styles.terms}>
                <Text style={styles.termsText}>
                  By signing up, you agree to our Terms of Service and Privacy Policy.
                </Text>
              </View>
            </LinearGradient>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    ...(Platform.OS === 'web' && ({
      height: '100vh',
      width: '100vw',
    } as any)),
  },
  gradient: {
    flex: 1,
    ...(Platform.OS === 'web' && ({
      minHeight: '100vh',
      width: '100%',
    } as any)),
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...(Platform.OS === 'web' && ({
      minHeight: '100vh',
      justifyContent: 'center',
    } as any)),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    letterSpacing: 2,
    color: '#111818',
  },
  headerSpacer: {
    width: 40,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
  },
  glassPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    ...Shadows.xl,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 30,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: '#64748b',
    textAlign: 'center',
  },
  form: {
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#475569',
    marginLeft: 4,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 40,
    paddingRight: 16,
    fontSize: FontSizes.sm,
    color: '#111818',
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  aiTipContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: `${Colors.primary}1A`,
    borderWidth: 1,
    borderColor: `${Colors.primary}33`,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  aiTipText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  aiTipLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  signupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signupButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
  footerLink: {
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  terms: {
    marginTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  termsText: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
});
