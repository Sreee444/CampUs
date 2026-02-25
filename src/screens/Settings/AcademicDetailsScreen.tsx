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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile } from '../../api/auth';
import {
  DEPARTMENT_OPTIONS,
  SECTION_OPTIONS,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';

type AcademicDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AcademicDetails'>;

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      backgroundColor: Colors.surface,
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
      color: Colors.primary,
      paddingHorizontal: 8,
    },
    content: {
      padding: 20,
    },
    card: {
      backgroundColor: Colors.surface,
      borderRadius: 20,
      padding: 18,
      ...Shadows.sm,
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
      backgroundColor: '#dcfce7',
    },
    alumniBadgeText: {
      color: '#166534',
      fontWeight: FontWeights.semibold,
      fontSize: FontSizes.xs,
    },
    inputGroup: {
      gap: 8,
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
    },
    input: {
      height: 52,
      backgroundColor: Colors.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: FontSizes.md,
      color: Colors.text,
      ...Shadows.sm,
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
      backgroundColor: Colors.card,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 44,
      paddingRight: 12,
      ...Shadows.sm,
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
      marginTop: 8,
      borderRadius: 16,
      backgroundColor: Colors.card,
      maxHeight: 200,
      ...Shadows.sm,
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
  const [section, setSection] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<
    'department' | 'year_of_admission' | 'specialization' | 'section' | null
  >(null);
  const [errors, setErrors] = useState<{
    department?: string;
    specialization?: string;
    section?: string;
    roll_number?: string;
    year_of_admission?: string;
  }>({});
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const computedAcademic = useMemo(
    () => calculateAcademicFields(yearOfAdmission),
    [yearOfAdmission]
  );
  const isGraduated = computedAcademic.academic_status === 'graduated';
  const specializationOptions = useMemo(
    () => getSpecializationOptions(department),
    [department]
  );

  useEffect(() => {
    if (!profile) return;
    setDepartment(profile.department || null);
    setSpecialization(profile.specialization || null);
    setSection(profile.section || null);
    setRollNumber(profile.roll_number || '');
    setYearOfAdmission(profile.year_of_admission ?? null);
  }, [profile]);

  useEffect(() => {
    if (!specialization) return;
    if (!specializationOptions.includes(specialization)) {
      setSpecialization(null);
    }
  }, [specialization, specializationOptions]);

  const selectAndClose = (action: () => void) => {
    action();
    setOpenDropdown(null);
  };

  const handleSave = async () => {
    if (!user) return;

    const nextErrors: typeof errors = {};
    if (!yearOfAdmission) nextErrors.year_of_admission = 'Select year of admission';
    if (!department) nextErrors.department = 'Select department';
    if (!specialization) nextErrors.specialization = 'Select specialization';
    if (!section) nextErrors.section = 'Select section';

    if (!rollNumber.trim()) {
      nextErrors.roll_number = 'Roll number is required';
    } else if (!ROLL_NUMBER_REGEX.test(rollNumber.trim())) {
      nextErrors.roll_number = 'Invalid roll number format';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsLoading(true);
      await updateProfile(user.id, {
        department: department || undefined,
        specialization: specialization || undefined,
        section: section || undefined,
        roll_number: rollNumber.trim(),
        year_of_admission: yearOfAdmission || undefined,
        year: computedAcademic.year || undefined,
        semester: computedAcademic.semester || undefined,
        batch: computedAcademic.batch || undefined,
        academic_status: computedAcademic.academic_status,
      });

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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Academic Details</Text>
        <TouchableOpacity onPress={handleSave} disabled={isLoading}>
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

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Year of Admission</Text>
                  <TouchableOpacity
                    style={[styles.dropdownField, isGraduated && styles.disabledInput]}
                    disabled={isGraduated}
                    onPress={() => setOpenDropdown(openDropdown === 'year_of_admission' ? null : 'year_of_admission')}
                  >
                    <MaterialIcons name="calendar-month" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                    <Text style={[styles.dropdownText, !yearOfAdmission && styles.dropdownPlaceholder]}>
                      {yearOfAdmission ? String(yearOfAdmission) : 'Select'}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  {openDropdown === 'year_of_admission' && !isGraduated && (
                    <View style={styles.dropdownList}>
                      {admissionYearOptions.map((option) => (
                        <TouchableOpacity key={option} style={styles.dropdownItem} onPress={() => selectAndClose(() => setYearOfAdmission(option))}>
                          <Text style={styles.dropdownItemText}>{option}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {!!errors.year_of_admission && <Text style={styles.errorText}>{errors.year_of_admission}</Text>}
                </View>
              </View>

              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Section</Text>
                  <TouchableOpacity
                    style={[styles.dropdownField, isGraduated && styles.disabledInput]}
                    disabled={isGraduated}
                    onPress={() => setOpenDropdown(openDropdown === 'section' ? null : 'section')}
                  >
                    <MaterialIcons name="groups" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                    <Text style={[styles.dropdownText, !section && styles.dropdownPlaceholder]}>
                      {section || 'Select'}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  {openDropdown === 'section' && !isGraduated && (
                    <View style={styles.dropdownList}>
                      {SECTION_OPTIONS.map((option) => (
                        <TouchableOpacity key={option} style={styles.dropdownItem} onPress={() => selectAndClose(() => setSection(option))}>
                          <Text style={styles.dropdownItemText}>{option}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {!!errors.section && <Text style={styles.errorText}>{errors.section}</Text>}
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Department</Text>
              <TouchableOpacity
                style={[styles.dropdownField, isGraduated && styles.disabledInput]}
                disabled={isGraduated}
                onPress={() => setOpenDropdown(openDropdown === 'department' ? null : 'department')}
              >
                <MaterialIcons name="apartment" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                <Text style={[styles.dropdownText, !department && styles.dropdownPlaceholder]}>
                  {department || 'Select department'}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              {openDropdown === 'department' && !isGraduated && (
                <View style={styles.dropdownList}>
                  {DEPARTMENT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={styles.dropdownItem}
                      onPress={() =>
                        selectAndClose(() => {
                          setDepartment(option);
                          setSpecialization(null);
                        })
                      }
                    >
                      <Text style={styles.dropdownItemText}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!errors.department && <Text style={styles.errorText}>{errors.department}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Specialization</Text>
              <TouchableOpacity
                style={[styles.dropdownField, isGraduated && styles.disabledInput]}
                disabled={isGraduated || !department}
                onPress={() => setOpenDropdown(openDropdown === 'specialization' ? null : 'specialization')}
              >
                <MaterialIcons name="psychology" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                <Text style={[styles.dropdownText, !specialization && styles.dropdownPlaceholder]}>
                  {specialization || (department ? 'Select specialization' : 'Select department first')}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              {openDropdown === 'specialization' && !isGraduated && department && (
                <View style={styles.dropdownList}>
                  {specializationOptions.map((option) => (
                    <TouchableOpacity key={option} style={styles.dropdownItem} onPress={() => selectAndClose(() => setSpecialization(option))}>
                      <Text style={styles.dropdownItemText}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!errors.specialization && <Text style={styles.errorText}>{errors.specialization}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Roll Number</Text>
              <TextInput
                style={[styles.input, isGraduated && styles.disabledInput]}
                value={rollNumber}
                editable={!isGraduated}
                onChangeText={setRollNumber}
                placeholder="e.g. CSE/23/001"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="characters"
              />
              {!!errors.roll_number && <Text style={styles.errorText}>{errors.roll_number}</Text>}
              <Text style={styles.helperText}>Allowed: letters, numbers, / and -</Text>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Year</Text>
                  <TextInput style={[styles.input, styles.disabledInput]} value={computedAcademic.year ? String(computedAcademic.year) : '-'} editable={false} />
                </View>
              </View>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Semester</Text>
                  <TextInput
                    style={[styles.input, styles.disabledInput]}
                    value={computedAcademic.semester ? String(computedAcademic.semester) : '-'}
                    editable={false}
                  />
                </View>
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Batch</Text>
                  <TextInput style={[styles.input, styles.disabledInput]} value={computedAcademic.batch || '-'} editable={false} />
                </View>
              </View>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Academic Status</Text>
                  <TextInput style={[styles.input, styles.disabledInput]} value={computedAcademic.academic_status} editable={false} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </SafeAreaView>
  );
}

