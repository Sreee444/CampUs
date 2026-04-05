import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../api/supabase';
import { getColors, Spacing, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import DropdownSheet from '../../components/DropdownSheet';
import { updateProfile } from '../../api/auth';
import { Profile } from '../../types/database';
import {
  DEPARTMENT_OPTIONS,
  getDepartmentAcademicLimits,
  getSectionOptions,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';
import { formatFacultyDesignation, getDesignationOptionsByRole, isAdminRole, isLeadershipDesignation } from '../../utils/roles';

type AcademicDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AcademicDetails'>;

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    gradientBg: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      backgroundColor: 'rgba(255,255,255,0.72)',
      borderBottomWidth: 0,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    saveButton: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: '#7c4a1b',
      backgroundColor: Colors.softPeach,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      overflow: 'hidden',
    },
    saveAction: {
      borderRadius: 999,
    },
    content: {
      padding: 20,
    },
    card: {
      backgroundColor: 'rgba(255,246,236,0.96)',
      borderRadius: 20,
      padding: 18,
      borderWidth: 0,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    alumniBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: Colors.softPeach,
    },
    alumniBadgeText: {
      color: '#8b572a',
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.xs,
    },
    inputGroup: {
      gap: 8,
      marginBottom: 16,
      overflow: 'visible',
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
    },
    input: {
      height: 52,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: FontSizes.md,
      color: Colors.text,
      borderWidth: 1,
      borderColor: 'rgba(194,116,43,0.14)',
    },
    disabledInput: {
      opacity: 0.65,
    },
    twoCol: {
      flexDirection: 'row',
      gap: 10,
    },
    col: {
      flex: 1,
    },
    dropdownField: {
      height: 52,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 44,
      paddingRight: 12,
      borderWidth: 1,
      borderColor: 'rgba(194,116,43,0.14)',
    },
    dropdownContainer: {
      position: 'relative',
      overflow: 'visible',
      zIndex: 20,
    },
    dropdownLeftIcon: {
      position: 'absolute',
      left: 14,
    },
    dropdownText: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      fontWeight: FontWeights.medium,
    },
    dropdownPlaceholder: {
      color: Colors.textSecondary,
    },
    dropdownList: {
      position: 'absolute',
      top: 60,
      left: 0,
      right: 0,
      borderRadius: 16,
      backgroundColor: '#fffaf4',
      borderWidth: 0,
      maxHeight: 200,
      zIndex: 40,
    },
    dropdownListScroll: {
      maxHeight: 200,
    },
    dropdownItem: {
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    dropdownItemText: {
      color: Colors.text,
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.medium,
    },
    errorText: {
      color: '#ef4444',
      fontSize: FontSizes.xs,
      marginTop: 4,
    },
    helperText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
  });

