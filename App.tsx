import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/contexts/AuthContext';
import { StyleSheet, AppState } from 'react-native';
import { registerForPushNotifications, subscribeToNotifications } from './src/api/notifications';
import { updateUserStatus } from './src/api/chat';
import { BroadcastBanner } from './src/components/BroadcastBanner';

function AppContent() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [broadcastBanner, setBroadcastBanner] = useState<{
    title: string;
    message: string;
    imageUrl?: string | null;
    visible: boolean;
  }>({ title: '', message: '', imageUrl: null, visible: false });
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().catch(console.error);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    // App state listener for user status
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      try {
        if (nextAppState === 'active') {
          // App came to foreground
          await updateUserStatus(user.id, 'online');
        } else if (nextAppState === 'inactive' || nextAppState === 'background') {
          // App moved out of active use
          await updateUserStatus(user.id, 'away');
        }
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });

    // Set initial status to online when component mounts
    updateUserStatus(user.id, 'online').catch(console.error);

    // Periodically update status to keep it fresh while app is active
    // This prevents false offline status due to stale timestamps
    const statusHeartbeat = setInterval(() => {
      if (AppState.currentState === 'active') {
        updateUserStatus(user.id, 'online').catch(console.error);
      }
    }, 45 * 1000); // Update every 45 seconds

    return () => {
      subscription.remove();
      clearInterval(statusHeartbeat);
      updateUserStatus(user.id, 'away').catch(console.error);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Global listener for new notifications
    const channel = subscribeToNotifications(user.id, (notification: any) => {
      console.log('Real-time notification received:', notification);

      if (notification?.type === 'broadcast') {
        if (broadcastTimerRef.current) {
          clearTimeout(broadcastTimerRef.current);
        }

        setBroadcastBanner({
          visible: true,
          title: notification.title || 'Campus Broadcast',
          message: notification.body || notification.message || 'New announcement received.',
          imageUrl: notification.image_url || null,
        });

        broadcastTimerRef.current = setTimeout(() => {
          setBroadcastBanner((prev) => ({ ...prev, visible: false }));
        }, 6000);

        return;
      }

      Toast.show({
        type: 'info',
        text1: notification.title || 'New Notification',
        text2: notification.body || notification.message || 'Tap to view',
        onPress: () => {
          // Navigation logic could go here if needed
          Toast.hide();
        }
      });
    });

    return () => {
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current);
      }
      channel.unsubscribe();
    };
  }, [user?.id]);

  const handleCloseBroadcastBanner = () => {
    if (broadcastTimerRef.current) {
      clearTimeout(broadcastTimerRef.current);
    }
    setBroadcastBanner((prev) => ({ ...prev, visible: false }));
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <RootNavigator />
        <BroadcastBanner
          visible={broadcastBanner.visible}
          title={broadcastBanner.title}
          message={broadcastBanner.message}
          imageUrl={broadcastBanner.imageUrl}
          onClose={handleCloseBroadcastBanner}
        />
      </SafeAreaView>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
});
