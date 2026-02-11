import { supabase } from "./supabase";
import { Profile, UserRole } from "../types/database";

// Sign up new user
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
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

// Create user profile after signup
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
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const fileExt = fileUri.split('.').pop();
  const fileName = `${userId}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, blob, {
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return publicUrl;
};

// Track user activity
export const trackActivity = async (userId: string, activityType: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { error } = await supabase
    .from('user_engagement')
    .upsert({
      user_id: userId,
      activity_type: activityType,
      activity_date: today,
      activity_count: 1,
    }, {
      onConflict: 'user_id,activity_type,activity_date',
      ignoreDuplicates: false,
    });
  
  if (error) console.error('Activity tracking error:', error);
};
