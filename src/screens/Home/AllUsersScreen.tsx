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
import Toast from 'react-native-toast-message';

type AllUsersScreenNavigationProp = StackNavigationProp<RootStackParamList>;
type AllUsersScreenRouteProp = RouteProp<RootStackParamList, 'AllUsers'>;

const USERS_PER_PAGE = 20;
const MIN_REALTIME_SEARCH_LENGTH = 2;

const ROLE_FILTERS = [
  { label: 'All', value: null },
  { label: 'Students', value: 'student' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Alumni', value: 'alumni' },
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
  const [isRealtimeSearch, setIsRealtimeSearch] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(
    async (reset: boolean = false, overrideSearch?: string) => {
      try {
        if (reset) {
          setIsLoading(true);
          setPage(0);
          setHasMore(true);
        } else {
          setIsLoadingMore(true);
        }

        const currentPage = reset ? 0 : page;
        const from = currentPage * USERS_PER_PAGE;
        const to = from + USERS_PER_PAGE - 1;
        const querySearch = (overrideSearch ?? activeSearch).trim();

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
        if (!reset) {
          setPage(currentPage + 1);
        }
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeSearch, page, selectedRole, user?.id]
  );

  useEffect(() => {
    loadUsers(true);
  }, [selectedRole]);

  useEffect(() => {
    if (!isRealtimeSearch) return;

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
  }, [searchInput, isRealtimeSearch, loadUsers]);

  const submitSearch = () => {
    const trimmed = searchInput.trim();
    setActiveSearch(trimmed);
    loadUsers(true, trimmed);
  };

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

  const resultsSummary = useMemo(() => {
    if (activeSearch.trim()) {
      return `${users.length} results for "${activeSearch}"`;
    }
    return `${users.length} users found`;
  }, [activeSearch, users.length]);

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase();
  };

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

  const renderUserCard = ({ item }: { item: Profile }) => {
    const roleColor = getRoleColor(item.role);

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
              <Text style={styles.avatarText}>{getInitials(item.full_name)}</Text>
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
        ) : (
          <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
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
            onSubmitEditing={() => {
              Keyboard.dismiss();
              submitSearch();
            }}
          />
          {searchInput.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.searchActionsRow}>
          <TouchableOpacity
            style={[styles.searchActionChip, isRealtimeSearch && styles.searchActionChipActive]}
            onPress={() => setIsRealtimeSearch((prev) => !prev)}
          >
            <MaterialIcons
              name={isRealtimeSearch ? 'flash-on' : 'flash-off'}
              size={14}
              color={isRealtimeSearch ? Colors.primaryContent : Colors.textSecondary}
            />
            <Text
              style={[
                styles.searchActionText,
                isRealtimeSearch && styles.searchActionTextActive,
              ]}
            >
              Realtime
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.searchButton} onPress={submitSearch}>
            <MaterialIcons name="search" size={16} color={Colors.primaryContent} />
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filtersContainer}>
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
        </View>

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
          keyExtractor={(item) => item.id}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={users.length === 0 ? styles.emptyList : styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
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
      paddingBottom: Spacing.sm,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      gap: Spacing.sm,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.background,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      gap: Spacing.xs,
    },
    searchInput: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginLeft: Spacing.xs,
    },
    searchActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    filtersContainer: {
      flexDirection: 'row',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    filterChipActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    filterChipText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
      color: Colors.text,
    },
    filterChipTextActive: {
      color: Colors.primaryContent,
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
      paddingTop: Spacing.md,
      paddingBottom: Spacing.xl,
    },
    emptyList: {
      flexGrow: 1,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
      ...Shadows.sm,
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
