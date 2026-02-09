import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';

type CompleteProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CompleteProfile'>;

const interests = [
  { id: '1', label: 'Research', selected: true },
  { id: '2', label: 'Bio-Tech', selected: false },
  { id: '3', label: 'Modern Art', selected: false },
  { id: '4', label: 'AI & Robotics', selected: false },
  { id: '5', label: 'Literature', selected: false },
];

export default function CompleteProfileScreen() {
  const navigation = useNavigation<CompleteProfileScreenNavigationProp>();
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [selectedInterests, setSelectedInterests] = useState(interests);

  const toggleInterest = (id: string) => {
    setSelectedInterests(
      selectedInterests.map((interest) =>
        interest.id === id
          ? { ...interest, selected: !interest.selected }
          : interest
      )
    );
  };

  const handleFinish = () => {
    // TODO: Save profile data to backend
    navigation.navigate('MainTabs');
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    navigation.navigate('MainTabs');
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#fff8f0', '#fff5eb', '#ffe8e0']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <MaterialIcons name="arrow-back" size={24} color="#334155" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Profile</Text>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Upload Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarContainer} activeOpacity={0.8}>
              <Image
                source={{
                  uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHXpA7xMpmeWPSkbHRw1UoqeL6oaAdCm7LTpprPNwd1R1w-FoJBiymDD97JaP6r2F4E1HX52uJfig0X_neZC6kP16i7g-31pcstXoVEUgi_n_BHQ845BsVdIE17hUNITnQcht4hlBCq0rzlyKtlL_p9uHdu4Uxah7WMUVrolxubJdedAl4R9efwXMB45XP_TfON5EGQ-k2pG_1ov8Yb8LLWnA3DymNEnFygf6S0ZMTTwVvZtuKnxVJ_B3pl7WwCAISNU6OvmLPchiG',
                }}
                style={styles.avatar}
              />
              <View style={styles.avatarOverlay}>
                <MaterialIcons name="photo-camera" size={32} color="#ffffff" />
              </View>
              <View style={styles.avatarBadge}>
                <MaterialIcons name="add" size={18} color="#111818" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarLabel}>
              Let the campus know who you are
            </Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formFields}>
            {/* Department Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Department</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="school"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Computer Science"
                  value={department}
                  onChangeText={setDepartment}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Year / Position Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Year / Position</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="badge"
                  size={20}
                  color="#94a3b8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Sophomore / Adjunct Professor"
                  value={position}
                  onChangeText={setPosition}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
          </View>

          {/* Academic Interests */}
          <View style={styles.interestsSection}>
            <View style={styles.interestsHeader}>
              <Text style={styles.interestsTitle}>Academic Interests</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tagsContainer}>
              {selectedInterests.map((interest) => (
                <TouchableOpacity
                  key={interest.id}
                  style={[
                    styles.tag,
                    interest.selected && styles.tagSelected,
                  ]}
                  onPress={() => toggleInterest(interest.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tagText,
                      interest.selected && styles.tagTextSelected,
                    ]}
                  >
                    {interest.label}
                  </Text>
                  {interest.selected && (
                    <MaterialIcons name="check" size={16} color="#111818" />
                  )}
                </TouchableOpacity>
              ))}

              {/* Add Interest Button */}
              <TouchableOpacity style={styles.addTag} activeOpacity={0.7}>
                <MaterialIcons name="add" size={16} color="#64748b" />
                <Text style={styles.addTagText}>Add Interest</Text>
              </TouchableOpacity>
            </View>

            {/* AI Helper */}
            <View style={styles.aiHelper}>
              <View style={styles.aiIcon}>
                <MaterialIcons name="smart-toy" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.aiHelperText}>
                You can refine these interests anytime in your settings. Our AI uses
                them to curate your feed.
              </Text>
            </View>
          </View>

          {/* Bottom Spacing for FAB */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Floating Action Button */}
        <LinearGradient
          colors={['rgba(255,248,240,0)', 'rgba(255,248,240,0.8)', '#fff8f0']}
          style={styles.fabContainer}
        >
          <TouchableOpacity
            style={styles.finishButton}
            onPress={handleFinish}
            activeOpacity={0.9}
          >
            <Text style={styles.finishButtonText}>Finish Setup</Text>
          </TouchableOpacity>
        </LinearGradient>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.creamSoft,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#334155',
  },
  skipButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
  },
  skipButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#64748b',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 120,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    borderColor: '#ffffff',
    backgroundColor: '#e2e8f0',
    ...Shadows.xl,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 64,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  avatarLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  formFields: {
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#334155',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadows.sm,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 56,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: '#111818',
  },
  interestsSection: {
    marginTop: Spacing.xl,
  },
  interestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  interestsTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
  seeAllText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#64748b',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    ...Shadows.sm,
  },
  tagSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tagText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  tagTextSelected: {
    color: '#111818',
    fontWeight: FontWeights.semibold,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  addTagText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: '#64748b',
  },
  aiHelper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  aiIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiHelperText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 24,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  finishButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  finishButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: '#111818',
  },
});
