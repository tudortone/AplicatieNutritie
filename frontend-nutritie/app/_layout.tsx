import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import OfflineBanner from '../components/OfflineBanner';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { buildApiUrl } from '../lib/api';
import { restaureazaProfilLocal, type ProfilRestaurare } from '../lib/onboarding';
import { scheduleDailyMealReminders, DEFAULT_MEAL_REMINDERS } from '../lib/notifications';
import {
  getConsent,
  getManagedReminders,
  cancelManagedReminders,
} from '../lib/notificationConsent';
import { processOfflineQueue, type SupabaseMinimalClient } from '../lib/offlineQueue';
import { sincronizeazaTargeturiLocale } from '../lib/sincronizeazaTargeturi';
import { supabase } from '../supabase';
import '../i18n';


// DSN-ul Sentry are forma https://<cheiePublica>@o<org>.ingest.<regiune>.sentry.io/<proiect>.
// Fara segmentul `@` (cheia publica), SDK-ul arunca "Invalid Sentry Dsn" la fiecare boot.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isSentryDsnValid = !!SENTRY_DSN && /^https:\/\/[^@\s]+@.+/.test(SENTRY_DSN);

// --- Redactie PII pentru evenimentele/breadcrumbs Sentry (frontend) ---
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

/** Înlocuiește tokenuri, emaile și telefoane dintr-un text cu placeholdere. */
function redactText(text: unknown): string {
  if (typeof text !== 'string') return text == null ? '' : String(text);
  return text
    .replace(JWT_RE, '[JWT]')
    .replace(BEARER_RE, '[BEARER]')
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(PHONE_RE, '[PHONE]');
}

