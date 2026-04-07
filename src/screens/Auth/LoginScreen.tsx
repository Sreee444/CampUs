import React, { useState, useEffect, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';

import { RootStackParamList } from '../../navigation/types';
import { signIn } from '../../api/auth';
import { supabase } from '../../api/supabase';
import { getColors, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const DEFAULT_PASSWORD = '123456';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const hasLetterInLocalPart = (email: string) => /[a-z]/i.test((email.split('@')[0] || '').trim());

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { triggerDefaultPasswordPrompt } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const usedDefaultPasswordRef = useRef(false);

  // ─── Auth State Listener + Session Check on Mount ───────────────────────────
  useEffect(() => {
    // Check if the user is already logged in on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handlePostLoginNavigation(session.user.id);
      }
    });

    // Listen for future auth state changes (e.g. after OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (__DEV__) {
        console.log('[Auth] event:', event, '| userId:', session?.user?.id);
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        await handlePostLoginNavigation(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ─── Post-Login: Check profile, then show default-password prompt if needed ──
  const handlePostLoginNavigation = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, department, is_suspended')
        .eq('id', userId)
        .maybeSingle();

      const profile = data as { full_name: string | null; department: string | null; is_suspended?: boolean } | null;

      if (profile?.is_suspended) {
        return;
      }

      // Determine where to navigate first
      const goToMain = () => {
        if (!profile?.full_name || !profile?.department) {
          navigation.replace('CompleteProfile');
        } else {
          navigation.replace('MainTabs', { screen: 'Home' });
        }
      };

      // If user logged in with the default password, show a prompt BEFORE navigating
      if (usedDefaultPasswordRef.current) {
        usedDefaultPasswordRef.current = false;
        goToMain();
        // Small delay so the modal shows after navigation settles
        setTimeout(() => triggerDefaultPasswordPrompt(), 600);
        return;
      }

      goToMain();
    } catch {
      navigation.replace('MainTabs', { screen: 'Home' });
    }
  };

  // ─── Email Login Handler ─────────────────────────────────────────────────────
  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      Toast.show({ type: 'error', text1: 'Enter email and password' });
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      Toast.show({ type: 'error', text1: 'Enter a valid email address' });
      return;
    }

    if (!hasLetterInLocalPart(normalizedEmail)) {
      Toast.show({ type: 'error', text1: 'Email username must include a letter' });
      return;
    }

    try {
      setIsLoading(true);
      usedDefaultPasswordRef.current = password.trim() === DEFAULT_PASSWORD;
      await signIn(normalizedEmail, password);
      Toast.show({ type: 'success', text1: 'Welcome back!' });
      // onAuthStateChange listener will handle navigation
    } catch (error: any) {
      usedDefaultPasswordRef.current = false;
      Toast.show({
        type: 'error',
        text1: 'Login failed',
        text2: error?.message || 'Please check your credentials',
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <LinearGradient
      colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoRow}>
                <MaterialIcons name="school" size={28} color={Colors.text} />
                <Text style={styles.logoText}>CAMPUS</Text>
              </View>
              <Text style={styles.title}>Welcome back.</Text>
              <Text style={styles.subtitle}>
                Login to your academic portal to access courses and grades.
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="mail-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: Colors.text }]}
                    placeholder="Enter your college email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={Colors.textSecondary}
                    editable={!isLoading}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="lock" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: Colors.text }]}
                    placeholder="••••••••"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholderTextColor={Colors.textSecondary}
                    editable={!isLoading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <MaterialIcons
                      name={showPassword ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.forgotButton}
                  onPress={() => navigation.navigate('ResetPassword')}
                  disabled={isLoading}
                >
                  <Text style={styles.forgotButtonText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              {/* Login button */}
              <TouchableOpacity
                style={[styles.loginButton, isLoading && styles.buttonDisabled]}
                onPress={handleLogin}
                activeOpacity={0.9}
                disabled={isLoading}
              >
                {isLoading
                  ? <ActivityIndicator size="small" color={Colors.text} />
                  : <Text style={styles.loginButtonText}>Log In</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Accounts are created by admin. Use your assigned campus email and password.
              </Text>
              <Text style={styles.termsText}>
                By logging in, you agree to our Terms of Service and Privacy Policy.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}


function createStyles(Colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 48,
      paddingBottom: 32,
      justifyContent: 'space-between',
    },
    header: {
      alignItems: 'center',
      marginBottom: 32,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 32,
    },
    logoText: {
      fontSize: 20,
      fontWeight: '700',
      color: Colors.text,
      letterSpacing: 1,
    },
    title: {
      fontSize: 36,
      fontWeight: '700',
      color: Colors.text,
      textAlign: 'center',
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 280,
    },
    form: {
      gap: 16,
      flex: 1,
      justifyContent: 'center',
    },
    inputGroup: {
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: Colors.text,
      paddingLeft: 4,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: Colors.border,
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
    },
    eyeIcon: {
      padding: 4,
    },
    forgotButton: {
      alignSelf: 'flex-end',
      marginTop: 4,
    },
    forgotButtonText: {
      fontSize: 14,
      color: Colors.textSecondary,
      fontWeight: '500',
    },
    loginButton: {
      backgroundColor: Colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    loginButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: Colors.primaryContent,
    },
    footer: {
      alignItems: 'center',
      paddingTop: 32,
    },
    footerText: {
      fontSize: 14,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    termsText: {
      marginTop: 10,
      fontSize: 11,
      color: Colors.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
      lineHeight: 16,
    },
  });
}
