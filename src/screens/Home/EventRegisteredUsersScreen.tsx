import React, { useEffect, useMemo, useState } from 'react';
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
import { DEPARTMENT_OPTIONS } from '../../constants/academic';
import { supabase } from '../../api/supabase';
import { UserAvatar } from '../../components/UserAvatar';
import DropdownSheet from '../../components/DropdownSheet';
import Toast from 'react-native-toast-message';

type EventRegisteredUsersScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'EventRegisteredUsers'
>;
type EventRegisteredUsersScreenRouteProp = RouteProp<RootStackParamList, 'EventRegisteredUsers'>;

const STANDARD_SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const STANDARD_YEARS = ['1', '2', '3', '4'];

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
    semester?: number;
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
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedSemester, setSelectedSemester] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [showDepartmentSheet, setShowDepartmentSheet] = useState(false);
  const [showSemesterSheet, setShowSemesterSheet] = useState(false);
  const [showYearSheet, setShowYearSheet] = useState(false);

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
            semester,
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

  const departmentOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(
        users
          .map((registration) => registration.user.department?.trim())
          .filter((department): department is string => !!department)
      )
    ).sort((a, b) => a.localeCompare(b));

    const merged = Array.from(new Set([...DEPARTMENT_OPTIONS, ...fromData]))
      .sort((a, b) => a.localeCompare(b));

    return ['All', ...merged];
  }, [users]);

  const semesterOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(
        users
          .map((registration) => registration.user.semester)
          .filter((semester): semester is number => Number.isFinite(semester))
      )
    ).sort((a, b) => a - b);

    const merged = Array.from(new Set([...STANDARD_SEMESTERS, ...fromData.map((value) => String(value))]))
      .sort((a, b) => Number(a) - Number(b));

    return ['All', ...merged];
  }, [users]);

  const yearOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(
        users
          .map((registration) => registration.user.year)
          .filter((year): year is number => Number.isFinite(year))
      )
    ).sort((a, b) => a - b);

    const merged = Array.from(new Set([...STANDARD_YEARS, ...fromData.map((value) => String(value))]))
      .sort((a, b) => Number(a) - Number(b));

    return ['All', ...merged];
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((registration) => {
      const matchesDepartment =
        selectedDepartment === 'All' ||
        (registration.user.department || '').trim() === selectedDepartment;

      const matchesSemester =
        selectedSemester === 'All' ||
        String(registration.user.semester ?? '') === selectedSemester;

      const matchesYear =
        selectedYear === 'All' ||
        String(registration.user.year ?? '') === selectedYear;

      return matchesDepartment && matchesSemester && matchesYear;
    });
  }, [users, selectedDepartment, selectedSemester, selectedYear]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Registered Users</Text>
          <Text style={styles.headerSubtitle}>{filteredUsers.length} of {users.length} participants</Text>
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
          <View style={styles.topCard}>
            <View style={styles.topCardLeft}>
              <MaterialIcons name="groups" size={22} color={Colors.primary} />
              <View>
                <Text style={styles.topCardTitle}>Total Registered</Text>
                <Text style={styles.topCardSub}>{eventTitle}</Text>
              </View>
            </View>
            <Text style={styles.topCardCount}>{users.length}</Text>
          </View>

          <View style={styles.filtersContainer}>
            <Text style={styles.filterLabel}>Department</Text>
            <TouchableOpacity style={styles.dropdownField} onPress={() => setShowDepartmentSheet(true)}>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {selectedDepartment === 'All' ? 'All Departments' : selectedDepartment}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <Text style={styles.filterLabel}>Semester</Text>
            <TouchableOpacity style={styles.dropdownField} onPress={() => setShowSemesterSheet(true)}>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {selectedSemester === 'All' ? 'All Semesters' : `Semester ${selectedSemester}`}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <Text style={styles.filterLabel}>Year</Text>
            <TouchableOpacity style={styles.dropdownField} onPress={() => setShowYearSheet(true)}>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {selectedYear === 'All' ? 'All Years' : `Year ${selectedYear}`}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.filteredCountText}>Showing {filteredUsers.length} users</Text>

          {/* User List */}
          <View style={styles.userList}>
            {filteredUsers.map((registration, index) => (
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
                      {registration.user.semester && (
                        <View style={styles.metaChip}>
                          <MaterialIcons name="event-note" size={12} color={Colors.textSecondary} />
                          <Text style={styles.metaText}>Sem {registration.user.semester}</Text>
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

            {filteredUsers.length === 0 && (
              <View style={styles.noFilterResult}>
                <MaterialIcons name="filter-alt-off" size={24} color={Colors.textSecondary} />
                <Text style={styles.noFilterResultText}>No users match selected filters</Text>
              </View>
            )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <DropdownSheet
        visible={showDepartmentSheet}
        title="Select Department"
        options={departmentOptions}
        onSelect={(value) => {
          setSelectedDepartment(value);
          setShowDepartmentSheet(false);
        }}
        onClose={() => setShowDepartmentSheet(false)}
      />

      <DropdownSheet
        visible={showSemesterSheet}
        title="Select Semester"
        options={semesterOptions.map((option) => (option === 'All' ? 'All Semesters' : `Semester ${option}`))}
        onSelect={(value) => {
          if (value === 'All Semesters') {
            setSelectedSemester('All');
          } else {
            setSelectedSemester(value.replace('Semester ', ''));
          }
          setShowSemesterSheet(false);
        }}
        onClose={() => setShowSemesterSheet(false)}
      />

      <DropdownSheet
        visible={showYearSheet}
        title="Select Year"
        options={yearOptions.map((option) => (option === 'All' ? 'All Years' : `Year ${option}`))}
        onSelect={(value) => {
          if (value === 'All Years') {
            setSelectedYear('All');
          } else {
            setSelectedYear(value.replace('Year ', ''));
          }
          setShowYearSheet(false);
        }}
        onClose={() => setShowYearSheet(false)}
      />
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
    topCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      marginHorizontal: Spacing.md,
      marginTop: Spacing.md,
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.lg,
      ...Shadows.sm,
    },
    topCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    topCardTitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
    topCardSub: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    topCardCount: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: Colors.primary,
    },
    filtersContainer: {
      marginTop: Spacing.sm,
      marginHorizontal: Spacing.md,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      ...Shadows.sm,
    },
    filterLabel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
      color: Colors.text,
      marginBottom: 4,
      marginTop: Spacing.xs,
    },
    dropdownField: {
      minHeight: 38,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.background,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dropdownValue: {
      fontSize: FontSizes.sm,
      color: Colors.text,
      fontWeight: FontWeights.medium,
      flex: 1,
      marginRight: Spacing.sm,
    },
    filteredCountText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: Spacing.sm,
      marginHorizontal: Spacing.md,
    },
    userList: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
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
    noFilterResult: {
      marginTop: Spacing.lg,
      padding: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
    },
    noFilterResultText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
    },
  });
