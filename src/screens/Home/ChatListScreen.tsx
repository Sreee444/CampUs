import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getConversations, createGroupConversation } from '../../api/chat';
import { supabase } from '../../api/supabase';
import { getMyConnections, ConnectionWithProfile } from '../../api/connections';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';

type ChatScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Chat'>,
  StackNavigationProp<RootStackParamList>
>;

const MIN_REALTIME_SEARCH_LENGTH = 2;

export default function ChatScreen() {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [conversations, setConversations] = useState<any[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [isRealtimeSearch, setIsRealtimeSearch] = useState(true);
  const [connectionSearchQuery, setConnectionSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'groups' | 'direct' | 'mentorship'>('all');
  const [showComposeMenu, setShowComposeMenu] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [connections, setConnections] = useState<ConnectionWithProfile[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const loadConversations = async () => {
    if (!user?.id) return;

    try {
      const data = await getConversations(user.id);
      const filtered = (data || []).filter((conversation: any) => conversation.conv_type !== 'mentorship');
      setConversations(filtered);
    } catch (error) {
      console.error('Chat list error:', error);
    }
  };

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadConversations();
    } finally {
      setRefreshing(false);
    }
  };

  // Reload conversations every time user navigates to this tab
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) loadConversations();
    }, [user?.id])
  );

  // Real-time: refresh list when any message is inserted or read status changes
  // Use user-specific channel name to avoid duplicate subscription conflicts
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat_list_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { loadConversations(); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads' },
        () => { loadConversations(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);


  useEffect(() => {
    if (!isRealtimeSearch) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const trimmed = searchInput.trim();

      if (!trimmed) {
        setActiveSearch('');
        return;
      }

      if (trimmed.length >= MIN_REALTIME_SEARCH_LENGTH) {
        setActiveSearch(trimmed);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput, isRealtimeSearch]);

  const submitSearch = () => {
    setActiveSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
  };

  // Load connections when modal opens
  useEffect(() => {
    if (showNewChatModal) {
      loadConnections();
      setConnectionSearchQuery('');
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

  const toggleGroupParticipant = (participantId: string) => {
    setSelectedParticipantIds((prev) => {
      if (prev.includes(participantId)) {
        return prev.filter((id) => id !== participantId);
      }
      return [...prev, participantId];
    });
  };

  const handleCreateGroup = async () => {
    if (!user?.id) return;

    const trimmedName = groupName.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: 'Group name required',
        text2: 'Please enter a group name',
      });
      return;
    }

    if (selectedParticipantIds.length < 2) {
      Toast.show({
        type: 'error',
        text1: 'Select at least 2 members',
        text2: 'Group chat requires at least 3 people including you',
      });
      return;
    }

    try {
      setCreatingChat(true);
      const conversation = await createGroupConversation(
        user.id,
        trimmedName,
        selectedParticipantIds
      );

      setShowNewChatModal(false);
      setIsGroupMode(false);
      setSelectedParticipantIds([]);
      setGroupName('');
      await loadConversations();

      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        name: trimmedName,
        isGroup: true,
      });
    } catch (error) {
      console.error('Error creating group chat:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to create group chat',
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
    let results = conversations;

    if (activeFilter === 'unread') {
      results = results.filter((conversation) => (conversation.unread_count || 0) > 0);
    }

    if (activeFilter === 'groups') {
      results = results.filter((conversation) => conversation.is_group);
    }

    if (activeFilter === 'direct') {
      results = results.filter((conversation) => !conversation.is_group);
    }

    if (!activeSearch.trim()) return results;
    const query = activeSearch.trim().toLowerCase();
    return results.filter((conversation) => {
      const name = getConversationName(conversation, user?.id || '');
      const lastMessage = (conversation.last_message?.content || '').toLowerCase();
      return name.toLowerCase().includes(query) || lastMessage.includes(query);
    });
  }, [conversations, activeSearch, user?.id, activeFilter]);

  const filteredConnections = useMemo(() => {
    if (!connectionSearchQuery.trim()) {
      return connections;
    }

    const query = connectionSearchQuery.trim().toLowerCase();
    return connections.filter((connection) => {
      const profile = connection.profile;
      const name = (profile?.full_name || '').toLowerCase();
      const dept = (profile?.department || '').toLowerCase();
      const role = (profile?.role || '').toLowerCase();
      return name.includes(query) || dept.includes(query) || role.includes(query);
    });
  }, [connections, connectionSearchQuery]);

  const currentUserId = user?.id || '';
  const unreadTotal = conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0);
  const groupCount = conversations.filter((conversation) => conversation.is_group).length;
  const directCount = conversations.filter((conversation) => !conversation.is_group).length;

  const mentorshipCount = conversations.filter((c) => c.conv_type === 'mentorship').length;
  const filterOptions: Array<{ key: 'all' | 'unread' | 'groups' | 'direct' | 'mentorship'; label: string; count: number }> = [
    { key: 'all', label: 'All', count: conversations.length },
    { key: 'unread', label: 'Unread', count: unreadTotal },
    { key: 'groups', label: 'Groups', count: groupCount },
    { key: 'direct', label: 'Direct', count: directCount },
  ];

  const renderConversationItem = ({ item: conversation }: { item: any }) => {
    const name = getConversationName(conversation, currentUserId);
    const otherUser = !conversation.is_group
      ? conversation.participants?.find((p: any) => p.id !== currentUserId)
      : null;
    const avatarUri = conversation.is_group ? conversation.group_avatar : otherUser?.avatar_url;
    const hasUnread = (conversation.unread_count || 0) > 0;
    const lastMessageTime = conversation.last_message
      ? new Date(conversation.last_message.created_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
      : '';

    return (
      <TouchableOpacity
        style={[styles.conversationItem, hasUnread && styles.conversationItemUnread]}
        onPress={() => navigation.navigate('ChatConversation', {
          conversationId: conversation.id,
          name,
          isGroup: conversation.is_group,
        })}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrapper}>
          <UserAvatar
            uri={avatarUri}
            name={name}
            size={52}
            showRing={false}
          />
          {conversation.is_group && (
            <View style={styles.groupBadge}>
              <MaterialIcons name="groups" size={11} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.conversationName, hasUnread && styles.conversationNameUnread]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.conversationTime, hasUnread && styles.conversationTimeUnread]}>{lastMessageTime}</Text>
          </View>

          <View style={styles.messageRow}>
            {conversation.last_message?.sender_id === currentUserId && conversation.last_message?.content && (
              <MaterialIcons
                name={conversation.last_message?.seen_by_others ? 'done-all' : 'done'}
                size={15}
                color={conversation.last_message?.seen_by_others ? '#2196F3' : Colors.textSecondary}
                style={styles.chatListSeenIcon}
              />
            )}
            <Text
              style={[
                styles.lastMessage,
                hasUnread && styles.lastMessageUnread,
              ]}
              numberOfLines={1}
            >
              {conversation.last_message?.content || 'No messages yet'}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{conversation.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>{filteredConversations.length} conversations</Text>
        </View>
        <TouchableOpacity
          style={styles.composeButton}
          onPress={() => setShowComposeMenu(true)}
        >
          <MaterialIcons name="person-add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={Colors.textSecondary}
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
          {!!searchInput && (
            <TouchableOpacity onPress={clearSearch}>
              <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filterOptions.map((item) => {
            const isActive = activeFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(item.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
                {item.count > 0 && (
                  <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                    <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                      {item.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversationItem}
        contentContainerStyle={styles.conversationsListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyStateContainer}>
            <MaterialIcons name="chat-bubble-outline" size={44} color={Colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No chats found</Text>
            <Text style={styles.emptyStateSubtext}>Start a new conversation from the compose button.</Text>
          </View>
        }
      />

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

      <Modal
        visible={showComposeMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowComposeMenu(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.composeMenuCard}>
            <Text style={styles.composeMenuTitle}>New Message</Text>

            <TouchableOpacity
              style={styles.composeActionRow}
              onPress={() => {
                setShowComposeMenu(false);
                navigation.navigate('AllUsers', { mode: 'message' });
              }}
            >
              <MaterialIcons name="person-add-alt" size={20} color={Colors.text} />
              <Text style={styles.composeActionText}>Message User</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.composeActionRow}
              onPress={() => {
                setShowComposeMenu(false);
                setShowNewChatModal(true);
                setIsGroupMode(true);
              }}
            >
              <MaterialIcons name="groups" size={20} color={Colors.text} />
              <Text style={styles.composeActionText}>Create Group</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.composeActionRow}
              onPress={() => {
                setShowComposeMenu(false);
                navigation.navigate('AllUsers');
              }}
            >
              <MaterialIcons name="explore" size={20} color={Colors.text} />
              <Text style={styles.composeActionText}>Browse Users</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.composeActionRow, styles.composeCancelRow]}
              onPress={() => setShowComposeMenu(false)}
            >
              <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              <Text style={[styles.composeActionText, { color: Colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

            <View style={styles.modalActions}>
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

              <TouchableOpacity
                style={[styles.groupModeButton, isGroupMode && styles.groupModeButtonActive]}
                onPress={() => {
                  setIsGroupMode((prev) => !prev);
                  if (isGroupMode) {
                    setSelectedParticipantIds([]);
                    setGroupName('');
                  }
                }}
              >
                <MaterialIcons
                  name={isGroupMode ? 'close' : 'group-add'}
                  size={20}
                  color={isGroupMode ? '#ffffff' : Colors.primary}
                />
                <Text style={[styles.groupModeButtonText, isGroupMode && styles.groupModeButtonTextActive]}>
                  {isGroupMode ? 'Cancel Group' : 'Create Group'}
                </Text>
              </TouchableOpacity>
            </View>

            {isGroupMode && (
              <View style={styles.groupSetupCard}>
                <Text style={styles.groupSetupLabel}>Group Name</Text>
                <TextInput
                  style={styles.groupNameInput}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Enter group name"
                  placeholderTextColor={Colors.textSecondary}
                  maxLength={60}
                />
                <Text style={styles.groupSetupHint}>Select at least 2 connections</Text>
                <TouchableOpacity
                  style={[
                    styles.createGroupButton,
                    (creatingChat || selectedParticipantIds.length < 2 || !groupName.trim()) &&
                    styles.createGroupButtonDisabled,
                  ]}
                  onPress={handleCreateGroup}
                  disabled={creatingChat || selectedParticipantIds.length < 2 || !groupName.trim()}
                >
                  {creatingChat ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <MaterialIcons name="groups" size={20} color="#ffffff" />
                      <Text style={styles.createGroupButtonText}>
                        Create Group ({selectedParticipantIds.length + 1})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalSearchWrapper}>
              <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                value={connectionSearchQuery}
                onChangeText={setConnectionSearchQuery}
                placeholder="Search users, role, department"
                placeholderTextColor={Colors.textSecondary}
                style={styles.modalSearchInput}
              />
              {!!connectionSearchQuery && (
                <TouchableOpacity onPress={() => setConnectionSearchQuery('')}>
                  <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Connections List */}
            <ScrollView style={styles.modalScrollView}>
              {loadingConnections ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
              ) : filteredConnections.length === 0 ? (
                <View style={styles.emptyConnections}>
                  <MaterialIcons name="people-outline" size={64} color={Colors.textSecondary} />
                  <Text style={styles.emptyConnectionsText}>
                    {connectionSearchQuery ? 'No matching users' : 'No connections yet'}
                  </Text>
                  <Text style={styles.emptyConnectionsSubtext}>
                    {connectionSearchQuery
                      ? 'Try searching with another name or department'
                      : 'Connect with others to start messaging'}
                  </Text>
                  <TouchableOpacity
                    style={styles.browseUsersButton}
                    onPress={() => {
                      setShowNewChatModal(false);
                      navigation.navigate('AllUsers', { mode: 'browse' });
                    }}
                  >
                    <MaterialIcons name="explore" size={20} color="#ffffff" />
                    <Text style={styles.browseUsersText}>Browse Users</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filteredConnections.map((connection) => {
                  const profile = connection.profile;
                  if (!profile) return null;

                  const initials = getInitials(profile.full_name || 'U');
                  const color = getColorFromString(profile.full_name || 'User');

                  return (
                    <TouchableOpacity
                      key={connection.id}
                      style={styles.connectionItem}
                      onPress={() => {
                        if (profile.id) {
                          toggleGroupParticipant(profile.id);
                        }
                      }}
                      disabled={creatingChat}
                    >
                      {/* Avatar */}
                      {profile.avatar_url ? (
                        <Image
                          source={{ uri: profile.avatar_url }}
                          style={styles.connectionAvatar}
                        />
                      ) : (
                        <View
                          style={[styles.connectionAvatarGradient, { backgroundColor: color }]}
                        >
                          <Text style={styles.connectionAvatarText}>{initials}</Text>
                        </View>
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
                      ) : profile.id ? (
                        <View
                          style={[
                            styles.participantCheckbox,
                            selectedParticipantIds.includes(profile.id) && styles.participantCheckboxActive,
                          ]}
                        >
                          {selectedParticipantIds.includes(profile.id) && (
                            <MaterialIcons name="check" size={16} color="#ffffff" />
                          )}
                        </View>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  composeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  searchActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  searchActionChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  searchActionText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  searchActionTextActive: {
    color: Colors.primaryContent,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  searchButtonText: {
    color: Colors.primaryContent,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  resultsCount: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semibold,
  },
  filterChipTextActive: {
    color: Colors.primaryContent,
  },
  filterCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.border,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(14, 58, 58, 0.2)',
  },
  filterCountText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
  },
  filterCountTextActive: {
    color: Colors.primaryContent,
  },
  conversationsListContent: {
    paddingBottom: 110,
    paddingTop: 6,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: Colors.surface,
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 16,
  },
  conversationItemUnread: {
    backgroundColor: Colors.primarySoft,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 999,
  },
  moreMembersBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  moreMembersText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
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
    marginBottom: 5,
  },
  conversationName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  conversationNameUnread: {
    fontWeight: FontWeights.bold,
  },
  conversationTime: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  conversationTimeUnread: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  lastMessageUnread: {
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  chatListSeenIcon: {
    marginRight: 3,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 10,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: Colors.primaryContent,
  },
  aiChatFab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.lg,
    elevation: 6,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  composeMenuCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 10,
  },
  composeMenuTitle: {
    fontSize: FontSizes.lg,
    color: Colors.text,
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  composeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: 14,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  composeActionText: {
    fontSize: FontSizes.md,
    color: Colors.text,
    fontWeight: FontWeights.medium,
  },
  composeCancelRow: {
    marginTop: Spacing.xs,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
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
  modalSearchWrapper: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  modalSearchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.md,
  },
  modalLoading: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  modalActions: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  groupModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    marginTop: Spacing.lg,
  },
  groupModeButtonActive: {
    backgroundColor: Colors.primary,
  },
  groupModeButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  groupModeButtonTextActive: {
    color: '#ffffff',
  },
  groupSetupCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    gap: Spacing.sm,
  },
  groupSetupLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  groupSetupHint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  createGroupButton: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  createGroupButtonDisabled: {
    opacity: 0.5,
  },
  createGroupButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
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
  participantCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  participantCheckboxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
});
