import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAppStore } from '../../hooks/useAppStore';
import { supabase } from '../../supabase';
import { restaureazaProfilLocal, type ProfilRestaurare } from '../../lib/onboarding';
import { buildApiUrl } from '../../lib/api';

/**
 * Ecran tranzitoriu de finalizare OAuth.
 * Rezolvă starea de navigare activ și determinist:
 * 1. Dacă onboarding-ul e deja completat local -> navighează direct la /(tabs).
 * 2. Dacă onboarding-ul nu e completat -> verifică profilul de pe server/DB (utilizator existent) și restaurează.
 * 3. Include watchdog de siguranță pentru a preveni orice blocare pe ecran gri/spinner.
 */
export default function AuthCompletionScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loadingAuth } = useAuth();
  const navigatedRef = useRef(false);
  const [showRetry, setShowRetry] = useState(false);

  const resolveAndNavigate = React.useCallback(async (userId: string, token?: string) => {
    if (navigatedRef.current) return;

    try {
      // 1. Dacă onboarding-ul local e confirmat, mergem direct în aplicație
      if (useAppStore.getState().isOnboardingDone) {
        navigatedRef.current = true;
        router.replace('/(tabs)');
        return;
      }

      // 2. Verificare server-side pentru profil existent (utilizator existent pe device nou)
      if (token) {
        try {
          const resp = await fetch(buildApiUrl('/user/profil'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const body = (await resp.json()) as { exista?: boolean; complet?: boolean; profil?: ProfilRestaurare | null };
            if (body.exista && body.complet && body.profil) {
              await restaureazaProfilLocal(body.profil);
              await useAppStore.getState().setOnboardingDone(true);
              navigatedRef.current = true;
              router.replace('/(tabs)');
              return;
            }
          }
        } catch {
          // Eroare la endpoint-ul de backend — continuăm cu fallback direct Supabase
        }
      }

      // 3. Fallback direct pe tabela profil via Supabase client
      try {
        const { data: dbProfile } = await supabase
          .from('profil')
          .select('calorii_tinta, greutate, inaltime, varsta, sex, activitate, obiectiv, proteine_tinta, carbi_tinta, grasimi_tinta')
          .eq('user_id', userId)
          .maybeSingle();

        if (dbProfile && (dbProfile as any).calorii_tinta != null) {
          const profilRestaurat: ProfilRestaurare = {
            varsta: (dbProfile as any).varsta,
            greutate: (dbProfile as any).greutate,
            inaltime: (dbProfile as any).inaltime,
            sex: (dbProfile as any).sex,
            activitate: (dbProfile as any).activitate,
            obiectiv: (dbProfile as any).obiectiv,
            caloriiTinta: (dbProfile as any).calorii_tinta,
            proteineTinta: (dbProfile as any).proteine_tinta,
            grasimiTinta: (dbProfile as any).grasimi_tinta,
            carbiTinta: (dbProfile as any).carbi_tinta,
          };
          await restaureazaProfilLocal(profilRestaurat);
          await useAppStore.getState().setOnboardingDone(true);
          navigatedRef.current = true;
          router.replace('/(tabs)');
          return;
        }
      } catch {
        // Continuăm spre onboarding dacă nu există profil
      }

      // 4. Utilizator nou fără profil complet -> onboarding
      navigatedRef.current = true;
      router.replace('/onboarding');
    } catch {
      navigatedRef.current = true;
      router.replace(useAppStore.getState().isOnboardingDone ? '/(tabs)' : '/onboarding');
    }
  }, [router]);

  // Rezolvare când AuthContext a publicat sesiunea
  useEffect(() => {
    if (loadingAuth || navigatedRef.current) return;
    if (session?.user?.id) {
      void resolveAndNavigate(session.user.id, session.access_token);
    }
  }, [session, loadingAuth, resolveAndNavigate]);

  // Safety watchdog: previne blocarea permanentă pe ecranul gri/spinner
  useEffect(() => {
    const watchdogTimer = setTimeout(async () => {
      if (navigatedRef.current) return;

      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          await resolveAndNavigate(data.session.user.id, data.session.access_token);
        } else {
          setShowRetry(true);
        }
      } catch {
        setShowRetry(true);
      }
    }, 2500);

    return () => clearTimeout(watchdogTimer);
  }, [resolveAndNavigate]);

  const reincearca = async () => {
    setShowRetry(false);
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        await resolveAndNavigate(data.session.user.id, data.session.access_token);
        return;
      }
    } catch {}
    navigatedRef.current = true;
    router.replace('/auth');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{t('oauth.completing')}</Text>

      {showRetry && (
        <View style={styles.retryContainer}>
          <TouchableOpacity
            testID="auth-completion-retry"
            style={[styles.retryButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={reincearca}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryText, { color: colors.textPrimary }]}>
              {t('oauth.retry', 'Reîncearcă')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  text: { fontSize: 14, fontWeight: '600' },
  retryContainer: { marginTop: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  retryText: { fontSize: 14, fontWeight: '600' },
});
