import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger',
}: ConfirmDialogProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const getIconColor = () => {
    switch (type) {
      case 'danger':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      default:
        return '#ef4444';
    }
  };

  const getIconName = () => {
    switch (type) {
      case 'danger':
        return 'delete-outline' as const;
      case 'warning':
        return 'warning' as const;
      case 'info':
        return 'info-outline' as const;
      default:
        return 'delete-outline' as const;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '15' }]}>
            <MaterialIcons name={getIconName()} size={32} color={getIconColor()} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmButton, { backgroundColor: getIconColor() }]}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.lg,
    },
    dialog: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xl,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...Shadows.lg,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: Spacing.sm,
      textAlign: 'center',
    },
    message: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      marginBottom: Spacing.xl,
      textAlign: 'center',
      lineHeight: 22,
    },
    buttonContainer: {
      flexDirection: 'row',
      width: '100%',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 4,
    },
    cancelButton: {
      backgroundColor: Colors.background,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    confirmButton: {
      backgroundColor: '#ef4444',
    },
    cancelButtonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    confirmButtonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#ffffff',
    },
  });
