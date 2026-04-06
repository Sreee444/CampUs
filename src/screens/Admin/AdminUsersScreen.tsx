import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Platform, FlatList, ActivityIndicator, Modal, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { banUser, changeUserRole, getActiveBans, getAllUsers, getUserActiveBan, insertAdminLog, unbanUser, updateUserProfileAdmin } from '../../api/admin';
import { supabase } from '../../api/supabase';
import { removeAvatar, uploadAvatar } from '../../api/auth';
import { Profile, UserBan } from '../../types/database';
import { UserAvatar } from '../../components/UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { RootStackParamList } from '../../navigation/types';
import Toast from 'react-native-toast-message';
import { formatFacultyDesignation, getDesignationOptionsByRole, isAdminRole, isLeadershipDesignation, stripNamePrefix } from '../../utils/roles';
import AdminHeader from '../../components/admin/AdminHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import DropdownSheet from '../../components/DropdownSheet';
import { DEPARTMENT_OPTIONS, getDepartmentAcademicLimits, getSectionOptions } from '../../constants/academic';

type NavProp = StackNavigationProp<RootStackParamList>;

const BAN_DURATIONS = [
  { label: '1 Day', value: 1 },
  { label: '7 Days', value: 7 },
  { label: '30 Days', value: 30 },
  { label: 'Permanent', value: null },
];

const ACADEMIC_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Graduated', value: 'graduated' },
];

const Page_SIZE = 20;
type RoleFilter = 'all' | 'student' | 'faculty' | 'alumni' | 'admin' | 'developer';
type UserModalTab = 'profile' | 'role' | 'safety';

type UserListFilters = {
  role: RoleFilter;
  department: string;
  year: string;
  semester: string;
  section: string;
};

const DEFAULT_USER_FILTERS: UserListFilters = {
  role: 'all',
  department: '',
  year: '',
  semester: '',
  section: '',
};

