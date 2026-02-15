import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getConversations, createDirectConversation } from '../../api/chat';
import { getMyConnections, ConnectionWithProfile } from '../../api/connections';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';

type ChatScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Chat'>,
  StackNavigationProp<RootStackParamList>
>;

export default function ChatScreen() {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [conversations, setConversations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [connections, setConnections] = useState<ConnectionWithProfile[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const loadConversations = async () => {
      try {
        const data = await getConversations(user.id);
        setConversations(data);
      } catch (error) {
        console.error('Chat list error:', error);
      }
    };

    loadConversations();
  }, [user?.id]);

  // Load connections when modal opens
  useEffect(() => {
    if (showNewChatModal) {
      loadConnections();
    }
  }, [showNewChatModal]);

  const loadConnections = async () => {
    try {
      setLoadingConnections(true);
      const data = await getMyConnections('accepted');
      setConnections(data);
    } catch (error) {
      console.error('Error loading connections:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load connections',
      });
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleStartChat = async (connection: ConnectionWithProfile) => {
    try {
      setCreatingChat(true);
      
      // Get the other user's ID
      const otherUserId = connection.profile?.id;
      if (!otherUserId || !user?.id) return;

      // Create or find existing conversation
      const conversation = await createDirectConversation(user.id, otherUserId);

      // Close modal
      setShowNewChatModal(false);

      // Navigate to conversation
      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        name: connection.profile?.full_name || 'User',
        isGroup: false,
      });
    } catch (error) {
      console.error('Error creating chat:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to start chat',
      });
    } finally {
      setCreatingChat(false);
    }
  };

  const getConversationName = (conversation: any, currentUserId: string) => {
    if (conversation.is_group) {
      return conversation.group_name || 'Group chat';
    }

    const other = conversation.participants?.find((p: any) => p.id !== currentUserId);
    return other?.full_name || other?.email || 'Unknown';
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase() || 'C';
  };

  const getColorFromString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#dc2626'];
    return colors[Math.abs(hash) % colors.length];
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const name = getConversationName(conversation, user?.id || '');
      return name.toLowerCase().includes(query);
    });
  }, [conversations, searchQuery, user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity 
          style={styles.composeButton} 
          onPress={() => setShowNewChatModal(true)}
        >
          <MaterialIcons name="edit" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Conversations List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {filteredConversations.map((conversation) => {
          const name = getConversationName(conversation, user.id);
          const initials = getInitials(name);
          const color = getColorFromString(name);
          const lastMessageTime = conversation.last_message 
            ? new Date(conversation.last_message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '';

          return (
            <TouchableOpacity 
              key={conversation.id} 
              style={styles.conversationItem} 
              onPress={() => navigation.navigate('ChatConversation', {
                conversationId: conversation.id,
                name,
                isGroup: conversation.is_group
              })}
            >
              <View style={[styles.avatar, { backgroundColor: color }]}>
                {conversation.is_group && (
                  <View style={styles.groupBadge}>
                    <MaterialIcons name="people" size={12} color="#fff" />
                  </View>
                )}
                <Text style={styles.avatarText}>{initials}</Text>
              </View>

              <View style={styles.conversationInfo}>
                <View style={styles.conversationHeader}>
                  <Text style={styles.conversationName}>{name}</Text>
                  <Text style={styles.conversationTime}>{lastMessageTime}</Text>
                </View>
                <View style={styles.messageRow}>
                  <Text
                    style={[
                      styles.lastMessage,
                      (conversation.unread_count || 0) > 0 && styles.lastMessageUnread,
                    ]}
                    numberOfLines={1}
                  >
                    {conversation.last_message?.content || 'No messages yet'}
                  </Text>
                  {(conversation.unread_count || 0) > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{conversation.unread_count}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* AI Chat Assistant FAB */}
      <TouchableOpacity 
        style={styles.aiChatFab} 
        onPress={() => navigation.navigate('ChatConversation', { 
          conversationId: 'ai-assistant',
          name: 'AI Assistant',
          isGroup: false
        })}
      >
        <MaterialIcons name="auto-awesome" size={24} color="#fff" />
      </TouchableOpacity>

      {/* New Chat Modal */}
      <Modal
        visible={showNewChatModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Message</Text>
              <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Connections List */}
            <ScrollView style={styles.modalScrollView}>
              {loadingConnections ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
              ) : connections.length === 0 ? (
                <View style={styles.emptyConnections}>
                  <MaterialIcons name="people-outline" size={64} color={Colors.textSecondary} />
                  <Text style={styles.emptyConnectionsText}>No connections yet</Text>
                  <Text style={styles.emptyConnectionsSubtext}>
                    Connect with others to start messaging
                  </Text>
                  <TouchableOpacity
                    style={styles.browseUsersButton}
                    onPress={() => {
                      setShowNewChatModal(false);
                      navigation.navigate('AllUsers');
                    }}
                  >
                    <MaterialIcons name="explore" size={20} color="#ffffff" />
                    <Text style={styles.browseUsersText}>Browse Users</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                connections.map((connection) => {
                  const profile = connection.profile;
                  if (!profile) return null;

                  const initials = getInitials(profile.full_name || 'U');
                  const color = getColorFromString(profile.full_name || 'User');

                  return (
                    <TouchableOpacity
                      key={connection.id}
                      style={styles.connectionItem}
                      onPress={() => handleStartChat(connection)}
                      disabled={creatingChat}
                    >
                      {/* Avatar */}
                      {profile.avatar_url ? (
                        <Image 
                          source={{ uri: profile.avatar_url }} 
                          style={styles.connectionAvatar} 
                        />
                      ) : (
                        <LinearGradient
                          colors={Colors.gradients.softMesh}
                          style={styles.connectionAvatarGradient}
                        >
                          <Text style={styles.connectionAvatarText}>{initials}</Text>
                        </LinearGradient>
                      )}

                      {/* User Info */}
                      <View style={styles.connectionInfo}>
                        <Text style={styles.connectionName}>
                          {profile.full_name || 'Unknown User'}
                        </Text>
                        {profile.department && (
                          <Text style={styles.connectionDetail}>
                            {profile.department}
                          </Text>
                        )}
                      </View>

                      {/* Chevron */}
                      {creatingChat ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  composeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: '#111818',
  },
  scrollView: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  groupBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#111818',
  },
  conversationTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
  lastMessageUnread: {
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  aiChatFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.lg,
  },
  // New Chat Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  modalScrollView: {
    maxHeight: 500,
  },
  modalLoading: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyConnections: {
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  emptyConnectionsText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptyConnectionsSubtext: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  browseUsersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  browseUsersText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
  connectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  connectionAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  connectionAvatarGradient: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  connectionAvatarText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  connectionDetail: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
