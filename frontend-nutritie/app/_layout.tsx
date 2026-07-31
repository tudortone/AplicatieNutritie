import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, LogBox, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Ignorăm DOAR avertismentele legitime de mediu (Expo Go nu suportă push nativ).
// NU mai ascundem erori reale de runtime/Supabase — acestea trebuie vizibile în dev.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

import { AppThemeProvider, useTheme } from '../context/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useAppStore } from '../hooks/useAppStore';
import { useBiometrics } from '../hooks/useBiometrics';
import LockScreen from '../components/LockScreen';
import { NotificationBannerProvider } from '../context/NotificationBannerContext';
import { GamificareProvider } from '../context/GamificareContext';
import { useDailySync } from '../hooks/useDailySync';
import '../i18n';

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
  useDailySync();
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
      <Stack
        screenOptions={{
          headerShown: false,
          // Activăm gestul de swipe-back pe iOS pentru toate ecranele
          gestureEnabled: true,
          // Animație implicită: slide din dreapta (activează swipe-back iOS nativ)
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
          // Permite swipe de oriunde pe ecran (nu doar de la margine)
          fullScreenGestureEnabled: true,
          // Culoarea de fundal la tranzitie să fie consistentă cu tema
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* Tab-urile nu au animație vizibilă la comutare */}
        <Stack.Screen name="(tabs)" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="auth" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        {/* Ecrane push — swipe-back iOS activat */}
        <Stack.Screen
          name="camera"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="scanner-barcode"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="adauga-manual"
          options={{
            animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="calculator-ai"
          options={{
            animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="jurnal-antrenamente"
          options={{
            animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="notificari"
          options={{
            animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            gestureEnabled: true,
          }}
        />
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
      <SafeAreaProvider style={{ flex: 1 }}>
        <AppThemeProvider>
          <AuthProvider>
            <NotificationBannerProvider>
              <GamificareProvider>
                <RootNavigator />
              </GamificareProvider>
            </NotificationBannerProvider>
          </AuthProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

