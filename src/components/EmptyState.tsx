import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../theme';

type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={message ? `${title}. ${message}` : title}>
      <View style={styles.iconWrap}>
        <MaterialIcons name={icon} size={36} color={Colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
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
    </View>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.lg,
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
      marginBottom: Spacing.sm,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      textAlign: 'center',
    },
    message: {
      marginTop: 6,
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    actionButton: {
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.primary,
    },
    actionText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.primaryContent,
    },
  });
