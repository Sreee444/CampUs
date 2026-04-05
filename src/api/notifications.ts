// @ts-nocheck
import { supabase } from "./supabase";
import { Notification } from "../types/database";
import * as ExpoNotifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isExpoPushToken = (token?: string | null) => {
  if (!token || typeof token !== 'string') return false;
  return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
};

const resolveValidProjectId = () => {
  const candidates = [
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    Constants?.expoConfig?.extra?.eas?.projectId,
    (Constants as any)?.easConfig?.projectId,
  ].filter(Boolean) as string[];

  return candidates.find((id) => UUID_REGEX.test(String(id).trim())) || null;
};

// Configure notifications (wrapped in try-catch for Expo Go compatibility)
try {
  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (error) {
  console.log('Push notifications not available in Expo Go');
}

// Get push notification token
export const registerForPushNotifications = async () => {
  // Skip push notifications on web
  if (Platform.OS === 'web') {
    console.log('Push notifications not supported on web');
    return null;
  }

  if ((Constants as any)?.appOwnership === 'expo') {
    console.log('Push notifications not available in Expo Go');
    return null;
  }

  try {
    let token;

    if (Device.isDevice) {
      const { status: existingStatus } =
        await ExpoNotifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await ExpoNotifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Failed to get push token for push notification!");
        return null;
      }

      const projectId = resolveValidProjectId();

      if (!projectId) {
        console.log(
          "Missing/invalid EAS projectId for push notifications. Set EXPO_PUBLIC_EAS_PROJECT_ID to a valid UUID."
        );
        return null;
      }

      token = (
        await ExpoNotifications.getExpoPushTokenAsync({ projectId })
      ).data;
    } else {
      console.log("Must use physical device for Push Notifications");
      return null;
    }

    if (Platform.OS === "android") {
      ExpoNotifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: ExpoNotifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    return token;
  } catch (error) {
    console.log('Push notifications not available:', error);
    return null;
  }
};

// Get user notifications
export const getNotifications = async (
  userId: string,
  limit = 50,
  offset = 0
) => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data as Notification[];
};

// Create notification — uses ONLY actual table columns.
// No "message" column exists; use title + body.
export const createNotification = async (notificationData: {
  user_id: string;
  title: string;
  body: string;
  type: string;
  related_id?: string | null;
  related_type?: string | null;
  action_url?: string | null;
  image_url?: string | null;
  metadata?: any;
  is_read?: boolean;
}) => {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: notificationData.user_id,
      title: notificationData.title,
      body: notificationData.body,
      type: notificationData.type,
      related_id: notificationData.related_id ?? null,
      related_type: notificationData.related_type ?? null,
      action_url: notificationData.action_url ?? null,
      image_url: notificationData.image_url ?? null,
      metadata: notificationData.metadata ?? null,
      is_read: notificationData.is_read ?? false,
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Always route push to the target user's registered device token.
  // Background delivery cannot depend on the sender device being the same user.
  if (notificationData.user_id && notificationData.title && notificationData.body) {
    try {
      await sendBroadcastPushNotification({
        targetUserId: notificationData.user_id,
        title: notificationData.title,
        body: notificationData.body,
        data: {
          type: notificationData.type,
          related_id: notificationData.related_id ?? null,
          related_type: notificationData.related_type ?? null,
        },
      });
    } catch (pushError) {
      console.error('createNotification push dispatch error:', pushError);
    }
  }

  return data as Notification;
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    } as any)
    .eq("id", notificationId);

  if (error) throw error;
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (userId: string) => {
  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    } as any)
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
};

// Delete notification
export const deleteNotification = async (notificationId: string) => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId);

  if (error) throw error;
};

// Delete all notifications for a user
export const clearAllNotifications = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
};

// Get unread count
export const getUnreadCount = async (userId: string) => {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
  return count || 0;
};

// Subscribe to new notifications
export const subscribeToNotifications = (
  userId: string,
  callback: (notification: Notification) => void
) => {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.new as Notification);
      }
    )
    .subscribe();
};

// ─── Save this device's push token to the user's profile ─────────────────
export const savePushToken = async (userId: string, token: string) => {
  try {
    await supabase
      .from('profiles')
      .update({ expo_push_token: token } as any)
      .eq('id', userId);
  } catch (error) {
    console.error('savePushToken error:', error);
  }
};

// ─── Internal: POST to Expo Push API ─────────────────────────────────────
const postToExpoPushApi = async (
  messages: Array<{ to: string; title: string; body: string; data?: any }>
) => {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error('Expo Push API error:', error);
  }
};

