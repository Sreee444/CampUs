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
  Alert,
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
import { removeAvatar, updateProfile, uploadAvatar } from '../../api/auth';
import { Profile } from '../../types/database';
import * as ImagePicker from 'expo-image-picker';
import { getCleanInitials } from '../../utils/roles';
import {
  DEPARTMENT_OPTIONS,
  getDepartmentAcademicLimits,
  getSectionOptions,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';
import { formatFacultyDesignation, getDesignationOptionsByRole, isAdminRole, isLeadershipDesignation } from '../../utils/roles';

type EditProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditProfile'>;

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
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 20,
      gap: 18,
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
    avatarImage: {
      width: 92,
      height: 92,
      borderRadius: 46,
    },
    avatarText: {
      fontSize: 30,
      fontWeight: FontWeights.bold,
      color: '#ffffff',
    },
    avatarWrap: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      width: 92,
      height: 92,
      marginBottom: 12,
    },
    avatarLoadingOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: 46,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLoadingText: {
      marginTop: 6,
      fontSize: FontSizes.xs,
      color: '#ffffff',
      fontWeight: FontWeights.semibold,
    },
    photoRow: {
      flexDirection: 'row',
      gap: 16,
    },
    changePhotoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: Colors.softPeach,
      borderWidth: 0,
    },
    changePhotoText: {
      fontSize: FontSizes.sm,
      color: '#9a5a25',
      fontWeight: FontWeights.medium,
    },
    removePhotoText: {
      fontSize: FontSizes.sm,
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
      backgroundColor: '#ffffff',
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: FontSizes.md,
      color: Colors.text,
      borderWidth: 1,
      borderColor: 'rgba(194,116,43,0.14)',
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 52,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      paddingHorizontal: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: 'rgba(194,116,43,0.14)',
    },
    countryCodeBox: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: Colors.softPeach,
    },
    countryCodeText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    phoneInput: {
      flex: 1,
      height: 52,
      fontSize: FontSizes.md,
      color: Colors.text,
      paddingHorizontal: 8,
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
    socialInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 52,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      paddingHorizontal: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: 'rgba(194,116,43,0.14)',
    },
    socialInputIcon: {
      flexShrink: 0,
    },
    socialInputInner: {
      flex: 1,
      fontSize: FontSizes.md,
      color: Colors.text,
      height: 52,
    },
  });

