import React, { useEffect, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
    ScrollView, Image, Platform, ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../api/supabase';
import { RootStackParamList } from '../../navigation/types';

type NotifDetailsRoute = RouteProp<RootStackParamList, 'NotificationDetails'>;

export default function NotificationDetailsScreen() {
    const navigation = useNavigation();
    const route = useRoute<NotifDetailsRoute>();
    const { notificationId } = route.params;
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);

    const [notification, setNotification] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const { data, error: err } = await (supabase as any)
                    .from('notifications')
                    .select('*')
                    .eq('id', notificationId)
                    .maybeSingle();

                if (err) throw err;
                if (!data) {
                    setError('Notification not found or already removed.');
                    return;
                }
                setNotification(data);

                // Mark as read
                await (supabase as any)
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('id', notificationId);
            } catch (e: any) {
                setError(e?.message ?? 'Failed to load notification');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [notificationId]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
            ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };

    const typeIcon = (type: string) => {
        switch (type) {
            case 'broadcast': return 'campaign';
            case 'event': return 'event';
            case 'team': return 'groups';
            case 'message': return 'message';
            default: return 'notifications';
        }
    };

    const typeColor = (type: string) => {
        switch (type) {
            case 'broadcast': return '#f59e0b';
            case 'event': return '#3b82f6';
            case 'team': return '#8b5cf6';
            case 'message': return '#10b981';
            default: return Colors.primary;
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: Colors.text }]}>Notification</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <MaterialIcons name="error-outline" size={48} color="#ef4444" />
                    <Text style={[styles.errorText, { color: Colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: Colors.surface }]}>
                        <Text style={{ color: Colors.text }}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            ) : notification ? (
                <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                    {/* Type badge */}
                    <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: typeColor(notification.type) + '20' }]}>
                            <MaterialIcons name={typeIcon(notification.type) as any} size={14} color={typeColor(notification.type)} />
                            <Text style={[styles.typeBadgeText, { color: typeColor(notification.type) }]}>
                                {(notification.type ?? 'notification').toUpperCase()}
                            </Text>
                        </View>
                        {!notification.is_read && (
                            <View style={[styles.unreadDot, { backgroundColor: Colors.primary }]} />
                        )}
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: Colors.text }]}>{notification.title}</Text>

                    {/* Timestamp */}
                    <Text style={[styles.timestamp, { color: Colors.textSecondary }]}>
                        {formatDate(notification.created_at)}
                    </Text>

                    {/* Image (if present) */}
                    {!!notification.image_url && (
                        <Image
                            source={{ uri: notification.image_url }}
                            style={styles.image}
                            resizeMode="cover"
                        />
                    )}

                    {/* Message body */}
                    <View style={[styles.messageCard, { backgroundColor: Colors.surface }]}>
                        <Text style={[styles.messageText, { color: Colors.text }]}>{notification.message}</Text>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            ) : null}
        </SafeAreaView>
    );
}

const createStyles = (Colors: any) => StyleSheet.create({
    container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    errorText: { fontSize: FontSizes.md, textAlign: 'center' },
    backButton: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: BorderRadius.lg },
    scroll: { flex: 1, padding: Spacing.md },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full },
    typeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },
    title: { fontSize: 22, fontWeight: '700', lineHeight: 30, marginBottom: 6 },
    timestamp: { fontSize: FontSizes.xs, marginBottom: 16 },
    image: { width: '100%', height: 200, borderRadius: BorderRadius.lg, marginBottom: 16 },
    messageCard: { borderRadius: BorderRadius.lg, padding: 16 },
    messageText: { fontSize: FontSizes.md, lineHeight: 24 },
});
