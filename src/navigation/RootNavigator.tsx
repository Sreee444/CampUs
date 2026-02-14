import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { View, ActivityIndicator } from 'react-native';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';

// Import screens
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import VerifyEmailScreen from '../screens/Auth/VerifyEmailScreen';
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
import CreateProjectScreen from '../screens/Projects/CreateProjectScreen';
import CreateEventScreen from '../screens/Home/CreateEventScreen';
import EventDetailsScreen from '../screens/Home/EventDetailsScreen';
import ChatConversationScreen from '../screens/Home/ChatConversationScreen';
import DiscussionTopicScreen from '../screens/Home/DiscussionTopicScreen';
import CreateTopicScreen from '../screens/Home/CreateTopicScreen';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const navigationRef = useRef<any>(null);

  // Navigate based on auth and profile state changes
  useEffect(() => {
    if (!isLoading && navigationRef.current && isAuthenticated) {
      const currentRoute = navigationRef.current.getCurrentRoute()?.name;

      // Determine where user should be
      let targetRoute: keyof RootStackParamList | null = null;

      // Role is now set during signup, so skip RoleSelection
      if (!profile || !profile.full_name) {
        targetRoute = 'CompleteProfile';
      } else {
        targetRoute = 'MainTabs';
      }

      // Only navigate if we're not already at the target and not on a nested screen
      const onboardingScreens = ['CompleteProfile', 'Login', 'Signup'];
      if (targetRoute && currentRoute && onboardingScreens.includes(currentRoute) && currentRoute !== targetRoute) {
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: targetRoute }],
        });
      }
    }
  }, [isAuthenticated, isLoading, profile?.full_name]);

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
    // Role is set during signup, so go straight to CompleteProfile if name is missing
    if (!profile || !profile.full_name) return 'CompleteProfile';
    return 'MainTabs';
  };

  return (
    <NavigationContainer ref={navigationRef}>
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
              name="VerifyEmail"
              component={VerifyEmailScreen}
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
            {/* RoleSelection removed - role is now set during signup */}
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
            <Stack.Screen
              name="DiscussionTopic"
              component={DiscussionTopicScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CreateTopic"
              component={CreateTopicScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CreateProject"
              component={CreateProjectScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CreateEvent"
              component={CreateEventScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="EventDetails"
              component={EventDetailsScreen}
              options={{ animationEnabled: true }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
