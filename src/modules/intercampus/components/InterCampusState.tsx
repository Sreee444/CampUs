import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  title?: string;
  subtitle?: string;
  loading?: boolean;
};

export default function InterCampusState({ title, subtitle, loading }: Props) {
  return (
    <View style={styles.wrap}>
      {loading ? <ActivityIndicator color="#0f766e" /> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
});
