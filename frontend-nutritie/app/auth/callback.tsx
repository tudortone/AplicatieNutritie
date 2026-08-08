import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';

// Rută la `nutriai://auth/callback` — deep-link-ul prin care Supabase intoarce
// utilizatorul in aplicatie dupa OAuth (Google/Apple) sau resetarea parolei.
// Pe fluxul PKCE URL-ul contine `code`; se schimba in sesiune, iar gate-ul de
// rutare din _layout.tsx preia navigarea (/(tabs) sau /onboarding daca lipseste).
export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const procesat = useRef(false);

  const unu = (v?: string | string[]): string | undefined =>
    typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;

  useEffect(() => {
    if (procesat.current) return;
    procesat.current = true;

    const finalizeaza = async () => {
      // G1: pe Android `openAuthSessionAsync` polifilizează prin
      // Linking.addEventListener('url'), la care e abonat și expo-router. Ca
      // urmare, auth.tsx ȘI callback.tsx pot primi același `code` PKCE de două
      // ori. Dacă sesiunea există deja (auth.tsx a schimbat deja codul), nu mai
      // schimbăm nimic — doar navigăm, ca să nu dăm „code already used".
      const { data: sesiuneExistenta } = await supabase.auth.getSession();
      if (sesiuneExistenta.session) {
        router.replace('/(tabs)');
        return;
      }

      const code = unu(params.code);
      const accessToken = unu(params.access_token);
      const refreshToken = unu(params.refresh_token);

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken) {
          // Fallback pe flux implicit (token direct in URL) — rar pe PKCE.
          if (!refreshToken) throw new Error(t('alerts.mesaje.problemaConexiuneOAuth'));
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error(
            unu(params.error_description) || t('alerts.mesaje.problemaConexiuneOAuth'),
          );
        }

        const { data: sesiune } = await supabase.auth.getSession();
        if (!sesiune.session) throw new Error(t('alerts.mesaje.problemaConexiuneOAuth'));
        router.replace('/(tabs)');
      } catch (e: any) {
        router.replace('/auth');
        Alert.alert(
          t('alerts.titluri.eroareOAuth'),
          e?.message || t('alerts.mesaje.problemaConexiuneOAuth'),
        );
      }
    };

    finalizeaza();
  }, [params, router, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        Se finalizează autentificarea…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  text: { fontSize: 14, fontWeight: '600' },
});
