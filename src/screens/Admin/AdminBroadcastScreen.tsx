import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, Platform, ActivityIndicator, Modal, Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { sendBroadcastMessage, getRecipientCount } from '../../api/admin';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../api/supabase';
import Toast from 'react-native-toast-message';

const TARGET_ROLES = [
  { label: 'Everyone', value: 'all' },
  { label: 'Students', value: 'student' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Alumni', value: 'alumni' },
  { label: 'Admins', value: 'admin' },
];

export default function AdminBroadcastScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState('all');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isCropped, setIsCropped] = useState(false);

  // Fetch recipient count when role changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingCount(true);
      try {
        const count = await getRecipientCount(targetRole === 'all' ? undefined : targetRole);
        if (!cancelled) setRecipientCount(count);
      } catch {
        if (!cancelled) setRecipientCount(null);
      } finally {
        if (!cancelled) setIsLoadingCount(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [targetRole]);

  const uploadImage = async (uri: string) => {
    setImageUri(uri);
    setImageUrl(null);
    setIsUploadingImage(true);
    try {
      const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
      const fileName = `broadcast/${Date.now()}.${ext}`;
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      // Read as base64 (works in Hermes / React Native)
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64' as any,
      });

      // Decode base64 → Uint8Array
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }

      const { error } = await (supabase.storage as any)
        .from('broadcast-images')
        .upload(fileName, byteArray, { contentType, upsert: true });
      if (error) throw error;

      const { data: urlData } = (supabase.storage as any)
        .from('broadcast-images')
        .getPublicUrl(fileName);
      setImageUrl(urlData?.publicUrl ?? null);
      Toast.show({ type: 'success', text1: 'Image uploaded' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Image upload failed', text2: err?.message });
      setImageUri(null);
      setImageUrl(null);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Step 1: Pick full image — no forced crop
  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission required to access photos' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setIsCropped(false);
    await uploadImage(result.assets[0].uri);
  };

  // Step 2 (optional): Crop the already-selected image
  const handleCropImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,   // shows crop editor
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setIsCropped(true);
    await uploadImage(result.assets[0].uri);
  };

  const handleSend = async () => {
    if (!user?.id) return;
    if (!title.trim()) { Toast.show({ type: 'error', text1: 'Title is required' }); return; }
    if (!message.trim()) { Toast.show({ type: 'error', text1: 'Message is required' }); return; }
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    if (!user?.id) return;
    setShowConfirm(false);
    setIsSending(true);
    try {
      const result = await sendBroadcastMessage(
        user.id,
        title.trim(),
        message.trim(),
        targetRole === 'all' ? undefined : targetRole,
        imageUrl ?? undefined,
      );
      Toast.show({
        type: 'success',
        text1: 'Broadcast sent!',
        text2: `Delivered to ${result.recipient_count} recipients`,
      });
      setTitle('');
      setMessage('');
      setImageUri(null);
      setImageUrl(null);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to send', text2: err?.message });
    } finally {
      setIsSending(false);
    }
  };

  const canSend = title.trim().length > 0 && message.trim().length > 0 && !isSending && !isUploadingImage;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: Colors.text }]}>Broadcast Center</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Target Audience */}
        <Text style={[styles.label, { color: Colors.text }]}>Target Audience</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
          {TARGET_ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.roleChip, targetRole === r.value && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
              onPress={() => setTargetRole(r.value)}
            >
              <Text style={[styles.roleChipText, { color: targetRole === r.value ? '#fff' : Colors.text }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recipient count preview */}
        <View style={[styles.recipientRow, { backgroundColor: Colors.surface }]}>
          <MaterialIcons name="people" size={18} color={Colors.primary} />
          {isLoadingCount
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text style={[styles.recipientText, { color: Colors.text }]}>
              {recipientCount !== null ? `~${recipientCount} recipients` : 'Could not load count'}
            </Text>
          }
        </View>

        {/* Title */}
        <Text style={[styles.label, { color: Colors.text }]}>Subject / Title *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.surface, color: Colors.text, borderColor: Colors.border }]}
          placeholder="Announcement title..."
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />
        <Text style={[styles.charCount, { color: Colors.textSecondary }]}>{title.length}/120</Text>

        {/* Message */}
        <Text style={[styles.label, { color: Colors.text }]}>Message *</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: Colors.surface, color: Colors.text, borderColor: Colors.border }]}
          placeholder="Write the broadcast message..."
          placeholderTextColor={Colors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={600}
        />
        <Text style={[styles.charCount, { color: Colors.textSecondary }]}>{message.length}/600</Text>

        {/* Image (optional) */}
        <Text style={[styles.label, { color: Colors.text }]}>Image (optional)</Text>

        {/* After picking, show Crop / Remove action bar */}
        {imageUri && !isUploadingImage && (
          <View style={[styles.imageActionBar, { backgroundColor: Colors.surface }]}>
            <TouchableOpacity style={styles.imageActionBtn} onPress={handleCropImage}>
              <MaterialIcons name="crop" size={16} color={Colors.primary} />
              <Text style={[styles.imageActionText, { color: Colors.primary }]}>
                {isCropped ? 'Re-crop' : 'Crop image'}
              </Text>
            </TouchableOpacity>
            <View style={[styles.imageActionDivider, { backgroundColor: Colors.border }]} />
            <TouchableOpacity
              style={styles.imageActionBtn}
              onPress={() => { setImageUri(null); setImageUrl(null); setIsCropped(false); }}
            >
              <MaterialIcons name="delete-outline" size={16} color="#ef4444" />
              <Text style={[styles.imageActionText, { color: '#ef4444' }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.imagePicker, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
          onPress={imageUri ? undefined : handlePickImage}
          disabled={isUploadingImage}
          activeOpacity={imageUri ? 1 : 0.7}
        >
          {imageUri ? (
            <>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
              {isUploadingImage && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.uploadText}>Uploading…</Text>
                </View>
              )}
              {!isUploadingImage && imageUrl && (
                <View style={styles.uploadedBadge}>
                  <MaterialIcons name="check-circle" size={20} color="#10b981" />
                  <Text style={styles.uploadedBadgeText}>
                    {isCropped ? 'Cropped & Uploaded' : 'Uploaded (full)'}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialIcons name="add-photo-alternate" size={32} color={Colors.textSecondary} />
              <Text style={[styles.imagePlaceholderText, { color: Colors.textSecondary }]}>
                Tap to select an image
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {isSending
            ? <ActivityIndicator color="#111818" />
            : <>
              <MaterialIcons name="send" size={20} color="#111818" />
              <Text style={styles.sendBtnText}>Preview & Send</Text>
            </>
          }
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: Colors.surface }]}>
            <MaterialIcons name="notification-important" size={36} color={Colors.primary} style={{ alignSelf: 'center' }} />
            <Text style={[styles.modalTitle, { color: Colors.text }]}>Send Broadcast?</Text>

            <View style={[styles.modalPreview, { backgroundColor: Colors.background }]}>
              <Text style={[styles.modalPreviewLabel, { color: Colors.textSecondary }]}>Target</Text>
              <Text style={[styles.modalPreviewValue, { color: Colors.text }]}>
                {TARGET_ROLES.find(r => r.value === targetRole)?.label ?? 'Everyone'} · {recipientCount ?? '?'} recipients
              </Text>
              <Text style={[styles.modalPreviewLabel, { color: Colors.textSecondary }]}>Subject</Text>
              <Text style={[styles.modalPreviewValue, { color: Colors.text }]}>{title}</Text>
              <Text style={[styles.modalPreviewLabel, { color: Colors.textSecondary }]}>Message</Text>
              <Text style={[styles.modalPreviewValue, { color: Colors.text }]} numberOfLines={3}>{message}</Text>
              {imageUrl && <Text style={[styles.modalPreviewLabel, { color: '#10b981' }]}>📎 Image attached</Text>}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: Colors.border, borderWidth: 1 }]}
                onPress={() => setShowConfirm(false)}
              >
                <Text style={[styles.modalBtnText, { color: Colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={confirmSend}>
                <Text style={[styles.modalBtnText, { color: '#111818' }]}>Send Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (Colors: any) => StyleSheet.create({
  container: { flex: 1, ...(Platform.OS === 'web' && { height: '100vh', width: '100vw' } as any) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  scroll: { flex: 1, padding: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  roleScroll: { marginBottom: 10 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginRight: 8 },
  roleChipText: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: BorderRadius.lg, marginBottom: 10 },
  recipientText: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  input: { borderRadius: BorderRadius.lg, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSizes.md },
  textArea: { height: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4 },
  imagePicker: { borderRadius: BorderRadius.lg, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden', minHeight: 120 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8 },
  imagePlaceholderText: { fontSize: FontSizes.sm },
  previewImage: { width: '100%', height: 160 },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadText: { color: '#fff', fontSize: FontSizes.sm },
  uploadedBadge: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  uploadedBadgeText: { fontSize: FontSizes.xs, color: '#10b981', fontWeight: '600' },
  removeImage: { alignItems: 'flex-end', marginTop: 6 },
  sendBtn: { backgroundColor: Colors.primary ?? '#13ecec', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: BorderRadius.lg, marginTop: 24 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: '#111818' },
  imageActionBar: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, marginBottom: 8, overflow: 'hidden' },
  imageActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  imageActionText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  imageActionDivider: { width: 1, height: '60%' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { borderRadius: BorderRadius.xl, padding: 20, width: '100%', gap: 12 },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, textAlign: 'center' },
  modalPreview: { borderRadius: BorderRadius.lg, padding: 14, gap: 4 },
  modalPreviewLabel: { fontSize: FontSizes.xs, fontWeight: '600', marginTop: 6 },
  modalPreviewValue: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.lg, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: Colors.primary ?? '#13ecec' },
  modalBtnText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
});
