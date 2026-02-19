import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getMessages, sendMessage, subscribeToMessages, chatWithAI, deleteMessage, canFacultySupervise, getConversationSupervisor, addConversationSupervisor, removeConversationSupervisor, getConversationSupervisionStats } from '../../api/chat';
import Toast from 'react-native-toast-message';
import ConfirmDialog from '../../components/ConfirmDialog';

type ChatConversationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ChatConversation'>;
type ChatConversationScreenRouteProp = RouteProp<RootStackParamList, 'ChatConversation'>;

export default function ChatConversationScreen() {
  const navigation = useNavigation<ChatConversationScreenNavigationProp>();
  const route = useRoute<ChatConversationScreenRouteProp>();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [canSupervise, setCanSupervise] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [supervisionStats, setSupervisionStats] = useState<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const { conversationId = '', name = 'Chat', isGroup = false } = route.params || {};
  const isAIChat = conversationId === 'ai-assistant';

  useEffect(() => {
    if (!conversationId || isAIChat) {
      setIsLoading(false);
      return;
    }

    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    loadMessages();
    checkSupervisionCapability();

    const channel = subscribeToMessages(conversationId, (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });

    return () => channel?.unsubscribe?.();
  }, [conversationId, user?.id, isAIChat]);

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
        const supervisor = await getConversationSupervisor(conversationId);
        setIsSupervisor(supervisor?.supervisor?.id === user.id);

        if (supervisor?.supervisor?.id === user.id) {
          const stats = await getConversationSupervisionStats(conversationId);
          setSupervisionStats(stats);
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
      setMessages(data);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (error) {
      console.error('Failed to load messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load messages',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!messageText.trim() || isSending) return;

    const content = messageText.trim();
    setMessageText('');
    setIsSending(true);

    try {
      if (isAIChat) {
        const aiResponse = await chatWithAI(user?.id || '', content);
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), content, sender_id: user?.id, created_at: new Date().toISOString() },
          { id: (Date.now() + 1).toString(), content: aiResponse, sender_id: 'ai', created_at: new Date().toISOString() }
        ]);
      } else {
        if (conversationId && user?.id) {
          await sendMessage(conversationId, user.id, content, 'text');
        }
      }
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to send message',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
      setMessageText(content);
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (isAIChat) return; // Can't delete AI chat messages

    console.log('Delete message clicked:', messageId);
    setConfirmDialog({
      visible: true,
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message? This action cannot be undone.',
      onConfirm: () => deleteMessageConfirmed(messageId),
    });
  };

  const deleteMessageConfirmed = async (messageId: string) => {
    try {
      console.log('Deleting message:', messageId);
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      Toast.show({ type: 'success', text1: 'Message deleted' });
    } catch (error) {
      console.error('Delete message error:', error);
      Toast.show({ type: 'error', text1: 'Failed to delete message' });
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
    const colors = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#dc2626'];
    return colors[Math.abs(hash) % colors.length];
  };

  const initials = getInitials(name);
  const color = isAIChat ? '#7c3aed' : getAvatarColor(name);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: color }]}>
          <Text style={styles.headerAvatarText}>{initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerStatus}>{isAIChat ? 'AI Assistant' : 'Online'}</Text>
        </View>
        <TouchableOpacity style={styles.moreButton} onPress={() => {}}>
          <MaterialIcons name="more-vert" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Faculty Supervision Controls */}
      {canSupervise && !isAIChat && (
        <View style={[styles.supervisionBanner, !isSupervisor && { backgroundColor: Colors.primary + '20' }]}>
          {isSupervisor ? (
            <>
              <View style={styles.supervisionContent}>
                <MaterialIcons name="supervised-user-circle" size={20} color={Colors.primary} />
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
                style={[styles.supervisionButton, { backgroundColor: '#ef4444' }]}
                onPress={handleRemoveSupervision}
              >
                <MaterialIcons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.supervisionContent}>
                <MaterialIcons name="verified" size={20} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supervisionTitle}>Available to supervise</Text>
                  <Text style={styles.supervisionSubtitle}>You can monitor and manage this group</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.supervisionButton, { backgroundColor: Colors.primary }]}
                onPress={handleAddSupervision}
              >
                <MaterialIcons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Messages */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer} 
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="chat-bubble-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start the conversation!</Text>
            </View>
          ) : (
            messages.map((message) => {
              const isMyMessage = message.sender_id === user?.id;
              const messageTime = new Date(message.created_at).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit' 
              });

              return (
                <View
                  key={message.id}
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
                    onLongPress={() => isMyMessage && handleDeleteMessage(message.id)}
                    delayLongPress={500}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.messageText,
                      isMyMessage ? styles.myMessageText : styles.otherMessageText
                    ]}>
                      {message.content}
                    </Text>
                    <View style={styles.messageFooter}>
                      <Text style={[
                        styles.messageTime,
                        isMyMessage ? styles.myMessageTime : styles.otherMessageTime
                      ]}>
                        {messageTime}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {isMyMessage && !isAIChat && (
                    <TouchableOpacity
                      onPress={() => handleDeleteMessage(message.id)}
                      style={styles.deleteButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialIcons name="delete-outline" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton} onPress={() => {}}>
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
              (isSending || !messageText.trim()) && styles.sendButtonDisabled
            ]} 
            onPress={handleSend}
            disabled={isSending || !messageText.trim()}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <MaterialIcons name="send" size={24} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, visible: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, visible: false })}
        type="danger"
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
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
    color: '#ffffff',
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
    color: '#10b981',
  },
  moreButton: {
    padding: 4,
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  myMessageWrapper: {
    justifyContent: 'flex-end',
  },
  otherMessageWrapper: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: BorderRadius.md,
    padding: 12,
  },
  myMessage: {
    backgroundColor: Colors.primary,
  },
  otherMessage: {
    backgroundColor: Colors.card,
  },
  messageText: {
    fontSize: FontSizes.md,
    lineHeight: 20,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  myMessageText: {
    color: '#ffffff',
  },
  otherMessageText: {
    color: Colors.text,
  },
  deleteButton: {
    padding: 4,
    opacity: 0.6,
  },
  messageTime: {
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    color: Colors.textSecondary,
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
    backgroundColor: Colors.textSecondary,
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
    backgroundColor: Colors.primary + '15',
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
});
