import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  LogBox,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { MainTabParamList } from './types';

import FeedScreen from '../screens/Home/FeedScreen';
import ProjectsScreen from '../screens/Projects/ProjectsScreen';
import EventsScreen from '../screens/Home/EventsScreen';
import ChatListScreen from '../screens/Home/ChatListScreen';
import ProfileScreen from '../screens/Home/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Suppress native driver warning on web
if (Platform.OS === 'web') {
  LogBox.ignoreLogs([
    'Animated: `useNativeDriver` is not supported',
    'useNativeDriver',
  ]);
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? route.name;
        const isFocused = state.index === index;
        const isCenter = index === 2; // Home is center

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const getIcon = (routeName: string): keyof typeof MaterialIcons.glyphMap => {
          switch (routeName) {
            case 'Events': return 'event';
            case 'Projects': return 'folder-open';
            case 'Home': return 'home';
            case 'Profile': return 'person';
            case 'Chat': return 'chat-bubble-outline';
            default: return 'home';
          }
        };

        if (isCenter) {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.centerTabWrapper}
              activeOpacity={0.85}
            >
              <View style={[styles.centerButton, isFocused && styles.centerButtonActive]}>
                <MaterialIcons name="home" size={28} color="#ffffff" />
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={getIcon(route.name)}
              size={24}
              color={isFocused ? '#13ecec' : '#94a3b8'}
            />
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ tabBarLabel: 'Projects' }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{ tabBarLabel: 'Events' }}
      />
      <Tab.Screen
        name="Home"
        component={FeedScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatListScreen}
        options={{ tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.5)',
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
  },
  tabLabelActive: {
    color: '#13ecec',
    fontWeight: '700',
  },
  centerTabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111818',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginTop: -24,
    shadowColor: '#111818',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  centerButtonActive: {
    backgroundColor: '#0d9488',
  },
});
