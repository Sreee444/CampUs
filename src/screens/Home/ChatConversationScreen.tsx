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
  addGroupParticipants,
  canFacultySupervise,
  chatWithAI,
  deleteMessage,
  getConversationParticipants,
  getConversationSupervisionStats,
  getConversationSupervisor,
  getMessages,
  leaveGroupConversation,
  markConversationAsRead,
  renameGroupConversation,
  removeConversationSupervisor,
  sendMessage,
  subscribeToMessages,
} from '../../api/chat';
import { getMyConnections } from '../../api/connections';
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
    full_name?: string;
  };
};

type GroupMember = {
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
  const { conversationId = '', name = 'Chat', isGroup = false } = route.params || {};
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
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [conversationName, setConversationName] = useState('Chat');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [availableConnections, setAvailableConnections] = useState<any[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const isAIChat = conversationId === 'ai-assistant';

  useEffect(() => {
    setConversationName(name);
    setGroupNameInput(name);
  }, [name]);

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

  useEffect(() => {
    if (!conversationId || isAIChat || !user?.id) {
      setIsLoading(false);
      return;
    }

    loadMessages();
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
  }, [conversationId, user?.id, isAIChat]);

  useEffect(() => {
    if (!messages.length || showMessageSearch) return;
    const timeout = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timeout);
  }, [messages.length, showMessageSearch]);

  useEffect(() => {
    if (!isGroup || isAIChat || !conversationId) return;
    loadGroupMembers();
  }, [isGroup, isAIChat, conversationId]);

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

  const loadGroupMembers = async () => {
    if (!isGroup || !conversationId || isAIChat) return;

    try {
      setMembersLoading(true);
      const members = await getConversationParticipants(conversationId);
      setGroupMembers(members as GroupMember[]);
    } catch (error) {
      console.error('Failed to load members:', error);
      Toast.show({ type: 'error', text1: 'Failed to load group members' });
    } finally {
      setMembersLoading(false);
    }
  };

  const loadAvailableConnections = async () => {
    try {
      const connections = await getMyConnections('accepted');
      const existingIds = new Set(groupMembers.map((member) => member.user_id));
      const filtered = connections.filter((connection) => {
        const id = connection.profile?.id;
        return id && !existingIds.has(id);
      });
      setAvailableConnections(filtered);
    } catch (error) {
      console.error('Failed to load connections:', error);
      Toast.show({ type: 'error', text1: 'Failed to load connections' });
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedNewMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleAddMembers = async () => {
    if (!selectedNewMemberIds.length || !conversationId) return;

    try {
      setAddingMembers(true);
      await addGroupParticipants(conversationId, selectedNewMemberIds);
      Toast.show({ type: 'success', text1: 'Members added' });
      setSelectedNewMemberIds([]);
      setShowAddMembersModal(false);
      await loadGroupMembers();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not add members',
        text2: error?.message || 'You may need creator permissions for this group',
      });
    } finally {
      setAddingMembers(false);
    }
  };

  const handleRenameGroup = async () => {
    if (!conversationId || !groupNameInput.trim()) return;

    try {
      const result: any = await renameGroupConversation(conversationId, groupNameInput.trim());
      const nextName = result?.group_name ? result.group_name : groupNameInput.trim();
      setConversationName(nextName);
      setShowRenameGroupModal(false);
      Toast.show({ type: 'success', text1: 'Group renamed' });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Rename failed',
        text2: error?.message || 'You may not have permission to rename this group',
      });
    }
  };

  const handleLeaveGroup = async () => {
    if (!conversationId) return;

    try {
      await leaveGroupConversation(conversationId);
      Toast.show({ type: 'success', text1: 'You left the group' });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Leave group failed',
        text2: error?.message || 'Unable to leave group',
      });
    }
  };

  const initials = getInitials(conversationName);
  const color = isAIChat ? Colors.primary : getAvatarColor(conversationName);

  const renderMessage = ({ item: message }: { item: ChatMessage }) => {
    const isMyMessage = message.sender_id === user?.id;
    const messageTime = new Date(message.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <View
        style={[
          styles.messageWrapper,
          isMyMessage ? styles.myMessageWrapper : styles.otherMessageWrapper,
        ]}
      >
        <TouchableOpacity
          style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessage : styles.otherMessage,
          ]}
          onLongPress={() => handleMessageLongPress(message)}
          delayLongPress={400}
          activeOpacity={0.8}
        >
          {!isMyMessage && isGroup && (
            <Text style={styles.senderName} numberOfLines={1}>
              {message.sender?.full_name || 'Member'}
            </Text>
          )}
          <Text
            style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.otherMessageText,
            ]}
          >
            {message.content}
          </Text>
          <View style={styles.messageFooter}>
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
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        <View style={[styles.headerAvatar, { backgroundColor: color }]}>
          <Text style={styles.headerAvatarText}>{initials}</Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{conversationName}</Text>
          <Text style={styles.headerStatus}>
            {isAIChat ? 'AI Assistant' : isGroup ? `${messages.length} messages` : 'Active chat'}
          </Text>
        </View>

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

            {isGroup && (
              <>
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={async () => {
                    setShowChatOptions(false);
                    await loadGroupMembers();
                    setShowMembersModal(true);
                  }}
                >
                  <MaterialIcons name="groups" size={20} color={Colors.text} />
                  <Text style={styles.optionText}>View Members</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={async () => {
                    setShowChatOptions(false);
                    await loadGroupMembers();
                    await loadAvailableConnections();
                    setShowAddMembersModal(true);
                  }}
                >
                  <MaterialIcons name="group-add" size={20} color={Colors.text} />
                  <Text style={styles.optionText}>Add Members</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    setShowChatOptions(false);
                    setGroupNameInput(conversationName);
                    setShowRenameGroupModal(true);
                  }}
                >
                  <MaterialIcons name="edit" size={20} color={Colors.text} />
                  <Text style={styles.optionText}>Rename Group</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    setShowChatOptions(false);
                    setConfirmDialog({
                      visible: true,
                      title: 'Leave Group',
                      message: 'Are you sure you want to leave this group?',
                      onConfirm: handleLeaveGroup,
                    });
                  }}
                >
                  <MaterialIcons name="logout" size={20} color={Colors.error} />
                  <Text style={[styles.optionText, { color: Colors.error }]}>Leave Group</Text>
                </TouchableOpacity>
              </>
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
        visible={showMembersModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMembersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.optionsTitle}>Group Members</Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {membersLoading ? (
              <View style={styles.modalLoaderWrap}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.membersList}>
                {groupMembers.map((member) => (
                  <TouchableOpacity
                    key={member.user_id}
                    style={styles.memberRow}
                    onPress={() => {
                      if (!member.user?.id || member.user.id === user?.id) return;
                      setShowMembersModal(false);
                      navigation.navigate('PublicProfile', { userId: member.user.id });
                    }}
                  >
                    <UserAvatar
                      uri={member.user?.avatar_url}
                      name={member.user?.full_name || 'User'}
                      size={38}
                      showRing={false}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{member.user?.full_name || 'User'}</Text>
                      <Text style={styles.memberMeta}>
                        {member.user?.role || 'member'}
                        {member.user?.department ? ` • ${member.user.department}` : ''}
                      </Text>
                    </View>
                    {member.is_admin && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>Admin</Text>
                      </View>
                    )}
                    {member.user?.id !== user?.id && (
                      <MaterialIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddMembersModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddMembersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.optionsTitle}>Add Members</Text>
              <TouchableOpacity onPress={() => setShowAddMembersModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.membersList}>
              {availableConnections.length === 0 ? (
                <View style={styles.modalLoaderWrap}>
                  <Text style={styles.memberMeta}>No eligible connections to add</Text>
                </View>
              ) : (
                availableConnections.map((connection) => {
                  const profileData = connection.profile;
                  if (!profileData?.id) return null;
                  const selected = selectedNewMemberIds.includes(profileData.id);

                  return (
                    <TouchableOpacity
                      key={connection.id}
                      style={styles.memberRow}
                      onPress={() => toggleMemberSelection(profileData.id)}
                    >
                      <UserAvatar
                        uri={profileData.avatar_url}
                        name={profileData.full_name || 'User'}
                        size={38}
                        showRing={false}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{profileData.full_name || 'User'}</Text>
                        <Text style={styles.memberMeta}>
                          {profileData.role || 'member'}
                          {profileData.department ? ` • ${profileData.department}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.selectDot, selected && styles.selectDotActive]}>
                        {selected && <MaterialIcons name="check" size={14} color={Colors.surface} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.primaryActionBtn,
                (!selectedNewMemberIds.length || addingMembers) && styles.primaryActionBtnDisabled,
              ]}
              disabled={!selectedNewMemberIds.length || addingMembers}
              onPress={handleAddMembers}
            >
              {addingMembers ? (
                <ActivityIndicator size="small" color={Colors.primaryContent} />
              ) : (
                <Text style={styles.primaryActionBtnText}>
                  Add Selected ({selectedNewMemberIds.length})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRenameGroupModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRenameGroupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.optionsTitle}>Rename Group</Text>
            <TextInput
              value={groupNameInput}
              onChangeText={setGroupNameInput}
              placeholder="Enter group name"
              placeholderTextColor={Colors.textSecondary}
              style={styles.renameInput}
            />
            <View style={styles.renameActionRow}>
              <TouchableOpacity
                style={[styles.secondaryActionBtn]}
                onPress={() => setShowRenameGroupModal(false)}
              >
                <Text style={styles.secondaryActionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryActionBtn, !groupNameInput.trim() && styles.primaryActionBtnDisabled]}
                disabled={!groupNameInput.trim()}
                onPress={handleRenameGroup}
              >
                <Text style={styles.primaryActionBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
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
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
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
      marginBottom: 12,
    },
    myMessageWrapper: {
      justifyContent: 'flex-end',
    },
    otherMessageWrapper: {
      justifyContent: 'flex-start',
    },
    messageBubble: {
      maxWidth: '78%',
      borderRadius: BorderRadius.md,
      padding: 12,
    },
    myMessage: {
      backgroundColor: Colors.primary,
    },
    otherMessage: {
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    senderName: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginBottom: 4,
      fontWeight: FontWeights.semibold,
    },
    messageText: {
      fontSize: FontSizes.md,
      lineHeight: 20,
    },
    myMessageText: {
      color: Colors.primaryContent,
    },
    otherMessageText: {
      color: Colors.text,
    },
    messageFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 4,
    },
    messageTime: {
      fontSize: 11,
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
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.xs,
    },
    modalLoaderWrap: {
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    membersList: {
      maxHeight: 320,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.xs,
      backgroundColor: Colors.card,
    },
    memberName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    memberMeta: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    adminBadge: {
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primarySoft,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
    },
    adminBadgeText: {
      fontSize: FontSizes.xs,
      color: Colors.primaryContent,
      fontWeight: FontWeights.semibold,
    },
    selectDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
    },
    selectDotActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    primaryActionBtn: {
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.md,
      marginTop: Spacing.xs,
    },
    primaryActionBtnDisabled: {
      opacity: 0.45,
    },
    primaryActionBtnText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.primaryContent,
    },
    renameInput: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      color: Colors.text,
      fontSize: FontSizes.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    renameActionRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    secondaryActionBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.md,
      backgroundColor: Colors.card,
    },
    secondaryActionBtnText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    optionCancel: {
      marginTop: Spacing.xs,
    },
  });
