import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

interface ConfirmBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

export function ConfirmBottomSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = '#ef4444',
  icon = 'warning',
}: ConfirmBottomSheetProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, confirmColor);
  const slideAnim = React.useRef(new Animated.Value(300)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.sheet,
                {
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.handle} />
              
              <View style={styles.iconContainer}>
                <MaterialIcons name={icon} size={48} color={confirmColor} />
              </View>

              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelText}>{cancelText}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                  <Text style={styles.confirmText}>{confirmText}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>, confirmColor: string) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.xl,
      paddingTop: Spacing.sm,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: Colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: Spacing.lg,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    message: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: Spacing.xl,
    },
    actions: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.border,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      backgroundColor: confirmColor,
      alignItems: 'center',
    },
    confirmText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
  });
