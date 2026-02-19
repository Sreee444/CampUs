import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PROJECT_STATUS_OPTIONS, getProjectStatusColor, SEMANTIC_COLORS } from '../utils/semanticColors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '../theme';

interface ProjectStatusModalProps {
  visible: boolean;
  currentStatus: string;
  projectName: string;
  onClose: () => void;
  onSelect: (status: string) => void;
}

export function ProjectStatusModal({
  visible,
  currentStatus,
  projectName,
  onClose,
  onSelect,
}: ProjectStatusModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity activeOpacity={1}>
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Change Project Status</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {projectName}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <MaterialIcons name="close" size={24} color={SEMANTIC_COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Status Options */}
              <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
                {PROJECT_STATUS_OPTIONS.map((option) => {
                  const isSelected = option.value === currentStatus;
                  const statusColor = getProjectStatusColor(option.value);
                  
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.optionItem,
                        isSelected && styles.optionItemSelected,
                        { borderLeftColor: statusColor.color }
                      ]}
                      onPress={() => {
                        onSelect(option.value);
                        onClose();
                      }}
                    >
                      <View
                        style={[
                          styles.iconContainer,
                          { backgroundColor: statusColor.bg }
                        ]}
                      >
                        <MaterialIcons
                          name={option.icon as any}
                          size={20}
                          color={statusColor.color}
                        />
                      </View>
                      <View style={styles.optionInfo}>
                        <Text style={styles.optionLabel}>{option.label}</Text>
                        <Text style={[styles.optionValue, { color: statusColor.color }]}>
                          {option.value}
                        </Text>
                      </View>
                      {isSelected && (
                        <MaterialIcons
                          name="check-circle"
                          size={24}
                          color={SEMANTIC_COLORS.success}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Status changes are visible to all team members
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SEMANTIC_COLORS.neutralLight,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: SEMANTIC_COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: SEMANTIC_COLORS.textSecondary,
    maxWidth: 250,
  },
  closeButton: {
    padding: 4,
  },
  optionsContainer: {
    maxHeight: 400,
    padding: Spacing.md,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: 8,
    backgroundColor: SEMANTIC_COLORS.appBg,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    gap: 12,
  },
  optionItemSelected: {
    backgroundColor: SEMANTIC_COLORS.successLight,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: SEMANTIC_COLORS.textPrimary,
    marginBottom: 2,
  },
  optionValue: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: SEMANTIC_COLORS.neutralLight,
    backgroundColor: SEMANTIC_COLORS.appBg,
  },
  footerText: {
    fontSize: FontSizes.xs,
    color: SEMANTIC_COLORS.textSecondary,
    textAlign: 'center',
  },
});
