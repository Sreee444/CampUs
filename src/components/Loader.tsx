import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

type LoaderProps = {
  size?: number | 'small' | 'large';
  color?: string;
};

export default function Loader({ size = 'large', color = '#2563eb' }: LoaderProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
