import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { recommendTeams } from '../../api/ai';
import { createProjectTeam } from '../../api/projects';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';

export default function TeamFormationScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [maxMembers, setMaxMembers] = useState('5');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      const data = await recommendTeams(user.id);
      setRecommendations(data.map((item: any) => ({ userId: item.userId, matchScore: item.score })));
    } catch (error) {
      console.error('Error loading recommendations:', error);
      Toast.show({ type: 'error', text1: 'Failed to load recommendations' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim() || !user?.id) {
      Toast.show({ type: 'error', text1: 'Please fill all fields' });
      return;
    }

    try {
      setIsCreating(true);
      await createProjectTeam({
        name: teamName,
        description: teamDescription,
        created_by: user.id,
        max_members: Math.min(10, parseInt(maxMembers) || 5),
        is_recruiting: true,
        is_ai_generated: false,
      });
      Toast.show({ type: 'success', text1: 'Team created successfully!' });
      setTeamName('');
      setTeamDescription('');
      setMaxMembers('5');
      setSelectedMembers([]);
      setModalVisible(false);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to create team' });
    } finally {
      setIsCreating(false);
    }
  };

  const renderRecommendation = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={styles.recommendationCard}
      onPress={() => setSelectedMembers((prev) =>
        prev.includes(item.userId)
          ? prev.filter((id) => id !== item.userId)
          : [...prev, item.userId]
        )}
      activeOpacity={0.7}
    >
      <View style={styles.recommendationHeader}>
        <View style={styles.userInfoContainer}>
          <View style={[styles.rankBadge, { backgroundColor: getRankColor(index) }]}>
            <Text style={styles.rankNumber}>#{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.matchScore}>
              {Math.round((item.matchScore / 100) * 100)}% Match
            </Text>
            <Text style={styles.matchInfo}>Based on skills & interests</Text>
          </View>
        </View>
        <View
          style={[
            styles.selectCheckbox,
            selectedMembers.includes(item.userId) && styles.checkboxActive,
          ]}
        >
          {selectedMembers.includes(item.userId) && (
            <MaterialIcons name="check" size={16} color="#fff" />
          )}
        </View>
      </View>

      <View style={styles.scoreBar}>
        <View
          style={[
            styles.scoreFill,
            { width: `${Math.min((item.matchScore / 100) * 100, 100)}%` },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  const getRankColor = (index: number) => {
    const colors = ['#fbbf24', '#9ca3af', '#cd7f32'];
    return colors[index % 3] || '#3b82f6';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Team Formation</Text>
          <Text style={styles.subtitle}>AI-Powered Team Recommendations</Text>
        </View>

        {/* Your Profile Summary */}
        <View style={[styles.profileCard, { backgroundColor: Colors.surface }]}>
          <View style={styles.profileHeader}>
            <UserAvatar uri={profile?.avatar_url} name={profile?.full_name} size={56} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile?.full_name}</Text>
              <Text style={styles.profileMeta}>{profile?.department}</Text>
            </View>
          </View>

          <View style={styles.profileDetails}>
            {profile?.skills && profile.skills.length > 0 && (
              <View>
                <Text style={styles.detailLabel}>Skills</Text>
                <View style={styles.tagContainer}>
                  {profile.skills.slice(0, 3).map((skill, idx) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>{skill}</Text>
                    </View>
                  ))}
                  {profile.skills.length > 3 && (
                    <View style={[styles.tag, { backgroundColor: Colors.textSecondary + '20' }]}>
                      <Text style={styles.tagText}>+{profile.skills.length - 3}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Recommendations Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recommended Collaborators</Text>
            <MaterialIcons name="auto-awesome" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.sectionDescription}>
            {recommendations.length > 0
              ? `${recommendations.length} collaborators match your profile`
              : 'No recommendations available'}
          </Text>

          {recommendations.length > 0 ? (
            <FlatList
              data={recommendations.slice(0, 5)}
              renderItem={renderRecommendation}
              keyExtractor={(item, idx) => `${item.userId}-${idx}`}
              scrollEnabled={false}
              contentContainerStyle={styles.recommendationsList}
            />
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="groups" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Complete your profile</Text>
              <Text style={styles.emptySubtext}>
                Add skills and interests to get recommendations
              </Text>
            </View>
          )}
        </View>

        {/* Create Team Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Create Your Team</Text>
          <View style={[styles.infoCard, { backgroundColor: Colors.primary + '15' }]}>
            <MaterialIcons name="info" size={18} color={Colors.primary} />
            <Text style={[styles.infoText, { color: Colors.primary }]}>
              Selected collaborators will be shown as recommendations for your team
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: Colors.primary }]}
            onPress={() => setModalVisible(true)}
          >
            <MaterialIcons name="add-circle" size={20} color="#fff" />
            <Text style={styles.createButtonText}>Create Team</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Create Team Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Team</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Team Name *</Text>
                <TextInput
                  style={[styles.input, { borderColor: Colors.border }]}
                  placeholder="e.g., AI Chat App Team"
                  placeholderTextColor={Colors.textSecondary}
                  value={teamName}
                  onChangeText={setTeamName}
                  maxLength={50}
                />
                <Text style={styles.charCount}>{teamName.length}/50</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.textArea, { borderColor: Colors.border }]}
                  placeholder="What's your team about?"
                  placeholderTextColor={Colors.textSecondary}
                  value={teamDescription}
                  onChangeText={setTeamDescription}
                  multiline
                  numberOfLines={4}
                  maxLength={200}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{teamDescription.length}/200</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Max Team Members</Text>
                <View style={styles.memberSelector}>
                  {[3, 4, 5, 6, 8, 10].map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.memberOption,
                        maxMembers === String(num) && styles.memberOptionActive,
                        { borderColor: Colors.border },
                      ]}
                      onPress={() => setMaxMembers(String(num))}
                    >
                      <Text
                        style={[
                          styles.memberOptionText,
                          maxMembers === String(num) && styles.memberOptionTextActive,
                        ]}
                      >
                        {num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {selectedMembers.length > 0 && (
                <View style={styles.selectedMembersInfo}>
                  <MaterialIcons name="check-circle" size={18} color={Colors.primary} />
                  <Text style={[styles.infoText, { color: Colors.primary }]}>
                    {selectedMembers.length} collaborator(s) will see your team
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: Colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButtonModal, { backgroundColor: Colors.primary }]}
                onPress={handleCreateTeam}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="add" size={18} color="#fff" />
                    <Text style={styles.createButtonTextModal}>Create</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    title: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    profileCard: {
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    profileHeader: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    profileInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    profileName: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    profileMeta: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    profileDetails: {
      gap: Spacing.md,
    },
    detailLabel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    tagContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    tag: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary + '20',
    },
    tagText: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
      color: Colors.primary,
    },
    section: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
    },
    sectionDescription: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: Spacing.md,
    },
    recommendationsList: {
      gap: Spacing.md,
    },
    recommendationCard: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: Spacing.md,
    },
    recommendationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    userInfoContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      flex: 1,
    },
    rankBadge: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankNumber: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.bold,
      color: '#fff',
    },
    matchScore: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    matchInfo: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    selectCheckbox: {
      width: 24,
      height: 24,
      borderRadius: BorderRadius.md,
      borderWidth: 2,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    scoreBar: {
      height: 8,
      backgroundColor: Colors.border,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },
    scoreFill: {
      height: '100%',
      backgroundColor: Colors.primary,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: Spacing.xxl,
      gap: Spacing.md,
    },
    emptyText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    emptySubtext: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.md,
    },
    infoText: {
      flex: 1,
      fontSize: FontSizes.sm,
      lineHeight: 18,
    },
    selectedMembersInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.primary + '15',
      marginBottom: Spacing.md,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    createButtonText: {
      color: '#fff',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      maxHeight: '90%',
      paddingTop: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    modalBody: {
      padding: Spacing.md,
      maxHeight: 'auto',
    },
    formGroup: {
      marginBottom: Spacing.lg,
    },
    label: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: 4,
    },
    textArea: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: 4,
    },
    charCount: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      textAlign: 'right',
    },
    memberSelector: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    memberOption: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      alignItems: 'center',
    },
    memberOptionActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    memberOptionText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    memberOptionTextActive: {
      color: '#fff',
    },
    modalFooter: {
      flexDirection: 'row',
      gap: Spacing.md,
      padding: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    createButtonModal: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    createButtonTextModal: {
      color: '#fff',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
    },
  });
