import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { getColors, Spacing, BorderRadius, FontSizes, FontWeights } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Toast } from '../../components/Toast';
import { updateProfile, uploadAvatar } from '../../api/auth';
import * as ImagePicker from 'expo-image-picker';

type EditProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditProfile'>;

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
  saveButton: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    paddingHorizontal: 8,
  },
  scrollView: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: Colors.surface,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: FontWeights.bold,
    color: '#ffffff',
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changePhotoText: {
    fontSize: FontSizes.md,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  form: {
    padding: Spacing.md,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  disabledInput: {
    opacity: 0.5,
  },
  helperText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
});

export default function EditProfileScreen() {
  const navigation = useNavigation<EditProfileScreenNavigationProp>();
  const { isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const Colors = getColors(isDark);
  const styles = createStyles(Colors);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [department, setDepartment] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'info' | 'warning' | 'error' }>({ visible: false, message: '', type: 'success' });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setDepartment(profile.department || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Permission required to access photos', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await handleUploadAvatar(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Camera permission required', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await handleUploadAvatar(result.assets[0].uri);
    }
  };

  const handleUploadAvatar = async (uri: string) => {
    if (!user) return;

    try {
      setIsUploading(true);
      const publicUrl = await uploadAvatar(user.id, uri);
      setAvatarUrl(publicUrl);
      setToast({ visible: true, message: 'Avatar uploaded!', type: 'success' });
    } catch (error: any) {
      console.error('Avatar upload error:', error);
      
      let errorMsg = 'Failed to upload avatar';
      if (error.message?.includes('Network request failed')) {
        errorMsg = 'Network error. Check your internet connection.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setToast({ visible: true, message: errorMsg, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!fullName.trim()) {
      setToast({ visible: true, message: 'Name is required', type: 'error' });
      return;
    }

    try {
      setIsLoading(true);
      await updateProfile(user.id, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
        department: department.trim(),
        avatar_url: avatarUrl,
      });

      await refreshProfile();
      setToast({ visible: true, message: 'Profile updated successfully!', type: 'success' });
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error: any) {
      console.error('Profile update error:', error);
      setToast({ visible: true, message: error.message || 'Failed to update profile', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = () => {
    if (!fullName) return 'U';
    const parts = fullName.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.saveButton}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
            <TouchableOpacity style={styles.changePhotoButton} onPress={handlePickImage} disabled={isUploading}>
              {isUploading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <MaterialIcons name="photo-library" size={20} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Gallery</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.changePhotoButton} onPress={handleTakePhoto} disabled={isUploading}>
              <>
                <MaterialIcons name="camera-alt" size={20} color={Colors.primary} />
                <Text style={styles.changePhotoText}>Camera</Text>
              </>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your name"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={email}
              editable={false}
              placeholder="Enter your email"
              placeholderTextColor={Colors.textSecondary}
            />
            <Text style={styles.helperText}>Email cannot be changed</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Department</Text>
            <TextInput
              style={styles.input}
              value={department}
              onChangeText={setDepartment}
              placeholder="e.g., Computer Science"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter your phone"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>
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
