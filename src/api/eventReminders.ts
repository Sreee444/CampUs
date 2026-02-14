// @ts-nocheck
import { supabase } from './supabase';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface EventReminder {
  id: string;
  event_id: string;
  user_id: string;
  reminder_time: string;
  notification_type: 'push' | 'email';
  is_sent: boolean;
  created_at: string;
}

// Configure notifications (wrapped in try-catch for Expo Go compatibility)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (error) {
  console.log('Push notifications not available in Expo Go');
}

export async function requestNotificationPermissions() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('upcoming-events', {
        name: 'Upcoming Events',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366f1',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  } catch (error) {
    console.log('Notifications not available in Expo Go:', error);
    return false;
  }
}

export async function scheduleEventReminder(
  eventId: string,
  eventTitle: string,
  eventStartDate: string,
  reminderMinutes: number = 60
) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    throw new Error('Notification permissions not granted');
  }

  const eventDate = new Date(eventStartDate);
  const reminderDate = new Date(eventDate.getTime() - (reminderMinutes * 60 * 1000));

  if (reminderDate <= new Date()) {
    throw new Error('Cannot schedule reminder in the past');
  }

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📅 Upcoming Event',
        body: `\"${eventTitle}\" starts in ${reminderMinutes} minutes!`,
        data: { eventId, type: 'event_reminder' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        date: reminderDate,
        channelId: 'upcoming-events',
      },
    });

    return identifier;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    throw error;
  }
}

export async function cancelEventReminder(notificationId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
}

export async function createEventReminder(
  eventId: string,
  userId: string,
  reminderMinutes: number = 60
): Promise<EventReminder> {
  const reminderTime = new Date(Date.now() + reminderMinutes * 60 * 1000).toISOString();

  // @ts-ignore - Supabase type inference issue
  const { data, error } = await supabase
    .from('event_reminders')
    .insert({
      event_id: eventId,
      user_id: userId,
      reminder_time: reminderTime,
      notification_type: 'push',
      is_sent: false,
    } as any)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getEventReminders(userId: string): Promise<EventReminder[]> {
  const { data, error } = await supabase
    .from('event_reminders')
    .select(`
      *,
      events (
        id,
        title,
        start_date
      )
    `)
    .eq('user_id', userId)
    .eq('is_sent', false)
    .order('reminder_time', { ascending: true });

  if (error) throw error;

  return data || [];
}

export async function deleteEventReminder(reminderId: string) {
  const { error } = await supabase
    .from('event_reminders')
    .delete()
    .eq('id', reminderId);

  if (error) throw error;
}

export async function markReminderAsSent(reminderId: string) {
  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase
    .from('event_reminders')
    .update({ is_sent: true } as any)
    .eq('id', reminderId);

  if (error) throw error;
}

export async function scheduleEventLiveNotification(
  eventId: string,
  eventTitle: string,
  eventStartDate: string
) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    throw new Error('Notification permissions not granted');
  }

  const eventDate = new Date(eventStartDate);

  if (eventDate <= new Date()) {
    return; // Event already started
  }

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔴 Event Started',
        body: `\"${eventTitle}\" is now live! Join now.`,
        data: { eventId, type: 'event_live' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        date: eventDate,
        channelId: 'upcoming-events',
      },
    });

    return identifier;
  } catch (error) {
    console.error('Error scheduling live notification:', error);
    throw error;
  }
}

export async function getAllScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

export async function cancelAllEventNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}