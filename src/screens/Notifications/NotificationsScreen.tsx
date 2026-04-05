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
    Alert,
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
    deleteNotification,
    clearAllNotifications,
} from '../../api/notifications';
import {
    getPendingReceivedRequests,
    acceptConnectionRequest,
    rejectConnectionRequest
} from '../../api/connections';
import {
    getUserJoinRequestStatus,
    acceptProjectInvite,
    rejectProjectInvite,
    getTeamJoinRequests,
    acceptJoinRequest,
    rejectJoinRequest,
} from '../../api/projects';
import { Notification, ConnectionWithProfile } from '../../types/database';
import { supabase } from '../../api/supabase';
import {
    acceptInvite,
    rejectInvite,
    markNotifRead,
    acceptJoinRequest as acceptEventJoinRequest,
    rejectJoinRequest as rejectEventJoinRequest,
} from '../../utils/teamActions';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

type NotificationsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Notifications'>;

const getNotificationMeta = (type: string) => {
    switch (type) {
        case 'broadcast':
            return {
                icon: 'campaign' as const,
                iconColor: '#b45309',
                iconBg: '#fef3c7',
                label: 'Broadcast',
                isPriority: true,
            };
        case 'event':
        case 'event_registration':
            return {
                icon: 'event' as const,
                iconColor: '#e11d48',
                iconBg: '#ffe4e6',
                label: 'Event',
                isPriority: false,
            };
        case 'message':
            return {
                icon: 'chat-bubble' as const,
                iconColor: '#2563eb',
                iconBg: '#dbeafe',
                label: 'Message',
                isPriority: false,
            };
        case 'connection_request':
            return {
                icon: 'person-add' as const,
                iconColor: '#d97706',
                iconBg: '#fef3c7',
                label: 'Connection Request',
                isPriority: false,
            };
        case 'connection_accepted':
            return {
                icon: 'handshake' as const,
                iconColor: '#059669',
                iconBg: '#d1fae5',
                label: 'Connection Accepted',
                isPriority: false,
            };
        case 'team_invite':
            return {
                icon: 'mail' as const,
                iconColor: '#4f46e5',
                iconBg: '#eef2ff',
                label: 'Team Invite',
                isPriority: false,
            };
        case 'team_join_request':
            return {
                icon: 'group-add' as const,
                iconColor: '#7c3aed',
                iconBg: '#ede9fe',
                label: 'Team Join Request',
                isPriority: false,
            };
        case 'project_invite':
            return {
                icon: 'work-outline' as const,
                iconColor: '#4338ca',
                iconBg: '#e0e7ff',
                label: 'Project Invite',
                isPriority: false,
            };
        case 'project_request':
            return {
                icon: 'groups' as const,
                iconColor: '#7c3aed',
                iconBg: '#f3e8ff',
                label: 'Project Request',
                isPriority: false,
            };
        case 'team':
            return {
                icon: 'group' as const,
                iconColor: '#8b5cf6',
                iconBg: '#f3e8ff',
                label: 'Team Update',
                isPriority: false,
            };
        default:
            return {
                icon: 'notifications' as const,
                iconColor: '#6366f1',
                iconBg: '#eef2ff',
                label: 'General',
                isPriority: false,
            };
    }
};

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
    const [isClearingAll, setIsClearingAll] = useState(false);
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
            case 'team_join_request':
                if (notification.related_id) {
                    const eventId = (notification as any)?.metadata?.event_id;
                    if (eventId) {
                        navigation.navigate('TeamDetails', { teamId: notification.related_id, eventId });
                    }
                }
                break;
            case 'project_invite':
                if (notification.related_id) {
                    navigation.navigate('ProjectDetails', { teamId: notification.related_id });
                }
                break;
            case 'project_request':
                if (notification.related_id) {
                    navigation.navigate('ProjectDetails', { teamId: notification.related_id });
                }
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

    const handleAcceptProjectInvite = async (notif: Notification) => {
        if (!user?.id) return;
        try {
            setProcessingInviteId(notif.id);
            const teamId = notif.related_id;

            if (!teamId) {
                setToast({ visible: true, message: 'Project reference missing', type: 'error' });
                return;
            }

            const request: any = await getUserJoinRequestStatus(teamId, user.id);
            if (!request || request.status !== 'pending') {
                await markNotificationAsRead(notif.id);
                setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                setToast({ visible: true, message: 'Invite is no longer pending', type: 'info' });
                return;
            }

            await acceptProjectInvite(request.id, teamId, user.id);
            await markNotificationAsRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: '🎉 Project invite accepted', type: 'success' });
        } catch (err: any) {
            setToast({ visible: true, message: err?.message ?? 'Failed to accept invite', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const handleDeclineProjectInvite = async (notif: Notification) => {
        if (!user?.id) return;
        try {
            setProcessingInviteId(notif.id);
            const teamId = notif.related_id;

            if (!teamId) {
                setToast({ visible: true, message: 'Project reference missing', type: 'error' });
                return;
            }

            const request: any = await getUserJoinRequestStatus(teamId, user.id);
            if (request?.id && request.status === 'pending') {
                await rejectProjectInvite(request.id);
            }

            await markNotificationAsRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: 'Project invite declined', type: 'info' });
        } catch (err: any) {
            setToast({ visible: true, message: err?.message ?? 'Failed to decline invite', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const resolveProjectJoinRequest = async (notif: Notification) => {
        const teamId = notif.related_id;
        if (!teamId) {
            throw new Error('Project reference missing');
        }

        const meta = (notif as any).metadata ?? {};
        const requestId = meta.project_request_id ?? meta.team_request_id;
        const requesterUserId = meta.requester_user_id;

        const pendingRequests = await getTeamJoinRequests(teamId);
        if (!Array.isArray(pendingRequests) || pendingRequests.length === 0) {
            throw new Error('No pending join request found');
        }

        if (requestId) {
            const matched = pendingRequests.find((request: any) => request.id === requestId);
            if (matched) return matched;
        }

        if (requesterUserId) {
            const byUser = pendingRequests.find((request: any) => request.user_id === requesterUserId);
            if (byUser) return byUser;
        }

        if (pendingRequests.length === 1) {
            return pendingRequests[0];
        }

        throw new Error('Multiple pending requests found. Open Project Details to choose one.');
    };

    const resolveTeamJoinRequest = async (notif: Notification) => {
        const meta = (notif as any).metadata ?? {};
        const requestId = meta.team_request_id;
        const requesterUserId = meta.requester_user_id;
        const eventId = meta.event_id;
        const teamId = meta.team_id ?? notif.related_id;

        if (!requestId || !requesterUserId || !eventId || !teamId) {
            throw new Error('Join request details are missing');
        }

        return { requestId, requesterUserId, eventId, teamId };
    };

    const handleAcceptProjectRequest = async (notif: Notification) => {
        if (!user?.id) return;
        try {
            setProcessingInviteId(notif.id);
            const teamId = notif.related_id;
            if (!teamId) {
                setToast({ visible: true, message: 'Project reference missing', type: 'error' });
                return;
            }

            const request: any = await resolveProjectJoinRequest(notif);
            await acceptJoinRequest(request.id, teamId, request.user_id);
            await markNotificationAsRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: 'Join request accepted', type: 'success' });
        } catch (err: any) {
            setToast({ visible: true, message: err?.message ?? 'Failed to accept request', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const handleDeclineProjectRequest = async (notif: Notification) => {
        try {
            setProcessingInviteId(notif.id);
            const request: any = await resolveProjectJoinRequest(notif);
            await rejectJoinRequest(request.id);
            await markNotificationAsRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: 'Join request declined', type: 'info' });
        } catch (err: any) {
            setToast({ visible: true, message: err?.message ?? 'Failed to decline request', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const handleAcceptTeamJoinRequest = async (notif: Notification) => {
        try {
            setProcessingInviteId(notif.id);
            const req = await resolveTeamJoinRequest(notif);
            await acceptEventJoinRequest({
                requestId: req.requestId,
                teamId: req.teamId,
                eventId: req.eventId,
                targetUserId: req.requesterUserId,
            });
            await markNotificationAsRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: 'Join request accepted', type: 'success' });
        } catch (err: any) {
            setToast({ visible: true, message: err?.message ?? 'Failed to accept request', type: 'error' });
        } finally {
            setProcessingInviteId(null);
        }
    };

    const handleDeclineTeamJoinRequest = async (notif: Notification) => {
        try {
            setProcessingInviteId(notif.id);
            const req = await resolveTeamJoinRequest(notif);
            await rejectEventJoinRequest({
                requestId: req.requestId,
                teamId: req.teamId,
                eventId: req.eventId,
                targetUserId: req.requesterUserId,
            });
            await markNotificationAsRead(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
            setToast({ visible: true, message: 'Join request declined', type: 'info' });
        } catch (err: any) {
            setToast({ visible: true, message: err?.message ?? 'Failed to decline request', type: 'error' });
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

    const handleClearAllNotifications = () => {
        if (!user?.id || isClearingAll || notifications.length === 0) return;

        Alert.alert(
            'Clear all notifications?',
            'This will permanently delete all notifications.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsClearingAll(true);
                            await clearAllNotifications(user.id);
                            setNotifications([]);
                            setToast({ visible: true, message: 'All notifications cleared', type: 'success' });
                        } catch (error) {
                            setToast({ visible: true, message: 'Failed to clear notifications', type: 'error' });
                        } finally {
                            setIsClearingAll(false);
                        }
                    },
                },
            ]
        );
    };

    const renderNotificationItem = (item: Notification) => {
        const meta = getNotificationMeta(item.type);
        const isTeamInvite = item.type === 'team_invite';
        const isProjectInvite = item.type === 'project_invite';
        const isProjectRequest = item.type === 'project_request';
        const isTeamJoinRequest = item.type === 'team_join_request';
        const hasInlineInviteActions = isTeamInvite || isProjectInvite || isProjectRequest || isTeamJoinRequest;
        const isProcessing = processingInviteId === item.id;

        return (
            <TouchableOpacity
                key={item.id}
                style={[
                    styles.notificationItem,
                    !item.is_read && styles.unreadItem,
                    hasInlineInviteActions && styles.teamInviteItem,
                    meta.isPriority && styles.priorityItem,
                ]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={hasInlineInviteActions ? 1 : 0.7}
            >
                {/* Icon */}
                <View style={[styles.iconContainer, { backgroundColor: meta.iconBg }, hasInlineInviteActions && styles.teamInviteIcon]}>
                    <MaterialIcons name={meta.icon} size={24} color={meta.iconColor} />
                </View>

                {/* Content */}
                <View style={styles.contentContainer}>
                    <View style={styles.notificationTopRow}>
                        <Text style={[styles.notificationTitle, !item.is_read && styles.unreadText]}>
                            {item.title}
                        </Text>
                        <View style={[styles.typeChip, meta.isPriority && styles.priorityChip]}>
                            <Text style={[styles.typeChipText, meta.isPriority && styles.priorityChipText]}>{meta.label}</Text>
                        </View>
                    </View>
                    {meta.isPriority && (
                        <Text style={styles.priorityHintText}>Priority campus announcement</Text>
                    )}
                    <Text style={styles.notificationBody} numberOfLines={2}>
                        {(item as any).body}
                    </Text>
                    <Text style={styles.timeText}>{dayjs(item.created_at).fromNow()}</Text>

                    {/* ── Inline Accept / Decline for team invites ── */}
                    {hasInlineInviteActions && (
                        <View style={styles.inviteActions}>
                            <TouchableOpacity
                                style={[styles.inviteAcceptBtn, isProcessing && styles.inviteBtnDisabled]}
                                onPress={() => (
                                    isProjectInvite
                                        ? handleAcceptProjectInvite(item)
                                        : isProjectRequest
                                            ? handleAcceptProjectRequest(item)
                                            : isTeamJoinRequest
                                                ? handleAcceptTeamJoinRequest(item)
                                                : handleAcceptInvite(item)
                                )}
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
                                onPress={() => (
                                    isProjectInvite
                                        ? handleDeclineProjectInvite(item)
                                        : isProjectRequest
                                            ? handleDeclineProjectRequest(item)
                                            : isTeamJoinRequest
                                                ? handleDeclineTeamJoinRequest(item)
                                                : handleDeclineInvite(item)
                                )}
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
                {!hasInlineInviteActions && (
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
                                <TouchableOpacity onPress={handleClearAllNotifications} disabled={isClearingAll}>
                                    <Text style={[styles.actionText, styles.clearActionText]}>
                                        {isClearingAll ? 'Clearing...' : 'Clear all'}
                                    </Text>
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
        justifyContent: 'space-between',
        padding: Spacing.md,
    },
    actionText: {
        fontSize: FontSizes.sm,
        color: Colors.primary,
        fontWeight: FontWeights.medium,
    },
    clearActionText: {
        color: '#dc2626',
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
    priorityItem: {
        borderLeftWidth: 4,
        borderLeftColor: '#d97706',
        backgroundColor: '#fffbeb',
    },
    teamInviteIcon: {
        backgroundColor: '#eef2ff',
    },
    notificationTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 2,
    },
    typeChip: {
        backgroundColor: '#eef2ff',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    typeChipText: {
        color: '#4f46e5',
        fontSize: 10,
        fontWeight: FontWeights.semibold,
    },
    priorityChip: {
        backgroundColor: '#fef3c7',
    },
    priorityChipText: {
        color: '#b45309',
    },
    priorityHintText: {
        color: '#b45309',
        fontSize: 11,
        fontWeight: FontWeights.semibold,
        marginBottom: 2,
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
