import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import { recommendMentor } from '../../api/ai';
import {
  getIncomingMentorRequests,
  getMentorProfiles,
  getMentorshipSessions,
  getOutgoingMentorRequests,
  requestMentor,
  updateMentorRequestStatus,
} from '../../api/mentors';
import { supabase } from '../../api/supabase';

export default function MentorHubScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [activeTab, setActiveTab] = useState<'find' | 'requests' | 'sessions'>('find');
  const [isLoading, setIsLoading] = useState(true);
  const [mentors, setMentors] = useState<any[]>([]);
  const [recommendedMentors, setRecommendedMentors] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedMentor, setSelectedMentor] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const isMentor = Boolean(profile?.is_mentor);
  const canMentor = profile?.role === 'alumni' || profile?.role === 'faculty';

  useEffect(() => {
    loadMentorData();
  }, [user?.id]);

  const loadMentorData = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      const [mentorList, incoming, outgoing, sessionList] = await Promise.all([
        getMentorProfiles(),
        isMentor ? getIncomingMentorRequests(user.id) : Promise.resolve([]),
        getOutgoingMentorRequests(user.id),
        getMentorshipSessions(user.id),
      ]);

      setMentors(mentorList || []);
      setIncomingRequests(incoming || []);
      setOutgoingRequests(outgoing || []);
      setSessions(sessionList || []);

      const recommendations = await recommendMentor(user.id);
      const ids = recommendations.map((r: any) => r.id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, department, avatar_url, role, areas_of_expertise')
          .in('id', ids);

        const ranked = (data || []).map((mentor: any) => {
          const match = recommendations.find((r: any) => r.id === mentor.id);
          return { ...mentor, matchScore: match?.matchScore || 0 };
        });
        setRecommendedMentors(ranked);
      } else {
        setRecommendedMentors([]);
      }
    } catch (error) {
      console.error('Mentor hub error:', error);
      Toast.show({ type: 'error', text1: 'Failed to load mentors' });
    } finally {
      setIsLoading(false);
    }
  };

  const openRequestModal = (mentor: any) => {
    setSelectedMentor(mentor);
    setRequestMessage('');
    setRequestModalOpen(true);
  };

  const submitMentorRequest = async () => {
    if (!user?.id || !selectedMentor) return;
    try {
      setIsSubmittingRequest(true);
      await requestMentor(selectedMentor.id, user.id, requestMessage.trim());
      Toast.show({ type: 'success', text1: 'Request sent' });
      setRequestModalOpen(false);
      await loadMentorData();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to send request',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleRequestAction = async (requestId: string, status: 'accepted' | 'rejected') => {
    try {
      await updateMentorRequestStatus(requestId, status);
      Toast.show({ type: 'success', text1: `Request ${status}` });
      await loadMentorData();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to update request' });
    }
  };

  const mentorTags = (areas?: string[]) =>
    (areas || []).slice(0, 3).map((tag) => (
      <View key={tag} style={styles.tag}>
        <Text style={styles.tagText}>{tag}</Text>
      </View>
    ));

  const hasSessions = sessions.length > 0;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mentor Hub</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabsRow}>
        {['find', 'requests', 'sessions'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'find' ? 'Find' : tab === 'requests' ? 'Requests' : 'Sessions'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'find' && (
          <>
            <Text style={styles.sectionTitle}>AI Recommended Mentors</Text>
            {recommendedMentors.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="person-search" size={40} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>Complete your profile for AI recommendations</Text>
              </View>
            ) : (
              recommendedMentors.map((mentor) => (
                <View key={mentor.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <UserAvatar
                      uri={mentor.avatar_url}
                      name={mentor.full_name}
                      role={mentor.role}
                      size={44}
                      showRing
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{mentor.full_name}</Text>
                      <Text style={styles.cardSubtitle}>{mentor.department || 'Mentor'}</Text>
                    </View>
                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreText}>{mentor.matchScore}</Text>
                    </View>
                  </View>
                  <View style={styles.tagRow}>{mentorTags(mentor.areas_of_expertise)}</View>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => openRequestModal(mentor)}
                  >
                    <Text style={styles.primaryButtonText}>Request Mentorship</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>All Mentors</Text>
            {mentors.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="school" size={40} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No mentors available yet</Text>
              </View>
            ) : (
              mentors.map((mentor) => (
                <View key={mentor.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <UserAvatar
                      uri={mentor.avatar_url}
                      name={mentor.full_name}
                      role={mentor.role}
                      size={44}
                      showRing
                      isClubCoordinator={mentor.is_club_coordinator}
                      isVolunteer={mentor.is_volunteer}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{mentor.full_name}</Text>
                      <Text style={styles.cardSubtitle}>{mentor.department || 'Mentor'}</Text>
                    </View>
                  </View>
                  <View style={styles.tagRow}>{mentorTags(mentor.areas_of_expertise)}</View>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => openRequestModal(mentor)}
                  >
                    <Text style={styles.secondaryButtonText}>Request Mentorship</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'requests' && (
          <>
            {isMentor && (
              <>
                <Text style={styles.sectionTitle}>Incoming Requests</Text>
                {incomingRequests.length === 0 ? (
                  <Text style={styles.emptyText}>No incoming requests</Text>
                ) : (
                  incomingRequests.map((req) => (
                    <View key={req.id} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <UserAvatar
                          uri={req.mentee?.avatar_url}
                          name={req.mentee?.full_name}
                          role={req.mentee?.role}
                          size={40}
                          isClubCoordinator={req.mentee?.is_club_coordinator}
                          isVolunteer={req.mentee?.is_volunteer}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{req.mentee?.full_name}</Text>
                          <Text style={styles.cardSubtitle}>{req.message || 'Mentorship request'}</Text>
                        </View>
                      </View>
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={styles.secondaryButton}
                          onPress={() => handleRequestAction(req.id, 'rejected')}
                        >
                          <Text style={styles.secondaryButtonText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.primaryButton}
                          onPress={() => handleRequestAction(req.id, 'accepted')}
                        >
                          <Text style={styles.primaryButtonText}>Accept</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            <Text style={styles.sectionTitle}>Outgoing Requests</Text>
            {outgoingRequests.length === 0 ? (
              <Text style={styles.emptyText}>No outgoing requests</Text>
            ) : (
              outgoingRequests.map((req) => (
                <View key={req.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <UserAvatar
                      uri={req.mentor?.avatar_url}
                      name={req.mentor?.full_name}
                      role={req.mentor?.role}
                      size={40}
                      isClubCoordinator={req.mentor?.is_club_coordinator}
                      isVolunteer={req.mentor?.is_volunteer}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{req.mentor?.full_name}</Text>
                      <Text style={styles.cardSubtitle}>Status: {req.status}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {!isMentor && canMentor && (
              <View style={styles.infoCard}>
                <MaterialIcons name="info" size={18} color={Colors.primary} />
                <Text style={styles.infoText}>
                  Enable your mentor profile in Settings to receive requests.
                </Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'sessions' && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
            {!hasSessions ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="event" size={40} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No scheduled sessions</Text>
              </View>
            ) : (
              sessions.map((session) => (
                <View key={session.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <UserAvatar
                      uri={session.mentor?.avatar_url}
                      name={session.mentor?.full_name}
                      role={session.mentor?.role}
                      size={40}
                      isClubCoordinator={session.mentor?.is_club_coordinator}
                      isVolunteer={session.mentor?.is_volunteer}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {session.mentor?.full_name || 'Mentor'} & {session.mentee?.full_name || 'Mentee'}
                      </Text>
                      <Text style={styles.cardSubtitle}>
                        {new Date(session.scheduled_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={requestModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Mentorship</Text>
              <TouchableOpacity onPress={() => setRequestModalOpen(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Message</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Share your goals and what you need help with"
              placeholderTextColor={Colors.textSecondary}
              value={requestMessage}
              onChangeText={setRequestMessage}
              multiline
            />
            <TouchableOpacity
              style={[styles.primaryButton, isSubmittingRequest && { opacity: 0.6 }]}
              onPress={submitMentorRequest}
              disabled={isSubmittingRequest}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmittingRequest ? 'Sending...' : 'Send Request'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 8,
      padding: Spacing.md,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    tabActive: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primary,
    },
    tabText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
    },
    tabTextActive: {
      color: '#ffffff',
    },
    content: {
      padding: Spacing.md,
      gap: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
    },
    card: {
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
      gap: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    cardTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    cardSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tag: {
      backgroundColor: Colors.primary + '15',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    tagText: {
      fontSize: FontSizes.xs,
      color: Colors.primary,
      fontWeight: FontWeights.semibold,
    },
    primaryButton: {
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#ffffff',
      fontWeight: FontWeights.bold,
      fontSize: FontSizes.sm,
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: Colors.card,
      flex: 1,
    },
    secondaryButtonText: {
      color: Colors.text,
      fontWeight: FontWeights.semibold,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    scoreBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreText: {
      color: Colors.primary,
      fontWeight: FontWeights.bold,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 24,
      gap: 8,
    },
    emptyText: {
      textAlign: 'center',
      color: Colors.textSecondary,
    },
    infoCard: {
      flexDirection: 'row',
      gap: 10,
      padding: Spacing.md,
      backgroundColor: Colors.primary + '15',
      borderRadius: BorderRadius.md,
      alignItems: 'center',
    },
    infoText: {
      flex: 1,
      color: Colors.primary,
      fontSize: FontSizes.sm,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.md,
    },
    modalCard: {
      width: '100%',
      backgroundColor: Colors.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    modalLabel: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    modalInput: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: BorderRadius.md,
      padding: Spacing.sm,
      textAlignVertical: 'top',
      color: Colors.text,
    },
  });
