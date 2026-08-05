import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, Text, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
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

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    debug: false,
    beforeSend(event) {
      const req = event.request;
      if (req && req.data && typeof req.data === 'object') {
        ['password', 'email', 'mesaj', 'userExplanation', 'user_prompt', 'imagine_base64', 'authorization'].forEach(key => {
          if ((req.data as any)[key]) {
            (req.data as any)[key] = '[SCRUBBED_PII]';
          }
        });
      }
      // B-11: datele de alimentatie sunt date de sanatate. Scrubeaza si
      // breadcrumbs-urile (mesajul de utilizator poate duce in contextul unui
      // crash) si pune un loc unde sa nu apara corpuri de cerere.
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((crumb: any) => {
          const c = { ...crumb };
          if (c.data && typeof c.data === 'object') c.data = '[SCRUBBED_PII]';
          return c;
        });
      }
      return event;
    }
  });

  // Prinde crash-urile JS neprinse (ErrorUtils) si promisiunile respinse neprinse,
  // ca erorile sa ajunga in Sentry, nu doar in consola.
  const ErrorUtils = (global as any).ErrorUtils;
  if (ErrorUtils?.getGlobalHandler) {
    const originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      Sentry.captureException(error, { extra: { isFatal: !!isFatal } });
      originalHandler?.(error, isFatal);
    });
  }
  try {
    global.addEventListener?.('unhandledrejection', (event: any) => {
      Sentry.captureException(event?.reason ?? event);
    });
  } catch {
    // 'unhandledrejection' nu e suportat pe toate runtime-urile RN — il ignoram.
  }
}

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch {
      return;
    }
  },
};

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_mock_clerk_key';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications', '`expo-notifications` functionality is not fully supported in Expo Go']);
// Ținem splash-ul nativ până când primul frame de JS e gata (evităm flash-ul alb).
SplashScreen.preventAutoHideAsync().catch(() => {});
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

  useEffect(() => { syncFromAsyncStorage(); }, [syncFromAsyncStorage]);
  const appDarkTheme = useMemo(() => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background } }), [colors.background]);

  useEffect(() => {
    if (loadingAuth) return;
    const inAuth = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    // Ordinea ceruta: intai chestionarul, apoi planul, apoi contul.
    // Cine nu a terminat onboarding-ul nu ajunge la ecranul de autentificare,
    // ca sa nu i se ceara cont inainte sa vada ce primeste.
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

  if (loadingAuth) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const push = { animation: PUSH_ANIMATION, animationDuration: PUSH_DURATION, gestureEnabled: true } as const;

  return <ThemeProvider value={appDarkTheme}>
    <OfflineBanner />
    <PremiumProvider appUserId={session?.user.id ?? null}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: true, animation: PUSH_ANIMATION, animationDuration: PUSH_DURATION, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: colors.background } }}>
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
    {session && isLocked ? <LockScreen biometricType={biometricType} onUnlock={unlockApp} /> : null}
    <StatusBar style="light" />
  </ThemeProvider>;
}

function SplashHider() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return null;
}

export default function RootLayout() {
  const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasValidClerkKey = Boolean(clerkKey && clerkKey.startsWith('pk_') && clerkKey !== 'pk_test_mock_clerk_key');

  const innerApp = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SplashHider />
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

  if (!hasValidClerkKey) {
    return innerApp;
  }

  return (
    <ClerkProvider publishableKey={clerkKey!} tokenCache={tokenCache}>
      <ClerkLoaded>
        {innerApp}
      </ClerkLoaded>
    </ClerkProvider>
  );
}
