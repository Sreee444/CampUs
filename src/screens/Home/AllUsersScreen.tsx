import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/types';
import { BorderRadius, FontSizes, FontWeights, getColors, Shadows, Spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { Profile } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';

type AllUsersScreenNavigationProp = StackNavigationProp<RootStackParamList>;

type RoleFilter = 'all' | 'student' | 'faculty' | 'alumni' | 'admin';
type SortOption = 'recent' | 'name' | 'active';

type DiscoverUser = Profile & {
  is_connected?: boolean;
};

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 280;

const ROLE_OPTIONS: Array<{ label: string; value: RoleFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Students', value: 'student' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Alumni', value: 'alumni' },
  { label: 'Admin', value: 'admin' },
];

const SORT_OPTIONS: Array<{ label: string; value: SortOption; icon: keyof typeof MaterialIcons.glyphMap }> = [
  { label: 'Recent', value: 'recent', icon: 'schedule' },
  { label: 'A-Z', value: 'name', icon: 'sort-by-alpha' },
  { label: 'Active', value: 'active', icon: 'bolt' },
];

export default function AllUsersScreen() {
  const navigation = useNavigation<AllUsersScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('recent');

  const [nextPage, setNextPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(
    async (options?: { reset?: boolean; refreshing?: boolean }) => {
      if (!user?.id) return;

      const reset = !!options?.reset;
      const refreshing = !!options?.refreshing;
      const pageToLoad = reset ? 0 : nextPage;
      const from = pageToLoad * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        if (refreshing) {
          setIsRefreshing(true);
        } else if (reset) {
          setIsLoading(true);
        } else {
          setIsLoadingMore(true);
        }

        let query = supabase
          .from('profiles')
          .select('*')
          .neq('id', user.id)
          .range(from, to);

        if (selectedRole !== 'all') {
          query = query.eq('role', selectedRole);
        }

        if (searchQuery.trim()) {
          const keyword = searchQuery.trim();
          query = query.or(
            `full_name.ilike.%${keyword}%,email.ilike.%${keyword}%,department.ilike.%${keyword}%,bio.ilike.%${keyword}%`
          );
        }

        if (selectedSort === 'name') {
          query = query.order('full_name', { ascending: true, nullsFirst: false });
        } else if (selectedSort === 'active') {
          query = query.order('last_active', { ascending: false, nullsFirst: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query;
        if (error) throw error;

        const fetched = (data || []) as DiscoverUser[];

        setUsers((prev) => (reset ? fetched : [...prev, ...fetched]));
        setHasMore(fetched.length === PAGE_SIZE);
        setNextPage(pageToLoad + 1);
      } catch (error) {
        console.error('Discover users load error:', error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsRefreshing(false);
      }
    },
    [nextPage, searchQuery, selectedRole, selectedSort, user?.id]
  );

  useEffect(() => {
    loadUsers({ reset: true });
  }, [selectedRole, selectedSort, searchQuery]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput]);

  const onRefresh = async () => {
    setNextPage(0);
    setHasMore(true);
    await loadUsers({ reset: true, refreshing: true });
  };

  const handleEndReached = () => {
    if (!isLoadingMore && hasMore && !isLoading) {
      loadUsers();
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setSelectedRole('all');
    setSelectedSort('recent');
  };

  const roleCounts = useMemo(() => {
    return users.reduce(
      (acc, profile) => {
        if (profile.role && acc[profile.role as RoleFilter] !== undefined) {
          acc[profile.role as RoleFilter] += 1;
        }
        acc.all += 1;
        return acc;
      },
      { all: 0, student: 0, faculty: 0, alumni: 0, admin: 0 }
    );
  }, [users]);

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

  const renderUserCard = ({ item }: { item: DiscoverUser }) => {
    const roleColor = getRoleColor(item.role);
    const showSkills = item.skills && item.skills.length > 0;

    return (
      <TouchableOpacity
        style={styles.userCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
      >
        <UserAvatar uri={item.avatar_url} name={item.full_name || 'User'} size={58} showRing={false} />

        <View style={styles.userInfo}>
          <View style={styles.userHeaderRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.full_name || 'Unknown User'}
            </Text>
            <View style={[styles.rolePill, { borderColor: roleColor }]}> 
              <Text style={[styles.rolePillText, { color: roleColor }]}>{item.role || 'user'}</Text>
            </View>
          </View>

          <Text style={styles.userMeta} numberOfLines={1}>
            {item.department || 'No department'}
            {item.year && item.role === 'student' ? ` • Year ${item.year}` : ''}
          </Text>

          <Text style={styles.userBio} numberOfLines={2}>
            {item.bio || 'No bio yet'}
          </Text>

          {showSkills && (
            <View style={styles.skillsRow}>
              {item.skills!.slice(0, 3).map((skill) => (
                <View key={skill} style={styles.skillChip}>
                  <Text style={styles.skillChipText}>{skill}</Text>
                </View>
              ))}
              {item.skills!.length > 3 && (
                <Text style={styles.moreTag}>+{item.skills!.length - 3}</Text>
              )}
            </View>
          )}
        </View>

        <MaterialIcons name="chevron-right" size={22} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContentWrap}>
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search by name, email, department, bio"
          placeholderTextColor={Colors.textSecondary}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {!!searchInput && (
          <TouchableOpacity onPress={() => setSearchInput('')}>
            <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.roleFilterRow}
        data={ROLE_OPTIONS}
        keyExtractor={(item) => item.value}
        renderItem={({ item }) => {
          const active = selectedRole === item.value;
          const count = roleCounts[item.value];

          return (
            <TouchableOpacity
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setSelectedRole(item.value)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {item.label}
              </Text>
              <Text style={[styles.filterChipCount, active && styles.filterChipCountActive]}>{count}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
        data={SORT_OPTIONS}
        keyExtractor={(item) => item.value}
        renderItem={({ item }) => {
          const active = selectedSort === item.value;
          return (
            <TouchableOpacity
              style={[styles.sortChip, active && styles.sortChipActive]}
              onPress={() => setSelectedSort(item.value)}
            >
              <MaterialIcons
                name={item.icon}
                size={14}
                color={active ? Colors.primaryContent : Colors.textSecondary}
              />
              <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.resultRow}>
        <Text style={styles.resultText}>{users.length} users shown</Text>
        <TouchableOpacity onPress={clearFilters}>
          <Text style={styles.clearText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!isLoadingMore) return <View style={{ height: 12 }} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState}>
        <MaterialIcons name="manage-search" size={58} color={Colors.textSecondary} />
        <Text style={styles.emptyTitle}>No users found</Text>
        <Text style={styles.emptySubtext}>Try a different keyword, role, or sort option.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discover Users</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserCard}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={users.length ? styles.listContent : styles.emptyContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
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
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.background,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    headerSpacer: {
      width: 38,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerContentWrap: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      gap: Spacing.sm,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    roleFilterRow: {
      gap: Spacing.sm,
      paddingTop: Spacing.xs,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      backgroundColor: Colors.surface,
    },
    filterChipActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primarySoft,
    },
    filterChipText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    filterChipTextActive: {
      color: Colors.primaryContent,
    },
    filterChipCount: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.semibold,
    },
    filterChipCountActive: {
      color: Colors.primaryContent,
    },
    sortRow: {
      gap: Spacing.sm,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      backgroundColor: Colors.surface,
    },
    sortChipActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    sortChipText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    sortChipTextActive: {
      color: Colors.primaryContent,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    resultText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    clearText: {
      fontSize: FontSizes.sm,
      color: Colors.primary,
      fontWeight: FontWeights.semibold,
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.xl,
      gap: Spacing.sm,
    },
    emptyContent: {
      flexGrow: 1,
      paddingBottom: Spacing.xl,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.lg,
      padding: Spacing.sm,
      backgroundColor: Colors.surface,
      ...Shadows.sm,
    },
    userInfo: {
      flex: 1,
      gap: 2,
    },
    userHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    userName: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    rolePill: {
      borderWidth: 1,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
    },
    rolePillText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      textTransform: 'capitalize',
    },
    userMeta: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    userBio: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      lineHeight: 18,
    },
    skillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 4,
    },
    skillChip: {
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primarySoft,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
    },
    skillChipText: {
      fontSize: FontSizes.xs,
      color: Colors.primaryContent,
      fontWeight: FontWeights.medium,
    },
    moreTag: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    footerLoader: {
      paddingVertical: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.xs,
    },
    emptyTitle: {
      fontSize: FontSizes.lg,
      color: Colors.text,
      fontWeight: FontWeights.semibold,
      marginTop: Spacing.sm,
    },
    emptySubtext: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
  });