export default function EditProfileScreen() {
  const navigation = useNavigation<EditProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const BIO_MAX = 200;

  const currentYear = new Date().getFullYear();
  const admissionYearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => currentYear - index),
    [currentYear]
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');

  const [department, setDepartment] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [section, setSection] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [facultyDesignation, setFacultyDesignation] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
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
  const normalizeDesignationInput = (value: string | null | undefined) =>
    String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const normalizedFacultyDesignation = normalizeDesignationInput(facultyDesignation);
  const isLeadership = isLeadershipDesignation(normalizedFacultyDesignation);
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
    if (!specialization) return;
    if (!specializationOptions.includes(specialization)) {
      setSpecialization(null);
    }
  }, [specialization, specializationOptions]);

  useEffect(() => {
    if (!sectionOptions.includes(section || '')) {
      setSection((sectionOptions[0] || 'A') as 'A' | 'B' | 'C' | 'D');
    }
  }, [section, sectionOptions]);

  useEffect(() => {
    if (!profile) return;
    if (isDirty) return;
    setFullName(profile.full_name || '');
    setEmail(profile.email || '');
    setPhone(profile.phone || '');
    setPhoneError('');
    setBio(profile.bio || '');
    setAvatarUrl(profile.avatar_url || '');
    setAvatarVersion(0);
    setDepartment(profile.department || null);
    setSpecialization(profile.specialization || null);
    setLinkedinUrl(profile.linkedin_url || '');
    setGithubUrl(profile.github_url || '');
    const profileSection = String(profile.section || '').toUpperCase();
    setSection(
      (sectionOptions.includes(profileSection) ? profileSection : sectionOptions[0] || null) as 'A' | 'B' | 'C' | 'D' | null
    );
    setFacultyDesignation(profile.faculty_designation ? formatFacultyDesignation(profile.faculty_designation) : null);
    setRollNumber(profile.roll_number || '');
    setYearOfAdmission(profile.year_of_admission ?? null);
  }, [profile, isDirty, sectionOptions]);

  useEffect(() => {
    setIsDirty(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!isFacultyLike) return;

    const loadLeadershipOwners = async () => {
      type LeadershipRow = { id: string | null; faculty_designation: string | null };
      const { data, error } = await supabase
        .from('profiles')
        .select('id, faculty_designation')
        .in('faculty_designation', ['principal', 'vice_principal']);

      if (error) return;

      const owners: Record<string, string> = {};
      for (const row of (data as LeadershipRow[] | null) || []) {
        if (row?.faculty_designation && row?.id) {
          owners[row.faculty_designation] = row.id;
        }
      }
      setLeadershipDesignationOwners(owners);
    };

    loadLeadershipOwners();
  }, [isFacultyLike]);

  const getInitials = () => getCleanInitials(fullName) || 'U';

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
    const userId = user?.id ?? profile?.id;
    if (!userId) return;
    try {
      setIsUploading(true);
      const publicUrl = await uploadAvatar(userId, uri);
      await updateProfile(userId, { avatar_url: publicUrl });
      setAvatarUrl(publicUrl);
      setAvatarVersion(Date.now());
      setIsDirty(true);
      await refreshProfile();
      setToast({ visible: true, message: 'Avatar uploaded successfully', type: 'success' });
    } catch (error: any) {
      console.error('EditProfile avatar upload failed:', error);
      setToast({ visible: true, message: error.message || 'Failed to upload avatar', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const userId = user?.id ?? profile?.id;
    if (!userId) return;

    if (!avatarUrl) {
      setToast({ visible: true, message: 'No avatar to remove', type: 'error' });
      return;
    }

    Alert.alert(
      'Remove Profile Photo',
      'Are you sure you want to remove your profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUploading(true);
              const removal = await removeAvatar(userId, avatarUrl);
              await updateProfile(userId, { avatar_url: null });
              setAvatarUrl('');
              setAvatarVersion(Date.now());
              setIsDirty(true);
              await refreshProfile();
              setToast({
                visible: true,
                message: removal.warning || 'Avatar removed successfully',
                type: removal.warning ? 'info' : 'success',
              });
            } catch (error: any) {
              console.error('EditProfile avatar remove failed:', error);
              setToast({ visible: true, message: error.message || 'Failed to remove avatar', type: 'error' });
            } finally {
              setIsUploading(false);
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    const userId = user?.id ?? profile?.id;
    if (!userId) return;

    if (!fullName.trim()) {
      setToast({ visible: true, message: 'Name is required', type: 'error' });
      return;
    }

    setErrors({});
    if (phoneError) {
      setToast({ visible: true, message: phoneError, type: 'error' });
      return;
    }

    try {
      setIsLoading(true);
      const updates: Partial<Profile> = {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      };

      // Social links — only for student/faculty/admin
      if (isStudent || isFaculty || isAdmin) {
        updates.linkedin_url = linkedinUrl.trim() || null;
        updates.github_url = githubUrl.trim() || null;
      }

      await updateProfile(userId, updates);

      setIsDirty(false);
      await refreshProfile();
      setToast({ visible: true, message: 'Profile updated successfully', type: 'success' });
      setTimeout(() => navigation.goBack(), 1000);
    } catch (error: any) {
      console.error('EditProfile update failed:', error);
      setToast({ visible: true, message: error.message || 'Failed to update profile', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const selectAndClose = (action: () => void) => {
    setIsDirty(true);
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
      return { title: 'Select Designation', options: designationOptions };
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
      <LinearGradient colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']} locations={[0, 0.5, 1]} style={styles.gradientBg}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity style={styles.saveAction} onPress={handleSave} disabled={isLoading}>
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
              <View style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarVersion ? `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}v=${avatarVersion}` : avatarUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials()}</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.avatarLoadingText}>Uploading</Text>
                  </View>
                )}
              </View>
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.changePhotoButton} onPress={handlePickImage} disabled={isUploading}>
                  <MaterialIcons name="photo-library" size={18} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.changePhotoButton} onPress={handleTakePhoto} disabled={isUploading}>
                  <MaterialIcons name="camera-alt" size={18} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.changePhotoButton} onPress={handleRemoveAvatar} disabled={isUploading || !avatarUrl}>
                  <MaterialIcons name="delete-outline" size={18} color={avatarUrl ? '#ef4444' : Colors.textSecondary} />
                  <Text style={[styles.removePhotoText, { color: avatarUrl ? '#ef4444' : Colors.textSecondary }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={(value) => {
                  setIsDirty(true);
                  setFullName(value);
                }}
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
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(value) => {
                    const rawDigits = value.replace(/\D/g, '');
                    const digitsOnly = rawDigits.slice(0, 10);
                    setIsDirty(true);
                    setPhone(digitsOnly);
                    if (rawDigits.length > 10) {
                      setPhoneError('Phone number must be 10 digits.');
                    } else if (digitsOnly.length > 0 && digitsOnly.length < 10) {
                      setPhoneError('Enter a 10-digit mobile number.');
                    } else {
                      setPhoneError('');
                    }
                  }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
              {!!phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
              {!phoneError && <Text style={styles.helperText}>10-digit mobile number</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={bio}
                onChangeText={(value) => {
                  const trimmed = value.slice(0, BIO_MAX);
                  setIsDirty(true);
                  setBio(trimmed);
                }}
                placeholder="Tell us about yourself"
                placeholderTextColor={Colors.textSecondary}
                multiline
                maxLength={BIO_MAX}
              />
              <Text style={styles.helperText}>{bio.length}/{BIO_MAX} characters</Text>
            </View>

            {/* Social Links — students, faculty, admin only */}
            {(isStudent || isFaculty || isAdmin) && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>LinkedIn Profile</Text>
                  <View style={styles.socialInputRow}>
                    <MaterialIcons name="language" size={18} color="#2563eb" style={styles.socialInputIcon} />
                    <TextInput
                      style={styles.socialInputInner}
                      value={linkedinUrl}
                      onChangeText={(v) => { setIsDirty(true); setLinkedinUrl(v); }}
                      placeholder="linkedin.com/in/yourname"
                      placeholderTextColor={Colors.textSecondary}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  </View>
                  <Text style={styles.helperText}>Optional · shown on your public profile</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>GitHub Profile</Text>
                  <View style={styles.socialInputRow}>
                    <MaterialIcons name="code" size={18} color="#111827" style={styles.socialInputIcon} />
                    <TextInput
                      style={styles.socialInputInner}
                      value={githubUrl}
                      onChangeText={(v) => { setIsDirty(true); setGithubUrl(v); }}
                      placeholder="github.com/yourhandle"
                      placeholderTextColor={Colors.textSecondary}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  </View>
                  <Text style={styles.helperText}>Optional · shown on your public profile</Text>
                </View>
              </>
            )}
          </View>

          {false && <View style={styles.card}>
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
                    onChangeText={(value) => {
                      setIsDirty(true);
                      setRollNumber(value);
                    }}
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
                      value={computedAcademic.year ? `${computedAcademic.year}/${programLimits.maxYears}` : '-'}
                      editable={false}
                    />
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
          </View>}
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
      </LinearGradient>
    </SafeAreaView>
  );
}
