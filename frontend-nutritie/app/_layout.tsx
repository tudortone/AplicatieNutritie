import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, Text, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
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

LogBox.ignoreLogs(['expo-notifications: Android Push notifications', '`expo-notifications` functionality is not fully supported in Expo Go']);
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
    if (!session) {
      // Primul deschidere: mai întâi setup-ul (onboarding + date + calorii), apoi contul.
      if (!isOnboardingDone && !inOnboarding) router.replace('/onboarding');
      else if (isOnboardingDone && !inAuth) router.replace('/auth');
    } else {
      if (!isOnboardingDone && !inOnboarding) router.replace('/onboarding');
      else if (inAuth || (isOnboardingDone && inOnboarding)) router.replace('/(tabs)');
    }
  }, [session, loadingAuth, isOnboardingDone, segments, router]);

  if (loadingAuth) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const push = { animation: PUSH_ANIMATION, animationDuration: PUSH_DURATION, gestureEnabled: true } as const;

  return <ThemeProvider value={appDarkTheme}>
    <OfflineBanner />
    <PremiumProvider appUserId={session?.user.id ?? null}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: true, animation: PUSH_ANIMATION, animationDuration: PUSH_DURATION, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="auth" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: PUSH_DURATION, gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="scanner-barcode" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: PUSH_DURATION, gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="adauga-manual" options={push} />
        <Stack.Screen name="calculator-ai" options={push} />
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

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider style={{ flex: 1 }}><AppThemeProvider><AuthProvider><NotificationBannerProvider><GamificareProvider><GlobalErrorBoundary><RootNavigator /></GlobalErrorBoundary></GamificareProvider></NotificationBannerProvider></AuthProvider></AppThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
}
