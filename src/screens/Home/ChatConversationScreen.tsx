import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { BorderRadius, FontSizes, FontWeights, getColors, Shadows, Spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
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
} from '../../api/chat';
import { ConnectionWithProfile, getMyConnections } from '../../api/connections';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import ConfirmDialog from '../../components/ConfirmDialog';
import { UserAvatar } from '../../components/UserAvatar';
import PinnedMessagesModal from '../../components/PinnedMessagesModal';
import { supabase } from '../../api/supabase';
import { decryptMessage } from '../../../utils/encryption';

const CHAT_THEME_KEY = 'chat_color_theme';

type ChatTheme = {
  key: string;
  label: string;
  bubbleColor: string;
  textColor: string;
  timeColor: string;
  incomingBubbleColor: string;
  incomingTextColor: string;
  incomingTimeColor: string;
  incomingBorderColor: string;
};

const CHAT_THEMES: ChatTheme[] = [
  {
    key: 'default',
    label: 'Teal',
    bubbleColor: '#13ecec',
    textColor: '#0e3a3a',
    timeColor: '#0e3a3a',
    incomingBubbleColor: '#d8fafa',
    incomingTextColor: '#0f3d3d',
    incomingTimeColor: '#2b5f5f',
    incomingBorderColor: '#aeecec',
  },
  {
    key: 'blue',
    label: 'Blue',
    bubbleColor: '#3B82F6',
    textColor: '#ffffff',
    timeColor: '#dbeafe',
    incomingBubbleColor: '#dbeafe',
    incomingTextColor: '#1e3a8a',
    incomingTimeColor: '#1d4ed8',
    incomingBorderColor: '#bfdbfe',
  },
  {
    key: 'purple',
    label: 'Purple',
    bubbleColor: '#8B5CF6',
    textColor: '#ffffff',
    timeColor: '#ede9fe',
    incomingBubbleColor: '#ede9fe',
    incomingTextColor: '#5b21b6',
    incomingTimeColor: '#6d28d9',
    incomingBorderColor: '#ddd6fe',
  },
  {
    key: 'green',
    label: 'Green',
    bubbleColor: '#10B981',
    textColor: '#ffffff',
    timeColor: '#d1fae5',
    incomingBubbleColor: '#d1fae5',
    incomingTextColor: '#065f46',
    incomingTimeColor: '#047857',
    incomingBorderColor: '#a7f3d0',
  },
  {
    key: 'rose',
    label: 'Rose',
    bubbleColor: '#F43F5E',
    textColor: '#ffffff',
    timeColor: '#ffe4e6',
    incomingBubbleColor: '#ffe4e6',
    incomingTextColor: '#9f1239',
    incomingTimeColor: '#be123c',
    incomingBorderColor: '#fecdd3',
  },
  {
    key: 'orange',
    label: 'Orange',
    bubbleColor: '#F97316',
    textColor: '#ffffff',
    timeColor: '#ffedd5',
    incomingBubbleColor: '#ffedd5',
    incomingTextColor: '#9a3412',
    incomingTimeColor: '#c2410c',
    incomingBorderColor: '#fed7aa',
  },
  {
    key: 'indigo',
    label: 'Indigo',
    bubbleColor: '#6366F1',
    textColor: '#ffffff',
    timeColor: '#e0e7ff',
    incomingBubbleColor: '#e0e7ff',
    incomingTextColor: '#3730a3',
    incomingTimeColor: '#4338ca',
    incomingBorderColor: '#c7d2fe',
  },
  {
    key: 'pink',
    label: 'Pink',
    bubbleColor: '#EC4899',
    textColor: '#ffffff',
    timeColor: '#fce7f3',
    incomingBubbleColor: '#fce7f3',
    incomingTextColor: '#9d174d',
    incomingTimeColor: '#be185d',
    incomingBorderColor: '#fbcfe8',
  },
];

const withHexAlpha = (hexColor: string, alpha: number): string => {
  const normalized = hexColor.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return hexColor;
  }

  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  const alphaHex = Math.round(clampedAlpha * 255)
    .toString(16)
    .padStart(2, '0');

  return `#${expanded}${alphaHex}`;
};

type ChatConversationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ChatConversation'>;
type ChatConversationScreenRouteProp = RouteProp<RootStackParamList, 'ChatConversation'>;

