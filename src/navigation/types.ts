import { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Events: undefined;
  Projects: undefined;
  Home: undefined;
  Profile: undefined;
  Chat: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  VerifyEmail: { email: string };
  CompleteProfile: undefined;
  ResetPassword: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Settings: undefined;
  ProjectDetails: { teamId: string };
  EditProfile: undefined;
  AcademicDetails: undefined;
  SkillsInterests: undefined;
  ChangePassword: undefined;
  LinkedAccounts: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  Privacy: undefined;
  ChatConversation: { conversationId: string; name: string; isGroup: boolean };
  DiscussionTopic: { topicId: string };
  CreateTopic: undefined;
  CreateProject: undefined;
  CreateEvent: undefined;
  EventDetails: { eventId: string };
  EventRegisteredUsers: { eventId: string; eventTitle: string };
  EventDiscussion: { eventId: string };
  Calendar: undefined;
  TeamFormation: undefined;
  AIChatAssistant: undefined;
  PublicProfile: { userId: string };
  AllUsers: { mode?: 'browse' | 'message' } | undefined;
  Discussions: undefined;
  CreateTeam: { eventId: string; maxTeamSize: number };
  TeamDetails: { teamId: string; eventId: string };
  JoinTeam: { eventId: string };
  TeamConnect: { eventId: string; requiredRoles: string[]; teamId?: string };
  BrowseTeams: { eventId: string };
  AdminDashboard: undefined;
  AdminUsers: undefined;
  AdminModeration: undefined;
  AdminReports: undefined;
  AdminBroadcast: undefined;
  AdminAnalytics: undefined;
  AdminDiscussions: undefined;
  AIInsights: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList { }
  }
}
