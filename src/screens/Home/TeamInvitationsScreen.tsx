// @ts-nocheck
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    FlatList,
    ActivityIndicator,
    Platform,
    Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import { getColors, Spacing, BorderRadius, FontSizes } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { acceptInvite, rejectInvite, markNotifRead } from '../../utils/teamActions';

interface Invitation {
    id: string;          // team_requests.id
    team_id: string;
    event_id: string;
    message?: string;
    created_at: string;
    team: { name: string; max_members: number; required_roles: string[] };
    leader: { full_name: string; avatar_url?: string; department?: string };
    notification_id?: string;
}

export default function TeamInvitationsScreen() {
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const navigation = useNavigation<any>();
    const { user } = useAuth();

    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const loadInvitations = useCallback(async () => {
        if (!user?.id) return;
        try {
            setIsLoading(true);
            const { data, error } = await (supabase as any)
                .from('team_requests')
                .select(`
                    id,
                    team_id,
                    event_id,
                    message,
                    created_at,
                    team:event_teams!team_requests_team_id_fkey(name, max_members, required_roles),
                    leader:profiles!team_requests_requester_id_fkey(full_name, avatar_url, department)
                `)
                .eq('target_user_id', user.id)
                .eq('type', 'invite')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Find related notification IDs so we can mark them read on accept/reject
            const teamIds = (data as any[]).map((d: any) => d.team_id);
            let notifMap: Record<string, string> = {};
            if (teamIds.length > 0) {
                const { data: notifs } = await (supabase as any)
                    .from('notifications')
                    .select('id, metadata')
                    .eq('user_id', user.id)
                    .eq('type', 'team_invite')
                    .eq('is_read', false);

                (notifs ?? []).forEach((n: any) => {
                    if (n.metadata?.team_request_id) {
                        notifMap[n.metadata.team_request_id] = n.id;
                    }
                });
            }

            const enriched = (data as any[]).map((inv: any) => ({
                ...inv,
                notification_id: notifMap[inv.id],
            }));
            setInvitations(enriched);
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to load invitations', text2: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useFocusEffect(
        useCallback(() => {
            void loadInvitations();
        }, [loadInvitations])
    );

    const handleAccept = async (inv: Invitation) => {
        if (!user?.id) return;
        try {
            setProcessingId(inv.id);
            await acceptInvite({
                requestId: inv.id,
                teamId: inv.team_id,
                eventId: inv.event_id,
                userId: user.id,
            });
            if (inv.notification_id) await markNotifRead(inv.notification_id);
            setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
            Toast.show({ type: 'success', text1: `🎉 Joined "${inv.team.name}"!`, text2: 'You are now part of the team' });
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to accept', text2: err.message });
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (inv: Invitation) => {
        try {
            setProcessingId(inv.id);
            await rejectInvite(inv.id);
            if (inv.notification_id) await markNotifRead(inv.notification_id);
            setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
            Toast.show({ type: 'info', text1: 'Invitation declined' });
        } catch (err: any) {
            Toast.show({ type: 'error', text1: 'Failed to reject', text2: err.message });
        } finally {
            setProcessingId(null);
        }
    };

    const renderItem = ({ item: inv }: { item: Invitation }) => {
        const isProcessing = processingId === inv.id;
        const roles: string[] = Array.isArray(inv.team?.required_roles) ? inv.team.required_roles : [];

        return (
            <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                {/* Team info */}
                <View style={styles.cardHeader}>
                    <View style={styles.teamIconWrap}>
                        <MaterialIcons name="group" size={24} color="#6366f1" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.teamName, { color: Colors.text }]}>{inv.team?.name}</Text>
                        <Text style={[styles.meta, { color: Colors.textSecondary }]}>
                            Up to {inv.team?.max_members} members
                        </Text>
                    </View>
                    <View style={styles.inviteBadge}>
                        <MaterialIcons name="mail" size={12} color="#6366f1" />
                        <Text style={styles.inviteBadgeText}>Invite</Text>
                    </View>
                </View>

                {/* Leader */}
                <View style={styles.leaderRow}>
                    {inv.leader?.avatar_url ? (
                        <Image source={{ uri: inv.leader.avatar_url }} style={styles.leaderAvatar} />
                    ) : (
                        <View style={[styles.leaderAvatarFallback, { backgroundColor: Colors.border }]}>
                            <Text style={[styles.leaderInitial, { color: Colors.text }]}>
                                {(inv.leader?.full_name ?? 'L')[0].toUpperCase()}
                            </Text>
                        </View>
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.leaderName, { color: Colors.text }]}>
                            {inv.leader?.full_name ?? 'Unknown'}
                        </Text>
                        <Text style={[styles.meta, { color: Colors.textSecondary }]}>
                            {inv.leader?.department ?? 'Team Leader'}
                        </Text>
                    </View>
                    <Text style={[styles.timeAgo, { color: Colors.textSecondary }]}>
                        {new Date(inv.created_at).toLocaleDateString()}
                    </Text>
                </View>

                {/* Message */}
                {inv.message ? (
                    <View style={[styles.messageBubble, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                        <Text style={[styles.messageText, { color: Colors.textSecondary }]}>"{inv.message}"</Text>
                    </View>
                ) : null}

                {/* Roles */}
                {roles.length > 0 && (
                    <View style={styles.rolesRow}>
                        <Text style={[styles.rolesLabel, { color: Colors.textSecondary }]}>Looking for: </Text>
                        {roles.slice(0, 4).map((r) => (
                            <View key={r} style={[styles.roleChip, { backgroundColor: '#6366f115', borderColor: '#6366f130' }]}>
                                <Text style={styles.roleChipText}>{r}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.rejectBtn, { borderColor: Colors.border }]}
                        onPress={() => handleReject(inv)}
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            <ActivityIndicator size="small" color="#9ca3af" />
                        ) : (
                            <>
                                <MaterialIcons name="close" size={16} color="#ef4444" />
                                <Text style={styles.rejectBtnText}>Decline</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.acceptBtn, isProcessing && styles.btnDisabled]}
                        onPress={() => handleAccept(inv)}
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <MaterialIcons name="check" size={16} color="#fff" />
                                <Text style={styles.acceptBtnText}>Accept & Join</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: Colors.text }]}>Team Invitations</Text>
                    <Text style={[styles.headerSubtitle, { color: Colors.textSecondary }]}>
                        {invitations.length} pending
                    </Text>
                </View>
                <TouchableOpacity onPress={loadInvitations} style={styles.refreshBtn}>
                    <MaterialIcons name="refresh" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#6366f1" />
                </View>
            ) : invitations.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialIcons name="mail-outline" size={56} color={Colors.textSecondary} />
                    <Text style={[styles.emptyTitle, { color: Colors.text }]}>No pending invitations</Text>
                    <Text style={[styles.emptySubtitle, { color: Colors.textSecondary }]}>
                        Team leaders can invite you to join their team from the event page.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={invitations}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        gap: Spacing.md,
    },
    backBtn: { padding: Spacing.sm, borderRadius: BorderRadius.full },
    refreshBtn: { padding: Spacing.sm },
    headerTitle: { fontSize: FontSizes.xl, fontWeight: '700' },
    headerSubtitle: { fontSize: FontSizes.xs, marginTop: 2 },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    list: { padding: Spacing.lg, gap: 12, paddingBottom: 40 },

    card: {
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        padding: Spacing.lg,
        marginBottom: 12,
        gap: 12,
    },

    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    teamIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#6366f115',
        alignItems: 'center',
        justifyContent: 'center',
    },
    teamName: { fontSize: FontSizes.md, fontWeight: '700' },
    meta: { fontSize: FontSizes.xs, marginTop: 1 },
    inviteBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#eef2ff',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: BorderRadius.full,
    },
    inviteBadgeText: { fontSize: 11, fontWeight: '700', color: '#6366f1' },

    leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    leaderAvatar: { width: 36, height: 36, borderRadius: 18 },
    leaderAvatarFallback: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    leaderInitial: { fontWeight: '700', fontSize: 15 },
    leaderName: { fontSize: FontSizes.sm, fontWeight: '600' },
    timeAgo: { fontSize: 11 },

    messageBubble: {
        padding: 10,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
    },
    messageText: { fontSize: FontSizes.sm, fontStyle: 'italic', lineHeight: 18 },

    rolesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    rolesLabel: { fontSize: FontSizes.xs },
    roleChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    roleChipText: { fontSize: 11, color: '#6366f1', fontWeight: '500' },

    actions: { flexDirection: 'row', gap: 8 },
    acceptBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#6366f1',
        paddingVertical: 12,
        borderRadius: BorderRadius.lg,
    },
    acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSizes.sm },
    rejectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
    },
    rejectBtnText: { color: '#ef4444', fontWeight: '600', fontSize: FontSizes.sm },
    btnDisabled: { opacity: 0.6 },

    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 40,
    },
    emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
    emptySubtitle: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20 },
});