/** Scrubează recursiv un obiect: chei senzitive setate la marcator, string-uri redactate. */
function scrubObject(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(scrubObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (['password', 'token', 'authorization', 'cookie', 'email', 'phone', 'imagine_base64', 'user_prompt', 'user_explanation'].includes(key)) {
      out[k] = '[SCRUBBED_PII]';
    } else if (v !== null && typeof v === 'object') {
      out[k] = scrubObject(v);
    } else if (typeof v === 'string') {
      out[k] = redactText(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

if (isSentryDsnValid) {
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: false,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      const b = { ...breadcrumb };
      if (typeof b.message === 'string') b.message = redactText(b.message);
      if (b.data && typeof b.data === 'object') b.data = scrubObject(b.data) as Record<string, unknown>;
      return b;
    },
    beforeSend(event) {
      const req = event.request;
      // Stripe headere/cookies si normalizam URL-ul (fara query/hash, care pot
      // contine PII). Nu trimitem identitatea userului la Sentry.
      if (req) {
        delete req.headers;
        delete req.cookies;
        if (req.url) req.url = String(req.url).split(/[?#]/, 1)[0];
        if (req.data) req.data = scrubObject(req.data);
      }
      event.user = undefined;
      if (event.message) event.message = redactText(event.message);
      // B-11: datele de alimentatie sunt date de sanatate. Scrubeaza si
      // breadcrumbs-urile (mesajul de utilizator poate duce in contextul unui
      // crash) si pune un loc unde sa nu apara corpuri de cerere.
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((crumb: any) => {
          const c = { ...crumb };
          if (typeof c.message === 'string') c.message = redactText(c.message);
          if (c.data && typeof c.data === 'object') c.data = scrubObject(c.data);
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
} else if (SENTRY_DSN) {
  console.warn('[Sentry] DSN invalid in .env — lipseste cheia publica (`@`). Copiaza DSN-ul complet din Sentry → Settings → Projects → Client Keys (DSN).');
}


LogBox.ignoreLogs(['expo-notifications: Android Push notifications', '`expo-notifications` functionality is not fully supported in Expo Go']);
export const unstable_settings = { anchor: '(tabs)' };
const PUSH_ANIMATION = 'slide_from_right' as const;
const PUSH_DURATION = 260;

export { GlobalErrorBoundary as ErrorBoundary };

function RootNavigator() {
  const { colors } = useTheme();
  const { session, loadingAuth } = useAuth();
  const { isOnboardingDone, syncFromAsyncStorage, setOnboardingDone } = useAppStore();
  const { isLocked, biometricType, unlockApp } = useBiometrics();
  useDailySync();
  // BUG-043: monitorizăm starea de conectivitate ca să descărcăm coada de mese
  // offline la tranzitia offline -> online (pe lângă descărcarea din start, mai jos).
  const { isOffline } = useNetworkStatus();
  const router = useRouter();
  const segments = useSegments();
  // Ruta curentă ca string simplu (nu tuple): folosită în guard-ul de sesiune
  // pentru a detecta /auth/noua-parola. `useSegments()` cu typedRoutes poate
  // returna tuple (ex. `[string]`) la care accesul pe index pica la typecheck.
  const pathname = usePathname();

  // Verificare server-side a existentei profilului complet. `necunoscut` = inca
  // necunoscut sau eroare de retea — in acest caz gate-ul se comporta ca inainte
  // (fail-open), ca un utilizator offline sa nu fie prins in onboarding.
  const [profilServer, setProfilServer] = useState<'necunoscut' | 'exista' | 'lipsa'>('necunoscut');
  const [profilServerDate, setProfilServerDate] = useState<ProfilRestaurare | null>(null);

  // BUG-063: fetch-ul profilului e reutilizabil (nu doar o dată la montare), ca
  // să poată fi re-încercat la revenirea conexiunii — altfel un utilizator cu
  // profil COMPLET în DB dar offline la pornire rămânea blocat în onboarding
  // (profilServer = 'necunoscut' pentru tot restul sesiunii).
  const profilServerMountedRef = useRef(true);
  const incarcaProfilServer = useCallback(async () => {
    if (!profilServerMountedRef.current) return;
    const token = session?.access_token;
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!session || !token || !apiUrl) return;
    try {
      const resp = await fetch(buildApiUrl('/user/profil'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!profilServerMountedRef.current) return;
      if (!resp.ok) {
        setProfilServer('necunoscut');
        setProfilServerDate(null);
        return;
      }
      const body = await resp.json() as { exista?: boolean; complet?: boolean; profil?: ProfilRestaurare | null };
      if (!profilServerMountedRef.current) return;
      if (body.exista && body.complet && body.profil) {
        setProfilServer('exista');
        setProfilServerDate(body.profil);
      } else {
        setProfilServer('lipsa');
        setProfilServerDate(null);
      }
    } catch {
      if (profilServerMountedRef.current) {
        setProfilServer('necunoscut');
        setProfilServerDate(null);
      }
    }
  }, [session]);

  useEffect(() => { syncFromAsyncStorage(); }, [syncFromAsyncStorage]);

  // Tap pe o notificare push din fundal/terminat → deschide ecranul /notificari.
  // Foreground-ul (banner in-app) e deja acoperit în NotificationBannerContext;
  // aici doar răspunsul la notificare în timp ce aplicația NU e în prim-plan.
  // Guard Expo Go identic cu cel din NotificationBannerContext (SDK 53+ nu
  // suportă push remote pe Android în Expo Go).
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(() => {
        router.push('/notificari');
      });
      return () => subscription.remove();
    } catch {}
  }, [router]);

  useEffect(() => {
    // TASK-16: fără auto-programare la login. Doar aducem notificările în
    // acord cu consimțământul PERSISTAT: dacă utilizatorul a fost de acord dar nu
    // mai are remindere programate (restart) sau contul s-a schimbat, reprogramăm;
    // dacă n-a fost de acord dar există remindere vechi, le anulăm. Fără prompt OS.
    if (!session) {
      cancelManagedReminders().catch(() => {});
      return;
    }
    const accountId = session.user?.id;
    (async () => {
      try {
        const consent = await getConsent();
        const managed = await getManagedReminders();
        const needsReschedule =
          consent.accepted &&
          (managed.ids.length === 0 || managed.accountId !== accountId);
        if (needsReschedule) {
          await scheduleDailyMealReminders(DEFAULT_MEAL_REMINDERS, accountId);
        } else if (!consent.accepted && managed.ids.length > 0) {
          await cancelManagedReminders();
        }
      } catch (e) {
        if (__DEV__) console.warn('[Reminders] Reconciliere eșuată:', e);
      }
    })();
    processOfflineQueue(supabase as unknown as SupabaseMinimalClient).catch(() => {});
    // BUG-035: impingem inapoi la server targeturile salvate offline (updateUser
    // esuata), la fel cum procesam coada de mese offline.
    sincronizeazaTargeturiLocale().catch(() => {});
  }, [session]);

  // BUG-043: la SINGURA tranzitie offline -> online descărcăm coada de mese
  // offline (masa salvată manual/scan „Salvat offline" ajunge în jurnal fără ca
  // utilizatorul să facă ceva). Nu reluăm în loop: doar pe muchie, doar autentificat,
  // și nu reintrăm cât timp o descărcare e deja în curs. processOfflineQueue e
  // idempotent — return early dacă coada e goală și FIFO la eroare.
  const aFostOfflineRef = useRef<boolean | null>(null);
  const descarcareInCursRef = useRef(false);
  useEffect(() => {
    const esteOfflineAcum = isOffline;
    const aFostOffline = aFostOfflineRef.current;
    aFostOfflineRef.current = esteOfflineAcum;
    if (!session || aFostOffline !== true || esteOfflineAcum) return;
    if (descarcareInCursRef.current) return;
    descarcareInCursRef.current = true;
    processOfflineQueue(supabase as unknown as SupabaseMinimalClient)
      .catch(() => {})
      .finally(() => { descarcareInCursRef.current = false; });
  }, [isOffline, session]);

  useEffect(() => {
    profilServerMountedRef.current = true;
    return () => { profilServerMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (loadingAuth) return;
    if (!session) {
      setProfilServer('necunoscut');
      setProfilServerDate(null);
      return;
    }
    void incarcaProfilServer();
  }, [session, loadingAuth, incarcaProfilServer]);

  // BUG-063: la tranziția offline → online re-încercăm fetch-ul profilului dacă
  // încă e 'necunoscut' (la pornirea offline un utilizator cu profil COMPLET în
  // DB rămânea blocat în onboarding — 'necunoscut' nu se reîncerca niciodată,
  // iar gate-ul de mai jos îl trimitea mereu la /onboarding).
  const aFostOfflineProfilRef = useRef<boolean | null>(null);
  useEffect(() => {
    const esteOfflineAcum = isOffline;
    const aFostOffline = aFostOfflineProfilRef.current;
    aFostOfflineProfilRef.current = esteOfflineAcum;
    if (!session || aFostOffline !== true || esteOfflineAcum) return;
    if (profilServer !== 'necunoscut') return;
    void incarcaProfilServer();
  }, [isOffline, session, incarcaProfilServer, profilServer]);

  const appDarkTheme = useMemo(() => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background } }), [colors.background]);

  useEffect(() => {
    if (loadingAuth) return;
    const inAuth = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    // H1/BUG-056: pe /auth/noua-parola (finalizare resetare parolă) NU
    // redirecționăm automat — nici la onboarding, nici în (tabs) — chiar dacă
    // sesiunea există sau onboarding-ul nu e terminat. Utilizatorul a ajuns aici
    // din callback-ul recovery și încă trebuie să-și seteze parola nouă.
    // Fără excepția asta, guard-ul de mai jos l-ar arunca în onboarding/(tabs)
    // și resetarea ar rămâne dead-end (parola veche neschimbată).
    // TS2493: cu typedRoutes activ, useSegments() poate returna tuple `[string]`
    // (lungime 1) pe checkout curat (fără .expo/types) — accesul `segments[1]`
    // pică la typecheck. Detectăm ruta prin `pathname` (string simplu), echivalent
    // semantic: singura rută cu segmentul 'noua-parola' e /auth/noua-parola.
    const esteRecuperareParola = inAuth && pathname === '/auth/noua-parola';
    if (esteRecuperareParola) return;

    // Ordinea ceruta: intai chestionarul, apoi planul, apoi contul.
    // Cine nu a terminat onboarding-ul nu ajunge la ecranul de autentificare,
    // ca sa nu i se ceara cont inainte sa vada ce primeste.
    if (!isOnboardingDone) {
      // Utilizator autentificat cu profil COMPLET in DB (dispozitiv nou / storage
      // sters): restaurăm flag-ul si planul local, fara sa repetam chestionarul.
      if (session && profilServer === 'exista' && profilServerDate) {
        restaureazaProfilLocal(profilServerDate);
        setOnboardingDone(true);
        if (inOnboarding || inAuth) router.replace('/(tabs)');
        return;
      }
      // Fara profil complet in DB (sau verificare in curs / offline): onboarding.
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }
    if (!session) {
      if (!inAuth) router.replace('/auth');
      return;
    }
    if (inAuth || inOnboarding) router.replace('/(tabs)');
  }, [session, loadingAuth, isOnboardingDone, setOnboardingDone, profilServer, profilServerDate, segments, pathname, router]);

  if (loadingAuth) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const push = { animation: PUSH_ANIMATION, animationDuration: PUSH_DURATION, gestureEnabled: true } as const;

  return <ThemeProvider value={appDarkTheme}>
    <OfflineBanner />
    <PremiumProvider appUserId={session?.user.id ?? null} isAdmin={session?.user?.app_metadata?.rol === 'admin'}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: true, animation: PUSH_ANIMATION, animationDuration: PUSH_DURATION, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="auth" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
        <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: PUSH_DURATION, gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="scanner-barcode" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: PUSH_DURATION, gestureEnabled: true, gestureDirection: 'vertical' }} />
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <BottomSheetModalProvider>
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
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
