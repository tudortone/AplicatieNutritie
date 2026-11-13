import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { oauthFlow } from '../../lib/oauthFlow';
import { useTheme } from '../../context/ThemeContext';

// Expo Router montează această rută pentru Linking (warm) și URL-ul inițial
// (cold). Browserul folosește exact același schimb PKCE.
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session, loadingAuth } = useAuth();
  const [completion, setCompletion] = useState<{ key: string | string[] | undefined; userId: string } | null>(null);
  const code = params.code;
  const error = params.error;
  const errorDescription = params.error_description;
  const recovery = params.flow === 'recovery' || params.type === 'recovery';
  const tokenHash = typeof params.token_hash === 'string' && params.token_hash.trim() ? params.token_hash.trim() : undefined;
  const completionKey = recovery && tokenHash ? `recovery:${tokenHash}` : code;

  useEffect(() => {
    let active = true;
    setCompletion(null);
    if (recovery && (error || errorDescription)) {
      router.replace({
        pathname: '/auth/forgot-password',
        params: { reason: 'link_expired' },
      } as never);
      return () => { active = false; };
    }
    const task = recovery && tokenHash
      ? oauthFlow.completeRecoveryToken(tokenHash)
      : oauthFlow.complete({ code, error, error_description: errorDescription });

    void task.then(result => {
      if (active) setCompletion({ key: completionKey, userId: result.user.id });
    }).catch(() => {
      if (!active) return;
      if (recovery) {
        router.replace({
          pathname: '/auth/forgot-password',
          params: { reason: 'link_expired' },
        } as never);
        return;
      }
      router.replace('/auth');
      Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
    });
    return () => { active = false; };
  }, [code, completionKey, error, errorDescription, recovery, router, t, tokenHash]);

  useEffect(() => {
    // Schimbul salvează sesiunea înainte ca AuthContext să termine izolarea și
    // sincronizarea profilului. Nu navigăm folosind încă identitatea veche.
    if (!completion || completion.key !== completionKey || error || errorDescription || loadingAuth || session?.user.id !== completion.userId) return;
    // Recovery trebuie să seteze parola chiar dacă exista deja alt cont activ.
    // OAuth continuă în gate-ul central, care decide onboarding/tabs.
    router.replace(recovery ? '/auth/noua-parola' : '/auth/complete');
  }, [completion, completionKey, error, errorDescription, loadingAuth, session, recovery, router]);

  // The completion route can navigate; mount it only after PKCE and identity convergence.
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ color: colors.textSecondary }}>{t('oauth.completing')}</Text>
    </View>
  );
}
