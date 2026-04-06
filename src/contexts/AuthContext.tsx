import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabase';
import { Profile } from '../types/database';
import { getCurrentUser, getProfile, updateProfile } from '../api/auth';
import { updateLastActive } from '../api/users';
import { updateUserStatus } from '../api/chat';
import { calculateAcademicFields } from '../utils/academic';
import { registerForPushNotifications, savePushToken } from '../api/notifications';

export type AuthUser = {
  id: string;
  email?: string;
} | null;

type AuthContextValue = {
  user: AuthUser;
  profile: Profile | null;
  isBanned: boolean;
  banReason: string | null;
  banUntil: string | null;
  banDuration: string | null;
  setUser: (user: AuthUser) => void;
  setProfile: (profile: Profile | null) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Minimum splash screen display time in milliseconds
const MINIMUM_SPLASH_TIME = 3000; // 3 seconds
const SIGN_OUT_TIMEOUT_MS = 2500;
const SIGN_OUT_EVENT_GUARD_MS = 4000;

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [banUntil, setBanUntil] = useState<string | null>(null);
  const [banDuration, setBanDuration] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const isSigningOutRef = useRef(false);
  const signOutGuardUntilRef = useRef(0);

  const formatDuration = (ms: number) => {
    const totalHours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
    if (totalHours >= 24) {
      const days = Math.round(totalHours / 24);
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return `${totalHours} hour${totalHours === 1 ? '' : 's'}`;
  };

  // Load user session and profile on mount
  useEffect(() => {
    loadUserSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (__DEV__) {
          console.log('[AuthContext] onAuthStateChange', {
            event,
            hasSession: Boolean(session),
            userId: session?.user?.id || null,
          });
        }

        // During sign-out, ignore transient SIGNED_IN/TOKEN_REFRESHED events
        // that can race in on slow networks before SIGNED_OUT lands.
        if (
          isSigningOutRef.current &&
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
          Date.now() < signOutGuardUntilRef.current
        ) {
          if (__DEV__) {
            console.log('[AuthContext] Ignoring auth event during sign-out', { event });
          }
          return;
        }

        // When user clicks the password reset email link, Supabase fires PASSWORD_RECOVERY.
        // Flag this so the RootNavigator can route to ChangePassword instead of MainTabs.
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
          if (session?.user) {
            setUser({ id: session.user.id, email: session.user.email });
          }
          const elapsedTime = Date.now() - startTimeRef.current;
          const remainingTime = Math.max(0, MINIMUM_SPLASH_TIME - elapsedTime);
          setTimeout(() => setIsLoading(false), remainingTime);
          return;
        }

        if (session?.user) {
          setIsPasswordRecovery(false);
          setUser({ id: session.user.id, email: session.user.email });
          await loadProfile(session.user.id);
        } else {
          setIsPasswordRecovery(false);
          setUser(null);
          setProfile(null);
          setIsBanned(false);
          setBanReason(null);
          setBanUntil(null);
          setBanDuration(null);
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

  // Update last active periodically + register push token
  useEffect(() => {
    if (user?.id) {
      updateLastActive(user.id);

      // Register and save push notification token so server can send notifications
      registerForPushNotifications().then((token: string | null) => {
        if (token && user?.id) savePushToken(user.id, token);
      }).catch(() => { /* notifications not granted */ });

      const interval = setInterval(() => {
        updateLastActive(user.id);
      }, 5 * 60 * 1000); // Every 5 minutes

      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // Keep authenticated user profile in sync with realtime updates.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          loadProfile(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Keep ban state in sync with realtime updates.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user_bans:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_bans',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadProfile(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Fallback polling for ban/profile state in case realtime subscriptions are delayed or blocked.
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      loadProfile(user.id);
    }, 15000);

    return () => clearInterval(interval);
  }, [user?.id]);

  const getActiveBanForUser = async (userId: string): Promise<{
    active: { reason: string; until: string | null; duration: string | null } | null;
    lookupFailed: boolean;
  }> => {
    const { data, error } = await supabase
      .from('user_bans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { active: null, lookupFailed: true };
    }

    const rows = data || [];
    const active = rows.find((ban: any) => {
      const until = ban?.banned_until ?? ban?.ban_until ?? null;
      if (ban?.is_permanent === true) return true;
      if (!until) return false;
      const untilTs = new Date(until).getTime();
      return !Number.isNaN(untilTs) && untilTs > Date.now();
    }) as any;

    if (!active) return { active: null, lookupFailed: false };

    const until = active.banned_until ?? active.ban_until ?? null;
    let duration: string | null = null;
    if (active?.is_permanent === true) {
      duration = 'Permanent';
    } else if (until) {
      const untilMs = new Date(until).getTime();
      const createdMs = new Date(active.created_at).getTime();
      if (!Number.isNaN(untilMs) && !Number.isNaN(createdMs) && untilMs > createdMs) {
        duration = formatDuration(untilMs - createdMs);
      }
    }

    return {
      active: {
        reason: active.reason || 'Your account has been suspended by an administrator.',
        until,
        duration,
      },
      lookupFailed: false,
    };
  };

  const loadUserSession = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser({ id: currentUser.id, email: currentUser.email });
        await loadProfile(currentUser.id);
      }
    } catch (error: any) {
      // Ignore abort errors
      if (isTransientNetworkError(error)) {
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
        setIsBanned(false);
        setBanReason(null);
        setBanUntil(null);
        setBanDuration(null);
        return;
      }

      const { active: activeBan, lookupFailed } = await getActiveBanForUser(userId);

      // If ban lookup succeeds, active ban rows are the source of truth.
      // This prevents expired temporary bans from keeping users blocked via stale profile flags.
      const suspended = lookupFailed ? Boolean(userProfile.is_suspended) : Boolean(activeBan);
      setIsBanned(suspended);
      setBanReason(activeBan?.reason ?? (suspended ? 'Your account has been suspended by an administrator.' : null));
      setBanUntil(activeBan?.until ?? null);
      setBanDuration(activeBan?.duration ?? null);

      if (!lookupFailed) {
        const shouldSuspendFlag = Boolean(activeBan);
        if (Boolean(userProfile.is_suspended) !== shouldSuspendFlag) {
          const syncedProfile = await updateProfile(userId, { is_suspended: shouldSuspendFlag });
          setProfile(syncedProfile);
          return;
        }
      }

      if (userProfile.year_of_admission) {
        const computed = calculateAcademicFields(userProfile.year_of_admission, userProfile.department);
        const needsAcademicRefresh =
          userProfile.semester !== computed.semester ||
          userProfile.year !== computed.year ||
          userProfile.academic_status !== computed.academic_status;

        if (needsAcademicRefresh) {
          const updatedProfile = await updateProfile(userId, {
            semester: computed.semester ?? undefined,
            year: computed.year ?? undefined,
            academic_status: computed.academic_status,
          });
          setProfile(updatedProfile);
          return;
        }
      }

      setProfile(userProfile);
    } catch (error: any) {
      // Ignore abort errors (happens when component unmounts or request is cancelled)
      if (isTransientNetworkError(error)) {
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
    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    try {
      isSigningOutRef.current = true;
      signOutGuardUntilRef.current = Date.now() + SIGN_OUT_EVENT_GUARD_MS;

      if (__DEV__) {
        console.log('[AuthContext] signOut start', {
          userId: user?.id || null,
          isPasswordRecovery,
        });
      }
      if (user?.id) {
        try {
          await withTimeout(updateUserStatus(user.id, 'offline'), SIGN_OUT_TIMEOUT_MS, 'updateUserStatus');
        } catch (statusError: any) {
          // Never block logout on optional presence updates.
          if (statusError?.code !== 'PGRST116' && !isTransientNetworkError(statusError)) {
            console.warn('Failed to update user status during sign out:', statusError);
          }
        }
      }
      // Do not wrap signOut in a short timeout. On slower networks, 2.5s is
      // too aggressive and causes false failures + auth bounce-back.
      await supabase.auth.signOut({ scope: 'local' });
      if (__DEV__) {
        console.log('[AuthContext] signOut supabase call resolved');
      }
    } catch (error: any) {
      // Ignore abort errors (common on web during hot reload)
      if (isTransientNetworkError(error)) {
        console.warn('Transient sign out error. Clearing local auth state anyway.');
      } else {
        console.error('Error signing out:', error);
      }
    } finally {
      // Always clear local auth state so the app can recover and route to Login.
      if (__DEV__) {
        console.log('[AuthContext] signOut finally: clearing local auth state');
      }
      setIsPasswordRecovery(false);
      setUser(null);
      setProfile(null);
      setIsBanned(false);
      setBanReason(null);
      setBanUntil(null);
      setBanDuration(null);

      setTimeout(() => {
        isSigningOutRef.current = false;
      }, SIGN_OUT_EVENT_GUARD_MS);
    }
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      isBanned,
      banReason,
      banUntil,
      banDuration,
      setUser,
      setProfile,
      isAuthenticated: Boolean(user),
      isLoading,
      isPasswordRecovery,
      signOut: handleSignOut,
      refreshProfile,
    }),
    [user, profile, isBanned, banReason, banUntil, banDuration, isLoading, isPasswordRecovery]
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
