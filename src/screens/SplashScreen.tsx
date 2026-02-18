import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function SplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    // Fade in and scale up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Float animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer loader
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 3,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />
      <View style={styles.blob3} />

      {/* Central content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: floatAnim },
            ],
          },
        ]}
      >
        {/* Logo circle */}
        <View style={styles.iconCircle}>
          <MaterialIcons name="school" size={48} color="#111818" />
        </View>

        {/* App name */}
        <Text style={styles.title}>CampUs</Text>

        {/* Tagline */}
        <Text style={styles.subtitle}>Connect. Collaborate. Excel.</Text>
      </Animated.View>

      {/* Footer loader */}
      <View style={styles.footer}>
        <View style={styles.loaderTrack}>
          <Animated.View
            style={[
              styles.loaderBar,
              {
                transform: [
                  {
                    translateX: shimmerAnim.interpolate({
                      inputRange: [-1, 3],
                      outputRange: [-120, 120],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
        <Text style={styles.versionText}>Version 2.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfbf7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  blob1: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(19,236,236,0.08)',
  },
  blob2: {
    position: 'absolute',
    top: '40%',
    right: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(237,231,246,0.6)',
  },
  blob3: {
    position: 'absolute',
    bottom: -100,
    left: '30%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,248,225,0.7)',
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#111818',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: 48,
  },
  loaderTrack: {
    width: 120,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loaderBar: {
    width: 40,
    height: '100%',
    backgroundColor: '#13ecec',
    borderRadius: 2,
  },
  versionText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '400',
  },
});
