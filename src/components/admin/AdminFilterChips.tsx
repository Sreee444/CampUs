import React from 'react';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type FilterOption<T extends string> = {
  label: string;
  value: T;
  count?: number;
};

type AdminFilterChipsProps<T extends string> = {
  options: FilterOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
};

export default function AdminFilterChips<T extends string>({ options, selected, onSelect }: AdminFilterChipsProps<T>) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                { borderColor: Colors.border, backgroundColor: Colors.surface },
                active && { backgroundColor: Colors.primary + '14', borderColor: Colors.primary },
              ]}
              onPress={() => onSelect(option.value)}
            >
              <Text style={[styles.label, { color: active ? Colors.primary : Colors.textSecondary }]}>{option.label}</Text>
              {typeof option.count === 'number' ? (
                <View
                  style={[
                    styles.count,
                    { backgroundColor: active ? Colors.primary : Colors.background, borderColor: active ? Colors.primary : Colors.border },
                  ]}
                >
                  <Text style={[styles.countText, { color: active ? '#fff' : Colors.textSecondary }]}>{option.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    wrap: {
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
    },
    row: {
      paddingHorizontal: Spacing.md,
      gap: Spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingVertical: 9,
      paddingHorizontal: 11,
    },
    label: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    count: {
      minWidth: 20,
      height: 20,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
      borderWidth: 1,
    },
    countText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.bold,
    },
  });
