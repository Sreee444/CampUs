import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabase';
import { Profile } from '../types/database';
import { getCurrentUser, getProfile, updateProfile } from '../api/auth';
import { updateLastActive } from '../api/users';
import { calculateAcademicFields } from '../utils/academic';

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

// Minimum splash screen display time in milliseconds
const MINIMUM_SPLASH_TIME = 3000; // 3 seconds

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const startTimeRef = React.useRef<number>(Date.now());

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
        // Ensure minimum splash time before hiding
        const elapsedTime = Date.now() - startTimeRef.current;
        const remainingTime = Math.max(0, MINIMUM_SPLASH_TIME - elapsedTime);
        setTimeout(() => setIsLoading(false), remainingTime);
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
      // Ensure minimum splash time before hiding
      const elapsedTime = Date.now() - startTimeRef.current;
      const remainingTime = Math.max(0, MINIMUM_SPLASH_TIME - elapsedTime);
      setTimeout(() => setIsLoading(false), remainingTime);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const userProfile = await getProfile(userId);
      if (!userProfile) {
        setProfile(null);
        return;
      }

      if (userProfile.year_of_admission) {
        const computed = calculateAcademicFields(userProfile.year_of_admission);
        const needsAcademicRefresh =
          userProfile.semester !== computed.semester ||
          userProfile.year !== computed.year ||
          userProfile.batch !== computed.batch ||
          userProfile.academic_status !== computed.academic_status;

        if (needsAcademicRefresh) {
          const updatedProfile = await updateProfile(userId, {
            semester: computed.semester ?? undefined,
            year: computed.year ?? undefined,
            batch: computed.batch ?? undefined,
            academic_status: computed.academic_status,
          });
          setProfile(updatedProfile);
          return;
        }
      }

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
    } catch (error: any) {
      // Ignore abort errors (common on web during hot reload)
      if (error?.message?.includes('AbortError') || error?.message?.includes('aborted') || error?.name === 'AbortError') {
        return;
      }
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