type ChatMessage = {
  id: string;
  sender_id: string;
  content?: string;
  created_at: string;
  seen_by_others?: boolean;
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
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);
  const [groupDetails, setGroupDetails] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<GroupParticipant[]>([]);
  const [availableConnections, setAvailableConnections] = useState<ConnectionWithProfile[]>([]);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
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
  const [messageReactions, setMessageReactions] = useState<Map<string, ChatMessageReaction[]>>(new Map());
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
  const [directPartnerStatus, setDirectPartnerStatus] = useState<'online' | 'away' | 'offline' | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const announcementPulse = useSharedValue(1);
  const announcementSlide = useSharedValue(-100);
  const announcementScale = useSharedValue(0.95);
  const announcementIconRotate = useSharedValue(0);
  const listRef = useRef<FlatList>(null);
  const messageInputRef = useRef<TextInput | null>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSignalAtRef = useRef(0);
  const reactionChoices = ['👍', '❤️', '😂', '😮', '😢', '👏'];

  const TYPING_IDLE_MS = 2200;
  const TYPING_HEARTBEAT_MS = 1400;

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => { } });

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
        const preference = await getChatPreference(user.id, conversationId);
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

  const handleEmojiSelected = React.useCallback((selection: EmojiType) => {
    setMessageText((prev) => `${prev}${selection.emoji}`);
    setIsEmojiPickerOpen(false);
    sendTypingSignal();
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, [sendTypingSignal]);

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
    } catch (error) {
      console.error('Failed to load group details:', error);
    }
  };

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
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          console.log("Realtime payload:", payload);

          // Get the sender profile for the new message
          const { data: senderData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', payload.new.sender_id)
            .single();

          const newMessage = {
            ...payload.new,
            content: typeof payload.new.content === 'string' && payload.new.content
              ? decryptMessage(payload.new.content)
              : payload.new.content,
            sender: senderData || undefined,
          } as ChatMessage;

          setMessages((prev) => {
            const exists = prev.find(m => m.id === payload.new.id);
            if (exists) return prev;

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
        (payload) => {
          // When someone else reads a message, update its seen status
          if (payload.new.user_id !== user.id) {
            const readMessageId = payload.new.message_id;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === readMessageId && msg.sender_id === user.id
                  ? { ...msg, seen_by_others: true }
                  : msg
              )
            );
          }
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      console.log("Removing channel:", conversationId);
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, isAIChat, isGroup]);

  useEffect(() => {
    if (!messages.length || showMessageSearch) return;
    const timeout = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timeout);
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
      const data = await getMessages(conversationId, user.id);
      const sorted = [...(data as any[])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
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
    if (!messageText.trim() || isSending) return;

    const content = messageText.trim();
    const originalReply = replyingTo;
    setMessageText('');
    setIsSending(true);
    setReplyingTo(null);
    clearTypingStopTimeout();
    stopTypingSignal().catch(() => {});

    try {
      if (isAIChat) {
        const aiResponse = await chatWithAI(user?.id || '', content);
        const now = new Date().toISOString();
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-self`,
            content,
            sender_id: user?.id || 'self',
            created_at: now,
          },
          {
            id: `${Date.now()}-ai`,
            content: aiResponse,
            sender_id: 'ai',
            created_at: now,
          },
        ]);
      } else if (conversationId && user?.id) {
        await sendMessage(conversationId, user.id, content, 'text');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to send message',
        text2: error instanceof Error ? error.message : 'Unknown error',
      });
      setMessageText(content);
      setReplyingTo(originalReply);
    } finally {
      setIsSending(false);
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
    if (!user?.id) return;
    const isMyMessage = message.sender_id === user.id;

    // For received messages, long-press should open quick reactions.
    if (!isMyMessage && !isAIChat) {
      openReactionPicker(message.id);
      return;
    }

    // Keep existing options for own messages.
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
      });
      await loadGroupDetails();
      setShowGroupEdit(false);
      if (updatedConversation?.__groupBioUnsupported) {
        Toast.show({
          type: 'info',
          text1: 'Group updated (partial)',
          text2: 'Name/image saved. Run DB migration to enable group bio.',
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

  const getInitials = (displayName: string) => {
    const parts = displayName.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase() || 'C';
  };

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

  const currentUserParticipant = useMemo(
    () => groupMembers.find((participant) => participant.user_id === user?.id),
    [groupMembers, user?.id]
  );

  const canManageGroup = useMemo(() => {
    if (!isGroup || !user?.id) return false;
    return groupDetails?.created_by === user.id || !!currentUserParticipant?.is_admin;
  }, [groupDetails?.created_by, currentUserParticipant?.is_admin, isGroup, user?.id]);

  const initials = getInitials(groupDetails?.group_name || name);
  const color = isAIChat ? Colors.primary : getAvatarColor(groupDetails?.group_name || name);

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
            full_name: profile?.full_name,
            avatar_url: profile?.avatar_url,
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
    const groupedReactions = getGroupedReactions(message.id);
    const groupedReactionEntries = Object.entries(groupedReactions);
    const messageLength = (message.content || '').trim().length;
    const bubbleWidthStyle =
      messageLength <= 12
        ? styles.bubbleShort
        : messageLength <= 40
          ? styles.bubbleMedium
          : styles.bubbleLong;

    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparatorContainer}>
            <Text style={styles.dateSeparatorLabel}>{getDateLabel(message.created_at)}</Text>
          </View>
        )}

        <View
          style={[
            styles.messageWrapper,
            isMyMessage ? styles.myMessageWrapper : styles.otherMessageWrapper,
          ]}
        >
          {showGroupIdentity && !isMyMessage && (
            <View style={styles.avatarLaneStart}>
              <UserAvatar
                uri={senderAvatarUri}
                name={senderDisplayName}
                size={30}
                role={senderRole}
                showRing={false}
              />
            </View>
          )}

          <View style={[styles.messageBubbleWrap, bubbleWidthStyle]}>
            <TouchableOpacity
              style={[
                styles.messageBubble,
                isMyMessage
                  ? [styles.myMessage, { backgroundColor: chatTheme.bubbleColor }]
                  : [
                      styles.otherMessage,
                      {
                        backgroundColor: chatTheme.incomingBubbleColor,
                        borderColor: chatTheme.incomingBorderColor,
                      },
                    ],
              ]}
              onLongPress={() => handleMessageLongPress(message)}
              delayLongPress={400}
              activeOpacity={0.8}
            >
              {showGroupIdentity && (
                <Text
                  style={[
                    styles.senderName,
                    isMyMessage && styles.senderNameMine,
                    {
                      color: isMyMessage
                        ? chatTheme.textColor
                        : chatTheme.incomingTextColor,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {senderDisplayName}
                </Text>
              )}
              <View style={styles.messageContentWrap}>
                <Text
                  style={[
                    styles.messageText,
                    isMyMessage
                      ? [styles.myMessageText, { color: chatTheme.textColor }]
                      : [styles.otherMessageText, { color: chatTheme.incomingTextColor }],
                  ]}
                >
                  {message.content}
                </Text>
              </View>
              <View style={[styles.messageFooter, isMyMessage ? styles.myMessageFooter : styles.otherMessageFooter]}>
                <Text
                  style={[
                    styles.messageTime,
                    isMyMessage
                      ? [styles.myMessageTime, { color: chatTheme.timeColor, opacity: 0.85 }]
                      : [styles.otherMessageTime, { color: chatTheme.incomingTimeColor, opacity: 0.9 }],
                  ]}
                >
                  {messageTime}
                </Text>
                {isMyMessage && !isAIChat && (
                  <MaterialIcons
                    name={message.seen_by_others ? 'done-all' : 'done'}
                    size={14}
                    color={message.seen_by_others ? '#4FC3F7' : chatTheme.timeColor}
                    style={styles.seenIndicator}
                  />
                )}
              </View>
            </TouchableOpacity>

            {groupedReactionEntries.length > 0 && (
              <View style={[styles.reactionRow, isMyMessage ? styles.myReactionRow : styles.otherReactionRow]}>
                {groupedReactionEntries.map(([emoji, info]) => (
                  <TouchableOpacity
                    key={`${message.id}-${emoji}`}
                    style={[styles.reactionPill, info.hasCurrentUser && styles.reactionPillActive]}
                    onPress={() => toggleReaction(message.id, emoji)}
                  >
                    <Text style={styles.reactionPillEmoji}>{emoji}</Text>
                    <Text style={[styles.reactionPillCount, info.hasCurrentUser && styles.reactionPillCountActive]}>{info.count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {showGroupIdentity && isMyMessage && (
            <View style={styles.avatarLaneEnd}>
              <UserAvatar
                uri={senderAvatarUri}
                name={senderDisplayName}
                size={30}
                role={senderRole}
                showRing={false}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
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
            <Image source={{ uri: groupDetails.group_avatar }} style={styles.headerAvatarImage} />
          ) : !isGroup && directPartnerProfile ? (
            <UserAvatar
              uri={directPartnerProfile.avatar_url}
              name={directPartnerProfile.full_name || name}
              size={40}
              role={directPartnerProfile.role}
              showRing={false}
            />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: color }]}>
              <Text style={styles.headerAvatarText}>{initials}</Text>
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>
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
                onPress={(e) => {
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
              onPress={(e) => {
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
                onPress={(e) => {
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
              onPress={(e) => {
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
          <FlatList
            ref={listRef}
            data={filteredMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.messagesListContainer}
            contentContainerStyle={styles.messagesContentContainer}
            onContentSizeChange={() => {
              if (!showMessageSearch) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
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

          <KeyboardAvoidingView
            style={styles.composerOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
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

            <View style={styles.inputContainer}>
              <View
                style={[
                  styles.inputMain,
                  { backgroundColor: Colors.surface, borderColor: composerBorderColor },
                ]}
              >
                <TouchableOpacity
                  style={styles.emojiButton}
                  onPress={() => setIsEmojiPickerOpen(true)}
                >
                  <MaterialIcons name="emoji-emotions" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>

                <TextInput
                  ref={messageInputRef}
                  style={styles.input}
                  value={messageText}
                  onChangeText={(text) => {
                    setMessageText(text);
                    if (!text.trim()) {
                      stopTypingSignal().catch(() => {});
                      return;
                    }
                    sendTypingSignal();
                  }}
                  placeholder="Type a message"
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  maxLength={500}
                  editable={!isSending}
                />

                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={() =>
                    Toast.show({
                      type: 'info',
                      text1: 'Attachments',
                      text2: 'Attachment picker will be added next.',
                    })
                  }
                >
                  <MaterialIcons name="attach-file" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: chatTheme.bubbleColor },
                  (isSending || !messageText.trim()) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={isSending || !messageText.trim()}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={chatTheme.textColor} />
                ) : (
                  <MaterialIcons name="send" size={22} color={chatTheme.textColor} />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </ImageBackground>
      )}

      <EmojiPicker
        open={isEmojiPickerOpen}
        onClose={() => setIsEmojiPickerOpen(false)}
        onEmojiSelected={handleEmojiSelected}
      />

      <Modal
        visible={showChatOptions}
        animationType="slide"
        transparent
        onRequestClose={() => setShowChatOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Chat options</Text>

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                setShowChatOptions(false);
                setShowMessageSearch((prev) => !prev);
                if (showMessageSearch) {
                  setMessageSearchQuery('');
                }
              }}
            >
              <MaterialIcons name="search" size={20} color={Colors.text} />
              <Text style={styles.optionText}>{showMessageSearch ? 'Hide Search' : 'Search Messages'}</Text>
            </TouchableOpacity>

            {isGroup && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowChatOptions(false);
                  setShowGroupMembers(true);
                }}
              >
                <MaterialIcons name="groups" size={20} color={Colors.text} />
                <Text style={styles.optionText}>View Group Members</Text>
              </TouchableOpacity>
            )}

            {isGroup && canManageGroup && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={openAddMembersModal}
              >
                <MaterialIcons name="person-add" size={20} color={Colors.text} />
                <Text style={styles.optionText}>Add Users to Group</Text>
              </TouchableOpacity>
            )}

            {isGroup && canManageGroup && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowChatOptions(false);
                  setShowGroupEdit(true);
                }}
              >
                <MaterialIcons name="edit" size={20} color={Colors.text} />
                <Text style={styles.optionText}>Edit Group Profile</Text>
              </TouchableOpacity>
            )}

            {!isGroup && !isAIChat && (
              <TouchableOpacity
                style={styles.optionRow}
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
                <MaterialIcons name="person-outline" size={20} color={Colors.text} />
                <Text style={styles.optionText}>View User Profile</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.optionRow}
              onPress={async () => {
                setShowChatOptions(false);
                await loadMessages();
              }}
            >
              <MaterialIcons name="refresh" size={20} color={Colors.text} />
              <Text style={styles.optionText}>Refresh Conversation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                setShowChatOptions(false);
                setShowThemePicker(true);
              }}
            >
              <MaterialIcons name="palette" size={20} color={Colors.text} />
              <Text style={styles.optionText}>Change Chat Theme</Text>
            </TouchableOpacity>

            {!isAIChat && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowChatOptions(false);
                  setShowBackgroundPicker(true);
                }}
              >
                <MaterialIcons name="wallpaper" size={20} color={Colors.text} />
                <Text style={styles.optionText}>Chat Background</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.optionRow}
              onPress={async () => {
                setShowChatOptions(false);
                if (conversationId && user?.id && !isAIChat) {
                  await markConversationAsRead(conversationId, user.id);
                }
                Toast.show({ type: 'success', text1: 'Marked as read' });
              }}
            >
              <MaterialIcons name="done-all" size={20} color={Colors.text} />
              <Text style={styles.optionText}>Mark as Read</Text>
            </TouchableOpacity>

            {isGroup && canManageGroup && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowChatOptions(false);
                  setShowCreateAnnouncement(true);
                }}
              >
                <MaterialIcons name="campaign" size={20} color={Colors.warning} />
                <Text style={styles.optionText}>Create Announcement</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              onPress={() => setShowChatOptions(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionText, { color: Colors.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
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

            {selectedMessage?.sender_id === user?.id && !isAIChat && (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setShowMessageOptions(false);
                  if (selectedMessage?.id) {
                    handleDeleteMessage(selectedMessage.id);
                  }
                }}
              >
                <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
                <Text style={[styles.optionText, { color: Colors.error }]}>Delete for Everyone</Text>
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
          <View style={styles.membersSheet}>
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
                  <Image source={{ uri: groupDetails.group_avatar }} style={styles.groupProfileAvatar} />
                ) : (
                  <View style={styles.groupProfileAvatarFallback}>
                    <Text style={styles.groupProfileAvatarText}>{initials}</Text>
                  </View>
                )}
                <View style={styles.groupProfileInfo}>
                  <Text style={styles.groupProfileName} numberOfLines={1}>
                    {groupDetails?.group_name || name}
                  </Text>
                  <Text style={styles.groupProfileMeta}>{groupMembers.length} members</Text>
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
                        <Text style={styles.memberName}>{member.user?.full_name || 'Member'}</Text>
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
                            <Text style={styles.memberName}>{profileItem.full_name || 'User'}</Text>
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
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      gap: 12,
    },
    backButton: {
      padding: 4,
    },
    headerMainInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
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
    headerAvatarText: {
      fontSize: 16,
      fontWeight: FontWeights.bold,
      color: Colors.surface,
    },
    headerInfo: {
      flex: 1,
    },
    headerName: {
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
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: 120,
    },
    composerOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    messageWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 12,
      width: '100%',
    },
    dateSeparatorContainer: {
      alignItems: 'center',
      marginBottom: Spacing.sm,
      marginTop: Spacing.sm,
    },
    dateSeparatorLabel: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      overflow: 'hidden',
      fontWeight: FontWeights.medium,
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
    messageFooter: {
      flexDirection: 'row',
      marginTop: 6,
      alignItems: 'center',
      gap: 6,
      minHeight: 20,
      width: '100%',
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
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.md,
      paddingTop: 6,
      paddingBottom: Platform.OS === 'ios' ? 10 : 8,
      gap: 8,
    },
    inputMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 24,
      paddingLeft: 4,
      paddingRight: 4,
      paddingVertical: 3,
      ...Shadows.sm,
    },
    emojiButton: {
      padding: 8,
      marginBottom: 1,
    },
    attachButton: {
      padding: 8,
      marginBottom: 1,
    },
    input: {
      flex: 1,
      backgroundColor: 'transparent',
      borderWidth: 0,
      paddingHorizontal: 6,
      paddingVertical: 10,
      fontSize: FontSizes.md,
      color: Colors.text,
      maxHeight: 110,
    },
    sendButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
    sendButtonDisabled: {
      opacity: 0.5,
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
    groupProfileBio: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 3,
    },
    groupProfileBioEmpty: {
      fontStyle: 'italic',
      opacity: 0.85,
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
    },
    memberName: {
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
