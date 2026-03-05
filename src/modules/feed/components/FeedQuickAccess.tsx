import React from 'react';
import { TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../../navigation/types';

type Nav = StackNavigationProp<RootStackParamList>;

type Props = {
  style?: any;
  compact?: boolean;
};

/**
 * Quick access button to navigate to Academic Feed
 * Can be added to HomeScreen/FeedScreen header or quick actions area
 * 
 * Usage:
 * <FeedQuickAccess />
 * <FeedQuickAccess compact /> // Just icon
 * <FeedQuickAccess style={customStyle} />
 */
export default function FeedQuickAccess({ style, compact }: Props) {
  const navigation = useNavigation<Nav>();

  const handlePress = () => {
    navigation.navigate('AcademicFeed');
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactBtn, style]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <MaterialIcons name="newspaper" size={20} color="#0f766e" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View style={styles.content}>
        <MaterialIcons name="newspaper" size={18} color="#0f766e" />
        <Text style={styles.label}>Academic Feed</Text>
      </View>
      <MaterialIcons name="arrow-forward" size={18} color="#0f766e" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdfa',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#99f6e0',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
  },
  compactBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#99f6e0',
  },
});
