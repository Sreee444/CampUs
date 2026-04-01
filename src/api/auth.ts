import { supabase } from "./supabase";
import { Profile } from "../types/database";
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

WebBrowser.maybeCompleteAuthSession();

const isTransientNetworkError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return (
    name.includes('abort') ||
    message.includes('aborterror') ||
    message.includes('network request failed') ||
    message.includes("failed to construct 'response'") ||
    message.includes('status provided (0)') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch')
  );
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_BUCKET = 'avatars';

const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

const dedupePaths = (paths: string[]) => Array.from(new Set(paths.filter(Boolean)));

const getAvatarPathFromUrl = (avatarUrl?: string | null): string | null => {
  if (!avatarUrl) return null;

  try {
    const withoutQuery = avatarUrl.split('?')[0];
    const markers = [
      `/storage/v1/object/public/${AVATAR_BUCKET}/`,
      `/storage/v1/object/sign/${AVATAR_BUCKET}/`,
    ];

    for (const marker of markers) {
      const index = withoutQuery.indexOf(marker);
      if (index !== -1) {
        const encodedPath = withoutQuery.slice(index + marker.length);
        return decodeURIComponent(encodedPath);
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getAvatarPathCandidates = (userId: string, avatarUrl?: string | null) => {
  const fromUrl = getAvatarPathFromUrl(avatarUrl);
  const legacyPaths = AVATAR_EXTENSIONS.map((ext) => `${userId}/avatar.${ext}`);
  return dedupePaths([...(fromUrl ? [fromUrl] : []), ...legacyPaths]);
};

const base64ToArrayBuffer = (base64: string) => {
  const cleaned = base64.replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let bufferLength = Math.floor((cleaned.length * 3) / 4);
  if (cleaned.endsWith('==')) bufferLength -= 2;
  else if (cleaned.endsWith('=')) bufferLength -= 1;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arrayBuffer);
  let p = 0;

  for (let i = 0; i < cleaned.length; i += 4) {
    const encoded1 = chars.indexOf(cleaned.charAt(i));
    const encoded2 = chars.indexOf(cleaned.charAt(i + 1));
    const encoded3 = chars.indexOf(cleaned.charAt(i + 2));
    const encoded4 = chars.indexOf(cleaned.charAt(i + 3));

    const byte1 = (encoded1 << 2) | (encoded2 >> 4);
    const byte2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    const byte3 = ((encoded3 & 3) << 6) | encoded4;

    if (p < bufferLength) bytes[p++] = byte1;
    if (encoded3 !== 64 && p < bufferLength) bytes[p++] = byte2;
    if (encoded4 !== 64 && p < bufferLength) bytes[p++] = byte3;
  }

  return arrayBuffer;
};

const readImageAsArrayBuffer = async (fileUri: string) => {
  if (Platform.OS === 'web') {
    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error('Failed to read image. Please try selecting another image.');
    }
    const blob = await response.blob();
    if (blob.size > MAX_AVATAR_BYTES) {
      throw new Error('Image size must be less than 5MB. Please select a smaller image.');
    }
    return await blob.arrayBuffer();
  }

  const info = await FileSystem.getInfoAsync(fileUri, { size: true } as any) as any;
  if (info?.size && info.size > MAX_AVATAR_BYTES) {
    throw new Error('Image size must be less than 5MB. Please select a smaller image.');
  }

  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  } catch (readError: any) {
    console.error('FileSystem read error:', readError);
    throw new Error('Failed to read image. Please try selecting another image.');
  }

  return base64ToArrayBuffer(base64);
};

// Sign in with Google
export const signInWithGoogle = async () => {
  try {
    // For web, use window location
    const redirectUrl = Platform.OS === 'web'
      ? `${(typeof window !== 'undefined' ? window.location.origin : '')}/auth/callback`
      : makeRedirectUri({
        scheme: 'campus',
        path: 'auth/callback',
      });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: Platform.OS === 'web', // Don't skip on web
      },
    });

    if (error) throw error;

    // On web, the redirect happens automatically
    if (Platform.OS === 'web') {
      return data;
    }

    // On mobile, open browser for OAuth
    if (data.url) {
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === 'success') {
        const url = result.url;
        // Extract token from URL and set session
        const params = new URLSearchParams(url.split('#')[1]);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { data: sessionData, error: sessionError } =
            await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

          if (sessionError) throw sessionError;
          return sessionData;
        }
      }
    }

    return data;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
};

