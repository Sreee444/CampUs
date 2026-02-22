import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import StatusBadge from './StatusBadge';
import { computeTeamStatus, SKILL_ROLES, TeamStatus } from '../utils/teamUtils';

export interface TeamCardData {
    id: string;
    name: string;
    team_code: string;
    required_roles?: string[];
    members_count: number;
    max_members: number;
    is_recruiting: boolean;
    registration_deadline?: string;
}

interface TeamCardProps {
    team: TeamCardData;
    onPress?: () => void;
    onCopyCode?: () => void;
    showCopyCode?: boolean;
}

export default function TeamCard({
    team,
    onPress,
    onCopyCode,
    showCopyCode = false,
}: TeamCardProps) {
    const status: TeamStatus = computeTeamStatus(
        team.members_count,
        team.max_members,
        team.registration_deadline
    );

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={onPress}
            activeOpacity={onPress ? 0.75 : 1}
        >
            {/* Header Row */}
            <View style={styles.headerRow}>
                <Text style={styles.teamName} numberOfLines={1}>
                    {team.name}
                </Text>
                <StatusBadge status={status} size="sm" />
            </View>

            {/* Team Code Row */}
            <View style={styles.codeRow}>
                <MaterialIcons name="vpn-key" size={14} color="#6b7280" />
                <Text style={styles.codeText}>{team.team_code}</Text>
                {showCopyCode && onCopyCode && (
                    <TouchableOpacity onPress={onCopyCode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="content-copy" size={14} color="#6366f1" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Members Row */}
            <View style={styles.metaRow}>
                <MaterialIcons name="people" size={14} color="#6b7280" />
                <Text style={styles.metaText}>
                    {team.members_count} / {team.max_members} members
                </Text>

                {team.is_recruiting && status !== 'locked' && (
                    <View style={styles.recruitingBadge}>
                        <Text style={styles.recruitingText}>Looking for Members</Text>
                    </View>
                )}
            </View>

            {/* Required Roles */}
            {team.required_roles && team.required_roles.length > 0 && (
                <View style={styles.rolesRow}>
                    {team.required_roles.slice(0, 4).map((roleId) => {
                        const roleInfo = SKILL_ROLES.find((r) => r.id === roleId);
                        return (
                            <View
                                key={roleId}
                                style={[styles.rolePill, { borderColor: roleInfo?.color ?? '#6b7280' }]}
                            >
                                <Text style={styles.roleIcon}>{roleInfo?.icon ?? '🔩'}</Text>
                                <Text style={[styles.roleText, { color: roleInfo?.color ?? '#6b7280' }]}>
                                    {roleInfo?.label ?? roleId}
                                </Text>
                            </View>
                        );
                    })}
                    {team.required_roles.length > 4 && (
                        <Text style={styles.moreRoles}>+{team.required_roles.length - 4}</Text>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
        gap: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    teamName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        flex: 1,
    },
    codeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    codeText: {
        fontSize: 13,
        color: '#6b7280',
        fontFamily: 'monospace',
        flex: 1,
        letterSpacing: 1,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flexWrap: 'wrap',
    },
    metaText: {
        fontSize: 13,
        color: '#6b7280',
        flex: 1,
    },
    recruitingBadge: {
        backgroundColor: '#eff6ff',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    recruitingText: {
        fontSize: 10,
        color: '#3b82f6',
        fontWeight: '600',
    },
    rolesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 2,
    },
    rolePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: '#f9fafb',
    },
    roleIcon: {
        fontSize: 10,
    },
    roleText: {
        fontSize: 11,
        fontWeight: '600',
    },
    moreRoles: {
        fontSize: 11,
        color: '#9ca3af',
        paddingVertical: 3,
    },
});
