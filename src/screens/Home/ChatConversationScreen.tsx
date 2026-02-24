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
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { BorderRadius, FontSizes, FontWeights, getColors, Shadows, Spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  addConversationSupervisor,
  canFacultySupervise,
  chatWithAI,
  deleteMessage,
  getConversationDetails,
  getConversationSupervisionStats,
  getConversationSupervisor,
  getMessages,
  markConversationAsRead,
  removeConversationSupervisor,
  removeParticipantFromGroup,
  sendMessage,
  setGroupParticipantAdmin,
  subscribeToMessages,
  updateGroupConversation,
} from '../../api/chat';
import Toast from 'react-native-toast-message';
import ConfirmDialog from '../../components/ConfirmDialog';
import { UserAvatar } from '../../components/UserAvatar';

type ChatConversationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ChatConversation'>;
type ChatConversationScreenRouteProp = RouteProp<RootStackParamList, 'ChatConversation'>;

type ChatMessage = {
  id: string;
  sender_id: string;
  content?: string;
  created_at: string;
  sender?: {
    id?: string;
    full_name?: string;
    avatar_url?: string;
    role?: string;
  };
};

type GroupParticipant = {
  id: string;
  user_id: string;
  is_admin: boolean;
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
    role?: string;
    department?: string;
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
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [selectedMember, setSelectedMember] = useState<GroupParticipant | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupAvatarDraft, setGroupAvatarDraft] = useState('');
  const [groupDetails, setGroupDetails] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<GroupParticipant[]>([]);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const listRef = useRef<FlatList>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const { conversationId = '', name = 'Chat', isGroup = false } = route.params || {};
  const isAIChat = conversationId === 'ai-assistant';

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

  const loadGroupDetails = async () => {
    if (!conversationId || !isGroup || !user?.id) return;

    try {
      const details = await getConversationDetails(conversationId);
      setGroupDetails(details);
      const participants = (details?.participants || []) as GroupParticipant[];
      setGroupMembers(participants);
      setGroupNameDraft(details?.group_name || '');
      setGroupAvatarDraft(details?.group_avatar || '');
    } catch (error) {
      console.error('Failed to load group details:', error);
    }
  };

  useEffect(() => {
    if (!conversationId || isAIChat || !user?.id) {
      setIsLoading(false);
      return;
    }

    loadMessages();
    if (isGroup) {
      loadGroupDetails();
    }
    checkSupervisionCapability().catch((err) => console.error('Error in supervision check:', err));

    const channel = subscribeToMessages(conversationId, (event) => {
      if (event.type === 'delete' && event.messageId) {
        setMessages((prev) => prev.filter((message) => message.id !== event.messageId));
        return;
      }

      if (!event.message) return;

      upsertMessage(event.message as ChatMessage);

      if (event.type === 'insert' && event.message.sender_id !== user.id) {
        markConversationAsRead(conversationId, user.id).catch((error) => {
          console.error('Failed to mark conversation as read:', error);
        });
      }
    });

    return () => {
      channel?.unsubscribe?.();
    };
  }, [conversationId, user?.id, isAIChat, isGroup]);

  useEffect(() => {
    if (!messages.length || showMessageSearch) return;
    const timeout = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timeout);
  }, [messages.length, showMessageSearch]);

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
    setSelectedMessage(message);
    setShowMessageOptions(true);
  };

  const handleSaveGroupProfile = async () => {
    if (!conversationId || !user?.id) return;

    try {
      setIsSavingGroup(true);
      await updateGroupConversation(conversationId, user.id, {
        group_name: groupNameDraft,
        group_avatar: groupAvatarDraft || null,
      });
      await loadGroupDetails();
      setShowGroupEdit(false);
      Toast.show({ type: 'success', text1: 'Group updated' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: error?.message || 'Try again' });
    } finally {
      setIsSavingGroup(false);
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
    const otherMessage = messages.find(
      (message) => message.sender_id !== user.id && message.sender_id !== 'ai'
    );
    return otherMessage?.sender_id || null;
  }, [isGroup, isAIChat, messages, user?.id]);

  const directPartnerProfile = useMemo(() => {
    if (isGroup || isAIChat || !user?.id) return null;
    const otherMessage = messages.find(
      (message) => message.sender_id !== user.id && message.sender_id !== 'ai'
    );
    return otherMessage?.sender || null;
  }, [isGroup, isAIChat, messages, user?.id]);

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

  const renderMessage = ({ item: message, index }: { item: ChatMessage; index: number }) => {
    const isMyMessage = message.sender_id === user?.id;
    const previousMessage = index > 0 ? filteredMessages[index - 1] : null;
    const showDateSeparator =
      index === 0 ||
      new Date(previousMessage?.created_at || '').toDateString() !==
        new Date(message.created_at).toDateString();
    const showAvatar = !isMyMessage && (!previousMessage || previousMessage.sender_id !== message.sender_id);
    const showSenderLabel = !isMyMessage && isGroup && showAvatar;
    const messageTime = new Date(message.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

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
          {!isMyMessage && (
            <View style={styles.incomingAvatarWrap}>
              {showAvatar ? (
                <UserAvatar
                  uri={message.sender?.avatar_url}
                  name={message.sender?.full_name || 'User'}
                  size={30}
                  role={message.sender?.role}
                  showRing={false}
                />
              ) : (
                <View style={styles.avatarSpacer} />
              )}
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.messageBubble,
              isMyMessage ? styles.myMessage : styles.otherMessage,
            ]}
            onLongPress={() => handleMessageLongPress(message)}
            delayLongPress={400}
            activeOpacity={0.8}
          >
            {showSenderLabel && (
              <Text style={styles.senderName} numberOfLines={1}>
                {message.sender?.full_name || 'Member'}
              </Text>
            )}
            <View style={styles.messageContentWrap}>
              <Text
                style={[
                  styles.messageText,
                  isMyMessage ? styles.myMessageText : styles.otherMessageText,
                ]}
              >
                {message.content}
              </Text>
            </View>
            <View style={[styles.messageFooter, isMyMessage ? styles.myMessageFooter : styles.otherMessageFooter]}>
              <Text
                style={[
                  styles.messageTime,
                  isMyMessage ? styles.myMessageTime : styles.otherMessageTime,
                ]}
              >
                {messageTime}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerMainInfo}
          onPress={() => {
            if (isGroup && groupMembers.length > 0) {
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
                <Text style={styles.headerStatus}>{groupMembers.length} members</Text>
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
              <Text style={styles.headerStatus}>
                {isAIChat ? 'AI Assistant' : directPartnerProfile?.role || 'Direct chat'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.moreButton} onPress={() => setShowChatOptions(true)}>
          <MaterialIcons name="more-vert" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {showMessageSearch && (
        <View style={styles.messageSearchBar}>
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

      {canSupervise && !isAIChat && (
        <View style={[styles.supervisionBanner, !isSupervisor && { backgroundColor: Colors.primarySoft }]}>
          {isSupervisor ? (
            <>
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
            </>
          ) : (
            <>
              <View style={styles.supervisionContent}>
                <MaterialIcons name="verified" size={20} color={Colors.primaryContent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supervisionTitle}>Available to supervise</Text>
                  <Text style={styles.supervisionSubtitle}>You can monitor and manage this group</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.supervisionButton, { backgroundColor: Colors.primary }]}
                onPress={handleAddSupervision}
              >
                <MaterialIcons name="add" size={16} color={Colors.primaryContent} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={styles.messagesContainer}
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
      )}

      <KeyboardAvoidingView
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

          <TextInput
            style={styles.input}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textSecondary}
            multiline
            maxLength={500}
            editable={!isSending}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (isSending || !messageText.trim()) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={isSending || !messageText.trim()}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={Colors.primaryContent} />
            ) : (
              <MaterialIcons name="send" size={22} color={Colors.primaryContent} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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

            <ScrollView showsVerticalScrollIndicator={false}>
              {groupMembers.map((member) => {
                const isMainAdmin = member.user_id === groupDetails?.created_by;
                const canManageThisMember =
                  canManageGroup &&
                  member.user_id !== user?.id &&
                  member.user_id !== groupDetails?.created_by;

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
                        <Text style={styles.memberMeta}>
                          {isMainAdmin
                            ? 'Main admin'
                            : member.is_admin
                            ? 'Group admin'
                            : member.user?.role || 'Member'}
                        </Text>
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

            <Text style={styles.inputLabel}>Group avatar URL</Text>
            <TextInput
              value={groupAvatarDraft}
              onChangeText={setGroupAvatarDraft}
              placeholder="https://..."
              placeholderTextColor={Colors.textSecondary}
              style={styles.groupInput}
              autoCapitalize="none"
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
    groupHeaderMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: 2,
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
    messagesContainer: {
      flex: 1,
    },
    messagesContentContainer: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.md,
    },
    messageWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 12,
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
      maxWidth: '82%',
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
      color: Colors.info,
      marginBottom: 3,
      fontWeight: FontWeights.semibold,
    },
    incomingAvatarWrap: {
      width: 34,
      marginRight: 8,
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    avatarSpacer: {
      width: 30,
      height: 30,
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
    },
    otherMessageText: {
      color: Colors.text,
    },
    messageFooter: {
      flexDirection: 'row',
      marginTop: 6,
    },
    myMessageFooter: {
      justifyContent: 'flex-end',
    },
    otherMessageFooter: {
      justifyContent: 'flex-start',
    },
    messageTime: {
      fontSize: 10,
      fontWeight: FontWeights.medium,
    },
    myMessageTime: {
      color: Colors.primaryContent,
      opacity: 0.8,
    },
    otherMessageTime: {
      color: Colors.textSecondary,
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
      paddingVertical: 12,
      backgroundColor: Colors.surface,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      gap: 8,
    },
    attachButton: {
      padding: 8,
    },
    input: {
      flex: 1,
      backgroundColor: Colors.background,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: FontSizes.md,
      color: Colors.text,
      maxHeight: 100,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
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
    primaryOption: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
      justifyContent: 'center',
    },
  });
