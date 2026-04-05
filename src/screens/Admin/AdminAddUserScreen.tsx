import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import AdminHeader from '../../components/admin/AdminHeader';
import DropdownSheet from '../../components/DropdownSheet';
import { DEPARTMENT_OPTIONS, getDepartmentAcademicLimits, getSectionOptions } from '../../constants/academic';
import { createUserByAdmin, insertAdminLog } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminRole } from '../../utils/roles';
import { UserRole } from '../../types/database';

type NavProp = StackNavigationProp<RootStackParamList>;

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
