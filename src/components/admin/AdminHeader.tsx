import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type AdminHeaderProps = {
  title: string;
  subtitle?: string;
  count?: number;
  onBack?: () => void;
  onRefresh?: () => void;
};

export default function AdminHeader({ title, subtitle, count, onBack, onRefresh }: AdminHeaderProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <View style={styles.outer}>
      <View style={[styles.wrap, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={styles.accentBar} />

        <View style={styles.row}>
          <TouchableOpacity onPress={onBack} style={[styles.iconBtn, { borderColor: Colors.border }]} disabled={!onBack}>
            <MaterialIcons name="arrow-back" size={20} color={onBack ? Colors.text : 'transparent'} />
          </TouchableOpacity>

          <View style={styles.center}>
            <Text style={[styles.kicker, { color: Colors.textSecondary }]}>ADMIN OPERATIONS</Text>
            <Text style={[styles.title, { color: Colors.text }]} numberOfLines={1}>{title}</Text>
            {!!subtitle && (
              <Text style={[styles.subtitle, { color: Colors.textSecondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>

          <View style={styles.rightWrap}>
            {typeof count === 'number' ? (
              <View style={[styles.countBadge, { backgroundColor: Colors.primary }]}>
                <Text style={styles.countText}>{count}</Text>
                <Text style={styles.countLabel}>LIVE</Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, { borderColor: Colors.border }]} disabled={!onRefresh}>
              <MaterialIcons name="sync" size={19} color={onRefresh ? Colors.primary : 'transparent'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footerMetaRow}>
          <MaterialIcons name="verified-user" size={14} color={Colors.primary} />
          <Text style={[styles.footerMetaText, { color: Colors.textSecondary }]}>Realtime governance enabled</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    outer: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    wrap: {
      borderWidth: 1,
      borderRadius: BorderRadius.xl,
      overflow: 'hidden',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
    },
    accentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: '#0ea5e9',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
      borderWidth: 1,
    },
    center: {
      flex: 1,
      paddingHorizontal: 6,
    },
    kicker: {
      fontSize: 10,
      fontWeight: FontWeights.bold,
      letterSpacing: 0.9,
      textAlign: 'center',
      marginBottom: 2,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: FontSizes.xs,
      textAlign: 'center',
      marginTop: 1,
    },
    rightWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 36,
      justifyContent: 'flex-end',
    },
    countBadge: {
      minWidth: 36,
      height: 36,
      borderRadius: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: FontWeights.bold,
    },
    countLabel: {
      color: '#fff',
      fontSize: 8,
      fontWeight: FontWeights.bold,
      marginTop: -1,
      letterSpacing: 0.5,
    },
    footerMetaRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    footerMetaText: {
      fontSize: 10,
      fontWeight: FontWeights.medium,
    },
  });
