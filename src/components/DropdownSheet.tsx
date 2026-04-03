import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme';

type DropdownSheetProps = {
  visible: boolean;
  title: string;
  options: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
};

export default function DropdownSheet({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: DropdownSheetProps) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: '#fffaf4' }]} onPress={() => {}}>
          <Text style={[styles.title, { color: Colors.text }]}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.option}
                onPress={() => onSelect(option)}
              >
                <Text style={[styles.optionText, { color: Colors.text }]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,15,20,0.24)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    borderRadius: 24,
    maxHeight: '65%',
    paddingVertical: 8,
    overflow: 'hidden',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

