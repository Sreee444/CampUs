import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { signUp } from '../../api/auth';
import DropdownSheet from '../../components/DropdownSheet';
import {
  DEPARTMENT_OPTIONS,
  SECTION_OPTIONS,
  getSpecializationOptions,
} from '../../constants/academic';
import { calculateAcademicFields, ROLL_NUMBER_REGEX } from '../../utils/academic';

type SignupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Signup'>;

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

export default function SignupScreen() {
  const navigation = useNavigation<SignupScreenNavigationProp>();
  const [step, setStep] = useState<'account' | 'profile'>('account');

  // ── Step 1: Account ────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('student');
  const [isLoading, setIsLoading] = useState(false);

  // ── Step 2: Academic + Profile ─────────────────────────────────────────────
  const [department, setDepartment] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [section, setSection] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [yearOfAdmission, setYearOfAdmission] = useState<number | null>(null);
  const [bio, setBio] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [interests, setInterests] = useState<InterestItem[]>(INTEREST_OPTIONS);

  const [openDropdown, setOpenDropdown] = useState<
    'department' | 'specialization' | 'section' | 'year_of_admission' | null
  >(null);

  const [errors, setErrors] = useState<{
    department?: string;
    specialization?: string;
    section?: string;
    rollNumber?: string;
    yearOfAdmission?: string;
  }>({});

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const admissionYearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => currentYear - i),
    [currentYear]
  );
  const computedAcademic = useMemo(() => calculateAcademicFields(yearOfAdmission), [yearOfAdmission]);
  const specializationOptions = useMemo(() => getSpecializationOptions(department), [department]);

  useEffect(() => {
    if (specialization && !specializationOptions.includes(specialization)) {
      setSpecialization(null);
    }
  }, [specialization, specializationOptions]);

  // ── Dropdown sheet ─────────────────────────────────────────────────────────
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
      setSection(value as 'A' | 'B' | 'C' | 'D');
      setErrors((e) => ({ ...e, section: undefined }));
    } else if (openDropdown === 'specialization') {
      setSpecialization(value);
      setErrors((e) => ({ ...e, specialization: undefined }));
    }
    setOpenDropdown(null);
  };

  const toggleInterest = (id: string) =>
    setInterests((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateAccountStep = () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Please fill all account fields' });
      return false;
    }
    if (password.length < 6) {
      Toast.show({ type: 'error', text1: 'Password must be at least 6 characters' });
      return false;
    }
    return true;
  };

  const goToProfileStep = () => {
    if (!validateAccountStep()) return;
    setStep('profile');
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSignup = async () => {
    if (!validateAccountStep()) return;

    // Validate profile fields
    const nextErrors: typeof errors = {};
    if (!department) nextErrors.department = 'Select your department';
    if (!specialization) nextErrors.specialization = 'Select specialization';
    if (!section) nextErrors.section = 'Select your section';
    if (!yearOfAdmission) nextErrors.yearOfAdmission = 'Select year of admission';
    if (!rollNumber.trim()) {
      nextErrors.rollNumber = 'Roll number is required';
    } else if (!ROLL_NUMBER_REGEX.test(rollNumber.trim())) {
      nextErrors.rollNumber = 'Invalid format — use e.g. CSE/23/001';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const skills = skillsInput.split(',').map((s) => s.trim()).filter(Boolean);
    const selectedInterestLabels = interests.filter((i) => i.selected).map((i) => i.label);

    try {
      setIsLoading(true);
      await signUp(email.trim(), password, fullName.trim(), role, {
        department: department || undefined,
        specialization: specialization || undefined,
        section: section || undefined,
        roll_number: rollNumber.trim(),
        year_of_admission: yearOfAdmission || undefined,
        year: computedAcademic.year || undefined,
        semester: computedAcademic.semester || undefined,
        batch: computedAcademic.batch || undefined,
        academic_status: computedAcademic.academic_status,
        bio: bio.trim() || undefined,
        skills: skills.length ? skills : undefined,
        interests: selectedInterestLabels.length ? selectedInterestLabels : undefined,
      });

      Toast.show({
        type: 'success',
        text1: 'Account created!',
        text2: 'Check your email to verify your account',
      });
      navigation.replace('VerifyEmail', { email: email.trim() });
    } catch (error: any) {
      let msg = error?.message || 'Please try again';
      if (msg.includes('Email not confirmed')) msg = 'Email confirmation is required.';
      else if (msg.includes('signups not allowed')) msg = 'Signups are disabled in Supabase dashboard.';
      Toast.show({ type: 'error', text1: 'Signup failed', text2: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Dropdown Row helper ────────────────────────────────────────────────────
  const DropRow = ({
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
        style={[styles.inputWrapper, disabled && styles.inputDisabled]}
        onPress={onPress}
        disabled={disabled}
      >
        <MaterialIcons name={icon as any} size={20} color="#94a3b8" style={styles.inputIcon} />
        <Text style={[styles.dropText, !value && styles.dropPlaceholder]}>{value || placeholder}</Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color="#64748b" />
      </TouchableOpacity>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );

  const roles = ['student', 'alumni', 'faculty'];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <MaterialIcons name="school" size={28} color="#111818" />
              <Text style={styles.logoText}>CAMPUS</Text>
            </View>
            <Text style={styles.title}>
              {step === 'account' ? 'Create account' : 'Complete your profile'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'account'
                ? 'Step 1 of 2 — account details'
                : 'Step 2 of 2 — academic & profile info'}
            </Text>
          </View>

          {/* ── STEP 1: Account ── */}
          {step === 'account' ? (
            <>
              <View style={styles.section}>
                <Text style={styles.label}>I am a</Text>
                <View style={styles.roleRow}>
                  {roles.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleChip, role === r && styles.roleChipActive]}
                      onPress={() => setRole(r)}
                    >
                      <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="person" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Jane Doe"
                      value={fullName}
                      onChangeText={setFullName}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Academic Email</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="school" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="jane@university.edu"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="lock" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Min 6 characters"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#94a3b8"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                      <MaterialIcons
                        name={showPassword ? 'visibility' : 'visibility-off'}
                        size={20}
                        color="#94a3b8"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                  onPress={goToProfileStep}
                  disabled={isLoading}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryBtnText}>Continue →</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* ── STEP 2: Profile ── */
            <View style={styles.form}>

              {/* Academic section */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionCardTitle}>Academic Details</Text>

                {/* Year of Admission */}
                <DropRow
                  label="Year of Admission *"
                  icon="calendar-month"
                  value={yearOfAdmission ? String(yearOfAdmission) : null}
                  placeholder="Select admission year"
                  onPress={() => setOpenDropdown(openDropdown === 'year_of_admission' ? null : 'year_of_admission')}
                  error={errors.yearOfAdmission}
                />

                {/* Department */}
                <DropRow
                  label="Department *"
                  icon="apartment"
                  value={department}
                  placeholder="Select your department"
                  onPress={() => setOpenDropdown(openDropdown === 'department' ? null : 'department')}
                  error={errors.department}
                />

                {/* Specialization */}
                <DropRow
                  label="Specialization *"
                  icon="psychology"
                  value={specialization}
                  placeholder={department ? 'Select specialization' : 'Select department first'}
                  onPress={() => setOpenDropdown(openDropdown === 'specialization' ? null : 'specialization')}
                  error={errors.specialization}
                  disabled={!department}
                />

                {/* Section + Roll Number */}
                <View style={styles.twoCol}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Section *</Text>
                      <TouchableOpacity
                        style={styles.inputWrapper}
                        onPress={() => setOpenDropdown(openDropdown === 'section' ? null : 'section')}
                      >
                        <MaterialIcons name="groups" size={20} color="#94a3b8" style={styles.inputIcon} />
                        <Text style={[styles.dropText, !section && styles.dropPlaceholder]}>
                          {section || 'A/B/C/D'}
                        </Text>
                        <MaterialIcons name="keyboard-arrow-down" size={20} color="#64748b" />
                      </TouchableOpacity>
                      {!!errors.section && <Text style={styles.errorText}>{errors.section}</Text>}
                    </View>
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Roll Number *</Text>
                      <View style={styles.inputWrapper}>
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
                      {!!errors.rollNumber && <Text style={styles.errorText}>{errors.rollNumber}</Text>}
                    </View>
                  </View>
                </View>

                {/* Auto-computed read-only row */}
                {yearOfAdmission && (
                  <View style={styles.twoCol}>
                    {[
                      { lbl: 'Year', val: computedAcademic.year ? `Year ${computedAcademic.year}` : '–' },
                      { lbl: 'Semester', val: computedAcademic.semester ? `Sem ${computedAcademic.semester}` : '–' },
                    ].map(({ lbl, val }) => (
                      <View key={lbl} style={[styles.computedChip, { flex: 1, marginHorizontal: 4 }]}>
                        <Text style={styles.computedLabel}>{lbl}</Text>
                        <Text style={styles.computedValue}>{val}</Text>
                      </View>
                    ))}
                    <View style={[styles.computedChip, { flex: 1.2, marginHorizontal: 4 }]}>
                      <Text style={styles.computedLabel}>Batch</Text>
                      <Text style={styles.computedValue}>{computedAcademic.batch || '–'}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Profile section */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionCardTitle}>Personal Info</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bio (optional)</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="edit" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.multilineInput]}
                      placeholder="Tell campus who you are..."
                      value={bio}
                      onChangeText={setBio}
                      placeholderTextColor="#94a3b8"
                      multiline
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Skills (comma separated, optional)</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="build" size={20} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="React Native, Python, ML..."
                      value={skillsInput}
                      onChangeText={setSkillsInput}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Interests</Text>
                  <View style={styles.interestWrap}>
                    {interests.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.interestChip, item.selected && styles.interestChipSelected]}
                        onPress={() => toggleInterest(item.id)}
                      >
                        {item.selected && <MaterialIcons name="check" size={12} color="#0f766e" />}
                        <Text style={[styles.interestChipText, item.selected && styles.interestChipTextSelected]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.profileActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('account')}>
                  <Text style={styles.secondaryBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.profileSubmitBtn, isLoading && styles.btnDisabled]}
                  onPress={handleSignup}
                  disabled={isLoading}
                  activeOpacity={0.9}
                >
                  {isLoading
                    ? <ActivityIndicator color="#111818" />
                    : <Text style={styles.primaryBtnText}>Create Account & Verify Email</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Already a member?{' '}
              <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>
                Log In
              </Text>
            </Text>
            <Text style={styles.termsText}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dropdown Sheet */}
      <DropdownSheet
        visible={!!openDropdown && !!activeDropdown}
        title={activeDropdown?.title || 'Select'}
        options={activeDropdown?.options || []}
        onSelect={handleSheetSelect}
        onClose={() => setOpenDropdown(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfbf7',
    ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
  },
  blob1: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(19,236,236,0.12)',
  },
  blob2: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(243,229,245,0.6)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && ({ minHeight: '100vh' } as any)),
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111818',
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111818',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  form: {
    gap: 4,
  },
  inputGroup: {
    gap: 6,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    paddingLeft: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  inputDisabled: {
    opacity: 0.55,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: '#111818',
  },
  multilineInput: {
    minHeight: 80,
    height: undefined,
    textAlignVertical: 'top',
    paddingTop: 14,
    paddingBottom: 10,
  },
  eyeIcon: {
    padding: 4,
  },
  dropText: {
    flex: 1,
    fontSize: 15,
    color: '#111818',
    fontWeight: '500',
  },
  dropPlaceholder: {
    color: '#94a3b8',
    fontWeight: '400',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 2,
  },
  twoCol: {
    flexDirection: 'row',
    marginBottom: 4,
  },

  // Auto-computed chips
  computedChip: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  computedLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 2,
  },
  computedValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f766e',
  },

  // Role chips
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  roleChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roleChipActive: {
    backgroundColor: '#13ecec',
    borderColor: '#13ecec',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  roleChipTextActive: {
    color: '#111818',
    fontWeight: '700',
  },

  // Interest chips
  interestWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  interestChipSelected: {
    borderColor: '#13ecec',
    backgroundColor: 'rgba(19,236,236,0.14)',
  },
  interestChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  interestChipTextSelected: {
    color: '#0f766e',
  },

  // Buttons
  primaryBtn: {
    backgroundColor: '#13ecec',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#13ecec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111818',
    textAlign: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  profileActions: {
    gap: 10,
    marginTop: 4,
  },
  profileSubmitBtn: {
    marginTop: 0,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryBtnText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 28,
    gap: 12,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
  },
  footerLink: {
    color: '#111818',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  termsText: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
});
