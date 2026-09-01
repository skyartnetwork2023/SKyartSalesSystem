import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AccountNotice = { type: 'success' | 'error' | 'info'; text: string };

const ACCOUNT_NOTICE_DICTIONARY: Record<string, AccountNotice> = {
  'email-change-success': {
    type: 'success',
    text: 'Email updated successfully. Sign in with the new address next time.',
  },
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; message?: string }>;
  signOut: () => Promise<void>;
  accountNotice: AccountNotice | null;
  pushAccountNotice: (notice: AccountNotice) => void;
  dismissAccountNotice: () => void;
  passwordRecoveryActive: boolean;
  exitPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [accountNotice, setAccountNotice] = useState<AccountNotice | null>(null);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);

  const pushAccountNotice = useCallback((notice: AccountNotice) => {
    setAccountNotice(notice);
  }, []);

  const dismissAccountNotice = useCallback(() => {
    setAccountNotice(null);
  }, []);

  const exitPasswordRecovery = useCallback(() => {
    setPasswordRecoveryActive(false);
  }, []);

  useEffect(() => {
    const clearUrlHash = () => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if (!url.hash) return;
      url.hash = '';
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    };

    const consumeNoticesFromUrl = () => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      const searchParams = url.searchParams;
      let mutated = false;

      const noticeKey = searchParams.get('account_notice');
      if (noticeKey) {
        const mapped = ACCOUNT_NOTICE_DICTIONARY[noticeKey];
        if (mapped) {
          setAccountNotice(mapped);
        }
        searchParams.delete('account_notice');
        mutated = true;
      }

      const errorDescription = searchParams.get('error_description');
      if (errorDescription) {
        setAccountNotice({ type: 'error', text: errorDescription });
        searchParams.delete('error_description');
        mutated = true;
      }

      if (mutated) {
        const nextSearch = searchParams.toString();
        const replacement = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
        window.history.replaceState({}, document.title, replacement);
      }
    };

    const resumeSessionFromHash = async () => {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash;
      if (!hash || (!hash.includes('access_token') && !hash.includes('type=recovery'))) {
        return;
      }

      try {
        setAuthLoading(true);
        const { error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
        if (error) {
          throw error;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to resume your secure link. Please request a fresh email.';
        setAccountNotice({ type: 'error', text: message });
      } finally {
        clearUrlHash();
        setAuthLoading(false);
      }
    };

    consumeNoticesFromUrl();
    void resumeSessionFromHash();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (_event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryActive(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) return { error };

      if (data.user) {
        // Ensure Supabase RLS policies allow auth.uid() = id inserts/updates on profiles.
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: data.user.id,
              email,
              full_name: fullName,
              avatar_url: null,
            },
            { onConflict: 'id' }
          )
          .select()
          .maybeSingle();

        if (profileError) {
          return { error: profileError };
        }
      }

      const needsEmailConfirmation = !data.session;
      return {
        error: null,
        message: needsEmailConfirmation ? 'Check your email to confirm your account before signing in.' : undefined,
      };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthLoading(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setAuthLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authLoading,
        signIn,
        signUp,
        signOut,
        accountNotice,
        pushAccountNotice,
        dismissAccountNotice,
        passwordRecoveryActive,
        exitPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
