export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  RoleSelection: undefined;
  CompleteProfile: undefined;
  ResetPassword: undefined;
  MainTabs: undefined;
  Settings: undefined;
  ProjectDetails: undefined;
  EditProfile: undefined;
  AcademicDetails: undefined;
  SkillsInterests: undefined;
  ChangePassword: undefined;
  LinkedAccounts: undefined;
  Notifications: undefined;
  Privacy: undefined;
  ChatConversation: { name?: string; initials?: string; color?: string };
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
