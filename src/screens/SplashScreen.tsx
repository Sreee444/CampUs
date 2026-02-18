import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, Easing } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';

export default function SplashScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const subtitleFadeAnim = useRef(new Animated.Value(0)).current;
  
  // Individual animations for each loading dot with improved stagger
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Icon fade in and scale up animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Title fade in with delay
    setTimeout(() => {
      Animated.timing(titleFadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 300);

    // Subtitle fade in with delay
    setTimeout(() => {
      Animated.timing(subtitleFadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 600);

    // Continuous slow rotation for logo container
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Pulsing shadow effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Improved staggered bouncing animation for loading dots
    const dot1Timeline = Animated.loop(
      Animated.sequence([
        Animated.timing(dot1Anim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dot1Anim, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const dot2Timeline = Animated.loop(
      Animated.sequence([
        Animated.delay(150),
        Animated.timing(dot2Anim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dot2Anim, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const dot3Timeline = Animated.loop(
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(dot3Anim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dot3Anim, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    dot1Timeline.start();
    dot2Timeline.start();
    dot3Timeline.start();
  }, [fadeAnim, scaleAnim, rotateAnim, pulseAnim, titleFadeAnim, subtitleFadeAnim, dot1Anim, dot2Anim, dot3Anim]);

  const rotationValue = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });

  const shadowRadius = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4.65, 12],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Logo/Icon Container with Rotation and Pulsing Shadow */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              backgroundColor: colors.primary,
              transform: [{ rotate: rotationValue }],
              shadowOpacity: shadowOpacity,
              shadowRadius: shadowRadius,
            },
          ]}
        >
          <Image
            source={require('../../assets/icon.png')}
            style={styles.icon}
            resizeMode="contain"
          />
        </Animated.View>

        {/* App Name with Fade In */}
        <Animated.Text style={[styles.title, { color: colors.text, opacity: titleFadeAnim }]}>
          CampUs
        </Animated.Text>

        {/* Tagline with Fade In */}
        <Animated.Text style={[styles.subtitle, { color: colors.textSecondary, opacity: subtitleFadeAnim }]}>
          Connect. Collaborate. Create.
        </Animated.Text>

        {/* Loading Indicator with Improved Staggered Animation */}
        <View style={styles.loadingContainer}>
          <Animated.View
            style={[
              styles.loadingDot,
              {
                backgroundColor: colors.primary,
                opacity: dot1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
                transform: [
                  {
                    scale: dot1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1.3],
                    }),
                  },
                  {
                    translateY: dot1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -8],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.loadingDot,
              {
                backgroundColor: colors.primary,
                opacity: dot2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
                transform: [
                  {
                    scale: dot2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1.3],
                    }),
                  },
                  {
                    translateY: dot2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -8],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.loadingDot,
              {
                backgroundColor: colors.primary,
                opacity: dot3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
                transform: [
                  {
                    scale: dot3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1.3],
                    }),
                  },
                  {
                    translateY: dot3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -8],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Campus Collaboration Platform
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
  },
  icon: {
    width: 80,
    height: 80,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 60,
    letterSpacing: 0.8,
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
  },
  footerText: {
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '400',
  },
});
