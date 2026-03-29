import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Image,
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
import DropdownSheet from '../../components/DropdownSheet';
import { updateProfile, uploadAvatar } from '../../api/auth';
import { Profile } from '../../types/database';
import * as ImagePicker from 'expo-image-picker';
import {
  DEPARTMENT_OPTIONS,
  SECTION_OPTIONS,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';
import { FACULTY_DESIGNATIONS, formatFacultyDesignation } from '../../utils/roles';

type EditProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditProfile'>;

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
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 20,
      gap: 18,
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
    avatarSection: {
      alignItems: 'center',
      marginBottom: 14,
    },
    avatar: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    avatarText: {
      fontSize: 30,
      fontWeight: FontWeights.bold,
      color: '#ffffff',
    },
    photoRow: {
      flexDirection: 'row',
      gap: 16,
    },
    changePhotoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    changePhotoText: {
      fontSize: FontSizes.sm,
      color: Colors.primary,
      fontWeight: FontWeights.medium,
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
      backgroundColor: Colors.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: FontSizes.md,
      color: Colors.text,
      ...Shadows.sm,
    },
    textArea: {
      minHeight: 96,
      height: undefined,
      textAlignVertical: 'top',
      paddingTop: 14,
    },
    disabledInput: {
      opacity: 0.65,
    },
    helperText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    errorText: {
      color: '#ef4444',
      fontSize: FontSizes.xs,
      marginTop: 4,
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
      backgroundColor: Colors.card,
      maxHeight: 200,
      zIndex: 40,
      ...Shadows.sm,
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
  });

