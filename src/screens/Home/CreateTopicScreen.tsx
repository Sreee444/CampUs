import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { createDiscussionTopic } from '../../api/discussions';
import { DiscussionCategory } from '../../types/database';

type NavigationProp = StackNavigationProp<RootStackParamList, 'CreateTopic'>;

const categories: { label: string; value: DiscussionCategory; icon: string; color: string }[] = [
  { label: 'Academic', value: 'academic', icon: 'school', color: '#3b82f6' },
  { label: 'Doubt', value: 'doubt', icon: 'help-outline', color: '#f59e0b' },
  { label: 'Project', value: 'project', icon: 'folder-open', color: '#10b981' },
  { label: 'General', value: 'general', icon: 'forum', color: '#6366f1' },
];

export default function CreateTopicScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DiscussionCategory>('academic');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter a title' });
      return;
    }

    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Please login to create a topic' });
      return;
    }

    try {
      setIsLoading(true);
      await createDiscussionTopic(title.trim(), selectedCategory, user.id);
      Toast.show({ type: 'success', text1: 'Discussion created!' });
      navigation.goBack();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to create discussion',
        text2: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Discussion</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.label}>Discussion Title</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="What would you like to discuss?"
              placeholderTextColor={Colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              multiline
              maxLength={200}
            />
            <Text style={styles.charCount}>{title.length}/200</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoriesGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.categoryCard,
                    selectedCategory === cat.value && {
                      backgroundColor: cat.color + '15',
                      borderColor: cat.color,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.value)}
                >
                  <MaterialIcons
                    name={cat.icon as any}
                    size={24}
                    color={selectedCategory === cat.value ? cat.color : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categoryLabel,
                      selectedCategory === cat.value && { color: cat.color, fontWeight: '600' },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.infoBox}>
            <MaterialIcons name="info-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>
              Choose a clear title and appropriate category to get better responses from the community.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.createButton, isLoading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={isLoading}
          >
            <Text style={styles.createButtonText}>
              {isLoading ? 'Creating...' : 'Create Discussion'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
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
    backButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    content: {
      flex: 1,
      padding: Spacing.md,
    },
    section: {
      marginBottom: Spacing.lg,
    },
    label: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: 12,
    },
    titleInput: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      minHeight: 80,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    charCount: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'right',
      marginTop: 4,
    },
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    categoryCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      alignItems: 'center',
      gap: 8,
      borderWidth: 2,
      borderColor: Colors.border,
    },
    categoryLabel: {
      fontSize: FontSizes.sm,
      color: Colors.text,
    },
    infoBox: {
      flexDirection: 'row',
      gap: 12,
      padding: Spacing.md,
      backgroundColor: Colors.primary + '10',
      borderRadius: BorderRadius.md,
      marginTop: Spacing.md,
    },
    infoText: {
      flex: 1,
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      lineHeight: 20,
    },
    footer: {
      padding: Spacing.md,
      backgroundColor: Colors.surface,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    createButton: {
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: 16,
      alignItems: 'center',
      ...Shadows.sm,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    createButtonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: '#111818',
    },
  });
