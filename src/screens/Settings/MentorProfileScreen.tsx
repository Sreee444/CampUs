import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile } from '../../api/auth';

const commonExpertise = [
  'AI/ML',
  'Web Development',
  'Mobile Apps',
  'Data Science',
  'Cloud',
  'Cybersecurity',
  'UI/UX',
  'DevOps',
];

type MentorProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

export default function MentorProfileScreen() {
  const navigation = useNavigation<MentorProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [isMentor, setIsMentor] = useState(false);
  const [mentorBio, setMentorBio] = useState('');
  const [expertise, setExpertise] = useState<string[]>([]);
  const [customExpertise, setCustomExpertise] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'info' | 'warning' | 'error' });

  useEffect(() => {
    if (profile) {
      setIsMentor(Boolean(profile.is_mentor));
      setMentorBio(profile.mentor_bio || '');
      setExpertise(profile.areas_of_expertise || []);
      setLinkedinUrl(profile.linkedin_url || '');
      setGithubUrl(profile.github_url || '');
    }
  }, [profile]);

  const toggleExpertise = (value: string) => {
    setExpertise((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const addCustomExpertise = () => {
    const value = customExpertise.trim();
    if (!value || expertise.includes(value)) return;
    setExpertise((prev) => [...prev, value]);
    setCustomExpertise('');
  };

  const handleSave = async () => {
    if (!user?.id) return;
    const baseUpdates = {
      is_mentor: isMentor,
      mentor_bio: mentorBio.trim() || undefined,
      areas_of_expertise: expertise.length ? expertise : undefined,
    };

    const socialUpdates = {
      linkedin_url: linkedinUrl.trim() || undefined,
      github_url: githubUrl.trim() || undefined,
    };

    try {
      setIsSaving(true);
      try {
        await updateProfile(user.id, {
          ...baseUpdates,
          ...socialUpdates,
        });
      } catch {
        // Keep mentor fields savable even if social columns are unavailable in some environments.
        await updateProfile(user.id, baseUpdates);
      }
      await refreshProfile();
      setToast({ visible: true, message: 'Mentor profile updated', type: 'success' });
      setTimeout(() => navigation.goBack(), 1200);
    } catch (error: any) {
      setToast({ visible: true, message: error?.message || 'Failed to update mentor profile', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mentor Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.saveButton}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Open to mentorship</Text>
            <Switch
              value={isMentor}
              onValueChange={setIsMentor}
              trackColor={{ false: '#cbd5e1', true: Colors.primary }}
            />
          </View>
          <Text style={styles.helperText}>Make your profile visible to students seeking guidance.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Mentor Bio</Text>
          <TextInput
            style={styles.textArea}
            value={mentorBio}
            onChangeText={setMentorBio}
            placeholder="Share your background and how you can help"
            placeholderTextColor={Colors.textSecondary}
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>LinkedIn URL</Text>
          <TextInput
            style={styles.input}
            value={linkedinUrl}
            onChangeText={setLinkedinUrl}
            placeholder="https://linkedin.com/in/your-profile"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="url"
            autoCapitalize="none"
          />

          <Text style={styles.label}>GitHub URL</Text>
          <TextInput
            style={styles.input}
            value={githubUrl}
            onChangeText={setGithubUrl}
            placeholder="https://github.com/your-username"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Areas of Expertise</Text>
          <View style={styles.chipRow}>
            {expertise.map((item) => (
              <TouchableOpacity key={item} style={styles.chipActive} onPress={() => toggleExpertise(item)}>
                <Text style={styles.chipActiveText}>{item}</Text>
                <MaterialIcons name="close" size={14} color="#ffffff" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Add expertise</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={customExpertise}
              onChangeText={setCustomExpertise}
              placeholder="Add a custom area"
              placeholderTextColor={Colors.textSecondary}
            />
            <TouchableOpacity style={styles.addButton} onPress={addCustomExpertise}>
              <MaterialIcons name="add" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <View style={styles.chipRow}>
            {commonExpertise.map((item) => (
              <TouchableOpacity
                key={item}
                style={expertise.includes(item) ? styles.chipActive : styles.chip}
                onPress={() => toggleExpertise(item)}
              >
                <Text style={expertise.includes(item) ? styles.chipActiveText : styles.chipText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </SafeAreaView>
  );
}

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
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
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
    },
    scrollView: {
      flex: 1,
    },
    section: {
      padding: Spacing.md,
      gap: 12,
    },
    label: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    helperText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    textArea: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      padding: Spacing.sm,
      color: Colors.text,
      textAlignVertical: 'top',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    chipText: {
      fontSize: FontSizes.sm,
      color: Colors.text,
    },
    chipActive: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipActiveText: {
      color: '#ffffff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      color: Colors.text,
    },
    addButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