const AdminUserRow = React.memo(function AdminUserRow({
  item,
  isBanned,
  Colors,
  styles,
  onPress,
}: {
  item: Profile;
  isBanned: boolean;
  Colors: any;
  styles: any;
  onPress: (user: Profile) => void;
}) {
  const facultyDesignationLabel = item.faculty_designation ? formatFacultyDesignation(item.faculty_designation) : '';

  return (
    <TouchableOpacity
      style={[styles.userCard, { backgroundColor: Colors.surface }, isBanned && styles.bannedCard]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <UserAvatar uri={item.avatar_url} name={item.full_name} size={46} role={item.role} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[styles.userName, { color: Colors.text }]}>{item.full_name || item.email}</Text>
        <Text style={[styles.userMeta, { color: Colors.textSecondary }]}>
          {item.role.toUpperCase()} • {item.department ?? 'No dept'}
        </Text>
        {(item.role === 'faculty' || item.role === 'admin') && facultyDesignationLabel && (
          <Text style={[styles.userMeta, { color: Colors.textSecondary }]}>
            Designation: {facultyDesignationLabel}
          </Text>
        )}
        {isBanned && <Text style={styles.bannedBadge}>🔒 BANNED</Text>}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
});

export default function AdminUsersScreen() {
  const navigation = useNavigation<NavProp>();
  const { isDark } = useTheme();
  const { user, profile: adminProfile } = useAuth();
  const Colors = useMemo(() => getColors(isDark), [isDark]);
  const styles = useMemo(() => createStyles(Colors), [Colors]);

  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<UserListFilters>(DEFAULT_USER_FILTERS);
  const [draftFilters, setDraftFilters] = useState<UserListFilters>(DEFAULT_USER_FILTERS);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [showFilterDepartmentPicker, setShowFilterDepartmentPicker] = useState(false);
  const [showFilterYearPicker, setShowFilterYearPicker] = useState(false);
  const [showFilterSemesterPicker, setShowFilterSemesterPicker] = useState(false);
  const [showFilterSectionPicker, setShowFilterSectionPicker] = useState(false);
  const [bannedIds, setBannedIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // User action modal
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDays, setBanDays] = useState<number | null>(7);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editSpecialization, setEditSpecialization] = useState('');
  const [editRollNumber, setEditRollNumber] = useState('');
  const [editYearOfAdmission, setEditYearOfAdmission] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editBatch, setEditBatch] = useState('');
  const [editFacultyDesignation, setEditFacultyDesignation] = useState('');
  const [editAcademicStatus, setEditAcademicStatus] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editInterests, setEditInterests] = useState('');
  const [showRemoveAvatarConfirm, setShowRemoveAvatarConfirm] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [showEditYearPicker, setShowEditYearPicker] = useState(false);
  const [showEditSemesterPicker, setShowEditSemesterPicker] = useState(false);
  const [showEditSectionPicker, setShowEditSectionPicker] = useState(false);
  const [showEditAcademicStatusPicker, setShowEditAcademicStatusPicker] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<UserModalTab>('profile');
  const [designationOwners, setDesignationOwners] = useState<Record<string, string>>({});
  const [pendingRole, setPendingRole] = useState<string>('');


  const showToastAboveModal = (payload: { type: 'success' | 'error' | 'info'; text1: string; text2?: string }) => {
    setShowUserModal(false);
    setShowBanModal(false);
    setTimeout(() => Toast.show(payload), 120);
  };

  const isAdmin = isAdminRole(adminProfile?.role);

  const normalize = (value: any) => String(value ?? '').trim().toLowerCase();

  const activeFilterCount = [
    activeFilters.role !== 'all',
    !!activeFilters.department,
    !!activeFilters.year,
    !!activeFilters.semester,
    !!activeFilters.section,
  ].filter(Boolean).length;

  const filterLimits = React.useMemo(
    () => getDepartmentAcademicLimits(draftFilters.department || activeFilters.department),
    [draftFilters.department, activeFilters.department]
  );

  const filterYearOptions = React.useMemo(
    () => Array.from({ length: filterLimits.maxYears }, (_, i) => String(i + 1)),
    [filterLimits.maxYears]
  );

  const filterSemesterOptions = React.useMemo(
    () => Array.from({ length: filterLimits.maxSemesters }, (_, i) => String(i + 1)),
    [filterLimits.maxSemesters]
  );

  const filterSectionOptions = React.useMemo(
    () => getSectionOptions(draftFilters.department || activeFilters.department),
    [draftFilters.department, activeFilters.department]
  );

  const editLimits = React.useMemo(
    () => getDepartmentAcademicLimits(editDept),
    [editDept]
  );

  const editYearOptions = React.useMemo(
    () => Array.from({ length: editLimits.maxYears }, (_, i) => String(i + 1)),
    [editLimits.maxYears]
  );

  const editSemesterOptions = React.useMemo(
    () => Array.from({ length: editLimits.maxSemesters }, (_, i) => String(i + 1)),
    [editLimits.maxSemesters]
  );

  const editSectionOptions = React.useMemo(
    () => getSectionOptions(editDept),
    [editDept]
  );


  const filteredDataset = React.useMemo(() => {
    const q = normalize(searchQuery);
    return allUsers.filter((u) => {
      if (activeFilters.role !== 'all' && u.role !== activeFilters.role) return false;
      if (activeFilters.department && normalize(u.department) !== normalize(activeFilters.department)) return false;
      if (activeFilters.year && String(u.year ?? '') !== activeFilters.year) return false;
      if (activeFilters.semester && String(u.semester ?? '') !== activeFilters.semester) return false;
      if (activeFilters.section && normalize(u.section) !== normalize(activeFilters.section)) return false;

      if (!q) return true;
      // Search by clean name (without prefixes), email, department, specialization, and batch
      const cleanName = stripNamePrefix(u.full_name);
      const haystack = [cleanName, u.email, u.department, u.specialization, u.batch]
        .map((value) => normalize(value))
        .join(' ');
      return haystack.includes(q);
    });
  }, [allUsers, activeFilters, searchQuery]);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);

      const [usersData, bans] = await Promise.all([
        getAllUsers(),
        getActiveBans(),
      ]);

      setAllUsers(usersData);
      setBannedIds(bans.map((b: UserBan) => b.user_id));
      setPage(0);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to load users' });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, activeFilters, allUsers]);

  useEffect(() => {
    const paginated = filteredDataset.slice(0, (page + 1) * Page_SIZE);
    setUsers(paginated);
    setFilteredUsers(paginated);
    setHasMore(filteredDataset.length > (page + 1) * Page_SIZE);
    setIsLoadingMore(false);
  }, [filteredDataset, page]);
  useEffect(() => {
    if (!selectedUser) return;
    setEditName(selectedUser.full_name ?? '');
    setEditPhone(String(selectedUser.phone ?? '').replace(/\D/g, '').slice(-10));
    setEditBio(selectedUser.bio ?? '');
    setEditDept(selectedUser.department ?? '');
    setEditSpecialization(selectedUser.specialization ?? '');
    setEditRollNumber(selectedUser.roll_number ?? '');
    setEditYearOfAdmission(selectedUser.year_of_admission ? String(selectedUser.year_of_admission) : '');
    setEditYear(selectedUser.year ? String(selectedUser.year) : '');
    setEditSemester(selectedUser.semester ? String(selectedUser.semester) : '');
    setEditSection(selectedUser.section ?? '');
    setEditBatch(selectedUser.batch ?? '');
    setEditFacultyDesignation(selectedUser.faculty_designation ? formatFacultyDesignation(selectedUser.faculty_designation) : '');
    setEditAcademicStatus(selectedUser.academic_status ?? '');
    setEditSkills((selectedUser.skills ?? []).join(', '));
    setEditInterests((selectedUser.interests ?? []).join(', '));
    setPendingRole(selectedUser.role);
    setActiveModalTab('profile');
  }, [selectedUser]);

  useEffect(() => {
    const loadDesignationOwners = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, faculty_designation')
        .in('faculty_designation', ['principal', 'vice_principal']);

      if (error) return;

      const owners: Record<string, string> = {};
      for (const row of data || []) {
        if (row?.faculty_designation && row?.id) {
          owners[row.faculty_designation] = row.id;
        }
      }
      setDesignationOwners(owners);
    };

    loadDesignationOwners();
  }, []);

  const parseCsvList = (value: string) => value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const parseOptionalInt = (value: string) => {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeDesignationInput = (value: string) =>
    String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  const normalizeIndianPhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 10);

  const summaryCards = [
    { label: 'Loaded', value: users.length, color: Colors.text },
    { label: 'Banned', value: users.filter((u) => bannedIds.includes(u.id)).length, color: '#ef4444' },
    { label: 'Student', value: users.filter((u) => u.role === 'student').length, color: '#3b82f6' },
    { label: 'Faculty', value: users.filter((u) => u.role === 'faculty').length, color: '#8b5cf6' },
    { label: 'Alumni', value: users.filter((u) => u.role === 'alumni').length, color: '#f59e0b' },
    { label: 'Admin', value: users.filter((u) => u.role === 'admin').length, color: Colors.primary },
    { label: 'Developer', value: users.filter((u) => u.role === 'developer').length, color: '#0f766e' },
  ];

  const applyDraftFilters = () => {
    setActiveFilters(draftFilters);
    setShowFiltersModal(false);
  };

  const resetAllFilters = () => {
    setActiveFilters(DEFAULT_USER_FILTERS);
    setDraftFilters(DEFAULT_USER_FILTERS);
  };

  const resetDraftFilters = () => {
    setDraftFilters(DEFAULT_USER_FILTERS);
  };


  const handleChangeRole = async (u: Profile, newRole: string) => {
    if (!user?.id) return;
    try {
      setIsProcessing(true);
      await changeUserRole(u.id, newRole as any);
      await insertAdminLog(user.id, 'role_change', u.id, { from: u.role, to: newRole });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole as any } : x));
      setFilteredUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole as any } : x));
      setSelectedUser(prev => (prev?.id === u.id ? { ...prev, role: newRole as any } : prev));
      showToastAboveModal({ type: 'success', text1: 'Role updated', text2: `${u.full_name} is now ${newRole}` });
    } catch (error: any) {
      console.error('Admin role change failed:', {
        targetUserId: u.id,
        from: u.role,
        to: newRole,
        error,
      });
      showToastAboveModal({ type: 'error', text1: 'Failed to update role' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveRoleChange = async () => {
    if (!selectedUser || !pendingRole || pendingRole === selectedUser.role) return;
    await handleChangeRole(selectedUser, pendingRole);
  };

  const handleAdminAvatarUpload = async () => {
    if (!selectedUser || !user?.id) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission required to access photos' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      setIsUploading(true);
      const publicUrl = await uploadAvatar(selectedUser.id, result.assets[0].uri);
      const updated = await updateUserProfileAdmin(selectedUser.id, { avatar_url: publicUrl } as any);
      await insertAdminLog(user.id, 'profile_edit' as any, selectedUser.id, { avatar_updated: true });
      setUsers(prev => prev.map(x => x.id === selectedUser.id ? { ...x, ...updated } : x));
      setFilteredUsers(prev => prev.map(x => x.id === selectedUser.id ? { ...x, ...updated } : x));
      setSelectedUser(prev => (prev?.id === selectedUser.id ? { ...prev, ...updated } : prev));
      showToastAboveModal({ type: 'success', text1: 'Avatar updated' });
    } catch (error: any) {
      showToastAboveModal({ type: 'error', text1: 'Failed to upload avatar', text2: error?.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdminAvatarRemove = async () => {
    if (!selectedUser || !user?.id) return;

    if (!selectedUser.avatar_url) {
      Toast.show({ type: 'info', text1: 'User has no avatar to remove' });
      return;
    }

    setShowRemoveAvatarConfirm(true);
  };

  const confirmAdminAvatarRemove = async () => {
    if (!selectedUser || !user?.id) return;

    try {
      setIsUploading(true);
      const removal = await removeAvatar(selectedUser.id, selectedUser.avatar_url);
      const updated = await updateUserProfileAdmin(selectedUser.id, { avatar_url: null } as any);
      await insertAdminLog(user.id, 'profile_edit' as any, selectedUser.id, { avatar_removed: true });
      setUsers(prev => prev.map(x => x.id === selectedUser.id ? { ...x, ...updated } : x));
      setFilteredUsers(prev => prev.map(x => x.id === selectedUser.id ? { ...x, ...updated } : x));
      setSelectedUser(prev => (prev?.id === selectedUser.id ? { ...prev, ...updated } : prev));
      setShowRemoveAvatarConfirm(false);
      showToastAboveModal({
        type: removal.warning ? 'info' : 'success',
        text1: removal.warning ? 'Avatar removed from profile' : 'Avatar removed',
        text2: removal.warning,
      });
    } catch (error: any) {
      showToastAboveModal({ type: 'error', text1: 'Failed to remove avatar', text2: error?.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfileEdits = async () => {
    if (!selectedUser || !user?.id) return;
    try {
      setIsProcessing(true);

      const isStudentRole = selectedUser.role === 'student';
      const isFacultyLikeRole = selectedUser.role === 'faculty' || selectedUser.role === 'admin';
      const isAlumniRole = selectedUser.role === 'alumni';
      const canEditAcademicCore = isStudentRole || isFacultyLikeRole || isAlumniRole;

      const trimmedSection = editSection.trim().toUpperCase();
      const sectionValue = ['A', 'B', 'C', 'D'].includes(trimmedSection) ? trimmedSection : null;

      const yearValue = parseOptionalInt(editYear);
      const semesterValue = parseOptionalInt(editSemester);
      const yearOfAdmissionValue = parseOptionalInt(editYearOfAdmission);

      const parsedSkills = parseCsvList(editSkills);
      const parsedInterests = parseCsvList(editInterests);
      const phoneDigits = normalizeIndianPhoneInput(editPhone);
      const normalizedDesignation = normalizeDesignationInput(editFacultyDesignation);

      if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
        showToastAboveModal({ type: 'error', text1: 'Invalid phone number', text2: 'Enter exactly 10 digits for India (+91).' });
        return;
      }

      const updates: any = {
        full_name: editName.trim() || null,
        phone: phoneDigits ? `+91${phoneDigits}` : null,
        bio: editBio.trim() || null,
        skills: parsedSkills,
        interests: parsedInterests,
      };

      if (canEditAcademicCore) {
        updates.department = editDept.trim() || null;
        updates.specialization = editSpecialization.trim() || null;
      }

      if (isStudentRole) {
        updates.roll_number = editRollNumber.trim() || null;
        updates.year_of_admission = yearOfAdmissionValue;
        updates.year = yearValue;
        updates.semester = semesterValue;
        updates.section = sectionValue;
      }

      if (isFacultyLikeRole) {
        const allowedDesignations = getDesignationOptionsByRole(selectedUser.role);

        if (normalizedDesignation && !allowedDesignations.includes(normalizedDesignation as any)) {
          showToastAboveModal({
            type: 'error',
            text1: 'Invalid designation',
            text2: `Allowed values: ${allowedDesignations.join(', ')}`,
          });
          return;
        }

        if (normalizedDesignation && isLeadershipDesignation(normalizedDesignation)) {
          const ownerId = designationOwners[normalizedDesignation];
          if (ownerId && ownerId !== selectedUser.id) {
            showToastAboveModal({
              type: 'error',
              text1: 'Designation already assigned',
              text2: `${formatFacultyDesignation(normalizedDesignation)} can be assigned to only one user.`,
            });
            return;
          }
        }
        updates.faculty_designation = normalizedDesignation || null;
      }

      if (isAlumniRole) {
        updates.academic_status = editAcademicStatus || null;
      }

      const updated = await updateUserProfileAdmin(selectedUser.id, updates);
      await insertAdminLog(user.id, 'role_change' as any, selectedUser.id, {
        action_type: 'profile_edit',
        fields: [
          'full_name', 'phone', 'bio', 'department', 'specialization', 'roll_number',
          'year_of_admission', 'year', 'semester', 'section',
          'faculty_designation', 'academic_status', 'skills', 'interests',
        ],
      });
      setUsers(prev => prev.map(x => x.id === selectedUser.id ? { ...x, ...updated } : x));
      setFilteredUsers(prev => prev.map(x => x.id === selectedUser.id ? { ...x, ...updated } : x));
      setSelectedUser(prev => (prev?.id === selectedUser.id ? { ...prev, ...updated } : prev));
      showToastAboveModal({ type: 'success', text1: 'Profile updated' });
    } catch (error: any) {
      console.error('Admin profile edit failed:', error);
      showToastAboveModal({ type: 'error', text1: 'Failed to update profile', text2: error?.message });
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
    const isBannedByUi = bannedIds.includes(selectedUser.id);

    if (!isBannedByUi && !banReason.trim()) {
      Toast.show({ type: 'error', text1: 'Ban reason is required' });
      return;
    }

    try {
      setIsProcessing(true);
      const activeBan = await getUserActiveBan(selectedUser.id);
      const isBanned = Boolean(activeBan);

      let banUntil: string | undefined;
      if (!isBanned && banDays !== null) {
        banUntil = new Date(Date.now() + banDays * 24 * 60 * 60 * 1000).toISOString();
      }

      if (!isBanned) {
        await banUser(selectedUser.id, user.id, banReason.trim(), banUntil);
        setBannedIds(prev => [...prev, selectedUser.id]);
        await insertAdminLog(user.id, 'ban_user', selectedUser.id, {
          reason: banReason.trim(),
          duration: banDays === null ? 'permanent' : `${banDays}d`,
          ban_until: banUntil,
        });
        showToastAboveModal({ type: 'success', text1: 'User banned', text2: `${selectedUser.full_name}` });
      } else {
        await unbanUser(selectedUser.id);
        setBannedIds(prev => prev.filter(id => id !== selectedUser.id));
        await insertAdminLog(user.id, 'unban_user', selectedUser.id, {});
        showToastAboveModal({ type: 'success', text1: 'User unbanned', text2: `${selectedUser.full_name}` });
      }

      setShowBanModal(false);
    } catch (err: any) {
      showToastAboveModal({ type: 'error', text1: 'Ban action failed', text2: err?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenUser = useCallback((item: Profile) => {
    setSelectedUser(item);
    setShowUserModal(true);
  }, []);

  const renderUserRow = useCallback(
    ({ item }: { item: Profile }) => (
      <AdminUserRow
        item={item}
        isBanned={bannedIds.includes(item.id)}
        Colors={Colors}
        styles={styles}
        onPress={handleOpenUser}
      />
    ),
    [bannedIds, Colors, styles, handleOpenUser]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="User Management"
        subtitle="Role assignment, profile access and ban controls"
        count={filteredUsers.length}
        onBack={() => navigation.goBack()}
        onRefresh={loadUsers}
      />

      <View style={styles.summaryRow}>
        {summaryCards.map((card) => (
          <View
            key={card.label}
            style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
          >
            <Text style={[styles.summaryLabel, { color: Colors.textSecondary }]}>{card.label}</Text>
            <Text style={[styles.summaryValue, { color: card.color }]}>{card.value}</Text>
          </View>
        ))}
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

      <View style={styles.filterActionRow}>
        <TouchableOpacity
          style={[styles.filterButton, { borderColor: Colors.border, backgroundColor: Colors.surface }]}
          onPress={() => {
            setDraftFilters(activeFilters);
            setShowFiltersModal(true);
          }}
        >
          <MaterialIcons name="filter-list" size={18} color={Colors.primary} />
          <Text style={[styles.filterButtonText, { color: Colors.text }]}>Filters</Text>
          {activeFilterCount > 0 && (
            <View style={[styles.filterCountBadge, { backgroundColor: Colors.primary }]}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {activeFilterCount > 0 && (
          <TouchableOpacity style={styles.clearFilterBtn} onPress={resetAllFilters}>
            <Text style={[styles.clearFilterText, { color: Colors.textSecondary }]}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item, index) => `${item?.id || 'user'}-${index}`}
          renderItem={renderUserRow}
          contentContainerStyle={styles.listContent}
          onEndReached={() => {
            if (hasMore && !isLoadingMore) {
              setIsLoadingMore(true);
              setPage((prev) => prev + 1);
            }
          }}
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
                      {/* Avatar Upload */}
                      <View style={styles.avatarEditSection}>
                        <TouchableOpacity
                          style={styles.avatarUploadWrap}
                          onPress={handleAdminAvatarUpload}
                          disabled={isUploading}
                          activeOpacity={0.8}
                        >
                          {selectedUser.avatar_url ? (
                            <Image source={{ uri: selectedUser.avatar_url }} style={styles.avatarUploadImg} />
                          ) : (
                            <View style={[styles.avatarUploadImg, styles.avatarUploadPlaceholder]}>
                              <Text style={styles.avatarUploadInitials}>
                                {(selectedUser.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                              </Text>
                            </View>
                          )}
                          <View style={styles.avatarCameraBadge}>
                            {isUploading
                              ? <ActivityIndicator size={12} color="#fff" />
                              : <MaterialIcons name="camera-alt" size={13} color="#fff" />}
                          </View>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 6 }}>
                          {isUploading ? 'Processing avatar...' : 'Tap photo to change'}
                        </Text>
                        <TouchableOpacity
                          style={styles.removeAvatarBtn}
                          onPress={handleAdminAvatarRemove}
                          disabled={isUploading || !selectedUser.avatar_url}
                        >
                          <MaterialIcons
                            name="delete-outline"
                            size={16}
                            color={selectedUser.avatar_url ? '#ef4444' : Colors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.removeAvatarText,
                              { color: selectedUser.avatar_url ? '#ef4444' : Colors.textSecondary },
                            ]}
                          >
                            Remove photo
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.modalTabs}>
                        <TouchableOpacity
                          style={[
                            styles.modalTab,
                            { borderColor: Colors.border, backgroundColor: Colors.background },
                            activeModalTab === 'profile' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                          ]}
                          onPress={() => setActiveModalTab('profile')}
                        >
                          <Text style={[styles.modalTabText, { color: activeModalTab === 'profile' ? '#fff' : Colors.text }]}>Profile</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.modalTab,
                            { borderColor: Colors.border, backgroundColor: Colors.background },
                            activeModalTab === 'role' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                          ]}
                          onPress={() => setActiveModalTab('role')}
                        >
                          <Text style={[styles.modalTabText, { color: activeModalTab === 'role' ? '#fff' : Colors.text }]}>Role</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.modalTab,
                            { borderColor: Colors.border, backgroundColor: Colors.background },
                            activeModalTab === 'safety' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                          ]}
                          onPress={() => setActiveModalTab('safety')}
                        >
                          <Text style={[styles.modalTabText, { color: activeModalTab === 'safety' ? '#fff' : Colors.text }]}>Safety</Text>
                        </TouchableOpacity>
                      </View>

                      {activeModalTab === 'profile' && (
                        <>
                          <Text style={[styles.sheetSectionLabel, { color: Colors.textSecondary }]}>Edit Profile</Text>
                          <View style={styles.editGrid}>
                            <View style={styles.editField}>
                              <Text style={[styles.editLabel, { color: Colors.text }]}>Full Name</Text>
                              <TextInput
                                style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                value={editName}
                                onChangeText={setEditName}
                                placeholder="Full name"
                                placeholderTextColor={Colors.textSecondary}
                              />
                            </View>
                            <View style={styles.editField}>
                              <Text style={[styles.editLabel, { color: Colors.text }]}>Phone Number</Text>
                              <View style={[styles.phoneInputRow, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                                <Text style={[styles.phoneCodeText, { color: Colors.textSecondary }]}>+91</Text>
                                <TextInput
                                  style={[styles.phoneInput, { color: Colors.text }]}
                                  value={editPhone}
                                  onChangeText={(value) => setEditPhone(normalizeIndianPhoneInput(value))}
                                  placeholder="10-digit number"
                                  placeholderTextColor={Colors.textSecondary}
                                  keyboardType="number-pad"
                                  maxLength={10}
                                />
                              </View>
                            </View>
                            {(selectedUser.role === 'student' || selectedUser.role === 'faculty' || selectedUser.role === 'admin' || selectedUser.role === 'alumni') && (
                              <View style={styles.editField}>
                                <Text style={[styles.editLabel, { color: Colors.text }]}>Department</Text>
                                <TouchableOpacity
                                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                                  onPress={() => setShowDepartmentPicker(true)}
                                >
                                  <Text style={[styles.dropdownInputText, { color: editDept ? Colors.text : Colors.textSecondary }]} numberOfLines={1}>
                                    {editDept || 'Select department'}
                                  </Text>
                                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            )}
                            {(selectedUser.role === 'faculty' || selectedUser.role === 'admin') && selectedUser.faculty_designation && (
                              <View style={styles.editField}>
                                <Text style={[styles.editLabel, { color: Colors.text }]}>Designation</Text>
                                <View style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                                  <Text style={[styles.dropdownInputText, { color: Colors.text }]} numberOfLines={1}>
                                    {formatFacultyDesignation(selectedUser.faculty_designation)}
                                  </Text>
                                </View>
                              </View>
                            )}
                            {(selectedUser.role === 'student' || selectedUser.role === 'faculty' || selectedUser.role === 'admin' || selectedUser.role === 'alumni') && (
                              <View style={styles.editField}>
                                <Text style={[styles.editLabel, { color: Colors.text }]}>Specialization</Text>
                                <TextInput
                                  style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                  value={editSpecialization}
                                  onChangeText={setEditSpecialization}
                                  placeholder="Specialization"
                                  placeholderTextColor={Colors.textSecondary}
                                />
                              </View>
                            )}

                            {selectedUser.role === 'student' && (
                              <>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Roll Number</Text>
                                  <TextInput
                                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                    value={editRollNumber}
                                    onChangeText={setEditRollNumber}
                                    placeholder="Roll number"
                                    placeholderTextColor={Colors.textSecondary}
                                    autoCapitalize="characters"
                                  />
                                </View>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Year of Admission</Text>
                                  <TextInput
                                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                    value={editYearOfAdmission}
                                    onChangeText={setEditYearOfAdmission}
                                    placeholder="e.g. 2023"
                                    placeholderTextColor={Colors.textSecondary}
                                    keyboardType="number-pad"
                                  />
                                </View>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Year</Text>
                                  <TouchableOpacity
                                    style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                                    onPress={() => setShowEditYearPicker(true)}
                                  >
                                    <Text style={[styles.dropdownInputText, { color: editYear ? Colors.text : Colors.textSecondary }]}>
                                      {editYear || 'Select year'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Semester</Text>
                                  <TouchableOpacity
                                    style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                                    onPress={() => setShowEditSemesterPicker(true)}
                                  >
                                    <Text style={[styles.dropdownInputText, { color: editSemester ? Colors.text : Colors.textSecondary }]}>
                                      {editSemester || 'Select semester'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Section</Text>
                                  <TouchableOpacity
                                    style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                                    onPress={() => setShowEditSectionPicker(true)}
                                  >
                                    <Text style={[styles.dropdownInputText, { color: editSection ? Colors.text : Colors.textSecondary }]}>
                                      {editSection || 'Select section'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              </>
                            )}

                            {(selectedUser.role === 'faculty' || selectedUser.role === 'admin') && (
                              <View style={styles.editField}>
                                <Text style={[styles.editLabel, { color: Colors.text }]}>Faculty Designation</Text>
                                <TextInput
                                  style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                  value={editFacultyDesignation}
                                  onChangeText={setEditFacultyDesignation}
                                  placeholder={selectedUser.role === 'admin' ? 'Type principal / vice_principal / hod' : 'Type professor / assistant_professor / lab_instructor'}
                                  placeholderTextColor={Colors.textSecondary}
                                  autoCapitalize="none"
                                />
                              </View>
                            )}

                            {selectedUser.role === 'alumni' && (
                              <>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Batch</Text>
                                  <TextInput
                                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                    value={editBatch}
                                    onChangeText={setEditBatch}
                                    placeholder="Batch"
                                    placeholderTextColor={Colors.textSecondary}
                                  />
                                </View>
                                <View style={styles.editField}>
                                  <Text style={[styles.editLabel, { color: Colors.text }]}>Academic Status</Text>
                                  <TouchableOpacity
                                    style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                                    onPress={() => setShowEditAcademicStatusPicker(true)}
                                  >
                                    <Text style={[styles.dropdownInputText, { color: editAcademicStatus ? Colors.text : Colors.textSecondary }]}>
                                      {ACADEMIC_STATUS_OPTIONS.find((option) => option.value === editAcademicStatus)?.label || 'Select status'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              </>
                            )}

                            <View style={styles.editField}>
                              <Text style={[styles.editLabel, { color: Colors.text }]}>Bio</Text>
                              <TextInput
                                style={[styles.editInput, styles.editTextArea, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                value={editBio}
                                onChangeText={setEditBio}
                                placeholder="Short bio"
                                placeholderTextColor={Colors.textSecondary}
                                multiline
                              />
                            </View>
                            <View style={styles.editField}>
                              <Text style={[styles.editLabel, { color: Colors.text }]}>Skills (comma separated)</Text>
                              <TextInput
                                style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                value={editSkills}
                                onChangeText={setEditSkills}
                                placeholder="React, Node.js, SQL"
                                placeholderTextColor={Colors.textSecondary}
                              />
                            </View>
                            <View style={styles.editField}>
                              <Text style={[styles.editLabel, { color: Colors.text }]}>Interests (comma separated)</Text>
                              <TextInput
                                style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                                value={editInterests}
                                onChangeText={setEditInterests}
                                placeholder="AI, Robotics"
                                placeholderTextColor={Colors.textSecondary}
                              />
                            </View>
                            <TouchableOpacity
                              style={[styles.editSaveBtn, { backgroundColor: Colors.primary }]}
                              onPress={handleSaveProfileEdits}
                              disabled={isProcessing}
                            >
                              <Text style={styles.editSaveText}>Save Changes</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}

                      {activeModalTab === 'role' && (
                        <>
                          <Text style={[styles.sheetSectionLabel, { color: Colors.textSecondary }]}>Change Role</Text>
                          <View style={styles.roleGrid}>
                            {['student', 'faculty', 'alumni', 'admin'].map((role) => (
                              <TouchableOpacity
                                key={role}
                                style={[
                                  styles.roleButton,
                                  { borderColor: Colors.border, backgroundColor: Colors.background },
                                  pendingRole === role && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                                ]}
                                onPress={() => setPendingRole(role)}
                                disabled={isProcessing}
                              >
                                <Text style={[styles.roleButtonText, { color: pendingRole === role ? '#fff' : Colors.text }]}>
                                  {role.charAt(0).toUpperCase() + role.slice(1)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.editSaveBtn,
                              { backgroundColor: Colors.primary },
                              (isProcessing || !pendingRole || pendingRole === selectedUser.role) && { opacity: 0.6 },
                            ]}
                            onPress={handleSaveRoleChange}
                            disabled={isProcessing || !pendingRole || pendingRole === selectedUser.role}
                          >
                            <Text style={styles.editSaveText}>Save Role</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionRow, { backgroundColor: Colors.background }]}
                            onPress={() => { setShowUserModal(false); navigation.navigate('PublicProfile', { userId: selectedUser.id }); }}
                          >
                            <MaterialIcons name="person" size={20} color={Colors.primary} />
                            <Text style={[styles.actionRowText, { color: Colors.text }]}>View Profile</Text>
                            <MaterialIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                          </TouchableOpacity>
                        </>
                      )}

                      {activeModalTab === 'safety' && isAdmin && selectedUser.id !== user?.id && (
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

      <Modal visible={showFiltersModal} transparent animationType="slide" onRequestClose={() => setShowFiltersModal(false)}>
        <View style={styles.sheet}>
          <View style={[styles.sheetContent, { backgroundColor: Colors.surface }]}> 
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: Colors.text }]}>Filter Users</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <MaterialIcons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={[styles.sheetSectionLabel, { color: Colors.textSecondary }]}>Role</Text>
              <View style={styles.roleGrid}>
                {(['all', 'student', 'faculty', 'alumni', 'admin', 'developer'] as RoleFilter[]).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleButton,
                      { borderColor: Colors.border, backgroundColor: Colors.background },
                      draftFilters.role === role && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                    ]}
                    onPress={() => setDraftFilters((prev) => ({ ...prev, role }))}
                  >
                    <Text style={[styles.roleButtonText, { color: draftFilters.role === role ? '#fff' : Colors.text }]}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Department</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowFilterDepartmentPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: draftFilters.department ? Colors.text : Colors.textSecondary }]} numberOfLines={1}>
                    {draftFilters.department || 'All departments'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Year</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowFilterYearPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: draftFilters.year ? Colors.text : Colors.textSecondary }]}>
                    {draftFilters.year || 'All years'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Semester</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowFilterSemesterPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: draftFilters.semester ? Colors.text : Colors.textSecondary }]}>
                    {draftFilters.semester || 'All semesters'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Section</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowFilterSectionPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: draftFilters.section ? Colors.text : Colors.textSecondary }]}>
                    {draftFilters.section || 'All sections'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.filterModalActions}>
                <TouchableOpacity
                  style={[styles.filterModalButton, { borderColor: Colors.border, borderWidth: 1 }]}
                  onPress={resetDraftFilters}
                >
                  <Text style={[styles.filterModalButtonText, { color: Colors.text }]}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterModalButton, { backgroundColor: Colors.primary }]}
                  onPress={applyDraftFilters}
                >
                  <Text style={[styles.filterModalButtonText, { color: '#fff' }]}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={showRemoveAvatarConfirm}
        title="Remove Profile Photo"
        message={`Are you sure you want to remove ${selectedUser?.full_name || 'this user'}'s avatar?`}
        confirmText="Remove"
        cancelText="Cancel"
        type="danger"
        onCancel={() => setShowRemoveAvatarConfirm(false)}
        onConfirm={confirmAdminAvatarRemove}
      />

      <DropdownSheet
        visible={showDepartmentPicker}
        title="Select Department"
        options={[...DEPARTMENT_OPTIONS] as string[]}
        onClose={() => setShowDepartmentPicker(false)}
        onSelect={(value) => {
          setEditDept(value);
          setEditYear('');
          setEditSemester('');
          setEditSection('');
          setShowDepartmentPicker(false);
        }}
      />

      <DropdownSheet
        visible={showEditYearPicker}
        title="Select Year"
        options={['Clear year', ...editYearOptions]}
        onClose={() => setShowEditYearPicker(false)}
        onSelect={(value) => {
          setEditYear(value === 'Clear year' ? '' : value);
          setShowEditYearPicker(false);
        }}
      />

      <DropdownSheet
        visible={showEditSemesterPicker}
        title="Select Semester"
        options={['Clear semester', ...editSemesterOptions]}
        onClose={() => setShowEditSemesterPicker(false)}
        onSelect={(value) => {
          setEditSemester(value === 'Clear semester' ? '' : value);
          setShowEditSemesterPicker(false);
        }}
      />

      <DropdownSheet
        visible={showEditSectionPicker}
        title="Select Section"
        options={['Clear section', ...editSectionOptions]}
        onClose={() => setShowEditSectionPicker(false)}
        onSelect={(value) => {
          setEditSection(value === 'Clear section' ? '' : value);
          setShowEditSectionPicker(false);
        }}
      />

      <DropdownSheet
        visible={showEditAcademicStatusPicker}
        title="Select Academic Status"
        options={['Clear status', ...ACADEMIC_STATUS_OPTIONS.map((option) => option.label)]}
        onClose={() => setShowEditAcademicStatusPicker(false)}
        onSelect={(value) => {
          if (value === 'Clear status') {
            setEditAcademicStatus('');
          } else {
            const mapped = ACADEMIC_STATUS_OPTIONS.find((option) => option.label === value)?.value ?? '';
            setEditAcademicStatus(mapped);
          }
          setShowEditAcademicStatusPicker(false);
        }}
      />


      <DropdownSheet
        visible={showFilterDepartmentPicker}
        title="Department"
        options={['All departments', ...([...(DEPARTMENT_OPTIONS as unknown as string[])] as string[])]}
        onClose={() => setShowFilterDepartmentPicker(false)}
        onSelect={(value) => {
          const nextDepartment = value === 'All departments' ? '' : value;
          setDraftFilters((prev) => {
            const nextSectionOptions = getSectionOptions(nextDepartment);
            const normalizedSection = String(prev.section || '').toUpperCase();
            const keepSection = !normalizedSection || nextSectionOptions.includes(normalizedSection);
            return {
              ...prev,
              department: nextDepartment,
              section: keepSection ? prev.section : '',
              year: prev.year && Number(prev.year) > getDepartmentAcademicLimits(nextDepartment).maxYears ? '' : prev.year,
              semester:
                prev.semester && Number(prev.semester) > getDepartmentAcademicLimits(nextDepartment).maxSemesters
                  ? ''
                  : prev.semester,
            };
          });
          setShowFilterDepartmentPicker(false);
        }}
      />

      <DropdownSheet
        visible={showFilterYearPicker}
        title="Year"
        options={['All years', ...filterYearOptions]}
        onClose={() => setShowFilterYearPicker(false)}
        onSelect={(value) => {
          setDraftFilters((prev) => ({ ...prev, year: value === 'All years' ? '' : value }));
          setShowFilterYearPicker(false);
        }}
      />

      <DropdownSheet
        visible={showFilterSemesterPicker}
        title="Semester"
        options={['All semesters', ...filterSemesterOptions]}
        onClose={() => setShowFilterSemesterPicker(false)}
        onSelect={(value) => {
          setDraftFilters((prev) => ({ ...prev, semester: value === 'All semesters' ? '' : value }));
          setShowFilterSemesterPicker(false);
        }}
      />

      <DropdownSheet
        visible={showFilterSectionPicker}
        title="Section"
        options={['All sections', ...filterSectionOptions]}
        onClose={() => setShowFilterSectionPicker(false)}
        onSelect={(value) => {
          setDraftFilters((prev) => ({ ...prev, section: value === 'All sections' ? '' : value }));
          setShowFilterSectionPicker(false);
        }}
      />

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
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 2 },
  summaryCard: { width: '31%', borderRadius: BorderRadius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  summaryLabel: { fontSize: FontSizes.xs, marginBottom: 2 },
  summaryValue: { fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.md, marginVertical: 10, paddingHorizontal: 12, borderRadius: BorderRadius.lg, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: FontSizes.sm },
  filterActionRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  filterCountBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountText: { color: '#fff', fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  clearFilterBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  clearFilterText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
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
  modalTabs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  modalTab: { flex: 1, borderWidth: 1, borderRadius: BorderRadius.full, paddingVertical: 8, alignItems: 'center' },
  modalTabText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  editGrid: { gap: 10, marginBottom: 8 },
  editField: { gap: 6 },
  editLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  editInput: { borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSizes.sm },
  phoneInputRow: { borderWidth: 1, borderRadius: BorderRadius.lg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  phoneCodeText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginRight: 8 },
  phoneInput: { flex: 1, fontSize: FontSizes.sm, paddingVertical: 10 },
  dropdownInput: { borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownInputText: { flex: 1, fontSize: FontSizes.sm, marginRight: 8 },
  editTextArea: { minHeight: 80, textAlignVertical: 'top' },
  editSaveBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.lg, marginTop: 4 },
  editSaveText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
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
  filterModalActions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 12 },
  filterModalButton: { flex: 1, paddingVertical: 12, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  filterModalButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  selfNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, padding: 14, borderRadius: BorderRadius.lg, borderWidth: 1 },
  selfNoticeText: { flex: 1, fontSize: FontSizes.sm, fontWeight: FontWeights.medium, lineHeight: 20 },
  // Avatar upload
  avatarEditSection: { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  avatarUploadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 8, borderRadius: BorderRadius.lg },
  avatarUploadWrap: { position: 'relative', width: 68, height: 68 },
  avatarUploadImg: { width: 68, height: 68, borderRadius: 34 },
  avatarUploadPlaceholder: { backgroundColor: '#6366f1', alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarUploadInitials: { color: '#fff', fontSize: 22, fontWeight: '700' as const },
  avatarCameraBadge: { position: 'absolute' as const, bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#6366f1', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: '#fff' },
  removeAvatarBtn: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4 },
  removeAvatarText: { fontSize: 12, fontWeight: FontWeights.semibold },
});
