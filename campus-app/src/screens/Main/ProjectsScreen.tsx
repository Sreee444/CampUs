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
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type ProjectsScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Projects'>,
  StackNavigationProp<RootStackParamList>
>;

const allProjects = [
  { id: '1', title: 'Robotics Control Logic', status: 'Active', progress: 50, category: 'Engineering', team: 3 },
  { id: '2', title: 'AI Campus Assistant', status: 'Active', progress: 75, category: 'Computer Science', team: 5 },
  { id: '3', title: 'Sustainable Energy Study', status: 'Planning', progress: 20, category: 'Environmental', team: 4 },
  { id: '4', title: 'Mobile Health Tracker', status: 'Active', progress: 60, category: 'Health Tech', team: 4 },
  { id: '5', title: 'Smart Campus IoT', status: 'Completed', progress: 100, category: 'IoT', team: 6 },
  { id: '6', title: 'Blockchain Research', status: 'Planning', progress: 15, category: 'Blockchain', team: 3 },
];

const categories = ['All', 'Engineering', 'Computer Science', 'Environmental', 'Health Tech', 'IoT', 'Blockchain'];

export default function ProjectsScreen() {
  const navigation = useNavigation<ProjectsScreenNavigationProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = allProjects.filter((project) => {
    const matchesCategory = selectedCategory === 'All' || project.category === selectedCategory;
    const matchesSearch = project.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Projects</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => {}/* TODO: Navigate to create project screen */}>
          <MaterialIcons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Projects List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.resultsText}>
          {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
        </Text>

        {filteredProjects.map((project) => (
          <TouchableOpacity
            key={project.id}
            style={styles.projectCard}
            onPress={() => navigation.navigate('ProjectDetails')}
          >
            <View style={styles.projectHeader}>
              <View style={styles.projectInfo}>
                <Text style={styles.projectTitle}>{project.title}</Text>
                <Text style={styles.projectCategory}>{project.category}</Text>
              </View>
              <View style={[
                styles.statusBadge,
                project.status === 'Active' && styles.statusActive,
                project.status === 'Planning' && styles.statusPlanning,
                project.status === 'Completed' && styles.statusCompleted,
              ]}>
                <View style={[
                  styles.statusDot,
                  project.status === 'Active' && styles.statusDotActive,
                  project.status === 'Planning' && styles.statusDotPlanning,
                  project.status === 'Completed' && styles.statusDotCompleted,
                ]} />
                <Text style={[
                  styles.statusText,
                  project.status === 'Active' && styles.statusTextActive,
                  project.status === 'Planning' && styles.statusTextPlanning,
                  project.status === 'Completed' && styles.statusTextCompleted,
                ]}>{project.status}</Text>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Progress</Text>
                <Text style={styles.progressPercent}>{project.progress}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${project.progress}%` }]} />
              </View>
            </View>

            <View style={styles.projectFooter}>
              <View style={styles.teamInfo}>
                <MaterialIcons name="people" size={16} color="#64748b" />
                <Text style={styles.teamText}>{project.team} members</Text>
              </View>
              <TouchableOpacity 
                style={styles.viewButton}
                onPress={() => navigation.navigate('ProjectDetails')}
              >
                <Text style={styles.viewButtonText}>View Details</Text>
                <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
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
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: '#111818',
  },
  categoriesContainer: {
    maxHeight: 50,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  categoriesContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  resultsText: {
    fontSize: FontSizes.sm,
    color: '#64748b',
    marginBottom: 12,
  },
  projectCard: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 12,
    ...Shadows.sm,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  projectCategory: {
    fontSize: FontSizes.sm,
    color: '#64748b',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  statusActive: {
    backgroundColor: '#d1fae5',
  },
  statusPlanning: {
    backgroundColor: '#fef3c7',
  },
  statusCompleted: {
    backgroundColor: '#dbeafe',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
  },
  statusDotPlanning: {
    backgroundColor: '#f59e0b',
  },
  statusDotCompleted: {
    backgroundColor: '#3b82f6',
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeights.medium,
  },
  statusTextActive: {
    color: '#047857',
  },
  statusTextPlanning: {
    color: '#92400e',
  },
  statusTextCompleted: {
    color: '#1e40af',
  },
  progressSection: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  projectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamText: {
    fontSize: 12,
    color: '#64748b',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
});
