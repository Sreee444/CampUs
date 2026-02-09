import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { Toast } from '../../components/Toast';

type AcademicDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AcademicDetails'>;

export default function AcademicDetailsScreen() {
  const navigation = useNavigation<AcademicDetailsScreenNavigationProp>();
  const [department, setDepartment] = useState('Computer Science');
  const [year, setYear] = useState('3rd Year');
  const [rollNumber, setRollNumber] = useState('CS21B1001');
  const [gpa, setGpa] = useState('8.5');
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

  const handleSave = () => {
    setToast({ visible: true, message: 'Academic details updated!', type: 'success' });
    setTimeout(() => navigation.goBack(), 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#111818" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Academic Details</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.saveButton}>Save</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
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
    color: '#374151',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.md,
    color: '#111818',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
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
    color: '#111818',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
});
