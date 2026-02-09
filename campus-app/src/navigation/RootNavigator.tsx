import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { RootStackParamList } from './types';

// Import screens
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import RoleSelectionScreen from '../screens/Auth/RoleSelectionScreen';
import CompleteProfileScreen from '../screens/Auth/CompleteProfileScreen';
import ResetPasswordScreen from '../screens/Auth/ResetPasswordScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import EditProfileScreen from '../screens/Settings/EditProfileScreen';
import AcademicDetailsScreen from '../screens/Settings/AcademicDetailsScreen';
import SkillsInterestsScreen from '../screens/Settings/SkillsInterestsScreen';
import ChangePasswordScreen from '../screens/Settings/ChangePasswordScreen';
import LinkedAccountsScreen from '../screens/Settings/LinkedAccountsScreen';
import NotificationsScreen from '../screens/Settings/NotificationsScreen';
import PrivacyScreen from '../screens/Settings/PrivacyScreen';
import ProjectDetailsScreen from '../screens/Projects/ProjectDetailsScreen';
import ChatConversationScreen from '../screens/Chat/ChatConversationScreen';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          presentation: 'card',
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Signup"
          component={SignupScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="RoleSelection"
          component={RoleSelectionScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="CompleteProfile"
          component={CompleteProfileScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="ResetPassword"
          component={ResetPasswordScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="MainTabs"
          component={MainTabNavigator}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="ProjectDetails"
          component={ProjectDetailsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfileScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="AcademicDetails"
          component={AcademicDetailsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="SkillsInterests"
          component={SkillsInterestsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="ChangePassword"
          component={ChangePasswordScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="LinkedAccounts"
          component={LinkedAccountsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Privacy"
          component={PrivacyScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="ChatConversation"
          component={ChatConversationScreen}
          options={{
            animationEnabled: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