// Sign in existing user
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

// Sign out
export const signOut = async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
};

// Get current authenticated user
export const getCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

// Get current session
export const getCurrentSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Get user profile
export const getProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

// Update user profile
export const updateProfile = async (
  userId: string,
  updates: Partial<Profile>
) => {
  // Update only existing profile rows. Creating rows should happen server-side
  // (auth trigger/service role), otherwise client-side inserts can fail under RLS.
  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    // @ts-ignore - Supabase type inference issue until database is set up
    .update(updates)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) throw updateError;
  if (updatedProfile) return updatedProfile as Profile;

  throw new Error(
    'Profile record was not found. Ask admin to create profile rows via auth trigger (recommended) or allow profile insert policy.'
  );
};

// Reset password – sends an email with a deep-link back into the app.
export const resetPassword = async (email: string) => {
  const redirectTo =
    Platform.OS === 'web'
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/change-password`
      : 'campusapp://change-password';

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('email rate limit exceeded')) {
      throw new Error('Too many reset attempts. Please wait 60 seconds and try again.');
    }
    throw error;
  }
};

// Update password
export const updatePassword = async (newPassword: string) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) {
    throw new Error('Session expired. Please log in again.');
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
};


// Upload avatar
export const uploadAvatar = async (userId: string, fileUri: string) => {
  try {
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `avatar.${fileExt}`;
    let filePath = `${userId}/${fileName}`;

    let mimeType = 'image/jpeg';
    if (fileExt === 'png') mimeType = 'image/png';
    else if (fileExt === 'webp') mimeType = 'image/webp';
    else if (fileExt === 'gif') mimeType = 'image/gif';

    const arrayBuffer = await readImageAsArrayBuffer(fileUri);

    let { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, arrayBuffer, {
        upsert: true,
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (uploadError && /row-level security|policy/i.test(String(uploadError.message || ''))) {
      filePath = `${userId}/avatar-${Date.now()}.${fileExt}`;
      const retry = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, arrayBuffer, {
          upsert: false,
          contentType: mimeType,
          cacheControl: '3600',
        });
      uploadError = retry.error;
    }

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
        throw new Error('Storage not configured. Run supabase_storage_setup.sql and try again.');
      }
      if (uploadError.message?.includes('policy')) {
        throw new Error('Permission denied. Please check storage policies in Supabase.');
      }
      if (uploadError.message?.includes('size')) {
        throw new Error('File too large. Maximum size is 5MB.');
      }
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
    return publicUrl;

  } catch (error: any) {
    console.error('Upload avatar error:', error);
    let errorMessage = error.message || 'Failed to upload avatar';
    if (errorMessage.includes('aborted') || errorMessage.includes('signal')) {
      errorMessage = 'Upload interrupted. Check storage bucket setup and try again.';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      errorMessage = 'Network error. Please check your internet connection.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Upload timeout. Please try again.';
    }
    throw new Error(errorMessage);
  }
};

export const removeAvatar = async (userId: string, avatarUrl?: string | null) => {
  const filePaths = getAvatarPathCandidates(userId, avatarUrl);

  if (filePaths.length === 0) {
    return { storageRemoved: false, warning: 'No avatar file path found in storage.' };
  }

  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(filePaths);

  if (!error) {
    return { storageRemoved: true as const };
  }

  const message = String(error.message || '').toLowerCase();
  if (message.includes('policy') || message.includes('row-level security')) {
    return {
      storageRemoved: false as const,
      warning: 'Avatar reference will be removed, but storage file cleanup needs admin storage policy update.',
    };
  }

  if (message.includes('not found')) {
    return { storageRemoved: false as const, warning: 'Avatar file not found in storage.' };
  }

  throw error;
};
