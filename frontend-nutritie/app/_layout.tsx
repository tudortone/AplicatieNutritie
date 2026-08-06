import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { OnboardingProvider } from '../context/OnboardingContext';
import { useAppStore } from '../hooks/useAppStore';
import { useBiometrics } from '../hooks/useBiometrics';
import LockScreen from '../components/LockScreen';
import { NotificationBannerProvider } from '../context/NotificationBannerContext';
import { GamificareProvider } from '../context/GamificareContext';
import { PremiumProvider } from '../context/PremiumContext';
import { useDailySync } from '../hooks/useDailySync';
import OfflineBanner from '../components/OfflineBanner';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import '../i18n';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isSentryDsnValid = Boolean(SENTRY_DSN && /^https:\/\/[^@\s]+@.+/.test(SENTRY_DSN));
const CHEIE_SENSIBILA = /authorization|cookie|token|jwt|password|parola|secret|api[-_]?key|email|phone|mesaj|user_prompt|userexplanation|image|imagine|alimente/i;
const VALOARE_SENSIBILA = /bearer\s+[a-z0-9._~-]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/i;

type JsonRecord = Record<string, unknown>;

function esteObiect(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[SCRUBBED_DEPTH]';
  if (typeof value === 'string') {
    if (VALOARE_SENSIBILA.test(value)) return '[SCRUBBED_PII]';
    return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item, depth + 1));
  if (esteObiect(value)) {
    const output: JsonRecord = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = CHEIE_SENSIBILA.test(key) ? '[SCRUBBED_PII]' : scrubValue(item, depth + 1);
    }
    return output;
  }
  return value;
}

if (isSentryDsnValid) {
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: false,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        event.request.data = '[SCRUBBED_PII]';
        event.request.headers = {};
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      event.user = undefined;
      if (event.extra) event.extra = scrubValue(event.extra) as JsonRecord;
      if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.slice(-50).map((crumb) => ({
          ...crumb,
          data: crumb.data ? { redacted: true } : undefined,
          message: typeof crumb.message === 'string'
            ? String(scrubValue(crumb.message)).slice(0, 200)
            : crumb.message,
        }));
      }
      return event;
    },
  });
} else if (SENTRY_DSN) {
  console.warn('[Sentry] DSN invalid; telemetria a fost dezactivată.');
}

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);
export const unstable_settings = { anchor: '(tabs)' };
const PUSH_ANIMATION = 'slide_from_right' as const;
const PUSH_DURATION = 260;

export { GlobalErrorBoundary as ErrorBoundary };

function RootNavigator() {
  const { colors } = useTheme();
  const { session, loadingAuth } = useAuth();
  const { isOnboardingDone, syncFromAsyncStorage } = useAppStore();
  const { isLocked, biometricType, unlockApp } = useBiometrics();
  useDailySync();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void syncFromAsyncStorage();
  }, [syncFromAsyncStorage]);
  const appDarkTheme = useMemo(
    () => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background } }),
    [colors.background],
  );

  useEffect(() => {
    if (loadingAuth) return;
    const inAuth = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    if (!isOnboardingDone) {
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }
    if (!session) {
      if (!inAuth) router.replace('/auth');
      return;
    }
    if (inAuth || inOnboarding) router.replace('/(tabs)');
  }, [session, loadingAuth, isOnboardingDone, segments, router]);

  if (loadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  const push = {
    animation: PUSH_ANIMATION,
    animationDuration: PUSH_DURATION,
    gestureEnabled: true,
  } as const;

  return (
    <ThemeProvider value={appDarkTheme}>
      <OfflineBanner />
      <PremiumProvider
        appUserId={session?.user.id ?? null}
        isAdmin={session?.user?.app_metadata?.rol === 'admin'}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            animation: PUSH_ANIMATION,
            animationDuration: PUSH_DURATION,
            fullScreenGestureEnabled: true,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ animation: 'none', gestureEnabled: false }} />
          <Stack.Screen name="auth" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
          <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: PUSH_DURATION, gestureEnabled: true, gestureDirection: 'vertical' }} />
          <Stack.Screen name="scanner-barcode" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: PUSH_DURATION, gestureEnabled: true, gestureDirection: 'vertical' }} />
          <Stack.Screen name="adauga-manual" options={push} />
          <Stack.Screen name="calculator-ai" options={push} />
          <Stack.Screen name="legal" options={push} />
          <Stack.Screen name="jurnal-antrenamente" options={push} />
          <Stack.Screen name="notificari" options={push} />
          <Stack.Screen name="paywall" options={push} />
          <Stack.Screen name="progres-antrenamente" options={push} />
        </Stack>
      </PremiumProvider>
      {session && isLocked ? (
        <LockScreen biometricType={biometricType} onUnlock={unlockApp} />
      ) : null}
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <AppThemeProvider>
          <AuthProvider>
            <OnboardingProvider>
              <NotificationBannerProvider>
                <GamificareProvider>
                  <GlobalErrorBoundary>
                    <RootNavigator />
                  </GlobalErrorBoundary>
                </GamificareProvider>
              </NotificationBannerProvider>
            </OnboardingProvider>
          </AuthProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
