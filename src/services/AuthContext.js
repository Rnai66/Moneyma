import React, { createContext, useContext, useState, useEffect } from 'react';
import SupabaseService from './SupabaseService';

const AuthContext = createContext();
const DEV_BYPASS_STORAGE_KEY = 'devAuthBypass';
const DEV_BYPASS_ENABLED = process.env.NODE_ENV === 'development' && process.env.REACT_APP_ENABLE_DEV_AUTH_BYPASS === 'true';

function createDevBypassUser() {
  return {
    id: process.env.REACT_APP_DEV_BYPASS_USER_ID || 'dev-bypass-user',
    email: process.env.REACT_APP_DEV_BYPASS_EMAIL || 'dev@moneyma.local',
    aud: 'authenticated',
    app_metadata: { provider: 'dev-bypass' },
    user_metadata: {
      firstName: 'Dev',
      lastName: 'User',
    },
  };
}

function getStoredDevBypassState() {
  if (!DEV_BYPASS_ENABLED || typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DEV_BYPASS_STORAGE_KEY) === 'true';
}

export const AuthProvider = ({ children }) => {
  const [isDevBypassActive, setIsDevBypassActive] = useState(getStoredDevBypassState);
  const [user, setUser] = useState(() => (getStoredDevBypassState() ? createDevBypassUser() : null));
  const [session, setSession] = useState(() => (getStoredDevBypassState() ? { user: createDevBypassUser() } : null));
  const [userProfile, setUserProfile] = useState(() => (getStoredDevBypassState() ? { tier: 'free' } : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRecovery, setIsRecovery] = useState(false);

  const fetchProfile = async (userId) => {
    try {
      const { profile } = await SupabaseService.getUserProfile(userId);
      setUserProfile(profile || { tier: 'free' });
    } catch (e) {
      setUserProfile({ tier: 'free' });
    }
  };

  useEffect(() => {
    if (isDevBypassActive) {
      setLoading(false);
      return undefined;
    }

    // Detect password recovery from URL hash (for web/mobile deep link redirects)
    const detectRecoveryFromUrl = () => {
      const hash = window.location.hash;
      const search = window.location.search;
      const combined = hash + search;
      if (combined.includes('type=recovery') || combined.includes('access_token')) {
        // Parse token out of hash or query params
        const params = new URLSearchParams(
          hash.startsWith('#') ? hash.slice(1) : search.slice(1)
        );
        const type = params.get('type');
        if (type === 'recovery') {
          setIsRecovery(true);
          return true;
        }
      }
      return false;
    };

    const foundRecovery = detectRecoveryFromUrl();

    // Check current session on mount
    const checkSession = async () => {
      try {
        // Detect and display any OAuth error returning in URL
        const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '');
        const searchParams = new URLSearchParams(window.location.search);
        const oauthErrorDesc = hashParams.get('error_description') || searchParams.get('error_description') || hashParams.get('error') || searchParams.get('error');
        if (oauthErrorDesc) {
          const readableError = decodeURIComponent(oauthErrorDesc.replace(/\+/g, ' '));
          console.error('OAuth URL error detected:', readableError);
          setError(readableError);
          window.history.replaceState({}, document.title, window.location.pathname);
          setLoading(false);
          return;
        }

        if (foundRecovery) {
          const { session: recoverySession, error: recoveryError } = await SupabaseService.establishRecoverySessionFromUrl();
          if (recoveryError) throw recoveryError;

          if (recoverySession?.user) {
            setUser(recoverySession.user);
            setSession(recoverySession);
            setIsRecovery(true);
            await fetchProfile(recoverySession.user.id);
            return;
          }
        }

        const { session: currentSession, error: sessionError } = await SupabaseService.getSession();
        if (sessionError) throw sessionError;

        if (currentSession?.user) {
          setUser(currentSession.user);
          setSession(currentSession);
          await fetchProfile(currentSession.user.id);
          // If the session type is recovery, flag it
          if (currentSession.user?.aud === 'authenticated' && foundRecovery) {
            setIsRecovery(true);
          }
        }
      } catch (err) {
        console.error('Session check error:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Subscribe to auth state changes
    const subscription = SupabaseService.getClient().auth.onAuthStateChange(
      (event, currentSession) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecovery(true);
        }
        if (currentSession?.user) {
          setUser(currentSession.user);
          setSession(currentSession);
          setError(null);
          // Only fetch if profile is not loaded or user changed
          fetchProfile(currentSession.user.id);
        } else {
          setUser(null);
          setSession(null);
          setUserProfile(null);
        }
      }
    );

    return () => {
      if (subscription?.data?.subscription) {
        subscription.data.subscription.unsubscribe();
      } else if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, [isDevBypassActive]);

  const signUp = async (email, password, metadata = {}) => {
    try {
      setError(null);
      const { user: newUser, session: newSession, error: signUpError } = await SupabaseService.signUp(
        email,
        password,
        metadata
      );

      if (signUpError) throw signUpError;

      setIsDevBypassActive(false);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
      }
      setUser(newUser);
      setSession(newSession);
      await fetchProfile(newUser.id);
      return { user: newUser, error: null };
    } catch (err) {
      setError(err);
      return { user: null, error: err };
    }
  };

  const signIn = async (email, password) => {
    try {
      setError(null);
      const { user: signinUser, session: signinSession, error: signInError } = await SupabaseService.signIn(
        email,
        password
      );

      if (signInError) throw signInError;

      setIsDevBypassActive(false);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
      }
      setUser(signinUser);
      setSession(signinSession);
      await fetchProfile(signinUser.id);
      return { user: signinUser, error: null };
    } catch (err) {
      setError(err);
      return { user: null, error: err };
    }
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);
      const { error: googleError } = await SupabaseService.signInWithGoogle();
      if (googleError) throw googleError;
      return { error: null };
    } catch (err) {
      setError(err);
      return { error: err };
    }
  };

  const signInWithApple = async () => {
    try {
      setError(null);
      const { data, error: appleError } = await SupabaseService.signInWithApple();
      if (appleError) throw appleError;

      if (data?.session) {
        setUser(data.session.user);
        setSession(data.session);
        await fetchProfile(data.session.user.id);
      }
      return { error: null };
    } catch (err) {
      setError(err);
      return { error: err };
    }
  };

  const signOut = async () => {
    try {
      setError(null);

      if (isDevBypassActive) {
        setUser(null);
        setSession(null);
        setUserProfile(null);
        setIsRecovery(false);
        setIsDevBypassActive(false);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
        }
        return { error: null };
      }

      // Optimistically clear auth states immediately so UI is instantaneous (< 50ms)
      setUser(null);
      setSession(null);
      setUserProfile(null);
      setIsRecovery(false);

      const { error: signOutError } = await SupabaseService.signOut();
      if (signOutError) {
        console.warn('Supabase sign out notice:', signOutError);
      }

      return { error: null };
    } catch (err) {
      console.error('Sign out error:', err);
      // Guarantee local auth state is reset regardless of error
      setUser(null);
      setSession(null);
      setUserProfile(null);
      setIsRecovery(false);
      return { error: null };
    }
  };

  const enableDevBypass = async () => {
    if (!DEV_BYPASS_ENABLED) {
      return { error: new Error('Dev auth bypass is disabled.') };
    }

    const bypassUser = createDevBypassUser();
    setError(null);
    setUser(bypassUser);
    setSession({ user: bypassUser });
    setUserProfile({ tier: 'free' });
    setIsRecovery(false);
    setIsDevBypassActive(true);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEV_BYPASS_STORAGE_KEY, 'true');
    }

    return { user: bypassUser, error: null };
  };

  const resetPassword = async (email) => {
    try {
      setError(null);
      const { error: resetError } = await SupabaseService.resetPassword(email);

      if (resetError) throw resetError;

      return { error: null };
    } catch (err) {
      setError(err);
      return { error: err };
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      setError(null);
      const { error: updateError } = await SupabaseService.updatePassword(newPassword);

      if (updateError) throw updateError;

      return { error: null };
    } catch (err) {
      setError(err);
      return { error: err };
    }
  };

  const upgradeToPro = async () => {
    if (!user) return { error: 'Not logged in' };
    try {
      const { error } = await SupabaseService.updateUserProfile(user.id, { tier: 'pro' });
      if (error && error.code !== 'PGRST116') {
        // If row didn't exist, we might need to insert it but SupabaseService.updateUserProfile handles it?
        // Actually SupabaseService uses update. If it fails, we fall back to local state.
      }
      setUserProfile({ ...userProfile, tier: 'pro' });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  };

  const isPro = userProfile?.tier === 'pro';

  const value = {
    user,
    session,
    userProfile,
    isPro,
    isRecovery,
    loading,
    error,
    isAuthenticated: !!user,
    isDevBypassEnabled: DEV_BYPASS_ENABLED,
    isDevBypassActive,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signOut,
    enableDevBypass,
    resetPassword,
    updatePassword,
    upgradeToPro,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
