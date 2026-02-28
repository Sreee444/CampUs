import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
    FlatList, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAdminLogs, AdminLogAction } from '../../api/admin';
import { UserAvatar } from '../../components/UserAvatar';

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

const FILTER_TABS = [
    { label: 'All', value: undefined },
    { label: 'Bans', value: 'ban_user' as AdminLogAction },
    { label: 'Roles', value: 'role_change' as AdminLogAction },
    { label: 'Broadcast', value: 'broadcast_sent' as AdminLogAction },
    { label: 'Content', value: 'post_approved' as AdminLogAction },
];

export default function AdminAuditScreen() {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);

    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [filter, setFilter] = useState<AdminLogAction | undefined>(undefined);

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
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        setLogs([]);
        setPage(0);
        setHasMore(true);
        loadLogs(0, filter, true);
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

    const renderItem = ({ item }: { item: any }) => {
        const meta = ACTION_LABELS[item.action as AdminLogAction] ?? { label: item.action, color: '#64748b', icon: 'info' };
        return (
            <View style={[styles.logCard, { backgroundColor: Colors.surface }]}>
                <View style={[styles.iconWrap, { backgroundColor: meta.color + '18' }]}>
                    <MaterialIcons name={meta.icon as any} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                    <View style={styles.logTop}>
                        <Text style={[styles.logAction, { color: Colors.text }]}>{meta.label}</Text>
                        <Text style={[styles.logTime, { color: Colors.textSecondary }]}>{formatDate(item.created_at)}</Text>
                    </View>
                    <Text style={[styles.logAdmin, { color: Colors.textSecondary }]}>
                        By: {item.admin?.full_name ?? 'Unknown admin'}
                    </Text>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                        <Text style={[styles.logMeta, { color: Colors.textSecondary }]} numberOfLines={2}>
                            {Object.entries(item.metadata).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: Colors.text }]}>Audit Log</Text>
                <TouchableOpacity onPress={() => loadLogs(0, filter, true)} style={styles.backBtn}>
                    <MaterialIcons name="refresh" size={22} color={Colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Filter tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {FILTER_TABS.map((tab) => {
                    const active = filter === tab.value;
                    return (
                        <TouchableOpacity
                            key={tab.label}
                            style={[styles.filterChip, active && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                            onPress={() => setFilter(tab.value)}
                        >
                            <Text style={[styles.filterChipText, { color: active ? '#fff' : Colors.text }]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

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
                    onEndReached={() => { if (hasMore && !isLoadingMore) loadLogs(page + 1, filter, false); }}
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
        </SafeAreaView>
    );
}

const createStyles = (Colors: any) => StyleSheet.create({
    container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
    filterScroll: { paddingHorizontal: Spacing.md, paddingVertical: 10 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginRight: 8 },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    emptyText: { fontSize: FontSizes.md },
    listContent: { paddingHorizontal: Spacing.md, paddingBottom: 24 },
    logCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: BorderRadius.lg, padding: 12, marginBottom: 8, gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
    logTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    logAction: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    logTime: { fontSize: FontSizes.xs },
    logAdmin: { fontSize: FontSizes.xs, marginBottom: 2 },
    logMeta: { fontSize: FontSizes.xs, fontStyle: 'italic' },
});
