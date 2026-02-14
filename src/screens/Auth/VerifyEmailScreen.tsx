import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { supabase } from '../../api/supabase';

type VerifyEmailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'VerifyEmail'>;
type VerifyEmailScreenRouteProp = RouteProp<RootStackParamList, 'VerifyEmail'>;

export default function VerifyEmailScreen() {
  const navigation = useNavigation<VerifyEmailScreenNavigationProp>();
  const route = useRoute<VerifyEmailScreenRouteProp>();
  const { email } = route.params;
  const [isResending, setIsResending] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Pulse animation for the envelope icon
  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleResendEmail = async () => {
    try {
      setIsResending(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Email sent!',
        text2: 'Check your inbox for the verification link',
      });
    } catch (error: any) {
      console.error('Resend error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to resend',
        text2: error?.message || 'Please try again later',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckEmailApp = () => {
    // This would ideally open the native email app
    // On web, you might want to show instructions instead
    Toast.show({
      type: 'info',
      text1: 'Check your email app',
      text2: 'Look for an email from CampUs',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#e0f7fa', '#f3e5f5']} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Login')}
          >
            <MaterialIcons name="arrow-back" size={24} color="#111818" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CAMPUS</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          {/* Animated Envelope Icon */}
          <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="mail-outline" size={80} color={Colors.primary} />
            </View>
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>Verify Your Email</Text>
          
          {/* Subtitle */}
          <Text style={styles.subtitle}>
            We've sent a verification link to
          </Text>
          <Text style={styles.email}>{email}</Text>

          {/* Instructions Card */}
          <View style={styles.instructionsCard}>
            <View style={styles.instructionRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={styles.instructionText}>
                Check your inbox (and spam folder)
              </Text>
            </View>
            
            <View style={styles.instructionRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={styles.instructionText}>
                Click the verification link in the email
              </Text>
            </View>
            
            <View style={styles.instructionRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.instructionText}>
                Return here and log in to your account
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.9}
          >
            <MaterialIcons name="login" size={20} color="#111818" />
            <Text style={styles.primaryButtonText}>Go to Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButtonAlt}
            onPress={handleCheckEmailApp}
            activeOpacity={0.7}
          >
            <MaterialIcons name="email" size={20} color="#475569" />
            <Text style={styles.secondaryButtonTextAlt}>Open Email App</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleResendEmail}
            disabled={isResending}
            activeOpacity={0.7}
          >
            <MaterialIcons 
              name="refresh" 
              size={20} 
              color={Colors.primary} 
            />
            <Text style={styles.secondaryButtonText}>
              {isResending ? 'Sending...' : 'Resend Verification Email'}
            </Text>
          </TouchableOpacity>

          {/* Already Verified Section */}
          <View style={styles.verifiedSection}>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Already verified?</Text>
              <View style={styles.dividerLine} />
            </View>
            
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <MaterialIcons name="login" size={20} color="#ffffff" />
              <Text style={styles.loginButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <MaterialIcons name="info-outline" size={18} color="#6366f1" />
            <Text style={styles.infoText}>
              The verification link expires in <Text style={styles.infoBold}>24 hours</Text>
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Wrong email?{' '}
              <Text 
                style={styles.footerLink} 
                onPress={() => navigation.navigate('Signup')}
              >
                Sign up again
              </Text>
            </Text>
          </View>
        </View>
      </LinearGradient>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: FontWeights.bold,
    color: '#111818',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  instructionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 400,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
    ...Shadows.md,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  instructionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: '#475569',
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.lg,
    width: '100%',
    maxWidth: 400,
    marginBottom: Spacing.md,
    ...Shadows.lg,
  },
  primaryButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
    width: '100%',
    maxWidth: 400,
    marginBottom: Spacing.lg,
  },
  secondaryButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  secondaryButtonAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    width: '100%',
    maxWidth: 400,
    marginBottom: Spacing.md,
  },
  secondaryButtonTextAlt: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#475569',
  },
  verifiedSection: {
    width: '100%',
    maxWidth: 400,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#cbd5e1',
  },
  dividerText: {
    marginHorizontal: Spacing.sm,
    fontSize: FontSizes.sm,
    color: '#64748b',
    fontWeight: FontWeights.medium,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#334155',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.lg,
    width: '100%',
    ...Shadows.md,
  },
  loginButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    marginBottom: Spacing.xl,
  },
  infoText: {
    fontSize: FontSizes.sm,
    color: '#4338ca',
  },
  infoBold: {
    fontWeight: FontWeights.bold,
  },
  footer: {
    marginTop: Spacing.md,
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: '#64748b',
    textAlign: 'center',
  },
  footerLink: {
    fontWeight: FontWeights.semibold,
    color: '#111818',
    textDecorationLine: 'underline',
  },
});
