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
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';

type ResetPasswordScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen() {
  const navigation = useNavigation<ResetPasswordScreenNavigationProp>();
  const [email, setEmail] = useState('');

  const handleReset = () => {
    // TODO: Implement password reset API call
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#e0f2f1', '#f3e5f5', Colors.light.background]}
        style={styles.gradient}
      >
        {/* Decorative Background Blurs */}
        <View style={styles.decorBlur1} />
        <View style={styles.decorBlur2} />
        <View style={styles.decorBlur3} />

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
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <MaterialIcons name="arrow-back" size={24} color="#111818" />
              </TouchableOpacity>
            </View>

            {/* Main Content */}
            <View style={styles.mainContent}>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <MaterialIcons name="lock-reset" size={32} color={Colors.primaryContent} />
              </View>

              {/* Title & Description */}
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.description}>
                Don't worry, it happens. Enter the email associated with your CAMPUS
                account and we'll send you instructions to reset it.
              </Text>

              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons
                    name="mail-outline"
                    size={20}
                    color="#94a3b8"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="student@university.edu"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              {/* Spacer */}
              <View style={styles.spacer} />

              {/* Reset Button */}
              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleReset}
                activeOpacity={0.9}
              >
                <Text style={styles.resetButtonText}>Send Reset Link</Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Remember your password?{' '}
                <Text style={styles.footerLink} onPress={handleLogin}>Log in</Text>
              </Text>
              <View style={styles.footerLinks}>
                <TouchableOpacity>
                  <Text style={styles.footerLinkSmall}>Contact Support</Text>
                </TouchableOpacity>
                <Text style={styles.footerDot}>•</Text>
                <TouchableOpacity>
                  <Text style={styles.footerLinkSmall}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
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
    width: 384,
    height: 384,
    backgroundColor: Colors.mintSoft,
    opacity: 0.6,
    borderRadius: 192,
  },
  decorBlur2: {
    position: 'absolute',
    bottom: 0,
    right: -80,
    width: 500,
    height: 500,
    backgroundColor: Colors.lilacSoft,
    opacity: 0.6,
    borderRadius: 250,
  },
  decorBlur3: {
    position: 'absolute',
    top: '33%',
    right: -40,
    width: 256,
    height: 256,
    backgroundColor: '#e0f7fa',
    opacity: 0.4,
    borderRadius: 128,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  header: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  mainContent: {
    flex: 1,
    paddingTop: Spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: `${Colors.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: 12,
  },
  description: {
    fontSize: FontSizes.md,
    color: '#64748b',
    lineHeight: 24,
    marginBottom: Spacing.xxl,
  },
  inputGroup: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#111818',
    paddingLeft: 4,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadows.sm,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingLeft: 44,
    paddingRight: 16,
    fontSize: FontSizes.md,
    color: '#111818',
  },
  spacer: {
    height: 16,
  },
  resetButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  resetButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.primaryContent,
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: '#64748b',
    marginBottom: Spacing.xl,
  },
  footerLink: {
    fontWeight: FontWeights.semibold,
    color: Colors.primaryContent,
    textDecorationLine: 'underline',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  footerLinkSmall: {
    fontSize: 12,
    color: '#94a3b8',
  },
  footerDot: {
    fontSize: 12,
    color: '#cbd5e1',
  },
});
