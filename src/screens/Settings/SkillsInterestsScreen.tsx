import React, { useState, useEffect } from 'react';
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
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile } from '../../api/auth';

type SkillsInterestsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SkillsInterests'>;

const availableSkills = [
  'React Native', 'Python', 'JavaScript', 'AI & ML', 'Robotics',
  'IoT', 'Blockchain', 'Web Development', 'Mobile Dev', 'Data Science',
  'Cloud Computing', 'Cybersecurity', 'UI/UX Design', 'DevOps', 'AR/VR'
];

export default function SkillsInterestsScreen() {
  const navigation = useNavigation<SkillsInterestsScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

  useEffect(() => {
    if (profile) {
      setSelectedSkills(profile.skills || []);
      setSelectedInterests(profile.interests || []);
    }
  }, [profile]);

  const toggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const addCustomSkill = () => {
    if (customSkill.trim() && !selectedSkills.includes(customSkill.trim())) {
      setSelectedSkills([...selectedSkills, customSkill.trim()]);
      setCustomSkill('');
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      await updateProfile(user.id, {
        skills: selectedSkills,
        interests: selectedInterests,
      });

      await refreshProfile();
      setToast({ visible: true, message: 'Skills & interests updated!', type: 'success' });
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error: any) {
      console.error('Update error:', error);
      setToast({ visible: true, message: error.message || 'Failed to update', type: 'error' });
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
          <Text style={styles.headerTitle}>Skills & Interests</Text>
          <TouchableOpacity style={styles.saveAction} onPress={handleSave} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Your Skills ({selectedSkills.length})</Text>
            <View style={styles.skillsGrid}>
              {selectedSkills.map((skill, index) => (
                <View key={index} style={[styles.skillChip, styles.selectedSkill]}>
                  <Text style={styles.selectedSkillText}>{skill}</Text>
                  <TouchableOpacity onPress={() => toggleSkill(skill)}>
                    <MaterialIcons name="close" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Add Custom Skill</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={customSkill}
                onChangeText={setCustomSkill}
                placeholder="Type a skill..."
                placeholderTextColor={Colors.textSecondary}
              />
              <TouchableOpacity style={styles.addButton} onPress={addCustomSkill}>
                <MaterialIcons name="add" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Available Skills</Text>
            <View style={styles.skillsGrid}>
              {availableSkills.map((skill, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.skillChip,
                    selectedSkills.includes(skill) && styles.selectedSkill
                  ]}
                  onPress={() => toggleSkill(skill)}
                >
                  <Text
                    style={[
                      styles.skillText,
                      selectedSkills.includes(skill) && styles.selectedSkillText
                    ]}
                  >
                    {skill}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>

        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={() => setToast({ ...toast, visible: false })}
        />
      </LinearGradient>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
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
    color: '#ffffff',
    backgroundColor: Colors.primary,
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
  sectionCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: 22,
    backgroundColor: 'rgba(255,246,236,0.96)',
    borderWidth: 0,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.text,
    marginBottom: 12,
  },
  skillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.softPeach,
    borderWidth: 0,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  selectedSkill: {
    backgroundColor: Colors.primary,
  },
  skillText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#8b572a',
  },
  selectedSkillText: {
    color: '#ffffff',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(194,116,43,0.14)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#c96f2d',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
