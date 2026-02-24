import React, { useEffect } from 'react';
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

function AppContent() {
  const { isDark } = useTheme();
  const { user } = useAuth();

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
        } else if (nextAppState === 'background') {
          // App went to background
          await updateUserStatus(user.id, 'away');
        }
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });

    // Set initial status to online when component mounts
    updateUserStatus(user.id, 'online').catch(console.error);

    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Global listener for new notifications
    const channel = subscribeToNotifications(user.id, (notification: any) => {
      console.log('Real-time notification received:', notification);
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
      channel.unsubscribe();
    };
  }, [user?.id]);

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <RootNavigator />
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
