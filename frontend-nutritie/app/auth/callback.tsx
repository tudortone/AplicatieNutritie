import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { oauthFlow } from '../../lib/oauthFlow';

// Expo Router montează această rută pentru Linking (warm) și URL-ul inițial
// (cold). Browserul folosește exact același schimb PKCE.
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session, loadingAuth } = useAuth();
  const [completion, setCompletion] = useState<{ code: string | string[] | undefined; userId: string } | null>(null);
  const code = params.code;
  const error = params.error;
  const errorDescription = params.error_description;
  const recovery = params.flow === 'recovery' || params.type === 'recovery';

  useEffect(() => {
    let active = true;
    setCompletion(null);
    void oauthFlow.complete({ code, error, error_description: errorDescription }).then(result => {
      if (active) setCompletion({ code, userId: result.user.id });
    }).catch(() => {
      if (!active) return;
      router.replace('/auth');
      Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
    });
    return () => { active = false; };
  }, [code, error, errorDescription, router, t]);

  useEffect(() => {
    // Schimbul salvează sesiunea înainte ca AuthContext să termine izolarea și
    // sincronizarea profilului. Nu navigăm folosind încă identitatea veche.
    if (!completion || completion.code !== code || error || errorDescription || loadingAuth || session?.user.id !== completion.userId) return;
    // Recovery trebuie să seteze parola chiar dacă exista deja alt cont activ.
    // OAuth continuă în gate-ul central, care decide onboarding/tabs.
    router.replace(recovery ? '/auth/noua-parola' : '/auth/complete');
  }, [completion, code, error, errorDescription, loadingAuth, session, recovery, router]);

  // Keep this route passive while OAuth exchanges the code and AuthContext
  // publishes the new identity. AuthCompletionScreen navigates based on the
  // current session, which can still belong to the previous account here.
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{t('oauth.completing')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { marginTop: 16, fontSize: 16, textAlign: 'center' },
});
