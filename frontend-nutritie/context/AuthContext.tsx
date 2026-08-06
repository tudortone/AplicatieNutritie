import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { clearLocalUserData, prepareLocalDataForUser } from '../lib/userDataCleanup';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loadingAuth: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function codEroareSigur(error: unknown): string {
  if (error instanceof Error) return error.name;
  return 'EROARE_NECUNOSCUTA';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const generatieRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const applySession = async (
      nextSession: Session | null,
      clearWhenEmpty: boolean,
      generatie: number,
    ) => {
      try {
        if (nextSession?.user?.id) {
          await prepareLocalDataForUser(nextSession.user.id);
        } else if (clearWhenEmpty) {
          await clearLocalUserData();
        }
      } catch (error: unknown) {
        console.warn('[Auth] Izolarea datelor locale a eșuat:', codEroareSigur(error));
      }

      if (!mounted || generatieRef.current !== generatie) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoadingAuth(false);
    };

    const generatieInitiala = ++generatieRef.current;
    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session, !data.session, generatieInitiala))
      .catch((error: unknown) => {
        console.warn('[Auth] Obținerea sesiunii a eșuat:', codEroareSigur(error));
        if (mounted && generatieRef.current === generatieInitiala) setLoadingAuth(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const generatie = ++generatieRef.current;
      void applySession(nextSession, event === 'SIGNED_OUT', generatie);
    });

    return () => {
      mounted = false;
      generatieRef.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo(
    () => ({ session, user, loadingAuth }),
    [session, user, loadingAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie utilizat în interiorul unui AuthProvider');
  return context;
};
