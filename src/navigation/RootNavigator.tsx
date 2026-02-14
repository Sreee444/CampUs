import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { View, ActivityIndicator } from 'react-native';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';

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
import ChatConversationScreen from '../screens/Home/ChatConversationScreen';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading, profile } = useAuth();

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // Determine initial route based on auth and profile state
  const getInitialRoute = (): keyof RootStackParamList => {
    if (!isAuthenticated) return 'Login';
    if (!profile || !profile.role) return 'RoleSelection';
    if (!profile.full_name) return 'CompleteProfile';
    return 'MainTabs';
  };

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={getInitialRoute()}
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          presentation: 'card',
        }}
      >
        {!isAuthenticated ? (
          // Auth Stack
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Signup"
              component={SignupScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{ animationEnabled: true }}
            />
          </>
        ) : (
          // App Stack
          <>
            <Stack.Screen
              name="RoleSelection"
              component={RoleSelectionScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CompleteProfile"
              component={CompleteProfileScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MainTabs"
              component={MainTabNavigator}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="ProjectDetails"
              component={ProjectDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AcademicDetails"
              component={AcademicDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="SkillsInterests"
              component={SkillsInterestsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="ChangePassword"
              component={ChangePasswordScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="LinkedAccounts"
              component={LinkedAccountsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Privacy"
              component={PrivacyScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="ChatConversation"
              component={ChatConversationScreen}
              options={{ animationEnabled: true }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
