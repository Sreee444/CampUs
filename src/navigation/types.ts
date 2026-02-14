export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  RoleSelection: undefined;
  CompleteProfile: undefined;
  ResetPassword: undefined;
  MainTabs: undefined;
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
  AIChatAssistant: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Projects: undefined;
  Events: undefined;
  Chat: undefined;
  Profile: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
