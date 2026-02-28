import { supabase } from "./supabase";
import { Profile, UserRole } from "../types/database";
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

WebBrowser.maybeCompleteAuthSession();

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

// Sign up new user
export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  role: string,
  profileData?: {
    department?: string;
    specialization?: string;
    section?: 'A' | 'B' | 'C' | 'D';
    year_of_admission?: number;
    year?: number;
    semester?: number;
    batch?: string;
    roll_number?: string;
    academic_status?: 'active' | 'graduated';
    bio?: string;
    skills?: string[];
    interests?: string[];
  }
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        department: profileData?.department,
        specialization: profileData?.specialization,
        section: profileData?.section,
        year_of_admission: profileData?.year_of_admission,
        year: profileData?.year,
        semester: profileData?.semester,
        batch: profileData?.batch,
        roll_number: profileData?.roll_number,
        academic_status: profileData?.academic_status,
        bio: profileData?.bio,
        skills: profileData?.skills,
        interests: profileData?.interests,
      },
      emailRedirectTo: undefined,
    }
  });
  if (error) throw error;
  return data;
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
  const { error } = await supabase.auth.signOut();
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

// Note: Profile creation is now handled by Supabase trigger (handle_new_user)
// This function is kept for backward compatibility only
export const createProfile = async (
  userId: string,
  email: string,
  role: UserRole,
  fullName?: string
) => {
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      email,
      role,
      full_name: fullName,
    } as any) // Type assertion until database types are generated
    .select()
    .single();

  if (error) {
    console.error("Error creating profile:", error);
    throw new Error(error.message || "Failed to create profile");
  }

  return data as Profile;
};

// Get user profile
export const getProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

// Update user profile
export const updateProfile = async (
  userId: string,
  updates: Partial<Profile>
) => {
  const { data, error } = await supabase
    .from("profiles")
    // @ts-ignore - Supabase type inference issue until database is set up
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
};

// Reset password
export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
};

// Update password
export const updatePassword = async (newPassword: string) => {
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
    const filePath = `${userId}/${fileName}`;

    let mimeType = 'image/jpeg';
    if (fileExt === 'png') mimeType = 'image/png';
    else if (fileExt === 'webp') mimeType = 'image/webp';
    else if (fileExt === 'gif') mimeType = 'image/gif';

    // Use expo-file-system — response.arrayBuffer() is NOT supported in Hermes/React Native
    let base64: string;
    try {
      base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (readError: any) {
      console.error('FileSystem read error:', readError);
      throw new Error('❌ Failed to read image. Please try selecting another image.');
    }

    // Validate file size (base64.length * 0.75 ≈ raw bytes)
    if (Math.ceil(base64.length * 0.75) > 5 * 1024 * 1024) {
      throw new Error('📦 Image size must be less than 5MB. Please select a smaller image.');
    }

    const byteCharacters = atob(base64);
    const uint8Array = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      uint8Array[i] = byteCharacters.charCodeAt(i);
    }

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, uint8Array, {
        upsert: true,
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
        throw new Error('🔧 Storage not configured!\n\nPlease run the setup:\n1. Open Supabase SQL Editor\n2. Run supabase_storage_setup.sql\n3. Try uploading again');
      }
      if (uploadError.message?.includes('policy')) {
        throw new Error('🔒 Permission denied. Please check storage policies in Supabase.');
      }
      if (uploadError.message?.includes('size')) {
        throw new Error('📦 File too large. Maximum size is 5MB.');
      }
      throw new Error(`❌ Upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return publicUrl;

  } catch (error: any) {
    console.error('Upload avatar error:', error);
    let errorMessage = error.message || '❌ Failed to upload avatar';
    if (errorMessage.includes('aborted') || errorMessage.includes('signal')) {
      errorMessage = '⚠️ Upload interrupted. Check storage bucket setup and try again.';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      errorMessage = '📡 Network error. Please check your internet connection.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = '⏱️ Upload timeout. Please try again.';
    }
    throw new Error(errorMessage);
  }
};

