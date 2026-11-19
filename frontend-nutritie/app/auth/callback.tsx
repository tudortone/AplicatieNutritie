import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { oauthFlow } from '../../lib/oauthFlow';
import { useTheme } from '../../context/ThemeContext';

const CALLBACK_TIMEOUT_MS = 10_000;

// Expo Router montează această rută pentru Linking (warm) și URL-ul inițial
// (cold). Browserul folosește exact același schimb PKCE.
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session, loadingAuth } = useAuth();
  const [completion, setCompletion] = useState<{ key: string | string[] | undefined; userId: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const code = params.code;
  const error = params.error;
  const errorDescription = params.error_description;
  const recovery = params.flow === 'recovery' || params.type === 'recovery';
  const tokenHash = typeof params.token_hash === 'string' && params.token_hash.trim() ? params.token_hash.trim() : undefined;
  const accessToken = typeof params.access_token === 'string' && params.access_token.trim() ? params.access_token.trim() : undefined;
  const refreshToken = typeof params.refresh_token === 'string' && params.refresh_token.trim() ? params.refresh_token.trim() : undefined;
  const completionKey = recovery && tokenHash
    ? `recovery:${tokenHash}`
    : recovery && accessToken && refreshToken
      ? `session:${accessToken.slice(-16)}`
      : code;

  useEffect(() => {
    let active = true;
    setCompletion(null);
    setTimedOut(false);
    if (recovery && (error || errorDescription)) {
      router.replace({
        pathname: '/auth/forgot-password',
        params: { reason: 'link_expired' },
      } as never);
      return () => { active = false; };
    }
    const watchdog = setTimeout(() => {
      if (active) setTimedOut(true);
    }, CALLBACK_TIMEOUT_MS);

    const task = recovery && tokenHash
      ? oauthFlow.completeRecoveryToken(tokenHash)
      : recovery && accessToken && refreshToken
        ? oauthFlow.completeRecoverySession(accessToken, refreshToken)
        : oauthFlow.complete({ code, error, error_description: errorDescription });

    void task.then(result => {
      clearTimeout(watchdog);
      if (active) setCompletion({ key: completionKey, userId: result.user.id });
    }).catch(() => {
      clearTimeout(watchdog);
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
    return () => {
      active = false;
      clearTimeout(watchdog);
    };
  }, [accessToken, attempt, code, completionKey, error, errorDescription, recovery, refreshToken, router, t, tokenHash]);

  useEffect(() => {
    // Schimbul salvează sesiunea înainte ca AuthContext să termine izolarea și
    // sincronizarea profilului. Nu navigăm folosind încă identitatea veche.
    if (!completion || completion.key !== completionKey || error || errorDescription || loadingAuth || session?.user.id !== completion.userId) return;
    // Recovery trebuie să seteze parola chiar dacă exista deja alt cont activ.
    // OAuth continuă în gate-ul central, care decide onboarding/tabs.
    router.replace(recovery ? '/auth/noua-parola' : '/auth/complete');
  }, [completion, completionKey, error, errorDescription, loadingAuth, session, recovery, router]);

  if (timedOut) {
    return (
      <View
        testID="auth-callback-timeout"
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.timeoutTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
          {t('alerts.titluri.eroareOAuth')}
        </Text>
        <Text style={[styles.timeoutMessage, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
          {t('alerts.mesaje.problemaConexiuneOAuth')}
        </Text>
        <TouchableOpacity
          testID="auth-callback-retry-btn"
          onPress={() => {
            setTimedOut(false);
            setAttempt((prev) => prev + 1);
          }}
          style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.retry')}
        >
          <Text style={[styles.primaryBtnText, { color: colors.textOnAccent ?? colors.background }]}>
            {t('chat.retry')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="auth-callback-back-btn"
          onPress={() => router.replace('/auth')}
          style={[styles.secondaryBtn, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
          accessibilityRole="button"
          accessibilityLabel={t('authNewPassword.backToLogin')}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
            {t('authNewPassword.backToLogin')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // The completion route can navigate; mount it only after PKCE and identity convergence.
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ color: colors.textSecondary }}>{t('oauth.completing')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  timeoutTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  timeoutMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 8,
  },
  primaryBtn: {
    minHeight: 48,
    minWidth: 200,
    paddingHorizontal: 24,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: 48,
    minWidth: 200,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
