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
import { updateProfile, uploadAvatar } from '../../api/auth';
import * as ImagePicker from 'expo-image-picker';
import {
  DEPARTMENT_OPTIONS,
  SECTION_OPTIONS,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';

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
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }>({ visible: false, message: '', type: 'success' });

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
    } = {};

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

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsLoading(true);
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined,
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
                        <TouchableOpacity
                          key={option}
                          style={styles.dropdownItem}
                          onPress={() => selectAndClose(() => setYearOfAdmission(option))}
                        >
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
                        <TouchableOpacity
                          key={option}
                          style={styles.dropdownItem}
                          onPress={() => selectAndClose(() => setSection(option))}
                        >
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
                    <TouchableOpacity
                      key={option}
                      style={styles.dropdownItem}
                      onPress={() => selectAndClose(() => setSpecialization(option))}
                    >
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
            </View>

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

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Batch</Text>
                  <TextInput
                    style={[styles.input, styles.disabledInput]}
                    value={computedAcademic.batch || '-'}
                    editable={false}
                  />
                </View>
              </View>
              <View style={styles.col}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Academic Status</Text>
                  <TextInput
                    style={[styles.input, styles.disabledInput]}
                    value={computedAcademic.academic_status}
                    editable={false}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}
