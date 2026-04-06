import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Switch,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile } from '../../api/auth';

type NotificationSettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'NotificationSettings'>;

export default function NotificationSettingsScreen() {
    const navigation = useNavigation<NotificationSettingsScreenNavigationProp>();
    const { isDark } = useTheme();
        const { user, profile, refreshProfile } = useAuth();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

        const [notificationEnabled, setNotificationEnabled] = useState(true);
        const [chatEnabled, setChatEnabled] = useState(true);
        const [savingKey, setSavingKey] = useState<'notification' | 'chat' | null>(null);

        useEffect(() => {
            setNotificationEnabled(profile?.notification_enabled !== false);
            setChatEnabled(profile?.chat_enabled !== false);
        }, [profile?.notification_enabled, profile?.chat_enabled]);

        const persistToggle = async (
            key: 'notification_enabled' | 'chat_enabled',
            value: boolean,
            setter: (next: boolean) => void,
            label: string,
            saving: 'notification' | 'chat'
        ) => {
            const userId = user?.id || profile?.id;
            if (!userId) return;

            const previous = key === 'notification_enabled' ? notificationEnabled : chatEnabled;
            setter(value);
            setSavingKey(saving);

            try {
                await updateProfile(userId, { [key]: value } as any);
                await refreshProfile();
                setToast({
                    visible: true,
                    message: `${label} ${value ? 'enabled' : 'disabled'}`,
                    type: 'success',
                });
            } catch (error: any) {
                setter(previous);
                setToast({
                    visible: true,
                    message: error?.message || `Failed to update ${label.toLowerCase()}`,
                    type: 'error',
                });
            } finally {
                setSavingKey(null);
            }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notification Settings</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notification Channels</Text>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <MaterialIcons name="notifications-active" size={24} color={Colors.primary} />
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>App Notifications</Text>
                                <Text style={styles.settingDescription}>Enable reminders and campus updates in-app</Text>
                            </View>
                        </View>
                        {savingKey === 'notification' ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <Switch
                              value={notificationEnabled}
                              onValueChange={(val) => persistToggle('notification_enabled', val, setNotificationEnabled, 'Notifications', 'notification')}
                              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                          />
                        )}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Messaging</Text>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <MaterialIcons name="chat-bubble-outline" size={24} color="#0ea5e9" />
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Chat Availability</Text>
                                <Text style={styles.settingDescription}>Allow direct and mentorship chat interactions</Text>
                            </View>
                        </View>
                        {savingKey === 'chat' ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <Switch
                              value={chatEnabled}
                              onValueChange={(val) => persistToggle('chat_enabled', val, setChatEnabled, 'Chat availability', 'chat')}
                              trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                          />
                        )}
                    </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>What You Receive</Text>
                  <View style={styles.settingItem}>
                    <View style={styles.settingInfo}>
                      <MaterialIcons name="event-available" size={20} color="#f59e0b" />
                      <View style={styles.settingText}>
                        <Text style={styles.settingName}>Events and deadlines</Text>
                        <Text style={styles.settingDescription}>Registrations, reminders, and updates from campus activities</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.settingItem}>
                    <View style={styles.settingInfo}>
                      <MaterialIcons name="groups" size={20} color="#10b981" />
                      <View style={styles.settingText}>
                        <Text style={styles.settingName}>Projects and teams</Text>
                        <Text style={styles.settingDescription}>Invites, request updates, and team activity notices</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={{ height: 32 }} />
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
        ...(Platform.OS === 'web' && ({ height: '100vh', width: '100vw' } as any)),
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
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: FontWeights.bold,
        color: Colors.text,
    },
    scrollView: {
        flex: 1,
    },
    section: {
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: FontSizes.sm,
        fontWeight: FontWeights.bold,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: Spacing.md,
        marginBottom: 12,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.surface,
        paddingHorizontal: Spacing.md,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    settingInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    settingText: {
        flex: 1,
    },
    settingName: {
        fontSize: FontSizes.md,
        fontWeight: FontWeights.medium,
        color: Colors.text,
        marginBottom: 2,
    },
    settingDescription: {
        fontSize: FontSizes.sm,
        color: Colors.textSecondary,
    },
});
