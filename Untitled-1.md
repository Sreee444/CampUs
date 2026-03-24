# File Tree: CampUs

**Generated:** 3/24/2026, 9:34:22 PM
**Root Path:** `c:\Users\SREENANDHU\CampUs\CampUs`

```
├── assets
│   ├── other
│   │   ├── adaptive-icon.png
│   │   ├── adaptive-icon1.png
│   │   ├── favicon.png
│   │   ├── icon.png
│   │   ├── icon1.png
│   │   ├── splash-icon.png
│   │   └── splash-icon1.png
│   ├── adaptive-icon.png
│   ├── favicon.png
│   ├── icon.png
│   └── splash-icon.png
├── campus-ai-server
│   ├── routes
│   │   ├── chat.js
│   │   ├── extractEvent.js
│   │   └── extractPoster.js
│   ├── services
│   │   ├── groqService.js
│   │   ├── ocrService.js
│   │   ├── qrService.js
│   │   └── scraperService.js
│   ├── uploads
│   ├── utils
│   │   └── jsonParser.js
│   ├── eng.traineddata
│   ├── package-lock.json
│   ├── package.json
│   └── server.js
├── src
│   ├── api
│   │   ├── admin.ts
│   │   ├── ai.ts
│   │   ├── auth.ts
│   │   ├── chat.ts
│   │   ├── connections.ts
│   │   ├── discussions.ts
│   │   ├── eventReminders.ts
│   │   ├── events.ts
│   │   ├── feed.ts
│   │   ├── mentors.ts
│   │   ├── mentorshipChat.ts
│   │   ├── notifications.ts
│   │   ├── projectChat.ts
│   │   ├── projects.ts
│   │   ├── supabase.ts
│   │   ├── userUtils.ts
│   │   └── users.ts
│   ├── components
│   │   ├── admin
│   │   │   ├── AdminFilterChips.tsx
│   │   │   └── AdminHeader.tsx
│   │   ├── navigation
│   │   │   └── PremiumTabBar.tsx
│   │   ├── BroadcastBanner.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── ConfirmBottomSheet.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── CountdownTimer.tsx
│   │   ├── DropdownSheet.tsx
│   │   ├── EventFeedItem.tsx
│   │   ├── GroupActivityTimeline.tsx
│   │   ├── Loader.tsx
│   │   ├── PinnedMessagesModal.tsx
│   │   ├── ProjectStatusModal.tsx
│   │   ├── ScreenWrapper.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── TeamCard.tsx
│   │   ├── Toast.tsx
│   │   ├── UserAvatar.tsx
│   │   └── UserProfileCard.tsx
│   ├── config
│   │   └── env.ts
│   ├── constants
│   │   └── academic.ts
│   ├── contexts
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── features
│   │   └── mentorshipChat
│   │       ├── MentorshipChatListScreen.tsx
│   │       └── MentorshipChatScreen.tsx
│   ├── hooks
│   │   └── useRealtimeRefresh.ts
│   ├── modules
│   │   ├── chat
│   │   ├── feed
│   │   │   ├── api
│   │   │   │   └── feed.ts
│   │   │   ├── components
│   │   │   │   ├── AcademicFeedPreview.tsx
│   │   │   │   ├── CreateFeedFAB.tsx
│   │   │   │   ├── FeedCard.tsx
│   │   │   │   ├── FeedFilterTabs.tsx
│   │   │   │   ├── FeedQuickAccess.tsx
│   │   │   │   └── TrendingFeed.tsx
│   │   │   ├── hooks
│   │   │   │   └── useFeedPosts.ts
│   │   │   ├── screens
│   │   │   │   ├── AcademicFeedScreen.tsx
│   │   │   │   ├── CreateFeedScreen.tsx
│   │   │   │   └── FeedDetailsScreen.tsx
│   │   │   ├── types
│   │   │   │   └── feed.ts
│   │   │   ├── utils
│   │   │   │   └── attachments.ts
│   │   │   └── index.ts
│   │   └── intercampus
│   │       ├── api
│   │       │   └── intercampus.ts
│   │       ├── components
│   │       │   ├── InterCampusEventCard.tsx
│   │       │   ├── InterCampusFestCard.tsx
│   │       │   └── InterCampusState.tsx
│   │       ├── hooks
│   │       │   └── useInterCampusEvents.ts
│   │       ├── screens
│   │       │   ├── AdminInterCampusManagementScreen.tsx
│   │       │   ├── CreateInterCampusEventScreen.tsx
│   │       │   ├── EditInterCampusEventScreen.tsx
│   │       │   ├── FacultyInterCampusDashboardScreen.tsx
│   │       │   ├── InterCampusDiscussionScreen.tsx
│   │       │   ├── InterCampusEventDetailsScreen.tsx
│   │       │   ├── InterCampusFestDetailsScreen.tsx
│   │       │   ├── InterCampusHomeScreen.tsx
│   │       │   ├── InterCampusSubmitEventScreen.tsx
│   │       │   ├── InterCampusTeamUpScreen.tsx
│   │       │   └── MySubmittedEventsScreen.tsx
│   │       ├── types
│   │       │   └── intercampus.ts
│   │       └── utils
│   │           └── eventDetails.ts
│   ├── navigation
│   │   ├── MainTabNavigator.tsx
│   │   ├── RootNavigator.tsx
│   │   └── types.ts
│   ├── screens
│   │   ├── Admin
│   │   │   ├── AIInsightsScreen.tsx
│   │   │   ├── AdminAnalyticsScreen.tsx
│   │   │   ├── AdminAuditScreen.tsx
│   │   │   ├── AdminBroadcastScreen.tsx
│   │   │   ├── AdminDashboardScreen.tsx
│   │   │   ├── AdminDiscussionsScreen.tsx
│   │   │   ├── AdminModerationScreen.tsx
│   │   │   ├── AdminReportsScreen.tsx
│   │   │   └── AdminUsersScreen.tsx
│   │   ├── Auth
│   │   │   ├── BannedScreen.tsx
│   │   │   ├── CompleteProfileScreen.tsx
│   │   │   ├── LoginScreen.tsx
│   │   │   └── ResetPasswordScreen.tsx
│   │   ├── Home
│   │   │   ├── AISuggestionsScreen.tsx
│   │   │   ├── AllUsersScreen.tsx
│   │   │   ├── BrowseTeamsScreen.tsx
│   │   │   ├── CalendarScreen.tsx
│   │   │   ├── ChatConversationScreen.tsx
│   │   │   ├── ChatListScreen.tsx
│   │   │   ├── CreateEventScreen.tsx
│   │   │   ├── CreateTeamScreen.tsx
│   │   │   ├── CreateTopicScreen.tsx
│   │   │   ├── DiscussionTopicScreen.tsx
│   │   │   ├── DiscussionsScreen.tsx
│   │   │   ├── EditEventScreen.tsx
│   │   │   ├── EventDetailsScreen.tsx
│   │   │   ├── EventDiscussionScreen.tsx
│   │   │   ├── EventRegisteredUsersScreen.tsx
│   │   │   ├── EventsScreen.tsx
│   │   │   ├── FeedScreen.tsx
│   │   │   ├── JoinTeamScreen.tsx
│   │   │   ├── MentorDashboardScreen.tsx
│   │   │   ├── MentorHubScreen.tsx
│   │   │   ├── MentorshipChatListScreen.tsx
│   │   │   ├── MentorshipChatScreen.tsx
│   │   │   ├── ProfileScreen.tsx
│   │   │   ├── PublicProfileScreen.tsx
│   │   │   ├── TeamConnectScreen.tsx
│   │   │   ├── TeamDetailsScreen.tsx
│   │   │   ├── TeamFormationScreen.tsx
│   │   │   └── TeamInvitationsScreen.tsx
│   │   ├── Notifications
│   │   │   ├── NotificationDetailsScreen.tsx
│   │   │   └── NotificationsScreen.tsx
│   │   ├── Projects
│   │   │   ├── CreateProjectScreen.tsx
│   │   │   ├── ProjectChatScreen.tsx
│   │   │   ├── ProjectDetailsScreen.tsx
│   │   │   └── ProjectsScreen.tsx
│   │   ├── Settings
│   │   │   ├── AcademicDetailsScreen.tsx
│   │   │   ├── ChangePasswordScreen.tsx
│   │   │   ├── EditProfileScreen.tsx
│   │   │   ├── LinkedAccountsScreen.tsx
│   │   │   ├── MentorProfileScreen.tsx
│   │   │   ├── NotificationSettingsScreen.tsx
│   │   │   ├── PrivacyScreen.tsx
│   │   │   ├── SettingsScreen.tsx
│   │   │   └── SkillsInterestsScreen.tsx
│   │   └── SplashScreen.tsx
│   ├── store
│   │   ├── projectStore.ts
│   │   └── userStore.ts
│   ├── theme
│   │   ├── colors.ts
│   │   └── index.ts
│   ├── types
│   │   └── database.ts
│   └── utils
│       ├── academic.ts
│       ├── consoleSuppression.ts
│       ├── discussionHelpers.ts
│       ├── eventEligibility.ts
│       ├── eventGuards.ts
│       ├── matchingUtils.ts
│       ├── roles.ts
│       ├── semanticColors.ts
│       ├── teamActions.ts
│       └── teamUtils.ts
├── utils
│   └── encryption.js
├── .gitignore
├── App.tsx
├── README.md
├── app.json
├── babel.config.js
├── index.ts
├── metro.config.js
├── package-lock.json
├── package.json
├── test-chats.js
└── tsconfig.json
```

---
*Generated by FileTree Pro Extension*