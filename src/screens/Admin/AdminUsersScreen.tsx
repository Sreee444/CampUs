import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Platform,
  FlatList,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAllUsers, changeUserRole, toggleUserBan, getActiveBans } from '../../api/admin';
import { Profile, UserBan } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';

export default function AdminUsersScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [users, setUsers] = useState<Profile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [bannedIds, setBannedIds] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, selectedRole]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const [usersData, bans] = await Promise.all([getAllUsers(), getActiveBans()]);
      setUsers(usersData);
      setBannedIds(bans.map((b) => b.user_id));
      filterUsers();
    } catch (error) {
      console.error('Error loading users:', error);
      Toast.show({ type: 'error', text1: 'Failed to load users' });
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query)
      );
    }

    if (selectedRole) {
      filtered = filtered.filter((u) => u.role === selectedRole);
    }

    setFilteredUsers(filtered);
  };

  const handleChangeRole = async (user: Profile, newRole: string) => {
    try {
      setIsProcessing(true);
      await changeUserRole(user.id, newRole as any);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole as any } : u))
      );
      Toast.show({
        type: 'success',
        text1: 'Role Updated',
        text2: `${user.full_name} is now a ${newRole}`,
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to update role' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleBan = async (user: Profile) => {
    try {
      setIsProcessing(true);
      await toggleUserBan(user.id, 'admin-system', 'Admin action');
      setBannedIds((prev) =>
        prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
      );
      Toast.show({
        type: 'success',
        text1: bannedIds.includes(user.id) ? 'Unbanned' : 'Banned',
        text2: `${user.full_name} has been ${bannedIds.includes(user.id) ? 'unbanned' : 'banned'}`,
      });
      setModalVisible(false);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to update ban status' });
    } finally {
      setIsProcessing(false);
    }
  };

  const renderUserItem = ({ item }: { item: Profile }) => {
    const isBanned = bannedIds.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.userCard, isBanned && styles.bannedCard]}
        onPress={() => {
          setSelectedUser(item);
          setModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.userInfo}>
          <UserAvatar uri={item.avatar_url} name={item.full_name} size={48} role={item.role} />
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{item.full_name || item.email}</Text>
            <Text style={styles.userMeta}>
              {item.role.toUpperCase()} • {item.department || 'N/A'}
            </Text>
            {isBanned && <Text style={styles.bannedBadge}>🔒 BANNED</Text>}
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>User Management</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Role Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {['All', 'student', 'faculty', 'alumni', 'admin'].map((role) => (
          <TouchableOpacity
            key={role}
            style={[
              styles.filterChip,
              (selectedRole === null && role === 'All') || selectedRole === role
                ? styles.filterChipActive
                : null,
            ]}
            onPress={() => setSelectedRole(role === 'All' ? null : role)}
          >
            <Text
              style={[
                styles.filterChipText,
                (selectedRole === null && role === 'All') || selectedRole === role
                  ? styles.filterChipTextActive
                  : null,
              ]}
            >
              {role === 'All' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Users List */}
      <FlatList
        data={filteredUsers}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="person-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      {/* User Details Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}>
            {selectedUser && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedUser.full_name}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <MaterialIcons name="close" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Email</Text>
                    <Text style={styles.modalValue}>{selectedUser.email}</Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Current Role</Text>
                    <Text style={styles.modalValue}>{selectedUser.role.toUpperCase()}</Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Change Role</Text>
                    <View style={styles.roleButtons}>
                      {['student', 'faculty', 'alumni', 'admin'].map((role) => (
                        <TouchableOpacity
                          key={role}
                          style={[
                            styles.roleButton,
                            selectedUser.role === role && styles.roleButtonActive,
                          ]}
                          onPress={() => handleChangeRole(selectedUser, role)}
                          disabled={isProcessing}
                        >
                          <Text
                            style={[
                              styles.roleButtonText,
                              selectedUser.role === role && styles.roleButtonTextActive,
                            ]}
                          >
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        bannedIds.includes(selectedUser.id)
                          ? styles.actionButtonUnban
                          : styles.actionButtonBan,
                      ]}
                      onPress={() => handleToggleBan(selectedUser)}
                      disabled={isProcessing}
                    >
                      <MaterialIcons
                        name={bannedIds.includes(selectedUser.id) ? 'person-add' : 'block'}
                        size={20}
                        color="#fff"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.actionButtonText}>
                        {bannedIds.includes(selectedUser.id) ? 'Unban User' : 'Ban User'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      marginHorizontal: Spacing.md,
      marginVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    searchInput: {
      flex: 1,
      paddingVertical: Spacing.md,
      marginLeft: Spacing.sm,
      fontSize: FontSizes.sm,
      color: Colors.text,
    },
    filterScroll: {
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
      marginRight: Spacing.sm,
    },
    filterChipActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    filterChipText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    filterChipTextActive: {
      color: '#fff',
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.lg,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    bannedCard: {
      opacity: 0.6,
      borderColor: '#ef4444',
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: Spacing.md,
    },
    userDetails: {
      flex: 1,
    },
    userName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    userMeta: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 4,
    },
    bannedBadge: {
      fontSize: FontSizes.xs,
      color: '#ef4444',
      fontWeight: FontWeights.bold,
      marginTop: 4,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
    },
    emptyText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      marginTop: Spacing.md,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      maxHeight: '90%',
      paddingTop: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    modalBody: {
      padding: Spacing.md,
    },
    modalSection: {
      marginBottom: Spacing.lg,
    },
    modalLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    modalValue: {
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    roleButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    roleButton: {
      flex: 0.48,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
    },
    roleButtonActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    roleButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    roleButtonTextActive: {
      color: '#fff',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
    },
    actionButtonBan: {
      backgroundColor: '#ef4444',
    },
    actionButtonUnban: {
      backgroundColor: '#10b981',
    },
    actionButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#fff',
    },
  });
