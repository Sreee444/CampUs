import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { MainTabParamList } from './types';
import { Colors } from '../theme';

import FeedScreen from '../screens/Home/FeedScreen';
import ProjectsScreen from '../screens/Projects/ProjectsScreen';
import EventsScreen from '../screens/Home/EventsScreen';
import DiscussionsScreen from '../screens/Home/DiscussionsScreen';
import ChatListScreen from '../screens/Home/ChatListScreen';
import ProfileScreen from '../screens/Home/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={FeedScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarLabel: 'Projects',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="folder-open" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{
          tabBarLabel: 'Events',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="event" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Discussions"
        component={DiscussionsScreen}
        options={{
          tabBarLabel: 'Discuss',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="forum" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatListScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="chat-bubble-outline" size={size} color={color} />
          ),
          tabBarBadge: 4,
          tabBarBadgeStyle: {
            backgroundColor: Colors.primary,
            color: '#ffffff',
            fontSize: 10,
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
