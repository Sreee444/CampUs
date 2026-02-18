import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { sendBroadcastMessage } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';

export default function AdminBroadcastScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors, isDark);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const targetRoles = [
    { label: 'Everyone', value: null, icon: 'public' },
    { label: 'Students', value: 'student', icon: 'school' },
    { label: 'Faculty', value: 'faculty', icon: 'person' },
    { label: 'Alumni', value: 'alumni', icon: 'verified' },
  ];

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      Toast.show({ type: 'error', text1: 'Please fill all fields' });
      return;
    }

    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Not authenticated' });
      return;
    }

    try {
      setIsSending(true);
      const result = await sendBroadcastMessage(user.id, title, message, targetRole || undefined);
      Toast.show({
        type: 'success',
        text1: 'Broadcast Sent',
        text2: `Message sent to ${result.recipient_count} recipients`,
      });
      setTitle('');
      setMessage('');
      setTargetRole(null);
    } catch (error) {
      console.error('Error sending broadcast:', error);
      Toast.show({ type: 'error', text1: 'Failed to send broadcast' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Broadcast Message</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: Colors.primary + '15' }]}>
          <MaterialIcons name="info" size={20} color={Colors.primary} />
          <Text style={[styles.infoText, { color: Colors.primary }]}>
            Send important announcements to all or targeted users
          </Text>
        </View>

        {/* Title Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Title *</Text>
          <TextInput
            style={[styles.input, { borderColor: Colors.border }]}
            placeholder="Announcement title"
            placeholderTextColor={Colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <Text style={styles.charCount}>{title.length}/100</Text>
        </View>

        {/* Message Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Message *</Text>
          <TextInput
            style={[styles.messageInput, { borderColor: Colors.border }]}
            placeholder="Write your message here..."
            placeholderTextColor={Colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
        </View>

        {/* Target Role Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Send To</Text>
          <View style={styles.roleGrid}>
            {targetRoles.map((role) => (
              <TouchableOpacity
                key={role.value || 'all'}
                style={[
                  styles.roleButton,
                  targetRole === role.value && styles.roleButtonActive,
                  { backgroundColor: Colors.surface, borderColor: Colors.border },
                ]}
                onPress={() => setTargetRole(role.value)}
              >
                <MaterialIcons
                  name={role.icon as any}
                  size={24}
                  color={
                    targetRole === role.value ? Colors.primary : Colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.roleButtonText,
                    targetRole === role.value && styles.roleButtonTextActive,
                  ]}
                >
                  {role.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Preview */}
        {title && message && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preview</Text>
            <View style={[styles.previewCard, { backgroundColor: Colors.surface }]}>
              <View style={styles.previewHeader}>
                <MaterialIcons name="notification-important" size={20} color={Colors.primary} />
                <Text style={styles.previewTitle}>{title}</Text>
              </View>
              <Text style={styles.previewMessage}>{message}</Text>
            </View>
          </View>
        )}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Send Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.sendButton, !title || !message ? styles.buttonDisabled : null]}
          onPress={handleSend}
          disabled={isSending || !title || !message}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="send" size={20} color="#fff" />
              <Text style={styles.sendButtonText}>Send Broadcast</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      padding: Spacing.md,
    },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.lg,
      gap: Spacing.md,
    },
    infoText: {
      flex: 1,
      fontSize: FontSizes.sm,
      lineHeight: 18,
    },
    section: {
      marginBottom: Spacing.lg,
    },
    sectionLabel: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: 4,
    },
    messageInput: {
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.text,
      marginBottom: 4,
    },
    charCount: {
      fontSize: FontSizes.xs,
      color: Colors.textSecondary,
      textAlign: 'right',
    },
    roleGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
    },
    roleButton: {
      flex: 0.48,
      alignItems: 'center',
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    roleButtonActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primary + '10',
    },
    roleButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: FontWeights.semibold,
      color: Colors.text,
      marginTop: 8,
    },
    roleButtonTextActive: {
      color: Colors.primary,
    },
    previewCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: Colors.primary,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    previewTitle: {
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
      color: Colors.text,
      flex: 1,
    },
    previewMessage: {
      fontSize: FontSizes.sm,
      color: Colors.textSecondary,
      lineHeight: 18,
    },
    footer: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      color: '#fff',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
    },
  });
