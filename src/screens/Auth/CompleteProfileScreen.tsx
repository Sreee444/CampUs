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
  ActivityIndicator,
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
import {
  DEPARTMENT_OPTIONS,
  SECTION_OPTIONS,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';
import DropdownSheet from '../../components/DropdownSheet';

type CompleteProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CompleteProfile'>;

type InterestItem = { id: string; label: string; selected: boolean };

const INTEREST_OPTIONS: InterestItem[] = [
  { id: '1', label: 'AI & ML', selected: false },
  { id: '2', label: 'Web Dev', selected: false },
  { id: '3', label: 'Mobile Dev', selected: false },
  { id: '4', label: 'Cybersecurity', selected: false },
  { id: '5', label: 'IoT', selected: false },
  { id: '6', label: 'Data Science', selected: false },
  { id: '7', label: 'UI/UX', selected: false },
  { id: '8', label: 'Cloud', selected: false },
  { id: '9', label: 'Blockchain', selected: false },
  { id: '10', label: 'Robotics', selected: false },
  { id: '11', label: 'Game Dev', selected: false },
  { id: '12', label: 'Open Source', selected: false },
];

export default function CompleteProfileScreen() {
  const navigation = useNavigation<CompleteProfileScreenNavigationProp>();
  const { user, profile, refreshProfile } = useAuth();

  const currentYear = new Date().getFullYear();
  const admissionYearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => currentYear - i),
    [currentYear]
  );

  // ─── State ───────────────────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');

  const [department, setDepartment] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [section, setSection] = useState<'A' | 'B' | 'C' | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);

  const [skillsInput, setSkillsInput] = useState('');
  const [interests, setInterests] = useState<InterestItem[]>(INTEREST_OPTIONS);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<
    'department' | 'specialization' | 'section' | 'year_of_admission' | null
  >(null);
  const [errors, setErrors] = useState<{
    fullName?: string;
    department?: string;
    specialization?: string;
    section?: string;
    rollNumber?: string;
    yearOfAdmission?: string;
  }>({});

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const computedAcademic = useMemo(() => calculateAcademicFields(yearOfAdmission), [yearOfAdmission]);
  const isGraduated = computedAcademic.academic_status === 'graduated';
  const specializationOptions = useMemo(() => getSpecializationOptions(department), [department]);

  // Reset specialization when department changes
  useEffect(() => {
    if (!specialization) return;
    if (!specializationOptions.includes(specialization)) setSpecialization(null);
  }, [specialization, specializationOptions]);

  // Pre-fill from existing profile (Google auto-fills name/avatar)
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setPhone(profile.phone || '');
    setBio(profile.bio || '');
    setAvatarUrl(profile.avatar_url || null);
    setDepartment(profile.department || null);
    setSpecialization(profile.specialization || null);
    setSection(profile.section || null);
    setRollNumber(profile.roll_number || '');
    setYearOfAdmission(profile.year_of_admission ?? null);
    setSkillsInput((profile.skills || []).join(', '));
    const saved = new Set(profile.interests || []);
    setInterests(INTEREST_OPTIONS.map((i) => ({ ...i, selected: saved.has(i.label) })));
  }, [profile]);

  // ─── Dropdown sheet config ────────────────────────────────────────────────────
  const activeDropdown = useMemo(() => {
    if (!openDropdown) return null;
    if (openDropdown === 'department')
      return { title: 'Select Department', options: [...DEPARTMENT_OPTIONS] as string[] };
    if (openDropdown === 'year_of_admission')
      return { title: 'Select Admission Year', options: admissionYearOptions.map(String) };
    if (openDropdown === 'section')
      return { title: 'Select Section', options: [...SECTION_OPTIONS] as string[] };
    return { title: 'Select Specialization', options: specializationOptions };
  }, [openDropdown, admissionYearOptions, specializationOptions]);

  const handleSheetSelect = (value: string) => {
    if (openDropdown === 'department') {
      setDepartment(value);
      setSpecialization(null);
      setErrors((e) => ({ ...e, department: undefined }));
    } else if (openDropdown === 'year_of_admission') {
      setYearOfAdmission(Number(value));
      setErrors((e) => ({ ...e, yearOfAdmission: undefined }));
    } else if (openDropdown === 'section') {
      setSection(value as 'A' | 'B' | 'C');
      setErrors((e) => ({ ...e, section: undefined }));
    } else if (openDropdown === 'specialization') {
      setSpecialization(value);
      setErrors((e) => ({ ...e, specialization: undefined }));
    }
    setOpenDropdown(null);
  };

  // ─── Avatar picker ────────────────────────────────────────────────────────────
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
        setIsUploadingAvatar(true);
        const publicUrl = await uploadAvatar(user.id, result.assets[0].uri);
        await updateProfile(user.id, { avatar_url: publicUrl });
        setAvatarUrl(publicUrl);
        await refreshProfile();
        Toast.show({ type: 'success', text1: 'Avatar updated' });
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Upload failed', text2: err?.message });
      } finally {
        setIsUploadingAvatar(false);
      }
    }
  };

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!user?.id) return;

    const nextErrors: typeof errors = {};
    if (!fullName.trim()) nextErrors.fullName = 'Full name is required';
    if (!department) nextErrors.department = 'Select your department';
    if (!specialization) nextErrors.specialization = 'Select specialization';
    if (!section) nextErrors.section = 'Select your section';
    if (!yearOfAdmission) nextErrors.yearOfAdmission = 'Select year of admission';
    if (!rollNumber.trim()) {
      nextErrors.rollNumber = 'Roll number is required';
    } else if (!ROLL_NUMBER_REGEX.test(rollNumber.trim())) {
      nextErrors.rollNumber = 'Invalid format (e.g. CSE/23/001)';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const selectedInterests = interests.filter((i) => i.selected).map((i) => i.label);

    try {
      setIsSaving(true);
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        department: department || undefined,
        specialization: specialization || undefined,
        section: section || undefined,
        roll_number: rollNumber.trim(),
        year_of_admission: yearOfAdmission || undefined,
        year: computedAcademic.year || undefined,
        semester: computedAcademic.semester || undefined,
        batch: computedAcademic.batch || undefined,
        academic_status: computedAcademic.academic_status,
        skills: skills.length ? skills : undefined,
        interests: selectedInterests.length ? selectedInterests : undefined,
      });
      await refreshProfile();
      Toast.show({ type: 'success', text1: 'Profile completed!' });
      navigation.replace('MainTabs');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not save profile', text2: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    Toast.show({ type: 'info', text1: 'Complete your profile later in Settings' });
    navigation.replace('MainTabs');
  };

  const toggleInterest = (id: string) =>
    setInterests(interests.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const DropdownRow = ({
    label,
    icon,
    value,
    placeholder,
    onPress,
    error,
    disabled,
  }: {
    label: string;
    icon: string;
    value: string | null;
    placeholder: string;
    onPress: () => void;
    error?: string;
    disabled?: boolean;
  }) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.dropdownField, disabled && styles.disabledInput]}
        onPress={onPress}
        disabled={disabled}
      >
        <MaterialIcons name={icon as any} size={20} color="#94a3b8" style={styles.inputIcon} />
        <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>
          {value || placeholder}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color="#64748b" />
      </TouchableOpacity>
      {!!error && <Text style={styles.helperError}>{error}</Text>}
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#fff8f0', '#fff5eb', '#ffe8e0']} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#334155" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Profile</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Avatar ── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} activeOpacity={0.8}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <MaterialIcons name="person" size={48} color="#94a3b8" />
                </View>
              )}
              <View style={styles.avatarOverlay}>
                {isUploadingAvatar
                  ? <ActivityIndicator color="#fff" />
                  : <MaterialIcons name="photo-camera" size={26} color="#fff" />}
              </View>
              <View style={styles.avatarBadge}>
                <MaterialIcons name="add" size={16} color="#111818" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to add a profile photo</Text>
          </View>

          {/* ── Section: Personal Info ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal Info</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="person" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  value={fullName}
                  onChangeText={(v) => { setFullName(v); setErrors((e) => ({ ...e, fullName: undefined })); }}
                  placeholderTextColor="#94a3b8"
                />
              </View>
              {!!errors.fullName && <Text style={styles.helperError}>{errors.fullName}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone (optional)</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="phone" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio (optional)</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="edit" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Tell campus who you are..."
                  value={bio}
                  onChangeText={setBio}
                  placeholderTextColor="#94a3b8"
                  multiline
                />
              </View>
            </View>
          </View>

          {/* ── Section: Academic Details ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Academic Details</Text>

            {/* Year of Admission */}
            <DropdownRow
              label="Year of Admission *"
              icon="calendar-month"
              value={yearOfAdmission ? String(yearOfAdmission) : null}
              placeholder="Select admission year"
              onPress={() => setOpenDropdown(openDropdown === 'year_of_admission' ? null : 'year_of_admission')}
              error={errors.yearOfAdmission}
            />

            {/* Department */}
            <DropdownRow
              label="Department *"
              icon="apartment"
              value={department}
              placeholder="Select department"
              onPress={() => setOpenDropdown(openDropdown === 'department' ? null : 'department')}
              error={errors.department}
            />

            {/* Specialization — depends on department */}
            <DropdownRow
              label="Specialization *"
              icon="psychology"
              value={specialization}
              placeholder={department ? 'Select specialization' : 'Select department first'}
              onPress={() => setOpenDropdown(openDropdown === 'specialization' ? null : 'specialization')}
              error={errors.specialization}
              disabled={!department}
            />

            {/* Section + Roll Number in two columns */}
            <View style={styles.twoCol}>
              <View style={[styles.col, { marginRight: 6 }]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Section *</Text>
                  <TouchableOpacity
                    style={styles.dropdownField}
                    onPress={() => setOpenDropdown(openDropdown === 'section' ? null : 'section')}
                  >
                    <MaterialIcons name="groups" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <Text style={[styles.dropdownText, !section && styles.dropdownPlaceholder]}>
                      {section || 'A / B / C / D'}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={20} color="#64748b" />
                  </TouchableOpacity>
                  {!!errors.section && <Text style={styles.helperError}>{errors.section}</Text>}
                </View>
              </View>

              <View style={[styles.col, { marginLeft: 6 }]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Roll Number *</Text>
                  <View style={styles.inputRow}>
                    <MaterialIcons name="badge" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="CSE/23/001"
                      value={rollNumber}
                      onChangeText={(v) => { setRollNumber(v); setErrors((e) => ({ ...e, rollNumber: undefined })); }}
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="characters"
                    />
                  </View>
                  {!!errors.rollNumber && <Text style={styles.helperError}>{errors.rollNumber}</Text>}
                </View>
              </View>
            </View>

            {/* Auto-computed academic fields */}
            <View style={styles.twoCol}>
              <View style={[styles.col, { marginRight: 6 }]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Year</Text>
                  <View style={[styles.inputRow, styles.disabledInput]}>
                    <MaterialIcons name="school" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={computedAcademic.year ? String(computedAcademic.year) : '–'}
                      editable={false}
                    />
                  </View>
                </View>
              </View>
              <View style={[styles.col, { marginLeft: 6 }]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Semester</Text>
                  <View style={[styles.inputRow, styles.disabledInput]}>
                    <MaterialIcons name="menu-book" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={computedAcademic.semester ? String(computedAcademic.semester) : '–'}
                      editable={false}
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={[styles.col, { marginRight: 6 }]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Batch</Text>
                  <View style={[styles.inputRow, styles.disabledInput]}>
                    <MaterialIcons name="group-work" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput style={styles.input} value={computedAcademic.batch || '–'} editable={false} />
                  </View>
                </View>
              </View>
              <View style={[styles.col, { marginLeft: 6 }]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Status</Text>
                  <View style={[styles.inputRow, styles.disabledInput]}>
                    <MaterialIcons name="verified-user" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput style={styles.input} value={computedAcademic.academic_status} editable={false} />
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ── Section: Skills & Interests ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Skills & Interests</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Skills (comma separated)</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="build" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="React Native, Python, Machine Learning..."
                  value={skillsInput}
                  onChangeText={setSkillsInput}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <Text style={[styles.label, { marginBottom: 10 }]}>Interests (select all that apply)</Text>
            <View style={styles.tagsRow}>
              {interests.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.tag, item.selected && styles.tagSelected]}
                  onPress={() => toggleInterest(item.id)}
                  activeOpacity={0.7}
                >
                  {item.selected && <MaterialIcons name="check" size={14} color="#111818" />}
                  <Text style={[styles.tagText, item.selected && styles.tagTextSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.aiHint}>
              <MaterialIcons name="smart-toy" size={16} color={Colors.primary} />
              <Text style={styles.aiHintText}>
                CampUs AI uses your skills and interests to match you with events and project teams.
              </Text>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Floating Save Button */}
        <LinearGradient
          colors={['rgba(255,248,240,0)', 'rgba(255,248,240,0.9)', '#fff8f0']}
          style={styles.fabWrap}
        >
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={handleFinish}
            disabled={isSaving}
            activeOpacity={0.9}
          >
            {isSaving
              ? <ActivityIndicator color="#111818" />
              : <Text style={styles.saveBtnText}>Finish Setup →</Text>}
          </TouchableOpacity>
        </LinearGradient>

        <DropdownSheet
          visible={!!openDropdown && !!activeDropdown}
          title={activeDropdown?.title || 'Select Option'}
          options={activeDropdown?.options || []}
          onSelect={handleSheetSelect}
          onClose={() => setOpenDropdown(null)}
        />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#334155',
  },
  skipText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#64748b',
    textAlign: 'right',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 24,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.xl,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 55,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  avatarHint: {
    fontSize: FontSizes.sm,
    color: '#64748b',
    fontWeight: FontWeights.medium,
  },

  // Cards
  card: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: BorderRadius.xl,
    padding: 18,
    marginBottom: 16,
    ...Shadows.sm,
  },
  cardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111827',
    marginBottom: 16,
  },

  // Inputs
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadows.sm,
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 50,
    paddingLeft: 44,
    paddingRight: 14,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  disabledInput: {
    opacity: 0.6,
  },

  // Dropdown
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingLeft: 44,
    paddingRight: 12,
    ...Shadows.sm,
  },
  dropdownText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  dropdownPlaceholder: {
    color: '#94a3b8',
  },
  helperError: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },

  // Two-column layout
  twoCol: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  col: {
    flex: 1,
  },

  // Interests
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: 14,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BorderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: 13,
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

  // AI hint
  aiHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${Colors.primary}18`,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  aiHintText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },

  // FAB
  fabWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
});