export default function EditProfileScreen() {
  const navigation = useNavigation<EditProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const currentYear = new Date().getFullYear();
  const admissionYearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => currentYear - index),
    [currentYear]
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [department, setDepartment] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [section, setSection] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [facultyDesignation, setFacultyDesignation] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({ visible: false, message: '', type: 'success' });

  const computedAcademic = useMemo(
    () => calculateAcademicFields(yearOfAdmission),
    [yearOfAdmission]
  );
  const role = profile?.role;
  const isStudent = role === 'student';
  const isFaculty = role === 'faculty';
  const isAlumni = role === 'alumni';
  const isAdmin = role === 'admin';
  const isFacultyLike = isFaculty || isAdmin;
  const isAlumniLocked = isAlumni;
  const isGraduated = (isAlumni ? profile?.academic_status : computedAcademic.academic_status) === 'graduated';
  const specializationOptions = useMemo(
    () => getSpecializationOptions(department),
    [department]
  );

  useEffect(() => {
    if (!specialization) return;
    if (!specializationOptions.includes(specialization)) {
      setSpecialization(null);
    }
  }, [specialization, specializationOptions]);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setEmail(profile.email || '');
    setPhone(profile.phone || '');
    setBio(profile.bio || '');
    setAvatarUrl(profile.avatar_url || '');
    setDepartment(profile.department || null);
    setSpecialization(profile.specialization || null);
    setSection(profile.section || null);
    setFacultyDesignation(profile.faculty_designation || null);
    setRollNumber(profile.roll_number || '');
    setYearOfAdmission(profile.year_of_admission ?? null);
  }, [profile]);

  const getInitials = () => {
    if (!fullName) return 'U';
    const [first = '', second = ''] = fullName.trim().split(' ');
    return `${first[0] || ''}${second[0] || ''}`.toUpperCase();
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Permission required to access photos', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await handleUploadAvatar(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Camera permission required', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await handleUploadAvatar(result.assets[0].uri);
    }
  };

  const handleUploadAvatar = async (uri: string) => {
    if (!user) return;
    try {
      setIsUploading(true);
      const publicUrl = await uploadAvatar(user.id, uri);
      setAvatarUrl(publicUrl);
      setToast({ visible: true, message: 'Avatar uploaded successfully', type: 'success' });
    } catch (error: any) {
      setToast({ visible: true, message: error.message || 'Failed to upload avatar', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!fullName.trim()) {
      setToast({ visible: true, message: 'Name is required', type: 'error' });
      return;
    }

    const nextErrors: {
      department?: string;
      specialization?: string;
      section?: string;
      roll_number?: string;
      year_of_admission?: string;
      faculty_designation?: string;
    } = {};

    if (isStudent) {
      if (!yearOfAdmission) {
        nextErrors.year_of_admission = 'Select year of admission';
      } else if (yearOfAdmission < 2000 || yearOfAdmission > currentYear + 1) {
        nextErrors.year_of_admission = 'Enter a valid admission year';
      }

      if (!department) nextErrors.department = 'Select department';
      if (!specialization) nextErrors.specialization = 'Select specialization';
      if (!section) nextErrors.section = 'Select section';

      if (!rollNumber.trim()) {
        nextErrors.roll_number = 'Roll number is required';
      } else if (!ROLL_NUMBER_REGEX.test(rollNumber.trim())) {
        nextErrors.roll_number = 'Invalid roll number format';
      }
    }

    if (isFacultyLike) {
      if (!department) nextErrors.department = 'Select department';
      if (!specialization) nextErrors.specialization = 'Select specialization';
      if (!facultyDesignation) nextErrors.faculty_designation = 'Select designation';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsLoading(true);
      const updates: Partial<Profile> = {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      };

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
        updates.department = department || undefined;
        updates.specialization = specialization || undefined;
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
      setToast({ visible: true, message: 'Profile updated successfully', type: 'success' });
      setTimeout(() => navigation.goBack(), 1000);
    } catch (error: any) {
      setToast({ visible: true, message: error.message || 'Failed to update profile', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

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
      return { title: 'Select Section', options: [...SECTION_OPTIONS] as string[] };
    }
    if (openDropdown === 'faculty_designation') {
      return { title: 'Select Designation', options: [...FACULTY_DESIGNATIONS] as string[] };
    }
    return { title: 'Select Specialization', options: specializationOptions };
  }, [openDropdown, admissionYearOptions, specializationOptions]);

  const handleSheetSelect = (value: string) => {
    if (openDropdown === 'department') {
      selectAndClose(() => {
        setDepartment(value);
        setSpecialization(null);
      });
      return;
    }
    if (openDropdown === 'year_of_admission') {
      selectAndClose(() => setYearOfAdmission(Number(value)));
      return;
    }
    if (openDropdown === 'section') {
      selectAndClose(() => setSection(value as 'A' | 'B' | 'C' | 'D'));
      return;
    }
    if (openDropdown === 'faculty_designation') {
      selectAndClose(() => setFacultyDesignation(value));
      return;
    }
    if (openDropdown === 'specialization') {
      selectAndClose(() => setSpecialization(value));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={isLoading}>
          {isLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.saveButton}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Personal Info</Text>
            </View>

            <View style={styles.avatarSection}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials()}</Text>
                </View>
              )}
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.changePhotoButton} onPress={handlePickImage} disabled={isUploading}>
                  <MaterialIcons name="photo-library" size={18} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.changePhotoButton} onPress={handleTakePhoto} disabled={isUploading}>
                  <MaterialIcons name="camera-alt" size={18} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Camera</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your name"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={email}
                editable={false}
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.helperText}>Email cannot be changed</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself"
                placeholderTextColor={Colors.textSecondary}
                multiline
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Academic Details</Text>
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
                      <TouchableOpacity
                        style={[styles.dropdownField, (isGraduated || isAlumniLocked) && styles.disabledInput]}
                        disabled={isGraduated || isAlumniLocked}
                        onPress={() => setOpenDropdown(openDropdown === 'section' ? null : 'section')}
                      >
                        <MaterialIcons name="groups" size={20} color={Colors.textSecondary} style={styles.dropdownLeftIcon} />
                        <Text style={[styles.dropdownText, !section && styles.dropdownPlaceholder]}>
                          {section || 'Select'}
                        </Text>
                        <MaterialIcons name="keyboard-arrow-down" size={22} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {!!errors.section && <Text style={styles.errorText}>{errors.section}</Text>}
                  </View>
                </View>
              </View>
            )}

            {(isStudent || isFacultyLike || isAlumni) && (
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

            {(isStudent || isFacultyLike || isAlumni) && (
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
              </View>
            )}

            {isStudent && (
              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Year</Text>
                    <TextInput
                      style={[styles.input, styles.disabledInput]}
                      value={computedAcademic.year ? String(computedAcademic.year) : '-'}
                      editable={false}
                    />
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
            )}

            {isAlumni && (
              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Batch</Text>
                    <TextInput
                      style={[styles.input, styles.disabledInput]}
                      value={profile?.batch || computedAcademic.batch || '-'}
                      editable={false}
                    />
                  </View>
                </View>
                <View style={styles.col}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Academic Status</Text>
                    <TextInput
                      style={[styles.input, styles.disabledInput]}
                      value={profile?.academic_status || computedAcademic.academic_status}
                      editable={false}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
      <DropdownSheet
        visible={!!openDropdown && !isGraduated && !isAlumniLocked && !!activeDropdown}
        title={activeDropdown?.title || 'Select Option'}
        options={activeDropdown?.options || []}
        onSelect={handleSheetSelect}
        onClose={() => setOpenDropdown(null)}
      />
    </SafeAreaView>
  );
}
