import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import {
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
} from '../../api/notifications';
import {
    getPendingReceivedRequests,
    acceptConnectionRequest,
    rejectConnectionRequest
} from '../../api/connections';
import { Notification, ConnectionWithProfile } from '../../types/database';
import { supabase } from '../../api/supabase';
import { acceptInvite, rejectInvite, markNotifRead } from '../../utils/teamActions';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

type NotificationsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen() {
    const navigation = useNavigation<NotificationsScreenNavigationProp>();
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);
    const { user } = useAuth();

    const [activeTab, setActiveTab] = useState<'notifications' | 'requests'>('notifications');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [requests, setRequests] = useState<ConnectionWithProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

    const loadData = async () => {
        if (!user?.id) return;

        try {
            const [notifsData, requestsData] = await Promise.all([
                getNotifications(user.id),
                getPendingReceivedRequests(),
            ]);

            setNotifications(notifsData || []);
            setRequests(requestsData || []);
        } catch (error) {
            console.error('Failed to load notifications:', error);
            setToast({ visible: true, message: 'Failed to load notifications', type: 'error' });
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [user?.id]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadData();
    };

    const handleNotificationPress = async (notification: Notification) => {
        if (!notification.is_read) {
            try {
                await markNotificationAsRead(notification.id);
                setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
            } catch (error) {
                console.error('Failed to mark read:', error);
            }
        }

        // Handle navigation based on notification type
        switch (notification.type) {
            case 'connection_request':
                setActiveTab('requests');
                break;
            case 'connection_accepted':
                if (notification.related_id) {
                    navigation.navigate('PublicProfile', { userId: notification.related_id });
                }
                break;
            case 'event':
                if (notification.related_id) {
                    navigation.navigate('EventDetails', { eventId: notification.related_id });
                }
                break;
            case 'message':
                navigation.navigate('MainTabs', { screen: 'Chat' });
                break;
            case 'team':
                if (notification.related_id) {
                    navigation.navigate('ProjectDetails', { teamId: notification.related_id });
                }
                break;
            case 'team_invite':
                // Navigate to the dedciated invitations screen
                navigation.navigate('TeamInvitations');
                break;
            case 'broadcast':
                navigation.navigate('NotificationDetails', { notificationId: notification.id });
                break;
            default:
                // For unknown types, open detail view if notification has a body
                if (notification.id) {
                    navigation.navigate('NotificationDetails', { notificationId: notification.id });
                }
                break;
        }
    };

    // ── Inline team invite actions ──────────────────────────────────────────
    const handleAcceptInvite = async (notif: Notification) => {
        if (!user?.id) return;
        try {
            setProcessingInviteId(notif.id);
            const meta = (notif as any).metadata ?? {};
            const requestId = meta.team_request_id;
            const teamId = meta.team_id ?? notif.related_id;
            const eventId = meta.event_id;

            if (!requestId || !teamId || !eventId) {
                // Fallback: just navigate to the invitations screen
                navigation.navigate('TeamInvitations');
                return;
            }

            await acceptInvite({ requestId, teamId, eventId, userId: user.id });
            await markNotifRead(notif.id);

            // Remove from list + show success
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: '🎉 You joined the team!', type: 'success' });
        } catch (err: any) {
            setToast({ visible: true, message: err.message ?? 'Failed to accept', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const handleDeclineInvite = async (notif: Notification) => {
        try {
            setProcessingInviteId(notif.id);
            const meta = (notif as any).metadata ?? {};
            const requestId = meta.team_request_id;

            if (requestId) {
                await rejectInvite(requestId);
            }
            await markNotifRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: 'Invitation declined', type: 'info' });
        } catch (err: any) {
            setToast({ visible: true, message: err.message ?? 'Failed to decline', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const handleAcceptRequest = async (connectionId: string, requesterName: string) => {
        try {
            await acceptConnectionRequest(connectionId);
            setRequests(prev => prev.filter(req => req.id !== connectionId));
            setToast({ visible: true, message: `You are now connected with ${requesterName}`, type: 'success' });
            // Refresh notifications as well
            loadData();
        } catch (error) {
            setToast({ visible: true, message: 'Failed to accept request', type: 'error' });
        }
    };

    const handleRejectRequest = async (connectionId: string) => {
        try {
            await rejectConnectionRequest(connectionId);
            setRequests(prev => prev.filter(req => req.id !== connectionId));
            setToast({ visible: true, message: 'Request removed', type: 'info' });
        } catch (error) {
            setToast({ visible: true, message: 'Failed to reject request', type: 'error' });
        }
    };

    const handleMarkAllRead = async () => {
        if (!user?.id) return;
        try {
            await markAllNotificationsAsRead(user.id);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setToast({ visible: true, message: 'All marked as read', type: 'success' });
        } catch (error) {
            setToast({ visible: true, message: 'Failed to update', type: 'error' });
        }
    };

    const handleDeleteNotification = async (id: string) => {
        try {
            await deleteNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            setToast({ visible: true, message: 'Notification deleted', type: 'success' });
        } catch (error) {
            setToast({ visible: true, message: 'Failed to delete', type: 'error' });
        }
    };

    const renderNotificationItem = (item: Notification) => {
        const isTeamInvite = item.type === 'team_invite';
        const isProcessing = processingInviteId === item.id;

        return (
            <TouchableOpacity
                key={item.id}
                style={[
                    styles.notificationItem,
                    !item.is_read && styles.unreadItem,
                    isTeamInvite && styles.teamInviteItem,
                ]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={isTeamInvite ? 1 : 0.7}
            >
                {/* Icon */}
                <View style={[styles.iconContainer, isTeamInvite && styles.teamInviteIcon]}>
                    {item.type === 'event' && <MaterialIcons name="event" size={24} color="#e11d48" />}
                    {item.type === 'message' && <MaterialIcons name="chat-bubble" size={24} color="#3b82f6" />}
                    {item.type === 'connection_request' && <MaterialIcons name="person-add" size={24} color="#f59e0b" />}
                    {item.type === 'connection_accepted' && <MaterialIcons name="person" size={24} color="#10b981" />}
                    {item.type === 'team' && <MaterialIcons name="group" size={24} color="#8b5cf6" />}
                    {item.type === 'team_invite' && <MaterialIcons name="mail" size={24} color="#6366f1" />}
                    {!['event', 'message', 'connection_request', 'connection_accepted', 'team', 'team_invite'].includes(item.type) && (
                        <MaterialIcons name="notifications" size={24} color={Colors.primary} />
                    )}
                </View>

                {/* Content */}
                <View style={styles.contentContainer}>
                    <Text style={[styles.notificationTitle, !item.is_read && styles.unreadText]}>
                        {item.title}
                    </Text>
                    <Text style={styles.notificationBody} numberOfLines={2}>
                        {(item as any).body}
                    </Text>
                    <Text style={styles.timeText}>{dayjs(item.created_at).fromNow()}</Text>

                    {/* ── Inline Accept / Decline for team invites ── */}
                    {isTeamInvite && (
                        <View style={styles.inviteActions}>
                            <TouchableOpacity
                                style={[styles.inviteAcceptBtn, isProcessing && styles.inviteBtnDisabled]}
                                onPress={() => handleAcceptInvite(item)}
                                disabled={isProcessing}
                            >
                                {isProcessing ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <MaterialIcons name="check" size={14} color="#fff" />
                                        <Text style={styles.inviteAcceptText}>Accept</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.inviteDeclineBtn, isProcessing && styles.inviteBtnDisabled]}
                                onPress={() => handleDeclineInvite(item)}
                                disabled={isProcessing}
                            >
                                {isProcessing ? (
                                    <ActivityIndicator size="small" color="#9ca3af" />
                                ) : (
                                    <>
                                        <MaterialIcons name="close" size={14} color="#ef4444" />
                                        <Text style={styles.inviteDeclineText}>Decline</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Delete (hidden for team_invite — handled by decline) */}
                {!isTeamInvite && (
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteNotification(item.id)}
                    >
                        <MaterialIcons name="close" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );
    };

    const renderRequestItem = (item: ConnectionWithProfile) => (
        <View key={item.id} style={styles.requestItem}>
            <TouchableOpacity
                style={styles.requesterInfo}
                onPress={() => {
                    if (item.profile?.id) {
                        navigation.navigate('PublicProfile', { userId: item.profile.id });
                    }
                }}
            >
                {item.profile?.avatar_url ? (
                    <Image source={{ uri: item.profile.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                            {item.profile?.full_name?.charAt(0) || '?'}
                        </Text>
                    </View>
                )}
                <View style={styles.requesterText}>
                    <Text style={styles.requesterName}>{item.profile?.full_name || 'Unknown User'}</Text>
                    <Text style={styles.requesterRole}>
                        {item.profile?.role ? item.profile.role.charAt(0).toUpperCase() + item.profile.role.slice(1) : 'Student'}
                        {item.profile?.department ? ` • ${item.profile.department}` : ''}
                    </Text>
                </View>
            </TouchableOpacity>

            <View style={styles.actionButtons}>
                <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={() => handleAcceptRequest(item.id, item.profile?.full_name || 'User')}
                >
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.deleteRequestButton}
                    onPress={() => handleRejectRequest(item.id)}
                >
                    <Text style={styles.deleteRequestButtonText}>Delete</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notifications</Text>
                <TouchableOpacity
                    onPress={() => navigation.navigate('NotificationSettings')}
                    style={styles.settingsButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <MaterialIcons name="settings" size={24} color={Colors.text} />
                </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'notifications' && styles.activeTab]}
                    onPress={() => setActiveTab('notifications')}
                >
                    <Text style={[styles.tabText, activeTab === 'notifications' && styles.activeTabText]}>
                        Notifications
                    </Text>
                    {notifications.filter(n => !n.is_read).length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                                {notifications.filter(n => !n.is_read).length}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
                    onPress={() => setActiveTab('requests')}
                >
                    <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
                        Requests
                    </Text>
                    {requests.length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{requests.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
                }
            >
                {activeTab === 'notifications' ? (
                    notifications.length > 0 ? (
                        <>
                            <View style={styles.actionsRow}>
                                <TouchableOpacity onPress={handleMarkAllRead}>
                                    <Text style={styles.actionText}>Mark all as read</Text>
                                </TouchableOpacity>
                            </View>
                            {notifications.map(renderNotificationItem)}
                        </>
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialIcons name="notifications-none" size={64} color={Colors.textSecondary} />
                            <Text style={styles.emptyStateText}>No notifications yet</Text>
                        </View>
                    )
                ) : (
                    requests.length > 0 ? (
                        <View style={styles.requestsList}>
                            <Text style={styles.sectionHeader}>Friend Requests</Text>
                            {requests.map(renderRequestItem)}
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialIcons name="person-outline" size={64} color={Colors.textSecondary} />
                            <Text style={styles.emptyStateText}>No pending requests</Text>
                        </View>
                    )
                )}
                <View style={{ height: 20 }} />
            </ScrollView>

            <Toast
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
                onHide={() => setToast({ ...toast, visible: false })}
            />
        </SafeAreaView>
    );
}

const createStyles = (Colors: ReturnType<typeof getColors>) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: 12,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    backButton: {
        padding: 8,
    },
    settingsButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: FontWeights.bold,
        color: Colors.text,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 6,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: Colors.primary,
    },
    tabText: {
        fontSize: FontSizes.md,
        fontWeight: FontWeights.medium,
        color: Colors.textSecondary,
    },
    activeTabText: {
        color: Colors.primary,
        fontWeight: FontWeights.semibold,
    },
    badge: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: Spacing.md,
    },
    actionText: {
        fontSize: FontSizes.sm,
        color: Colors.primary,
        fontWeight: FontWeights.medium,
    },
    notificationItem: {
        flexDirection: 'row',
        padding: Spacing.md,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        alignItems: 'flex-start',
        gap: 12,
    },
    unreadItem: {
        backgroundColor: Colors.primary + '08', // 5% opacity
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contentContainer: {
        flex: 1,
    },
    notificationTitle: {
        fontSize: FontSizes.md,
        fontWeight: FontWeights.semibold,
        color: Colors.text,
        marginBottom: 2,
    },
    unreadText: {
        fontWeight: 'bold',
    },
    notificationBody: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginBottom: 4,
        lineHeight: 18,
    },
    timeText: {
        fontSize: 11,
        color: Colors.textSecondary,
    },
    deleteButton: {
        padding: 4,
    },
    // Requests Tab Styles
    requestsList: {
        padding: Spacing.md,
    },
    sectionHeader: {
        fontSize: FontSizes.md,
        fontWeight: FontWeights.bold,
        color: Colors.text,
        marginBottom: 12,
    },
    requestItem: {
        backgroundColor: Colors.card,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.sm,
    },
    requesterInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    requesterText: {
        flex: 1,
    },
    requesterName: {
        fontSize: FontSizes.md,
        fontWeight: FontWeights.semibold,
        color: Colors.text,
    },
    requesterRole: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    confirmButton: {
        flex: 1,
        backgroundColor: Colors.primary,
        paddingVertical: 8,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: FontWeights.semibold,
        fontSize: FontSizes.sm,
    },
    deleteRequestButton: {
        flex: 1,
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingVertical: 8,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    deleteRequestButtonText: {
        color: Colors.text,
        fontWeight: FontWeights.medium,
        fontSize: FontSizes.sm,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 64,
        gap: 16,
    },
    emptyStateText: {
        fontSize: FontSizes.md,
        color: Colors.textSecondary,
        fontWeight: FontWeights.medium,
    },
    // ── Team invite inline actions ─────────────────────────────────────────
    teamInviteItem: {
        borderLeftWidth: 3,
        borderLeftColor: '#6366f1',
    },
    teamInviteIcon: {
        backgroundColor: '#eef2ff',
    },
    inviteActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    inviteAcceptBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: '#6366f1',
        paddingVertical: 8,
        borderRadius: BorderRadius.md,
    },
    inviteAcceptText: {
        color: '#fff',
        fontSize: FontSizes.sm,
        fontWeight: FontWeights.semibold,
    },
    inviteDeclineBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: '#fca5a5',
        backgroundColor: '#fee2e2',
    },
    inviteDeclineText: {
        color: '#ef4444',
        fontSize: FontSizes.sm,
        fontWeight: FontWeights.semibold,
    },
    inviteBtnDisabled: {
        opacity: 0.6,
    },
});
