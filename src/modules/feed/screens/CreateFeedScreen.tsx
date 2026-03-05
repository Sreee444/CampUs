import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../contexts/AuthContext';
import { DEPARTMENT_OPTIONS } from '../../../constants/academic';
import { uploadPostAttachment, uploadPostImage } from '../../../api/feed';
import { createFeedPost } from '../api/feed';
import { FeedPostType, FeedVisibility } from '../types/feed';
import { canModerateAcademic } from '../../../utils/roles';

type Nav = StackNavigationProp<RootStackParamList, 'CreateFeed'>;

const TYPE_OPTIONS: Array<{ id: FeedPostType; label: string; icon: keyof typeof MaterialIcons.glyphMap; hint: string }> = [
  { id: 'announcement', label: 'Announcement', icon: 'campaign', hint: 'Important updates' },
  { id: 'event', label: 'Event', icon: 'event', hint: 'Programs and activities' },
  { id: 'exam', label: 'Exam', icon: 'quiz', hint: 'Tests and schedules' },
  { id: 'general', label: 'General', icon: 'forum', hint: 'Discussions and info' },
];

export default function CreateFeedScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const role = (profile?.role || '').toLowerCase();
  const canCreateFeed = canModerateAcademic(role);

  const [content, setContent] = useState('');
  const [type, setType] = useState<FeedPostType>('general');
  const [visibility, setVisibility] = useState<FeedVisibility>('global');
  const [selectedDepartment, setSelectedDepartment] = useState(profile?.department || DEPARTMENT_OPTIONS[0]);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo permission required' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    });

    if (result.canceled) return;
    const file = result.assets?.[0];
    if (file?.uri) {
      setSelectedFile({ uri: file.uri, name: file.name || 'attachment' });
    }
  };

  const handleSubmit = async () => {
    if (!canCreateFeed) {
      Toast.show({ type: 'error', text1: 'Only admin or faculty can create posts' });
      return;
    }

    if (!content.trim()) {
      Toast.show({ type: 'error', text1: 'Please write some content' });
      return;
    }

    if (visibility === 'department' && !selectedDepartment) {
      Toast.show({ type: 'error', text1: 'Please select a department' });
      return;
    }

    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'User session not found' });
      return;
    }

    try {
      setSubmitting(true);

      const uploadedAttachments: string[] = [];
      if (selectedImageUri) {
        const imageUrl = await uploadPostImage(user.id, selectedImageUri);
        uploadedAttachments.push(imageUrl);
      }
      if (selectedFile?.uri) {
        const fileUrl = await uploadPostAttachment(user.id, selectedFile.uri, 'file', selectedFile.name);
        uploadedAttachments.push(fileUrl);
      }

      await createFeedPost(
        user.id,
        content.trim(),
        type,
        visibility,
        visibility === 'department' ? selectedDepartment : undefined,
        uploadedAttachments,
      );

      Toast.show({ type: 'success', text1: 'Post created successfully!' });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to create post',
        text2: error?.message || 'Try again',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Feed Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Post Type</Text>
          <View style={styles.typeGrid}>
            {TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.typeBtn, type === option.id && styles.typeBtnActive]}
                onPress={() => setType(option.id)}
              >
                <MaterialIcons name={option.icon} size={20} color={type === option.id ? '#0f766e' : '#64748b'} />
                <View style={styles.typeTextWrap}>
                  <Text style={[styles.typeLabel, type === option.id && styles.typeLabelActive]}>{option.label}</Text>
                  <Text style={styles.typeHint}>{option.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Content Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content</Text>
          <TextInput
            style={styles.contentInput}
            placeholder="What's on your mind?"
            placeholderTextColor="#cbd5e1"
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            editable={!submitting}
            maxLength={1000}
          />
          <Text style={styles.charCount}>
            {content.length}/1000
          </Text>
        </View>

        {/* Attachments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attachments</Text>
          <View style={styles.attachBtnRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage} disabled={submitting}>
              <MaterialIcons name="image" size={18} color="#0f766e" />
              <Text style={styles.attachBtnText}>Add Image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickFile} disabled={submitting}>
              <MaterialIcons name="attach-file" size={18} color="#0f766e" />
              <Text style={styles.attachBtnText}>Add File</Text>
            </TouchableOpacity>
          </View>

          {!!selectedImageUri && (
            <View style={styles.attachmentChip}>
              <MaterialIcons name="image" size={16} color="#0f766e" />
              <Text style={styles.attachmentText}>Image selected</Text>
              <TouchableOpacity onPress={() => setSelectedImageUri(null)}>
                <MaterialIcons name="close" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          )}

          {!!selectedFile && (
            <View style={styles.attachmentChip}>
              <MaterialIcons name="description" size={16} color="#0f766e" />
              <Text style={styles.attachmentText} numberOfLines={1}>{selectedFile.name}</Text>
              <TouchableOpacity onPress={() => setSelectedFile(null)}>
                <MaterialIcons name="close" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Visibility */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audience</Text>
          <View style={styles.visibilityChoiceRow}>
            <TouchableOpacity
              style={[styles.visibilityChoice, visibility === 'global' && styles.visibilityChoiceActive]}
              onPress={() => setVisibility('global')}
              disabled={submitting}
            >
              <MaterialIcons name="public" size={16} color={visibility === 'global' ? '#0f766e' : '#64748b'} />
              <Text style={[styles.visibilityChoiceText, visibility === 'global' && styles.visibilityChoiceTextActive]}>All Users</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.visibilityChoice, visibility === 'department' && styles.visibilityChoiceActive]}
              onPress={() => setVisibility('department')}
              disabled={submitting}
            >
              <MaterialIcons name="groups" size={16} color={visibility === 'department' ? '#0f766e' : '#64748b'} />
              <Text style={[styles.visibilityChoiceText, visibility === 'department' && styles.visibilityChoiceTextActive]}>By Department</Text>
            </TouchableOpacity>
          </View>

          {visibility === 'department' && (
            <View style={styles.departmentWrap}>
              <Text style={styles.visibilitySubtitle}>Choose a department</Text>
              <View style={styles.departmentGrid}>
                {DEPARTMENT_OPTIONS.map((dept) => (
                  <TouchableOpacity
                    key={dept}
                    style={[styles.departmentChip, selectedDepartment === dept && styles.departmentChipActive]}
                    onPress={() => setSelectedDepartment(dept)}
                    disabled={submitting}
                  >
                    <Text style={[styles.departmentChipText, selectedDepartment === dept && styles.departmentChipTextActive]} numberOfLines={2}>
                      {dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.visibilityInfo, { marginTop: 10 }]}> 
            <MaterialIcons
              name={visibility === 'global' ? 'public' : 'groups'}
              size={16}
              color="#0f766e"
            />
            <Text style={styles.visibilityText}>
              {visibility === 'global'
                ? 'This post will be visible to all students and faculty'
                : `This post will only be visible to ${selectedDepartment} members`}
            </Text>
          </View>
        </View>

        {/* Author Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About You</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{profile?.full_name || 'Unknown'}</Text>
            <Text style={[styles.infoLabel, { marginTop: 8 }]}>Role</Text>
            <Text style={styles.infoValue}>
              {role === 'admin'
                ? '👮 Admin'
                : role === 'faculty'
                  ? '👨‍🏫 Faculty'
                  : '👤 Student'}
            </Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <MaterialIcons name="send" size={18} color="#ffffff" />}
          <Text style={styles.submitBtnText}>
            {submitting ? 'Publishing...' : 'Publish Post'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  content: {
    padding: 16,
    gap: 20,
    paddingBottom: 30,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeBtnActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#0f766e',
  },
  typeTextWrap: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  typeLabelActive: {
    color: '#0f766e',
  },
  typeHint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  contentInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'right',
    marginTop: 6,
  },
  attachBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e0',
  },
  attachBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
  },
  attachmentChip: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  attachmentText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  visibilityChoiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  visibilityChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  visibilityChoiceActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
  },
  visibilityChoiceText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  visibilityChoiceTextActive: {
    color: '#0f766e',
  },
  visibilitySubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  departmentWrap: {
    marginTop: 12,
  },
  departmentGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  departmentChip: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  departmentChipActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#0f766e',
  },
  departmentChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  departmentChipTextActive: {
    color: '#0f766e',
  },
  visibilityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdfa',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#99f6e0',
  },
  visibilityText: {
    flex: 1,
    fontSize: 12,
    color: '#0f766e',
    lineHeight: 16,
  },
  infoBox: {
    gap: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
