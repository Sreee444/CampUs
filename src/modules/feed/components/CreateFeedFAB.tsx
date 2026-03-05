import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';

type Nav = StackNavigationProp<RootStackParamList>;

type Props = {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  style?: any;
};

/**
 * Floating Action Button for creating feed posts
 * Only visible to faculty and admin users
 * 
 * Usage:
 * <CreateFeedFAB />
 * <CreateFeedFAB position="top-left" />
 */
export default function CreateFeedFAB({ position = 'bottom-right', style }: Props) {
  const navigation = useNavigation<Nav>();
  const { profile } = useAuth();

  const role = (profile?.role || '').toLowerCase();
  const canCreateFeed = role === 'faculty' || role === 'admin';

  if (!canCreateFeed) {
    return null;
  }

  const handlePress = () => {
    navigation.navigate('CreateFeed');
  };

  const positionStyles = getPositionStyles(position);

  return (
    <TouchableOpacity
      style={[styles.fab, positionStyles, style]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <MaterialIcons name="edit" size={22} color="#ffffff" />
    </TouchableOpacity>
  );
}

function getPositionStyles(position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left') {
  switch (position) {
    case 'top-right':
      return { top: 24, right: 16, bottom: undefined, left: undefined };
    case 'top-left':
      return { top: 24, left: 16, bottom: undefined, right: undefined };
    case 'bottom-left':
      return { bottom: 24, left: 16, top: undefined, right: undefined };
    case 'bottom-right':
    default:
      return { bottom: 24, right: 16, top: undefined, left: undefined };
  }
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
