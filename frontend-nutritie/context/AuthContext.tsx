import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import {
  clearLocalUserData,
  prepareLocalDataForNoSession,
  prepareLocalDataForUser,
} from '../lib/userDataCleanup';
import { sincronizeazaOnboardingLaProfil } from '../lib/onboarding';
import { useAppStore } from '../hooks/useAppStore';

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
    let revision = 0;
    let appliedUser: string | undefined;
    let pendingApplication = Promise.resolve();

    const applySession = async (nextSession: Session | null, clearWhenEmpty: boolean, version: number) => {
      if (!mounted || version !== revision) return;
      try {
        if (nextSession?.user) {
          const aSchimbatUtilizator = await prepareLocalDataForUser(nextSession.user.id);
          if (aSchimbatUtilizator) {
            // F-02: `onboarding_done` traieste si in MMKV/memorie, nu doar in
            // AsyncStorage, deci stergerea cheilor nu il reseteaza singura. Fara
            // asta, contul nou mostenea "onboarding terminat" de la contul
            // precedent, sarea chestionarul si ramanea fara tinte nutritionale.
            // Un utilizator care are deja profil in DB nu repeta chestionarul:
            // app/_layout.tsx il restaureaza din `profilServerDate`.
            await useAppStore.getState().setOnboardingDone(false);
          }
          await sincronizeazaOnboardingLaProfil(nextSession.user.id, supabase);
        } else {
          let aveaSpatiuActiv = false;
          if (clearWhenEmpty) {
            await clearLocalUserData();
            aveaSpatiuActiv = true;
          } else {
            aveaSpatiuActiv = await prepareLocalDataForNoSession();
          }
          if (aveaSpatiuActiv) await useAppStore.getState().setOnboardingDone(false);
        }
      } catch {
        console.warn('[Auth] Izolarea datelor locale a eșuat.');
        // Privacy fail-closed: nu publicăm contul nou peste un workspace a cărui
        // tranziție nu s-a încheiat. Jurnalul persistat va relua operația la
        // următorul eveniment de auth sau la următorul bootstrap.
        if (mounted && version === revision) {
          appliedUser = undefined;
          setSession(null);
          setUser(null);
          setLoadingAuth(false);
        }
        return;
      }
      if (!mounted || version !== revision) return;
      appliedUser = nextSession?.user.id;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoadingAuth(false);
    };

    const enqueueSession = (nextSession: Session | null, clearWhenEmpty: boolean) => {
      const version = ++revision;
      if (mounted && appliedUser !== nextSession?.user.id) setLoadingAuth(true);
      // Supabase emite sub lock. Callback-ul rămâne sincron; operațiile de
      // profil rulează ulterior și serial, iar doar ultimul eveniment se publică.
      pendingApplication = pendingApplication.then(() => applySession(nextSession, clearWhenEmpty, version));
    };

    // Lipsa unei sesiuni la cold start nu este logout. Curățarea aici ștergea
    // răspunsurile și flag-ul tocmai salvate de onboarding înainte ca utilizatorul
    // să-și creeze contul. Evenimentul SIGNED_OUT de mai jos rămâne singurul care
    // cere curățarea imediată; schimbarea contului este acoperită separat de
    // prepareLocalDataForUser înainte ca datele noului utilizator să fie afișate.
    supabase.auth.getSession()
      .then(({ data }) => { if (revision === 0) enqueueSession(data.session, false); })
      .catch(() => {
        console.warn('[Auth] Obținerea sesiunii a eșuat.');
        if (mounted && revision === 0) setLoadingAuth(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      enqueueSession(nextSession, event === 'SIGNED_OUT');
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
