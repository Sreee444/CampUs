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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile } from '../../api/auth';

type AcademicDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AcademicDetails'>;

export default function AcademicDetailsScreen() {
  const navigation = useNavigation<AcademicDetailsScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [gpa, setGpa] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

  useEffect(() => {
    if (profile) {
      setDepartment(profile.department || '');
      setYear(profile.year?.toString() || '');
      setRollNumber(profile.enrollment_number || '');
      // Note: GPA not in current schema, would need to add or use a different field
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      await updateProfile(user.id, {
        department: department.trim(),
        year: year ? parseInt(year) : undefined,
        enrollment_number: rollNumber.trim(),
      });

      await refreshProfile();
      setToast({ visible: true, message: 'Academic details updated!', type: 'success' });
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Academic Details</Text>
        <TouchableOpacity onPress={handleSave} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.saveButton}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Department</Text>
            <TextInput
              style={styles.input}
              value={department}
              onChangeText={setDepartment}
              placeholder="Enter your department"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              style={styles.input}
              value={year}
              onChangeText={setYear}
              placeholder="e.g., 1st Year, 2nd Year"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Roll Number / Student ID</Text>
            <TextInput
              style={styles.input}
              value={rollNumber}
              onChangeText={setRollNumber}
              placeholder="Enter your ID"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>GPA / CGPA</Text>
            <TextInput
              style={styles.input}
              value={gpa}
              onChangeText={setGpa}
              placeholder="Enter your GPA"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.card}>
            <MaterialIcons name="school" size={24} color={Colors.primary} />
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Academic Records</Text>
              <Text style={styles.cardSubtitle}>View your complete academic history, grades, and transcripts</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </View>

          <View style={styles.card}>
            <MaterialIcons name="workspace-premium" size={24} color="#f59e0b" />
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Achievements</Text>
              <Text style={styles.cardSubtitle}>Awards, certifications, and honors</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
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

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
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
    color: Colors.primary,
    paddingHorizontal: 8,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: Spacing.md,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 12,
    ...Shadows.sm,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
