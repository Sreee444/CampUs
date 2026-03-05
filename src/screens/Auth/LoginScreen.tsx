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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

import { RootStackParamList } from '../../navigation/types';
import { signIn } from '../../api/auth';
import { supabase } from '../../api/supabase';

const DEFAULT_PASSWORD = '123456';

// Required for Expo WebBrowser OAuth session completion
WebBrowser.maybeCompleteAuthSession();

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const mustChangePasswordRef = useRef(false);

  // 🔍 TEMPORARY DEBUG — check this in Metro console, then remove
  const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'campusapp', path: 'auth/callback' });
  console.log('[Auth] Expo Redirect URL:', redirectUrl);

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

  // ─── Post-Login: Check if profile is complete, route accordingly ─────────────
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

      // Enforce password update on first login with the seeded default password.
      if (mustChangePasswordRef.current) {
        mustChangePasswordRef.current = false;
        navigation.replace('ChangePassword', { forceChange: true });
        return;
      }

      // If profile is incomplete (new users via Google OAuth), send to CompleteProfile
      if (!profile?.full_name || !profile?.department) {
        navigation.replace('CompleteProfile');
      } else {
        navigation.replace('MainTabs', { screen: 'Home' });
      }
    } catch {
      // Fallback: navigate to Home even if profile check fails
      navigation.replace('MainTabs', { screen: 'Home' });
    }
  };

  // ─── Google OAuth Handler ────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return; // Prevent double clicks

    try {
      setIsGoogleLoading(true);

      // Build the deep link that Google will redirect to after OAuth
      // This MUST match one of the entries in Supabase → Auth → Redirect URLs
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'campusapp',       // Must match app.json "scheme"
        path: 'auth/callback',
      });

      if (__DEV__) {
        console.log('[Auth] Redirect URL:', redirectUrl);
      }



      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // We handle the browser ourselves below
        },
      });

      if (error) throw error;

      if (!data?.url) {
        throw new Error('No OAuth URL returned from Supabase.');
      }

      // Open the Google consent screen in the system browser
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
        { showInRecents: false }
      );

      if (__DEV__) {
        console.log('[Auth] WebBrowser result:', result.type);
      }

      if (result.type === 'success' && result.url) {
        // Extract tokens from the callback URL fragment (#access_token=...)
        const fragmentString = result.url.includes('#')
          ? result.url.split('#')[1]
          : result.url.split('?')[1] ?? '';

        const params = new URLSearchParams(fragmentString);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
          // onAuthStateChange listener above will handle navigation
        } else {
          // Token not in fragment — may be in query string (PKCE flow)
          // onAuthStateChange may still fire if Supabase picks up the session
          if (__DEV__) {
            console.warn('[Auth] No tokens in callback URL. Possible PKCE flow.');
          }
        }
      } else if (result.type === 'cancel') {
        // User closed the browser — not an error
        if (__DEV__) console.log('[Auth] User cancelled Google sign-in.');
      }
    } catch (error: any) {
      if (__DEV__) {
        console.error('[Auth] Google sign-in error:', error);
      }
      Alert.alert(
        'Sign in failed',
        error?.message || 'Could not sign in with Google. Please try again.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // ─── Email Login Handler ─────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Toast.show({ type: 'error', text1: 'Enter email and password' });
      return;
    }
    try {
      setIsLoading(true);
      mustChangePasswordRef.current = password.trim() === DEFAULT_PASSWORD;
      await signIn(email.trim(), password);
      Toast.show({ type: 'success', text1: 'Welcome back!' });
      // onAuthStateChange listener will handle navigation
    } catch (error: any) {
      mustChangePasswordRef.current = false;
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
    <SafeAreaView style={styles.container}>
      {/* Mesh gradient background blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

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
              <MaterialIcons name="school" size={28} color="#111818" />
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
                <MaterialIcons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="student@campus.edu"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor="#94a3b8"
                  editable={!isLoading && !isGoogleLoading}
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
                  editable={!isLoading && !isGoogleLoading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => navigation.navigate('ResetPassword')}
                disabled={isLoading || isGoogleLoading}
              >
                <Text style={styles.forgotButtonText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            {/* Login button */}
            <TouchableOpacity
              style={[styles.loginButton, (isLoading || isGoogleLoading) && styles.buttonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.9}
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#111818" />
                : <Text style={styles.loginButtonText}>Log In</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google button */}
            <TouchableOpacity
              style={[styles.googleButton, (isGoogleLoading || isLoading) && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.9}
              disabled={isGoogleLoading || isLoading}
            >
              {isGoogleLoading
                ? <ActivityIndicator size="small" color="#EA4335" />
                : <MaterialIcons name="g-translate" size={20} color="#EA4335" />
              }
              <Text style={styles.googleButtonText}>
                {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
              </Text>
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
    backgroundColor: 'rgba(19,236,236,0.15)',
  },
  blob2: {
    position: 'absolute',
    top: '45%',
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,248,225,0.5)',
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
    ...(Platform.OS === 'web' && ({ minHeight: '100vh' } as any)),
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
    color: '#111818',
    letterSpacing: 1,
  },
  title: {
    fontSize: 36,
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
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotButtonText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  loginButton: {
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
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111818',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  dividerText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  googleButton: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 32,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  termsText: {
    marginTop: 10,
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 16,
  },
  footerLink: {
    color: '#111818',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
