import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../../navigation/types';
import { getEvents } from '../../api/events';
import { getProjectsByRole, getProjectTeams } from '../../api/projects';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { BorderRadius, FontSizes, FontWeights, getColors, Shadows, Spacing } from '../../theme';

type Nav = StackNavigationProp<RootStackParamList>;

type ProjectCard = {
  id: string;
  name?: string;
  description?: string;
  is_recruiting?: boolean;
  category?: string;
  max_members?: number;
  members?: any[];
  creator?: {
    full_name?: string;
    department?: string;
  };
};

export default function QuickRecommendationsScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'projects'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);

  const ALLOWED_PROJECT_STATUSES = new Set(['planning', 'recruiting', 'executing', 'in-progress']);

  const loadRecommendations = async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [eventsData, projectData] = await Promise.all([
        getEvents(user?.id, undefined, 'upcoming'),
        profile?.role
          ? getProjectsByRole(profile.role as any, user?.id || '')
          : getProjectTeams(user?.id, true),
      ]);

      const statusFilteredProjects = (projectData || []).filter((project: any) => {
        const normalizedStatus = String(project?.status || '')
          .trim()
          .toLowerCase()
          .replace(/_/g, '-')
          .replace(/\s+/g, '-');
        return ALLOWED_PROJECT_STATUSES.has(normalizedStatus);
      });

      setEvents((eventsData || []).slice(0, 6));
      setProjects((statusFilteredProjects as ProjectCard[]).slice(0, 8));
    } catch {
      setEvents([]);
      setProjects([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    loadRecommendations();

    return () => {
      mounted = false;
    };
  }, [user?.id, profile?.role]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#F5E6D8', '#EDEBFF', '#DFF3EE']}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Quick Recommendations</Text>
            <Text style={styles.headerSub}>Check out the latest events and join a project team!</Text>
          </View>
        </View>

        <View style={styles.segmentedRow}>
          <TouchableOpacity
            style={[styles.segmentPill, activeTab === 'events' && styles.segmentPillActive]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.segmentPillText, activeTab === 'events' && styles.segmentPillTextActive]}>
              Events
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentPill, activeTab === 'projects' && styles.segmentPillActive]}
            onPress={() => setActiveTab('projects')}
          >
            <Text style={[styles.segmentPillText, activeTab === 'projects' && styles.segmentPillTextActive]}>
              Projects
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loaderText}>Loading recommendations...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadRecommendations(true)}
                tintColor="#6366F1"
              />
            }
          >
            {activeTab === 'events' ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Upcoming Events</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'Events' })}>
                    <Text style={styles.sectionLink}>See all</Text>
                  </TouchableOpacity>
                </View>

                {events.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <MaterialIcons name="event-busy" size={22} color={Colors.textSecondary} />
                    <Text style={styles.emptyText}>No upcoming events right now.</Text>
                  </View>
                ) : (
                  events.map((event) => (
                    <TouchableOpacity
                      key={event.id}
                      style={styles.eventCard}
                      onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
                      activeOpacity={0.86}
                    >
                      {Boolean(event.banner_image || event.poster_image || event.image_url) && (
                        <Image
                          source={{ uri: event.banner_image || event.poster_image || event.image_url }}
                          style={styles.eventBannerImage}
                          resizeMode="cover"
                        />
                      )}

                      <View style={styles.cardTopRow}>
                        <View style={[styles.itemIconWrap, { backgroundColor: '#E8F2FF' }]}>
                          <MaterialIcons name="event" size={20} color="#2563EB" />
                        </View>
                        <View style={styles.itemContent}>
                          <Text numberOfLines={1} style={styles.itemTitle}>{event.title || 'Event'}</Text>
                          <Text numberOfLines={2} style={styles.itemSub}>
                            {event.description?.trim() || 'Upcoming campus event'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.middleSection}>
                        <Text numberOfLines={1} style={styles.middlePrimaryText}>
                          {'📅 '} {event.start_date ? new Date(event.start_date).toLocaleString() : 'Date TBD'}
                        </Text>
                        <Text numberOfLines={1} style={styles.middleSecondaryText}>
                          {'📍 '} {event.is_online ? 'Online event' : (event.venue || 'Venue will be announced')}
                        </Text>
                      </View>

                      <View style={styles.projectMetaRow}>
                        <View style={styles.projectMetaChip}>
                          <MaterialIcons name="label-outline" size={13} color="#4F46E5" />
                          <Text style={styles.projectMetaChipText}>
                            {String(event.event_type || 'event').charAt(0).toUpperCase() + String(event.event_type || 'event').slice(1)}
                          </Text>
                        </View>
                        <View style={[styles.projectMetaChip, styles.rightMetaChip]}>
                          <MaterialIcons name="groups" size={13} color="#059669" />
                          <Text style={styles.projectMetaChipText}>
                            {event.max_participants ? `Up to ${event.max_participants}` : 'Open seats'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.projectActionRow}>
                        <Text style={styles.eventStatusText}>Registration open</Text>
                        <View style={styles.projectCTA}>
                          <Text style={styles.projectCTAText}>View details</Text>
                          <MaterialIcons name="arrow-forward-ios" size={12} color="#6366F1" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recruiting Projects</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'Projects' })}>
                    <Text style={styles.sectionLink}>See all</Text>
                  </TouchableOpacity>
                </View>

                {projects.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <MaterialIcons name="work-off" size={22} color={Colors.textSecondary} />
                    <Text style={styles.emptyText}>No open project teams right now.</Text>
                  </View>
                ) : (
                  projects.map((project) => {
                    const membersCount = Array.isArray(project.members) ? project.members.length : 0;
                    return (
                      <TouchableOpacity
                        key={project.id}
                        style={styles.projectCard}
                        onPress={() => navigation.navigate('ProjectDetails', { teamId: project.id })}
                        activeOpacity={0.86}
                      >
                        <View style={styles.projectHeaderRow}>
                          <View style={[styles.itemIconWrap, { backgroundColor: '#D8F3E7' }]}>
                            <MaterialIcons name="work-outline" size={20} color="#059669" />
                          </View>
                          <View style={styles.itemContent}>
                            <Text numberOfLines={1} style={styles.itemTitle}>{project.name || 'Project Team'}</Text>
                            <Text numberOfLines={2} style={styles.itemSub}>
                              {project.description?.trim() || 'Open team looking for collaborators.'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.middleSection}>
                          <Text numberOfLines={1} style={styles.middlePrimaryText}>
                            {'👤 '} {project.creator?.full_name || 'Campus Member'}
                          </Text>
                          <Text numberOfLines={1} style={styles.middleSecondaryText}>
                            {'🎓 '} {project.creator?.department || 'Department not specified'}
                          </Text>
                        </View>

                        <View style={styles.projectMetaRow}>
                          <View style={styles.projectMetaChip}>
                            <MaterialIcons name="label-outline" size={13} color="#4F46E5" />
                            <Text style={styles.projectMetaChipText}>{project.category || 'General'}</Text>
                          </View>
                          <View style={[styles.projectMetaChip, styles.rightMetaChip]}>
                            <MaterialIcons name="groups" size={13} color="#059669" />
                            <Text style={styles.projectMetaChipText}>{membersCount}/{project.max_members || 0} members</Text>
                          </View>
                        </View>

                        <View style={styles.projectActionRow}>
                          <Text style={styles.projectMeta}>Actively recruiting teammates</Text>
                          <View style={styles.projectCTA}>
                            <Text style={styles.projectCTAText}>View details</Text>
                            <MaterialIcons name="arrow-forward-ios" size={12} color="#6366F1" />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: '#F5E6D8',
    },
    container: {
      flex: 1,
      ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 8,
    },
    backBtn: {
      marginRight: 10,
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.75)',
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: '#111827',
    },
    headerSub: {
      marginTop: 4,
      fontSize: FontSizes.sm,
      color: '#6B7280',
      fontWeight: '500',
    },
    segmentedRow: {
      flexDirection: 'row',
      marginHorizontal: 18,
      marginTop: 8,
      marginBottom: 12,
      backgroundColor: 'rgba(255,255,255,0.42)',
      borderRadius: 999,
      padding: 4,
      gap: 4,
    },
    segmentPill: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    segmentPillActive: {
      backgroundColor: 'rgba(255,255,255,0.72)',
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    segmentPillText: {
      fontSize: 13,
      fontWeight: '500',
      color: '#6B7280',
    },
    segmentPillTextActive: {
      color: '#6366F1',
      fontWeight: '700',
    },
    loaderWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loaderText: {
      marginTop: 10,
      color: Colors.textSecondary,
      fontSize: FontSizes.sm,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 28,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#1F2937',
    },
    sectionLink: {
      fontSize: FontSizes.sm,
      color: '#6366F1',
      fontWeight: '700',
    },
    eventCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 18,
      marginBottom: 16,
      overflow: 'hidden',
      paddingVertical: 15,
      paddingHorizontal: 15,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    eventBannerImage: {
      width: '100%',
      height: 150,
      marginBottom: 12,
      borderRadius: 12,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowEnd: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eventChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#E0E7FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    eventChipText: {
      color: '#4F46E5',
      fontSize: 12,
      fontWeight: '700',
    },
    eventStatusText: {
      color: '#059669',
      fontSize: 12,
      fontWeight: '700',
    },
    projectCard: {
      paddingVertical: 15,
      paddingHorizontal: 15,
      marginBottom: 16,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    projectHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    itemIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    itemContent: {
      flex: 1,
      marginRight: 10,
    },
    itemTitle: {
      color: '#111827',
      fontSize: FontSizes.md,
      fontWeight: '700',
    },
    itemSub: {
      marginTop: 3,
      color: '#6B7280',
      fontSize: FontSizes.sm,
    },
    middleSection: {
      marginTop: 10,
      gap: 6,
    },
    middlePrimaryText: {
      color: '#1F2937',
      fontSize: 14,
      fontWeight: '700',
    },
    middleSecondaryText: {
      color: '#6B7280',
      fontSize: 12,
      fontWeight: '500',
    },
    projectMetaRow: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    projectMetaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#EEF2FF',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    rightMetaChip: {
      marginLeft: 'auto',
    },
    projectMetaChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#4B5563',
    },
    projectActionRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    projectMeta: {
      color: '#4B5563',
      fontSize: 12,
      fontWeight: '600',
    },
    projectCTA: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    projectCTAText: {
      color: '#6366F1',
      fontSize: 12,
      fontWeight: '700',
    },
    emptyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 16,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    emptyText: {
      color: '#6B7280',
      fontSize: FontSizes.sm,
      fontWeight: '500',
    },
  });
