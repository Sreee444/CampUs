import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  TextInput,
  Image,
  Keyboard,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../api/supabase';
import { Profile } from '../../types/database';
import { createDirectConversation } from '../../api/chat';
import { getMyConnections, removeConnection } from '../../api/connections';
import Toast from 'react-native-toast-message';
import { getCleanInitials } from '../../utils/roles';
import ConfirmDialog from '../../components/ConfirmDialog';

type AllUsersScreenNavigationProp = StackNavigationProp<RootStackParamList>;
type AllUsersScreenRouteProp = RouteProp<RootStackParamList, 'AllUsers'>;

const USERS_PER_PAGE = 20;
const MIN_REALTIME_SEARCH_LENGTH = 2;

const ROLE_FILTERS = [
  { label: 'All', value: null },
  { label: 'Students', value: 'student' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Alumni', value: 'alumni' },
  { label: 'Admin', value: 'admin' },
];

export default function AllUsersScreen() {
  const navigation = useNavigation<AllUsersScreenNavigationProp>();
  const route = useRoute<AllUsersScreenRouteProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const mode = route.params?.mode || 'browse';
  const isMessageMode = mode === 'message';
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [acceptedConnectionMap, setAcceptedConnectionMap] = useState<Record<string, string>>({});
  const [unfriendDialog, setUnfriendDialog] = useState<{
    visible: boolean;
    targetUserId?: string;
    targetName?: string;
    connectionId?: string;
  }>({ visible: false });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(0);
  const activeSearchRef = useRef('');

  useEffect(() => {
    activeSearchRef.current = activeSearch;
  }, [activeSearch]);

  const loadUsers = useCallback(
    async (reset: boolean = false, overrideSearch?: string) => {
      try {
        if (reset) {
          setIsLoading(true);
          setPage(0);
          pageRef.current = 0;
          setHasMore(true);
        } else {
          setIsLoadingMore(true);
        }

        const currentPage = reset ? 0 : pageRef.current;
        const from = currentPage * USERS_PER_PAGE;
        const to = from + USERS_PER_PAGE - 1;
        const querySearch = (overrideSearch ?? activeSearchRef.current).trim();

        let query = supabase
          .from('profiles')
          .select('*', { count: 'exact' })
          .neq('id', user?.id || '')
          .order('full_name', { ascending: true })
          .range(from, to);

        if (selectedRole) {
          query = query.eq('role', selectedRole);
        }

        if (querySearch) {
          query = query.or(`full_name.ilike.%${querySearch}%,email.ilike.%${querySearch}%,department.ilike.%${querySearch}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const nextUsers = data || [];

        if (reset) {
          setUsers(nextUsers);
        } else {
          setUsers((prev) => [...prev, ...nextUsers]);
        }

        setHasMore(nextUsers.length === USERS_PER_PAGE);
        pageRef.current = currentPage + 1;
        setPage(pageRef.current);
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [selectedRole, user?.id]
  );

  useEffect(() => {
    loadUsers(true);
  }, [selectedRole]);

  useEffect(() => {
    loadAcceptedConnections();
  }, [user?.id]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const trimmed = searchInput.trim();

      if (!trimmed) {
        setActiveSearch('');
        loadUsers(true, '');
        return;
      }

      if (trimmed.length >= MIN_REALTIME_SEARCH_LENGTH) {
        setActiveSearch(trimmed);
        loadUsers(true, trimmed);
      }
    }, 350);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput, loadUsers]);

  const clearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
    loadUsers(true, '');
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadUsers(false);
    }
  };

  const loadAcceptedConnections = async () => {
    try {
      const connections = await getMyConnections('accepted');
      const nextMap: Record<string, string> = {};
      for (const connection of connections) {
        const otherUserId = connection.profile?.id;
        if (otherUserId && connection.id) {
          nextMap[otherUserId] = connection.id;
        }
      }
      setAcceptedConnectionMap(nextMap);
    } catch (error) {
      console.error('Error loading accepted connections:', error);
    }
  };

  const resultsSummary = useMemo(() => {
    if (activeSearch.trim()) {
      return `${users.length} results for "${activeSearch}"`;
    }
    return `${users.length} users found`;
  }, [activeSearch, users.length]);

  const getInitials = (name?: string) => getCleanInitials(name) || 'U';

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'student':
        return Colors.info;
      case 'faculty':
        return Colors.warning;
      case 'alumni':
        return Colors.success;
      case 'admin':
        return Colors.error;
      default:
        return Colors.textSecondary;
    }
  };

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'student':
        return 'school';
      case 'faculty':
        return 'person';
      case 'alumni':
        return 'verified';
      case 'admin':
        return 'admin-panel-settings';
      default:
        return 'person-outline';
    }
  };

  const confirmUnfriend = async () => {
    const connectionId = unfriendDialog.connectionId;
    const targetUserId = unfriendDialog.targetUserId;
    if (!connectionId || !targetUserId) return;

    const result = await removeConnection(connectionId);
    if (result.success) {
      setAcceptedConnectionMap((prev) => {
        const next = { ...prev };
        delete next[targetUserId];
        return next;
      });
      Toast.show({ type: 'success', text1: 'Connection removed' });
    } else {
      Toast.show({ type: 'error', text1: 'Failed to unfriend', text2: result.error || 'Please try again' });
    }
    setUnfriendDialog({ visible: false });
  };

  const renderUserCard = ({ item }: { item: Profile }) => {
    const roleColor = getRoleColor(item.role);
    const connectionId = acceptedConnectionMap[item.id];

    const handleMessageUser = async () => {
      if (!user?.id) return;

      try {
        const conversation = await createDirectConversation(user.id, item.id);
        navigation.navigate('ChatConversation', {
          conversationId: conversation.id,
          name: item.full_name || 'User',
          isGroup: false,
        });
      } catch (error: any) {
        Toast.show({
          type: 'error',
          text1: 'Unable to start chat',
          text2: error?.message || 'Please try again',
        });
      }
    };

    const handleUnfriend = () => {
      if (!connectionId) return;
      setUnfriendDialog({
        visible: true,
        targetUserId: item.id,
        targetName: item.full_name || 'this user',
        connectionId,
      });
    };

    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() =>
          isMessageMode
            ? handleMessageUser()
            : navigation.navigate('PublicProfile', { userId: item.id })
        }
        activeOpacity={0.75}
      >
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={Colors.gradients.meshLight as any} style={styles.avatarGradient}>
              <Text style={styles.avatarText}>{getInitials(item.full_name ?? undefined)}</Text>
            </LinearGradient>
          )}

          <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
            <MaterialIcons name={getRoleIcon(item.role) as any} size={12} color="#ffffff" />
          </View>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.full_name || 'Unknown User'}
          </Text>

          <View style={styles.infoRow}>
            <MaterialIcons name="mail-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>
              {item.email}
            </Text>
          </View>

          {item.department ? (
            <View style={styles.infoRow}>
              <MaterialIcons name="business" size={14} color={Colors.textSecondary} />
              <Text style={styles.infoText} numberOfLines={1}>
                {item.department}
              </Text>
            </View>
          ) : null}

          {item.bio ? (
            <Text style={styles.bio} numberOfLines={2}>
              {item.bio}
            </Text>
          ) : null}
        </View>

        {isMessageMode ? (
          <TouchableOpacity style={styles.messageUserButton} onPress={handleMessageUser}>
            <MaterialIcons name="send" size={14} color={Colors.primaryContent} />
            <Text style={styles.messageUserButtonText}>Message</Text>
          </TouchableOpacity>
        ) : connectionId ? (
          <TouchableOpacity
            style={styles.unfriendButton}
            onPress={handleUnfriend}
          >
            <MaterialIcons name="person-remove" size={14} color="#ef4444" />
            <Text style={styles.unfriendButtonText}>Unfriend</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
          >
            <MaterialIcons name="person" size={14} color="#6366F1" />
            <Text style={styles.connectButtonText}>Connect</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="person-search" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>No users found</Text>
        <Text style={styles.emptySubtext}>
          {activeSearch || selectedRole
            ? 'Try another full name, email, or role filter'
            : 'No profiles available right now'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.gradientBg}
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discover Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {isMessageMode && (
        <View style={styles.modeBanner}>
          <MaterialIcons name="chat" size={16} color={Colors.primaryContent} />
          <Text style={styles.modeBannerText}>Select a user to start messaging</Text>
        </View>
      )}

      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Type full name or email"
            placeholderTextColor={Colors.textSecondary}
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchInput.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContainer}
        >
          {ROLE_FILTERS.map((filter) => {
            const isSelected = filter.value === selectedRole;
            return (
              <TouchableOpacity
                key={filter.label}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedRole(filter.value)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.resultsCount}>{resultsSummary}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUserCard}
          keyExtractor={(item, index) => `${item?.id || 'user'}-${index}`}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={users.length === 0 ? styles.emptyList : styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
        />
      )}
      </LinearGradient>

      <ConfirmDialog
        visible={unfriendDialog.visible}
        title="Unfriend user?"
        message={`You will remove ${unfriendDialog.targetName || 'this user'} from your connections.`}
        confirmText="Unfriend"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmUnfriend}
        onCancel={() => setUnfriendDialog({ visible: false })}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    gradientBg: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: Spacing.md,
      marginTop: 8,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      borderRadius: 20,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.backgroundAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    searchSection: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: 4,
      gap: Spacing.sm,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderRadius: 12,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
      gap: Spacing.xs,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    searchInput: {
      flex: 1,
      fontSize: FontSizes.sm,
      color: Colors.text,
      marginLeft: Spacing.xs,
    },
    filtersScroll: {
      maxHeight: 40,
    },
    filtersContainer: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingRight: Spacing.sm,
      alignItems: 'center',
    },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    filterChipActive: {
      backgroundColor: '#6366F1',
    },
    filterChipText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
      color: '#6B7280',
    },
    filterChipTextActive: {
      color: '#ffffff',
    },
    resultsCount: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    modeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      backgroundColor: Colors.primarySoft,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    modeBannerText: {
      color: Colors.primaryContent,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: 8,
      paddingBottom: 8,
    },
    emptyList: {
      flexGrow: 1,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderRadius: 20,
      padding: Spacing.md,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    messageUserButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.primary,
      backgroundColor: Colors.primary,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    messageUserButtonText: {
      color: Colors.primaryContent,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    connectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#6366F1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    connectButtonText: {
      color: '#6366F1',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    unfriendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239,68,68,0.1)',
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    unfriendButtonText: {
      color: '#ef4444',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    avatarContainer: {
      position: 'relative',
      marginRight: Spacing.md,
    },
    avatar: {
      width: 62,
      height: 62,
      borderRadius: BorderRadius.full,
    },
    avatarGradient: {
      width: 62,
      height: 62,
      borderRadius: BorderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: '#ffffff',
    },
    roleBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 20,
      height: 20,
      borderRadius: BorderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: Colors.surface,
    },
    userInfo: {
      flex: 1,
      gap: 4,
    },
    userName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: 2,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    infoText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      flex: 1,
    },
    bio: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      lineHeight: 18,
      marginTop: 2,
    },
    footerLoader: {
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginTop: Spacing.md,
    },
    emptySubtext: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.xs,
    },
  });
