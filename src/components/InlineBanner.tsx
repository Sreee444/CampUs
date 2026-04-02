import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../theme';

type BannerType = 'error' | 'warning' | 'info' | 'success';

type InlineBannerProps = {
  type?: BannerType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

const TYPE_STYLES: Record<BannerType, { bg: string; border: string; text: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  error: { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B', icon: 'error-outline' },
  warning: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: 'warning-amber' },
  info: { bg: '#E0F2FE', border: '#0EA5E9', text: '#0C4A6E', icon: 'info-outline' },
  success: { bg: '#DCFCE7', border: '#22C55E', text: '#166534', icon: 'check-circle-outline' },
};

export function InlineBanner({
  type = 'info',
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: InlineBannerProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const theme = TYPE_STYLES[type];
  const styles = createStyles(Colors, theme);

  return (
    <View
      style={styles.container}
      accessibilityRole={type === 'error' ? 'alert' : 'text'}
      accessibilityLabel={message ? `${title}. ${message}` : title}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name={theme.icon} size={20} color={theme.text} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      {(actionLabel && onAction) ? (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {onDismiss ? (
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
        >
          <MaterialIcons name="close" size={18} color={theme.text} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>, theme: { bg: string; border: string; text: string }) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      ...Shadows.sm,
    },
    iconWrap: {
      marginTop: 2,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: theme.text,
    },
    message: {
      marginTop: 2,
      fontSize: FontSizes.sm,
      color: theme.text,
    },
    actionButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    actionText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    dismissButton: {
      marginLeft: Spacing.xs,
      padding: 4,
      borderRadius: 999,
    },
  });
