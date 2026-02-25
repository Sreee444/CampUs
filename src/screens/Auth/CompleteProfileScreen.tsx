import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { updateProfile, uploadAvatar } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { DEPARTMENT_OPTIONS } from '../../constants/academic';
import { calculateAcademicFields } from '../../utils/academic';

type CompleteProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CompleteProfile'>;

type InterestItem = {
  id: string;
  label: string;
  selected: boolean;
};

const interestOptions: InterestItem[] = [
  { id: '1', label: 'AI & ML', selected: false },
  { id: '2', label: 'Web Dev', selected: false },
  { id: '3', label: 'Mobile Dev', selected: false },
  { id: '4', label: 'Cybersecurity', selected: false },
  { id: '5', label: 'IoT', selected: false },
  { id: '6', label: 'Data Science', selected: false },
  { id: '7', label: 'UI/UX', selected: false },
  { id: '8', label: 'Cloud', selected: false },
];

export default function CompleteProfileScreen() {
  const navigation = useNavigation<CompleteProfileScreenNavigationProp>();
  const { user, profile, refreshProfile } = useAuth();
  const currentYear = new Date().getFullYear();
  const admissionYearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => currentYear - index),
    [currentYear]
  );
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState<string | null>(null);
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);
  const [bio, setBio] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<InterestItem[]>(
    interestOptions
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'department' | 'year_of_admission' | null>(null);
  const [errors, setErrors] = useState<{ department?: string; year_of_admission?: string }>({});
  const computedAcademic = useMemo(() => calculateAcademicFields(yearOfAdmission), [yearOfAdmission]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setDepartment(profile.department || null);
      setYearOfAdmission(profile.year_of_admission ?? null);
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || null);
      setSkillsInput((profile.skills || []).join(', '));
      const selected = new Set(profile.interests || []);
      setSelectedInterests(
        interestOptions.map((item) => ({
          ...item,
          selected: selected.has(item.label),
        }))
      );
    }
  }, [profile]);

  const toggleInterest = (id: string) => {
    setSelectedInterests(
      selectedInterests.map((interest) =>
        interest.id === id
          ? { ...interest, selected: !interest.selected }
          : interest
      )
    );
  };

  const handleFinish = async () => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Please sign in again' });
      return;
    }

    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Full name is required' });
      return;
    }

    const nextErrors: { department?: string; year_of_admission?: string } = {};
    if (!department) nextErrors.department = 'Please select a department';
    if (!yearOfAdmission) nextErrors.year_of_admission = 'Please select year of admission';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const selectedInterestLabels = selectedInterests
      .filter((interest) => interest.selected)
      .map((interest) => interest.label);

    const skills = skillsInput
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);

    try {
      setIsSaving(true);
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        department: department || undefined,
        year_of_admission: yearOfAdmission || undefined,
        year: computedAcademic.year || undefined,
        semester: computedAcademic.semester || undefined,
        batch: computedAcademic.batch || undefined,
        academic_status: computedAcademic.academic_status,
        bio: bio.trim() || undefined,
        skills: skills.length ? skills : undefined,
        interests: selectedInterestLabels.length ? selectedInterestLabels : undefined,
      });

      await refreshProfile();
      Toast.show({ type: 'success', text1: 'Profile updated successfully' });
      navigation.replace('MainTabs');
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not update profile',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    Toast.show({ type: 'info', text1: 'Complete your profile later in Settings' });
    navigation.replace('MainTabs');
  };

  const handlePickAvatar = async () => {
    if (!user?.id) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      try {
        const publicUrl = await uploadAvatar(user.id, result.assets[0].uri);
        await updateProfile(user.id, { avatar_url: publicUrl });
        setAvatarUrl(publicUrl);
        await refreshProfile();
        Toast.show({ type: 'success', text1: 'Avatar updated' });
      } catch (error: any) {
        Toast.show({
          type: 'error',
          text1: 'Upload failed',
          text2: error?.message || 'Please try again',
        });
      }
    }
  };

  const handleSelectAdmissionYear = (value: number) => {
    setYearOfAdmission(value);
    setErrors((prev) => ({ ...prev, year_of_admission: undefined }));
    setOpenDropdown(null);
  };

  const handleSelectDepartment = (value: string) => {
    setDepartment(value);
    setErrors((prev) => ({ ...prev, department: undefined }));
    setOpenDropdown(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#fff8f0', '#fff5eb', '#ffe8e0']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <MaterialIcons name="arrow-back" size={24} color="#334155" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Profile</Text>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Upload Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarContainer}
              activeOpacity={0.8}
              onPress={handlePickAvatar}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar} />
              )}
              <View style={styles.avatarOverlay}>
                <MaterialIcons name="photo-camera" size={32} color="#ffffff" />
              </View>
              <View style={styles.avatarBadge}>
                <MaterialIcons name="add" size={18} color="#111818" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarLabel}>
              Let the campus know who you are
            </Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formFields}>
            {/* Full Name Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="person"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Department Field */}
            <View style={styles.dropdownGroup}>
              <Text style={styles.label}>Department</Text>
              <TouchableOpacity style={styles.dropdownField} onPress={() => setOpenDropdown(openDropdown === 'department' ? null : 'department')}>
                <MaterialIcons
                  name="apartment"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <Text style={[styles.dropdownValueText, !department && styles.dropdownPlaceholder]}>
                  {department || 'Select your department'}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={22} color="#64748b" />
              </TouchableOpacity>
              {openDropdown === 'department' && (
                <View style={styles.dropdownList}>
                  {DEPARTMENT_OPTIONS.map((item) => (
                    <TouchableOpacity key={item} style={styles.dropdownItem} onPress={() => handleSelectDepartment(item)}>
                      <Text style={styles.dropdownItemText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!errors.department && <Text style={styles.helperError}>{errors.department}</Text>}
            </View>

            {/* Year of Admission Field */}
            <View style={styles.dropdownGroup}>
              <Text style={styles.label}>Year of Admission</Text>
              <TouchableOpacity style={styles.dropdownField} onPress={() => setOpenDropdown(openDropdown === 'year_of_admission' ? null : 'year_of_admission')}>
                <MaterialIcons
                  name="calendar-month"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <Text style={[styles.dropdownValueText, !yearOfAdmission && styles.dropdownPlaceholder]}>
                  {yearOfAdmission ? String(yearOfAdmission) : 'Select admission year'}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={22} color="#64748b" />
              </TouchableOpacity>
              {openDropdown === 'year_of_admission' && (
                <View style={styles.dropdownList}>
                  {admissionYearOptions.map((item) => (
                    <TouchableOpacity key={item} style={styles.dropdownItem} onPress={() => handleSelectAdmissionYear(item)}>
                      <Text style={styles.dropdownItemText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!errors.year_of_admission && <Text style={styles.helperError}>{errors.year_of_admission}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Academic Progress (Auto)</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="school"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  editable={false}
                  value={`Year ${computedAcademic.year || '-'} | Semester ${computedAcademic.semester || '-'} | ${computedAcademic.batch || '-'}`}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Bio */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="edit"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Tell us about yourself"
                  value={bio}
                  onChangeText={setBio}
                  placeholderTextColor="#94a3b8"
                  multiline
                />
              </View>
            </View>

            {/* Skills */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Skills (comma separated)</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="build"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="React, Python, ML"
                  value={skillsInput}
                  onChangeText={setSkillsInput}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
          </View>

          {/* Academic Interests */}
          <View style={styles.interestsSection}>
            <View style={styles.interestsHeader}>
              <Text style={styles.interestsTitle}>Academic Interests</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tagsContainer}>
              {selectedInterests.map((interest) => (
                <TouchableOpacity
                  key={interest.id}
                  style={[
                    styles.tag,
                    interest.selected && styles.tagSelected,
                  ]}
                  onPress={() => toggleInterest(interest.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tagText,
                      interest.selected && styles.tagTextSelected,
                    ]}
                  >
                    {interest.label}
                  </Text>
                  {interest.selected && (
                    <MaterialIcons name="check" size={16} color="#111818" />
                  )}
                </TouchableOpacity>
              ))}

              {/* Add Interest Button */}
              <TouchableOpacity style={styles.addTag} activeOpacity={0.7}>
                <MaterialIcons name="add" size={16} color="#64748b" />
                <Text style={styles.addTagText}>Add Interest</Text>
              </TouchableOpacity>
            </View>

            {/* AI Helper */}
            <View style={styles.aiHelper}>
              <View style={styles.aiIcon}>
                <MaterialIcons name="smart-toy" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.aiHelperText}>
                You can refine these interests anytime in your settings. Our AI uses
                them to curate your feed.
              </Text>
            </View>
          </View>

          {/* Bottom Spacing for FAB */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Floating Action Button */}
        <LinearGradient
          colors={['rgba(255,248,240,0)', 'rgba(255,248,240,0.8)', '#fff8f0']}
          style={styles.fabContainer}
        >
          <TouchableOpacity
            style={[styles.finishButton, isSaving && styles.buttonDisabled]}
            onPress={handleFinish}
            activeOpacity={0.9}
            disabled={isSaving}
          >
            <Text style={styles.finishButtonText}>
              {isSaving ? 'Saving...' : 'Finish Setup'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.softCream,
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  gradient: {
    flex: 1,
    ...(Platform.OS === 'web' && ({ minHeight: '100vh' } as any)),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#334155',
  },
  skipButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
  },
  skipButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#64748b',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 120,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#e2e8f0',
    ...Shadows.xl,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 64,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  avatarLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  formFields: {
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  dropdownGroup: {
    gap: Spacing.sm,
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadows.sm,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 56,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  textArea: {
    height: 110,
    textAlignVertical: 'top',
  },
  dropdownField: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 48,
    paddingRight: 14,
    ...Shadows.sm,
  },
  dropdownValueText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  dropdownPlaceholder: {
    color: '#94a3b8',
  },
  dropdownList: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 6,
    ...Shadows.sm,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: FontSizes.sm,
    color: '#334155',
    fontWeight: FontWeights.medium,
  },
  helperError: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  interestsSection: {
    marginTop: Spacing.xl,
  },
  interestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  interestsTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  seeAllText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#64748b',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    ...Shadows.sm,
  },
  tagSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tagText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  tagTextSelected: {
    color: '#111818',
    fontWeight: FontWeights.semibold,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  addTagText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  aiHelper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  aiIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiHelperText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 24,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  finishButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  finishButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
});
