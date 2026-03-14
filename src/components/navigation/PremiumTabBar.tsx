import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACTIVE = '#10B981';
const INACTIVE = '#94A3B8';
const BORDER = '#E8ECF2';

type TabConfig = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const TAB_CONFIG: Record<string, TabConfig> = {
  Projects: { label: 'Projects', icon: 'work-outline' },
  Events: { label: 'Events', icon: 'event' },
  Home: { label: 'Home', icon: 'home-filled' },
  Chat: { label: 'Chat', icon: 'chat-bubble-outline' },
  Profile: { label: 'Profile', icon: 'person-outline' },
};

export default function PremiumTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const homeRoute = useMemo(() => state.routes.find((r) => r.name === 'Home'), [state.routes]);
  
  // Floating animation
  const floatAnim = useRef(new Animated.Value(0)).current;
  // Glow fade animation
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Continuous floating animation
  useEffect(() => {
    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -3,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    floating.start();
    return () => floating.stop();
  }, [floatAnim]);

  // Glow fade when home is focused
  const homeFocused = state.routes[state.index]?.name === 'Home';
  
  useEffect(() => {
    if (homeFocused) {
      // Fade in then fade out
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [homeFocused, glowAnim]);

  const handlePress = (routeName: string, routeKey: string, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const renderTabSlot = (routeName: 'Projects' | 'Events' | 'Chat' | 'Profile') => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) {
      return <View style={styles.tabSlot} />;
    }

    const config = TAB_CONFIG[routeName];
    const isFocused = state.routes[state.index].key === route.key;

    return (
      <TouchableOpacity
        key={route.key}
        style={styles.tabSlot}
        onPress={() => handlePress(route.name, route.key, isFocused)}
        activeOpacity={0.82}
      >
        <MaterialIcons name={config.icon} size={24} color={isFocused ? ACTIVE : INACTIVE} />
        <Text style={[styles.tabLabel, { color: isFocused ? ACTIVE : INACTIVE }]}>{config.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.outerWrap, { paddingBottom: 0, marginBottom: 0 }]}> 
      <View style={styles.glassBar}>
        <View style={styles.row}>
          {renderTabSlot('Projects')}
          {renderTabSlot('Events')}
          <View style={styles.tabSlot} />
          {renderTabSlot('Chat')}
          {renderTabSlot('Profile')}
        </View>
      </View>

      {homeRoute ? (
        <View style={styles.homeWrap} pointerEvents="box-none">
          {/* Glow ring with fade animation */}
          <Animated.View
            style={[
              styles.homeGlow,
              {
                opacity: glowAnim,
                transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
              },
            ]}
          />
          <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handlePress('Home', homeRoute.key, homeFocused)}
              style={styles.homeTouch}
            >
              <LinearGradient
                colors={homeFocused ? ['#059669', '#0891b2'] : ['#10B981', '#06B6D4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.homeFab,
                  homeFocused && styles.homeFabActive,
                ]}
              >
                <MaterialIcons name="home-filled" size={30} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  glassBar: {
    height: 75,
    paddingTop: 6,
    paddingBottom: 12,
    marginBottom: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    paddingHorizontal: 4,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
  },
  homeWrap: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeTouch: {
    borderRadius: 32,
  },
  homeFab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  homeFabActive: {
    shadowColor: '#10B981',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 4,
  },
  homeGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
});
