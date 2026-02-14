import { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Projects: undefined;
  Events: undefined;
  Discussions: undefined;
  Chat: undefined;
  Profile: undefined;
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
  Privacy: undefined;
  ChatConversation: { conversationId: string; name: string; isGroup: boolean };
  DiscussionTopic: { topicId: string };
  CreateTopic: undefined;
  CreateProject: undefined;
  CreateEvent: undefined;
  EventDetails: { eventId: string };
  AIChatAssistant: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
