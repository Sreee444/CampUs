import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type TermsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TermsOfService'>;

export default function TermsOfServiceScreen() {
  const navigation = useNavigation<TermsScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <MaterialIcons name="gavel" size={20} color={Colors.primary} />
          <Text style={styles.infoText}>
            By using CampUs, you agree to the terms below. Please review them carefully.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acceptance of Terms</Text>
          <Text style={styles.bodyText}>
            You must follow these terms and all applicable policies when using the app. If you do
            not agree, please stop using CampUs.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eligibility and Accounts</Text>
          <Text style={styles.bodyText}>
            CampUs is intended for verified campus users. Accounts are provisioned by campus administration,
            and you must use your assigned account responsibly.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Responsibilities</Text>
          <Text style={styles.bodyText}>
            Keep your account secure, provide accurate information, and respect other users.
            You are responsible for all activity on your account.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content and Conduct</Text>
          <Text style={styles.bodyText}>
            Do not post harmful, illegal, or abusive content. We may remove content or restrict
            access if it violates community standards.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Termination</Text>
          <Text style={styles.bodyText}>
            We may suspend or restrict accounts that violate these terms, campus rules, or put the community at risk.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Changes to Terms</Text>
          <Text style={styles.bodyText}>
            Terms may change over time. We will update this page when changes occur.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    padding: 16,
    borderRadius: BorderRadius.md,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.primary,
    lineHeight: 20,
  },
  section: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  bodyText: {
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: 22,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
});
