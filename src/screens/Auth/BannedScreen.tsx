import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';

export default function BannedScreen() {
  const { isDark } = useTheme();
  const { banReason, banUntil, signOut } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const untilText = banUntil ? new Date(banUntil).toLocaleString() : 'Permanent suspension';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}> 
      <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
        <View style={styles.iconWrap}>
          <MaterialIcons name="gpp-bad" size={54} color="#ef4444" />
        </View>

        <Text style={[styles.title, { color: Colors.text }]}>Account Suspended</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>You cannot access CAMPUS right now.</Text>

        <View style={[styles.section, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
          <Text style={[styles.label, { color: Colors.textSecondary }]}>Reason</Text>
          <Text style={[styles.value, { color: Colors.text }]}>
            {banReason || 'Your account has been suspended by an administrator.'}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
          <Text style={[styles.label, { color: Colors.textSecondary }]}>Suspension</Text>
          <Text style={[styles.value, { color: Colors.text }]}>{untilText}</Text>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <MaterialIcons name="logout" size={18} color="#fff" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: Spacing.lg,
    },
    card: {
      borderWidth: 1,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      gap: 12,
    },
    iconWrap: {
      alignItems: 'center',
      marginBottom: 4,
    },
    title: {
      textAlign: 'center',
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
    },
    subtitle: {
      textAlign: 'center',
      fontSize: FontSizes.sm,
      marginBottom: 6,
    },
    section: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    label: {
      fontSize: FontSizes.xs,
      textTransform: 'uppercase',
      fontWeight: FontWeights.medium,
    },
    value: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    signOutBtn: {
      marginTop: 8,
      alignSelf: 'center',
      backgroundColor: '#ef4444',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    signOutText: {
      color: '#fff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
    },
  });
