import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { DEPARTMENT_OPTIONS } from '../../constants/academic';
import { supabase } from '../../api/supabase';
import { UserAvatar } from '../../components/UserAvatar';
import DropdownSheet from '../../components/DropdownSheet';
import { isAdminRole } from '../../utils/roles';

type EventRegisteredUsersScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'EventRegisteredUsers'
>;
type EventRegisteredUsersScreenRouteProp = RouteProp<RootStackParamList, 'EventRegisteredUsers'>;

const STANDARD_SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const STANDARD_YEARS = ['1', '2', '3', '4', '5'];
const EXPORT_HEADERS = [
  'S.No',
  'Full Name',
  'Email',
  'Register Number',
  'Department',
  'Year',
  'Semester',
  'Role',
  'Registered At',
] as const;

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
    roll_number?: string;
  };
}

type SpreadsheetRow = Record<(typeof EXPORT_HEADERS)[number], string | number>;

export default function EventRegisteredUsersScreen() {
  const navigation = useNavigation<EventRegisteredUsersScreenNavigationProp>();
  const route = useRoute<EventRegisteredUsersScreenRouteProp>();
  const { user, profile } = useAuth();
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [hasDownloadAccess, setHasDownloadAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null);

  useEffect(() => {
    checkAccessAndLoadRegisteredUsers();
  }, [eventId, user?.id, profile?.role]);

  const checkAccessAndLoadRegisteredUsers = async () => {
    try {
      setIsCheckingAccess(true);

      if (!user?.id) {
        setHasDownloadAccess(false);
        setUsers([]);
        return;
      }

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('created_by, organizers, max_participants')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;

      const organizerIds = Array.isArray((eventData as any)?.organizers)
        ? ((eventData as any).organizers as string[])
        : [];

      const canDownload =
        isAdminRole(profile?.role) ||
        (eventData as any)?.created_by === user.id ||
        organizerIds.includes(user.id);

      setMaxParticipants((eventData as any)?.max_participants ?? null);
      setHasDownloadAccess(canDownload);

      if (!canDownload) {
        setUsers([]);
        return;
      }

      await loadRegisteredUsers();
    } catch (err) {
      console.error('Failed to verify access for registered users', err);
      Toast.show({
        type: 'error',
        text1: 'Access Check Failed',
        text2: 'Unable to verify access for this event',
      });
      setHasDownloadAccess(false);
      setUsers([]);
    } finally {
      setIsCheckingAccess(false);
    }
  };

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
            enrollment_number,
            roll_number
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

    const merged = Array.from(new Set([...DEPARTMENT_OPTIONS, ...fromData])).sort((a, b) => a.localeCompare(b));
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

    const merged = Array.from(new Set([...STANDARD_SEMESTERS, ...fromData.map((value) => String(value))])).sort(
      (a, b) => Number(a) - Number(b)
    );
    return ['All', ...merged];
  }, [users]);

  const yearOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(users.map((registration) => registration.user.year).filter((year): year is number => Number.isFinite(year)))
    ).sort((a, b) => a - b);

    const merged = Array.from(new Set([...STANDARD_YEARS, ...fromData.map((value) => String(value))])).sort(
      (a, b) => Number(a) - Number(b)
    );
    return ['All', ...merged];
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((registration) => {
      const matchesDepartment =
        selectedDepartment === 'All' || (registration.user.department || '').trim() === selectedDepartment;
      const matchesSemester = selectedSemester === 'All' || String(registration.user.semester ?? '') === selectedSemester;
      const matchesYear = selectedYear === 'All' || String(registration.user.year ?? '') === selectedYear;
      return matchesDepartment && matchesSemester && matchesYear;
    });
  }, [users, selectedDepartment, selectedSemester, selectedYear]);

  const getEnrollmentValue = (registration: RegisteredUser) => {
    return registration.user.enrollment_number || registration.user.roll_number || '';
  };

  const registrationInsights = useMemo(() => {
    const now = Date.now();
    const recentRegistrations = users.filter((registration) => {
      const registeredAt = new Date(registration.registered_at).getTime();
      return Number.isFinite(registeredAt) && now - registeredAt <= 7 * 24 * 60 * 60 * 1000;
    }).length;

    const representedDepartments = new Set(
      users.map((registration) => registration.user.department?.trim()).filter((department): department is string => !!department)
    );

    const departmentCounts = users.reduce<Record<string, number>>((accumulator, registration) => {
      const department = registration.user.department?.trim();
      if (!department) return accumulator;
      accumulator[department] = (accumulator[department] || 0) + 1;
      return accumulator;
    }, {});

    const topDepartment = Object.entries(departmentCounts).sort((a, b) => b[1] - a[1])[0] ?? null;
    const latestRegistration = users[0]?.registered_at || null;
    const filledSlotsLabel = maxParticipants ? `${users.length}/${maxParticipants}` : `${users.length}/No limit`;
    const remainingSeats = maxParticipants ? Math.max(maxParticipants - users.length, 0) : null;
    const fillRate = maxParticipants ? Math.min(Math.round((users.length / maxParticipants) * 100), 100) : null;
    const filterMatchRate = users.length ? Math.round((filteredUsers.length / users.length) * 100) : 0;
    const registrationStatus = !maxParticipants
      ? 'Unlimited'
      : users.length >= maxParticipants
        ? 'Full'
        : remainingSeats === 1
          ? '1 seat left'
          : `${remainingSeats} seats left`;

    return {
      recentRegistrations,
      representedDepartments: representedDepartments.size,
      topDepartment,
      latestRegistration,
      filledSlotsLabel,
      remainingSeats,
      fillRate,
      filterMatchRate,
      registrationStatus,
    };
  }, [users, filteredUsers.length, maxParticipants]);

  const activeFilterSummary = useMemo(() => {
    const parts = [];
    if (selectedDepartment !== 'All') parts.push(selectedDepartment);
    if (selectedYear !== 'All') parts.push(`Year ${selectedYear}`);
    if (selectedSemester !== 'All') parts.push(`Sem ${selectedSemester}`);
    return parts.length ? parts.join(' · ') : 'All registrations in view';
  }, [selectedDepartment, selectedSemester, selectedYear]);

  const resetFilters = () => {
    setSelectedDepartment('All');
    setSelectedSemester('All');
    setSelectedYear('All');
  };

  const escapeCsvValue = (value: unknown): string => {
    const normalized = String(value ?? '').replace(/\r?\n|\r/g, ' ').trim();
    if (/[,"\n]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  };

  const buildSpreadsheetRows = (): SpreadsheetRow[] => {
    return filteredUsers.map((registration, index) => ({
      'S.No': index + 1,
      'Full Name': registration.user.full_name || '',
      Email: registration.user.email || '',
      'Register Number': getEnrollmentValue(registration),
      Department: registration.user.department || '',
      Year: registration.user.year || '',
      Semester: registration.user.semester || '',
      Role: registration.user.role || '',
      'Registered At': new Date(registration.registered_at).toLocaleString(),
    }));
  };

  const buildCsv = () => {
    const rows = buildSpreadsheetRows();
    return [EXPORT_HEADERS, ...rows.map((row) => EXPORT_HEADERS.map((header) => row[header]))]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n');
  };

  const exportRegistrations = async (format: 'csv' | 'excel') => {
    if (!hasDownloadAccess) {
      Toast.show({
        type: 'error',
        text1: 'Access Denied',
        text2: 'Only admin, event creator, or event lead can download this list',
      });
      return;
    }

    if (filteredUsers.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'No Data',
        text2: 'No registered users available for export',
      });
      return;
    }

    try {
      setIsExporting(true);
      setShowExportModal(false);

      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error('Document directory is not available on this device.');

      const safeTitle = eventTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_') || 'event';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const extension = format === 'excel' ? 'xlsx' : 'csv';
      const fileName = `${safeTitle}_registrations_${timestamp}.${extension}`;
      const fileUri = `${directory}${fileName}`;

      if (format === 'excel') {
        const worksheet = XLSX.utils.json_to_sheet(buildSpreadsheetRows());
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
        const workbookBase64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        await FileSystem.writeAsStringAsync(fileUri, workbookBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        await FileSystem.writeAsStringAsync(fileUri, buildCsv(), {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Toast.show({
          type: 'success',
          text1: 'Export Ready',
          text2: `Saved as ${fileName}`,
        });
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType:
          format === 'excel'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv',
        UTI:
          format === 'excel'
            ? 'org.openxmlformats.spreadsheetml.sheet'
            : 'public.comma-separated-values-text',
      });
    } catch (err) {
      console.error('Failed to export registered users', err);
      Toast.show({
        type: 'error',
        text1: 'Export Failed',
        text2: 'Unable to export registrations',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const onPressDownload = () => {
    setShowExportModal(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Registered Users</Text>
          <Text style={styles.headerSubtitle}>{filteredUsers.length} of {users.length} participants</Text>
        </View>
        {hasDownloadAccess ? (
          <TouchableOpacity
            style={[styles.downloadButton, isExporting && styles.downloadButtonDisabled]}
            onPress={onPressDownload}
            disabled={isExporting}
            activeOpacity={0.85}
          >
            <MaterialIcons name={isExporting ? 'hourglass-top' : 'download'} size={18} color="#ffffff" />
            <Text style={styles.downloadButtonText}>{isExporting ? 'Exporting' : 'Export'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {isCheckingAccess || isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fb7185" />
          <Text style={styles.loadingText}>Loading registrations...</Text>
        </View>
      ) : !hasDownloadAccess ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="lock-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyTitle}>Access Restricted</Text>
          <Text style={styles.emptyText}>Only admin, event creator, or event lead can view and download this list.</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="people-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyTitle}>No Registrations Yet</Text>
          <Text style={styles.emptyText}>When users register for this event, they&apos;ll appear here.</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroGlow} />
            <View style={styles.topCard}>
              <View style={styles.topCardLeft}>
                <View style={styles.heroIconWrap}>
                  <MaterialIcons name="groups" size={22} color="#ffffff" />
                </View>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.topCardTitle}>Event Registrations</Text>
                  <Text style={styles.topCardSub}>{eventTitle}</Text>
                  <View style={styles.heroBadgeRow}>
                    <View style={styles.heroBadge}>
                      <MaterialIcons name="verified" size={12} color="#f8fafc" />
                      <Text style={styles.heroBadgeText}>{registrationInsights.registrationStatus}</Text>
                    </View>
                    <View style={styles.heroBadgeMuted}>
                      <Text style={styles.heroBadgeMutedText}>
                        {maxParticipants ? `${registrationInsights.fillRate}% filled` : 'Open capacity'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <Text style={styles.topCardCount}>{users.length}</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Filtered Results</Text>
                <Text style={styles.statValue}>{filteredUsers.length} / {users.length}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Fill Rate</Text>
                <Text style={styles.statValue}>{maxParticipants ? `${registrationInsights.fillRate}%` : 'Unlimited'}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Remaining Seats</Text>
                <Text style={styles.statValue}>
                  {maxParticipants ? registrationInsights.remainingSeats : 'No limit'}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Filled Slots</Text>
                <Text style={styles.statValue}>{registrationInsights.filledSlotsLabel}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Filter Match</Text>
                <Text style={styles.statValue}>{registrationInsights.filterMatchRate}%</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>New This Week</Text>
                <Text style={styles.statValue}>{registrationInsights.recentRegistrations}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statLabel}>Departments Covered</Text>
                <Text style={styles.statValue}>{registrationInsights.representedDepartments}</Text>
              </View>
              <View style={styles.statChipWide}>
                <Text style={styles.statLabel}>Top Department</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {registrationInsights.topDepartment
                    ? `${registrationInsights.topDepartment[0]} (${registrationInsights.topDepartment[1]})`
                    : 'Not available'}
                </Text>
              </View>
            </View>

            <View style={styles.insightBar}>
              <View style={styles.insightItem}>
                <MaterialIcons name="tune" size={14} color="rgba(255,255,255,0.78)" />
                <Text style={styles.insightText}>{activeFilterSummary}</Text>
              </View>
              <View style={styles.insightItem}>
                <MaterialIcons name="schedule" size={14} color="rgba(255,255,255,0.78)" />
                <Text style={styles.insightText} numberOfLines={1}>
                  {registrationInsights.latestRegistration
                    ? `Latest: ${new Date(registrationInsights.latestRegistration).toLocaleDateString()}`
                    : 'No recent timestamp'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.filtersContainer}>
            <View style={styles.filtersHeaderRow}>
              <View>
                <Text style={styles.filtersTitle}>Filters</Text>
                <Text style={styles.filtersSubTitle}>Refine the list before export</Text>
              </View>
              <TouchableOpacity style={styles.resetButton} onPress={resetFilters} activeOpacity={0.85}>
                <MaterialIcons name="restart-alt" size={16} color={Colors.primary} />
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>
            </View>

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

          <View style={styles.resultsBar}>
            <Text style={styles.filteredCountText}>Showing {filteredUsers.length} users</Text>
            <TouchableOpacity style={styles.inlineExportButton} onPress={onPressDownload} activeOpacity={0.85}>
              <MaterialIcons name="file-download" size={16} color={Colors.primary} />
              <Text style={styles.inlineExportButtonText}>Download</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.userList}>
            {filteredUsers.map((registration, index) => (
              <TouchableOpacity
                key={registration.id}
                style={styles.userCard}
                onPress={() => navigation.navigate('PublicProfile', { userId: registration.user_id })}
                activeOpacity={0.75}
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
                    <Text style={styles.userName}>{registration.user.full_name || 'Anonymous'}</Text>
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
                      {!!getEnrollmentValue(registration) && (
                        <View style={styles.metaChip}>
                          <MaterialIcons name="numbers" size={12} color={Colors.textSecondary} />
                          <Text style={styles.metaText}>{getEnrollmentValue(registration)}</Text>
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
              <Text style={styles.noFilterResultText}>No users match the selected filters.</Text>
            </View>
          )}

          <View style={styles.bottomSpacer} />
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
          setSelectedSemester(value === 'All Semesters' ? 'All' : value.replace('Semester ', ''));
          setShowSemesterSheet(false);
        }}
        onClose={() => setShowSemesterSheet(false)}
      />

      <DropdownSheet
        visible={showYearSheet}
        title="Select Year"
        options={yearOptions.map((option) => (option === 'All' ? 'All Years' : `Year ${option}`))}
        onSelect={(value) => {
          setSelectedYear(value === 'All Years' ? 'All' : value.replace('Year ', ''));
          setShowYearSheet(false);
        }}
        onClose={() => setShowYearSheet(false)}
      />

      <Modal transparent visible={showExportModal} animationType="fade" onRequestClose={() => setShowExportModal(false)}>
        <Pressable style={styles.exportOverlay} onPress={() => setShowExportModal(false)}>
          <Pressable style={styles.exportCard} onPress={() => {}}>
            <View style={styles.exportHeader}>
              <Text style={styles.exportTitle}>Download Registrations</Text>
              <Text style={styles.exportSubtitle}>Choose CSV, Excel, or cancel.</Text>
            </View>

            <TouchableOpacity style={styles.exportOption} onPress={() => exportRegistrations('csv')} activeOpacity={0.85}>
              <View style={[styles.exportIconWrap, styles.csvIconWrap]}>
                <MaterialIcons name="description" size={20} color="#0284c7" />
              </View>
              <View style={styles.exportOptionTextWrap}>
                <Text style={styles.exportOptionTitle}>CSV</Text>
                <Text style={styles.exportOptionSub}>Lightweight export for Excel, Sheets, and spreadsheet apps</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportOption} onPress={() => exportRegistrations('excel')} activeOpacity={0.85}>
              <View style={[styles.exportIconWrap, styles.excelIconWrap]}>
                <MaterialIcons name="grid-on" size={20} color="#16a34a" />
              </View>
              <View style={styles.exportOptionTextWrap}>
                <Text style={styles.exportOptionTitle}>Excel (.xlsx)</Text>
                <Text style={styles.exportOptionSub}>Real spreadsheet file for Excel and Google Sheets</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelExportButton} onPress={() => setShowExportModal(false)} activeOpacity={0.85}>
              <Text style={styles.cancelExportText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
      paddingHorizontal: Spacing.sm,
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
    headerSpacer: {
      width: 22,
    },
    downloadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      ...Shadows.sm,
    },
    downloadButtonDisabled: {
      opacity: 0.75,
    },
    downloadButtonText: {
      color: '#ffffff',
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
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
    heroCard: {
      marginHorizontal: Spacing.md,
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: '#0f172a',
      overflow: 'hidden',
      ...Shadows.sm,
    },
    heroGlow: {
      position: 'absolute',
      top: -28,
      right: -24,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(59,130,246,0.22)',
    },
    topCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    topCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flex: 1,
    },
    heroIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    heroTextWrap: {
      flex: 1,
    },
    heroBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: 'rgba(16,185,129,0.22)',
    },
    heroBadgeText: {
      fontSize: FontSizes.xs,
      color: '#f8fafc',
      fontWeight: FontWeights.semibold,
    },
    heroBadgeMuted: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    heroBadgeMutedText: {
      fontSize: FontSizes.xs,
      color: 'rgba(255,255,255,0.86)',
      fontWeight: FontWeights.medium,
    },
    topCardTitle: {
      fontSize: FontSizes.sm,
      color: 'rgba(255,255,255,0.72)',
    },
    topCardSub: {
      fontSize: FontSizes.md,
      color: '#ffffff',
      marginTop: 4,
      fontWeight: FontWeights.semibold,
    },
    topCardCount: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.bold,
      color: '#ffffff',
    },
    statsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    statChip: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    statChipWide: {
      flex: 1.35,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    statLabel: {
      fontSize: FontSizes.xs,
      color: 'rgba(255,255,255,0.7)',
    },
    statValue: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: '#ffffff',
      marginTop: 4,
    },
    insightBar: {
      marginTop: Spacing.md,
      padding: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
      gap: 8,
    },
    insightItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    insightText: {
      flex: 1,
      fontSize: FontSizes.xs,
      color: 'rgba(255,255,255,0.82)',
      fontWeight: FontWeights.medium,
    },
    filtersContainer: {
      marginTop: Spacing.sm,
      marginHorizontal: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.card,
      ...Shadows.sm,
    },
    filtersHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    filtersTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    filtersSubTitle: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.background,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    resetButtonText: {
      fontSize: FontSizes.sm,
      color: Colors.primary,
      fontWeight: FontWeights.medium,
    },
    filterLabel: {
      fontSize: FontSizes.xs,
      fontWeight: FontWeights.medium,
      color: Colors.text,
      marginBottom: 4,
      marginTop: Spacing.xs,
    },
    dropdownField: {
      minHeight: 42,
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
    resultsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.sm,
      marginHorizontal: Spacing.md,
      gap: Spacing.sm,
    },
    filteredCountText: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      flex: 1,
    },
    inlineExportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    inlineExportButtonText: {
      fontSize: FontSizes.sm,
      color: Colors.primary,
      fontWeight: FontWeights.semibold,
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
    bottomSpacer: {
      height: 40,
    },
    exportOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    exportCard: {
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.card,
      padding: Spacing.md,
      ...Shadows.sm,
    },
    exportHeader: {
      marginBottom: Spacing.md,
    },
    exportTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
    },
    exportSubtitle: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      marginTop: 4,
    },
    exportOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.background,
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    exportIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    csvIconWrap: {
      backgroundColor: '#e0f2fe',
    },
    excelIconWrap: {
      backgroundColor: '#dcfce7',
    },
    exportOptionTextWrap: {
      flex: 1,
    },
    exportOptionTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
    exportOptionSub: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    cancelExportButton: {
      marginTop: Spacing.xs,
      paddingVertical: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.border,
      alignItems: 'center',
    },
    cancelExportText: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
    },
  });