export default function AcademicDetailsScreen() {
  const navigation = useNavigation<AcademicDetailsScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const currentYear = new Date().getFullYear();
  const admissionYearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => currentYear - index),
    [currentYear]
  );

  const [department, setDepartment] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [section, setSection] = useState<'A' | 'B' | 'C' | null>(null);
  const [facultyDesignation, setFacultyDesignation] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<
    'department' | 'year_of_admission' | 'specialization' | 'section' | 'faculty_designation' | null
  >(null);
  const [errors, setErrors] = useState<{
    department?: string;
    specialization?: string;
    section?: string;
    roll_number?: string;
    year_of_admission?: string;
    faculty_designation?: string;
  }>({});
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });
  const [leadershipDesignationOwners, setLeadershipDesignationOwners] = useState<Record<string, string>>({});

  const computedAcademic = useMemo(
    () => calculateAcademicFields(yearOfAdmission, department),
    [yearOfAdmission, department]
  );
  const role = profile?.role;
  const isStudent = role === 'student';
  const isFaculty = role === 'faculty';
  const isAlumni = role === 'alumni';
  const isAdmin = isAdminRole(role);
  const isFacultyLike = isFaculty || isAdmin;
  const isLeadership = isLeadershipDesignation(facultyDesignation);
  const isAlumniLocked = isAlumni;
  const isGraduated = (isAlumni ? profile?.academic_status : computedAcademic.academic_status) === 'graduated';
  const currentProfileId = user?.id || profile?.id || '';
  const designationOptions = useMemo(() => {
    const base = getDesignationOptionsByRole(role);
    return base.filter((designation) => {
      if (designation !== 'principal' && designation !== 'vice_principal') return true;
      const ownerId = leadershipDesignationOwners[designation];
      return !ownerId || ownerId === currentProfileId;
    });
  }, [role, leadershipDesignationOwners, currentProfileId]);
  const specializationOptions = useMemo(
    () => getSpecializationOptions(department),
    [department]
  );
  const sectionOptions = useMemo(() => getSectionOptions(department), [department]);
  const programLimits = useMemo(() => getDepartmentAcademicLimits(department), [department]);

  useEffect(() => {
    if (!profile) return;
    setDepartment(profile.department || null);
    setSpecialization(profile.specialization || null);
    setSection(profile.section || null);
    setFacultyDesignation(profile.faculty_designation || null);
    setRollNumber(profile.roll_number || '');
    setYearOfAdmission(profile.year_of_admission ?? null);
  }, [profile]);

  useEffect(() => {
    if (!specialization) return;
    if (!specializationOptions.includes(specialization)) {
      setSpecialization(null);
    }
  }, [specialization, specializationOptions]);

  useEffect(() => {
    if (!sectionOptions.includes(section || '')) {
      setSection((sectionOptions[0] || 'A') as 'A' | 'B' | 'C');
    }
  }, [section, sectionOptions]);

  useEffect(() => {
    if (!isFacultyLike) return;

    const loadLeadershipOwners = async () => {
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
      setLeadershipDesignationOwners(owners);
    };

    loadLeadershipOwners();
  }, [isFacultyLike]);

  const selectAndClose = (action: () => void) => {
    action();
    setOpenDropdown(null);
  };

  const activeDropdown = useMemo(() => {
    if (!openDropdown) return null;
    if (openDropdown === 'department') {
      return { title: 'Select Department', options: [...DEPARTMENT_OPTIONS] as string[] };
    }
    if (openDropdown === 'year_of_admission') {
      return { title: 'Select Admission Year', options: admissionYearOptions.map(String) };
    }
    if (openDropdown === 'section') {
      return { title: 'Select Section', options: sectionOptions };
    }
    if (openDropdown === 'faculty_designation') {
      return { title: 'Select Designation', options: [...designationOptions] as string[] };
    }
    return { title: 'Select Specialization', options: specializationOptions };
  }, [openDropdown, admissionYearOptions, designationOptions, specializationOptions, sectionOptions]);

  const handleSheetSelect = (value: string) => {
    if (openDropdown === 'department') {
      selectAndClose(() => {
        setDepartment(value);
        setSpecialization(null);
        setSection((getSectionOptions(value)[0] || 'A') as 'A' | 'B' | 'C');
      });
      return;
    }
    if (openDropdown === 'year_of_admission') {
      selectAndClose(() => setYearOfAdmission(Number(value)));
      return;
    }
    if (openDropdown === 'section') {
      selectAndClose(() => setSection(value as 'A' | 'B' | 'C'));
      return;
    }
    if (openDropdown === 'faculty_designation') {
      selectAndClose(() => {
        setFacultyDesignation(value);
        if (isLeadershipDesignation(value)) {
          setDepartment(null);
          setSpecialization(null);
        }
      });
      return;
    }
    if (openDropdown === 'specialization') {
      selectAndClose(() => setSpecialization(value));
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const nextErrors: typeof errors = {};

    if (isStudent) {
      if (!yearOfAdmission) nextErrors.year_of_admission = 'Select year of admission';
      if (!department) nextErrors.department = 'Select department';
      if (!specialization) nextErrors.specialization = 'Select specialization';
      if (sectionOptions.length > 1 && !section) nextErrors.section = 'Select section';

      if (!rollNumber.trim()) {
        nextErrors.roll_number = 'Roll number is required';
      } else if (!ROLL_NUMBER_REGEX.test(rollNumber.trim())) {
        nextErrors.roll_number = 'Invalid roll number format';
      }
    }

    if (isFacultyLike) {
      if (!facultyDesignation) nextErrors.faculty_designation = 'Select designation';
      if (!isLeadershipDesignation(facultyDesignation)) {
        if (!department) nextErrors.department = 'Select department';
        if (!specialization) nextErrors.specialization = 'Select specialization';
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsLoading(true);
      const updates: Partial<Profile> = {};

      if (isStudent) {
        updates.department = department || undefined;
        updates.specialization = specialization || undefined;
        updates.section = section || undefined;
        updates.roll_number = rollNumber.trim() || undefined;
        updates.year_of_admission = yearOfAdmission || undefined;
        updates.year = computedAcademic.year || undefined;
        updates.semester = computedAcademic.semester || undefined;
        updates.batch = computedAcademic.batch || undefined;
        updates.academic_status = computedAcademic.academic_status;
        updates.faculty_designation = undefined;
      }

      if (isFacultyLike) {
        updates.department = isLeadership ? null : (department || undefined);
        updates.specialization = isLeadership ? null : (specialization || undefined);
        updates.faculty_designation = (facultyDesignation as any) || undefined;
        updates.section = undefined;
        updates.roll_number = undefined;
        updates.year_of_admission = undefined;
        updates.year = undefined;
        updates.semester = undefined;
        updates.batch = undefined;
        updates.academic_status = undefined;
      }

      if (isAlumni) {
        updates.department = department || undefined;
        updates.specialization = specialization || undefined;
        updates.batch = profile?.batch || undefined;
        updates.academic_status = profile?.academic_status || undefined;
        updates.faculty_designation = undefined;
        updates.section = undefined;
        updates.roll_number = undefined;
        updates.year_of_admission = undefined;
        updates.year = undefined;
        updates.semester = undefined;
      }

      await updateProfile(user.id, updates);

      await refreshProfile();
      setToast({ visible: true, message: 'Academic details updated successfully', type: 'success' });
      setTimeout(() => navigation.goBack(), 1000);
    } catch (error: any) {
      setToast({ visible: true, message: error.message || 'Failed to update academic details', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={styles.gradientBg}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Academic Details</Text>
          <TouchableOpacity style={styles.saveAction} onPress={handleSave} disabled={isLoading}>
            {isLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.saveButton}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Academic Record</Text>
              {isGraduated && (
                <View style={styles.alumniBadge}>
                  <Text style={styles.alumniBadgeText}>Alumni</Text>
                </View>
              )}
            </View>

            {isStudent && (
              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Year of Admission</Text>
                    <View style={styles.dropdownContainer}>
                      <TouchableOpacity
                        style={[styles.dropdownField, (isGraduated || isAlumniLocked) && styles.disabledInput]}
                        disabled={isGraduated || isAlumniLocked}
                        onPress={() => setOpenDropdown(openDropdown === 'year_of_admission' ? null : 'year_of_admission')}
                      >
                        <MaterialIcons name="calendar-month" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                        <Text style={[styles.dropdownText, !yearOfAdmission && styles.dropdownPlaceholder]}>
                          {yearOfAdmission ? String(yearOfAdmission) : 'Select'}
                        </Text>
                        <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {!!errors.year_of_admission && <Text style={styles.errorText}>{errors.year_of_admission}</Text>}
                  </View>
                </View>

                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Section</Text>
                    <View style={styles.dropdownContainer}>
                      {sectionOptions.length > 1 ? (
                        <TouchableOpacity
                          style={[styles.dropdownField, (isGraduated || isAlumniLocked) && styles.disabledInput]}
                          disabled={isGraduated || isAlumniLocked}
                          onPress={() => setOpenDropdown(openDropdown === 'section' ? null : 'section')}
                        >
                          <MaterialIcons name="groups" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                          <Text style={[styles.dropdownText, !section && styles.dropdownPlaceholder]}>
                            {section || sectionOptions[0] || 'A'}
                          </Text>
                          <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.dropdownField, styles.disabledInput]}>
                          <MaterialIcons name="groups" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                          <Text style={styles.dropdownText}>{sectionOptions[0] || 'A'}</Text>
                        </View>
                      )}
                    </View>
                    {!!errors.section && <Text style={styles.errorText}>{errors.section}</Text>}
                  </View>
                </View>
              </View>
            )}

            {(isStudent || isAlumni || (isFacultyLike && !isLeadership)) && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Department</Text>
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[styles.dropdownField, (isGraduated || isAlumniLocked) && styles.disabledInput]}
                    disabled={isGraduated || isAlumniLocked}
                    onPress={() => setOpenDropdown(openDropdown === 'department' ? null : 'department')}
                  >
                    <MaterialIcons name="apartment" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                    <Text style={[styles.dropdownText, !department && styles.dropdownPlaceholder]}>
                      {department || 'Select department'}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                {!!errors.department && <Text style={styles.errorText}>{errors.department}</Text>}
              </View>
            )}

            {(isStudent || isAlumni || (isFacultyLike && !isLeadership)) && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Specialization</Text>
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[styles.dropdownField, (isGraduated || isAlumniLocked) && styles.disabledInput]}
                    disabled={isGraduated || isAlumniLocked || !department}
                    onPress={() => setOpenDropdown(openDropdown === 'specialization' ? null : 'specialization')}
                  >
                    <MaterialIcons name="psychology" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                    <Text style={[styles.dropdownText, !specialization && styles.dropdownPlaceholder]}>
                      {specialization || (department ? 'Select specialization' : 'Select department first')}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                {!!errors.specialization && <Text style={styles.errorText}>{errors.specialization}</Text>}
              </View>
            )}

            {isFacultyLike && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Designation</Text>
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[styles.dropdownField, isAlumniLocked && styles.disabledInput]}
                    disabled={isAlumniLocked}
                    onPress={() => setOpenDropdown(openDropdown === 'faculty_designation' ? null : 'faculty_designation')}
                  >
                    <MaterialIcons name="badge" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                    <Text style={[styles.dropdownText, !facultyDesignation && styles.dropdownPlaceholder]}>
                      {facultyDesignation ? formatFacultyDesignation(facultyDesignation) : 'Select designation'}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                {!!errors.faculty_designation && <Text style={styles.errorText}>{errors.faculty_designation}</Text>}
              </View>
            )}

            {isStudent && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Roll Number</Text>
                <TextInput
                  style={[styles.input, (isGraduated || isAlumniLocked) && styles.disabledInput]}
                  value={rollNumber}
                  editable={!isGraduated && !isAlumniLocked}
                  onChangeText={setRollNumber}
                  placeholder="e.g. CSE/23/001"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="characters"
                />
                {!!errors.roll_number && <Text style={styles.errorText}>{errors.roll_number}</Text>}
                <Text style={styles.helperText}>Allowed: letters, numbers, / and -</Text>
              </View>
            )}

            {isStudent && (
              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Year</Text>
                    <TextInput style={[styles.input, styles.disabledInput]} value={computedAcademic.year ? `${computedAcademic.year}/${programLimits.maxYears}` : '-'} editable={false} />
                  </View>
                </View>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Semester</Text>
                    <TextInput
                      style={[styles.input, styles.disabledInput]}
                      value={computedAcademic.semester ? `${computedAcademic.semester}/${programLimits.maxSemesters}` : '-'}
                      editable={false}
                    />
                  </View>
                </View>
              </View>
            )}

            {isAlumni && (
              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Batch</Text>
                    <TextInput style={[styles.input, styles.disabledInput]} value={profile?.batch || computedAcademic.batch || '-'} editable={false} />
                  </View>
                </View>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Academic Status</Text>
                    <TextInput style={[styles.input, styles.disabledInput]} value={profile?.academic_status || computedAcademic.academic_status} editable={false} />
                  </View>
                </View>
              </View>
            )}
            </View>
          </View>
        </ScrollView>

        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
        <DropdownSheet
          visible={!!openDropdown && !isGraduated && !isAlumniLocked && !!activeDropdown}
          title={activeDropdown?.title || 'Select Option'}
          options={activeDropdown?.options || []}
          onSelect={handleSheetSelect}
          onClose={() => setOpenDropdown(null)}
        />
      </LinearGradient>
    </SafeAreaView>
  );
}
