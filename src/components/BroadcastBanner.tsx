import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type BroadcastBannerProps = {
  visible: boolean;
  title: string;
  message: string;
  imageUrl?: string | null;
  onClose: () => void;
};

export function BroadcastBanner({
  visible,
  title,
  message,
  imageUrl,
  onClose,
}: BroadcastBannerProps) {
  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -140,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateY, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.banner}>
        <View style={styles.headerRow}>
          <View style={styles.badge}>
            <MaterialIcons name="campaign" size={16} color="#0f172a" />
            <Text style={styles.badgeText}>Broadcast</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={18} color="#334155" />
          </TouchableOpacity>
        </View>

        <Text style={styles.title} numberOfLines={2}>{title || 'New Announcement'}</Text>
        <Text style={styles.message} numberOfLines={3}>{message || 'You received a new broadcast message.'}</Text>

        {!!imageUrl && (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  banner: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#bae6fd',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  image: {
    marginTop: 8,
    width: '100%',
    height: 110,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
});
