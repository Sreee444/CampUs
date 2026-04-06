import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
  Image,
  ImageBackground,
  ScrollView,
  Animated,
  GestureResponderEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { BorderRadius, FontSizes, FontWeights, getColors, Shadows, Spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import { UserAvatar } from '../../components/UserAvatar';
import ChatMessageBubble from '../../components/ChatMessageBubble';
import PinnedMessagesModal from '../../components/PinnedMessagesModal';
import { getCleanInitials } from '../../utils/roles';
import { supabase } from '../../api/supabase';
import {
  addMessageReaction,
  addParticipantsToGroup,
  addConversationSupervisor,
  canFacultySupervise,
  chatWithAI,
  deleteMessage,
  getMessageReactions,
  getConversationDetails,
  getConversationSupervisionStats,
  getConversationSupervisor,
  getUserStatus,
  getMessages,
  markConversationAsRead,
  removeMessageReaction,
  removeConversationSupervisor,
  removeParticipantFromGroup,
  deleteGroupConversation,
  sendMessage,
  setTyping,
  removeTyping,
  subscribeToTyping,
  setGroupParticipantAdmin,
  updateGroupConversation,
  uploadGroupAvatar,
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  getGroupAnnouncements,
  createGroupAnnouncement,
  deactivateGroupAnnouncement,
  forwardMessage,
  updateUserStatus,
  ChatMessageReaction,
  getChatPreference,
  setChatBackgroundImage,
  removeChatBackgroundImage,
  uploadChatBackgroundToStorage,
  uploadChatAttachment,
  getPendingGroupJoinRequests,
  reviewGroupJoinRequest,
} from '../../api/chat';
import {
  ConnectionStatusResult,
  ConnectionWithProfile,
  acceptConnectionRequest,
  getConnectionStatus,
  getMyConnections,
  rejectConnectionRequest,
  sendConnectionRequest,
} from '../../api/connections';
import { getEvents } from '../../api/events';
import { getProjectTeams } from '../../api/projects';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import ReportModal from '../../components/ReportModal';
import { decryptMessage } from '../../../utils/encryption';
import { CHAT_THEME_KEY, CHAT_THEMES, ChatTheme, withHexAlpha } from '../../constants/chatThemes';
import { ReportContentType } from '../../types/database';

type ChatConversationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ChatConversation'>;
type ChatConversationScreenRouteProp = RouteProp<RootStackParamList, 'ChatConversation'>;

type ChatMessage = {
  id: string;
  sender_id: string;
  content?: string;
  message_type?: 'text' | 'image' | 'file' | 'system';
  attachment_url?: string;
  created_at: string;
  seen_by_others?: boolean;
  seen_by_count?: number;
  aiOptions?: Array<{
    id: string;
    label: string;
    action: string;
    itemType?: 'event' | 'project';
    itemTitle?: string;
  }>;
  aiContext?: {
    itemType?: 'event' | 'project';
    itemTitle?: string;
  };
  sender?: {
    id?: string;
    full_name?: string;
    avatar_url?: string;
    role?: string;
  };
};

type GroupedReaction = {
  count: number;
  hasCurrentUser: boolean;
};

type ChatPollPayload = {
  question: string;
  options: string[];
  allowsMultiple?: boolean;
  createdBy?: string;
  createdAt?: string;
};

const POLL_MESSAGE_PREFIX = '__poll__:';
const POLL_REACTION_PREFIX = 'poll:';

const MAIN_MENU_AI_OPTIONS = [
  { id: 'ai-browse-events', label: 'Events', action: 'browse-events' },
  { id: 'ai-browse-projects', label: 'Projects', action: 'browse-projects' },
];

type GroupParticipant = {
  id: string;
  user_id: string;
  is_admin: boolean;
  role?: string;
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
    role?: string;
    department?: string;
    bio?: string;
  };
};

const createAiMessage = (
  content: string,
  options?: ChatMessage['aiOptions'],
  aiContext?: ChatMessage['aiContext']
): ChatMessage => ({
  id: `${Date.now()}-ai-${Math.random().toString(36).slice(2, 8)}`,
  content,
  sender_id: 'ai',
  created_at: new Date().toISOString(),
  aiOptions: options,
  aiContext,
  sender: {
    id: 'ai',
    full_name: 'Campus AI',
  },
});

const createUserDraftMessage = (content: string, senderId: string): ChatMessage => ({
  id: `${Date.now()}-self-${Math.random().toString(36).slice(2, 8)}`,
  content,
  sender_id: senderId,
  created_at: new Date().toISOString(),
});

const createMainMenuMessage = (): ChatMessage =>
  createAiMessage('What do you want to know about?', MAIN_MENU_AI_OPTIONS as ChatMessage['aiOptions']);

