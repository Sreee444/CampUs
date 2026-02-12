import { supabase } from "./supabase";
import { Profile, UserRole } from "../types/database";
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Sign in with Google
export const signInWithGoogle = async () => {
  try {
    // For web, use window location
    const redirectUrl = Platform.OS === 'web' 
      ? `${window.location.origin}/auth/callback`
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
export const signUp = async (email: string, password: string, fullName: string, role: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role },
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
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
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
    .update(updates)
    .eq("id", userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
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
    // For React Native, we need to handle the file differently
    // Create FormData for better React Native compatibility
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `avatar.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    
    // Determine mime type
    let mimeType = 'image/jpeg';
    if (fileExt === 'png') mimeType = 'image/png';
    else if (fileExt === 'webp') mimeType = 'image/webp';
    
    // Read file as blob using fetch
    let blob: Blob;
    try {
      const response = await fetch(fileUri);
      if (!response.ok) {
        throw new Error(`Failed to read image file: ${response.statusText}`);
      }
      blob = await response.blob();
    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError);
      throw new Error('Failed to read image. Please try again.');
    }
    
    // Validate file size (max 5MB)
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be less than 5MB');
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (blob.type && !allowedTypes.includes(blob.type)) {
      throw new Error('Only JPG, PNG, and WebP images are allowed');
    }

    const { data, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(uploadError.message || 'Failed to upload to storage');
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error: any) {
    console.error('Upload avatar error:', error);
    throw error;
  }
};


