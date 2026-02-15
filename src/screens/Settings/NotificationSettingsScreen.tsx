import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Switch,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Toast } from '../../components/Toast';

type NotificationSettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'NotificationSettings'>;

export default function NotificationSettingsScreen() {
    const navigation = useNavigation<NotificationSettingsScreenNavigationProp>();
    const { isDark } = useTheme();
    const Colors = getColors(isDark);
    const styles = createStyles(Colors);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

    const [pushEnabled, setPushEnabled] = useState(true);
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [smsEnabled, setSmsEnabled] = useState(false);

    const [projectUpdates, setProjectUpdates] = useState(true);
    const [teamMessages, setTeamMessages] = useState(true);
    const [eventReminders, setEventReminders] = useState(true);
    const [mentorMessages, setMentorMessages] = useState(true);
    const [systemAlerts, setSystemAlerts] = useState(true);
    const [weeklyDigest, setWeeklyDigest] = useState(false);

    const handleToggle = (name: string, value: boolean) => {
        setToast({
            visible: true,
            message: `${name} ${value ? 'enabled' : 'disabled'}`,
            type: 'info'
        });
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
                                <Text style={styles.settingName}>Push Notifications</Text>
                                <Text style={styles.settingDescription}>Receive notifications on this device</Text>
                            </View>
                        </View>
                        <Switch
                            value={pushEnabled}
                            onValueChange={(val) => { setPushEnabled(val); handleToggle('Push notifications', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <MaterialIcons name="email" size={24} color="#f59e0b" />
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Email Notifications</Text>
                                <Text style={styles.settingDescription}>Send updates to your email</Text>
                            </View>
                        </View>
                        <Switch
                            value={emailEnabled}
                            onValueChange={(val) => { setEmailEnabled(val); handleToggle('Email notifications', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <MaterialIcons name="sms" size={24} color="#10b981" />
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>SMS Notifications</Text>
                                <Text style={styles.settingDescription}>Send important alerts via SMS</Text>
                            </View>
                        </View>
                        <Switch
                            value={smsEnabled}
                            onValueChange={(val) => { setSmsEnabled(val); handleToggle('SMS notifications', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notification Types</Text>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Project Updates</Text>
                                <Text style={styles.settingDescription}>New tasks, comments, and milestones</Text>
                            </View>
                        </View>
                        <Switch
                            value={projectUpdates}
                            onValueChange={(val) => { setProjectUpdates(val); handleToggle('Project updates', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Team Messages</Text>
                                <Text style={styles.settingDescription}>Direct messages from team members</Text>
                            </View>
                        </View>
                        <Switch
                            value={teamMessages}
                            onValueChange={(val) => { setTeamMessages(val); handleToggle('Team messages', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Event Reminders</Text>
                                <Text style={styles.settingDescription}>Upcoming events and deadlines</Text>
                            </View>
                        </View>
                        <Switch
                            value={eventReminders}
                            onValueChange={(val) => { setEventReminders(val); handleToggle('Event reminders', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Mentor Messages</Text>
                                <Text style={styles.settingDescription}>Messages from your mentors</Text>
                            </View>
                        </View>
                        <Switch
                            value={mentorMessages}
                            onValueChange={(val) => { setMentorMessages(val); handleToggle('Mentor messages', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>System Alerts</Text>
                                <Text style={styles.settingDescription}>Important system announcements</Text>
                            </View>
                        </View>
                        <Switch
                            value={systemAlerts}
                            onValueChange={(val) => { setSystemAlerts(val); handleToggle('System alerts', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                            <View style={styles.settingText}>
                                <Text style={styles.settingName}>Weekly Digest</Text>
                                <Text style={styles.settingDescription}>Summary of your weekly activity</Text>
                            </View>
                        </View>
                        <Switch
                            value={weeklyDigest}
                            onValueChange={(val) => { setWeeklyDigest(val); handleToggle('Weekly digest', val); }}
                            trackColor={{ false: '#e2e8f0', true: Colors.primary }}
                        />
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
