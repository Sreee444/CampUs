import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const MINT      = '#4FBFAF';          // deeper, richer mint
const MINT_GLOW = 'rgba(79,191,175,0.55)'; // calm glow, not neon
const DARK      = '#111818';
const BG        = '#fdfbf7';

// ─── Phase Durations (ms) ─────────────────────────────────────────────────────
const D_ICON    = 700;   // Phase 1: icon fades + scales + spins
const D_U_IN    = 420;   // Phase 2: "U" appears at screen center
const D_U_SLIDE = 520;   // Phase 3: "U" slides RIGHT to its correct position
const D_ATTRACT = 750;   // Phase 4: "Camp" + "s" attract inward
const D_TAGLINE = 560;   // Phase 5: tagline fades up
const GLOW_HALF = 950;   // Phase 6 (∞): U glow half-period
const TAGLINE_TEXT = 'Connect. Collaborate. Excel.';

// U starts this many px LEFT of its natural position to appear screen-centered.
// "Camp" (4 bold chars @ 54px) ≈ 118px wide; "s" ≈ 22px.
// Offset = (s_width - camp_width) / 2 ≈ (22 - 118) / 2 = -48
const U_CENTER_OFFSET = -50;

// ─────────────────────────────────────────────────────────────────────────────
export default function SplashScreen() {
  const [typedTagline, setTypedTagline] = useState('');
  const typingStartedRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const p1      = useSharedValue(0); // icon reveal
  const p2      = useSharedValue(0); // U appears at center
  const p3      = useSharedValue(0); // U slides right to position
  const p4      = useSharedValue(0); // Camp + s attract
  const p5      = useSharedValue(0); // tagline
  const uGlow   = useSharedValue(0); // continuous glow pulse
  const shimmer = useSharedValue(0); // loader bar

  const startTaglineTyping = () => {
    if (typingStartedRef.current) return;

    typingStartedRef.current = true;
    setTypedTagline('');

    let index = 0;
    typingTimerRef.current = setInterval(() => {
      index += 1;
      setTypedTagline(TAGLINE_TEXT.slice(0, index));

      if (index >= TAGLINE_TEXT.length && typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }, 60);
  };

  useEffect(() => {
    // Loader shimmer — runs immediately throughout
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.linear }),
      -1,
      false,
    );

    // ─── Phase 1: Icon ───────────────────────────────────────────────────────
    p1.value = withTiming(1, {
      duration: D_ICON,
      easing: Easing.out(Easing.cubic),
    }, (done) => {
      if (!done) return;

      // ─── Phase 2: U appears at screen center ──────────────────────────────
      p2.value = withTiming(1, {
        duration: D_U_IN,
        easing: Easing.out(Easing.exp),
      }, (done) => {
        if (!done) return;

        // ─── Phase 3: U slides RIGHT to its correct position ──────────────
        p3.value = withTiming(1, {
          duration: D_U_SLIDE,
          easing: Easing.out(Easing.exp),
        }, (done) => {
          if (!done) return;

          // ─── Phase 4: Camp + s magnetically attract ────────────────────
          p4.value = withTiming(1, {
            duration: D_ATTRACT,
            easing: Easing.out(Easing.exp),
          }, (done) => {
            if (!done) return;

            // ─── Phase 5: Tagline ─────────────────────────────────────────
            runOnJS(startTaglineTyping)();
            p5.value = withTiming(1, {
              duration: D_TAGLINE,
              easing: Easing.out(Easing.cubic),
            }, (done) => {
              if (!done) return;

              // ─── Phase 6: U glow loop (∞) ──────────────────────────────
              uGlow.value = withRepeat(
                withSequence(
                  withTiming(1, { duration: GLOW_HALF, easing: Easing.inOut(Easing.sin) }),
                  withTiming(0, { duration: GLOW_HALF, easing: Easing.inOut(Easing.sin) }),
                ),
                -1,
                false,
              );
            });
          });
        });
      });
    });

    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, []);

  // ── Phase 1: Icon — fade + scale 0.7→1 + slight spin -12°→0° ────────────
  const iconStyle = useAnimatedStyle(() => {
    const rotDeg = interpolate(p1.value, [0, 1], [-12, 0]);
    return {
      opacity: interpolate(p1.value, [0, 0.4], [0, 1], 'clamp'),
      transform: [
        { scale:  interpolate(p1.value, [0, 1], [0.70, 1]) },
        { rotate: `${rotDeg}deg` },
      ],
    };
  });

  // ── Phase 2 + 3: U animation ──────────────────────────────────────────────
  // Phase 2: U scales in at screen center (translateX = U_CENTER_OFFSET)
  // Phase 3: U slides RIGHT (translateX: U_CENTER_OFFSET → 0)
  // Phase 6: subtle glow pulse on opacity
  const uStyle = useAnimatedStyle(() => {
    // Phase 2 reveal: scale from 0.5 → 1 with soft overshoot keyframe
    const revealScale   = interpolate(p2.value, [0, 0.72, 1], [0.50, 1.06, 1.00]);
    // Phase 3 slide: U moves right from center offset to its natural position
    const slideX        = interpolate(p3.value, [0, 1], [U_CENTER_OFFSET, 0]);
    // Phase 6 glow: subtle opacity oscillation (0.9 ↔ 1.0)
    const glowPulse     = interpolate(uGlow.value, [0, 1], [0.90, 1.00]);
    const revealOpacity = interpolate(p2.value, [0, 1], [0, 1]);

    return {
      opacity: revealOpacity * glowPulse,
      transform: [
        { translateX: slideX },
        { scale: revealScale },
      ],
    };
  });

  // ── Phase 4: "Camp" — magnetic pull from left ─────────────────────────────
  //   Starts at translateX = -72 (off left), slides to 0
  //   scaleX stretches during travel → compresses on settle (magnetic feel)
  const campStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p4.value, [0, 0.28], [0, 1], 'clamp'),
    transform: [
      { translateX: interpolate(p4.value, [0, 1], [-72, 0]) },
      { scaleX:     interpolate(p4.value, [0, 0.60, 1], [0.70, 1.05, 1.00]) },
      { scaleY:     interpolate(p4.value, [0, 0.60, 1], [0.95, 0.97, 1.00]) },
    ],
  }));

  // ── Phase 4: "s" — magnetic pull from right ───────────────────────────────
  //   Starts at translateX = +44 (off right), slides to 0
  const sStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p4.value, [0, 0.28], [0, 1], 'clamp'),
    transform: [
      { translateX: interpolate(p4.value, [0, 1], [44, 0]) },
      { scaleX:     interpolate(p4.value, [0, 0.60, 1], [0.70, 1.05, 1.00]) },
      { scaleY:     interpolate(p4.value, [0, 0.60, 1], [0.95, 0.97, 1.00]) },
    ],
  }));

  // ── Phase 5: Tagline — letter spacing tightens as it fades up ─────────────
  // letterSpacing: 7 (wide/loose) → 2.5 (design value) — feels like "forming into place"
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity:       interpolate(p5.value, [0, 0.3, 1], [0, 0.4, 1]),
    letterSpacing: interpolate(p5.value, [0, 1], [7, 2.5]),
    transform: [
      { translateY: interpolate(p5.value, [0, 1], [10, 0]) },
    ],
  }));

  // ── Loader bar ────────────────────────────────────────────────────────────
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-50, 140]) },
    ],
  }));

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Ambient blobs */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />
      <View style={styles.blob3} />

      <View style={styles.content}>

        {/* Phase 1 — Icon fades + spins in */}
        <Animated.View style={[styles.iconCircle, iconStyle]}>
          <MaterialIcons name="school" size={48} color={DARK} />
        </Animated.View>

        {/* Wordmark row — U anchors center, letters attract afterward */}
        <View style={styles.wordmark}>

          {/* Phase 4 — "Camp" attracts from left */}
          <Animated.View style={campStyle}>
            <Text style={styles.wordDark}>Camp</Text>
          </Animated.View>

          {/* Phase 2+3 — "U" appears centered, then slides right to position */}
          <Animated.Text style={[styles.wordU, uStyle]}>U</Animated.Text>

          {/* Phase 4 — "s" attracts from right */}
          <Animated.View style={sStyle}>
            <Text style={styles.wordDark}>s</Text>
          </Animated.View>

        </View>

        {/* Phase 5 — Tagline */}
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          {typedTagline}
        </Animated.Text>

      </View>

      {/* Loader */}
      <View style={styles.footer}>
        <View style={styles.loaderTrack}>
          <Animated.View style={[styles.loaderBar, shimmerStyle]} />
        </View>
        <Text style={styles.versionText}>Version 1.0</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },

  blob1: {
    position: 'absolute', top: -80, left: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(111,211,193,0.07)',
  },
  blob2: {
    position: 'absolute', top: '40%', right: -60,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(237,231,246,0.50)',
  },
  blob3: {
    position: 'absolute', bottom: -100, left: '30%',
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(255,248,225,0.65)',
  },

  content: {
    alignItems: 'center',
    gap: 14,
  },

  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 5,
  },

  wordmark: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },

  wordDark: {
    fontSize: 54,
    fontWeight: '800',
    color: DARK,
    letterSpacing: -1.5,
    includeFontPadding: false,
  },

  wordU: {
    fontSize: 54,
    fontWeight: '800',
    color: MINT,
    letterSpacing: -1.5,
    includeFontPadding: false,
    textShadowColor: MINT_GLOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },

  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8a9bb0',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginTop: 6,
  },

  footer: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingHorizontal: 48,
  },
  loaderTrack: {
    width: 100, height: 3,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loaderBar: {
    width: 36, height: '100%',
    backgroundColor: MINT,
    borderRadius: 2,
    opacity: 0.88,
  },
  versionText: {
    fontSize: 11,
    color: '#a0aec0',
    fontWeight: '400',
    letterSpacing: 0.4,
  },
});