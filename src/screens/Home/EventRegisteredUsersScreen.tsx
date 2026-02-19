import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../api/supabase';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';

type EventRegisteredUsersScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'EventRegisteredUsers'
>;
type EventRegisteredUsersScreenRouteProp = RouteProp<RootStackParamList, 'EventRegisteredUsers'>;

interface RegisteredUser {
  id: string;
  user_id: string;
  registered_at: string;
  user: {
    id: string;
    full_name?: string;
    email: string;
    avatar_url?: string;
    role?: string;
    department?: string;
    year?: number;
    enrollment_number?: string;
  };
}

export default function EventRegisteredUsersScreen() {
  const navigation = useNavigation<EventRegisteredUsersScreenNavigationProp>();
  const route = useRoute<EventRegisteredUsersScreenRouteProp>();
  const { isDark } = useTheme();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const { eventId, eventTitle } = route.params;
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRegisteredUsers();
  }, [eventId]);

  const loadRegisteredUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('event_registrations')
        .select(
          `
          id,
          user_id,
          registered_at,
          user:profiles!event_registrations_user_id_fkey(
            id,
            full_name,
            email,
            avatar_url,
            role,
            department,
            year,
            enrollment_number
          )
        `
        )
        .eq('event_id', eventId)
        .eq('status', 'registered')
        .order('registered_at', { ascending: false });

      if (error) throw error;

      setUsers((data as any) || []);
    } catch (err) {
      console.error('Failed to load registered users', err);
      Toast.show({
        type: 'error',
        text1: 'Load Failed',
        text2: 'Unable to load registered users',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const studentCount = users.filter((u) => u.user.role === 'student').length;
  const facultyCount = users.filter((u) => u.user.role === 'faculty').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Registered Users</Text>
          <Text style={styles.headerSubtitle}>{users.length} participants</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fb7185" />
          <Text style={styles.loadingText}>Loading registered users...</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="people-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyTitle}>No Registrations Yet</Text>
          <Text style={styles.emptyText}>When users register for this event, they'll appear here</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Summary Cards */}
          <View style={styles.summaryContainer}>
            <View style={styles.summaryCard}>
              <MaterialIcons name="people" size={24} color="#fb7185" />
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>{users.length}</Text>
              </View>
            </View>
            <View style={styles.summaryCard}>
              <MaterialIcons name="school" size={24} color="#3b82f6" />
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Students</Text>
                <Text style={styles.summaryValue}>{studentCount}</Text>
              </View>
            </View>
            <View style={styles.summaryCard}>
              <MaterialIcons name="person" size={24} color="#8b5cf6" />
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Faculty</Text>
                <Text style={styles.summaryValue}>{facultyCount}</Text>
              </View>
            </View>
          </View>

          {/* User List */}
          <View style={styles.userList}>
            {users.map((registration, index) => (
              <TouchableOpacity
                key={registration.id}
                style={styles.userCard}
                onPress={() => {
                  navigation.navigate('PublicProfile', { userId: registration.user_id });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.userCardLeft}>
                  <Text style={styles.userIndex}>{index + 1}</Text>
                  <UserAvatar
                    uri={registration.user.avatar_url}
                    name={registration.user.full_name || registration.user.email}
                    size={48}
                    role={registration.user.role}
                  />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {registration.user.full_name || 'Anonymous'}
                    </Text>
                    <Text style={styles.userEmail}>{registration.user.email}</Text>
                    <View style={styles.userMeta}>
                      {registration.user.role && (
                        <View style={styles.metaChip}>
                          <MaterialIcons name="badge" size={12} color={Colors.textSecondary} />
                          <Text style={styles.metaText}>{registration.user.role}</Text>
                        </View>
                      )}
                      {registration.user.department && (
                        <View style={styles.metaChip}>
                          <MaterialIcons name="apartment" size={12} color={Colors.textSecondary} />
                          <Text style={styles.metaText}>{registration.user.department}</Text>
                        </View>
                      )}
                      {registration.user.year && (
                        <View style={styles.metaChip}>
                          <MaterialIcons name="calendar-today" size={12} color={Colors.textSecondary} />
                          <Text style={styles.metaText}>Year {registration.user.year}</Text>
                        </View>
                      )}
                      {registration.user.enrollment_number && (
                        <View style={styles.metaChip}>
                          <MaterialIcons name="numbers" size={12} color={Colors.textSecondary} />
                          <Text style={styles.metaText}>{registration.user.enrollment_number}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={Colors.border} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) =>
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
      backgroundColor: Colors.card,
    },
    backButton: {
      padding: Spacing.xs,
    },
    headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    headerSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Spacing.md,
    },
    loadingText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
    },
    emptyTitle: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      marginTop: Spacing.lg,
      marginBottom: Spacing.xs,
    },
    emptyText: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    content: {
      flex: 1,
    },
    summaryContainer: {
      flexDirection: 'row',
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    summaryCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      ...Shadows.sm,
    },
    summaryContent: {
      flex: 1,
    },
    summaryLabel: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: 2,
    },
    summaryValue: {
      fontSize: FontSizes.xl,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    userList: {
      paddingHorizontal: Spacing.md,
      gap: Spacing.sm,
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.sm,
      ...Shadows.sm,
    },
    userCardLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    userIndex: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.textSecondary,
      width: 24,
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: 2,
    },
    userEmail: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginBottom: 6,
    },
    userMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.border,
    },
    metaText: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
    },
  });
