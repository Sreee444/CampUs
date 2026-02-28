import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Platform, FlatList, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAllUsers, changeUserRole, toggleUserBan, getActiveBans, insertAdminLog } from '../../api/admin';
import { Profile, UserBan } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { RootStackParamList } from '../../navigation/types';
import Toast from 'react-native-toast-message';

type NavProp = StackNavigationProp<RootStackParamList>;

const BAN_DURATIONS = [
  { label: '1 Day', value: 1 },
  { label: '7 Days', value: 7 },
  { label: '30 Days', value: 30 },
  { label: 'Permanent', value: null },
];

const Page_SIZE = 20;

export default function AdminUsersScreen() {
  const navigation = useNavigation<NavProp>();
  const { isDark } = useTheme();
  const { user, profile: adminProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [users, setUsers] = useState<Profile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [bannedIds, setBannedIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // User action modal
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  // Ban config modal
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDays, setBanDays] = useState<number | null>(7);

  const isAdmin = adminProfile?.role === 'admin';
  const isFaculty = adminProfile?.role === 'faculty';

  const loadUsers = useCallback(async (p = 0, reset = false) => {
    try {
      if (p === 0) setIsLoading(true); else setIsLoadingMore(true);

      const [usersData, bans] = await Promise.all([
        getAllUsers({ role: selectedRole ?? undefined }),
        getActiveBans(),
      ]);

      const paginated = usersData.slice(0, (p + 1) * Page_SIZE);
      if (reset) {
        setUsers(paginated);
        setFilteredUsers(paginated);
      } else {
        setUsers(paginated);
        setFilteredUsers(paginated);
      }
      setHasMore(usersData.length > (p + 1) * Page_SIZE);
      setBannedIds(bans.map((b: UserBan) => b.user_id));
      setPage(p);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to load users' });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [selectedRole]);

  useEffect(() => { loadUsers(0, true); }, [selectedRole]);

  // Client-side search filter
  useEffect(() => {
    if (!searchQuery) { setFilteredUsers(users); return; }
    const q = searchQuery.toLowerCase();
    setFilteredUsers(users.filter(u =>
      u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    ));
  }, [searchQuery, users]);

  const handleChangeRole = async (u: Profile, newRole: string) => {
    if (!user?.id) return;
    try {
      setIsProcessing(true);
      await changeUserRole(u.id, newRole as any);
      await insertAdminLog(user.id, 'role_change', u.id, { from: u.role, to: newRole });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole as any } : x));
      Toast.show({ type: 'success', text1: 'Role updated', text2: `${u.full_name} is now ${newRole}` });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to update role' });
    } finally {
      setIsProcessing(false);
    }
  };

  const openBanModal = () => {
    setBanReason('');
    setBanDays(7);
    setShowUserModal(false);
    setShowBanModal(true);
  };

  const handleConfirmBan = async () => {
    if (!selectedUser || !user?.id) return;
    if (!banReason.trim()) {
      Toast.show({ type: 'error', text1: 'Ban reason is required' });
      return;
    }

    const isBanned = bannedIds.includes(selectedUser.id);

    try {
      setIsProcessing(true);
      let banUntil: string | undefined;
      if (!isBanned && banDays !== null) {
        banUntil = new Date(Date.now() + banDays * 24 * 60 * 60 * 1000).toISOString();
      }

      const result = await toggleUserBan(
        selectedUser.id,
        user.id,
        banReason.trim(),
        banUntil,
      );

      if (result.action === 'banned') {
        setBannedIds(prev => [...prev, selectedUser.id]);
        await insertAdminLog(user.id, 'ban_user', selectedUser.id, {
          reason: banReason.trim(),
          duration: banDays === null ? 'permanent' : `${banDays}d`,
          ban_until: banUntil,
        });
        Toast.show({ type: 'success', text1: 'User banned', text2: `${selectedUser.full_name}` });
      } else {
        setBannedIds(prev => prev.filter(id => id !== selectedUser.id));
        await insertAdminLog(user.id, 'unban_user', selectedUser.id, {});
        Toast.show({ type: 'success', text1: 'User unbanned', text2: `${selectedUser.full_name}` });
      }

      setShowBanModal(false);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Ban action failed', text2: err?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const UserRow = React.memo(({ item }: { item: Profile }) => {
    const isBanned = bannedIds.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.userCard, { backgroundColor: Colors.surface }, isBanned && styles.bannedCard]}
        onPress={() => { setSelectedUser(item); setShowUserModal(true); }}
        activeOpacity={0.7}
      >
        <UserAvatar uri={item.avatar_url} name={item.full_name} size={46} role={item.role} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.userName, { color: Colors.text }]}>{item.full_name || item.email}</Text>
          <Text style={[styles.userMeta, { color: Colors.textSecondary }]}>
            {item.role.toUpperCase()} • {item.department ?? 'No dept'}
          </Text>
          {isBanned && <Text style={styles.bannedBadge}>🔒 BANNED</Text>}
        </View>
        <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: Colors.text }]}>User Management</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <MaterialIcons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: Colors.text }]}
          placeholder="Search by name or email"
          placeholderTextColor={Colors.textSecondary}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => setSearchQuery(searchInput.trim())}
          returnKeyType="search"
        />
        {!!searchInput && (
          <TouchableOpacity onPress={() => { setSearchInput(''); setSearchQuery(''); }}>
            <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
        {['All', 'student', 'faculty', 'alumni', 'admin'].map((r) => {
          const active = (selectedRole === null && r === 'All') || selectedRole === r;
          return (
            <TouchableOpacity
              key={r}
              style={[styles.roleChip, active && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
              onPress={() => setSelectedRole(r === 'All' ? null : r)}
            >
              <Text style={[styles.roleChipText, { color: active ? '#fff' : Colors.text }]}>
                {r === 'All' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow item={item} />}
          contentContainerStyle={styles.listContent}
          onEndReached={() => { if (hasMore && !isLoadingMore) loadUsers(page + 1); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color={Colors.primary} style={{ margin: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="person-off" size={44} color={Colors.textSecondary} />
              <Text style={[styles.emptyText, { color: Colors.textSecondary }]}>No users found</Text>
            </View>
          }
        />
      )}

      {/* User Action Modal */}
      <Modal visible={showUserModal} transparent animationType="slide" onRequestClose={() => setShowUserModal(false)}>
        <View style={styles.sheet}>
          <View style={[styles.sheetContent, { backgroundColor: Colors.surface }]}>
            {selectedUser && (
              <>
                <View style={styles.sheetHeader}>
                  <UserAvatar uri={selectedUser.avatar_url} name={selectedUser.full_name} size={44} role={selectedUser.role} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.sheetTitle, { color: Colors.text }]}>{selectedUser.full_name}</Text>
                    <Text style={[styles.sheetSub, { color: Colors.textSecondary }]}>{selectedUser.email}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowUserModal(false)}>
                    <MaterialIcons name="close" size={22} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView>
                  {selectedUser.id === user?.id ? (
                    /* ── Self-view notice ── */
                    <View style={[styles.selfNotice, { backgroundColor: Colors.primary + '18', borderColor: Colors.primary + '40' }]}>
                      <MaterialIcons name="manage-accounts" size={22} color={Colors.primary} />
                      <Text style={[styles.selfNoticeText, { color: Colors.primary }]}>
                        This is your account. You cannot modify or ban yourself.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Change Role */}
                      <Text style={[styles.sheetSectionLabel, { color: Colors.textSecondary }]}>Change Role</Text>
                      <View style={styles.roleGrid}>
                        {['student', 'faculty', 'alumni', 'admin'].map((role) => (
                          <TouchableOpacity
                            key={role}
                            style={[
                              styles.roleButton,
                              { borderColor: Colors.border, backgroundColor: Colors.background },
                              selectedUser.role === role && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                            ]}
                            onPress={() => handleChangeRole(selectedUser, role)}
                            disabled={isProcessing}
                          >
                            <Text style={[styles.roleButtonText, { color: selectedUser.role === role ? '#fff' : Colors.text }]}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* View Profile */}
                      <TouchableOpacity
                        style={[styles.actionRow, { backgroundColor: Colors.background }]}
                        onPress={() => { setShowUserModal(false); navigation.navigate('PublicProfile', { userId: selectedUser.id }); }}
                      >
                        <MaterialIcons name="person" size={20} color={Colors.primary} />
                        <Text style={[styles.actionRowText, { color: Colors.text }]}>View Profile</Text>
                        <MaterialIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      {/* Ban / Unban — admin only, NOT self */}
                      {isAdmin && selectedUser.id !== user?.id && (
                        bannedIds.includes(selectedUser.id) ? (
                          <TouchableOpacity
                            style={[styles.banBtn, styles.unbanBtn]}
                            onPress={openBanModal}
                            disabled={isProcessing}
                          >
                            <MaterialIcons name="person-add" size={18} color="#fff" />
                            <Text style={styles.banBtnText}>Unban User</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.banBtn, styles.doBanBtn]}
                            onPress={openBanModal}
                            disabled={isProcessing}
                          >
                            <MaterialIcons name="block" size={18} color="#fff" />
                            <Text style={styles.banBtnText}>Ban User</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Ban Configuration Modal */}
      <Modal visible={showBanModal} transparent animationType="fade" onRequestClose={() => setShowBanModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.banModal, { backgroundColor: Colors.surface }]}>
            <Text style={[styles.banModalTitle, { color: Colors.text }]}>
              {selectedUser && bannedIds.includes(selectedUser.id) ? 'Unban User' : 'Ban User'}
            </Text>
            {selectedUser && bannedIds.includes(selectedUser.id) ? (
              <Text style={[styles.banModalSub, { color: Colors.textSecondary }]}>
                Remove all active bans for {selectedUser?.full_name}?
              </Text>
            ) : (
              <>
                <Text style={[styles.banModalSub, { color: Colors.textSecondary }]}>
                  You are banning: {selectedUser?.full_name}
                </Text>

                <Text style={[styles.banModalLabel, { color: Colors.text }]}>Reason *</Text>
                <TextInput
                  style={[styles.banReasonInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                  placeholder="State the reason for this ban..."
                  placeholderTextColor={Colors.textSecondary}
                  value={banReason}
                  onChangeText={setBanReason}
                  multiline
                />

                <Text style={[styles.banModalLabel, { color: Colors.text }]}>Duration</Text>
                <View style={styles.durationGrid}>
                  {BAN_DURATIONS.map((d) => (
                    <TouchableOpacity
                      key={d.label}
                      style={[
                        styles.durationChip,
                        { borderColor: Colors.border, backgroundColor: Colors.background },
                        banDays === d.value && { backgroundColor: '#ef4444', borderColor: '#ef4444' },
                      ]}
                      onPress={() => setBanDays(d.value)}
                    >
                      <Text style={[styles.durationChipText, { color: banDays === d.value ? '#fff' : Colors.text }]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.banActions}>
              <TouchableOpacity
                style={[styles.banActionBtn, { borderColor: Colors.border, borderWidth: 1 }]}
                onPress={() => setShowBanModal(false)}
              >
                <Text style={[styles.banActionText, { color: Colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.banActionBtn, { backgroundColor: bannedIds.includes(selectedUser?.id ?? '') ? '#10b981' : '#ef4444' }]}
                onPress={handleConfirmBan}
                disabled={isProcessing}
              >
                {isProcessing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.banActionText, { color: '#fff' }]}>Confirm</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.md, marginVertical: 10, paddingHorizontal: 12, borderRadius: BorderRadius.lg, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: FontSizes.sm },
  roleScroll: { paddingHorizontal: Spacing.md, marginBottom: 8 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginRight: 8 },
  roleChipText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyText: { fontSize: FontSizes.md },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: 24 },
  userCard: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  bannedCard: { borderColor: '#ef4444', opacity: 0.7 },
  userName: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  userMeta: { fontSize: FontSizes.xs, marginTop: 2 },
  bannedBadge: { fontSize: 11, color: '#ef4444', fontWeight: '700', marginTop: 2 },
  // Sheet
  sheet: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  sheetSub: { fontSize: FontSizes.xs, marginTop: 2 },
  sheetSectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roleButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: BorderRadius.lg, borderWidth: 1, minWidth: '45%', alignItems: 'center' },
  roleButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: BorderRadius.lg, gap: 10, marginBottom: 8 },
  actionRowText: { flex: 1, fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
  banBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: BorderRadius.lg, gap: 8, marginTop: 4, marginBottom: 24 },
  doBanBtn: { backgroundColor: '#ef4444' },
  unbanBtn: { backgroundColor: '#10b981' },
  banBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  // Ban modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  banModal: { width: '100%', borderRadius: 20, padding: 20, gap: 10 },
  banModalTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  banModalSub: { fontSize: FontSizes.sm },
  banModalLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  banReasonInput: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: FontSizes.sm },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: BorderRadius.full, borderWidth: 1 },
  durationChipText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  banActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  banActionBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.lg, alignItems: 'center' },
  banActionText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  selfNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, padding: 14, borderRadius: BorderRadius.lg, borderWidth: 1 },
  selfNoticeText: { flex: 1, fontSize: FontSizes.sm, fontWeight: FontWeights.medium, lineHeight: 20 },
});
