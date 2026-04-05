import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import AdminHeader from '../../components/admin/AdminHeader';
import DropdownSheet from '../../components/DropdownSheet';
import { DEPARTMENT_OPTIONS, getDepartmentAcademicLimits, getSectionOptions } from '../../constants/academic';
import { bulkCreateUsersByAdmin, createUserByAdmin, insertAdminLog } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminRole } from '../../utils/roles';
import { UserRole } from '../../types/database';

type NavProp = StackNavigationProp<RootStackParamList>;
type BulkRole = 'student' | 'faculty' | 'alumni';

type BulkDraftUser = {
  id: string;
  sourceRow: number;
  full_name: string;
  email: string;
  role: BulkRole;
  department: string;
  year: string;
  semester: string;
  section: string;
  password: string;
};

export default function AdminAddUserScreen() {
  const navigation = useNavigation<NavProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user, profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [newDept, setNewDept] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [newSection, setNewSection] = useState('');
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showSemesterPicker, setShowSemesterPicker] = useState(false);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkDraftUsers, setBulkDraftUsers] = useState<BulkDraftUser[]>([]);
  const [editingBulkId, setEditingBulkId] = useState<string | null>(null);

  const addLimits = useMemo(
    () => getDepartmentAcademicLimits(newDept),
    [newDept]
  );

  const yearOptions = useMemo(
    () => Array.from({ length: addLimits.maxYears }, (_, i) => String(i + 1)),
    [addLimits.maxYears]
  );

  const semesterOptions = useMemo(
    () => Array.from({ length: addLimits.maxSemesters }, (_, i) => String(i + 1)),
    [addLimits.maxSemesters]
  );

  const sectionOptions = useMemo(
    () => getSectionOptions(newDept),
    [newDept]
  );

  const resetForm = () => {
    setNewName('');
    setNewEmail('');
    setNewRole('student');
    setNewDept('');
    setNewYear('');
    setNewSemester('');
    setNewSection('');
    setUseCustomPassword(false);
    setCustomPassword('');
  };

  const isStudent = newRole === 'student';
  const isFaculty = newRole === 'faculty';
  const isAlumni = newRole === 'alumni';
  const showDepartment = isStudent || isFaculty || isAlumni;
  const showStudentFields = isStudent;

  useEffect(() => {
    if (!showStudentFields) {
      setNewYear('');
      setNewSemester('');
      setNewSection('');
    }
  }, [showStudentFields]);

  useEffect(() => {
    if (!showDepartment) {
      setNewDept('');
    }
  }, [showDepartment]);

  const handleCreateUser = async () => {
    if (!user?.id) return;
    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      Toast.show({ type: 'error', text1: 'Name and email are required' });
      return;
    }

    if (useCustomPassword && customPassword.trim().length < 6) {
      Toast.show({ type: 'error', text1: 'Password must be at least 6 characters' });
      return;
    }

    const parsedYear = Number.parseInt(newYear.trim(), 10);
    const yearValue = Number.isFinite(parsedYear) ? parsedYear : null;

    const parsedSemester = Number.parseInt(newSemester.trim(), 10);
    const semesterValue = Number.isFinite(parsedSemester) ? parsedSemester : null;

    const sectionValueRaw = newSection.trim().toUpperCase();
    const sectionValue = ['A', 'B', 'C', 'D'].includes(sectionValueRaw) ? sectionValueRaw : null;

    try {
      setIsProcessing(true);
      const created = await createUserByAdmin({
        email: trimmedEmail,
        full_name: trimmedName,
        role: newRole,
        department: showDepartment ? (newDept.trim() || null) : null,
        year: showStudentFields ? yearValue : null,
        semester: showStudentFields ? semesterValue : null,
        section: showStudentFields ? sectionValue : null,
        password: useCustomPassword ? customPassword.trim() : null,
      });
      await insertAdminLog(user.id, 'user_created', created?.user_id ?? null, {
        email: trimmedEmail,
        role: newRole,
      });
      resetForm();
      Toast.show({ type: 'success', text1: 'User created', text2: `${trimmedName} added successfully` });
    } catch (error: any) {
      console.error('[AdminAddUser] create user failed:', {
        email: trimmedEmail,
        role: newRole,
        error: error?.message || error,
      });
      Toast.show({ type: 'error', text1: 'Failed to create user', text2: error?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const toHeaderMap = (row: Record<string, any>) => {
    const mapped: Record<string, any> = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const normalized = String(key || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
      mapped[normalized] = value;
    });
    return mapped;
  };

  const firstValue = (row: Record<string, any>, candidates: string[]) => {
    for (const key of candidates) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  };

  const getBulkRowError = (row: BulkDraftUser) => {
    const fullName = row.full_name.trim();
    const email = row.email.trim().toLowerCase();
    const department = row.department.trim();

    if (!fullName) return 'full_name is required';
    if (!email) return 'email is required';

    if (row.role === 'student') {
      if (!department) return 'department is required for student';
      if (!row.year.trim()) return 'year is required for student';
      if (!row.semester.trim()) return 'semester is required for student';
      if (!row.section.trim()) return 'section is required for student';
    }

    if ((row.role === 'faculty' || row.role === 'alumni') && !department) {
      return `department is required for ${row.role}`;
    }

    if (row.password.trim() && row.password.trim().length < 6) {
      return 'password must be at least 6 characters';
    }

    return '';
  };

  const updateBulkDraftUser = (id: string, updates: Partial<BulkDraftUser>) => {
    setBulkDraftUsers((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeBulkDraftUser = (id: string) => {
    setBulkDraftUsers((prev) => prev.filter((item) => item.id !== id));
    setEditingBulkId((prev) => (prev === id ? null : prev));
  };

  const editingBulkUser = useMemo(
    () => bulkDraftUsers.find((item) => item.id === editingBulkId) || null,
    [bulkDraftUsers, editingBulkId]
  );

  const handleBulkUpload = async () => {
    if (!user?.id || isBulkProcessing) return;

    try {
      setIsBulkProcessing(true);

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        // Some file managers label CSV as octet-stream or generic text.
        // Accept any file here, then validate by extension below.
        type: '*/*',
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const fileName = String(asset.name || asset.uri || '').toLowerCase();
      const isSupportedSpreadsheet = /\.(csv|xls|xlsx)$/.test(fileName);
      if (!isSupportedSpreadsheet) {
        throw new Error('Please select a .csv, .xls, or .xlsx file');
      }

      const fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const workbook = XLSX.read(fileBase64, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        throw new Error('No worksheet found in selected file');
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      if (!rows.length) {
        throw new Error('The selected file has no rows to import');
      }

      const usersPayload = rows
        .map((rawRow) => {
          const row = toHeaderMap(rawRow);
          const role = firstValue(row, ['role']).toLowerCase();
          const safeRole: BulkRole = role === 'faculty' || role === 'alumni' ? role : 'student';

          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourceRow: Number(firstValue(row, ['row'])) || 0,
            full_name: firstValue(row, ['full_name', 'name', 'full name']),
            email: firstValue(row, ['email', 'mail']),
            role: safeRole,
            department: firstValue(row, ['department', 'dept']),
            year: firstValue(row, ['year']),
            semester: firstValue(row, ['semester']),
            section: firstValue(row, ['section']).toUpperCase(),
            password: firstValue(row, ['password']),
          };
        })
        .map((row, index) => ({ ...row, sourceRow: index + 2 }))
        .filter((row) => row.email || row.full_name);

      if (!usersPayload.length) {
        throw new Error('No valid rows found. Add at least full_name and email columns.');
      }

      setBulkDraftUsers(usersPayload);
      setEditingBulkId(usersPayload[0]?.id || null);
      Toast.show({
        type: 'success',
        text1: 'Preview ready',
        text2: `${usersPayload.length} rows imported. Review and edit before creating users.`,
      });
    } catch (error: any) {
      console.error('[AdminAddUser] bulk upload failed:', error?.message || error);
      Toast.show({ type: 'error', text1: 'Bulk upload failed', text2: error?.message || 'Please check file format' });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleSubmitBulkDrafts = async () => {
    if (!user?.id || !bulkDraftUsers.length || isBulkSubmitting) return;

    const invalidIndex = bulkDraftUsers.findIndex((row) => !!getBulkRowError(row));
    if (invalidIndex !== -1) {
      const invalidRow = bulkDraftUsers[invalidIndex];
      setEditingBulkId(invalidRow.id);
      Toast.show({
        type: 'error',
        text1: `Row ${invalidRow.sourceRow} needs fix`,
        text2: getBulkRowError(invalidRow),
      });
      return;
    }

    try {
      setIsBulkSubmitting(true);
      const payload = bulkDraftUsers.map((row) => ({
        full_name: row.full_name.trim(),
        email: row.email.trim().toLowerCase(),
        role: row.role as UserRole,
        department: row.department.trim() || null,
        year: row.year.trim() ? Number(row.year.trim()) : null,
        semester: row.semester.trim() ? Number(row.semester.trim()) : null,
        section: row.section.trim().toUpperCase() || null,
        password: row.password.trim() || null,
      }));

      const summary = await bulkCreateUsersByAdmin({ users: payload });

      await insertAdminLog(user.id, 'user_created', null, {
        mode: 'bulk_upload',
        total: summary.total,
        created_count: summary.created_count,
        failed_count: summary.failed_count,
      });

      if (summary.failed_count > 0) {
        const failedIndices = new Set(summary.failed.map((item) => item.index - 1));
        setBulkDraftUsers((prev) => prev.filter((_, index) => failedIndices.has(index)));
        setEditingBulkId((prev) => {
          const remaining = bulkDraftUsers.filter((_, index) => failedIndices.has(index));
          return remaining[0]?.id || prev;
        });

        Toast.show({
          type: 'info',
          text1: `${summary.created_count} created, ${summary.failed_count} failed`,
          text2: summary.failed[0]?.error || 'Fix failed rows and retry',
        });
      } else {
        setBulkDraftUsers([]);
        setEditingBulkId(null);
        Toast.show({
          type: 'success',
          text1: 'Bulk users created',
          text2: `${summary.created_count} users created successfully`,
        });
      }
    } catch (error: any) {
      console.error('[AdminAddUser] submit bulk users failed:', error?.message || error);
      Toast.show({ type: 'error', text1: 'Bulk create failed', text2: error?.message || 'Please try again' });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <AdminHeader
          title="Add User"
          subtitle="Admin access required"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.center}>
          <MaterialIcons name="lock" size={32} color={Colors.textSecondary} />
          <Text style={[styles.lockedText, { color: Colors.textSecondary }]}>Admin access required</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <AdminHeader
        title="Add User"
        subtitle="Create accounts and assign initial access"
        onBack={() => navigation.goBack()}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
        <View style={[styles.formCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={[styles.bulkInfoCard, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
            <Text style={[styles.bulkInfoTitle, { color: Colors.text }]}>Bulk Upload (CSV/Excel)</Text>
            <Text style={[styles.bulkInfoText, { color: Colors.textSecondary }]}>Supported roles: student, faculty, alumni</Text>
            <Text style={[styles.bulkInfoText, { color: Colors.textSecondary }]}>Student required: full_name, email, role, department, year, semester, section</Text>
            <Text style={[styles.bulkInfoText, { color: Colors.textSecondary }]}>Faculty required: full_name, email, role, department</Text>
            <Text style={[styles.bulkInfoText, { color: Colors.textSecondary }]}>Alumni required: full_name, email, role, department</Text>
            <Text style={[styles.bulkInfoText, { color: Colors.textSecondary }]}>Optional for all: password</Text>
            <TouchableOpacity
              style={[styles.bulkUploadButton, { backgroundColor: Colors.primary }]}
              onPress={handleBulkUpload}
              disabled={isBulkProcessing}
            >
              {isBulkProcessing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.bulkUploadButtonText}>Upload CSV/Excel</Text>
              )}
            </TouchableOpacity>
          </View>

          {bulkDraftUsers.length > 0 && (
            <View style={[styles.bulkPreviewCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
              <Text style={[styles.bulkPreviewTitle, { color: Colors.text }]}>Preview Users ({bulkDraftUsers.length})</Text>
              {bulkDraftUsers.map((item) => {
                const rowError = getBulkRowError(item);
                return (
                  <View key={item.id} style={[styles.bulkPreviewRow, { borderColor: Colors.border }]}> 
                    <View style={styles.bulkPreviewRowHeader}>
                      <Text style={[styles.bulkPreviewRowTitle, { color: Colors.text }]}>Row {item.sourceRow}</Text>
                      <View style={styles.bulkPreviewActions}>
                        <TouchableOpacity onPress={() => setEditingBulkId(item.id)}>
                          <Text style={[styles.bulkActionText, { color: Colors.primary }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeBulkDraftUser(item.id)}>
                          <Text style={[styles.bulkActionText, { color: '#dc2626' }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[styles.bulkPreviewText, { color: Colors.textSecondary }]}>Name: {item.full_name || '-'}</Text>
                    <Text style={[styles.bulkPreviewText, { color: Colors.textSecondary }]}>Email: {item.email || '-'}</Text>
                    <Text style={[styles.bulkPreviewText, { color: Colors.textSecondary }]}>Role: {item.role}</Text>
                    <Text style={[styles.bulkPreviewText, { color: Colors.textSecondary }]}>Department: {item.department || '-'}</Text>
                    {item.role === 'student' && (
                      <Text style={[styles.bulkPreviewText, { color: Colors.textSecondary }]}>Year/Sem/Section: {item.year || '-'} / {item.semester || '-'} / {item.section || '-'}</Text>
                    )}
                    {!!rowError && <Text style={styles.bulkErrorText}>Needs fix: {rowError}</Text>}
                  </View>
                );
              })}

              {!!editingBulkUser && (
                <View style={[styles.bulkEditorCard, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <Text style={[styles.bulkEditorTitle, { color: Colors.text }]}>Edit Row {editingBulkUser.sourceRow}</Text>
                  <TextInput
                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                    placeholder="Full name"
                    placeholderTextColor={Colors.textSecondary}
                    value={editingBulkUser.full_name}
                    onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { full_name: value })}
                  />
                  <TextInput
                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                    placeholder="Email"
                    placeholderTextColor={Colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={editingBulkUser.email}
                    onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { email: value })}
                  />
                  <View style={styles.roleGrid}>
                    {(['student', 'faculty', 'alumni'] as BulkRole[]).map((role) => (
                      <TouchableOpacity
                        key={role}
                        style={[
                          styles.roleButton,
                          { borderColor: Colors.border, backgroundColor: Colors.background },
                          editingBulkUser.role === role && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                        ]}
                        onPress={() => updateBulkDraftUser(editingBulkUser.id, { role })}
                      >
                        <Text style={[styles.roleButtonText, { color: editingBulkUser.role === role ? '#fff' : Colors.text }]}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                    placeholder="Department"
                    placeholderTextColor={Colors.textSecondary}
                    value={editingBulkUser.department}
                    onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { department: value })}
                  />
                  {editingBulkUser.role === 'student' && (
                    <>
                      <TextInput
                        style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                        placeholder="Year"
                        placeholderTextColor={Colors.textSecondary}
                        keyboardType="numeric"
                        value={editingBulkUser.year}
                        onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { year: value })}
                      />
                      <TextInput
                        style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                        placeholder="Semester"
                        placeholderTextColor={Colors.textSecondary}
                        keyboardType="numeric"
                        value={editingBulkUser.semester}
                        onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { semester: value })}
                      />
                      <TextInput
                        style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                        placeholder="Section"
                        placeholderTextColor={Colors.textSecondary}
                        autoCapitalize="characters"
                        value={editingBulkUser.section}
                        onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { section: value.toUpperCase() })}
                      />
                    </>
                  )}
                  <TextInput
                    style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                    placeholder="Password (optional, min 6)"
                    placeholderTextColor={Colors.textSecondary}
                    secureTextEntry
                    value={editingBulkUser.password}
                    onChangeText={(value) => updateBulkDraftUser(editingBulkUser.id, { password: value })}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.bulkUploadButton, { backgroundColor: Colors.primary }]}
                onPress={handleSubmitBulkDrafts}
                disabled={isBulkSubmitting}
              >
                {isBulkSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.bulkUploadButtonText}>Create Previewed Users</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.editGrid}>
            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: Colors.text }]}>Full Name *</Text>
              <TextInput
                style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                placeholder="Enter full name"
                placeholderTextColor={Colors.textSecondary}
                value={newName}
                onChangeText={setNewName}
              />
            </View>

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: Colors.text }]}>Email *</Text>
              <TextInput
                style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                placeholder="Enter email"
                placeholderTextColor={Colors.textSecondary}
                value={newEmail}
                onChangeText={setNewEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: Colors.text }]}>Role</Text>
              <View style={styles.roleGrid}>
                {(['student', 'faculty', 'alumni', 'admin'] as UserRole[]).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleButton,
                      { borderColor: Colors.border, backgroundColor: Colors.background },
                      newRole === role && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                    ]}
                    onPress={() => setNewRole(role)}
                  >
                    <Text style={[styles.roleButtonText, { color: newRole === role ? '#fff' : Colors.text }]}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {showDepartment && (
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Department</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowDepartmentPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: newDept ? Colors.text : Colors.textSecondary }]} numberOfLines={1}>
                    {newDept || 'No department'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {showStudentFields && (
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Year</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowYearPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: newYear ? Colors.text : Colors.textSecondary }]}>
                    {newYear || 'No year'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {showStudentFields && (
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Semester</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowSemesterPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: newSemester ? Colors.text : Colors.textSecondary }]}>
                    {newSemester || 'No semester'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {showStudentFields && (
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Section</Text>
                <TouchableOpacity
                  style={[styles.dropdownInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  onPress={() => setShowSectionPicker(true)}
                >
                  <Text style={[styles.dropdownInputText, { color: newSection ? Colors.text : Colors.textSecondary }]}>
                    {newSection || 'No section'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: Colors.text }]}>Password</Text>
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setUseCustomPassword((prev) => !prev)}
              >
                <MaterialIcons
                  name={useCustomPassword ? 'check-box' : 'check-box-outline-blank'}
                  size={18}
                  color={useCustomPassword ? Colors.primary : Colors.textSecondary}
                />
                <Text style={[styles.passwordToggleText, { color: Colors.text }]}>
                  Set a custom password
                </Text>
              </TouchableOpacity>
              {!useCustomPassword && (
                <Text style={[styles.passwordHint, { color: Colors.textSecondary }]}>
                  Default password: 123456
                </Text>
              )}
              {useCustomPassword && (
                <TextInput
                  style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                  placeholder="Enter password (min 6 chars)"
                  placeholderTextColor={Colors.textSecondary}
                  value={customPassword}
                  onChangeText={setCustomPassword}
                  secureTextEntry
                />
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: Colors.primary }]}
            onPress={handleCreateUser}
            disabled={isProcessing}
          >
            {isProcessing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Create User</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <DropdownSheet
        visible={showDepartmentPicker}
        title="Select Department"
        options={['No department', ...([...(DEPARTMENT_OPTIONS as unknown as string[])] as string[])]}
        onClose={() => setShowDepartmentPicker(false)}
        onSelect={(value) => {
          const nextDepartment = value === 'No department' ? '' : value;
          const nextSectionOptions = getSectionOptions(nextDepartment);
          const normalizedSection = String(newSection || '').toUpperCase();
          const keepSection = !normalizedSection || nextSectionOptions.includes(normalizedSection);
          const limits = getDepartmentAcademicLimits(nextDepartment);
          setNewDept(nextDepartment);
          setNewSection(keepSection ? newSection : '');
          setNewYear(newYear && Number(newYear) > limits.maxYears ? '' : newYear);
          setNewSemester(newSemester && Number(newSemester) > limits.maxSemesters ? '' : newSemester);
          setShowDepartmentPicker(false);
        }}
      />

      <DropdownSheet
        visible={showYearPicker}
        title="Year"
        options={['No year', ...yearOptions]}
        onClose={() => setShowYearPicker(false)}
        onSelect={(value) => {
          setNewYear(value === 'No year' ? '' : value);
          setShowYearPicker(false);
        }}
      />

      <DropdownSheet
        visible={showSemesterPicker}
        title="Semester"
        options={['No semester', ...semesterOptions]}
        onClose={() => setShowSemesterPicker(false)}
        onSelect={(value) => {
          setNewSemester(value === 'No semester' ? '' : value);
          setShowSemesterPicker(false);
        }}
      />

      <DropdownSheet
        visible={showSectionPicker}
        title="Section"
        options={['No section', ...sectionOptions]}
        onClose={() => setShowSectionPicker(false)}
        onSelect={(value) => {
          setNewSection(value === 'No section' ? '' : value);
          setShowSectionPicker(false);
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
  formContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  formCard: { borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.md, gap: 12 },
  editGrid: { gap: 12 },
  bulkInfoCard: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: 12, gap: 6, marginBottom: 10 },
  bulkInfoTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  bulkInfoText: { fontSize: FontSizes.xs, lineHeight: 18 },
  bulkUploadButton: { alignItems: 'center', paddingVertical: 10, borderRadius: BorderRadius.md, marginTop: 8 },
  bulkUploadButtonText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  bulkPreviewCard: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: 12, gap: 8, marginBottom: 10 },
  bulkPreviewTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  bulkPreviewRow: { borderWidth: 1, borderRadius: BorderRadius.md, padding: 10, gap: 3 },
  bulkPreviewRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bulkPreviewRowTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  bulkPreviewActions: { flexDirection: 'row', gap: 14 },
  bulkActionText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  bulkPreviewText: { fontSize: FontSizes.xs },
  bulkErrorText: { color: '#dc2626', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, marginTop: 2 },
  bulkEditorCard: { borderWidth: 1, borderRadius: BorderRadius.md, padding: 10, gap: 8, marginTop: 4 },
  bulkEditorTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  editField: { gap: 6 },
  editLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  editInput: { borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10, fontSize: FontSizes.sm },
  dropdownInput: { borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownInputText: { flex: 1, fontSize: FontSizes.sm, marginRight: 8 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  roleButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: BorderRadius.lg, borderWidth: 1, minWidth: '45%', alignItems: 'center' },
  roleButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  saveButton: { alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.lg, marginTop: 4 },
  saveButtonText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  passwordToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  passwordToggleText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
  passwordHint: { fontSize: FontSizes.xs, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  lockedText: { fontSize: FontSizes.md, fontWeight: FontWeights.medium },
});
