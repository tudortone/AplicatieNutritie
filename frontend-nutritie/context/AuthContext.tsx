import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loadingAuth: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loadingAuth: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  useEffect(() => {
    // 1. Obținem sesiunea inițială
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    }).catch((err) => {
      console.warn('Eroare la obținerea sesiunii:', err.message);
      setLoadingAuth(false);
    });

    // 2. Ascultăm modificările de stare auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo(() => ({
    session,
    user,
    loadingAuth
  }), [session, user, loadingAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth trebuie utilizat în interiorul unui AuthProvider');
  }
  return context;
};
