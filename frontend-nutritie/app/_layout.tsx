import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useAppStore } from '../hooks/useAppStore';
import { useBiometrics } from '../hooks/useBiometrics';
import LockScreen from '../components/LockScreen';
import { NotificationBannerProvider } from '../context/NotificationBannerContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#090C0E', padding: 24 }}>
      <Text style={{ color: '#F87171', fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>A apărut o eroare neașteptată!</Text>
      <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>{error.message}</Text>
      <TouchableOpacity onPress={retry} style={{ backgroundColor: '#CCFF00', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 }}>
        <Text style={{ color: '#090C0E', fontWeight: 'bold' }}>Reîncearcă</Text>
      </TouchableOpacity>
    </View>
  );
}

function RootNavigator() {
  const { colors } = useTheme();
  const { session, loadingAuth } = useAuth();
  const { isOnboardingDone, syncFromAsyncStorage } = useAppStore();
  const { isLocked, biometricType, unlockApp } = useBiometrics();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    syncFromAsyncStorage();
  }, [syncFromAsyncStorage]);

  const AppDarkTheme = useMemo(() => ({
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: colors.background,
    },
  }), [colors.background]);

  useEffect(() => {
    if (loadingAuth) return;

    const inAuthGroup = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    
    if (!session && !inAuthGroup) {
      router.replace('/auth');
    } else if (session) {
      if (!isOnboardingDone && !inOnboarding) {
        router.replace('/onboarding');
      } else if (inAuthGroup || (isOnboardingDone && inOnboarding)) {
        router.replace('/(tabs)');
      }
    }
  }, [session, loadingAuth, isOnboardingDone, segments, router]);

  if (loadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ThemeProvider value={AppDarkTheme}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
      {session && isLocked && (
        <LockScreen biometricType={biometricType} onUnlock={unlockApp} />
      )}
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AuthProvider>
          <NotificationBannerProvider>
            <RootNavigator />
          </NotificationBannerProvider>
        </AuthProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

