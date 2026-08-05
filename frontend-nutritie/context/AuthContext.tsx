import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { clearLocalUserData, prepareLocalDataForUser } from '../lib/userDataCleanup';
import { sincronizeazaOnboardingLaProfil } from '../lib/onboarding';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loadingAuth: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySession = async (nextSession: Session | null, clearWhenEmpty: boolean) => {
      try {
        if (nextSession?.user) {
          await prepareLocalDataForUser(nextSession.user.id);
          await sincronizeazaOnboardingLaProfil(nextSession.user.id, supabase);
        } else if (clearWhenEmpty) {
          await clearLocalUserData();
        }
      } catch (error) {
        // Nu blocăm autentificarea, dar facem problema vizibilă în log.
        console.warn('[Auth] Izolarea datelor locale a eșuat:', error);
      }
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoadingAuth(false);
    };

    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session, !data.session))
      .catch((error) => {
        console.warn('[Auth] Obținerea sesiunii a eșuat:', error);
        if (mounted) setLoadingAuth(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      applySession(nextSession, event === 'SIGNED_OUT').catch((error) => {
        console.warn('[Auth] Aplicarea sesiunii a eșuat:', error);
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo(() => ({ session, user, loadingAuth }), [session, user, loadingAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie utilizat în interiorul unui AuthProvider');
  return context;
};
