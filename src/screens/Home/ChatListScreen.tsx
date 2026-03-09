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
  Alert,
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
import { getConversations, createGroupConversation, updateUserStatus, deleteConversationForUser } from '../../api/chat';
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
      if (user?.id) {
        loadConversations();
        updateUserStatus(user.id, 'online').catch(() => {
          // Ignore presence update failures to avoid blocking chat list loading.
        });
      }

      return () => {
        if (user?.id) {
          updateUserStatus(user.id, 'away').catch(() => {
            // Set away when leaving chat section to Projects/Events/Profile.
          });
        }
      };
    }, [user?.id])
  );

  // Real-time: refresh list when any message is inserted
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);


  useEffect(() => {
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
  }, [searchInput]);

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

  const handleDeleteConversation = (conversation: any) => {
    if (!user?.id) return;

    const label = conversation.is_group ? 'Leave this group chat?' : 'Delete this chat from your list?';
    Alert.alert('Delete Conversation', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: conversation.is_group ? 'Leave Group' : 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteConversationForUser(conversation.id, user.id);
            setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
            Toast.show({
              type: 'success',
              text1: conversation.is_group ? 'Left group chat' : 'Conversation deleted',
            });
          } catch (error: any) {
            Toast.show({
              type: 'error',
              text1: 'Unable to delete conversation',
              text2: error?.message || 'Please try again',
            });
          }
        },
      },
    ]);
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

  const selectedConnections = useMemo(() => {
    return connections.filter((connection) => {
      const profileId = connection.profile?.id;
      return !!profileId && selectedParticipantIds.includes(profileId);
    });
  }, [connections, selectedParticipantIds]);

  const remainingMembersNeeded = Math.max(0, 2 - selectedParticipantIds.length);
  const canCreateGroup = !!groupName.trim() && selectedParticipantIds.length >= 2 && !creatingChat;

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
    const lastMessageTime = conversation.last_message
      ? new Date(conversation.last_message.created_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
      : '';

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => navigation.navigate('ChatConversation', {
          conversationId: conversation.id,
          name,
          isGroup: conversation.is_group,
          partnerUserId: conversation.is_group ? undefined : otherUser?.id,
        })}
      >
        <View style={styles.avatarWrapper}>
          <UserAvatar
            uri={avatarUri}
            name={name}
            size={48}
            showRing={false}
          />
          {conversation.is_group && (
            <View style={styles.groupBadge}>
              <MaterialIcons name="people" size={12} color={Colors.surface} />
            </View>
          )}
        </View>

        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName}>{name}</Text>
            <Text style={styles.conversationTime}>{lastMessageTime}</Text>
          </View>

          <View style={styles.metaRow}>
            {conversation.is_group ? (
              <View style={styles.typeChip}>
                <MaterialIcons name="groups" size={12} color={Colors.textSecondary} />
                <Text style={styles.typeChipText}>Group</Text>
              </View>
            ) : (
              <View style={styles.typeChip}>
                <MaterialIcons name="person" size={12} color={Colors.textSecondary} />
                <Text style={styles.typeChipText}>Direct</Text>
              </View>
            )}
          </View>

          <View style={styles.messageRow}>
            {conversation.last_message?.sender_id === currentUserId && (
              <MaterialIcons
                name={conversation.last_message?.seen_by_others ? 'done-all' : 'done'}
                size={14}
                color={conversation.last_message?.seen_by_others ? '#2196F3' : Colors.textSecondary}
                style={styles.seenIcon}
              />
            )}
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

        <TouchableOpacity
          style={styles.conversationMenuButton}
          onPress={() => handleDeleteConversation(conversation)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="more-vert" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>{`${unreadTotal} unread · ${directCount} direct chats`}</Text>
        </View>
        <TouchableOpacity
          style={styles.composeButton}
          onPress={() => setShowComposeMenu(true)}
        >
          <MaterialIcons name="person-add-alt-1" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Type chat name or message"
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

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterOptions}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.key;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
                <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                  <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                    {item.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <Text style={styles.resultsCount}>
          {activeSearch ? `${filteredConversations.length} results for "${activeSearch}"` : `${filteredConversations.length} chats`}
        </Text>
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
                setGroupName('');
                setSelectedParticipantIds([]);
                setConnectionSearchQuery('');
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
              <View>
                <Text style={styles.modalTitle}>Create Group</Text>
                <Text style={styles.modalSubtitle}>Build a focused space for your connections.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.groupHeroCard}>
              <View style={styles.groupHeroIconWrap}>
                <MaterialIcons name="diversity-3" size={18} color="#ffffff" />
              </View>
              <View style={styles.groupHeroContent}>
                <Text style={styles.groupHeroTitle}>Group Details</Text>
                <Text style={styles.groupHeroHint}>Pick a clear name and invite at least two members.</Text>
              </View>
            </View>

            <View style={styles.groupSetupCard}>
              <View style={styles.groupSetupRow}>
                <Text style={styles.groupSetupLabel}>Group Name</Text>
                <Text style={styles.groupNameCounter}>{groupName.length}/60</Text>
              </View>
              <TextInput
                style={styles.groupNameInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="e.g. Hackathon Core Team"
                placeholderTextColor={Colors.textSecondary}
                maxLength={60}
              />

              <View style={styles.groupStatsRow}>
                <View style={styles.groupStatChip}>
                  <MaterialIcons name="person" size={14} color={Colors.primary} />
                  <Text style={styles.groupStatText}>You + {selectedParticipantIds.length}</Text>
                </View>
                <View style={styles.groupStatChip}>
                  <MaterialIcons name="groups" size={14} color={Colors.primary} />
                  <Text style={styles.groupStatText}>
                    {remainingMembersNeeded === 0 ? 'Ready to create' : `${remainingMembersNeeded} more needed`}
                  </Text>
                </View>
              </View>

              {selectedConnections.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectedMembersRow}
                >
                  {selectedConnections.map((connection) => {
                    const profile = connection.profile;
                    if (!profile?.id) return null;
                    return (
                      <TouchableOpacity
                        key={`selected_${profile.id}`}
                        style={styles.selectedMemberChip}
                        onPress={() => toggleGroupParticipant(profile.id!)}
                        disabled={creatingChat}
                      >
                        <Text style={styles.selectedMemberChipText} numberOfLines={1}>
                          {profile.full_name || 'Unknown'}
                        </Text>
                        <MaterialIcons name="close" size={14} color={Colors.primary} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.groupSetupHint}>No members selected yet. Tap users below to add them.</Text>
              )}
            </View>

            <View style={styles.modalSearchSection}>
              <View style={styles.modalSearchHeader}>
                <Text style={styles.modalSearchTitle}>Search Users</Text>
                <Text style={styles.modalSearchHint}>{filteredConnections.length} available</Text>
              </View>

              <View style={styles.modalSearchWrapper}>
                <MaterialIcons name="search" size={18} color={Colors.primary} />
                <TextInput
                  value={connectionSearchQuery}
                  onChangeText={setConnectionSearchQuery}
                  placeholder="Type name, role, or department"
                  placeholderTextColor={Colors.textSecondary}
                  style={styles.modalSearchInput}
                />
                {!!connectionSearchQuery && (
                  <TouchableOpacity style={styles.modalSearchClear} onPress={() => setConnectionSearchQuery('')}>
                    <MaterialIcons name="close" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
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
                      style={[
                        styles.connectionItem,
                        profile.id && selectedParticipantIds.includes(profile.id) && styles.connectionItemSelected,
                      ]}
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
                        <View style={styles.connectionSelectWrap}>
                          <Text
                            style={[
                              styles.connectionSelectText,
                              selectedParticipantIds.includes(profile.id) && styles.connectionSelectTextActive,
                            ]}
                          >
                            {selectedParticipantIds.includes(profile.id) ? 'Added' : 'Add'}
                          </Text>
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
                        </View>
                      ) : (
                        <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.groupComposerFooter}>
              <TouchableOpacity
                style={[styles.createGroupButton, !canCreateGroup && styles.createGroupButtonDisabled]}
                onPress={handleCreateGroup}
                disabled={!canCreateGroup}
              >
                {creatingChat ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialIcons name="rocket-launch" size={18} color="#ffffff" />
                    <Text style={styles.createGroupButtonText}>Create Group ({selectedParticipantIds.length + 1})</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  composeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    ...Shadows.sm,
  },
  searchSection: {
    marginHorizontal: Spacing.md,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  filterRow: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  resultsCount: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.xs + 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  filterChipTextActive: {
    color: Colors.primaryContent,
  },
  filterCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  filterCountBadgeActive: {
    backgroundColor: Colors.surface,
  },
  filterCountText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semibold,
  },
  filterCountTextActive: {
    color: Colors.primaryContent,
  },
  conversationsListContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: 110,
  },
  conversationItem: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: 10,
    borderRadius: BorderRadius.lg,
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
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
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textSecondary,
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
  conversationMenuButton: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  conversationName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  conversationTime: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaRow: {
    marginBottom: 6,
  },
  typeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.card,
  },
  typeChipText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  lastMessageUnread: {
    fontWeight: FontWeights.medium,
    color: Colors.text,
  },
  seenIcon: {
    marginRight: 6,
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
    bottom: 92,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 20,
    ...Shadows.lg,
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
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  composeMenuTitle: {
    fontSize: FontSizes.lg,
    color: Colors.text,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.xs,
  },
  composeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
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
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyStateTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  // New Chat Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    flex: 1,
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
  modalSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  modalScrollView: {
    flex: 1,
  },
  modalSearchSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  modalSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalSearchTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  modalSearchHint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
  },
  modalSearchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.md,
  },
  modalSearchClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  modalLoading: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  groupHeroCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  groupHeroIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  groupHeroContent: {
    flex: 1,
  },
  groupHeroTitle: {
    color: '#ffffff',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  groupHeroHint: {
    marginTop: 1,
    color: '#ffffff',
    opacity: 0.9,
    fontSize: FontSizes.xs,
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
  groupSetupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupSetupLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  groupNameCounter: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
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
  groupStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  groupStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primarySoft,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  groupStatText: {
    fontSize: FontSizes.sm,
    color: Colors.primaryContent,
    fontWeight: FontWeights.medium,
  },
  selectedMembersRow: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  selectedMemberChip: {
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  selectedMemberChipText: {
    maxWidth: 140,
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  createGroupButton: {
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
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
  connectionItemSelected: {
    backgroundColor: Colors.primarySoft,
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
  connectionSelectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  connectionSelectText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  connectionSelectTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  groupComposerFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
  },
});
