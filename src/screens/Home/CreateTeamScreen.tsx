// @ts-nocheck
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Switch,
    SafeAreaView,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { getColors, Spacing, BorderRadius, FontSizes } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

type CreateTeamNavigationProp = StackNavigationProp<RootStackParamList, 'CreateTeam'>;
type CreateTeamRouteProp = RouteProp<RootStackParamList, 'CreateTeam'>;

const COMMON_ROLES = [
    'Frontend Developer',
    'Backend Developer',
    'UI/UX Designer',
    'Data Scientist',
    'ML Engineer',
    'Mobile Developer',
    'Project Manager',
    'DevOps Engineer',
    'QA Engineer',
    'Full Stack Developer',
];

export default function CreateTeamScreen() {
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const navigation = useNavigation<CreateTeamNavigationProp>();
    const route = useRoute<CreateTeamRouteProp>();
    const { user } = useAuth();
    const { eventId, maxTeamSize } = route.params;

    const [teamName, setTeamName] = useState('');
    const [description, setDescription] = useState('');
    const [isRecruiting, setIsRecruiting] = useState(true);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    const toggleRole = (role: string) => {
        setSelectedRoles((prev) =>
            prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
        );
    };

    const handleCreateTeam = async () => {
        if (!user?.id) return;
        if (!teamName.trim()) {
            Toast.show({ type: 'error', text1: 'Team name is required' });
            return;
        }

        try {
            setIsCreating(true);

            // Get fresh auth user
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
                Toast.show({ type: 'error', text1: 'Please sign in again' });
                return;
            }

            // === PRE-CHECK 1: Registration row must exist with status='registered' ===
            const { data: regRow, error: regError } = await supabase
                .from('event_registrations')
                .select('id, team_id')
                .eq('event_id', eventId)
                .eq('user_id', authUser.id)
                .eq('status', 'registered')
                .maybeSingle();

            if (regError) throw regError;

            if (!regRow) {
                Toast.show({
                    type: 'error',
                    text1: 'Registration required',
                    text2: 'You must register for this event before creating a team.',
                });
                return;
            }

            // === PRE-CHECK 2: Must not already be in a team ===
            if (regRow.team_id) {
                Toast.show({
                    type: 'error',
                    text1: 'Already in a team',
                    text2: 'Leave your current team before creating a new one.',
                });
                return;
            }

            // === PRE-CHECK 3: Event must be a team event ===
            const { data: eventData, error: eventError } = await supabase
                .from('events')
                .select('participation_type, registration_deadline, max_team_size')
                .eq('id', eventId)
                .single();

            if (eventError) throw eventError;

            if ((eventData as any).participation_type !== 'team') {
                Toast.show({
                    type: 'error',
                    text1: 'This event does not support teams',
                });
                return;
            }

            // === PRE-CHECK 4: Registration deadline must not have passed ===
            if (new Date((eventData as any).registration_deadline) <= new Date()) {
                Toast.show({
                    type: 'error',
                    text1: 'Registration deadline has passed',
                    text2: 'Team creation is no longer available',
                });
                return;
            }

            const effectiveMaxSize = (eventData as any).max_team_size || maxTeamSize || 5;

            // === ACTION 1: Generate unique team code ===
            const teamCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            // === ACTION 2: Insert into event_teams ===
            const { data: newTeam, error: teamError } = await supabase
                .from('event_teams')
                .insert({
                    event_id: eventId,
                    name: teamName.trim(),
                    description: description.trim() || null,
                    leader_id: authUser.id,
                    created_by: authUser.id,
                    max_members: effectiveMaxSize,
                    required_roles: selectedRoles,
                    is_recruiting: isRecruiting,
                    team_code: teamCode,
                } as any)
                .select('id')
                .single();

            if (teamError) throw teamError;
            if (!newTeam) throw new Error('Failed to create team');

            const newTeamId = newTeam.id;

            // === ACTION 3: Insert leader into event_team_members ===
            const { error: memberError } = await supabase
                .from('event_team_members')
                .insert({
                    team_id: newTeamId,
                    user_id: authUser.id,
                    role: 'leader',
                    status: 'active',
                } as any);

            if (memberError) throw memberError;

            // === ACTION 4: Update event_registrations.team_id ===
            const { error: regUpdateError } = await supabase
                .from('event_registrations')
                .update({ team_id: newTeamId, looking_for_team: false })
                .eq('event_id', eventId)
                .eq('user_id', authUser.id);

            if (regUpdateError) throw regUpdateError;

            Toast.show({
                type: 'success',
                text1: '🎉 Team created!',
                text2: `Team code: ${teamCode}`,
            });

            // Navigate to the new team's details page
            navigation.replace('TeamDetails', { teamId: newTeamId, eventId });
        } catch (err: any) {
            console.error('Create team error:', err);
            Toast.show({
                type: 'error',
                text1: 'Failed to create team',
                text2: err.message || 'Please try again',
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backButton}
                    >
                        <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                    </TouchableOpacity>
                    <View style={styles.headerContent}>
                        <Text style={[styles.headerTitle, { color: Colors.text }]}>Create a Team</Text>
                        <Text style={[styles.headerSubtitle, { color: Colors.textSecondary }]}>
                            Up to {maxTeamSize} members
                        </Text>
                    </View>
                </View>

                {/* Team Name */}
                <View style={styles.section}>
                    <Text style={[styles.label, { color: Colors.text }]}>Team Name *</Text>
                    <TextInput
                        style={[styles.input, { color: Colors.text, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                        placeholder="Enter your team name"
                        placeholderTextColor={Colors.textSecondary}
                        value={teamName}
                        onChangeText={setTeamName}
                        maxLength={50}
                    />
                </View>

                {/* Description */}
                <View style={styles.section}>
                    <Text style={[styles.label, { color: Colors.text }]}>Description</Text>
                    <TextInput
                        style={[styles.textArea, { color: Colors.text, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                        placeholder="Briefly describe your team's focus or goals"
                        placeholderTextColor={Colors.textSecondary}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={3}
                        maxLength={200}
                    />
                </View>

                {/* Recruiting Toggle */}
                <View style={[styles.toggleRow, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { color: Colors.text, marginBottom: 2 }]}>Open to Recruitment</Text>
                        <Text style={[styles.sublabel, { color: Colors.textSecondary }]}>
                            Let others request to join your team
                        </Text>
                    </View>
                    <Switch
                        value={isRecruiting}
                        onValueChange={setIsRecruiting}
                        trackColor={{ true: '#6366f1', false: '#d1d5db' }}
                        thumbColor="#fff"
                    />
                </View>

                {/* Required Roles */}
                <View style={styles.section}>
                    <Text style={[styles.label, { color: Colors.text }]}>Required Roles</Text>
                    <Text style={[styles.sublabel, { color: Colors.textSecondary, marginBottom: 12 }]}>
                        Select roles you're looking for (optional)
                    </Text>
                    <View style={styles.rolesGrid}>
                        {COMMON_ROLES.map((role) => {
                            const selected = selectedRoles.includes(role);
                            return (
                                <TouchableOpacity
                                    key={role}
                                    onPress={() => toggleRole(role)}
                                    style={[
                                        styles.roleChip,
                                        {
                                            backgroundColor: selected ? '#6366f1' : Colors.surface,
                                            borderColor: selected ? '#4f46e5' : Colors.border,
                                        },
                                    ]}
                                >
                                    {selected && <MaterialIcons name="check" size={12} color="#fff" />}
                                    <Text style={[styles.roleChipText, { color: selected ? '#fff' : Colors.text }]}>
                                        {role}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Create Button */}
                <TouchableOpacity
                    style={[styles.createButton, isCreating && styles.createButtonDisabled]}
                    onPress={handleCreateTeam}
                    disabled={isCreating}
                >
                    {isCreating ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <MaterialIcons name="group-add" size={20} color="#fff" />
                            <Text style={styles.createButtonText}>Create Team</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.lg,
        gap: Spacing.md,
    },
    backButton: {
        padding: Spacing.sm,
        borderRadius: BorderRadius.full,
    },
    headerContent: {
        flex: 1,
    },
    headerTitle: {
        fontSize: FontSizes.xl,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: FontSizes.sm,
        marginTop: 2,
    },
    section: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    label: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
        marginBottom: 8,
    },
    sublabel: {
        fontSize: FontSizes.xs,
    },
    input: {
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: 12,
        fontSize: FontSizes.md,
    },
    textArea: {
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: 12,
        fontSize: FontSizes.md,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
    },
    rolesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    roleChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    roleChipText: {
        fontSize: FontSizes.xs,
        fontWeight: '500',
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.lg,
        backgroundColor: '#6366f1',
        paddingVertical: 16,
        borderRadius: BorderRadius.lg,
    },
    createButtonDisabled: {
        opacity: 0.6,
    },
    createButtonText: {
        fontSize: FontSizes.md,
        fontWeight: '700',
        color: '#fff',
    },
});