// ─── Send a chat message notification to all participants except sender ────
export const sendChatPushNotification = async (opts: {
  conversationId: string;
  senderId: string;
  senderName: string;
  messagePreview: string;
  isGroup: boolean;
  groupName?: string;
}) => {
  try {
    // Fetch all conversation participants
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id, profiles!inner(expo_push_token, full_name)')
      .eq('conversation_id', opts.conversationId)
      .neq('user_id', opts.senderId) as any;

    if (!participants?.length) return;

    const messages = (participants as any[])
      .map((p: any) => {
        const token = p.profiles?.expo_push_token;
        if (!isExpoPushToken(token)) return null;
        return {
          to: token,
          title: opts.isGroup ? `${opts.senderName} in ${opts.groupName || 'Group'}` : opts.senderName,
          body: opts.messagePreview || 'New message',
          data: { conversationId: opts.conversationId },
        };
      })
      .filter(Boolean);

    if (messages.length > 0) await postToExpoPushApi(messages as any);
  } catch (error) {
    console.error('sendChatPushNotification error:', error);
  }
};

// ─── Send a broadcast push notification to a specific user ────────────────
export const sendBroadcastPushNotification = async (opts: {
  targetUserId: string;
  title: string;
  body: string;
  data?: any;
}) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', opts.targetUserId)
      .single() as any;

    const token = profile?.expo_push_token;
    if (!isExpoPushToken(token)) return;

    await postToExpoPushApi([{
      to: token,
      title: opts.title,
      body: opts.body,
      data: opts.data,
    }]);
  } catch (error) {
    console.error('sendBroadcastPushNotification error:', error);
  }
};


// ── Notification helpers ────────────────────────────────────────────────────
// Canonical type values:
//   team_invite | team_join_request | team_join_accepted | team_join_rejected
//   event_registration | project_request | mentor_request | connection_request

export const sendEventNotification = async (
  userId: string,
  eventTitle: string,
  eventId: string
) => {
  return createNotification({
    user_id: userId,
    type: "event_registration",
    title: "Event Registration Confirmed",
    body: `You are registered for ${eventTitle}`,
    related_id: eventId,
    related_type: "event",
    is_read: false,
  });
};

export const sendMessageNotification = async (
  userId: string,
  senderName: string,
  conversationId: string
) => {
  return createNotification({
    user_id: userId,
    type: "message",
    title: `New message from ${senderName}`,
    body: "Tap to view",
    related_id: conversationId,
    related_type: "conversation",
    is_read: false,
  });
};

export const sendConnectionRequestNotification = async (
  userId: string,
  requesterName: string,
  requesterId: string
) => {
  return createNotification({
    user_id: userId,
    type: "connection_request",
    title: "New Connection Request",
    body: `${requesterName} wants to connect with you`,
    related_id: requesterId,
    related_type: "connection",
    is_read: false,
  });
};

export const sendTeamInviteNotification = async (
  userId: string,
  leaderName: string,
  teamName: string,
  teamId: string
) => {
  return createNotification({
    user_id: userId,
    type: "team_invite",
    title: "Team Invitation",
    body: `${leaderName} invited you to join ${teamName}`,
    related_id: teamId,
    related_type: "team",
    is_read: false,
  });
};

export const sendTeamJoinRequestNotification = async (
  userId: string,
  requesterName: string,
  teamId: string
) => {
  return createNotification({
    user_id: userId,
    type: "team_join_request",
    title: "New Join Request",
    body: `${requesterName} requested to join your team`,
    related_id: teamId,
    related_type: "team",
    is_read: false,
  });
};

export const sendTeamJoinAcceptedNotification = async (
  userId: string,
  teamName: string,
  teamId: string
) => {
  return createNotification({
    user_id: userId,
    type: "team_join_accepted",
    title: "Join Request Accepted",
    body: `You are now part of ${teamName}`,
    related_id: teamId,
    related_type: "team",
    is_read: false,
  });
};

export const sendTeamJoinRejectedNotification = async (
  userId: string,
  teamName: string,
  teamId: string
) => {
  return createNotification({
    user_id: userId,
    type: "team_join_rejected",
    title: "Join Request Rejected",
    body: `Your request to join ${teamName} was declined`,
    related_id: teamId,
    related_type: "team",
    is_read: false,
  });
};

export const scheduleLocalNotification = async (
  title: string,
  body: string
) => {
  await ExpoNotifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { seconds: 3, type: ExpoNotifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
  });
};
