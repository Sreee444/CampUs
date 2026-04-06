import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { View, ActivityIndicator, Modal, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';

// Import screens
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import BannedScreen from '../screens/Auth/BannedScreen';
import CompleteProfileScreen from '../screens/Auth/CompleteProfileScreen';
import ResetPasswordScreen from '../screens/Auth/ResetPasswordScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import EditProfileScreen from '../screens/Settings/EditProfileScreen';
import AcademicDetailsScreen from '../screens/Settings/AcademicDetailsScreen';
import SkillsInterestsScreen from '../screens/Settings/SkillsInterestsScreen';
import ChangePasswordScreen from '../screens/Settings/ChangePasswordScreen';
import LinkedAccountsScreen from '../screens/Settings/LinkedAccountsScreen';
import NotificationSettingsScreen from '../screens/Settings/NotificationSettingsScreen';
import PrivacyScreen from '../screens/Settings/PrivacyScreen';
import HelpCenterScreen from '../screens/Settings/HelpCenterScreen';
import TermsOfServiceScreen from '../screens/Settings/TermsOfServiceScreen';
import PrivacyPolicyScreen from '../screens/Settings/PrivacyPolicyScreen';
import MyReportsScreen from '../screens/Home/MyReportsScreen';
import ProjectDetailsScreen from '../screens/Projects/ProjectDetailsScreen';
import ProjectInviteMembersScreen from '../screens/Projects/ProjectInviteMembersScreen';
import CreateProjectScreen from '../screens/Projects/CreateProjectScreen';
import CreateEventScreen from '../screens/Home/CreateEventScreen';
import EditEventScreen from '../screens/Home/EditEventScreen';
import EventDetailsScreen from '../screens/Home/EventDetailsScreen';
import EventDiscussionScreen from '../screens/Home/EventDiscussionScreen';
import EventRegisteredUsersScreen from '../screens/Home/EventRegisteredUsersScreen';
import CalendarScreen from '../screens/Home/CalendarScreen';
import TeamFormationScreen from '../screens/Home/TeamFormationScreen';
import ChatConversationScreen from '../screens/Home/ChatConversationScreen';
import DiscussionTopicScreen from '../screens/Home/DiscussionTopicScreen';
import CreateTopicScreen from '../screens/Home/CreateTopicScreen';
import AllUsersScreen from '../screens/Home/AllUsersScreen';
import DiscussionsScreen from '../screens/Home/DiscussionsScreen';
import CreateTeamScreen from '../screens/Home/CreateTeamScreen';
import TeamDetailsScreen from '../screens/Home/TeamDetailsScreen';
import JoinTeamScreen from '../screens/Home/JoinTeamScreen';
import TeamConnectScreen from '../screens/Home/TeamConnectScreen';
import BrowseTeamsScreen from '../screens/Home/BrowseTeamsScreen';
import NotificationsScreen from '../screens/Notifications/NotificationsScreen';
import NotificationDetailsScreen from '../screens/Notifications/NotificationDetailsScreen';
import AdminDashboardScreen from '../screens/Admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/Admin/AdminUsersScreen';
import AdminAddUserScreen from '../screens/Admin/AdminAddUserScreen';
import AdminModerationScreen from '../screens/Admin/AdminModerationScreen';
import AdminReportsScreen from '../screens/Admin/AdminReportsScreen';
import AdminBroadcastScreen from '../screens/Admin/AdminBroadcastScreen';
import AdminAnalyticsScreen from '../screens/Admin/AdminAnalyticsScreen';
import AdminDiscussionsScreen from '../screens/Admin/AdminDiscussionsScreen';
import AdminAuditScreen from '../screens/Admin/AdminAuditScreen';
import MentorHubScreen from '../screens/Home/MentorHubScreen';
import MentorDashboardScreen from '../screens/Home/MentorDashboardScreen';
import QuickRecommendationsScreen from '../screens/Home/QuickRecommendationsScreen';
import MentorshipRequestDetailsScreen from '../screens/Home/MentorshipRequestDetailsScreen';
import MentorshipChatScreen from '../screens/Home/MentorshipChatScreen';
import MentorshipChatListScreen from '../screens/Home/MentorshipChatListScreen';
import ProjectChatScreen from '../screens/Projects/ProjectChatScreen';
import AIInsightsScreen from '../screens/Admin/AIInsightsScreen';
import AISuggestionsScreen from '../screens/Home/AISuggestionsScreen';
import TeamInvitationsScreen from '../screens/Home/TeamInvitationsScreen';
import InterCampusHomeScreen from '../modules/intercampus/screens/InterCampusHomeScreen';
import InterCampusSubmitEventScreen from '../modules/intercampus/screens/InterCampusSubmitEventScreen';
import InterCampusEventDetailsScreen from '../modules/intercampus/screens/InterCampusEventDetailsScreen';
import InterCampusFestDetailsScreen from '../modules/intercampus/screens/InterCampusFestDetailsScreen';
import InterCampusTeamUpScreen from '../modules/intercampus/screens/InterCampusTeamUpScreen';
import InterCampusDiscussionScreen from '../modules/intercampus/screens/InterCampusDiscussionScreen';
import MySubmittedEventsScreen from '../modules/intercampus/screens/MySubmittedEventsScreen';
import FacultyInterCampusDashboardScreen from '../modules/intercampus/screens/FacultyInterCampusDashboardScreen';
import AdminInterCampusManagementScreen from '../modules/intercampus/screens/AdminInterCampusManagementScreen';
import CreateInterCampusEventScreen from '../modules/intercampus/screens/CreateInterCampusEventScreen';
import EditInterCampusEventScreen from '../modules/intercampus/screens/EditInterCampusEventScreen';
import { AcademicFeedScreen, FeedDetailsScreen, CreateFeedScreen } from '../modules/feed';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createStackNavigator<RootStackParamList>();

// Minimum time (ms) the splash screen is shown after auth resolves
const SPLASH_MIN_MS = 2000;

export default function RootNavigator() {
  const { isAuthenticated, isLoading, profile, isBanned, isPasswordRecovery,
    showDefaultPasswordPrompt, dismissDefaultPasswordPrompt } = useAuth();
  const navigationRef = useRef<any>(null);
  const isStudent = profile?.role === 'student';
  const hasCompletedProfile = Boolean(profile?.full_name?.trim() && profile?.roll_number?.trim());
  const requiresStudentOnboarding = Boolean(isStudent && !hasCompletedProfile);

  // Keep splash visible for at least SPLASH_MIN_MS after auth finishes loading
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShowSplash(false), SPLASH_MIN_MS);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Navigate based on auth and profile state changes
  useEffect(() => {
    if (!isLoading && navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute()?.name;

      if (!isAuthenticated) {
        // ChangePassword exists in both stacks; after sign-out from forced change,
        // explicitly route to Login so users don't get stuck on the same screen.
        const allowedUnauthScreens = ['Login', 'ResetPassword'];
        if (!currentRoute || !allowedUnauthScreens.includes(currentRoute)) {
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
        return;
      }

      // Password recovery: always route to ChangePassword first
      if (isPasswordRecovery) {
        if (currentRoute !== 'ChangePassword') {
          navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'ChangePassword', params: { forceChange: true } }],
          });
        }
        return;
      }

      // Determine where user should be
      let targetRoute: keyof RootStackParamList | null = null;

      // Profile completion gate
      if (isBanned) {
        targetRoute = 'Banned';
      } else if (requiresStudentOnboarding) {
        targetRoute = 'CompleteProfile';
      } else {
        targetRoute = 'MainTabs';
      }

      // Only navigate if we're not already at the target and not on a nested screen
      const onboardingScreens = ['CompleteProfile', 'Login'];
      const shouldForceBanned = targetRoute === 'Banned' && currentRoute !== 'Banned';
      const shouldExitBanned = currentRoute === 'Banned' && targetRoute !== 'Banned';
      const shouldHandleOnboarding =
        !!targetRoute && !!currentRoute && onboardingScreens.includes(currentRoute) && currentRoute !== targetRoute;

      if ((shouldForceBanned || shouldExitBanned || shouldHandleOnboarding) && targetRoute) {
        navigationRef.current.reset({
          index: 0,
          routes: [{
            name: targetRoute,
            state: targetRoute === 'MainTabs' ? {
              routes: [{ name: 'Home' }],
            } : undefined,
          }],
        });
      }
    }
  }, [isAuthenticated, isLoading, profile?.role, profile?.full_name, profile?.roll_number, isBanned, isPasswordRecovery, requiresStudentOnboarding]);

  // Show splash while auth is loading OR during the 2-second hold
  if (isLoading || showSplash) {
    return <SplashScreen />;
  }

  // Determine initial route based on auth and profile state
  const getInitialRoute = (): keyof RootStackParamList => {
    if (!isAuthenticated) return 'Login';
    if (isPasswordRecovery) return 'ChangePassword';
    if (isBanned) return 'Banned';
    // Go to CompleteProfile only for students with missing required fields
    if (requiresStudentOnboarding) return 'CompleteProfile';
    return 'MainTabs';
  };

  return (<>
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
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{ animationEnabled: true }}
            />
            {/* Only expose ChangePassword in auth stack during password recovery. */}
            {isPasswordRecovery && (
              <Stack.Screen
                name="ChangePassword"
                component={ChangePasswordScreen}
                options={{ animationEnabled: true, gestureEnabled: false }}
              />
            )}
          </>
        ) : isBanned ? (
          <>
            <Stack.Screen
              name="Banned"
              component={BannedScreen}
              options={{ animationEnabled: true, gestureEnabled: false }}
            />
          </>
        ) : (
          // App Stack
          <>
            {/* RoleSelection removed */}
            {isStudent && (
              <Stack.Screen
                name="CompleteProfile"
                component={CompleteProfileScreen}
                options={{ animationEnabled: true }}
              />
            )}
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
              name="ProjectInviteMembers"
              component={ProjectInviteMembersScreen}
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
              name="NotificationSettings"
              component={NotificationSettingsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Privacy"
              component={PrivacyScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="HelpCenter"
              component={HelpCenterScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="TermsOfService"
              component={TermsOfServiceScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MyReports"
              component={MyReportsScreen}
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
              name="EditEvent"
              component={EditEventScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="EventDetails"
              component={EventDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="EventDiscussion"
              component={EventDiscussionScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="EventRegisteredUsers"
              component={EventRegisteredUsersScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Calendar"
              component={CalendarScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="TeamFormation"
              component={TeamFormationScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="PublicProfile"
              getComponent={() => require('../screens/Home/PublicProfileScreen').default}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AllUsers"
              component={AllUsersScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="Discussions"
              component={DiscussionsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CreateTeam"
              component={CreateTeamScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="TeamDetails"
              component={TeamDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="JoinTeam"
              component={JoinTeamScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="TeamConnect"
              component={TeamConnectScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="BrowseTeams"
              component={BrowseTeamsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboardScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminUsers"
              component={AdminUsersScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminAddUser"
              component={AdminAddUserScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminModeration"
              component={AdminModerationScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminReports"
              component={AdminReportsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminBroadcast"
              component={AdminBroadcastScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminAnalytics"
              component={AdminAnalyticsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminDiscussions"
              component={AdminDiscussionsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AIInsights"
              component={AIInsightsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="QuickRecommendations"
              component={QuickRecommendationsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AISuggestions"
              component={AISuggestionsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="TeamInvitations"
              component={TeamInvitationsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="NotificationDetails"
              component={NotificationDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminAudit"
              component={AdminAuditScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MentorHub"
              component={MentorHubScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MentorDashboard"
              component={MentorDashboardScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MentorshipRequestDetails"
              component={MentorshipRequestDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MentorshipChatList"
              component={MentorshipChatListScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MentorshipChat"
              component={MentorshipChatScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="ProjectChat"
              component={ProjectChatScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="InterCampusHome"
              component={InterCampusHomeScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="InterCampusSubmitEvent"
              component={InterCampusSubmitEventScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="InterCampusEventDetails"
              component={InterCampusEventDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="InterCampusFestDetails"
              component={InterCampusFestDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="InterCampusTeamUp"
              component={InterCampusTeamUpScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="InterCampusDiscussion"
              component={InterCampusDiscussionScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="MySubmittedEvents"
              component={MySubmittedEventsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="FacultyInterCampusDashboard"
              component={FacultyInterCampusDashboardScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AdminInterCampusManagement"
              component={AdminInterCampusManagementScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CreateInterCampusEvent"
              component={CreateInterCampusEventScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="EditInterCampusEvent"
              component={EditInterCampusEventScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="AcademicFeed"
              component={AcademicFeedScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="FeedDetails"
              component={FeedDetailsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen
              name="CreateFeed"
              component={CreateFeedScreen}
              options={{ animationEnabled: true }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>

    {/* Default Password Change Prompt — shown globally after login with default pw */}
    <Modal
      visible={showDefaultPasswordPrompt}
      transparent
      animationType="slide"
      onRequestClose={dismissDefaultPasswordPrompt}
    >
      <TouchableOpacity
        style={dpStyles.overlay}
        activeOpacity={1}
        onPress={dismissDefaultPasswordPrompt}
      >
        <TouchableOpacity activeOpacity={1} style={dpStyles.sheet}>
          <View style={dpStyles.handle} />
          <View style={dpStyles.iconWrap}>
            <MaterialIcons name="lock-open" size={30} color="#4f46e5" />
          </View>
          <Text style={dpStyles.title}>You're Using a Default Password</Text>
          <Text style={dpStyles.body}>
            You logged in with the system-assigned default password. For your security, we recommend changing it to something personal right away.
          </Text>
          <TouchableOpacity
            style={dpStyles.primaryBtn}
            onPress={() => {
              dismissDefaultPasswordPrompt();
              navigationRef.current?.navigate('ChangePassword');
            }}
          >
            <MaterialIcons name="lock" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={dpStyles.primaryBtnText}>Change Password Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={dpStyles.laterBtn}
            onPress={dismissDefaultPasswordPrompt}
          >
            <Text style={dpStyles.laterBtnText}>Remind Me Later</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  </>);
}

const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    marginBottom: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 300,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
    marginBottom: 12,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  laterBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  laterBtnText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
});