export default function ChatConversationScreen() {
  const navigation = useNavigation<ChatConversationScreenNavigationProp>();
  const route = useRoute<ChatConversationScreenRouteProp>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [canSupervise, setCanSupervise] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [supervisionStats, setSupervisionStats] = useState<any>(null);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showAddGroupMembers, setShowAddGroupMembers] = useState(false);
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [selectedMember, setSelectedMember] = useState<GroupParticipant | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupAvatarDraft, setGroupAvatarDraft] = useState('');
  const [groupBioDraft, setGroupBioDraft] = useState('');
  const [groupVisibilityDraft, setGroupVisibilityDraft] = useState<'private' | 'public'>('private');
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);
  const [groupDetails, setGroupDetails] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<GroupParticipant[]>([]);
  const [availableConnections, setAvailableConnections] = useState<ConnectionWithProfile[]>([]);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [reportModalState, setReportModalState] = useState({
    visible: false,
    contentType: 'message' as ReportContentType,
    contentId: '',
  });
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<Array<{ id: string; uri: string }>>([]);
  const [pendingGroupJoinRequests, setPendingGroupJoinRequests] = useState<any[]>([]);
  const [isLoadingGroupJoinRequests, setIsLoadingGroupJoinRequests] = useState(false);
  const [activeJoinReviewId, setActiveJoinReviewId] = useState<string | null>(null);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [pinnedMessageCount, setPinnedMessageCount] = useState(0);
  const [latestPinnedMessage, setLatestPinnedMessage] = useState<any>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<any>(null);
  const [showPinnedBanner, setShowPinnedBanner] = useState(false);
  const [showAnnouncementBanner, setShowAnnouncementBanner] = useState(false);
  const [showPinnedActions, setShowPinnedActions] = useState(false);
  const [showAnnouncementActions, setShowAnnouncementActions] = useState(false);
  const [showCreateAnnouncement, setShowCreateAnnouncement] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [chatTheme, setChatTheme] = useState<ChatTheme>(CHAT_THEMES[0]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [chatPollVotesSheet, setChatPollVotesSheet] = useState<null | {
    question: string;
    options: string[];
    counts: number[];
    votersByOption: Array<Array<{ id: string; name: string; avatar?: string }>>;
  }>(null);
  const [messageReactions, setMessageReactions] = useState<Map<string, ChatMessageReaction[]>>(new Map());
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
  const [directPartnerStatus, setDirectPartnerStatus] = useState<'online' | 'away' | 'offline' | null>(null);
  const [directConnectionStatus, setDirectConnectionStatus] = useState<ConnectionStatusResult>({ status: 'none' });
  const [isUpdatingDirectRequest, setIsUpdatingDirectRequest] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [realtimeRetryTick, setRealtimeRetryTick] = useState(0);
  const announcementPulse = useSharedValue(1);
  const announcementSlide = useSharedValue(-100);
  const announcementScale = useSharedValue(0.95);
  const announcementIconRotate = useSharedValue(0);
  const listRef = useRef<FlatList>(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef<TextInput | null>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSignalAtRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reactionChoices = ['👍', '❤️', '😂', '😮', '😢', '👏'];

  const TYPING_IDLE_MS = 2200;
  const TYPING_HEARTBEAT_MS = 1400;

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => { } });

  // ── Hidden messages ("Delete for me") ────────────────────────────────────
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());

  const hideMessageForMe = React.useCallback(async (messageId: string) => {
    try {
      const cid = (route.params as any)?.conversationId ?? '';
      const uid = user?.id ?? 'x';
      const key = `hidden_msgs_${uid}_${cid}`;
      const raw = await AsyncStorage.getItem(key);
      const existing: string[] = raw ? JSON.parse(raw) : [];
      const updated = Array.from(new Set([...existing, messageId]));
      await AsyncStorage.setItem(key, JSON.stringify(updated));
      setHiddenMessageIds(new Set(updated));
      setMessages(prev => prev.filter(m => m.id !== messageId));
      Toast.show({ type: 'success', text1: 'Message removed for you' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not remove message' });
    }
  }, [user?.id, route.params]);


  // Animated styles for announcement banner
  const announcementAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: announcementScale.value,
      marginTop: announcementSlide.value,
    } as any;
  });

  const announcementIconAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotateZ: `${announcementIconRotate.value}deg` }] as any,
    };
  });

  const { conversationId = '', name = 'Chat', isGroup = false, partnerUserId } = route.params || {};
  const isAIChat = conversationId === 'ai-assistant';

  // Load saved chat theme
  useEffect(() => {
    AsyncStorage.getItem(CHAT_THEME_KEY).then((val) => {
      if (val) {
        const found = CHAT_THEMES.find((t) => t.key === val);
        if (found) setChatTheme(found);
      }
    });
  }, []);

  // Load chat background preference
  useEffect(() => {
    if (!conversationId || !user?.id || isAIChat) return;

    const loadBackground = async () => {
      try {
        const preference = (await getChatPreference(user.id, conversationId)) as
          | { background_image_url?: string | null }
          | null;
        if (preference?.background_image_url) {
          setBackgroundImageUrl(preference.background_image_url);
        }
      } catch (error) {
        console.error('Failed to load background preference:', error);
      }
    };

    loadBackground();
  }, [conversationId, user?.id, isAIChat]);

  const selectChatTheme = (theme: ChatTheme) => {
    setChatTheme(theme);
    AsyncStorage.setItem(CHAT_THEME_KEY, theme.key);
    setShowThemePicker(false);
    Toast.show({ type: 'success', text1: `${theme.label} theme applied` });
  };

  const parsePollPayload = useCallback((content?: string): ChatPollPayload | null => {
    if (!content || !content.startsWith(POLL_MESSAGE_PREFIX)) return null;
    try {
      const raw = content.slice(POLL_MESSAGE_PREFIX.length);
      const parsed = JSON.parse(raw) as ChatPollPayload;
      const validOptions = Array.isArray(parsed.options)
        ? parsed.options.map((item) => `${item || ''}`.trim()).filter(Boolean)
        : [];
      if (!parsed.question?.trim() || validOptions.length < 2) return null;
      return {
        ...parsed,
        question: parsed.question.trim(),
        options: validOptions,
      };
    } catch {
      return null;
    }
  }, []);

  const getPollReactionKey = (optionIndex: number) => `${POLL_REACTION_PREFIX}${optionIndex}`;

  const resetPollDraft = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const addPollOptionField = () => {
    setPollOptions((prev) => {
      if (prev.length >= 6) return prev;
      return [...prev, ''];
    });
  };

  const headerChromeColor = useMemo(
    () => withHexAlpha(chatTheme.bubbleColor, backgroundImageUrl ? 0.28 : 0.16),
    [chatTheme.bubbleColor, backgroundImageUrl]
  );
  const headerChromeBorder = useMemo(
    () => withHexAlpha(chatTheme.bubbleColor, 0.35),
    [chatTheme.bubbleColor]
  );
  const composerBorderColor = useMemo(
    () => withHexAlpha(chatTheme.bubbleColor, 0.3),
    [chatTheme.bubbleColor]
  );
  const pollComposerBg = chatTheme.bubbleColor;
  const pollComposerIconColor = pollComposerBg === chatTheme.bubbleColor ? '#fff' : chatTheme.bubbleColor;

  const upsertMessage = (nextMessage: ChatMessage) => {
    setMessages((prev) => {
      const exists = prev.some((item) => item.id === nextMessage.id);
      const updated = exists
        ? prev.map((item) => (item.id === nextMessage.id ? nextMessage : item))
        : [...prev, nextMessage];

      return updated.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  };

  const appendAiSequence = React.useCallback((nextEntries: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...nextEntries]);
  }, []);

  const buildAiItemQuestion = React.useCallback((itemType: 'event' | 'project', itemTitle: string) => {
    if (itemType === 'event') {
      return createAiMessage(
        `What should I tell you about ${itemTitle}?`,
        [
          { id: `${itemTitle}-back`, label: 'Back to main menu', action: 'main-menu' },
          { id: `${itemTitle}-details`, label: 'Details', action: 'event-details', itemType, itemTitle },
          { id: `${itemTitle}-venue`, label: 'Venue', action: 'event-venue', itemType, itemTitle },
          { id: `${itemTitle}-time`, label: 'Time', action: 'event-date', itemType, itemTitle },
        ],
        { itemType, itemTitle }
      );
    }

    return createAiMessage(
      `What should I tell you about ${itemTitle}?`,
      [
        { id: `${itemTitle}-back`, label: 'Back to main menu', action: 'main-menu' },
        { id: `${itemTitle}-details`, label: 'Details', action: 'project-details', itemType, itemTitle },
        { id: `${itemTitle}-status`, label: 'Status', action: 'project-status', itemType, itemTitle },
        { id: `${itemTitle}-recruiting`, label: 'Recruiting', action: 'project-recruiting', itemType, itemTitle },
      ],
      { itemType, itemTitle }
    );
  }, []);

  const seedAiChat = React.useCallback(async () => {
    if (!user?.id) {
      setMessages([createMainMenuMessage()]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const seededMessages: ChatMessage[] = [
        createMainMenuMessage(),
      ];

      setMessages(seededMessages);
    } catch (error) {
      console.error('Failed to seed AI chat:', error);
      setMessages([createMainMenuMessage()]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const handleAiOptionPress = React.useCallback(async (option: NonNullable<ChatMessage['aiOptions']>[number]) => {
    if (!user?.id || isSending) return;

    if (option.action === 'main-menu') {
      setMessages([createMainMenuMessage()]);
      return;
    }

    const title = option.itemTitle || option.label;
    const userMessage = createUserDraftMessage(option.label, user.id);
    appendAiSequence([userMessage]);

    if (option.action === 'select-event' && title) {
      appendAiSequence([buildAiItemQuestion('event', title)]);
      return;
    }

    if (option.action === 'select-project' && title) {
      appendAiSequence([buildAiItemQuestion('project', title)]);
      return;
    }

    if (option.action === 'browse-events') {
      setIsSending(true);
      try {
        const upcomingEvents = await getEvents(user.id, undefined, 'upcoming');
        const upcomingEventOptions = (upcomingEvents || []).slice(0, 8).map((event: any) => ({
          id: `event-${event.id}`,
          label: event.title,
          action: 'select-event',
          itemType: 'event' as const,
          itemTitle: event.title,
        }));

        appendAiSequence([
          createAiMessage(
            upcomingEventOptions.length
              ? 'Here are upcoming events. Select one event.'
              : 'No upcoming events found right now.',
            upcomingEventOptions.length
              ? [...upcomingEventOptions, { id: 'events-back', label: 'Back to main menu', action: 'main-menu' }]
              : [{ id: 'events-back', label: 'Back to main menu', action: 'main-menu' }]
          ),
        ]);
      } catch (error) {
        console.error('Failed to load events for AI:', error);
        appendAiSequence([
          createAiMessage('I could not load events right now. Please try again.', [
            { id: 'events-back', label: 'Back to main menu', action: 'main-menu' },
          ]),
        ]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (option.action === 'browse-projects') {
      setIsSending(true);
      try {
        const recruitingProjects = await getProjectTeams(user.id, true);
        const projectOptions = (recruitingProjects || []).slice(0, 8).map((project: any) => ({
          id: `project-${project.id}`,
          label: project.name,
          action: 'select-project',
          itemType: 'project' as const,
          itemTitle: project.name,
        }));

        appendAiSequence([
          createAiMessage(
            projectOptions.length
              ? 'Here are active projects. Select one project.'
              : 'No active projects found right now.',
            projectOptions.length
              ? [...projectOptions, { id: 'projects-back', label: 'Back to main menu', action: 'main-menu' }]
              : [{ id: 'projects-back', label: 'Back to main menu', action: 'main-menu' }]
          ),
        ]);
      } catch (error) {
        console.error('Failed to load projects for AI:', error);
        appendAiSequence([
          createAiMessage('I could not load projects right now. Please try again.', [
            { id: 'projects-back', label: 'Back to main menu', action: 'main-menu' },
          ]),
        ]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    setIsSending(true);
    try {
      let prompt = title;

      if (option.action === 'event-details') prompt = `Give event details for ${title}`;
      if (option.action === 'event-venue') prompt = `What is the venue of event ${title}`;
      if (option.action === 'event-date') prompt = `What is the time of event ${title}`;
      if (option.action === 'event-status') prompt = `What is the status of event ${title}`;
      if (option.action === 'project-details') prompt = `Give project details for ${title}`;
      if (option.action === 'project-status') prompt = `What is the status of project ${title}`;
      if (option.action === 'project-recruiting') prompt = `Is project ${title} recruiting`;

      const aiResponse = await chatWithAI(user.id, prompt);
      appendAiSequence([
        createAiMessage(
          aiResponse,
          title && option.itemType
            ? [
                { id: `${title}-again-back`, label: 'Back to main menu', action: 'main-menu' },
                {
                  id: `${title}-again-1`,
                  label: 'Details',
                  action: option.itemType === 'event' ? 'event-details' : 'project-details',
                  itemType: option.itemType,
                  itemTitle: title,
                },
                ...(option.itemType === 'event'
                  ? [
                      { id: `${title}-again-2`, label: 'Venue', action: 'event-venue', itemType: 'event' as const, itemTitle: title },
                      { id: `${title}-again-3`, label: 'Time', action: 'event-date', itemType: 'event' as const, itemTitle: title },
                    ]
                  : [
                      { id: `${title}-again-2`, label: 'Status', action: 'project-status', itemType: 'project' as const, itemTitle: title },
                        { id: `${title}-again-3`, label: 'Recruiting', action: 'project-recruiting', itemType: 'project' as const, itemTitle: title },
                    ])
              ]
            : undefined,
          { itemType: option.itemType, itemTitle: title }
        ),
      ]);
    } catch (error) {
      console.error('Failed AI option request:', error);
      Toast.show({
        type: 'error',
        text1: 'AI request failed',
        text2: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSending(false);
    }
  }, [appendAiSequence, buildAiItemQuestion, isSending, user?.id]);

  const clearTypingStopTimeout = () => {
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
  };

  const stopTypingSignal = React.useCallback(async () => {
    clearTypingStopTimeout();
    if (!conversationId || !user?.id || isAIChat) return;
    await removeTyping(conversationId, user.id);
  }, [conversationId, user?.id, isAIChat]);

  const sendTypingSignal = React.useCallback(() => {
    if (!conversationId || !user?.id || isAIChat) return;

    const now = Date.now();
    if (now - lastTypingSignalAtRef.current >= TYPING_HEARTBEAT_MS) {
      lastTypingSignalAtRef.current = now;
      setTyping(conversationId, user.id).catch(() => {});
    }

    clearTypingStopTimeout();
    typingStopTimeoutRef.current = setTimeout(() => {
      stopTypingSignal().catch(() => {});
    }, TYPING_IDLE_MS);
  }, [conversationId, user?.id, isAIChat, stopTypingSignal]);

  const currentUserParticipant = useMemo(
    () => groupMembers.find((participant) => participant.user_id === user?.id),
    [groupMembers, user?.id]
  );

  const canManageGroup = useMemo(() => {
    if (!isGroup || !user?.id) return false;
    return groupDetails?.created_by === user.id || !!currentUserParticipant?.is_admin;
  }, [groupDetails?.created_by, currentUserParticipant?.is_admin, isGroup, user?.id]);

  const loadGroupDetails = async () => {
    if (!conversationId || !isGroup || !user?.id) return;

    try {
      const details = await getConversationDetails(conversationId);
      setGroupDetails(details);
      const participants = (details?.participants || []) as GroupParticipant[];
      setGroupMembers(participants);
      setGroupNameDraft(details?.group_name || '');
      setGroupAvatarDraft(details?.group_avatar || '');
      setGroupBioDraft(details?.group_bio || '');
      setGroupVisibilityDraft(details?.group_visibility === 'public' ? 'public' : 'private');
    } catch (error) {
      console.error('Failed to load group details:', error);
    }
  };

  const loadPendingJoinRequests = React.useCallback(async () => {
    if (!conversationId || !isGroup || !user?.id || !canManageGroup) return;

    try {
      setIsLoadingGroupJoinRequests(true);
      const data = await getPendingGroupJoinRequests(conversationId, user.id);
      setPendingGroupJoinRequests(data || []);
    } catch (error: any) {
      const message = `${error?.message || ''}`.toLowerCase();
      if (message.includes('not enabled') || message.includes('group_join_requests')) {
        setPendingGroupJoinRequests([]);
        return;
      }
      console.error('Failed to load group join requests:', error);
    } finally {
      setIsLoadingGroupJoinRequests(false);
    }
  }, [conversationId, isGroup, user?.id, canManageGroup]);

  const loadDirectChatDetails = async () => {
    if (!conversationId || isGroup || isAIChat || !user?.id) return;

    try {
      const details = await getConversationDetails(conversationId);
      setGroupDetails(details);
    } catch (error) {
      console.error('Failed to load direct chat details:', error);
    }
  };

  const loadPinnedMessagesCount = async () => {
    if (!conversationId) return;

    try {
      const pinnedMessages = await getPinnedMessages(conversationId);
      setPinnedMessageCount(pinnedMessages?.length || 0);
      // Show latest pinned message in banner
      if (pinnedMessages && pinnedMessages.length > 0) {
        const latest = pinnedMessages[0] as any;
        // Extract content from the message relation
        const messageContent = latest?.message?.content || latest?.content || 'Message pinned';
        setLatestPinnedMessage({
          ...latest,
          content: messageContent,
        });
        setShowPinnedBanner(true);
      } else {
        // No more pinned messages - hide banner and clear latest
        setLatestPinnedMessage(null);
        setShowPinnedBanner(false);
      }
    } catch (error) {
      console.error('Failed to load pinned messages count:', error);
    }
  };

  const loadLatestAnnouncement = async () => {
    if (!conversationId) return;

    try {
      const announcements = await getGroupAnnouncements(conversationId);
      if (announcements && announcements.length > 0) {
        setLatestAnnouncement(announcements[0]);
        setShowAnnouncementBanner(true);

        // Reset animations
        announcementSlide.value = -100;
        announcementScale.value = 0.95;
        announcementIconRotate.value = 0;

        // Slide in animation
        announcementSlide.value = withTiming(0, {
          duration: 600,
          easing: Easing.out(Easing.cubic)
        });

        // Scale animation
        announcementScale.value = withTiming(1, {
          duration: 600,
          easing: Easing.out(Easing.cubic)
        });

        // Icon rotation animation
        announcementIconRotate.value = withRepeat(
          withTiming(360, { duration: 3000, easing: Easing.linear }),
          -1,
          false
        );

        // Pulse animation
        announcementPulse.value = withRepeat(
          withTiming(0.7, { duration: 1500 }),
          -1,
          true
        );
      }
    } catch (error) {
      console.error('Failed to load announcements:', error);
    }
  };

  useEffect(() => {
    if (!conversationId || isAIChat || !user?.id) {
      setIsLoading(false);
      return;
    }

    loadMessages();
    loadPinnedMessagesCount();
    if (isGroup) {
      loadGroupDetails();
      loadLatestAnnouncement();
    } else {
      loadDirectChatDetails();
    }
    checkSupervisionCapability().catch((err) => console.error('Error in supervision check:', err));

    console.log("Subscribing to conversation:", conversationId);

    const channel = supabase
      .channel(`chat-${conversationId}-${user.id}-${realtimeRetryTick}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload: any) => {
          console.log("Realtime payload:", payload);

          // Get the sender profile for the new message
          const { data: senderData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', payload.new.sender_id)
            .single();

          const newMessage = {
            ...payload.new,
            content:
              typeof payload.new?.content === 'string' && payload.new.content
                ? decryptMessage(payload.new.content)
                : payload.new?.content,
            sender: senderData || undefined,
          } as ChatMessage;

          setMessages((prev) => {
            const exists = prev.find(m => m.id === payload.new.id);
            if (exists) return prev;
            // Skip if this user has hidden the message locally
            if (hiddenMessageIds.has(payload.new.id)) return prev;

            // Append and sort
            return [...prev, newMessage].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });

          if (payload.new.sender_id !== user.id) {
            markConversationAsRead(conversationId, user.id).catch((error) => {
              console.error('Failed to mark conversation as read:', error);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload: any) => {
          // When someone else reads a message, update its seen status
          if (payload.new.user_id !== user.id) {
            const readMessageId = payload.new.message_id;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === readMessageId && msg.sender_id === user.id
                  ? {
                      ...msg,
                      seen_by_others: true,
                      seen_by_count: (msg.seen_by_count || 0) + 1,
                    }
                  : msg
              )
            );
          }
        }
      )
      .subscribe((status: string) => {
        console.log("Realtime status:", status);

        if (status === 'SUBSCRIBED') {
          reconnectAttemptRef.current = 0;
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const attempt = reconnectAttemptRef.current + 1;
          reconnectAttemptRef.current = attempt;
          const retryDelayMs = Math.min(1500 * attempt, 6000);

          setTimeout(() => {
            setRealtimeRetryTick((prev) => prev + 1);
          }, retryDelayMs);
        }
      });

    return () => {
      console.log("Removing channel:", conversationId);
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, isAIChat, isGroup, realtimeRetryTick]);

  useEffect(() => {
    if (!isAIChat) return;
    seedAiChat();
  }, [isAIChat, seedAiChat]);

  useEffect(() => {
    if (showGroupMembers && canManageGroup) {
      loadPendingJoinRequests();
    }
  }, [showGroupMembers, canManageGroup, loadPendingJoinRequests]);

  useEffect(() => {
    if (!messages.length || showMessageSearch) return;
    if (messages.length > prevMessageCountRef.current) {
      const timeout = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      prevMessageCountRef.current = messages.length;
      return () => clearTimeout(timeout);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, showMessageSearch]);

  useEffect(() => {
    if (!conversationId || isAIChat || !user?.id) {
      setTypingUserIds([]);
      return;
    }

    const typingChannel = subscribeToTyping(conversationId, (ids) => {
      setTypingUserIds(ids.filter((id) => id !== user.id));
    });

    return () => {
      setTypingUserIds([]);
      clearTypingStopTimeout();
      stopTypingSignal().catch(() => {});
      supabase.removeChannel(typingChannel);
    };
  }, [conversationId, isAIChat, user?.id, stopTypingSignal]);

  useEffect(() => {
    return () => {
      clearTypingStopTimeout();
      stopTypingSignal().catch(() => {});
    };
  }, [stopTypingSignal]);

  const checkSupervisionCapability = async () => {
    if (!conversationId || isAIChat || !user?.id || !isGroup) {
      return;
    }

    try {
      const canSuperviseThisChat = await canFacultySupervise(
        conversationId,
        user.id,
        profile?.role || 'student'
      );
      setCanSupervise(canSuperviseThisChat);

      if (canSuperviseThisChat) {
        const result = await getConversationSupervisor(conversationId);
        if (result && result.supervisor) {
          setIsSupervisor((result.supervisor as any)?.id === user.id);
          if ((result.supervisor as any)?.id === user.id) {
            const stats = await getConversationSupervisionStats(conversationId);
            setSupervisionStats(stats);
          }
        }
      }
    } catch (error) {
      console.error('Error checking supervision:', error);
    }
  };

  const loadMessages = async () => {
    if (!conversationId || !user?.id) return;

    try {
      setIsLoading(true);
      // Load locally hidden message IDs first
      const hiddenRaw = await AsyncStorage.getItem(`hidden_msgs_${user.id}_${conversationId}`);
      const hiddenIds: Set<string> = hiddenRaw ? new Set(JSON.parse(hiddenRaw)) : new Set();
      setHiddenMessageIds(hiddenIds);

      const data = await getMessages(conversationId, user.id);
      const sorted = [...(data as any[])]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .filter((m) => !hiddenIds.has(m.id));
      setMessages(sorted);
      const ids = sorted.map((m) => m.id).filter(Boolean);
      const reactions = await getMessageReactions(ids);
      setMessageReactions(reactions);
      await markConversationAsRead(conversationId, user.id);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (error) {
      console.error('Failed to load messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load messages',
        text2: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    const hasText = !!messageText.trim();
    const hasAttachments = selectedAttachments.length > 0;
    if ((!hasText && !hasAttachments) || isSending || isUploadingAttachment) return;

    const content = messageText.trim();
    const originalReply = replyingTo;
    const originalAttachments = selectedAttachments;
    setMessageText('');
    setSelectedAttachments([]);
    setIsSending(true);
    setReplyingTo(null);
    clearTypingStopTimeout();
    stopTypingSignal().catch(() => {});

    try {
      if (isAIChat) {
        const aiResponse = await chatWithAI(user?.id || '', content);
        appendAiSequence([
          createUserDraftMessage(content, user?.id || 'self'),
          createAiMessage(aiResponse),
        ]);
      } else if (conversationId && user?.id) {
        if (!isGroup && !isAIChat && directPartnerId) {
          const status = await getConnectionStatus(directPartnerId);
          setDirectConnectionStatus(status);

          if (status.status === 'pending_sent') {
            throw new Error('Chat request is pending. Wait for acceptance before sending more messages.');
          }

          if (status.status === 'pending_received') {
            throw new Error('Accept or reject this chat request before sending messages.');
          }

          if (status.status === 'none' || status.status === 'rejected') {
            if (!content) {
              throw new Error('Type your first message to send a chat request.');
            }
            if (originalAttachments.length > 0) {
              throw new Error('Attachments are available only after request acceptance.');
            }

            const requestResult = await sendConnectionRequest(directPartnerId);
            if (!requestResult.success) {
              throw new Error(requestResult.error || 'Failed to send chat request.');
            }

            // Lock composer immediately after first request message is sent.
            setDirectConnectionStatus({
              status: 'pending_sent',
              connectionId: requestResult.data?.id,
              connection: requestResult.data,
            });

            await sendMessage(conversationId, user.id, `Chat request: ${content}`, 'system');
            await refreshDirectConnectionStatus();
            Toast.show({
              type: 'success',
              text1: 'Chat request sent',
              text2: 'Wait for the receiver to accept your request.',
            });
            return;
          }
        }

        if (originalAttachments.length > 0) {
          setIsUploadingAttachment(true);
          for (let index = 0; index < originalAttachments.length; index += 1) {
            const asset = originalAttachments[index];
            const uploadedUrl = await uploadChatAttachment(user.id, asset.uri);
            const caption = index === 0 ? content : '';
            await sendMessage(conversationId, user.id, caption, 'image', uploadedUrl);
          }
        } else {
          await sendMessage(conversationId, user.id, content, 'text');
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to send message',
        text2: error instanceof Error ? error.message : 'Unknown error',
      });
      setMessageText(content);
      setSelectedAttachments(originalAttachments);
      setReplyingTo(originalReply);
    } finally {
      setIsUploadingAttachment(false);
      setIsSending(false);
    }
  };

  const handleAcceptDirectRequest = async () => {
    if (isUpdatingDirectRequest || !directConnectionStatus.connectionId) return;

    try {
      setIsUpdatingDirectRequest(true);
      const result = await acceptConnectionRequest(directConnectionStatus.connectionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to accept request');
      }
      await refreshDirectConnectionStatus();
      Toast.show({ type: 'success', text1: 'Chat request accepted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to accept request', text2: error?.message || 'Try again' });
    } finally {
      setIsUpdatingDirectRequest(false);
    }
  };

  const handleRejectDirectRequest = async () => {
    if (isUpdatingDirectRequest || !directConnectionStatus.connectionId) return;

    try {
      setIsUpdatingDirectRequest(true);
      const result = await rejectConnectionRequest(directConnectionStatus.connectionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to reject request');
      }
      await refreshDirectConnectionStatus();
      Toast.show({ type: 'success', text1: 'Chat request rejected' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to reject request', text2: error?.message || 'Try again' });
    } finally {
      setIsUpdatingDirectRequest(false);
    }
  };

  const handleCreatePoll = async () => {
    if (!isGroup || !conversationId || !user?.id) return;

    const question = pollQuestion.trim();
    const options = pollOptions.map((item) => item.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      Toast.show({ type: 'error', text1: 'Add a question and at least 2 options' });
      return;
    }

    try {
      setIsCreatingPoll(true);
      const payload: ChatPollPayload = {
        question,
        options,
        allowsMultiple: false,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      };
      await sendMessage(conversationId, user.id, `${POLL_MESSAGE_PREFIX}${JSON.stringify(payload)}`, 'text');
      resetPollDraft();
      setShowCreatePoll(false);
      Toast.show({ type: 'success', text1: 'Poll created' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to create poll', text2: error?.message || 'Try again' });
    } finally {
      setIsCreatingPoll(false);
    }
  };

  const handlePollVote = async (messageId: string, payload: ChatPollPayload, optionIndex: number) => {
    if (!user?.id || isAIChat) return;
    if (!payload.options?.[optionIndex]) return;

    const allReactions = messageReactions.get(messageId) || [];
    const myPollVotes = allReactions.filter(
      (reaction) =>
        reaction.user_id === user.id &&
        typeof reaction.emoji === 'string' &&
        reaction.emoji.startsWith(POLL_REACTION_PREFIX)
    );
    const nextReactionKey = getPollReactionKey(optionIndex);
    const hasCurrentVote = myPollVotes.some((reaction) => reaction.emoji === nextReactionKey);

    try {
      if (hasCurrentVote) {
        await removeMessageReaction(messageId, nextReactionKey);
        removeLocalReaction(messageId, nextReactionKey);
        return;
      }

      for (const vote of myPollVotes) {
        await removeMessageReaction(messageId, vote.emoji);
        removeLocalReaction(messageId, vote.emoji);
      }

      await addMessageReaction(messageId, nextReactionKey);
      upsertLocalReaction(messageId, nextReactionKey);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to submit vote', text2: error?.message || 'Try again' });
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (isAIChat) return;

    setConfirmDialog({
      visible: true,
      title: 'Delete Message',
      message: 'Delete this message for everyone in this chat?',
      onConfirm: () => deleteMessageConfirmed(messageId),
    });
  };

  const deleteMessageConfirmed = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      Toast.show({ type: 'success', text1: 'Message deleted' });
    } catch (error) {
      console.error('Delete message error:', error);
      Toast.show({ type: 'error', text1: 'Failed to delete message' });
    }
  };

  const handleMessageLongPress = (message: ChatMessage) => {
    if (!user?.id || isAIChat) return;
    // Both own and received messages open the options sheet on long-press
    setSelectedMessage(message);
    setShowMessageOptions(true);
  };

  const handleSaveGroupProfile = async () => {
    if (!conversationId || !user?.id) return;

    try {
      setIsSavingGroup(true);
      const updatedConversation: any = await updateGroupConversation(conversationId, user.id, {
        group_name: groupNameDraft,
        group_avatar: groupAvatarDraft || null,
        group_bio: groupBioDraft,
        ...(isMainAdmin ? { group_visibility: groupVisibilityDraft } : {}),
      });
      await loadGroupDetails();
      setShowGroupEdit(false);
      if (updatedConversation?.__groupBioUnsupported) {
        Toast.show({
          type: 'info',
          text1: 'Group updated (partial)',
          text2: 'Name/image saved. Run DB migration to enable group bio.',
        });
      } else if (updatedConversation?.__groupVisibilityUnsupported) {
        Toast.show({
          type: 'info',
          text1: 'Group updated (partial)',
          text2: 'Run DB migration to enable public/private visibility.',
        });
      } else {
        Toast.show({ type: 'success', text1: 'Group updated' });
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: error?.message || 'Try again' });
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handlePickGroupAvatar = async () => {
    if (!user?.id) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Toast.show({
          type: 'info',
          text1: 'Permission required',
          text2: 'Allow photo access to upload group image.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setIsUploadingGroupAvatar(true);
      const uploadedUrl = await uploadGroupAvatar(user.id, result.assets[0].uri);
      setGroupAvatarDraft(uploadedUrl);
      Toast.show({ type: 'success', text1: 'Group image updated' });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: error?.message || 'Could not upload image',
      });
    } finally {
      setIsUploadingGroupAvatar(false);
    }
  };

  const handleKickMember = async (member: GroupParticipant) => {
    if (!conversationId || !user?.id || !member?.user_id) return;

    setConfirmDialog({
      visible: true,
      title: 'Remove Member',
      message: `Remove ${member.user?.full_name || 'this member'} from the group?`,
      onConfirm: async () => {
        try {
          await removeParticipantFromGroup(conversationId, user.id, member.user_id);
          await loadGroupDetails();
          Toast.show({ type: 'success', text1: 'Member removed' });
        } catch (error: any) {
          Toast.show({ type: 'error', text1: 'Failed', text2: error?.message || 'Try again' });
        }
      },
    });
  };

  const handleToggleMemberAdmin = async (member: GroupParticipant) => {
    if (!conversationId || !user?.id || !member?.user_id) return;

    try {
      await setGroupParticipantAdmin(conversationId, user.id, member.user_id, !member.is_admin);
      await loadGroupDetails();
      Toast.show({
        type: 'success',
        text1: member.is_admin ? 'Admin removed' : 'Member promoted to admin',
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed', text2: error?.message || 'Try again' });
    }
  };

  const handleDeleteGroup = async () => {
    if (!conversationId || !user?.id || !isGroup || !canManageGroup) return;

    setConfirmDialog({
      visible: true,
      title: 'Delete Group',
      message: 'This will permanently delete the group, all messages, and pending join requests for everyone. This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteGroupConversation(conversationId, user.id);
          setShowChatOptions(false);
          setShowGroupMembers(false);
          Toast.show({ type: 'success', text1: 'Group deleted' });
          navigation.goBack();
        } catch (error: any) {
          Toast.show({
            type: 'error',
            text1: 'Failed to delete group',
            text2: error?.message || 'Try again',
          });
        }
      },
    });
  };

  const handleAddSupervision = async () => {
    if (!canSupervise || !conversationId || !user?.id) return;

    try {
      await addConversationSupervisor(conversationId, user.id);
      setIsSupervisor(true);
      const stats = await getConversationSupervisionStats(conversationId);
      setSupervisionStats(stats);
      Toast.show({ type: 'success', text1: 'Now supervising this group' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to add supervision' });
    }
  };

  const handleRemoveSupervision = async () => {
    if (!isSupervisor || !conversationId) return;

    try {
      await removeConversationSupervisor(conversationId);
      setIsSupervisor(false);
      setSupervisionStats(null);
      Toast.show({ type: 'success', text1: 'Supervision removed' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to remove supervision' });
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!conversationId || !user?.id || !announcementTitle.trim() || !announcementContent.trim()) {
      Toast.show({ type: 'error', text1: 'Please fill in title and content' });
      return;
    }

    try {
      setIsCreatingAnnouncement(true);
      await createGroupAnnouncement(
        conversationId,
        user.id,
        announcementTitle.trim(),
        announcementContent.trim()
      );
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setShowCreateAnnouncement(false);
      setShowMessageOptions(false);
      await loadLatestAnnouncement();
      Toast.show({ type: 'success', text1: 'Announcement created', text2: 'Posted to the group' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to create announcement', text2: error?.message || 'Try again' });
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  const handlePickAttachment = async () => {
    if (!conversationId || !user?.id || isAIChat || isSending || isUploadingAttachment) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Toast.show({
          type: 'info',
          text1: 'Permission required',
          text2: 'Allow photo access to send images.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      setSelectedAttachments((prev) => {
        const existing = new Set(prev.map((item) => item.uri));
        const additions = result.assets
          .filter((asset) => !!asset?.uri && !existing.has(asset.uri))
          .map((asset) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            uri: asset.uri,
          }));
        return [...prev, ...additions].slice(0, 10);
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Image selection failed',
        text2: error?.message || 'Could not select images',
      });
    }
  };

  const removeSelectedAttachment = (id: string) => {
    setSelectedAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const loadEligibleConnections = async () => {
    if (!isGroup || !user?.id) return;

    try {
      setLoadingConnections(true);
      const acceptedConnections = await getMyConnections('accepted');
      const existingMemberIds = new Set(groupMembers.map((member) => member.user_id));
      const eligible = acceptedConnections.filter(
        (connection) => connection.profile?.id && !existingMemberIds.has(connection.profile.id)
      );
      setAvailableConnections(eligible);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to load users' });
    } finally {
      setLoadingConnections(false);
    }
  };

  const openAddMembersModal = async () => {
    setShowChatOptions(false);
    setSelectedNewMemberIds([]);
    setMemberSearchQuery('');
    setShowAddGroupMembers(true);
    await loadEligibleConnections();
  };

  const handleToggleNewMember = (userId: string) => {
    setSelectedNewMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddMembersToGroup = async () => {
    if (!conversationId || !user?.id || !selectedNewMemberIds.length) return;

    try {
      setIsAddingMembers(true);
      const result = await addParticipantsToGroup(conversationId, user.id, selectedNewMemberIds);
      await loadGroupDetails();
      setShowAddGroupMembers(false);
      setSelectedNewMemberIds([]);
      setMemberSearchQuery('');
      Toast.show({
        type: 'success',
        text1: result.addedCount > 0 ? 'Members added to group' : 'No new members were added',
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to add members', text2: error?.message || 'Try again' });
    } finally {
      setIsAddingMembers(false);
    }
  };

  const handleUnpinMessage = async () => {
    if (!latestPinnedMessage?.message_id || !conversationId) return;

    try {
      await unpinMessage(latestPinnedMessage.message_id, conversationId);
      setShowPinnedActions(false);
      await loadPinnedMessagesCount();
      Toast.show({ type: 'success', text1: 'Message unpinned' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to unpin message', text2: error?.message || 'Try again' });
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!latestAnnouncement?.id) return;

    try {
      await deactivateGroupAnnouncement(latestAnnouncement.id);
      setShowAnnouncementBanner(false);
      setShowAnnouncementActions(false);
      setLatestAnnouncement(null);
      Toast.show({ type: 'success', text1: 'Announcement deleted' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to delete announcement', text2: error?.message || 'Try again' });
    }
  };

  const handlePickBackgroundImage = async () => {
    const previousBackgroundImage = backgroundImageUrl;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0] && user?.id) {
        const asset = result.assets[0];
        const fileName = `bg-${Date.now()}.jpg`;

        // Show the chosen image immediately for faster perceived response.
        setBackgroundImageUrl(asset.uri);
        setShowBackgroundPicker(false);
        setIsLoadingBackground(true);

        // Upload to Supabase storage
        const imageUrl = await uploadChatBackgroundToStorage(
          user.id,
          conversationId,
          asset.uri,
          fileName
        );

        // Save preference
        await setChatBackgroundImage(user.id, conversationId, imageUrl, fileName);
        setBackgroundImageUrl(imageUrl);
        Toast.show({ type: 'success', text1: 'Background updated', text2: 'Custom background applied' });
      }
    } catch (error: any) {
      console.error('Failed to set background:', error);
      setBackgroundImageUrl(previousBackgroundImage);
      Toast.show({ type: 'error', text1: 'Failed to set background', text2: error?.message || 'Try again' });
    } finally {
      setIsLoadingBackground(false);
    }
  };

  const handleRemoveBackground = async () => {
    if (!user?.id) return;

    try {
      setIsLoadingBackground(true);
      await removeChatBackgroundImage(user.id, conversationId);
      setBackgroundImageUrl(null);
      setShowBackgroundPicker(false);
      Toast.show({ type: 'success', text1: 'Background removed' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to remove background', text2: error?.message || 'Try again' });
    } finally {
      setIsLoadingBackground(false);
    }
  };

  const getInitials = (displayName: string) => getCleanInitials(displayName) || 'C';

  const getAvatarColor = (displayName: string) => {
    let hash = 0;
    for (let i = 0; i < displayName.length; i += 1) {
      hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [Colors.info, Colors.warning, Colors.success, Colors.primary, Colors.error];
    return colors[Math.abs(hash) % colors.length];
  };

  const filteredMessages = useMemo(() => {
    if (!showMessageSearch || !messageSearchQuery.trim()) {
      return messages;
    }

    const query = messageSearchQuery.trim().toLowerCase();
    return messages.filter((message) => (message.content || '').toLowerCase().includes(query));
  }, [messages, messageSearchQuery, showMessageSearch]);

  const directPartnerId = useMemo(() => {
    if (isGroup || isAIChat || !user?.id) return null;
    if (partnerUserId && partnerUserId !== user.id) return partnerUserId;
    // First try to get from conversation participants
    const participants = groupDetails?.participants as any[] | undefined;
    if (participants && participants.length > 0) {
      const otherParticipant = participants.find((p: any) => p.user_id !== user.id);
      if (otherParticipant) return otherParticipant.user_id;
    }
    // Fallback to getting from messages
    const otherMessage = messages.find(
      (message) => message.sender_id !== user.id && message.sender_id !== 'ai'
    );
    return otherMessage?.sender_id || null;
  }, [isGroup, isAIChat, messages, user?.id, groupDetails?.participants, partnerUserId]);

  const directPartnerProfile = useMemo(() => {
    if (isGroup || isAIChat || !user?.id) return null;
    // First try to get from conversation participants
    const participants = groupDetails?.participants as any[] | undefined;
    if (participants && participants.length > 0) {
      const otherParticipant = participants.find((p: any) => p.user_id !== user.id);
      if (otherParticipant?.user) return otherParticipant.user;
    }
    // Fallback to getting from messages
    const otherMessage = messages.find(
      (message) => message.sender_id !== user.id && message.sender_id !== 'ai'
    );
    return otherMessage?.sender || null;
  }, [isGroup, isAIChat, messages, user?.id, groupDetails?.participants]);

  const refreshDirectConnectionStatus = useCallback(async () => {
    if (isGroup || isAIChat || !user?.id || !directPartnerId) {
      setDirectConnectionStatus({ status: 'none' });
      return;
    }

    try {
      const status = await getConnectionStatus(directPartnerId);
      setDirectConnectionStatus(status);
    } catch {
      setDirectConnectionStatus({ status: 'none' });
    }
  }, [directPartnerId, isAIChat, isGroup, user?.id]);

  useEffect(() => {
    refreshDirectConnectionStatus();
  }, [refreshDirectConnectionStatus]);

  useEffect(() => {
    if (isGroup || isAIChat || !user?.id || !directPartnerId) {
      return;
    }

    const connectionChannel = supabase
      .channel(`direct-connection-${user.id}-${directPartnerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
        },
        (payload: any) => {
          const row = payload?.new || payload?.old;
          if (!row) return;

          const involvesCurrentPair =
            (row.requester_id === user.id && row.recipient_id === directPartnerId) ||
            (row.requester_id === directPartnerId && row.recipient_id === user.id);

          if (!involvesCurrentPair) return;

          // Re-sync local gate state immediately when request is accepted/rejected/created.
          refreshDirectConnectionStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(connectionChannel);
    };
  }, [directPartnerId, isAIChat, isGroup, refreshDirectConnectionStatus, user?.id]);

  const typingDisplayNames = useMemo(() => {
    if (!typingUserIds.length) return [] as string[];

    const names = typingUserIds.map((typingUserId) => {
      const participant = (groupDetails?.participants as any[] | undefined)?.find(
        (entry: any) => entry.user_id === typingUserId
      );
      if (participant?.user?.full_name) return participant.user.full_name as string;

      const match = messages.find(
        (msg) => msg.sender_id === typingUserId && !!msg.sender?.full_name
      );
      return match?.sender?.full_name || 'Someone';
    });

    return Array.from(new Set(names));
  }, [typingUserIds, groupDetails?.participants, messages]);

  const groupTypingLabel = useMemo(() => {
    if (!isGroup || !typingDisplayNames.length) return null;
    if (typingDisplayNames.length === 1) return `${typingDisplayNames[0]} is typing...`;
    if (typingDisplayNames.length === 2) {
      return `${typingDisplayNames[0]} and ${typingDisplayNames[1]} are typing...`;
    }
    return `${typingDisplayNames[0]}, ${typingDisplayNames[1]} and others are typing...`;
  }, [isGroup, typingDisplayNames]);

  const isDirectPartnerTyping = !isGroup && !isAIChat && typingUserIds.length > 0;
  const isDirectChat = !isGroup && !isAIChat;
  const canSendNewDirectRequest =
    directConnectionStatus.status === 'none' || directConnectionStatus.status === 'rejected';
  const isDirectRequestPending =
    directConnectionStatus.status === 'pending_sent' || directConnectionStatus.status === 'pending_received';
  const canSendInCurrentChat =
    !isDirectChat ||
    directConnectionStatus.status === 'accepted' ||
    canSendNewDirectRequest;

  const normalizePresenceStatus = (status?: string | null, updatedAt?: string | null) => {
    const fallback: 'online' | 'away' | 'offline' = 'offline';
    const nextStatus = (status as 'online' | 'away' | 'offline' | null) || fallback;
    if (nextStatus === 'offline') {
      return fallback;
    }

    // Presence is only trusted when the timestamp is recent and parseable.
    const PRESENCE_STALE_MS = 2 * 60 * 1000;
    const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
    const isFresh = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= PRESENCE_STALE_MS;
    if (!isFresh) {
      return fallback;
    }

    return nextStatus;
  };

  // Keep presence online while this chat screen is focused.
  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id || isAIChat) return;
      updateUserStatus(user.id, 'online').catch(() => { });

      return () => {
        updateUserStatus(user.id, 'away').catch(() => { });
      };
    }, [user?.id, isAIChat])
  );

  // Force status reload when screen is focused and we have a partner ID
  useFocusEffect(
    React.useCallback(() => {
      if (!directPartnerId || isGroup || isAIChat) return;

      const loadPartnerStatus = async () => {
        try {
          const statusData: any = await getUserStatus(directPartnerId);
          setDirectPartnerStatus(
            normalizePresenceStatus(statusData?.status, statusData?.status_updated_at)
          );
        } catch {
          setDirectPartnerStatus(null);
        }
      };

      loadPartnerStatus();
    }, [directPartnerId, isGroup, isAIChat])
  );

  // Subscribe to real-time status updates for direct partner
  useEffect(() => {
    if (isGroup || isAIChat || !directPartnerId) {
      setDirectPartnerStatus(null);
      return;
    }

    let isMounted = true;

    const loadStatus = async () => {
      try {
        const statusData: any = await getUserStatus(directPartnerId);
        if (isMounted) {
          setDirectPartnerStatus(
            normalizePresenceStatus(statusData?.status, statusData?.status_updated_at)
          );
        }
      } catch (error) {
        console.error('Error loading partner status:', error);
        if (isMounted) {
          setDirectPartnerStatus(null);
        }
      }
    };

    // Initial load
    loadStatus();

    // Poll as a fallback because stale presence can persist without UPDATE events.
    const statusPoll = setInterval(loadStatus, 30 * 1000); // More frequent polling

    const statusChannel = supabase
      .channel(`partner-status-${directPartnerId}-${Date.now()}`) // Unique channel to avoid conflicts
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${directPartnerId}`,
        },
        (payload: any) => {
          if (!isMounted) return;
          const nextStatus = normalizePresenceStatus(
            payload?.new?.status,
            payload?.new?.status_updated_at
          );
          if (nextStatus) {
            setDirectPartnerStatus(nextStatus);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(statusPoll);
      supabase.removeChannel(statusChannel);
    };
  }, [directPartnerId, isGroup, isAIChat]);

  const isMainAdmin = useMemo(() => {
    if (!isGroup || !user?.id) return false;
    return groupDetails?.created_by === user.id;
  }, [groupDetails?.created_by, isGroup, user?.id]);

  const handleReviewJoinRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (!conversationId || !user?.id) return;

    try {
      setActiveJoinReviewId(requestId);
      await reviewGroupJoinRequest(conversationId, requestId, user.id, action);
      await Promise.all([loadGroupDetails(), loadPendingJoinRequests()]);
      Toast.show({
        type: 'success',
        text1: action === 'accept' ? 'Request accepted' : 'Request rejected',
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Action failed',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setActiveJoinReviewId(null);
    }
  };

  const initials = getInitials(groupDetails?.group_name || name);
  const color = isAIChat ? Colors.primary : getAvatarColor(groupDetails?.group_name || name);
  const groupVisibilityRingColor = groupDetails?.group_visibility === 'public' ? '#FF0000' : '#00FF00';

  const getDateLabel = (isoDate: string) => {
    const date = new Date(isoDate);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const yesterdayOnly = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate()
    ).getTime();

    if (dateOnly === todayOnly) return 'Today';
    if (dateOnly === yesterdayOnly) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getGroupedReactions = (messageId: string): Record<string, GroupedReaction> => {
    const reactions = messageReactions.get(messageId) || [];
    const grouped: Record<string, GroupedReaction> = {};
    for (const reaction of reactions) {
      if (!grouped[reaction.emoji]) {
        grouped[reaction.emoji] = { count: 0, hasCurrentUser: false };
      }
      grouped[reaction.emoji].count += 1;
      if (reaction.user_id === user?.id) {
        grouped[reaction.emoji].hasCurrentUser = true;
      }
    }
    return grouped;
  };

  const openReactionPicker = (messageId: string) => {
    setReactionTargetMessageId(messageId);
    setReactionPickerVisible(true);
  };

  const upsertLocalReaction = (messageId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const next = new Map(prev);
      const list = [...(next.get(messageId) || [])];
      const exists = list.some((r) => r.user_id === user?.id && r.emoji === emoji);
      if (!exists) {
        list.push({
          id: `local-${Date.now()}`,
          message_id: messageId,
          user_id: user?.id || '',
          emoji,
          created_at: new Date().toISOString(),
          user: {
            id: user?.id || '',
            full_name: profile?.full_name ?? undefined,
            avatar_url: profile?.avatar_url ?? undefined,
          },
        });
        next.set(messageId, list);
      }
      return next;
    });
  };

  const removeLocalReaction = (messageId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const next = new Map(prev);
      const list = (next.get(messageId) || []).filter(
        (r) => !(r.user_id === user?.id && r.emoji === emoji)
      );
      if (list.length) next.set(messageId, list);
      else next.delete(messageId);
      return next;
    });
  };

  const handlePickReaction = async (emoji: string) => {
    const messageId = reactionTargetMessageId;
    setReactionPickerVisible(false);
    setReactionTargetMessageId(null);
    if (!messageId || isAIChat) return;

    try {
      await addMessageReaction(messageId, emoji);
      upsertLocalReaction(messageId, emoji);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to add reaction', text2: error?.message || 'Try again' });
    }
  };

  const openMessageOptionsFromReactionPicker = () => {
    const messageId = reactionTargetMessageId;
    if (!messageId) return;

    const targetMessage = messages.find((msg) => msg.id === messageId);
    if (!targetMessage) return;

    setReactionPickerVisible(false);
    setReactionTargetMessageId(null);
    setSelectedMessage(targetMessage);
    setShowMessageOptions(true);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (isAIChat) return;
    const reactions = messageReactions.get(messageId) || [];
    const hasMine = reactions.some((r) => r.user_id === user?.id && r.emoji === emoji);
    try {
      if (hasMine) {
        await removeMessageReaction(messageId, emoji);
        removeLocalReaction(messageId, emoji);
      } else {
        await addMessageReaction(messageId, emoji);
        upsertLocalReaction(messageId, emoji);
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Failed to update reaction', text2: error?.message || 'Try again' });
    }
  };

  const renderMessage = ({ item: message, index }: { item: ChatMessage; index: number }) => {
    const isMyMessage = message.sender_id === user?.id;
    const previousMessage = index > 0 ? filteredMessages[index - 1] : null;
    const showDateSeparator =
      index === 0 ||
      new Date(previousMessage?.created_at || '').toDateString() !==
      new Date(message.created_at).toDateString();
    const showGroupIdentity = isGroup;
    const senderDisplayName = isMyMessage
      ? profile?.full_name || message.sender?.full_name || 'You'
      : message.sender?.full_name || 'Member';
    const senderAvatarUri = isMyMessage ? profile?.avatar_url || message.sender?.avatar_url : message.sender?.avatar_url;
    const senderRole = isMyMessage ? profile?.role || message.sender?.role : message.sender?.role;
    const messageTime = new Date(message.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const activeGroupSize = groupMembers?.length || 0;
    const requiredSeenByOthers = isGroup ? Math.max(1, activeGroupSize - 1) : 1;
    const seenByOthersCount = message.seen_by_count ?? (message.seen_by_others ? 1 : 0);
    const showDoubleTick = isGroup
      ? activeGroupSize > 0 && seenByOthersCount >= requiredSeenByOthers
      : !!message.seen_by_others || seenByOthersCount >= 1;
    const groupedReactions = getGroupedReactions(message.id);
    const isImageMessage = message.message_type === 'image' && !!message.attachment_url;
    const imageCaptionRaw = (message.content || '').trim();
    const imageCaption = imageCaptionRaw === 'Unable to decrypt message' ? '' : imageCaptionRaw;
    const pollPayload = parsePollPayload(message.content);
    const pollReactions = (messageReactions.get(message.id) || []).filter(
      (reaction) => typeof reaction.emoji === 'string' && reaction.emoji.startsWith(POLL_REACTION_PREFIX)
    );
    const pollVoteCounts = pollPayload
      ? pollPayload.options.map((_, optionIndex) => {
          const key = getPollReactionKey(optionIndex);
          return pollReactions.filter((reaction) => reaction.emoji === key).length;
        })
      : [];
    const totalPollVotes = pollVoteCounts.reduce((sum, count) => sum + count, 0);
    const myPollVoteIndex = pollPayload
      ? pollPayload.options.findIndex((_, optionIndex) => {
          const key = getPollReactionKey(optionIndex);
          return pollReactions.some((reaction) => reaction.user_id === user?.id && reaction.emoji === key);
        })
      : -1;
    const seenStatus = showDoubleTick ? 'read' : 'sent';

    /* ── Poll content (passed as ReactNode to ChatMessageBubble) ── */
    const pollContentNode = pollPayload ? (
      <View style={styles.waPollCard}>
        <Text
          style={[
            styles.waPollQuestion,
            { color: Colors.text },
          ]}
        >
          {pollPayload.question}
        </Text>
        <View style={styles.waPollSubtitleRow}>
          <MaterialIcons
            name="how-to-vote"
            size={14}
            color={Colors.textSecondary}
          />
          <Text
            style={[
              styles.waPollSubtitle,
              { color: Colors.textSecondary },
            ]}
          >
            Tap an option to vote
          </Text>
        </View>
        <View style={styles.waPollOptionsWrap}>
          {pollPayload.options.map((option, optionIndex) => {
            const votes = pollVoteCounts[optionIndex] || 0;
            const votePercent = totalPollVotes > 0 ? Math.round((votes / totalPollVotes) * 100) : 0;
            const isMyVote = myPollVoteIndex === optionIndex;
            const optionVoters = (pollReactions || []).filter(
              (r) => r.emoji === getPollReactionKey(optionIndex)
            ).slice(0, 3);

            return (
              <TouchableOpacity
                key={`${message.id}-poll-option-${optionIndex}`}
                onPress={() => handlePollVote(message.id, pollPayload, optionIndex)}
                activeOpacity={0.8}
                style={[
                  styles.waPollOptionWrap,
                  isMyVote && { backgroundColor: chatTheme.bubbleColor + '15', borderColor: chatTheme.bubbleColor },
                  isMyVote && styles.waPollOptionWrapActive,
                ]}
              >
                <View style={styles.waPollOptionRow}>
                  <View
                    style={[
                      styles.waPollCheckCircle,
                      { borderColor: Colors.border },
                      isMyVote && styles.waPollCheckCircleActive,
                    ]}
                  >
                    {isMyVote && <MaterialIcons name="check" size={15} color="#ffffff" />}
                  </View>
                  <Text
                    style={[
                      styles.waPollOptionLabel,
                      { color: isMyVote ? chatTheme.textColor : Colors.text },
                    ]}
                    numberOfLines={2}
                  >
                    {option}
                  </Text>
                  <View style={styles.waPollOptionRight}>
                    {optionVoters.length > 0 && (
                      <View style={styles.waPollAvatarStack}>
                        {optionVoters.map((voter, voterIndex) => (
                          <View
                            key={`${message.id}-${optionIndex}-${voter.user_id || voterIndex}`}
                            style={[
                              styles.waPollAvatarWrap,
                              {
                                marginLeft: voterIndex === 0 ? 0 : -8,
                                borderColor: Colors.border,
                              },
                            ]}
                          >
                            {voter.user?.avatar_url ? (
                              <Image source={{ uri: voter.user.avatar_url }} style={styles.waPollAvatar} />
                            ) : (
                              <View style={[styles.waPollAvatar, styles.waPollAvatarFallback]}>
                                <Text style={styles.waPollAvatarInitial}>
                                  {(voter.user?.full_name || '?')[0].toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                    <Text
                      style={[
                        styles.waPollVoteCount,
                        { color: Colors.textSecondary },
                      ]}
                    >
                      {votes} ({votePercent}%)
                    </Text>
                  </View>
                </View>
                <View style={styles.waPollProgressBg}>
                  <View
                    style={[
                      styles.waPollProgressFill,
                      {
                        width: `${votePercent}%`,
                        backgroundColor: chatTheme.bubbleColor,
                      },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.waPollViewVotesBtn}
          onPress={() => {
            const votersByOption = pollPayload.options.map((_, oi) =>
              (pollReactions || [])
                .filter((r) => r.emoji === getPollReactionKey(oi))
                .map((r) => ({ id: r.user_id, name: r.user?.full_name || 'User', avatar: r.user?.avatar_url || undefined }))
            );
            setChatPollVotesSheet({
              question: pollPayload.question,
              options: pollPayload.options,
              counts: pollVoteCounts,
              votersByOption,
            });
          }}
        >
          <Text style={[styles.waPollViewVotesText, { color: chatTheme.bubbleColor }]}>
            View votes
          </Text>
        </TouchableOpacity>
      </View>
    ) : null;

    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparatorContainer}>
            <Text style={styles.dateSeparatorLabel}>{getDateLabel(message.created_at)}</Text>
          </View>
        )}

        <ChatMessageBubble
          messageId={message.id}
          content={message.content}
          isMe={isMyMessage}
          time={messageTime}
          chatTheme={chatTheme}
          showSender={showGroupIdentity}
          senderName={senderDisplayName}
          senderAvatar={senderAvatarUri}
          senderRole={senderRole}
          seenStatus={seenStatus}
          showTicks={isMyMessage && !isAIChat}
          isImage={isImageMessage}
          attachmentUrl={message.attachment_url}
          imageCaption={imageCaption}
          onImagePress={(url: string) => setImagePreviewUrl(url)}
          reactions={!pollPayload ? groupedReactions : undefined}
          onReactionPress={(emoji: string) => toggleReaction(message.id, emoji)}
          onLongPress={() => handleMessageLongPress(message)}
          aiOptions={message.aiOptions}
          onAiOptionPress={handleAiOptionPress}
          isSending={isSending}
          pollContent={pollContentNode}
        />
      </View>
    );
  };

  return (
    <View style={styles.screenRoot}>
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { backgroundColor: headerChromeColor, borderBottomColor: headerChromeBorder }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerMainInfo}
          onPress={() => {
            if (isGroup) {
              setShowGroupMembers(true);
            } else if (!isGroup && directPartnerId) {
              navigation.navigate('PublicProfile', { userId: directPartnerId });
            }
          }}
          activeOpacity={0.8}
        >
          {isGroup && groupDetails?.group_avatar ? (
            <View style={[styles.groupVisibilityRingHeader, { borderColor: groupVisibilityRingColor }]}>
              <Image source={{ uri: groupDetails.group_avatar }} style={styles.headerAvatarImage} />
              <View style={[styles.groupVisibilityIconBadgeHeader, { backgroundColor: groupVisibilityRingColor }]}>
                <MaterialIcons name="groups" size={10} color="#ffffff" />
              </View>
            </View>
          ) : !isGroup && directPartnerProfile ? (
            <UserAvatar
              uri={directPartnerProfile.avatar_url}
              name={directPartnerProfile.full_name || name}
              size={40}
              role={directPartnerProfile.role}
              showRing={false}
            />
          ) : (
            <View
              style={[
                isGroup
                  ? [styles.groupVisibilityRingHeader, { borderColor: groupVisibilityRingColor }]
                  : undefined,
              ]}
            >
              <View style={[styles.headerAvatar, { backgroundColor: color }]}>
                <Text style={styles.headerAvatarText}>{initials}</Text>
              </View>
              {isGroup && (
                <View style={[styles.groupVisibilityIconBadgeHeader, { backgroundColor: groupVisibilityRingColor }]}>
                  <MaterialIcons name="groups" size={10} color="#ffffff" />
                </View>
              )}
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1} ellipsizeMode="tail">
              {isGroup ? groupDetails?.group_name || name : directPartnerProfile?.full_name || name}
            </Text>
            {isGroup ? (
              <View style={styles.groupHeaderMeta}>
                <Text style={styles.headerStatus}>
                  {groupTypingLabel || `${groupMembers.length} members`}
                </Text>
                <Text
                  style={[
                    styles.groupBioPreview,
                    !groupDetails?.group_bio && styles.groupBioPreviewEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {groupDetails?.group_bio || 'No group bio yet'}
                </Text>
                <View style={styles.groupPreviewRow}>
                  {groupMembers.slice(0, 3).map((participant, index) => (
                    <View key={participant.id} style={[styles.groupPreviewAvatar, { marginLeft: index === 0 ? 0 : -8 }]}>
                      <UserAvatar
                        uri={participant.user?.avatar_url}
                        name={participant.user?.full_name || 'Member'}
                        size={20}
                        showRing={false}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.directStatusRow}>
                {!isAIChat && !isDirectPartnerTyping && directPartnerStatus === 'online' && <View style={styles.onlineDot} />}
                <Text style={styles.headerStatus}>
                  {isAIChat
                    ? 'AI Assistant'
                    : isDirectPartnerTyping
                      ? 'Typing...'
                    : directPartnerStatus === 'online'
                      ? 'Online'
                      : directPartnerProfile?.role || 'Direct chat'}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {pinnedMessageCount > 0 && (
          <TouchableOpacity style={styles.pinnedButton} onPress={() => setShowPinnedMessages(true)}>
            <MaterialIcons name="push-pin" size={20} color={Colors.primary} />
            <View style={styles.pinnedBadge}>
              <Text style={styles.pinnedBadgeText}>{pinnedMessageCount}</Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.moreButton} onPress={() => setShowChatOptions(true)}>
          <MaterialIcons name="more-vert" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {showMessageSearch && (
        <View style={[styles.messageSearchBar, { backgroundColor: headerChromeColor, borderBottomColor: headerChromeBorder }]}>
          <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            value={messageSearchQuery}
            onChangeText={setMessageSearchQuery}
            placeholder="Search in conversation"
            placeholderTextColor={Colors.textSecondary}
            style={styles.messageSearchInput}
          />
          <TouchableOpacity
            onPress={() => {
              setShowMessageSearch(false);
              setMessageSearchQuery('');
            }}
          >
            <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Pinned Message Banner */}
      {showPinnedBanner && latestPinnedMessage && (
        <TouchableOpacity
          style={[styles.floatingBanner, styles.pinnedBanner]}
          onPress={() => setShowPinnedMessages(true)}
          onLongPress={() => canManageGroup && setShowPinnedActions(true)}
          delayLongPress={500}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.bannerIconRow}>
              <MaterialIcons name="push-pin" size={20} color={Colors.primary} />
              <Text style={styles.bannerLabel}>Pinned Message</Text>
            </View>
            <Text
              style={styles.bannerMessageText}
              numberOfLines={2}
            >
              {latestPinnedMessage?.content || 'Message pinned'}
            </Text>
          </View>
          <View style={styles.bannerActions}>
            {canManageGroup && (
              <TouchableOpacity
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  setShowPinnedActions(true);
                }}
                style={styles.actionButton}
              >
                <MaterialIcons name="more-vert" size={18} color="#ffffff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.pinnedCloseBtn}
              onPress={(e: GestureResponderEvent) => {
                e.stopPropagation();
                setShowPinnedBanner(false);
              }}
            >
              <MaterialIcons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Announcement Banner (Red with pulse animation) */}
      {showAnnouncementBanner && latestAnnouncement && (
        <Animated.View
          style={[
            styles.floatingBanner,
            styles.announcementBanner,
            announcementAnimatedStyle
          ]}
        >
          <View style={styles.bannerContent}>
            <Animated.View
              style={announcementIconAnimatedStyle}
            >
              <MaterialIcons name="campaign" size={24} color="#ffffff" />
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.announcementMessageText, { fontWeight: '700' }]} numberOfLines={1}>
                {latestAnnouncement?.title || 'New announcement'}
              </Text>
              <Text style={[styles.announcementMessageText, { fontWeight: '400', fontSize: FontSizes.sm }]} numberOfLines={1}>
                {latestAnnouncement?.content}
              </Text>
            </View>
          </View>
          <View style={styles.bannerActions}>
            {canManageGroup && (
              <TouchableOpacity
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  setShowAnnouncementActions(true);
                }}
                style={styles.announcementActionButton}
              >
                <MaterialIcons name="more-vert" size={18} color="#ffffff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.announcementCloseBtn}
              onPress={(e: GestureResponderEvent) => {
                e.stopPropagation();
                setShowAnnouncementBanner(false);
              }}
            >
              <MaterialIcons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {isSupervisor && canSupervise && !isAIChat && (
        <View style={[styles.supervisionBanner, { backgroundColor: Colors.primarySoft }]}>
          <View style={styles.supervisionContent}>
            <MaterialIcons name="supervised-user-circle" size={20} color={Colors.primaryContent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.supervisionTitle}>You are supervising this group</Text>
              {supervisionStats && (
                <Text style={styles.supervisionSubtitle}>
                  {supervisionStats.totalMessages} messages • {supervisionStats.participantCount} members
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.supervisionButton, { backgroundColor: Colors.error }]}
            onPress={handleRemoveSupervision}
          >
            <MaterialIcons name="close" size={16} color={Colors.surface} />
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <ImageBackground
          source={backgroundImageUrl ? { uri: backgroundImageUrl } : undefined}
          style={styles.messagesContainer}
          imageStyle={styles.backgroundImage}
        >
          <KeyboardAvoidingView
            style={styles.composerOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <FlatList
              ref={listRef}
              data={filteredMessages}
              keyExtractor={(item: ChatMessage) => item.id}
              renderItem={renderMessage}
              style={styles.messagesListContainer}
              contentContainerStyle={styles.messagesContentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="chat-bubble-outline" size={64} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>
                    {showMessageSearch ? 'No matching messages' : 'No messages yet'}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {showMessageSearch ? 'Try another search term' : 'Start the conversation!'}
                  </Text>
                </View>
              }
            />

            {replyingTo && (
              <View style={styles.replyBar}>
                <View style={styles.replyTextWrap}>
                  <Text style={styles.replyLabel}>Replying to</Text>
                  <Text style={styles.replyText} numberOfLines={1}>
                    {replyingTo.content}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)}>
                  <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {isDirectChat && directPartnerId && directConnectionStatus.status === 'pending_sent' && (
              <View style={[styles.directRequestBanner, { backgroundColor: Colors.warning + '20', borderColor: Colors.warning }]}>
                <MaterialIcons name="hourglass-top" size={18} color={Colors.warning} />
                <Text style={[styles.directRequestText, { color: Colors.text }]}>Request sent. You can send more messages after they accept.</Text>
              </View>
            )}

            {isDirectChat && directPartnerId && directConnectionStatus.status === 'pending_received' && (
              <View style={[styles.directRequestBanner, { backgroundColor: Colors.primary + '16', borderColor: Colors.primary }]}>
                <MaterialIcons name="mark-chat-unread" size={18} color={Colors.primary} />
                <Text style={[styles.directRequestText, { color: Colors.text }]}>This user sent you a chat request.</Text>
              </View>
            )}

            {!isAIChat && selectedAttachments.length > 0 && !isDirectRequestPending && (
              <View style={styles.attachmentTray}>
                <View style={styles.attachmentTrayHeader}>
                  <Text style={styles.attachmentTrayTitle}>{selectedAttachments.length} selected</Text>
                  <TouchableOpacity onPress={() => setSelectedAttachments([])}>
                    <Text style={styles.attachmentClearText}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.attachmentTrayScrollContent}
                >
                  {selectedAttachments.map((asset) => (
                    <View key={asset.id} style={styles.attachmentThumbWrap}>
                      <Image source={{ uri: asset.uri }} style={styles.attachmentThumb} />
                      <TouchableOpacity
                        style={styles.attachmentRemoveBtn}
                        onPress={() => removeSelectedAttachment(asset.id)}
                      >
                        <MaterialIcons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {isDirectChat && isDirectRequestPending ? (
              <View style={[styles.directComposerLock, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                <MaterialIcons name="lock-outline" size={18} color={Colors.textSecondary} />
                <Text style={[styles.directComposerLockText, { color: Colors.text }]}>
                  {directConnectionStatus.status === 'pending_sent'
                    ? 'Chat request sent. Messaging unlocks after receiver accepts.'
                    : 'Accept or reject this chat request to continue.'}
                </Text>
                {directConnectionStatus.status === 'pending_received' && (
                  <View style={styles.directComposerLockActions}>
                    <TouchableOpacity
                      style={[styles.directRequestButton, { borderColor: Colors.border, backgroundColor: Colors.background }]}
                      onPress={handleRejectDirectRequest}
                      disabled={isUpdatingDirectRequest}
                    >
                      <Text style={[styles.directRequestButtonText, { color: Colors.textSecondary }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.directRequestButton, { backgroundColor: Colors.primary }]}
                      onPress={handleAcceptDirectRequest}
                      disabled={isUpdatingDirectRequest}
                    >
                      <Text style={[styles.directRequestButtonText, { color: '#fff' }]}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
            <View style={styles.inputContainer}>
              <View
                style={[
                  styles.inputMain,
                  {
                    backgroundColor: backgroundImageUrl ? withHexAlpha(Colors.surface, 0.88) : Colors.surface,
                    borderColor: composerBorderColor,
                  },
                ]}
              >
                <TextInput
                  ref={messageInputRef}
                  style={styles.input}
                  value={messageText}
                  onChangeText={(text: string) => {
                    setMessageText(text);
                    if (!text.trim()) {
                      stopTypingSignal().catch(() => {});
                      return;
                    }
                    sendTypingSignal();
                  }}
                  placeholder={
                    isAIChat
                      ? 'Ask about an event, project, date, or pick an option above'
                      : canSendNewDirectRequest
                        ? 'Type first message to send chat request'
                        : isDirectRequestPending
                          ? 'Waiting for request acceptance...'
                          : 'Type a message'
                  }
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  maxLength={500}
                  blurOnSubmit={false}
                  textAlignVertical="top"
                  editable={!isSending && canSendInCurrentChat}
                />

                {isGroup && !isAIChat && (
                  <TouchableOpacity
                    style={[styles.pollComposerButton, { backgroundColor: pollComposerBg }]}
                    onPress={() => setShowCreatePoll(true)}
                  >
                    <MaterialIcons name="poll" size={20} color={pollComposerIconColor} />
                  </TouchableOpacity>
                )}

                {!isAIChat && (
                  <TouchableOpacity
                    style={[styles.attachButton, isUploadingAttachment && styles.attachButtonDisabled]}
                    onPress={handlePickAttachment}
                    disabled={isUploadingAttachment || isSending || (isDirectChat && directConnectionStatus.status !== 'accepted')}
                  >
                    {isUploadingAttachment ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <MaterialIcons name="attach-file" size={24} color={Colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: chatTheme.bubbleColor },
                  (isSending || isUploadingAttachment || (!messageText.trim() && !selectedAttachments.length) || !canSendInCurrentChat) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={isSending || isUploadingAttachment || (!messageText.trim() && !selectedAttachments.length) || !canSendInCurrentChat}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={chatTheme.textColor} />
                ) : (
                  <MaterialIcons name="send" size={22} color={chatTheme.textColor} />
                )}
              </TouchableOpacity>
            </View>
            )}
          </KeyboardAvoidingView>
        </ImageBackground>
      )}

      <Modal
        visible={!!imagePreviewUrl}
        animationType="fade"
        transparent
        onRequestClose={() => setImagePreviewUrl(null)}
      >
        <View style={styles.imagePreviewBackdrop}>
          <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setImagePreviewUrl(null)}>
            <MaterialIcons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.imagePreviewContainer}>
            {imagePreviewUrl ? (
              <Image source={{ uri: imagePreviewUrl }} style={styles.imagePreviewImage} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showChatOptions}
        animationType="slide"
        transparent
        onRequestClose={() => setShowChatOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.groupSettingsSheet}>
            <View style={styles.groupSettingsHandle} />

            <View style={styles.groupSettingsHeaderRow}>
              <View style={styles.groupSettingsHeaderTextWrap}>
                <Text style={styles.optionsTitle}>{isGroup ? 'Group Settings' : 'Chat Settings'}</Text>
                <Text style={styles.groupSettingsSubtitle}>
                  {isGroup ? 'Manage members, profile, and conversation tools' : 'Manage this conversation'}
                </Text>
              </View>
              <TouchableOpacity style={styles.groupSettingsCloseIcon} onPress={() => setShowChatOptions(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {isGroup && (
              <View style={styles.groupSettingsHeroCard}>
                <View style={styles.groupSettingsHeroLeft}>
                  <View style={[styles.groupVisibilityRingHeader, { borderColor: groupVisibilityRingColor }]}>
                    {groupDetails?.group_avatar ? (
                      <Image source={{ uri: groupDetails.group_avatar }} style={styles.headerAvatarImage} />
                    ) : (
                      <View style={[styles.headerAvatar, { backgroundColor: color }]}>
                        <Text style={styles.headerAvatarText}>{initials}</Text>
                      </View>
                    )}
                    <View style={[styles.groupVisibilityIconBadgeHeader, { backgroundColor: groupVisibilityRingColor }]}>
                      <MaterialIcons name="groups" size={10} color="#ffffff" />
                    </View>
                  </View>
                  <View style={styles.groupSettingsHeroTextWrap}>
                    <Text style={styles.groupSettingsHeroTitle} numberOfLines={1}>
                      {groupDetails?.group_name || name}
                    </Text>
                    <View style={styles.groupSettingsHeroMetaRow}>
                      <Text style={styles.groupSettingsHeroMeta}>{groupMembers.length} members</Text>
                      <View
                        style={[
                          styles.groupVisibilityPill,
                          groupDetails?.group_visibility === 'public'
                            ? styles.groupVisibilityPillPublic
                            : styles.groupVisibilityPillPrivate,
                        ]}
                      >
                        <Text
                          style={[
                            styles.groupVisibilityPillText,
                            groupDetails?.group_visibility === 'public'
                              ? styles.groupVisibilityPillTextPublic
                              : styles.groupVisibilityPillTextPrivate,
                          ]}
                        >
                          {groupDetails?.group_visibility === 'public' ? 'Public' : 'Private'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.groupSettingsHeroQuickBtn}
                  onPress={() => {
                    setShowChatOptions(false);
                    setShowGroupMembers(true);
                  }}
                >
                  <MaterialIcons name="groups" size={16} color={Colors.info} />
                  <Text style={styles.groupSettingsHeroQuickBtnText}>Members</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.groupSettingsScrollContent}>
              <Text style={styles.groupSettingsSectionTitle}>{isGroup ? 'Group Management' : 'Conversation'}</Text>
              <View style={styles.groupSettingsCard}>
                {isGroup && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      setShowGroupMembers(true);
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.info + '1A' }]}>
                      <MaterialIcons name="groups" size={18} color={Colors.info} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>View Group Members</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Open full-page member and request management</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {isGroup && canManageGroup && (
                  <TouchableOpacity style={styles.groupSettingsActionRow} onPress={openAddMembersModal}>
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.success + '1A' }]}>
                      <MaterialIcons name="person-add" size={18} color={Colors.success} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>Add Users to Group</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Invite your accepted connections</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {isGroup && canManageGroup && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      setShowGroupEdit(true);
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.primary + '1A' }]}>
                      <MaterialIcons name="edit" size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>Edit Group Profile</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Update name, avatar, bio, and visibility</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {!isGroup && !isAIChat && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      if (!directPartnerId) {
                        Toast.show({
                          type: 'info',
                          text1: 'Profile unavailable',
                          text2: 'Send or receive a message first to open profile.',
                        });
                        return;
                      }
                      navigation.navigate('PublicProfile', { userId: directPartnerId });
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.info + '1A' }]}>
                      <MaterialIcons name="person-outline" size={18} color={Colors.info} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>View User Profile</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Open participant profile</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.groupSettingsSectionTitle}>Tools</Text>
              <View style={styles.groupSettingsCard}>
                <TouchableOpacity
                  style={styles.groupSettingsActionRow}
                  onPress={() => {
                    setShowChatOptions(false);
                    setShowMessageSearch((prev) => !prev);
                    if (showMessageSearch) {
                      setMessageSearchQuery('');
                    }
                  }}
                >
                  <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.primary + '1A' }]}>
                    <MaterialIcons name="search" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.groupSettingsActionTextWrap}>
                    <Text style={styles.groupSettingsActionTitle}>{showMessageSearch ? 'Hide Search' : 'Search Messages'}</Text>
                    <Text style={styles.groupSettingsActionSubtitle}>Find content in this conversation</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.groupSettingsActionRow}
                  onPress={async () => {
                    setShowChatOptions(false);
                    await loadMessages();
                  }}
                >
                  <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.info + '1A' }]}>
                    <MaterialIcons name="refresh" size={18} color={Colors.info} />
                  </View>
                  <View style={styles.groupSettingsActionTextWrap}>
                    <Text style={styles.groupSettingsActionTitle}>Refresh Conversation</Text>
                    <Text style={styles.groupSettingsActionSubtitle}>Reload latest messages and updates</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.groupSettingsActionRow}
                  onPress={() => {
                    setShowChatOptions(false);
                    setShowThemePicker(true);
                  }}
                >
                  <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.warning + '1A' }]}>
                    <MaterialIcons name="palette" size={18} color={Colors.warning} />
                  </View>
                  <View style={styles.groupSettingsActionTextWrap}>
                    <Text style={styles.groupSettingsActionTitle}>Change Chat Theme</Text>
                    <Text style={styles.groupSettingsActionSubtitle}>Customize bubble colors</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>

                {!isAIChat && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      setShowBackgroundPicker(true);
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.success + '1A' }]}>
                      <MaterialIcons name="wallpaper" size={18} color={Colors.success} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>Chat Background</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Set a wallpaper for this chat</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.groupSettingsActionRow}
                  onPress={async () => {
                    setShowChatOptions(false);
                    if (conversationId && user?.id && !isAIChat) {
                      await markConversationAsRead(conversationId, user.id);
                    }
                    Toast.show({ type: 'success', text1: 'Marked as read' });
                  }}
                >
                  <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.primary + '1A' }]}>
                    <MaterialIcons name="done-all" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.groupSettingsActionTextWrap}>
                    <Text style={styles.groupSettingsActionTitle}>Mark as Read</Text>
                    <Text style={styles.groupSettingsActionSubtitle}>Clear unread indicators now</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>

                {isGroup && !isAIChat && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      setShowCreatePoll(true);
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: chatTheme.bubbleColor + '26' }]}>
                      <MaterialIcons name="poll" size={18} color={chatTheme.bubbleColor} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>Create Poll</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Collect votes from group members</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {isGroup && canManageGroup && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      setShowCreateAnnouncement(true);
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.warning + '1A' }]}>
                      <MaterialIcons name="campaign" size={18} color={Colors.warning} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={styles.groupSettingsActionTitle}>Create Announcement</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Broadcast important updates</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.groupSettingsSectionTitle}>Safety</Text>
              <View style={[styles.groupSettingsCard, styles.groupSettingsDangerCard]}>
                {!isAIChat && (
                  <TouchableOpacity
                    style={styles.groupSettingsActionRow}
                    onPress={() => {
                      setShowChatOptions(false);
                      setReportModalState({
                        visible: true,
                        contentType: isGroup ? 'group_chat' : 'chat',
                        contentId: conversationId,
                      });
                    }}
                  >
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.error + '18' }]}>
                      <MaterialIcons name="flag" size={18} color={Colors.error} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={[styles.groupSettingsActionTitle, styles.groupSettingsDangerText]}>Report {isGroup ? 'Group' : 'Chat'}</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Send a moderation report</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {isGroup && canManageGroup && (
                  <TouchableOpacity style={styles.groupSettingsActionRow} onPress={handleDeleteGroup}>
                    <View style={[styles.groupSettingsActionIconWrap, { backgroundColor: Colors.error + '18' }]}>
                      <MaterialIcons name="delete-forever" size={18} color={Colors.error} />
                    </View>
                    <View style={styles.groupSettingsActionTextWrap}>
                      <Text style={[styles.groupSettingsActionTitle, styles.groupSettingsDangerText]}>Delete Group</Text>
                      <Text style={styles.groupSettingsActionSubtitle}>Permanently remove group and history</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.groupSettingsCloseButton} onPress={() => setShowChatOptions(false)}>
              <Text style={styles.groupSettingsCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCreatePoll}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowCreatePoll(false);
          resetPollDraft();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Create Poll</Text>
            <Text style={styles.themeSubtitle}>Ask a question and let members vote.</Text>

            <TextInput
              value={pollQuestion}
              onChangeText={setPollQuestion}
              placeholder="Poll question"
              placeholderTextColor={Colors.textSecondary}
              style={styles.pollInput}
              maxLength={180}
            />

            <View style={styles.pollInputGroup}>
              {pollOptions.map((option, optionIndex) => (
                <TextInput
                  key={`poll-option-${optionIndex}`}
                  value={option}
                  onChangeText={(value: string) => updatePollOption(optionIndex, value)}
                  placeholder={`Option ${optionIndex + 1}`}
                  placeholderTextColor={Colors.textSecondary}
                  style={styles.pollInput}
                  maxLength={80}
                />
              ))}
            </View>

            {pollOptions.length < 6 && (
              <TouchableOpacity style={styles.optionRow} onPress={addPollOptionField}>
                <MaterialIcons name="add-circle-outline" size={20} color={Colors.text} />
                <Text style={styles.optionText}>Add Option</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.optionRow, styles.createPollButton, isCreatingPoll && { opacity: 0.7 }]}
              onPress={handleCreatePoll}
              disabled={isCreatingPoll}
            >
              {isCreatingPoll ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <MaterialIcons name="send" size={20} color="#ffffff" />
              )}
              <Text style={styles.createPollButtonText}>Post Poll</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => {
                setShowCreatePoll(false);
                resetPollDraft();
              }}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── WhatsApp-style Poll Votes Sheet ── */}
      <Modal
        visible={!!chatPollVotesSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setChatPollVotesSheet(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setChatPollVotesSheet(null)}>
          <View style={styles.waPollVotesSheet}>
            <View style={styles.waPollVotesHandle} />
            <Text style={styles.waPollVotesTitle} numberOfLines={2}>{chatPollVotesSheet?.question}</Text>
            {chatPollVotesSheet?.options.map((option, oi) => {
              const voters = chatPollVotesSheet.votersByOption[oi] || [];
              const count = chatPollVotesSheet.counts[oi] || 0;
              return (
                <View key={oi} style={styles.waPollVotesOptionGroup}>
                  <View style={styles.waPollVotesOptionHeader}>
                    <Text style={styles.waPollVotesOptionLabel}>{option}</Text>
                    <Text style={styles.waPollVotesOptionCount}>{count} vote{count !== 1 ? 's' : ''}</Text>
                  </View>
                  {voters.length === 0 ? (
                    <Text style={styles.waPollVotesNoVoters}>No votes yet</Text>
                  ) : (
                    voters.map((v) => (
                      <View key={v.id} style={styles.waPollVoterRow}>
                        {v.avatar ? (
                          <Image source={{ uri: v.avatar }} style={styles.waPollVoterAvatar} />
                        ) : (
                          <View style={[styles.waPollVoterAvatar, styles.waPollVoterAvatarFallback]}>
                            <Text style={styles.waPollVoterAvatarInitial}>{(v.name || '?')[0].toUpperCase()}</Text>
                          </View>
                        )}
                        <Text style={styles.waPollVoterName} numberOfLines={1}>{v.name}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
            <TouchableOpacity style={styles.waPollVotesCloseBtn} onPress={() => setChatPollVotesSheet(null)}>
              <Text style={styles.waPollVotesCloseTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showMessageOptions}
        animationType="fade"
        transparent
        onRequestClose={() => setShowMessageOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Message options</Text>

            {/* React with emoji */}
            {!isAIChat && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowMessageOptions(false);
                  if (selectedMessage?.id) openReactionPicker(selectedMessage.id);
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 2 }}>😊</Text>
                <Text style={styles.optionText}>React</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                setShowMessageOptions(false);
                if (selectedMessage) {
                  setReplyingTo(selectedMessage);
                }
              }}
            >
              <MaterialIcons name="reply" size={20} color={Colors.text} />
              <Text style={styles.optionText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionRow}
              onPress={async () => {
                setShowMessageOptions(false);
                if (selectedMessage) {
                  try {
                    // Note: Full forward implementation requires destination selection
                    // For now, we'll just show a toast
                    Toast.show({
                      type: 'info',
                      text1: 'Forwarding',
                      text2: 'Message forwarding requires selecting a destination. This will be implemented in the next phase.',
                    });
                  } catch (error: any) {
                    Toast.show({ type: 'error', text1: 'Failed to forward message', text2: error?.message });
                  }
                }
              }}
            >
              <MaterialIcons name="share" size={20} color={Colors.text} />
              <Text style={styles.optionText}>Forward</Text>
            </TouchableOpacity>

            {isGroup && canManageGroup && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={async () => {
                  setShowMessageOptions(false);
                  if (selectedMessage?.id) {
                    try {
                      await pinMessage(selectedMessage.id, conversationId, user?.id || '');
                      await loadPinnedMessagesCount();
                      Toast.show({ type: 'success', text1: 'Message pinned' });
                    } catch (error: any) {
                      Toast.show({ type: 'error', text1: 'Failed to pin message', text2: error?.message });
                    }
                  }
                }}
              >
                <MaterialIcons name="push-pin" size={20} color={Colors.primary} />
                <Text style={styles.optionText}>Pin Message</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                setShowMessageOptions(false);
                if (selectedMessage) {
                  setReportModalState({
                    visible: true,
                    contentType: 'message',
                    contentId: selectedMessage.id,
                  });
                }
              }}
            >
              <MaterialIcons name="flag" size={20} color={Colors.error} />
              <Text style={[styles.optionText, { color: Colors.error }]}>Report Message</Text>
            </TouchableOpacity>

            {/* Sender: Delete for Everyone */}
            {selectedMessage?.sender_id === user?.id && !isAIChat && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowMessageOptions(false);
                  if (selectedMessage?.id) handleDeleteMessage(selectedMessage.id);
                }}
              >
                <MaterialIcons name="delete-forever" size={20} color={Colors.error} />
                <Text style={[styles.optionText, { color: Colors.error }]}>Delete for Everyone</Text>
              </TouchableOpacity>
            )}

            {/* Receiver: Delete for Me only */}
            {selectedMessage?.sender_id !== user?.id && !isAIChat && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowMessageOptions(false);
                  if (selectedMessage?.id) hideMessageForMe(selectedMessage.id);
                }}
              >
                <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
                <Text style={[styles.optionText, { color: Colors.error }]}>Delete for Me</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowMessageOptions(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGroupMembers}
        animationType="slide"
        transparent
        onRequestClose={() => setShowGroupMembers(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.groupSettingsSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.optionsTitle}>Group members</Text>
              <TouchableOpacity onPress={() => setShowGroupMembers(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.groupProfileCard}>
              <View style={styles.groupProfileBadge}>
                <MaterialIcons name="groups" size={12} color={Colors.primaryContent} />
                <Text style={styles.groupProfileBadgeText}>Group Profile</Text>
              </View>

              <View style={styles.groupProfileMainRow}>
                {groupDetails?.group_avatar ? (
                  <View style={[styles.groupVisibilityRingProfile, { borderColor: groupVisibilityRingColor }]}>
                    <Image source={{ uri: groupDetails.group_avatar }} style={styles.groupProfileAvatar} />
                    <View style={[styles.groupVisibilityIconBadgeProfile, { backgroundColor: groupVisibilityRingColor }]}>
                      <MaterialIcons name="groups" size={11} color="#ffffff" />
                    </View>
                  </View>
                ) : (
                  <View style={[styles.groupVisibilityRingProfile, { borderColor: groupVisibilityRingColor }]}>
                    <View style={styles.groupProfileAvatarFallback}>
                      <Text style={styles.groupProfileAvatarText}>{initials}</Text>
                    </View>
                    <View style={[styles.groupVisibilityIconBadgeProfile, { backgroundColor: groupVisibilityRingColor }]}>
                      <MaterialIcons name="groups" size={11} color="#ffffff" />
                    </View>
                  </View>
                )}
                <View style={styles.groupProfileInfo}>
                  <Text style={styles.groupProfileName} numberOfLines={1}>
                    {groupDetails?.group_name || name}
                  </Text>
                  <Text style={styles.groupProfileMeta}>{groupMembers.length} members</Text>
                  <View
                    style={[
                      styles.groupVisibilityPill,
                      styles.groupProfileVisibility,
                      groupDetails?.group_visibility === 'public'
                        ? styles.groupVisibilityPillPublic
                        : styles.groupVisibilityPillPrivate,
                    ]}
                  >
                    <Text
                      style={[
                        styles.groupVisibilityPillText,
                        groupDetails?.group_visibility === 'public'
                          ? styles.groupVisibilityPillTextPublic
                          : styles.groupVisibilityPillTextPrivate,
                      ]}
                    >
                      {groupDetails?.group_visibility === 'public' ? 'Public group' : 'Private group'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.groupProfileBio,
                      !groupDetails?.group_bio && styles.groupProfileBioEmpty,
                    ]}
                    numberOfLines={2}
                  >
                    {groupDetails?.group_bio || 'No group bio yet'}
                  </Text>
                </View>
              </View>
            </View>

            {canManageGroup && (
              <View style={styles.joinRequestsSection}>
                <View style={styles.joinRequestsHeader}>
                  <Text style={styles.membersSectionLabel}>Pending Join Requests</Text>
                  <TouchableOpacity onPress={loadPendingJoinRequests}>
                    <MaterialIcons name="refresh" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {isLoadingGroupJoinRequests ? (
                  <View style={styles.membersLoadingWrap}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : pendingGroupJoinRequests.length === 0 ? (
                  <View style={styles.emptyMembersHint}>
                    <Text style={styles.emptyMembersHintText}>No pending requests.</Text>
                  </View>
                ) : (
                  pendingGroupJoinRequests.map((request) => {
                    const requesterName = request.requester?.full_name || request.requester?.email || 'User';
                    const roleLabel = request.requester?.role
                      ? `${request.requester.role.charAt(0).toUpperCase()}${request.requester.role.slice(1)}`
                      : '';
                    const departmentLabel = request.requester?.department || '';
                    const requestedOn = request.created_at
                      ? new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'Pending';

                    return (
                      <View key={request.id} style={styles.joinRequestCard}>
                        <View style={styles.joinRequestHeaderRow}>
                          <TouchableOpacity
                            style={styles.joinRequestMainInfo}
                            onPress={() => {
                              if (request.requester_id) {
                                navigation.navigate('PublicProfile', { userId: request.requester_id });
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <UserAvatar
                              uri={request.requester?.avatar_url}
                              name={request.requester?.full_name || request.requester?.email || request.requester_id || 'User'}
                              size={40}
                              showRing={false}
                              role={request.requester?.role}
                            />
                            <View style={styles.joinRequestIdentityWrap}>
                              <Text style={styles.joinRequestName} numberOfLines={1} ellipsizeMode="tail">
                                {requesterName}
                              </Text>
                              <View style={styles.joinRequestMetaRow}>
                                {!!roleLabel && (
                                  <View style={styles.joinRequestMetaLine}>
                                    <View style={styles.joinRequestRolePill}>
                                      <Text style={styles.joinRequestRolePillText}>{roleLabel}</Text>
                                    </View>
                                  </View>
                                )}
                                {!!departmentLabel && (
                                  <View style={styles.joinRequestMetaLine}>
                                    <Text style={styles.joinRequestDepartment} numberOfLines={1} ellipsizeMode="tail">
                                      {departmentLabel}
                                    </Text>
                                  </View>
                                )}
                                {!roleLabel && !departmentLabel && (
                                  <Text style={styles.joinRequestDepartment}>Requested to join</Text>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                          <Text style={styles.joinRequestDateLabel}>{requestedOn}</Text>
                        </View>

                        <View style={styles.joinRequestActions}>
                          <TouchableOpacity
                            style={[styles.joinRequestButton, styles.joinRequestAccept]}
                            onPress={() => handleReviewJoinRequest(request.id, 'accept')}
                            disabled={activeJoinReviewId === request.id}
                          >
                            {activeJoinReviewId === request.id ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Text style={[styles.joinRequestButtonText, styles.joinRequestButtonTextLight]}>Accept</Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.joinRequestButton, styles.joinRequestReject]}
                            onPress={() => handleReviewJoinRequest(request.id, 'reject')}
                            disabled={activeJoinReviewId === request.id}
                          >
                            <Text style={[styles.joinRequestButtonText, styles.joinRequestButtonTextDanger]}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            <Text style={styles.membersSectionLabel}>Members</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {groupMembers.map((member) => {
                const isMainAdmin = member.user_id === groupDetails?.created_by;
                const canManageThisMember =
                  canManageGroup &&
                  member.user_id !== user?.id &&
                  member.user_id !== groupDetails?.created_by;
                const groupRoleLabel = isMainAdmin
                  ? 'Main admin'
                  : member.is_admin
                    ? 'Group admin'
                    : member.role
                      ? `${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}`
                      : 'Member';
                const userRoleRaw = member.user?.role || 'member';
                const userRoleLabel = `${userRoleRaw.charAt(0).toUpperCase()}${userRoleRaw.slice(1)}`;

                return (
                  <View key={member.id} style={styles.memberItem}>
                    <TouchableOpacity
                      style={styles.memberMainInfo}
                      onPress={() => navigation.navigate('PublicProfile', { userId: member.user_id })}
                    >
                      <UserAvatar
                        uri={member.user?.avatar_url}
                        name={member.user?.full_name || 'Member'}
                        size={40}
                        showRing={false}
                        role={member.user?.role}
                      />
                      <View style={styles.memberTextWrap}>
                        <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">{member.user?.full_name || 'Member'}</Text>
                        <Text style={styles.memberMeta}>{`${groupRoleLabel} • ${userRoleLabel}`}</Text>
                        {!!member.user?.bio && (
                          <Text style={styles.memberBio} numberOfLines={2}>
                            {member.user.bio}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    {canManageThisMember && (
                      <TouchableOpacity
                        style={styles.memberActionButton}
                        onPress={() => setSelectedMember(member)}
                      >
                        <MaterialIcons name="more-horiz" size={20} color={Colors.text} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddGroupMembers}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddGroupMembers(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.membersSheet}>
            <View style={styles.membersHeader}>
              <Text style={styles.optionsTitle}>Add users to group</Text>
              <TouchableOpacity onPress={() => setShowAddGroupMembers(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchInputWrap}>
              <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                value={memberSearchQuery}
                onChangeText={setMemberSearchQuery}
                placeholder="Search connections"
                placeholderTextColor={Colors.textSecondary}
                style={styles.searchInputField}
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingConnections ? (
                <View style={styles.membersLoadingWrap}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : availableConnections.filter((connection) => {
                const query = memberSearchQuery.trim().toLowerCase();
                if (!query) return true;
                const name = (connection.profile?.full_name || '').toLowerCase();
                const dept = (connection.profile?.department || '').toLowerCase();
                return name.includes(query) || dept.includes(query);
              }).length === 0 ? (
                <View style={styles.emptyMembersHint}>
                  <Text style={styles.emptyMembersHintText}>No eligible connections to add.</Text>
                </View>
              ) : (
                availableConnections
                  .filter((connection) => {
                    const query = memberSearchQuery.trim().toLowerCase();
                    if (!query) return true;
                    const name = (connection.profile?.full_name || '').toLowerCase();
                    const dept = (connection.profile?.department || '').toLowerCase();
                    return name.includes(query) || dept.includes(query);
                  })
                  .map((connection) => {
                    const profileItem = connection.profile;
                    if (!profileItem?.id) return null;
                    const selected = selectedNewMemberIds.includes(profileItem.id);

                    return (
                      <TouchableOpacity
                        key={connection.id}
                        style={styles.memberItem}
                        onPress={() => handleToggleNewMember(profileItem.id)}
                        disabled={isAddingMembers}
                      >
                        <View style={styles.memberMainInfo}>
                          <UserAvatar
                            uri={profileItem.avatar_url}
                            name={profileItem.full_name || 'User'}
                            size={40}
                            showRing={false}
                            role={profileItem.role}
                          />
                          <View style={styles.memberTextWrap}>
                            <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">{profileItem.full_name || 'User'}</Text>
                            <Text style={styles.memberMeta}>{profileItem.department || profileItem.role || 'Connection'}</Text>
                          </View>
                        </View>

                        <View style={[styles.selectionBadge, selected && styles.selectionBadgeActive]}>
                          {selected && <MaterialIcons name="check" size={14} color="#ffffff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.optionRow,
                styles.primaryOption,
                (!selectedNewMemberIds.length || isAddingMembers) && styles.disabledPrimaryOption,
              ]}
              onPress={handleAddMembersToGroup}
              disabled={!selectedNewMemberIds.length || isAddingMembers}
            >
              {isAddingMembers ? (
                <ActivityIndicator size="small" color={Colors.primaryContent} />
              ) : (
                <MaterialIcons name="person-add" size={20} color={Colors.primaryContent} />
              )}
              <Text style={[styles.optionText, { color: Colors.primaryContent }]}>Add Selected ({selectedNewMemberIds.length})</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGroupEdit}
        animationType="slide"
        transparent
        onRequestClose={() => setShowGroupEdit(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Edit group profile</Text>

            <Text style={styles.inputLabel}>Group name</Text>
            <TextInput
              value={groupNameDraft}
              onChangeText={setGroupNameDraft}
              placeholder="Group name"
              placeholderTextColor={Colors.textSecondary}
              style={styles.groupInput}
            />

            <Text style={styles.inputLabel}>Group profile image</Text>
            <View style={styles.groupAvatarEditorRow}>
              <UserAvatar
                uri={groupAvatarDraft || undefined}
                name={groupNameDraft || groupDetails?.group_name || 'Group'}
                size={52}
                showRing={false}
              />
              <View style={styles.groupAvatarActionsCol}>
                <TouchableOpacity
                  style={[styles.optionRow, styles.avatarActionButton]}
                  onPress={handlePickGroupAvatar}
                  disabled={isUploadingGroupAvatar}
                >
                  {isUploadingGroupAvatar ? (
                    <ActivityIndicator size="small" color={Colors.primaryContent} />
                  ) : (
                    <MaterialIcons name="photo-library" size={18} color={Colors.primaryContent} />
                  )}
                  <Text style={[styles.optionText, { color: Colors.primaryContent }]}>Upload image</Text>
                </TouchableOpacity>

                {!!groupAvatarDraft && (
                  <TouchableOpacity
                    style={[styles.optionRow, styles.avatarRemoveButton]}
                    onPress={() => setGroupAvatarDraft('')}
                    disabled={isUploadingGroupAvatar}
                  >
                    <MaterialIcons name="delete-outline" size={18} color={Colors.error} />
                    <Text style={[styles.optionText, { color: Colors.error }]}>Remove image</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.inputLabel}>Group bio</Text>
            <TextInput
              value={groupBioDraft}
              onChangeText={setGroupBioDraft}
              placeholder="Say what this group is about"
              placeholderTextColor={Colors.textSecondary}
              style={[styles.groupInput, styles.groupBioInput]}
              multiline
              maxLength={180}
            />

            <Text style={styles.inputLabel}>Group visibility</Text>
            <View style={styles.visibilityToggleRow}>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  groupVisibilityDraft === 'private' && styles.visibilityOptionActive,
                ]}
                onPress={() => isMainAdmin && setGroupVisibilityDraft('private')}
                disabled={!isMainAdmin}
              >
                <MaterialIcons
                  name="lock"
                  size={16}
                  color={groupVisibilityDraft === 'private' ? Colors.primaryContent : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.visibilityOptionText,
                    groupVisibilityDraft === 'private' && styles.visibilityOptionTextActive,
                  ]}
                >
                  Private
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  groupVisibilityDraft === 'public' && styles.visibilityOptionActive,
                ]}
                onPress={() => isMainAdmin && setGroupVisibilityDraft('public')}
                disabled={!isMainAdmin}
              >
                <MaterialIcons
                  name="public"
                  size={16}
                  color={groupVisibilityDraft === 'public' ? Colors.primaryContent : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.visibilityOptionText,
                    groupVisibilityDraft === 'public' && styles.visibilityOptionTextActive,
                  ]}
                >
                  Public
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.visibilityHelpText}>
              {isMainAdmin
                ? 'Public groups are searchable and users can request to join. Private groups stay invite-only.'
                : 'Only the main admin can change visibility.'}
            </Text>

            <TouchableOpacity
              style={[styles.optionRow, styles.primaryOption]}
              onPress={handleSaveGroupProfile}
              disabled={isSavingGroup}
            >
              {isSavingGroup ? (
                <ActivityIndicator size="small" color={Colors.primaryContent} />
              ) : (
                <MaterialIcons name="save" size={20} color={Colors.primaryContent} />
              )}
              <Text style={[styles.optionText, { color: Colors.primaryContent }]}>Save changes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowGroupEdit(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedMember}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedMember(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>{selectedMember?.user?.full_name || 'Member'} options</Text>

            {!!selectedMember && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  const member = selectedMember;
                  setSelectedMember(null);
                  handleToggleMemberAdmin(member);
                }}
              >
                <MaterialIcons
                  name={selectedMember.is_admin ? 'person-remove' : 'admin-panel-settings'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.optionText}>
                  {selectedMember.is_admin ? 'Remove admin access' : 'Make group admin'}
                </Text>
              </TouchableOpacity>
            )}

            {!!selectedMember && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  const member = selectedMember;
                  setSelectedMember(null);
                  handleKickMember(member);
                }}
              >
                <MaterialIcons name="person-off" size={20} color={Colors.error} />
                <Text style={[styles.optionText, { color: Colors.error }]}>Remove from group</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setSelectedMember(null)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PinnedMessagesModal
        conversationId={conversationId}
        visible={showPinnedMessages}
        onClose={() => setShowPinnedMessages(false)}
        isAdmin={canManageGroup}
        onUnpin={async () => {
          await loadPinnedMessagesCount();
        }}
      />

      <Modal
        visible={showCreateAnnouncement}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateAnnouncement(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.optionsSheet, { maxHeight: '85%' }]}>
            <View style={styles.membersHeader}>
              <Text style={styles.optionsTitle}>Create Announcement</Text>
              <TouchableOpacity onPress={() => setShowCreateAnnouncement(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Announcement Title</Text>
              <TextInput
                style={styles.groupInput}
                placeholder="Enter announcement title"
                placeholderTextColor={Colors.textSecondary}
                value={announcementTitle}
                onChangeText={setAnnouncementTitle}
                editable={!isCreatingAnnouncement}
              />

              <Text style={styles.inputLabel}>Announcement Content</Text>
              <TextInput
                style={[styles.groupInput, { minHeight: 120, textAlignVertical: 'top' }]}
                placeholder="Enter announcement details"
                placeholderTextColor={Colors.textSecondary}
                value={announcementContent}
                onChangeText={setAnnouncementContent}
                multiline
                editable={!isCreatingAnnouncement}
              />

              <TouchableOpacity
                style={[
                  styles.primaryOption,
                  styles.optionRow,
                  isCreatingAnnouncement && styles.sendButtonDisabled,
                ]}
                onPress={handleCreateAnnouncement}
                disabled={isCreatingAnnouncement}
              >
                {isCreatingAnnouncement ? (
                  <ActivityIndicator size="small" color={Colors.primaryContent} />
                ) : (
                  <>
                    <MaterialIcons name="campaign" size={20} color={Colors.primaryContent} />
                    <Text style={[styles.optionText, { color: Colors.primaryContent }]}>Post Announcement</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionRow, styles.optionCancel]}
                onPress={() => setShowCreateAnnouncement(false)}
                disabled={isCreatingAnnouncement}
              >
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
                <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPinnedActions}
        animationType="fade"
        transparent
        onRequestClose={() => setShowPinnedActions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowPinnedActions(false)}
          activeOpacity={1}
        >
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Pinned Message Options</Text>

            <TouchableOpacity
              style={[styles.optionRow, { marginBottom: Spacing.xs }]}
              onPress={() => {
                setShowPinnedActions(false);
                setShowPinnedMessages(true);
              }}
            >
              <MaterialIcons name="list" size={20} color={Colors.info} />
              <Text style={styles.optionText}>View all pinned messages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionRow, { marginBottom: Spacing.xs }]}
              onPress={() => {
                handleUnpinMessage();
              }}
            >
              <MaterialIcons name="push-pin" size={20} color={Colors.warning} />
              <Text style={styles.optionText}>Unpin this message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowPinnedActions(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showAnnouncementActions}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAnnouncementActions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowAnnouncementActions(false)}
          activeOpacity={1}
        >
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Announcement Options</Text>

            <TouchableOpacity
              style={[styles.optionRow, { marginBottom: Spacing.xs }]}
              onPress={() => {
                handleDeleteAnnouncement();
              }}
            >
              <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
              <Text style={[styles.optionText, { color: Colors.error }]}>Delete announcement</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowAnnouncementActions(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Chat Theme Picker */}
      <Modal
        visible={showThemePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowThemePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Choose Chat Theme</Text>
            <Text style={styles.themeSubtitle}>Pick colors for both sender and receiver bubbles</Text>

            <View style={styles.themeGrid}>
              {CHAT_THEMES.map((theme) => {
                const isSelected = chatTheme.key === theme.key;
                return (
                  <TouchableOpacity
                    key={theme.key}
                    style={styles.themeOption}
                    onPress={() => selectChatTheme(theme)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.themeCircle,
                        { backgroundColor: theme.bubbleColor },
                        isSelected && styles.themeCircleSelected,
                      ]}
                    >
                      {isSelected && (
                        <MaterialIcons name="check" size={20} color={theme.textColor} />
                      )}
                    </View>
                    <Text style={[styles.themeLabel, isSelected && styles.themeLabelSelected]}>
                      {theme.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Preview */}
            <View style={styles.themePreview}>
              <View
                style={[
                  styles.previewBubbleOther,
                  {
                    backgroundColor: chatTheme.incomingBubbleColor,
                    borderColor: chatTheme.incomingBorderColor,
                  },
                ]}
              >
                <Text style={{ fontSize: 13, color: chatTheme.incomingTextColor }}>Hey, how are you?</Text>
              </View>
              <View style={[styles.previewBubbleMine, { backgroundColor: chatTheme.bubbleColor }]}>
                <Text style={{ fontSize: 13, color: chatTheme.textColor }}>I'm doing great! 😊</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowThemePicker(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Chat Background Picker */}
      <Modal
        visible={showBackgroundPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBackgroundPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Chat Background</Text>
            <Text style={styles.themeSubtitle}>Customize your chat background</Text>

            {backgroundImageUrl && (
              <View style={styles.backgroundPreview}>
                <Image
                  source={{ uri: backgroundImageUrl }}
                  style={styles.backgroundPreviewImage}
                  resizeMode="cover"
                />
                <Text style={styles.backgroundPreviewLabel}>Current Background</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.optionRow}
              onPress={handlePickBackgroundImage}
              disabled={isLoadingBackground}
            >
              <MaterialIcons name="add-photo-alternate" size={20} color={Colors.primary} />
              <Text style={styles.optionText}>
                {backgroundImageUrl ? 'Change Background' : 'Choose from Gallery'}
              </Text>
              {isLoadingBackground && <ActivityIndicator size="small" color={Colors.primary} />}
            </TouchableOpacity>

            {backgroundImageUrl && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={handleRemoveBackground}
                disabled={isLoadingBackground}
              >
                <MaterialIcons name="delete" size={20} color={Colors.error} />
                <Text style={[styles.optionText, { color: Colors.error }]}>Remove Background</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowBackgroundPicker(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reactionPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setReactionPickerVisible(false);
          setReactionTargetMessageId(null);
        }}
      >
        <TouchableOpacity
          style={styles.centeredModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setReactionPickerVisible(false);
            setReactionTargetMessageId(null);
          }}
        >
          <View style={styles.reactionPickerSheet}>
            <Text style={styles.optionsTitle}>React to Message</Text>
            <View style={styles.reactionChoiceRow}>
              {reactionChoices.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionChoiceButton}
                  onPress={() => handlePickReaction(emoji)}
                >
                  <Text style={styles.reactionChoiceText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isGroup && canManageGroup && !!reactionTargetMessageId && (
              <TouchableOpacity style={[styles.optionRow, { marginTop: Spacing.md }]} onPress={openMessageOptionsFromReactionPicker}>
                <MaterialIcons name="more-horiz" size={20} color={Colors.primary} />
                <Text style={styles.optionText}>More options (Pin, Reply, etc.)</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <ConfirmDialog
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, visible: false }));
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, visible: false }))}
        type="danger"
      />

      <ReportModal
        isVisible={reportModalState.visible}
        onClose={() => setReportModalState({ ...reportModalState, visible: false })}
        contentType={reportModalState.contentType}
        reportedContentId={reportModalState.contentId}
      />
    </SafeAreaView>
    </View>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      gap: 10,
    },
    backButton: {
      padding: 4,
    },
    headerMainInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minWidth: 0,
    },
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerAvatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: Colors.card,
    },
    groupVisibilityRingHeader: {
      borderWidth: 2,
      borderRadius: 22,
      padding: 1,
      position: 'relative',
    },
    groupVisibilityIconBadgeHeader: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#ffffff',
      zIndex: 3,
    },
    headerAvatarText: {
      fontSize: 16,
      fontWeight: FontWeights.bold,
      color: Colors.surface,
    },
    headerInfo: {
      flex: 1,
      minWidth: 0,
    },
    headerName: {
      flexShrink: 1,
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    headerStatus: {
      fontSize: 12,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    directStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    onlineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#22C55E',
    },
    groupHeaderMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: 2,
      flexWrap: 'wrap',
    },
    groupBioPreview: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      flexShrink: 1,
      maxWidth: 180,
    },
    groupBioPreviewEmpty: {
      fontStyle: 'italic',
      opacity: 0.85,
    },
    groupPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    groupPreviewAvatar: {
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: Colors.surface,
    },
    moreButton: {
      padding: 4,
    },
    pinnedButton: {
      padding: 4,
      position: 'relative',
    },
    pinnedBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: Colors.primary,
      borderRadius: 10,
      minWidth: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    pinnedBadgeText: {
      fontSize: 10,
      fontWeight: FontWeights.bold,
      color: Colors.primaryContent,
    },
    messageSearchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    messageSearchInput: {
      flex: 1,
      color: Colors.text,
      fontSize: FontSizes.md,
    },
    floatingBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      gap: Spacing.md,
      borderBottomWidth: 0,
      marginHorizontal: Spacing.md,
      marginVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      minHeight: 70,
      ...Shadows.lg,
    },
    bannelContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    bannerContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      minWidth: 0,
    },
    bannerIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    bannerText: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    bannerLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    bannerMessageText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.medium,
      lineHeight: 18,
      flexWrap: 'wrap',
    },
    bannerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginTop: 0,
    },
    actionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(59, 130, 246, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinnedCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    announcementLabel: {
      fontSize: FontSizes.xs,
      color: '#ffffff',
      fontWeight: FontWeights.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      opacity: 0.95,
      marginBottom: 6,
    },
    announcementMessageText: {
      fontSize: FontSizes.md,
      color: '#ffffff',
      fontWeight: FontWeights.semibold,
      lineHeight: 22,
      marginRight: Spacing.sm,
    },
    announcementActionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    announcementCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinnedBanner: {
      backgroundColor: Colors.primarySoft,
      borderBottomColor: Colors.primary,
    },
    announcementBanner: {
      backgroundColor: '#ef4444',
      borderBottomColor: '#dc2626',
    },
    messagesContainer: {
      flex: 1,
    },
    messagesListContainer: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    backgroundImage: {
      opacity: 1,
    },
    backgroundPreview: {
      alignItems: 'center',
      marginVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
    },
    backgroundPreviewImage: {
      width: '100%',
      height: 200,
      borderRadius: BorderRadius.lg,
    },
    backgroundPreviewLabel: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.sm,
      fontWeight: FontWeights.medium,
    },
    messagesContentContainer: {
      paddingHorizontal: 6,
      paddingVertical: 6,
      paddingBottom: 10,
    },
    composerOverlay: {
      flex: 1,
      width: '100%',
    },
    messageWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 12,
      width: '100%',
    },
    dateSeparatorContainer: {
      alignItems: 'center',
      marginBottom: 6,
      marginTop: 8,
    },
    dateSeparatorLabel: {
      fontSize: 11,
      color: Colors.textSecondary,
      backgroundColor: Colors.card,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      overflow: 'hidden',
      fontWeight: '500',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    myMessageWrapper: {
      justifyContent: 'flex-end',
    },
    otherMessageWrapper: {
      justifyContent: 'flex-start',
    },
    messageBubble: {
      maxWidth: '100%',
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 9,
      ...Shadows.sm,
    },
    myMessage: {
      backgroundColor: Colors.primary,
      borderBottomRightRadius: 8,
    },
    otherMessage: {
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      borderBottomLeftRadius: 8,
    },
    senderName: {
      fontSize: FontSizes.xs,
      marginBottom: 3,
      fontWeight: FontWeights.semibold,
    },
    senderNameMine: {
      textAlign: 'right',
    },
    avatarLaneStart: {
      width: 34,
      marginRight: 8,
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    avatarLaneEnd: {
      width: 34,
      marginLeft: 8,
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
    },
    messageContentWrap: {
      paddingRight: 2,
    },
    aiOptionsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    aiOptionChip: {
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: `${Colors.primary}15`,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    aiOptionChipText: {
      fontSize: FontSizes.sm,
      color: Colors.primary,
      fontWeight: FontWeights.semibold,
    },
    messageText: {
      fontSize: FontSizes.md,
      lineHeight: 21,
      letterSpacing: 0.1,
    },
    myMessageText: {
      color: Colors.primaryContent,
      textAlign: 'right',
    },
    otherMessageText: {
      color: Colors.text,
    },
    messageBubbleWrap: {
      width: 'auto',
      maxWidth: '84%',
    },
    bubbleShort: {
      maxWidth: '42%',
    },
    bubbleMedium: {
      maxWidth: '64%',
    },
    bubbleLong: {
      maxWidth: '82%',
    },
    bubbleImage: {
      maxWidth: '72%',
      minWidth: 180,
    },
    imageMessageBubble: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderRadius: 14,
    },
    messageFooter: {
      flexDirection: 'row',
      marginTop: 6,
      alignItems: 'center',
      gap: 6,
      minHeight: 20,
      width: '100%',
    },
    imageMessageWrap: {
      gap: 6,
    },
    imageMessage: {
      width: '100%',
      aspectRatio: 3 / 4,
      maxHeight: 320,
      borderRadius: 12,
      backgroundColor: Colors.border,
    },
    myMessageFooter: {
      justifyContent: 'flex-end',
      alignItems: 'center',
      alignSelf: 'flex-end',
    },
    otherMessageFooter: {
      justifyContent: 'flex-end',
      alignItems: 'center',
      alignSelf: 'flex-end',
    },
    messageTime: {
      fontSize: 10,
      fontWeight: FontWeights.medium,
      lineHeight: 14,
    },
    myMessageTime: {
      color: Colors.primaryContent,
      opacity: 0.8,
    },
    otherMessageTime: {
      color: Colors.textSecondary,
    },
    seenIndicator: {
      marginLeft: 4,
      opacity: 0.9,
    },
    reactionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 5,
    },
    myReactionRow: {
      justifyContent: 'flex-end',
    },
    otherReactionRow: {
      justifyContent: 'flex-start',
    },
    reactionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    reactionPillActive: {
      borderColor: Colors.primary,
      backgroundColor: `${Colors.primary}20`,
    },
    reactionPillEmoji: {
      fontSize: 13,
    },
    reactionPillCount: {
      fontSize: 11,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
    },
    reactionPillCountActive: {
      color: Colors.primary,
    },
    // ── WhatsApp-style poll card ───────────────────────────────────────────
    waPollCard: {
      width: '100%',
      backgroundColor: Colors.card,
      padding: 0,
    },
    waPollQuestion: {
      fontSize: 15,
      fontWeight: '600' as any,
      color: Colors.text,
      marginBottom: 2,
    },
    waPollSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 10,
    },
    waPollSubtitle: {
      fontSize: 12,
      color: Colors.textSecondary,
    },
    waPollDivider: {
      height: 0,
      backgroundColor: 'transparent',
      marginHorizontal: 0,
      marginBottom: 0,
    },
    waPollOptionsWrap: {
      gap: 6,
      marginBottom: 8,
    },
    waPollOptionWrap: {
      gap: 6,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      backgroundColor: Colors.background,
    },
    waPollOptionWrapActive: {
      borderWidth: 1,
    },
    waPollOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    waPollCheckCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    waPollCheckCircleActive: {
      borderColor: Colors.primary,
      borderWidth: 0,
      backgroundColor: Colors.primary,
    },
    waPollOptionLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500' as any,
      color: Colors.text,
    },
    waPollOptionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    waPollAvatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    waPollAvatarWrap: {
      width: 18,
      height: 18,
      borderWidth: 1.5,
      borderColor: Colors.border,
      borderRadius: 9,
      overflow: 'hidden',
    },
    waPollAvatar: {
      width: 18,
      height: 18,
      borderRadius: 9,
    },
    waPollAvatarFallback: {
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    waPollAvatarInitial: {
      fontSize: 8,
      fontWeight: '700' as any,
      color: '#fff',
    },
    waPollVoteCount: {
      fontSize: 12,
      fontWeight: '600' as any,
      color: Colors.textSecondary,
      minWidth: 32,
      textAlign: 'right',
    },
    waPollProgressBg: {
      height: 4,
      borderRadius: 4,
      backgroundColor: Colors.border,
      overflow: 'hidden',
      marginTop: 4,
    },
    waPollProgressFill: {
      height: 4,
      borderRadius: 4,
    },
    waPollViewVotesBtn: {
      marginTop: 6,
      paddingVertical: 6,
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    waPollViewVotesText: {
      fontSize: 14,
      fontWeight: '600' as any,
      color: Colors.primary,
    },
    // ── Poll Votes Sheet ──────────────────────────────────────────────────────
    waPollVotesSheet: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      marginTop: 'auto',
      paddingHorizontal: 18,
      paddingBottom: 28,
      paddingTop: 10,
      maxHeight: '80%',
    },
    waPollVotesHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.border,
      alignSelf: 'center',
      marginBottom: 14,
    },
    waPollVotesTitle: {
      color: Colors.text,
      fontSize: 16,
      fontWeight: '700' as any,
      marginBottom: 16,
    },
    waPollVotesOptionGroup: {
      marginBottom: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: Colors.border,
      paddingBottom: 12,
    },
    waPollVotesOptionHeader: {
      flexDirection: 'row' as any,
      justifyContent: 'space-between' as any,
      alignItems: 'center' as any,
      marginBottom: 8,
    },
    waPollVotesOptionLabel: {
      color: Colors.text,
      fontSize: 14,
      fontWeight: '600' as any,
      flex: 1,
      marginRight: 8,
    },
    waPollVotesOptionCount: {
      color: Colors.textSecondary,
      fontSize: 13,
    },
    waPollVotesNoVoters: {
      color: Colors.textSecondary,
      fontSize: 12,
      fontStyle: 'italic' as any,
    },
    waPollVoterRow: {
      flexDirection: 'row' as any,
      alignItems: 'center' as any,
      gap: 10,
      marginBottom: 8,
    },
    waPollVoterAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    waPollVoterAvatarFallback: {
      backgroundColor: Colors.primary,
      alignItems: 'center' as any,
      justifyContent: 'center' as any,
    },
    waPollVoterAvatarInitial: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700' as any,
    },
    waPollVoterName: {
      color: Colors.text,
      fontSize: 14,
      flex: 1,
    },
    waPollVotesCloseBtn: {
      marginTop: 6,
      alignItems: 'center' as any,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: Colors.primary,
    },
    waPollVotesCloseTxt: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600' as any,
    },
    // ── Legacy poll styles (kept for reference) ──────────────────────────────
    pollCard: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      padding: Spacing.sm,
      gap: 8,
    },
    myPollCard: {
      borderColor: 'rgba(255,255,255,0.28)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    otherPollCard: {
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    pollHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pollHeaderLabel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    pollQuestion: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      lineHeight: 20,
    },
    pollOptionsWrap: {
      gap: 6,
    },
    pollOption: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: Colors.card,
    },
    pollOptionMine: {
      borderColor: 'rgba(255,255,255,0.24)',
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    pollOptionActive: {
      borderColor: Colors.primary,
    },
    pollOptionProgress: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      minWidth: 2,
    },
    pollOptionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 8,
      gap: 8,
    },
    pollOptionText: {
      flex: 1,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    pollVoteText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    pollFooter: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    reactionPickerSheet: {
      width: '88%',
      maxWidth: 340,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      ...Shadows.md,
    },
    reactionChoiceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: Spacing.sm,
    },
    reactionChoiceButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    reactionChoiceText: {
      fontSize: 21,
    },
    replyBar: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.xs,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    replyTextWrap: {
      flex: 1,
    },
    replyLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
    },
    replyText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
    },
    directRequestBanner: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.xs,
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    directRequestText: {
      flex: 1,
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    directRequestActions: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    directRequestButton: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    directRequestButtonText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    directComposerLock: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    directComposerLockText: {
      flex: 1,
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
    },
    directComposerLockActions: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    attachmentTray: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.xs,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      gap: 8,
    },
    attachmentTrayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    attachmentTrayTitle: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
    },
    attachmentClearText: {
      fontSize: FontSizes.xs,
      color: Colors.primary,
      fontWeight: FontWeights.semibold,
    },
    attachmentTrayScrollContent: {
      gap: 8,
      paddingRight: 4,
    },
    attachmentThumbWrap: {
      width: 58,
      height: 58,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: Colors.border,
    },
    attachmentThumb: {
      width: '100%',
      height: '100%',
    },
    attachmentRemoveBtn: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: Platform.OS === 'ios' ? 10 : 6,
      gap: 6,
      backgroundColor: 'transparent',
      borderTopWidth: 0,
    },
    inputMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 20,
      paddingLeft: 6,
      paddingRight: 6,
      paddingVertical: 2,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    attachButton: {
      padding: 8,
      marginBottom: 1,
    },
    attachButtonDisabled: {
      opacity: 0.55,
    },
    pollComposerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: 'transparent',
      borderWidth: 0,
      paddingHorizontal: 8,
      paddingVertical: 10,
      fontSize: FontSizes.md,
      color: Colors.text,
      maxHeight: 110,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
    imagePreviewBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
    },
    imagePreviewContainer: {
      width: '100%',
      height: '82%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    imagePreviewImage: {
      width: '100%',
      height: '100%',
    },
    imagePreviewClose: {
      position: 'absolute',
      top: 56,
      right: 20,
      zIndex: 10,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(0,0,0,0.36)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      gap: 12,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    emptySubtext: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
    },
    supervisionBanner: {
      backgroundColor: Colors.primarySoft,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    supervisionContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    supervisionTitle: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    supervisionSubtitle: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    supervisionButton: {
      width: 32,
      height: 32,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    centeredModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionsSheet: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.lg,
      gap: Spacing.xs,
    },
    groupSettingsSheet: {
      maxHeight: '88%',
      backgroundColor: Colors.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingHorizontal: Spacing.md,
      paddingTop: 10,
      paddingBottom: Spacing.md,
    },
    groupSettingsHandle: {
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.border,
      alignSelf: 'center',
      marginBottom: Spacing.sm,
    },
    groupSettingsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    groupSettingsHeaderTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    groupSettingsSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    groupSettingsCloseIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.card,
    },
    groupSettingsHeroCard: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    groupSettingsHeroLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    groupSettingsHeroTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    groupSettingsHeroTitle: {
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    groupSettingsHeroMeta: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    groupSettingsHeroMetaRow: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    groupSettingsHeroQuickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: Colors.info,
      backgroundColor: Colors.info + '18',
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 7,
    },
    groupSettingsHeroQuickBtnText: {
      fontSize: FontSizes.sm,
      color: Colors.info,
      fontWeight: FontWeights.semibold,
    },
    groupSettingsScrollContent: {
      paddingBottom: Spacing.md,
      gap: Spacing.sm,
    },
    groupSettingsSectionTitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
      marginTop: 2,
      marginLeft: 2,
    },
    groupSettingsCard: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.card,
      overflow: 'hidden',
    },
    groupSettingsDangerCard: {
      borderColor: Colors.error + '55',
    },
    groupSettingsActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    groupSettingsActionIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupSettingsActionTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    groupSettingsActionTitle: {
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    groupSettingsActionSubtitle: {
      marginTop: 1,
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    groupSettingsDangerText: {
      color: Colors.error,
    },
    groupSettingsCloseButton: {
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      backgroundColor: Colors.card,
    },
    groupSettingsCloseButtonText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
    },
    membersSheet: {
      maxHeight: '75%',
      backgroundColor: Colors.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.lg,
    },
    membersHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    groupProfileCard: {
      alignItems: 'flex-start',
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    groupProfileBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
    },
    groupProfileBadgeText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.primaryContent,
    },
    membersSectionLabel: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
      marginBottom: Spacing.xs,
      marginLeft: 2,
    },
    groupProfileMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      width: '100%',
    },
    groupProfileAvatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: Colors.surface,
    },
    groupVisibilityRingProfile: {
      borderWidth: 2,
      borderRadius: 27,
      padding: 1,
      position: 'relative',
    },
    groupVisibilityIconBadgeProfile: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#ffffff',
      zIndex: 3,
    },
    groupProfileAvatarFallback: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupProfileAvatarText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.primaryContent,
    },
    groupProfileInfo: {
      flex: 1,
      minWidth: 0,
    },
    groupProfileName: {
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    groupProfileMeta: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 1,
    },
    groupProfileVisibility: {
      marginTop: 2,
      alignSelf: 'flex-start',
    },
    groupVisibilityPill: {
      borderWidth: 1,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: 'flex-start',
    },
    groupVisibilityPillPublic: {
      borderColor: '#D52B1E',
      backgroundColor: '#D52B1E1A',
    },
    groupVisibilityPillPrivate: {
      borderColor: '#138A36',
      backgroundColor: '#138A361A',
    },
    groupVisibilityPillText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
    },
    groupVisibilityPillTextPublic: {
      color: '#B42318',
    },
    groupVisibilityPillTextPrivate: {
      color: '#0F6A2A',
    },
    groupProfileBio: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 3,
    },
    groupProfileBioEmpty: {
      fontStyle: 'italic',
      opacity: 0.85,
    },
    joinRequestsSection: {
      marginBottom: Spacing.md,
      gap: Spacing.xs,
    },
    joinRequestsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    joinRequestCard: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.card,
      padding: Spacing.sm,
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
      borderLeftWidth: 3,
      borderLeftColor: Colors.primary,
    },
    joinRequestHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    joinRequestMainInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      gap: Spacing.sm,
    },
    joinRequestIdentityWrap: {
      flex: 1,
      minWidth: 0,
    },
    joinRequestName: {
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    joinRequestMetaRow: {
      marginTop: 4,
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 4,
    },
    joinRequestMetaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
    },
    joinRequestRolePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: Colors.info,
      backgroundColor: Colors.info + '16',
      borderRadius: 999,
    },
    joinRequestRolePillText: {
      fontSize: FontSizes.xs,
      color: Colors.info,
      fontWeight: FontWeights.semibold,
    },
    joinRequestDepartment: {
      flexShrink: 1,
      fontSize: FontSizes.sm,
      color: Colors.text,
      opacity: 0.9,
    },
    joinRequestDateLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    joinRequestActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    joinRequestButton: {
      borderRadius: BorderRadius.md,
      flex: 1,
      minHeight: 36,
      paddingHorizontal: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    joinRequestAccept: {
      backgroundColor: Colors.success,
      borderWidth: 1,
      borderColor: Colors.success,
    },
    joinRequestReject: {
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.error,
    },
    joinRequestButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    joinRequestButtonTextLight: {
      color: '#ffffff',
    },
    joinRequestButtonTextDanger: {
      color: Colors.error,
    },
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    memberMainInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: Spacing.sm,
    },
    memberTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    memberName: {
      flexShrink: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    memberMeta: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    memberBio: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
    },
    memberActionButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
    },
    optionsTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.xs,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.card,
    },
    optionText: {
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    optionCancel: {
      marginTop: Spacing.xs,
    },
    pollInputGroup: {
      gap: 8,
      marginBottom: Spacing.sm,
    },
    pollInput: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      color: Colors.text,
      fontSize: FontSizes.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
    },
    createPollButton: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
      justifyContent: 'center',
    },
    createPollButtonText: {
      fontSize: FontSizes.md,
      color: '#ffffff',
      fontWeight: FontWeights.semibold,
    },
    themeSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: Spacing.md,
      marginTop: -4,
    },
    themeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: Spacing.sm,
    },
    themeOption: {
      alignItems: 'center',
      gap: 6,
      width: 64,
    },
    themeCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
    themeCircleSelected: {
      borderWidth: 3,
      borderColor: Colors.text,
    },
    themeLabel: {
      fontSize: 11,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    themeLabelSelected: {
      color: Colors.text,
      fontWeight: FontWeights.bold,
    },
    themePreview: {
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.background,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    previewBubbleOther: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      borderWidth: 1,
      maxWidth: '70%',
    },
    previewBubbleMine: {
      alignSelf: 'flex-end',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      borderBottomRightRadius: 6,
      maxWidth: '70%',
    },
    inputLabel: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.xs,
      marginBottom: Spacing.xs,
    },
    groupInput: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.background,
      color: Colors.text,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: FontSizes.md,
      marginBottom: Spacing.sm,
    },
    groupBioInput: {
      minHeight: 90,
      textAlignVertical: 'top',
    },
    visibilityToggleRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    visibilityOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      paddingVertical: Spacing.sm,
    },
    visibilityOptionActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primary,
    },
    visibilityOptionText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    visibilityOptionTextActive: {
      color: Colors.primaryContent,
      fontWeight: FontWeights.semibold,
    },
    visibilityHelpText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    groupAvatarEditorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.sm,
    },
    groupAvatarActionsCol: {
      flex: 1,
      gap: Spacing.xs,
    },
    avatarActionButton: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
      borderRadius: BorderRadius.md,
      justifyContent: 'center',
    },
    avatarRemoveButton: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.error,
      justifyContent: 'center',
    },
    primaryOption: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
      justifyContent: 'center',
    },
    searchInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      marginBottom: Spacing.md,
      backgroundColor: Colors.card,
    },
    searchInputField: {
      flex: 1,
      color: Colors.text,
      fontSize: FontSizes.sm,
    },
    membersLoadingWrap: {
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyMembersHint: {
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    emptyMembersHintText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    selectionBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.card,
    },
    selectionBadgeActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primary,
    },
    disabledPrimaryOption: {
      opacity: 0.5,
    },
  });
