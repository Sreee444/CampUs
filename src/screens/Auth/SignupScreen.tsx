import React, { useState } from 'react';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { signUp } from '../../api/auth';

type SignupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Signup'>;

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

export default function SignupScreen() {
  const navigation = useNavigation<SignupScreenNavigationProp>();
  const [step, setStep] = useState<'account' | 'profile'>('account');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState('student');

  const [department, setDepartment] = useState('');
  const [yearOrPosition, setYearOrPosition] = useState('');
  const [bio, setBio] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<InterestItem[]>(interestOptions);

  const roles = ['student', 'alumni', 'faculty', 'admin'];

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.map((interest) =>
        interest.id === id
          ? { ...interest, selected: !interest.selected }
          : interest
      )
    );
  };

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

  const handleSignup = async () => {
    if (!validateAccountStep()) return;

    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const selectedInterestLabels = selectedInterests
      .filter((i) => i.selected)
      .map((i) => i.label);

    const yearNumber = Number(yearOrPosition);
    const year = Number.isFinite(yearNumber) ? yearNumber : undefined;

    try {
      setIsLoading(true);
      await signUp(email.trim(), password, fullName.trim(), role, {
        department: department.trim() || undefined,
        year,
        bio: bio.trim() || undefined,
        skills: skills.length ? skills : undefined,
        interests: selectedInterestLabels.length ? selectedInterestLabels : undefined,
      });

      Toast.show({
        type: 'success',
        text1: 'Profile saved',
        text2: 'Now verify your email to complete signup',
      });
      navigation.replace('VerifyEmail', { email: email.trim() });
    } catch (error: any) {
      let errorMessage = error?.message || 'Please try again';
      if (error?.message?.includes('Email not confirmed')) {
        errorMessage = 'Email confirmation is required.';
      } else if (error?.message?.includes('signups not allowed')) {
        errorMessage = 'Signups are disabled. Enable in Supabase dashboard.';
      }
      Toast.show({ type: 'error', text1: 'Signup failed', text2: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <MaterialIcons name="school" size={28} color="#111818" />
              <Text style={styles.logoText}>CAMPUS</Text>
            </View>
            <Text style={styles.title}>{step === 'account' ? 'Create account' : 'Complete your profile'}</Text>
            <Text style={styles.subtitle}>
              {step === 'account'
                ? 'Step 1 of 2: account details'
                : 'Step 2 of 2: finish profile before verification email'}
            </Text>
          </View>

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
                      placeholder="********"
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
                  style={[styles.signupButton, isLoading && styles.buttonDisabled]}
                  onPress={goToProfileStep}
                  activeOpacity={0.9}
                  disabled={isLoading}
                >
                  <Text style={styles.signupButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Department</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="business" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Computer Science"
                    value={department}
                    onChangeText={setDepartment}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Year (optional)</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="calendar-today" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="3"
                    value={yearOrPosition}
                    onChangeText={setYearOrPosition}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bio</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="edit" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    placeholder="Tell us about yourself"
                    value={bio}
                    onChangeText={setBio}
                    placeholderTextColor="#94a3b8"
                    multiline
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Skills (comma separated)</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="build" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="React, Python, ML"
                    value={skillsInput}
                    onChangeText={setSkillsInput}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Interests</Text>
                <View style={styles.interestWrap}>
                  {selectedInterests.map((interest) => (
                    <TouchableOpacity
                      key={interest.id}
                      style={[styles.interestChip, interest.selected && styles.interestChipSelected]}
                      onPress={() => toggleInterest(interest.id)}
                    >
                      <Text style={[styles.interestChipText, interest.selected && styles.interestChipTextSelected]}>
                        {interest.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.profileActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('account')}>
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.signupButton, styles.profileSubmitButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSignup}
                  activeOpacity={0.9}
                  disabled={isLoading}
                >
                  <Text style={styles.signupButtonText}>{isLoading ? 'Creating...' : 'Create Account & Verify Email'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
    paddingBottom: 32,
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
    fontSize: 30,
    fontWeight: '700',
    color: '#111818',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    paddingLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: '#111818',
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  eyeIcon: {
    padding: 4,
  },
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
  interestWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  interestChipSelected: {
    borderColor: '#13ecec',
    backgroundColor: 'rgba(19,236,236,0.16)',
  },
  interestChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  interestChipTextSelected: {
    color: '#0f766e',
  },
  signupButton: {
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
    paddingHorizontal: 10,
  },
  profileActions: {
    gap: 10,
    marginTop: 6,
  },
  profileSubmitButton: {
    marginTop: 0,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signupButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111818',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
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
