import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, LogBox } from 'react-native';
import { MainTabParamList } from './types';
import PremiumTabBar from '../components/navigation/PremiumTabBar';

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

export const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <PremiumTabBar {...props} />}
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
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
