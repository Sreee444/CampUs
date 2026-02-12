import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
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
  'Other'
];

const COMMON_SKILLS = [
  'React', 'React Native', 'Node.js', 'Python', 'JavaScript', 'TypeScript',
  'Flutter', 'Swift', 'Kotlin', 'Java', 'C++', 'Go', 'Rust',
  'MongoDB', 'PostgreSQL', 'Firebase', 'AWS', 'Docker',
  'Machine Learning', 'Data Science', 'UI/UX Design', 'DevOps'
];

export default function CreateProjectScreen() {
  const navigation = useNavigation<CreateProjectScreenNavigationProp>();
  const { user, profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    category: '',
    required_skills: [],
    max_members: 5,
    github_url: '',
    demo_url: '',
    tags: []
  });
  const [skillInput, setSkillInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const addSkill = () => {
    if (skillInput.trim() && !formData.required_skills.includes(skillInput.trim())) {
      setFormData(prev => ({
        ...prev,
        required_skills: [...prev.required_skills, skillInput.trim()]
      }));
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      required_skills: prev.required_skills.filter(s => s !== skill)
    }));
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
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

      // Create the project
      const { data, error } = await supabase
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
        })
        .select()
        .single();

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Project created successfully!',
        text2: 'Your project is now visible to other students.'
      });

      // Navigate back to projects screen
      navigation.goBack();

    } catch (error: any) {
      console.error('Error creating project:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to create project',
        text2: error.message || 'Please try again'
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
      setFormData(prev => ({
        ...prev,
        required_skills: [...prev.required_skills, skill]
      }));
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <Text style={styles.label}>Project Name *</Text>
          <TextInput
            style={styles.textInput}
            value={formData.name}
            onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
            placeholder="Enter project name"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={formData.description}
            onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
            placeholder="Describe your project, its goals, and what you want to build"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Category *</Text>
          <View style={styles.categoryContainer}>
            {PROJECT_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryChip,
                  formData.category === category && styles.categoryChipSelected
                ]}
                onPress={() => selectCategory(category)}
              >
                <Text style={[
                  styles.categoryChipText,
                  formData.category === category && styles.categoryChipTextSelected
                ]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Team Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team Details</Text>
          
          <Text style={styles.label}>Maximum Members</Text>
          <View style={styles.memberCountContainer}>
            <TouchableOpacity
              style={styles.memberButton}
              onPress={() => formData.max_members > 2 && setFormData(prev => ({ ...prev, max_members: prev.max_members - 1 }))}
              disabled={formData.max_members <= 2}
            >
              <Ionicons name="remove" size={20} color={formData.max_members <= 2 ? "#ccc" : "#6366f1"} />
            </TouchableOpacity>
            <Text style={styles.memberCount}>{formData.max_members}</Text>
            <TouchableOpacity
              style={styles.memberButton}
              onPress={() => formData.max_members < 10 && setFormData(prev => ({ ...prev, max_members: prev.max_members + 1 }))}
              disabled={formData.max_members >= 10}
            >
              <Ionicons name="add" size={20} color={formData.max_members >= 10 ? "#ccc" : "#6366f1"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Required Skills */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Required Skills</Text>
          
          <Text style={styles.label}>Popular Skills</Text>
          <View style={styles.skillsContainer}>
            {COMMON_SKILLS.map((skill) => (
              <TouchableOpacity
                key={skill}
                style={[
                  styles.skillChip,
                  formData.required_skills.includes(skill) && styles.skillChipSelected
                ]}
                onPress={() => selectSkill(skill)}
              >
                <Text style={[
                  styles.skillChipText,
                  formData.required_skills.includes(skill) && styles.skillChipTextSelected
                ]}>
                  {skill}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Add Custom Skill</Text>
          <View style={styles.addSkillContainer}>
            <TextInput
              style={styles.addSkillInput}
              value={skillInput}
              onChangeText={setSkillInput}
              placeholder="Type a skill"
              placeholderTextColor="#999"
              onSubmitEditing={addSkill}
            />
            <TouchableOpacity style={styles.addButton} onPress={addSkill}>
              <Ionicons name="add" size={20} color="#6366f1" />
            </TouchableOpacity>
          </View>

          {formData.required_skills.length > 0 && (
            <>
              <Text style={styles.label}>Selected Skills</Text>
              <View style={styles.selectedSkillsContainer}>
                {formData.required_skills.map((skill) => (
                  <View key={skill} style={styles.selectedSkillChip}>
                    <Text style={styles.selectedSkillText}>{skill}</Text>
                    <TouchableOpacity onPress={() => removeSkill(skill)}>
                      <Ionicons name="close" size={16} color="#666" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Links (Optional)</Text>
          
          <Text style={styles.label}>GitHub Repository</Text>
          <TextInput
            style={styles.textInput}
            value={formData.github_url}
            onChangeText={(text) => setFormData(prev => ({ ...prev, github_url: text }))}
            placeholder="https://github.com/username/repo"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>Demo/Live URL</Text>
          <TextInput
            style={styles.textInput}
            value={formData.demo_url}
            onChangeText={(text) => setFormData(prev => ({ ...prev, demo_url: text }))}
            placeholder="https://your-demo.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags (Optional)</Text>
          
          <View style={styles.addSkillContainer}>
            <TextInput
              style={styles.addSkillInput}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Add project tags"
              placeholderTextColor="#999"
              onSubmitEditing={addTag}
            />
            <TouchableOpacity style={styles.addButton} onPress={addTag}>
              <Ionicons name="add" size={20} color="#6366f1" />
            </TouchableOpacity>
          </View>

          {formData.tags.length > 0 && (
            <View style={styles.selectedSkillsContainer}>
              {formData.tags.map((tag) => (
                <View key={tag} style={styles.selectedSkillChip}>
                  <Text style={styles.selectedSkillText}>{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag)}>
                    <Ionicons name="close" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#9ca3af',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  categoryChipSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  categoryChipTextSelected: {
    color: '#fff',
  },
  memberCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  memberButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    minWidth: 30,
    textAlign: 'center',
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  skillChipSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  skillChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  skillChipTextSelected: {
    color: '#fff',
  },
  addSkillContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  addSkillInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSkillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedSkillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  selectedSkillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6366f1',
  },
});