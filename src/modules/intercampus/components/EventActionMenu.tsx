import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export type EventActionMenuOption = {
  id: string;
  label: string;
  icon: string;
  color?: string;
  isDangerous?: boolean;
  onPress: () => void;
};

type Props = {
  options: EventActionMenuOption[];
};

export default function EventActionMenu({ options }: Props) {
  const [visible, setVisible] = useState(false);

  const handleOptionPress = (option: EventActionMenuOption) => {
    option.onPress();
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.menuBtn}
        onPress={() => setVisible(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="more-vert" size={18} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.overlay}
          onPress={() => setVisible(false)}
        >
          <View style={styles.sheet}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.option,
                  option.isDangerous && styles.optionDangerous,
                ]}
                onPress={() => handleOptionPress(option)}
              >
                <MaterialIcons
                  name={option.icon as any}
                  size={18}
                  color={option.isDangerous ? '#b91c1c' : option.color || '#6B7280'}
                />
                <Text
                  style={[
                    styles.optionText,
                    option.isDangerous && styles.optionTextDangerous,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    paddingTop: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  optionDangerous: {
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  optionTextDangerous: {
    color: '#b91c1c',
    fontWeight: '600',
  },
});
