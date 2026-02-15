// ================================================
// PHASE 5: ALL USERS DISCOVERY SCREEN
// ================================================
// Browse and discover users with search and filters
// Features: Search by name, filter by role, pagination, premium cards
// ================================================

import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../api/supabase';
import { Profile } from '../../types/database';

type AllUsersScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const USERS_PER_PAGE = 20;

const ROLE_FILTERS = [
  { label: 'All', value: null },
  { label: 'Students', value: 'student' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Alumni', value: 'alumni' },
];

export default function AllUsersScreen() {
  const navigation = useNavigation<AllUsersScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  // State
  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadUsers(true);
  }, [searchQuery, selectedRole]);

  // =====================================
  // DATA LOADING
  // =====================================

  const loadUsers = async (reset: boolean = false) => {
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

      // Build query
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .neq('id', user?.id || '') // Exclude current user
        .order('created_at', { ascending: false })
        .range(from, to);

      // Apply role filter
      if (selectedRole) {
        query = query.eq('role', selectedRole);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        query = query.or(`full_name.ilike.%${searchQuery.trim()}%,email.ilike.%${searchQuery.trim()}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const newUsers = data || [];
      
      if (reset) {
        setUsers(newUsers);
      } else {
        setUsers(prev => [...prev, ...newUsers]);
      }

      // Check if there are more users to load
      setHasMore(newUsers.length === USERS_PER_PAGE);
      
      if (!reset) {
        setPage(currentPage + 1);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadUsers(false);
    }
  };

  // =====================================
  // RENDER HELPERS
  // =====================================

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase();
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'student': return Colors.info;
      case 'faculty': return Colors.warning;
      case 'alumni': return Colors.success;
      case 'admin': return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'student': return 'school';
      case 'faculty': return 'person';
      case 'alumni': return 'verified';
      case 'admin': return 'admin-panel-settings';
      default: return 'person-outline';
    }
  };

  const renderUserCard = ({ item }: { item: Profile }) => {
    const roleColor = getRoleColor(item.role);

    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <LinearGradient
              colors={Colors.gradients.softMesh as any}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>{getInitials(item.full_name)}</Text>
            </LinearGradient>
          )}
          
          {/* Role Badge */}
          <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
            <MaterialIcons name={getRoleIcon(item.role) as any} size={12} color="#ffffff" />
          </View>
        </View>

        {/* User Info */}
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.full_name || 'Unknown User'}
          </Text>
          
          {item.department && (
            <View style={styles.infoRow}>
              <MaterialIcons name="business" size={14} color={Colors.textSecondary} />
              <Text style={styles.infoText} numberOfLines={1}>
                {item.department}
              </Text>
            </View>
          )}

          {item.year && item.role === 'student' && (
            <View style={styles.infoRow}>
              <MaterialIcons name="calendar-today" size={14} color={Colors.textSecondary} />
              <Text style={styles.infoText}>Year {item.year}</Text>
            </View>
          )}

          {item.bio && (
            <Text style={styles.bio} numberOfLines={2}>
              {item.bio}
            </Text>
          )}

          {/* Skills Preview */}
          {item.skills && item.skills.length > 0 && (
            <View style={styles.skillsPreview}>
              {item.skills.slice(0, 3).map((skill, index) => (
                <View key={index} style={styles.skillTag}>
                  <Text style={styles.skillTagText}>{skill}</Text>
                </View>
              ))}
              {item.skills.length > 3 && (
                <Text style={styles.moreSkills}>+{item.skills.length - 3}</Text>
              )}
            </View>
          )}
        </View>

        {/* Chevron */}
        <MaterialIcons name="chevron-right" size={24} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role Filters */}
      <View style={styles.filtersContainer}>
        {ROLE_FILTERS.map((filter) => {
          const isSelected = filter.value === selectedRole;
          return (
            <TouchableOpacity
              key={filter.label}
              style={[
                styles.filterChip,
                isSelected && styles.filterChipActive,
              ]}
              onPress={() => setSelectedRole(filter.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isSelected && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Results Count */}
      <Text style={styles.resultsCount}>
        {users.length} user{users.length !== 1 ? 's' : ''} found
      </Text>
    </View>
  );

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
          {searchQuery || selectedRole 
            ? 'Try adjusting your search or filters' 
            : 'Be the first to explore!'}
        </Text>
      </View>
    );
  };

  // =====================================
  // RENDER
  // =====================================

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Discover Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUserCard}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={users.length === 0 ? styles.emptyList : styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />
      )}
    </SafeAreaView>
  );
}

// =====================================
// STYLES
// =====================================

const createStyles = (Colors: any, isDark: boolean) =>
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerContainer: {
      padding: Spacing.md,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: Spacing.md,
    },
    searchInput: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginLeft: Spacing.sm,
    },
    filtersContainer: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.surface,
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
      color: '#ffffff',
    },
    resultsCount: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
    },
    listContent: {
      paddingHorizontal: Spacing.md,
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
      ...Shadows.sm,
    },
    avatarContainer: {
      position: 'relative',
      marginRight: Spacing.md,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: BorderRadius.full,
    },
    avatarGradient: {
      width: 64,
      height: 64,
      borderRadius: BorderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: FontSizes.xl,
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
    skillsPreview: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 4,
    },
    skillTag: {
      backgroundColor: Colors.primary + '15',
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    skillTagText: {
      fontSize: FontSizes.xs,
      color: Colors.primary,
      fontWeight: FontWeights.medium,
    },
    moreSkills: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      fontWeight: FontWeights.medium,
      alignSelf: 'center',
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
