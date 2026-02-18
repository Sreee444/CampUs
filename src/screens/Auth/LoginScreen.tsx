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
import { signIn, signInWithGoogle } from '../../api/auth';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      await signInWithGoogle();
      Toast.show({ type: 'success', text1: 'Signed in with Google!' });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Google sign-in failed',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Toast.show({ type: 'error', text1: 'Enter email and password' });
      return;
    }
    try {
      setIsLoading(true);
      await signIn(email.trim(), password);
      Toast.show({ type: 'success', text1: 'Welcome back!' });
    } catch (error: any) {
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
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => navigation.navigate('ResetPassword')}
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
              <Text style={styles.loginButtonText}>
                {isLoading ? 'Signing in...' : 'Log In'}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google button */}
            <TouchableOpacity
              style={[styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.9}
              disabled={isGoogleLoading}
            >
              <MaterialIcons name="g-translate" size={20} color="#EA4335" />
              <Text style={styles.googleButtonText}>
                {isGoogleLoading ? 'Connecting...' : 'Google'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text style={styles.footerLink} onPress={() => navigation.navigate('Signup')}>
                Join now
              </Text>
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
    opacity: 0.7,
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
  },
  footerLink: {
    color: '#111818',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
