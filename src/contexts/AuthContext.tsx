import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabase';
import { Profile } from '../types/database';
import { getCurrentUser, getProfile } from '../api/auth';
import { updateLastActive } from '../api/users';

export type AuthUser = {
  id: string;
  email?: string;
} | null;

type AuthContextValue = {
  user: AuthUser;
  profile: Profile | null;
  setUser: (user: AuthUser) => void;
  setProfile: (profile: Profile | null) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user session and profile on mount
  useEffect(() => {
    loadUserSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email });
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Update last active periodically
  useEffect(() => {
    if (user?.id) {
      updateLastActive(user.id);
      
      const interval = setInterval(() => {
        updateLastActive(user.id);
      }, 5 * 60 * 1000); // Every 5 minutes

      return () => clearInterval(interval);
    }
  }, [user?.id]);

  const loadUserSession = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser({ id: currentUser.id, email: currentUser.email });
        await loadProfile(currentUser.id);
      }
    } catch (error: any) {
      // Ignore abort errors
      if (error?.message?.includes('AbortError') || error?.name === 'AbortError') {
        return;
      }
      console.error('Error loading session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const userProfile = await getProfile(userId);
      setProfile(userProfile);
    } catch (error: any) {
      // Ignore abort errors (happens when component unmounts or request is cancelled)
      if (error?.message?.includes('AbortError') || error?.name === 'AbortError') {
        return;
      }
      console.error('Error loading profile:', error);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await loadProfile(user.id);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      setUser,
      setProfile,
      isAuthenticated: Boolean(user),
      isLoading,
      signOut: handleSignOut,
      refreshProfile,
    }),
    [user, profile, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
