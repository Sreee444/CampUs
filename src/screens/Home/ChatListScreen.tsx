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
import {
  getConversations,
  createGroupConversation,
  updateUserStatus,
  deleteConversationForUser,
  searchPublicGroups,
  requestToJoinPublicGroup,
} from '../../api/chat';
import { supabase } from '../../api/supabase';
import { getMyConnections, ConnectionWithProfile } from '../../api/connections';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';

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
  const discoverSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [connections, setConnections] = useState<ConnectionWithProfile[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Discover public groups modal
  const [showDiscoverGroupsModal, setShowDiscoverGroupsModal] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverResults, setDiscoverResults] = useState<any[]>([]);
  const [loadingDiscoverGroups, setLoadingDiscoverGroups] = useState(false);
  const [requestingGroupId, setRequestingGroupId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!showDiscoverGroupsModal || !user?.id) return;

    if (discoverSearchDebounceRef.current) {
      clearTimeout(discoverSearchDebounceRef.current);
    }

    discoverSearchDebounceRef.current = setTimeout(() => {
      loadDiscoverableGroups(discoverQuery);
    }, 300);

    return () => {
      if (discoverSearchDebounceRef.current) {
        clearTimeout(discoverSearchDebounceRef.current);
      }
    };
  }, [showDiscoverGroupsModal, discoverQuery, user?.id]);

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

  const loadDiscoverableGroups = async (query: string) => {
    if (!user?.id) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setDiscoverResults([]);
      setLoadingDiscoverGroups(false);
      return;
    }

    try {
      setLoadingDiscoverGroups(true);
      const groups = await searchPublicGroups(user.id, trimmed);
      setDiscoverResults(groups || []);
    } catch (error: any) {
      console.error('Error searching public groups:', error);
      Toast.show({
        type: 'error',
        text1: 'Unable to search groups',
        text2: error?.message || 'Try again in a moment',
      });
    } finally {
      setLoadingDiscoverGroups(false);
    }
  };

  const handleRequestGroupJoin = async (groupId: string) => {
    if (!user?.id) return;

    try {
      setRequestingGroupId(groupId);
      await requestToJoinPublicGroup(groupId, user.id);
      setDiscoverResults((prev) =>
        prev.map((item) =>
          item.id === groupId ? { ...item, request_status: 'pending' } : item
        )
      );
      Toast.show({
        type: 'success',
        text1: 'Request sent',
        text2: 'Group admins will review your request',
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Request failed',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setRequestingGroupId(null);
    }
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
    const latestIncomingUnread =
      conversation.last_message &&
      conversation.last_message.sender_id !== currentUserId &&
      !conversation.last_message.is_read_by_me
        ? 1
        : 0;
    const unreadCount = Math.max(conversation.unread_count || 0, latestIncomingUnread);
    const unreadLabel = unreadCount > 99 ? '99+' : `${unreadCount}`;
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
    const isPublicGroup = conversation.group_visibility === 'public';
    const groupRingColor = isPublicGroup ? '#FF0000' : '#00FF00';
    const groupBadgeColor = isPublicGroup ? '#FF0000' : '#00FF00';
    const activeGroupSize = conversation.participants?.length || 0;
    const requiredSeenByOthers = conversation.is_group ? Math.max(1, activeGroupSize - 1) : 1;
    const seenByOthersCount = conversation.last_message?.seen_by_count ?? (conversation.last_message?.seen_by_others ? 1 : 0);
    const showDoubleTick = conversation.is_group
      ? activeGroupSize > 0 && seenByOthersCount >= requiredSeenByOthers
      : !!conversation.last_message?.seen_by_others || seenByOthersCount >= 1;

    return (
      <TouchableOpacity
        style={[styles.conversationItem, unreadCount > 0 && styles.conversationItemUnread]}
        onPress={() => navigation.navigate('ChatConversation', {
          conversationId: conversation.id,
          name,
          isGroup: conversation.is_group,
          partnerUserId: conversation.is_group ? undefined : otherUser?.id,
        })}
      >
        {unreadCount > 0 && <View style={styles.unreadAccentBar} />}
        <View style={styles.avatarWrapper}>
          <View
            style={[
              styles.avatarRing,
              conversation.is_group && { borderColor: groupRingColor },
            ]}
          >
            <UserAvatar
              uri={avatarUri}
              name={name}
              size={48}
              showRing={false}
            />
          </View>
        </View>

        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <View style={styles.conversationNameRow}>
              <Text style={styles.conversationName} numberOfLines={1}>{name}</Text>
            </View>
            <View style={styles.conversationMetaRight}>
              <Text style={[styles.conversationTime, unreadCount > 0 && styles.conversationTimeUnread]}>{lastMessageTime}</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <MaterialIcons name="chat-bubble" size={10} color="#ffffff" style={styles.unreadBadgeIcon} />
                  <Text style={styles.unreadText}>{unreadLabel}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.metaRow}>
            {conversation.is_group ? (
              <View style={[styles.typeChip, styles.typeChipGroup]}>
                <Text style={[styles.typeChipText, styles.typeChipTextGroup]}>Group</Text>
              </View>
            ) : (
              <View style={[styles.typeChip, styles.typeChipDirect]}>
                <Text style={[styles.typeChipText, styles.typeChipTextDirect]}>Direct</Text>
              </View>
            )}
          </View>

          <View style={styles.messageRow}>
            {conversation.last_message?.sender_id === currentUserId && (
              <MaterialIcons
                name={showDoubleTick ? 'done-all' : 'done'}
                size={14}
                color={showDoubleTick ? '#2196F3' : Colors.textSecondary}
                style={styles.seenIcon}
              />
            )}
            <Text
              style={[
                styles.lastMessage,
                unreadCount > 0 && styles.lastMessageUnread,
              ]}
              numberOfLines={1}
            >
              {conversation.last_message?.content || 'No messages yet'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.conversationMenuButton}
          onPress={() => handleDeleteConversation(conversation)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="more-vert" size={20} color="#6B7280" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.gradientBg}
      >
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          ListHeaderComponent={(
            <>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.headerTitle}>Messages</Text>
                  <Text style={styles.headerSubtitle}>{`${unreadTotal} unread • ${directCount} direct chats`}</Text>
                </View>
                <TouchableOpacity
                  style={styles.composeButton}
                  onPress={() => setShowComposeMenu(true)}
                >
                  <MaterialIcons name="person-add-alt-1" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchSection}>
                <View style={styles.searchBar}>
                  <MaterialIcons name="search" size={20} color="#9CA3AF" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Type chat name or message"
                    placeholderTextColor="#9CA3AF"
                    value={searchInput}
                    onChangeText={setSearchInput}
                    returnKeyType="search"
                    onSubmitEditing={submitSearch}
                  />
                  {!!searchInput && (
                    <TouchableOpacity onPress={clearSearch}>
                      <MaterialIcons name="close" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterRow}
                  contentContainerStyle={styles.filterRowContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {filterOptions.map((item) => {
                    const isActive = activeFilter === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
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
                  })}
                </ScrollView>

                <Text style={styles.resultsCount}>
                  {activeSearch ? `${filteredConversations.length} results for "${activeSearch}"` : `${filteredConversations.length} chats`}
                </Text>
              </View>
            </>
          )}
          contentContainerStyle={styles.conversationsListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <MaterialIcons name="chat-bubble-outline" size={44} color={Colors.textSecondary} />
              <Text style={styles.emptyStateTitle}>No chats found</Text>
              <Text style={styles.emptyStateSubtext}>Start a new conversation from the compose button.</Text>
            </View>
          }
        />

      </LinearGradient>

      {/* AI Chat Assistant FAB */}
      <TouchableOpacity
        style={styles.aiChatFabTouch}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('ChatConversation', {
          conversationId: 'ai-assistant',
          name: 'AI Assistant',
          isGroup: false
        })}
      >
        <LinearGradient
          colors={['#8B5CF6', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.aiChatFab}
        >
          <MaterialIcons name="auto-awesome" size={26} color="#fff" />
        </LinearGradient>
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
                setShowDiscoverGroupsModal(true);
                setDiscoverQuery('');
                setDiscoverResults([]);
              }}
            >
              <MaterialIcons name="travel-explore" size={20} color={Colors.text} />
              <Text style={styles.composeActionText}>Discover Public Groups</Text>
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
        visible={showDiscoverGroupsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDiscoverGroupsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Discover Public Groups</Text>
                <Text style={styles.modalSubtitle}>Search by group name and request to join.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDiscoverGroupsModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchSection}>
              <View style={styles.modalSearchWrapper}>
                <MaterialIcons name="search" size={18} color={Colors.primary} />
                <TextInput
                  value={discoverQuery}
                  onChangeText={setDiscoverQuery}
                  placeholder="Type group name"
                  placeholderTextColor={Colors.textSecondary}
                  style={styles.modalSearchInput}
                />
                {!!discoverQuery && (
                  <TouchableOpacity style={styles.modalSearchClear} onPress={() => setDiscoverQuery('')}>
                    <MaterialIcons name="close" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView style={styles.modalScrollView} keyboardShouldPersistTaps="handled">
              {discoverQuery.trim().length < 2 ? (
                <View style={styles.emptyConnections}>
                  <MaterialIcons name="manage-search" size={48} color={Colors.textSecondary} />
                  <Text style={styles.emptyConnectionsText}>Search groups</Text>
                  <Text style={styles.emptyConnectionsSubtext}>Enter at least 2 characters to find public groups.</Text>
                </View>
              ) : loadingDiscoverGroups ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
              ) : discoverResults.length === 0 ? (
                <View style={styles.emptyConnections}>
                  <MaterialIcons name="groups" size={52} color={Colors.textSecondary} />
                  <Text style={styles.emptyConnectionsText}>No public groups found</Text>
                  <Text style={styles.emptyConnectionsSubtext}>Try another name or ask admins to make their group public.</Text>
                </View>
              ) : (
                discoverResults.map((group) => {
                  const status = group.request_status;
                  const isPending = status === 'pending';
                  const isMember = !!group.is_member;
                  const canRequest = !isPending && !isMember;

                  return (
                    <View key={group.id} style={styles.discoverGroupCard}>
                      <View style={styles.discoverGroupInfo}>
                        <View style={[styles.avatarRingSmall, { borderColor: '#FF0000' }]}>
                          <UserAvatar
                            uri={group.group_avatar}
                            name={group.group_name || 'Group'}
                            size={44}
                            showRing={false}
                          />
                        </View>
                        <View style={styles.discoverGroupTextWrap}>
                          <Text style={styles.discoverGroupName}>{group.group_name || 'Group'}</Text>
                          <Text style={styles.discoverGroupMeta}>Public group</Text>
                          <Text style={styles.discoverGroupBio} numberOfLines={2}>
                            {group.group_bio || 'No group bio yet'}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.discoverJoinButton,
                          !canRequest && styles.discoverJoinButtonDisabled,
                        ]}
                        disabled={!canRequest || requestingGroupId === group.id}
                        onPress={() => handleRequestGroupJoin(group.id)}
                      >
                        {requestingGroupId === group.id ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.discoverJoinButtonText}>
                            {isMember ? 'Joined' : isPending ? 'Pending' : 'Request'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
    backgroundColor: '#F5E6D8',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  gradientBg: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  composeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  searchSection: {
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  filterRow: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  filterRowContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  resultsCount: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.85)',
  },
  filterChipActive: {
    backgroundColor: '#EDEBFF',
    borderColor: '#C7D2FE',
  },
  filterChipText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
  filterCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterCountTextActive: {
    color: '#6366F1',
  },
  conversationsListContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 90,
  },
  conversationItem: {
    flexDirection: 'row',
    position: 'relative',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderRadius: 20,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowOpacity: 0,
    elevation: 0,
  },
  conversationItemUnread: {
    paddingLeft: 18,
  },
  unreadAccentBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatarRing: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 26,
    padding: 1,
  },
  avatarRingSmall: {
    borderWidth: 2,
    borderRadius: 24,
    padding: 1,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  conversationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  conversationName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  conversationMetaRight: {
    alignItems: 'flex-end',
    minWidth: 52,
    marginLeft: 8,
  },
  conversationTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  conversationTimeUnread: {
    color: '#16A34A',
    fontWeight: '600',
  },
  metaRow: {
    marginBottom: 6,
  },
  typeChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeChipDirect: {
    backgroundColor: '#EEF2FF',
  },
  typeChipGroup: {
    backgroundColor: '#ECFDF5',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  typeChipTextDirect: {
    color: '#6366F1',
  },
  typeChipTextGroup: {
    color: '#059669',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  lastMessageUnread: {
    fontWeight: '600',
    color: '#111827',
  },
  seenIcon: {
    marginRight: 6,
  },
  unreadBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: 4,
    flexDirection: 'row',
    gap: 3,
  },
  unreadBadgeIcon: {
    marginTop: 0.5,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  aiChatFabTouch: {
    position: 'absolute',
    bottom: 96,
    right: 18,
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 999,
  },
  aiChatFab: {
    width: '100%',
    height: '100%',
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    elevation: 0,
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
  discoverGroupCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  discoverGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  discoverGroupTextWrap: {
    flex: 1,
  },
  discoverGroupName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  discoverGroupMeta: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    marginTop: 1,
  },
  discoverGroupBio: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  discoverJoinButton: {
    alignSelf: 'flex-end',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverJoinButtonDisabled: {
    backgroundColor: Colors.textSecondary,
    opacity: 0.7,
  },
  discoverJoinButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#ffffff',
  },
});
