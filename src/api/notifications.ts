import { supabase } from "./supabase";
import { Notification } from "../types/database";
import * as ExpoNotifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Configure notifications
ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Get push notification token
export const registerForPushNotifications = async () => {
  // Skip push notifications on web
  if (Platform.OS === 'web') {
    console.log('Push notifications not supported on web');
    return null;
  }

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
      return;
    }

    token = (await ExpoNotifications.getExpoPushTokenAsync()).data;
  } else {
    console.log("Must use physical device for Push Notifications");
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

// Create notification
export const createNotification = async (
  notificationData: Partial<Notification>
) => {
  const { data, error } = await supabase
    .from("notifications")
    .insert(notificationData)
    .select()
    .single();

  if (error) throw error;

  // Send push notification
  await sendPushNotification(
    notificationData.user_id!,
    notificationData.title!,
    notificationData.body!
  );

  return data as Notification;
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId: string) => {
  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);

  if (error) throw error;
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (userId: string) => {
  const { error } = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
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

// Send push notification (would need backend function in production)
const sendPushNotification = async (
  userId: string,
  title: string,
  body: string
) => {
  // This would typically be handled by a backend service
  // For now, we just send local notifications
  try {
    await ExpoNotifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null, // Send immediately
    });
  } catch (error) {
    console.error("Push notification error:", error);
  }
};

// Notification helpers for different events
export const sendEventNotification = async (
  userId: string,
  eventTitle: string,
  eventId: string
) => {
  return createNotification({
    user_id: userId,
    type: "event",
    title: "New Event",
    body: `Check out: ${eventTitle}`,
    related_id: eventId,
    related_type: "event",
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
  });
};

export const sendConnectionRequestNotification = async (
  userId: string,
  requesterName: string,
  requesterId: string
) => {
  return createNotification({
    user_id: userId,
    type: "connection",
    title: "New Connection Request",
    body: `${requesterName} wants to connect with you`,
    related_id: requesterId,
    related_type: "connection",
  });
};

export const sendTeamInviteNotification = async (
  userId: string,
  teamName: string,
  teamId: string
) => {
  return createNotification({
    user_id: userId,
    type: "team",
    title: "Team Invitation",
    body: `You've been invited to join ${teamName}`,
    related_id: teamId,
    related_type: "team",
  });
};

export const scheduleLocalNotification = async (
  title: string,
  body: string
) => {
  await ExpoNotifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { seconds: 3, type: 'timeInterval' },
  });
};
