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
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    // TODO: Implement login with backend API
    // Navigate to main app after successful login
    navigation.navigate('MainTabs');
  };

  const handleGoogleLogin = () => {
    // TODO: Implement Google OAuth login
  };

  const handleForgotPassword = () => {
    navigation.navigate('ResetPassword');
  };

  const handleSignup = () => {
    navigation.navigate('Signup');
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#e0f7fa','#f3e5f5', '#fff8f0']}
        style={styles.gradient}
      >
        {/* Decorative Background Blurs */}
        <View style={styles.decorBlur1} />
        <View style={styles.decorBlur2} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <MaterialIcons name="school" size={32} color="#111818" />
                <Text style={styles.logoText}>CAMPUS</Text>
              </View>
              <Text style={styles.title}>Welcome back.</Text>
              <Text style={styles.subtitle}>
                Login to your academic portal to access courses and grades.
              </Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons
                    name="mail-outline"
                    size={20}
                    color="#60707d"
                    style={styles.inputIcon}
                  />
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

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons
                    name="lock-outline"
                    size={20}
                    color="#60707d"
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
                      color="#60707d"
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.forgotPassword} onPress={handleForgotPassword}>
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                activeOpacity={0.9}
              >
                <Text style={styles.loginButtonText}>Log In</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>Or continue with</Text>
                <View style={styles.divider} />
              </View>

              {/* Google Button */}
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleLogin}
                activeOpacity={0.9}
              >
                <Image
                  source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDKpHiuZPrWo5iqthAXSBURcLBC-G-gpzEMOC59m1GHQoQ5R-NDNIQ5wdaOByEurbb-Yvwxl1mJnAWpAydzMxeY0ktSC-rWEeGIrPIhjOKkTY1v_-DV8ydIgynR8TvvnTCMc6UBIU1sWeo3PC0FhBvFh55vmM5ziy3yrIoNOBMVuuXEiF-xON-lvGuEdpCmw0fqk1RvmA2-iJEHdBunh3Cei4LyCEh1V4eNLW3nvIB2GmnHlqTiEY1Ynma5CRPAwPkm6Cy-6ntCDsu-' }}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>Google</Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Don't have an account?{' '}
                <Text style={styles.footerLink} onPress={handleSignup}>Join now</Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  gradient: {
    flex: 1,
  },
  decorBlur1: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 256,
    height: 256,
    backgroundColor: Colors.primary,
    opacity: 0.2,
    borderRadius: 128,
  },
  decorBlur2: {
    position: 'absolute',
    top: '50%',
    right: -80,
    width: 320,
    height: 320,
    backgroundColor: Colors.peachSoft,
    opacity: 0.6,
    borderRadius: 160,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  logoText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: '#111818',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 36,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: '#60707d',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 448,
    width: '100%',
    alignSelf: 'center',
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#334155',
    marginBottom: Spacing.sm,
    paddingLeft: 4,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: FontSizes.md,
    color: '#111818',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
  },
  forgotPasswordText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#60707d',
  },
  loginButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    fontSize: FontSizes.sm,
    color: '#60707d',
    fontWeight: FontWeights.medium,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: Spacing.sm,
    borderRadius: 4,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    gap: Spacing.md,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: '#334155',
  },
  footer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: '#60707d',
  },
  footerLink: {
    fontWeight: FontWeights.semibold,
    color: '#111818',
    textDecorationLine: 'underline',
  },
});
