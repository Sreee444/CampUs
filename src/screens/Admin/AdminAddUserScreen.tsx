import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
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
import { ConfirmBottomSheet } from '../../components/ConfirmBottomSheet';
import DropdownSheet from '../../components/DropdownSheet';
import { DEPARTMENT_OPTIONS, getDepartmentAcademicLimits, getSectionOptions } from '../../constants/academic';
import { bulkCreateUsersByAdmin, createUserByAdmin, insertAdminLog } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import { formatFacultyDesignation, getDesignationOptionsByRole, isAdminRole } from '../../utils/roles';
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
  faculty_designation: string;
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
  const [newFacultyDesignation, setNewFacultyDesignation] = useState('');
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
  const [bulkProcessingCount, setBulkProcessingCount] = useState(0);
  const [showBulkProgressOverlay, setShowBulkProgressOverlay] = useState(false);
  const [bulkDraftUsers, setBulkDraftUsers] = useState<BulkDraftUser[]>([]);
  const [bulkFileName, setBulkFileName] = useState('');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkResultModal, setBulkResultModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

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

  const allowedDesignationValues = useMemo(
    () => getDesignationOptionsByRole(newRole),
    [newRole]
  );

  const normalizeDesignationInput = (value: string) =>
    String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  const resetForm = () => {
    setNewName('');
    setNewEmail('');
    setNewRole('student');
    setNewDept('');
    setNewYear('');
    setNewSemester('');
    setNewSection('');
    setNewFacultyDesignation('');
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

  useEffect(() => {
    if (!allowedDesignationValues.length) {
      setNewFacultyDesignation('');
      return;
    }
  }, [newRole, allowedDesignationValues.length]);

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

    const normalizedDesignation = normalizeDesignationInput(newFacultyDesignation);

    if ((isFaculty || newRole === 'admin') && !normalizedDesignation) {
      Toast.show({ type: 'error', text1: 'Faculty designation is required' });
      return;
    }

    if ((isFaculty || newRole === 'admin') && !allowedDesignationValues.includes(normalizedDesignation as any)) {
      const allowedLabels = allowedDesignationValues.map((value) => formatFacultyDesignation(value)).join(', ');
      Toast.show({
        type: 'error',
        text1: 'Invalid designation',
        text2: `Use one of: ${allowedLabels}`,
      });
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
        faculty_designation: (isFaculty || newRole === 'admin') ? normalizedDesignation || null : null,
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
    const facultyDesignation = row.faculty_designation.trim();

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

    if (row.role === 'faculty' && !facultyDesignation) {
      return 'faculty_designation is required for faculty';
    }

    if (row.password.trim() && row.password.trim().length < 6) {
      return 'password must be at least 6 characters';
    }

    return '';
  };

  const bulkRowErrorCount = useMemo(
    () => bulkDraftUsers.filter((row) => !!getBulkRowError(row)).length,
    [bulkDraftUsers]
  );

  const bulkRoleCounts = useMemo(
    () => bulkDraftUsers.reduce(
      (counts, row) => {
        counts[row.role] += 1;
        return counts;
      },
      { student: 0, faculty: 0, alumni: 0 } as Record<BulkRole, number>
    ),
    [bulkDraftUsers]
  );

  const clearBulkDraft = () => {
    setBulkDraftUsers([]);
    setBulkFileName('');
    setShowBulkConfirm(false);
    setBulkProcessingCount(0);
    setShowBulkProgressOverlay(false);
  };

  const showBulkResult = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    setBulkResultModal({
      visible: true,
      type,
      title,
      message,
    });
  };

  const openBulkConfirm = () => {
    if (!bulkDraftUsers.length) return;
    setShowBulkConfirm(true);
  };

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

      clearBulkDraft();

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
            faculty_designation: firstValue(row, ['faculty_designation', 'designation']),
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
      setBulkFileName(asset.name || 'selected file');
      Toast.show({
        type: 'success',
        text1: 'File ready',
        text2: `${usersPayload.length} rows parsed. Review the summary, then confirm upload.`,
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

    try {
      setIsBulkSubmitting(true);
      setBulkProcessingCount(bulkDraftUsers.length);
      const payload = bulkDraftUsers.map((row) => ({
        full_name: row.full_name.trim(),
        email: row.email.trim().toLowerCase(),
        role: row.role as UserRole,
        department: row.department.trim() || null,
        faculty_designation: row.faculty_designation.trim() || null,
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
        showBulkResult(
          'error',
          `${summary.created_count} created, ${summary.failed_count} failed`,
          summary.failed[0]?.error || 'Some rows failed. Fix the source file and upload again.'
        );
        clearBulkDraft();
      } else {
        clearBulkDraft();
        showBulkResult('success', 'Bulk users created', `${summary.created_count} users created successfully.`);
      }
    } catch (error: any) {
      console.error('[AdminAddUser] submit bulk users failed:', error?.message || error);
      showBulkResult('error', 'Bulk create failed', error?.message || 'Please try again');
    } finally {
      setIsBulkSubmitting(false);
      setBulkProcessingCount(0);
      setShowBulkProgressOverlay(false);
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
            <Text style={[styles.bulkInfoText, { color: Colors.textSecondary }]}>Faculty required: full_name, email, role, department, faculty_designation</Text>
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
            <View style={[styles.bulkSummaryCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
              <View style={styles.bulkSummaryHeader}>
                <Text style={[styles.bulkSummaryTitle, { color: Colors.text }]}>File Ready</Text>
                <Text style={[styles.bulkSummaryFile, { color: Colors.textSecondary }]} numberOfLines={1}>
                  {bulkFileName || 'Selected file'}
                </Text>
              </View>

              <View style={styles.bulkSummaryGrid}>
                <View style={[styles.bulkSummaryStat, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <Text style={[styles.bulkSummaryStatValue, { color: Colors.text }]}>{bulkDraftUsers.length}</Text>
                  <Text style={[styles.bulkSummaryStatLabel, { color: Colors.textSecondary }]}>Rows parsed</Text>
                </View>
                <View style={[styles.bulkSummaryStat, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <Text style={[styles.bulkSummaryStatValue, { color: Colors.text }]}>{bulkRoleCounts.student}</Text>
                  <Text style={[styles.bulkSummaryStatLabel, { color: Colors.textSecondary }]}>Students</Text>
                </View>
                <View style={[styles.bulkSummaryStat, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <Text style={[styles.bulkSummaryStatValue, { color: Colors.text }]}>{bulkRoleCounts.faculty}</Text>
                  <Text style={[styles.bulkSummaryStatLabel, { color: Colors.textSecondary }]}>Faculty</Text>
                </View>
                <View style={[styles.bulkSummaryStat, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                  <Text style={[styles.bulkSummaryStatValue, { color: Colors.text }]}>{bulkRoleCounts.alumni}</Text>
                  <Text style={[styles.bulkSummaryStatLabel, { color: Colors.textSecondary }]}>Alumni</Text>
                </View>
              </View>

              {!!bulkRowErrorCount && (
                <Text style={styles.bulkWarningText}>
                  {bulkRowErrorCount} row{bulkRowErrorCount === 1 ? '' : 's'} look incomplete and may be skipped during upload.
                </Text>
              )}

              <Text style={[styles.bulkSummaryNote, { color: Colors.textSecondary }]}>Row-by-row preview is disabled for bulk uploads. Review the file itself, then confirm to create these users.</Text>

              <View style={styles.bulkSummaryActions}>
                <TouchableOpacity
                  style={[styles.bulkSummaryAction, { backgroundColor: Colors.primary }]}
                  onPress={openBulkConfirm}
                  disabled={!bulkDraftUsers.length || isBulkSubmitting}
                >
                  <Text style={styles.bulkUploadButtonText}>Review & Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkSummaryAction, styles.bulkSummarySecondaryAction, { borderColor: Colors.border, backgroundColor: Colors.surface }]}
                  onPress={clearBulkDraft}
                  disabled={isBulkSubmitting}
                >
                  <Text style={[styles.bulkSummarySecondaryActionText, { color: Colors.text }]}>Clear File</Text>
                </TouchableOpacity>
              </View>
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

            {(isFaculty || newRole === 'admin') && (
              <View style={styles.editField}>
                <Text style={[styles.editLabel, { color: Colors.text }]}>Faculty Designation *</Text>
                <TextInput
                  style={[styles.editInput, { backgroundColor: Colors.background, color: Colors.text, borderColor: Colors.border }]}
                  placeholder={newRole === 'admin' ? 'Type principal / vice_principal / hod' : 'Type professor / assistant_professor / lab_instructor'}
                  placeholderTextColor={Colors.textSecondary}
                  value={newFacultyDesignation}
                  onChangeText={setNewFacultyDesignation}
                  autoCapitalize="none"
                />
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

      <ConfirmBottomSheet
        visible={showBulkConfirm}
        title="Confirm bulk upload"
        message={`You're about to upload ${bulkDraftUsers.length} user${bulkDraftUsers.length === 1 ? '' : 's'} from ${bulkFileName || 'the selected file'} into CampUs. Please confirm only if the file is correct.`}
        confirmText={isBulkSubmitting ? 'Uploading...' : 'Confirm Upload'}
        cancelText="Cancel"
        confirmColor={Colors.primary}
        icon="cloud-upload"
        onConfirm={() => {
          setShowBulkConfirm(false);
          setShowBulkProgressOverlay(true);
          setIsBulkSubmitting(true);
          setBulkProcessingCount(bulkDraftUsers.length);
          void handleSubmitBulkDrafts();
        }}
        onClose={() => setShowBulkConfirm(false)}
      />

      {(isBulkSubmitting || showBulkProgressOverlay) && (
        <View style={styles.processingOverlay}>
          <View style={[styles.processingCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[styles.processingTitle, { color: Colors.text }]}>Processing bulk upload</Text>
            <Text style={[styles.processingMessage, { color: Colors.textSecondary }]}>
              Creating {bulkProcessingCount || bulkDraftUsers.length} user{(bulkProcessingCount || bulkDraftUsers.length) === 1 ? '' : 's'} now. Please wait...
            </Text>
            <Text style={[styles.processingHint, { color: Colors.textSecondary }]}>Please keep this screen open until upload completes.</Text>
          </View>
        </View>
      )}

      <Modal
        visible={bulkResultModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setBulkResultModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.processingOverlay}>
          <View style={[styles.resultCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <MaterialIcons
              name={bulkResultModal.type === 'success' ? 'check-circle' : 'error-outline'}
              size={34}
              color={bulkResultModal.type === 'success' ? '#16a34a' : '#dc2626'}
            />
            <Text style={[styles.resultTitle, { color: Colors.text }]}>{bulkResultModal.title}</Text>
            <Text style={[styles.resultMessage, { color: Colors.textSecondary }]}>{bulkResultModal.message}</Text>
            <TouchableOpacity
              style={[styles.resultCloseButton, { backgroundColor: Colors.primary }]}
              onPress={() => setBulkResultModal((prev) => ({ ...prev, visible: false }))}
            >
              <Text style={styles.resultCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  bulkSummaryCard: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: 12, gap: 10, marginBottom: 10 },
  bulkSummaryHeader: { gap: 4 },
  bulkSummaryTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  bulkSummaryFile: { fontSize: FontSizes.xs },
  bulkSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkSummaryStat: { borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: 10, paddingHorizontal: 12, minWidth: '47%', gap: 2 },
  bulkSummaryStatValue: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  bulkSummaryStatLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
  bulkWarningText: { color: '#dc2626', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  bulkSummaryNote: { fontSize: FontSizes.xs, lineHeight: 18 },
  bulkSummaryActions: { flexDirection: 'row', gap: 10 },
  bulkSummaryAction: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: BorderRadius.md },
  bulkSummarySecondaryAction: { borderWidth: 1 },
  bulkSummarySecondaryActionText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
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
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  processingCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 10,
  },
  processingTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  processingMessage: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  processingHint: {
    fontSize: FontSizes.xs,
    textAlign: 'center',
    opacity: 0.9,
  },
  resultCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 10,
  },
  resultTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  resultMessage: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  resultCloseButton: {
    marginTop: 8,
    minWidth: 110,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  resultCloseButtonText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
