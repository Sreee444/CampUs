import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
    FlatList, Platform, ActivityIndicator, ScrollView, Modal, Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAdminLogs, AdminAuditLog, AdminLogAction } from '../../api/admin';
import { UserAvatar } from '../../components/UserAvatar';
import Toast from 'react-native-toast-message';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminFilterChips from '../../components/admin/AdminFilterChips';

const ACTION_LABELS: Record<AdminLogAction, { label: string; color: string; icon: string }> = {
    ban_user: { label: 'Ban', color: '#ef4444', icon: 'block' },
    unban_user: { label: 'Unban', color: '#10b981', icon: 'person-add' },
    role_change: { label: 'Role Change', color: '#3b82f6', icon: 'manage-accounts' },
    post_approved: { label: 'Post Approved', color: '#10b981', icon: 'check-circle' },
    post_rejected: { label: 'Post Rejected', color: '#ef4444', icon: 'cancel' },
    report_resolved: { label: 'Report Resolved', color: '#f59e0b', icon: 'gavel' },
    broadcast_sent: { label: 'Broadcast', color: '#8b5cf6', icon: 'campaign' },
    topic_locked: { label: 'Topic Locked', color: '#64748b', icon: 'lock' },
    topic_pinned: { label: 'Topic Pinned', color: '#06b6d4', icon: 'push-pin' },
};

type AuditFilter = 'all' | 'ban_user' | 'role_change' | 'broadcast_sent' | 'post_approved' | 'post_rejected';

