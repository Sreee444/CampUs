import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';

type CreateProjectScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CreateProject'>;

interface ProjectFormData {
  name: string;
  description: string;
  category: string;
  required_skills: string[];
  max_members: number;
  github_url: string;
  demo_url: string;
  tags: string[];
}

const PROJECT_CATEGORIES = [
  'Web App',
  'Mobile App',
  'AI/ML',
  'IoT',
  'Game',
  'API/Backend',
  'Desktop App',
  'Data Science',
  'Other',
];

const COMMON_SKILLS = [
  'React', 'React Native', 'Node.js', 'Python', 'JavaScript', 'TypeScript',
  'Flutter', 'Swift', 'Kotlin', 'Java', 'C++', 'Go', 'Rust',
  'MongoDB', 'PostgreSQL', 'Firebase', 'AWS', 'Docker',
  'Machine Learning', 'Data Science', 'UI/UX Design', 'DevOps',
];

export default function CreateProjectScreen() {
  const navigation = useNavigation<CreateProjectScreenNavigationProp>();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    category: '',
    required_skills: [],
    max_members: 5,
    github_url: '',
    demo_url: '',
    tags: [],
  });
  const [skillInput, setSkillInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const addSkill = () => {
    const value = skillInput.trim();
    if (value && !formData.required_skills.includes(value)) {
      setFormData(prev => ({ ...prev, required_skills: [...prev.required_skills, value] }));
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      required_skills: prev.required_skills.filter(s => s !== skill),
    }));
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (value && !formData.tags.includes(value)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, value] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'You must be logged in to create a project' });
      return;
    }

    if (!formData.name.trim()) {
      Toast.show({ type: 'error', text1: 'Project name is required' });
      return;
    }

    if (!formData.description.trim()) {
      Toast.show({ type: 'error', text1: 'Project description is required' });
      return;
    }

    if (!formData.category) {
      Toast.show({ type: 'error', text1: 'Please select a project category' });
      return;
    }

    try {
      setIsSubmitting(true);

      const { error } = await supabase
        .from('project_teams')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim(),
          category: formData.category,
          required_skills: formData.required_skills,
          max_members: formData.max_members,
          github_url: formData.github_url.trim() || null,
          demo_url: formData.demo_url.trim() || null,
          tags: formData.tags,
          created_by: user.id,
        } as any)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Toast.show({
        type: 'success',
        text1: 'Project created successfully!',
        text2: 'Your project is now visible to other students.',
      });

      navigation.goBack();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to create project',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectCategory = (category: string) => {
    setFormData(prev => ({ ...prev, category }));
  };

  const selectSkill = (skill: string) => {
    if (!formData.required_skills.includes(skill)) {
      setFormData(prev => ({ ...prev, required_skills: [...prev.required_skills, skill] }));
    }
  };

  const handleMaxMembersChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, '');

    if (!digitsOnly) {
      setFormData(prev => ({ ...prev, max_members: 2 }));
      return;
    }

    const parsed = parseInt(digitsOnly, 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    const clamped = Math.min(10, Math.max(2, parsed));
    setFormData(prev => ({ ...prev, max_members: clamped }));
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Create Project</Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          >
            <Text style={[styles.submitButtonText, isSubmitting && styles.submitButtonTextDisabled]}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <Text style={styles.label}>Project Name *</Text>
          <TextInput
            style={styles.textInput}
            value={formData.name}
            onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
            placeholder="Enter project name"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={formData.description}
            onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
            placeholder="Describe your project, its goals, and what you want to build"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Category *</Text>
          <View style={styles.chipContainer}>
            {PROJECT_CATEGORIES.map((category) => {
              const isSelected = formData.category === category;
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => selectCategory(category)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{category}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Team Details</Text>

          <Text style={styles.label}>Maximum Members</Text>
          <View style={styles.memberCountContainer}>
            <TouchableOpacity
              style={[styles.memberButton, formData.max_members <= 2 && styles.memberButtonDisabled]}
              onPress={() =>
                formData.max_members > 2 &&
                setFormData(prev => ({ ...prev, max_members: prev.max_members - 1 }))
              }
              disabled={formData.max_members <= 2}
            >
              <Ionicons
                name="remove"
                size={20}
                color={formData.max_members <= 2 ? '#9ca3af' : '#4f46e5'}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.memberCountInput}
              value={String(formData.max_members)}
              onChangeText={handleMaxMembersChange}
              keyboardType="number-pad"
              maxLength={2}
              textAlign="center"
            />

            <TouchableOpacity
              style={[styles.memberButton, formData.max_members >= 10 && styles.memberButtonDisabled]}
              onPress={() =>
                formData.max_members < 10 &&
                setFormData(prev => ({ ...prev, max_members: prev.max_members + 1 }))
              }
              disabled={formData.max_members >= 10}
            >
              <Ionicons
                name="add"
                size={20}
                color={formData.max_members >= 10 ? '#9ca3af' : '#4f46e5'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Required Skills</Text>

          <Text style={styles.label}>Popular Skills</Text>
          <View style={styles.chipContainer}>
            {COMMON_SKILLS.map((skill) => {
              const isSelected = formData.required_skills.includes(skill);
              return (
                <TouchableOpacity
                  key={skill}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => selectSkill(skill)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{skill}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Add Custom Skill</Text>
          <View style={styles.addInputRow}>
            <TextInput
              style={styles.addInput}
              value={skillInput}
              onChangeText={setSkillInput}
              placeholder="Type a skill"
              placeholderTextColor="#9ca3af"
              onSubmitEditing={addSkill}
            />
            <TouchableOpacity style={styles.smallAddButton} onPress={addSkill}>
              <Ionicons name="add" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {formData.required_skills.length > 0 && (
            <>
              <Text style={styles.label}>Selected Skills</Text>
              <View style={styles.chipContainer}>
                {formData.required_skills.map((skill) => (
                  <View key={skill} style={styles.selectedChip}>
                    <Text style={styles.selectedChipText}>{skill}</Text>
                    <TouchableOpacity onPress={() => removeSkill(skill)}>
                      <Ionicons name="close" size={16} color="#4f46e5" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Project Links (Optional)</Text>

          <Text style={styles.label}>GitHub Repository</Text>
          <TextInput
            style={styles.textInput}
            value={formData.github_url}
            onChangeText={(text) => setFormData(prev => ({ ...prev, github_url: text }))}
            placeholder="https://github.com/username/repo"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>Demo/Live URL</Text>
          <TextInput
            style={styles.textInput}
            value={formData.demo_url}
            onChangeText={(text) => setFormData(prev => ({ ...prev, demo_url: text }))}
            placeholder="https://your-demo.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Tags (Optional)</Text>

          <View style={styles.addInputRow}>
            <TextInput
              style={styles.addInput}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Add project tags"
              placeholderTextColor="#9ca3af"
              onSubmitEditing={addTag}
            />
            <TouchableOpacity style={styles.smallAddButton} onPress={addTag}>
              <Ionicons name="add" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {formData.tags.length > 0 && (
            <View style={[styles.chipContainer, styles.tagsMarginTop]}>
              {formData.tags.map((tag) => (
                <View key={tag} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText}>{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag)}>
                    <Ionicons name="close" size={16} color="#4f46e5" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  submitButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
  },
  submitButtonDisabled: {
    backgroundColor: '#c7d2fe',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  submitButtonTextDisabled: {
    color: '#ffffff',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 14,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fafafa',
  },
  textArea: {
    height: 110,
    textAlignVertical: 'top',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  chipSelected: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4b5563',
  },
  chipTextSelected: {
    color: '#3730a3',
    fontWeight: '600',
  },
  memberCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  memberButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  memberButtonDisabled: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  memberCount: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  memberCountInput: {
    minWidth: 62,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#fafafa',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fafafa',
  },
  smallAddButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4f46e5',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  selectedChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3730a3',
  },
  tagsMarginTop: {
    marginTop: 10,
  },
});