export default function AdminAuditScreen() {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);

    const [logs, setLogs] = useState<AdminAuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [filter, setFilter] = useState<AuditFilter>('all');
    const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const actionFilter: AdminLogAction | undefined = filter === 'all' ? undefined : filter;

    const loadLogs = useCallback(async (p: number, f: AdminLogAction | undefined, reset: boolean) => {
        try {
            if (p === 0) setIsLoading(true); else setIsLoadingMore(true);
            const data = await getAdminLogs({ action: f, page: p });
            if (reset) setLogs(data);
            else setLogs(prev => [...prev, ...data]);
            setHasMore(data.length === 30);
            setPage(p);
        } catch (err) {
            console.error('Admin logs error:', err);
            Toast.show({
                type: 'error',
                text1: 'Could not load audit logs',
                text2: (err as any)?.message || 'Please verify admin_logs table and RLS policies.',
            });
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        setLogs([]);
        setPage(0);
        setHasMore(true);
        loadLogs(0, actionFilter, true);
    }, [filter]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `${diffH}h ago`;
        return d.toLocaleDateString();
    };

    const formatDateLong = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString();
    };

    const normalizeMetadata = (log: AdminAuditLog): Record<string, unknown> => {
        const raw = log.metadata;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
        return {};
    };

    const humanize = (value: unknown): string => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    };

    const getChangeRows = (meta: Record<string, unknown>) => {
        const rows: Array<{ field: string; from: string; to: string }> = [];

        if (meta.from !== undefined || meta.to !== undefined) {
            rows.push({
                field: 'role',
                from: humanize(meta.from),
                to: humanize(meta.to),
            });
        }

        const changes = meta.changes;
        if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
            Object.entries(changes as Record<string, unknown>).forEach(([field, value]) => {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    const pair = value as Record<string, unknown>;
                    if (pair.from !== undefined || pair.to !== undefined) {
                        rows.push({ field, from: humanize(pair.from), to: humanize(pair.to) });
                    }
                }
            });
        }

        return rows;
    };

    const getHighlights = (meta: Record<string, unknown>) => {
        const keys = ['reason', 'duration', 'target_role', 'recipient_count', 'title', 'ban_until'];
        return keys
            .filter((k) => meta[k] !== undefined && meta[k] !== null && meta[k] !== '')
            .map((k) => ({ key: k, value: humanize(meta[k]) }));
    };

    const formatKeyLabel = (key: string) =>
        key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

    const renderItem = ({ item }: { item: AdminAuditLog }) => {
        const meta = ACTION_LABELS[item.action as AdminLogAction] ?? { label: item.action, color: '#64748b', icon: 'info' };
        const metadata = normalizeMetadata(item);
        const changeRows = getChangeRows(metadata);
        const highlights = getHighlights(metadata);
        const targetLabel = item.target_user?.full_name ?? item.target_user_id ?? 'System / Global';
        const shortId = item.id ? item.id.slice(0, 8) : 'event';

        return (
            <TouchableOpacity
                style={[styles.logCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
                activeOpacity={0.8}
                onPress={() => setSelectedLog(item)}
            >
                <View style={[styles.leftRail, { backgroundColor: meta.color }]} />
                <View style={[styles.cardGlow, { backgroundColor: meta.color + '12' }]} />

                <View style={styles.logHeaderRow}>
                    <View style={[styles.iconWrap, { backgroundColor: meta.color + '16' }]}>
                        <MaterialIcons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={styles.logTop}>
                            <View style={[styles.actionBadge, { backgroundColor: meta.color + '14', borderColor: meta.color + '44' }]}>
                                <Text style={[styles.logAction, { color: meta.color }]}>{meta.label}</Text>
                            </View>
                            <View style={[styles.timePill, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                                <MaterialIcons name="schedule" size={11} color={Colors.textSecondary} />
                                <Text style={[styles.logTime, { color: Colors.textSecondary }]}>{formatDate(item.created_at)}</Text>
                            </View>
                        </View>

                        <View style={styles.metaRowTop}>
                            <MaterialIcons name="fiber-manual-record" size={7} color={meta.color} />
                            <Text style={[styles.metaRowText, { color: Colors.textSecondary }]}>Action event</Text>
                            <Text style={[styles.metaDivider, { color: Colors.textSecondary }]}>|</Text>
                            <Text style={[styles.metaRowText, { color: Colors.textSecondary }]}>ID #{shortId}</Text>
                        </View>

                        <View style={styles.entityGrid}>
                            <View style={[styles.entityCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                                <Text style={[styles.entityLabel, { color: Colors.textSecondary }]}>Actor</Text>
                                <View style={styles.entityContentRow}>
                                    <UserAvatar uri={item.admin?.avatar_url ?? null} name={item.admin?.full_name ?? 'Unknown'} size={20} role="admin" />
                                    <Text style={[styles.entityText, { color: Colors.text }]} numberOfLines={2}>
                                        {item.admin?.full_name ?? 'Unknown admin'}
                                    </Text>
                                </View>
                            </View>

                            <View style={[styles.entityCard, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                                <Text style={[styles.entityLabel, { color: Colors.textSecondary }]}>Target</Text>
                                <View style={styles.entityContentRow}>
                                    <MaterialIcons name="person-outline" size={15} color={Colors.textSecondary} />
                                    <Text style={[styles.entityText, { color: Colors.text }]} numberOfLines={2}>
                                        {targetLabel}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {changeRows.length > 0 && (
                    <View style={[styles.contentBlock, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                        <Text style={[styles.blockTitle, { color: Colors.textSecondary }]}>Field Changes</Text>
                        {changeRows.slice(0, 2).map((row, idx) => (
                            <View key={`${row.field}-${idx}`} style={[styles.changeRow, { borderColor: Colors.border, backgroundColor: Colors.surface }]}> 
                                <Text style={[styles.changeField, { color: Colors.textSecondary }]}>{row.field.toUpperCase()}</Text>
                                <View style={styles.changeValues}>
                                    <View style={[styles.valuePill, { backgroundColor: '#ef44441a' }]}>
                                        <Text style={styles.valuePillText} numberOfLines={1}>{row.from}</Text>
                                    </View>
                                    <MaterialIcons name="south" size={13} color={Colors.textSecondary} style={styles.changeArrow} />
                                    <View style={[styles.valuePill, { backgroundColor: '#10b9811c' }]}>
                                        <Text style={[styles.valuePillText, { color: Colors.text }]} numberOfLines={1}>{row.to}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {highlights.length > 0 && (
                    <View style={styles.highlightWrap}>
                        {highlights.slice(0, 3).map((h) => (
                            <View
                                key={h.key}
                                style={[styles.metaChip, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                            >
                                <Text style={[styles.metaChipLabel, { color: Colors.textSecondary }]}>{formatKeyLabel(h.key)}</Text>
                                <Text style={[styles.metaChipValue, { color: Colors.text }]} numberOfLines={1}>{h.value}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {changeRows.length === 0 && highlights.length === 0 && (
                    <View style={[styles.emptyDataStrip, { borderColor: Colors.border, backgroundColor: Colors.background }]}> 
                        <MaterialIcons name="notes" size={14} color={Colors.textSecondary} />
                        <Text style={[styles.emptyDataText, { color: Colors.textSecondary }]}>No quick metadata attached for this event.</Text>
                    </View>
                )}

                <View style={[styles.cardFooter, { borderTopColor: Colors.border }]}> 
                    <Text style={[styles.eventId, { color: Colors.textSecondary }]}>#{shortId}</Text>
                    <View style={styles.previewHint}>
                        <Text style={[styles.previewHintText, { color: Colors.primary }]}>Open details</Text>
                        <MaterialIcons name="north-east" size={14} color={Colors.primary} />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const selectedActionMeta = selectedLog
        ? (ACTION_LABELS[selectedLog.action as AdminLogAction] ?? { label: selectedLog.action, color: '#64748b', icon: 'info' })
        : null;
    const selectedMetadata = selectedLog ? normalizeMetadata(selectedLog) : {};
    const selectedChanges = getChangeRows(selectedMetadata);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}> 
            <AdminHeader
                title="Audit Log"
                subtitle="Trace every moderation and governance action"
                count={logs.length}
                onBack={() => navigation.goBack()}
                onRefresh={() => loadLogs(0, actionFilter, true)}
            />

            <AdminFilterChips<AuditFilter>
                selected={filter}
                onSelect={setFilter}
                options={[
                    { label: 'All', value: 'all' },
                    { label: 'Bans', value: 'ban_user' },
                    { label: 'Roles', value: 'role_change' },
                    { label: 'Broadcast', value: 'broadcast_sent' },
                    { label: 'Approved', value: 'post_approved' },
                    { label: 'Rejected', value: 'post_rejected' },
                ]}
            />

            <View style={[styles.countWrap, { borderTopColor: Colors.border, borderBottomColor: Colors.border }]}> 
                <Text style={[styles.countText, { color: Colors.textSecondary }]}>
                    Showing {logs.length} log{logs.length === 1 ? '' : 's'}
                </Text>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(item, i) => item.id ?? String(i)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshing={isRefreshing}
                    onRefresh={async () => {
                        setIsRefreshing(true);
                        await loadLogs(0, actionFilter, true);
                        setIsRefreshing(false);
                    }}
                    onEndReached={() => { if (hasMore && !isLoadingMore) loadLogs(page + 1, actionFilter, false); }}
                    onEndReachedThreshold={0.3}
                    ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color={Colors.primary} style={{ margin: 16 }} /> : null}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <MaterialIcons name="history" size={44} color={Colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: Colors.textSecondary }]}>No audit logs found</Text>
                        </View>
                    }
                />
            )}

            <Modal
                visible={!!selectedLog}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedLog(null)}
            >
                <View style={styles.previewOverlay}>
                    <Pressable style={styles.previewBackdrop} onPress={() => setSelectedLog(null)} />
                    <View style={[styles.previewCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}> 
                        <View style={[styles.sheetHandle, { backgroundColor: Colors.border }]} />
                        <View style={styles.previewHeader}>
                            <View style={styles.previewTitleRow}>
                                <View style={[styles.previewIcon, { backgroundColor: (selectedActionMeta?.color ?? '#64748b') + '18' }]}>
                                    <MaterialIcons name={(selectedActionMeta?.icon ?? 'info') as any} size={20} color={selectedActionMeta?.color ?? '#64748b'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.previewTitle, { color: Colors.text }]}>{selectedActionMeta?.label ?? 'Audit Event'}</Text>
                                    <Text style={[styles.previewTime, { color: Colors.textSecondary }]}>{selectedLog ? formatDateLong(selectedLog.created_at) : ''}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setSelectedLog(null)}>
                                <MaterialIcons name="close" size={22} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        {selectedLog && (
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                                <View style={styles.previewSection}>
                                    <Text style={[styles.previewLabel, { color: Colors.textSecondary }]}>Changed By</Text>
                                    <Text style={[styles.previewValue, { color: Colors.text }]}>
                                        {selectedLog.admin?.full_name ?? selectedLog.admin_id}
                                    </Text>
                                </View>

                                <View style={styles.previewSection}>
                                    <Text style={[styles.previewLabel, { color: Colors.textSecondary }]}>Target</Text>
                                    <Text style={[styles.previewValue, { color: Colors.text }]}>
                                        {selectedLog.target_user?.full_name ?? selectedLog.target_user_id ?? 'System / Global'}
                                    </Text>
                                </View>

                                {selectedChanges.length > 0 && (
                                    <View style={styles.previewSection}>
                                        <Text style={[styles.previewLabel, { color: Colors.textSecondary }]}>What Changed</Text>
                                        {selectedChanges.map((row, idx) => (
                                            <View key={`${row.field}-${idx}`} style={[styles.previewChangeRow, { borderColor: Colors.border }]}> 
                                                <Text style={[styles.previewChangeField, { color: Colors.textSecondary }]}>{row.field}</Text>
                                                <Text style={[styles.previewChangeValue, { color: Colors.text }]}>
                                                    {row.from}{' -> '}{row.to}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {selectedChanges.length === 0 && (
                                    <View style={styles.previewSection}>
                                        <Text style={[styles.previewLabel, { color: Colors.textSecondary }]}>What Changed</Text>
                                        <Text style={[styles.previewSubtle, { color: Colors.textSecondary }]}>No field-level diff metadata available for this event.</Text>
                                    </View>
                                )}

                                <View style={styles.previewSection}>
                                    <Text style={[styles.previewLabel, { color: Colors.textSecondary }]}>Metadata Preview</Text>
                                    <ScrollView style={[styles.metaBox, { backgroundColor: Colors.background, borderColor: Colors.border }]}> 
                                        <Text style={[styles.metaJson, { color: Colors.text }]}> 
                                            {JSON.stringify(selectedMetadata, null, 2)}
                                        </Text>
                                    </ScrollView>
                                </View>

                                <TouchableOpacity
                                    style={[styles.closeBtn, { backgroundColor: Colors.primary }]}
                                    onPress={() => setSelectedLog(null)}
                                >
                                    <Text style={styles.closeBtnText}>Close</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const createStyles = (Colors: any) => StyleSheet.create({
    container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
    countWrap: {
        marginHorizontal: Spacing.md,
        marginTop: 2,
        marginBottom: 4,
        paddingHorizontal: Spacing.md,
        paddingVertical: 9,
        borderWidth: 1,
        borderRadius: BorderRadius.md,
    },
    countText: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    emptyText: { fontSize: FontSizes.md },
    listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, paddingBottom: 24, gap: 2 },
    logCard: {
        borderRadius: BorderRadius.xl,
        paddingTop: 12,
        paddingBottom: 12,
        paddingRight: 12,
        paddingLeft: 14,
        marginBottom: 11,
        gap: 10,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    leftRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    cardGlow: {
        position: 'absolute',
        top: -24,
        right: -20,
        width: 120,
        height: 120,
        borderRadius: 60,
    },
    logHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    iconWrap: { width: 36, height: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
    logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 6, flexWrap: 'wrap' },
    actionBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
    logAction: { fontSize: 11, fontWeight: FontWeights.bold, letterSpacing: 0.3, textTransform: 'uppercase' },
    timePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 3, maxWidth: '100%' },
    logTime: { fontSize: 11, fontWeight: FontWeights.medium },
    metaRowTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
    metaRowText: { fontSize: 10, fontWeight: FontWeights.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
    metaDivider: { fontSize: 10, opacity: 0.6 },
    entityGrid: { flexDirection: 'column', alignItems: 'stretch', gap: 8, marginBottom: 2 },
    entityCard: {
        minWidth: 0,
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        paddingHorizontal: 8,
        paddingVertical: 8,
        gap: 6,
    },
    entityLabel: { fontSize: 10, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
    entityContentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    entityText: { fontSize: FontSizes.xs, flex: 1, fontWeight: FontWeights.medium, lineHeight: 15 },
    contentBlock: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: 8, gap: 6 },
    blockTitle: { fontSize: 10, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
    changeRow: { borderWidth: 1, borderRadius: BorderRadius.md, padding: 8, gap: 5 },
    changeField: { fontSize: 10, fontWeight: FontWeights.bold, letterSpacing: 0.4 },
    changeValues: { flexDirection: 'column', alignItems: 'stretch', gap: 5 },
    changeArrow: { alignSelf: 'center' },
    valuePill: { flex: 1, borderRadius: BorderRadius.sm, paddingHorizontal: 7, paddingVertical: 5 },
    valuePillText: { fontSize: 11, color: '#7f1d1d', fontWeight: FontWeights.medium },
    highlightWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaChip: {
        flexGrow: 1,
        flexBasis: '48%',
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    metaChipLabel: { fontSize: FontSizes.xs, marginBottom: 2 },
    metaChipValue: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
    emptyDataStrip: {
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        paddingHorizontal: 10,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    emptyDataText: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
    cardFooter: { marginTop: 2, borderTopWidth: 1, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eventId: { fontSize: 10, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
    previewHint: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 18 },
    previewHintText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
    previewOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'flex-end',
    },
    previewBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    previewCard: {
        maxHeight: '86%',
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        borderWidth: 1,
        padding: Spacing.md,
        paddingBottom: Spacing.lg,
    },
    sheetHandle: {
        width: 42,
        height: 4,
        borderRadius: 999,
        alignSelf: 'center',
        marginBottom: Spacing.sm,
    },
    previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    previewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    previewIcon: { width: 36, height: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
    previewTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    previewTime: { fontSize: FontSizes.xs },
    previewSection: { marginBottom: 12, gap: 4 },
    previewLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium, textTransform: 'uppercase' },
    previewValue: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
    previewChangeRow: { borderWidth: 1, borderRadius: BorderRadius.md, padding: 8, marginTop: 6 },
    previewChangeField: { fontSize: FontSizes.xs, textTransform: 'capitalize' },
    previewChangeValue: { fontSize: FontSizes.sm, marginTop: 2 },
    previewSubtle: { fontSize: FontSizes.sm },
    metaBox: { borderWidth: 1, borderRadius: BorderRadius.md, padding: 8, maxHeight: 200 },
    metaJson: { fontSize: FontSizes.xs, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    closeBtn: {
        marginTop: Spacing.md,
        alignSelf: 'flex-end',
        borderRadius: BorderRadius.md,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    closeBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});
