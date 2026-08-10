import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const HEALTH_SYNC_ENABLED_KEY = 'health_sync_enabled';
const STEP_GOAL_KEY = 'health_step_goal';
const MANUAL_STEPS_KEY_PREFIX = 'manual_steps_';
const HEALTH_PROVIDER_KEY = 'health_sync_provider';

// Cheia zilei se derivează din calendarul LOCAL, nu UTC — pașii manuali trebuie
// să se alinieze la fereastra „de la miezul nopții local" din getStepCountAsync.
function ziLocalDeAzi(): string {
  const acum = new Date();
  const an = acum.getFullYear();
  const luna = String(acum.getMonth() + 1).padStart(2, '0');
  const ziua = String(acum.getDate()).padStart(2, '0');
  return `${an}-${luna}-${ziua}`;
}

export type HealthProvider =
  | 'google_fit'
  | 'samsung_health'
  | 'apple_health'
  | 'garmin'
  | 'fitbit'
  | 'xiaomi'
  | 'huawei'
  | 'smartwatch'
  | 'general';

export interface HealthProviderInfo {
  id: HealthProvider;
  name: string;
  icon: string;
  description: string;
}

export const HEALTH_PROVIDERS: HealthProviderInfo[] = [
  { id: 'apple_health', name: 'Apple Health / Apple Watch', icon: '🍎', description: 'Integrare cu Apple Watch și HealthKit' },
  { id: 'garmin', name: 'Garmin Connect', icon: '⌚', description: 'Sincronizare cu ceasuri și ciclocomputere Garmin' },
  { id: 'samsung_health', name: 'Samsung Health / Galaxy Watch', icon: '🔵', description: 'Conectare cu ceasuri Galaxy și Samsung Health' },
  { id: 'google_fit', name: 'Google Fit / Pixel Watch', icon: '🟢', description: 'Sincronizare cu Google Health & Pixel Watch' },
  { id: 'fitbit', name: 'Fitbit', icon: '⌚', description: 'Conectare cu brățări și ceasuri Fitbit' },
  { id: 'xiaomi', name: 'Xiaomi / Mi Fitness / Amazfit', icon: '⌚', description: 'Sincronizare cu brățări Mi Band și Amazfit' },
  { id: 'huawei', name: 'Huawei Health', icon: '⌚', description: 'Conectare cu ceasuri Huawei GT & Fit' },
  { id: 'smartwatch', name: 'Brățară / Smartwatch General', icon: '⌚', description: 'Brățări de fitness generice' },
  { id: 'general', name: 'Fără Ceas (Senzor Telefon)', icon: '📱', description: 'Pedometer intern pe telefon' },
];

export interface HealthSyncState {
  isAvailable: boolean;
  isEnabled: boolean;
  steps: number;
  activeCalories: number;
  stepGoal: number;
  loading: boolean;
  platformName: string;
  selectedProvider: HealthProvider;
  providerInfo: HealthProviderInfo;
  setProvider: (provider: HealthProvider) => Promise<void>;
  toggleSync: (enable: boolean) => Promise<boolean>;
  setNewStepGoal: (goal: number) => Promise<void>;
  addSimulatedSteps: (amount: number) => Promise<void>;
  refreshSteps: () => Promise<void>;
}

export function useHealthSync(): HealthSyncState {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [steps, setSteps] = useState<number>(0);
  const [activeCalories, setActiveCalories] = useState<number>(0);
  const [stepGoal, setStepGoal] = useState<number>(10000);
  const [loading, setLoading] = useState<boolean>(true);
  const [weight, setWeight] = useState<number>(75);
  const [selectedProvider, setSelectedProvider] = useState<HealthProvider>(Platform.OS === 'ios' ? 'apple_health' : 'google_fit');

  const subscriptionRef = useRef<Pedometer.Subscription | null>(null);
  const appState = useRef(AppState.currentState);
  const weightRef = useRef(weight);
  // Bufferul de pași acumulează evenimentele brute ale senzorului și se golește
  // o dată pe secundă, ca watchStepCount (foarte frecvent pe Android) să nu
  // re-randeze toți consumatorii pentru fiecare pas.
  const stepBufferRef = useRef(0);
  const lastStepFlushRef = useRef(0);
  // watchStepCount raportează pașii CUMULATIVI de la startul watch-ului, nu
  // delte per eveniment (verificat în PedometerModule.kt/.swift). Păstrăm ultima
  // valoare cumulativă ca să calculăm delta reală; `null` = următorul eveniment
  // re-stabilește linia de bază (după o citire autoritativă sau repornire watch).
  const lastWatchStepsRef = useRef<number | null>(null);

  const flushSteps = useCallback(() => {
    const buffered = stepBufferRef.current;
    stepBufferRef.current = 0;
    if (buffered <= 0) return;
    setSteps((prev) => {
      const nextSteps = prev + buffered;
      setActiveCalories(Math.round(nextSteps * 0.04 * (weightRef.current / 70)));
      return nextSteps;
    });
  }, []);

  useEffect(() => {
    weightRef.current = weight;
  }, [weight]);

  const providerInfo = HEALTH_PROVIDERS.find(p => p.id === selectedProvider) || HEALTH_PROVIDERS[0];
  const platformName = providerInfo.name;

  // 1. Extragem pașii de la miezul nopții până acum
  const fetchStepsToday = useCallback(async (sensorAvailable = isAvailable, currentWeight = weight) => {
    try {
      const todayStr = ziLocalDeAzi();
      const manualKey = `${MANUAL_STEPS_KEY_PREFIX}${todayStr}`;
      const manualStr = await AsyncStorage.getItem(manualKey);
      const manualSteps = manualStr ? parseInt(manualStr, 10) : 0;

      let sensorSteps = 0;
      let citireSenzorOk = false;
      if (sensorAvailable) {
        const end = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        try {
          const result = await Pedometer.getStepCountAsync(start, end);
          if (result && typeof result.steps === 'number') {
            sensorSteps = result.steps;
            citireSenzorOk = true;
          }
        } catch (err) {
          if (__DEV__) console.debug('[useHealthSync] Pedometer indisponibil:', err);
        }
      }

      if (citireSenzorOk) {
        // Citirea autoritativă (de la miezul nopții) devine sursa totalului afișat.
        // Resetăm linia de bază a watch-ului și buffer-ul: pașii deja incluși aici
        // nu trebuie adunați de două ori de următoarele evenimente watch.
        lastWatchStepsRef.current = null;
        stepBufferRef.current = 0;
        lastStepFlushRef.current = 0;
      }

      // Pașii totali sunt suma celor citiți din senzor și a celor adăugați/simulați pentru testare
      const totalSteps = sensorSteps + manualSteps;
      setSteps(totalSteps);

      // Calcul calorii arse: formula aproximativă ~0.04 kcal/pas pentru 70kg ajustat la greutatea reală
      const burned = Math.round(totalSteps * 0.04 * (currentWeight / 70));
      setActiveCalories(burned);
    } catch (e) {
      console.error('Eroare citire pași azi:', e);
    }
  }, [isAvailable, weight]);

  // 3. Monitorizare în timp real a pașilor (dacă aplicația este deschisă)
  const startWatchingSteps = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    // Un watch nou pornește un contor cumulativ de la zero; primul eveniment
    // devine linia de bază, ca să nu numărăm pași deja acoperiți de citirea
    // autoritativă din fetchStepsToday.
    lastWatchStepsRef.current = null;
    try {
      subscriptionRef.current = Pedometer.watchStepCount((result) => {
        const cumulative = result.steps;
        const last = lastWatchStepsRef.current;
        if (last === null) {
          lastWatchStepsRef.current = cumulative;
          return;
        }
        if (cumulative <= last) {
          // Contorul s-a resetat (reboot / restart pedometru): re-bază, fără delta.
          lastWatchStepsRef.current = cumulative;
          return;
        }
        const delta = cumulative - last;
        lastWatchStepsRef.current = cumulative;
        stepBufferRef.current += delta;
        const now = Date.now();
        if (now - lastStepFlushRef.current >= 1000) {
          lastStepFlushRef.current = now;
          flushSteps();
        }
      });
    } catch (e) {
      if (__DEV__) console.debug('[useHealthSync] watchStepCount indisponibil pe acest mediu:', e);
    }
  }, [flushSteps]);

  const stopWatchingSteps = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    flushSteps();
  }, [flushSteps]);

  // 2. Verificăm disponibilitatea Pedometer pe dispozitiv și citim setările
  const initHealth = useCallback(async () => {
    setLoading(true);
    try {
      // BUG-005: nu mai cerem permisiunea OS la fiecare boot (prompt repetat).
      // Verificăm doar hardware-ul și permisiunea DEJA acordată; promptul OS se
      // afișează abia la primul toggle explicit (toggleSync). Ambele condiții:
      // senzor prezent ȘI permisiune acordată — fără prompt, fără fals „activ".
      let available = false;
      try {
        const [permResult, hardware] = await Promise.all([
          Pedometer.getPermissionsAsync(),
          Pedometer.isAvailableAsync(),
        ]);
        available = permResult.granted && hardware;
      } catch {
        // Nu putem confirma permisiunea — fail-safe: indisponibil.
        available = false;
      }
      setIsAvailable(available);

      // Citim starea de activare din AsyncStorage (implicit activat)
      const storedEnabled = await AsyncStorage.getItem(HEALTH_SYNC_ENABLED_KEY);
      const enabled = storedEnabled !== 'false';
      setIsEnabled(enabled);

      // Citim obiectivul de pași
      const storedGoal = await AsyncStorage.getItem(STEP_GOAL_KEY);
      if (storedGoal) setStepGoal(parseInt(storedGoal, 10));

      // Citim greutatea pentru calculul caloriilor arse
      const storedWeight = await AsyncStorage.getItem('greutate');
      if (storedWeight) setWeight(parseInt(storedWeight, 10) || 75);

      // Citim furnizorul ales de fitness
      const storedProvider = await AsyncStorage.getItem(HEALTH_PROVIDER_KEY);
      if (storedProvider) setSelectedProvider(storedProvider as HealthProvider);

      if (enabled && available) {
        await fetchStepsToday(available, parseInt(storedWeight || '75', 10));
        startWatchingSteps();
      }
    } catch (e) {
      console.error('Eroare inițializare HealthSync:', e);
    } finally {
      setLoading(false);
    }
  }, [fetchStepsToday, startWatchingSteps]);

  useEffect(() => {
    initHealth();
    return () => {
      stopWatchingSteps();
    };
  }, [initHealth, stopWatchingSteps]);

  // Monitorizare AppState: la fundal oprim watch-ul pedometrului (baterie),
  // la revenire re-împrospătăm pașii și reluăm watch-ul dacă sync-ul e activ.
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const anterior = String(appState.current);
      const aIesitInFundal =
        anterior === 'active' && nextAppState.match(/inactive|background/);
      const aRevenitInAplicatie =
        anterior.match(/inactive|background/) && nextAppState === 'active';

      if (aIesitInFundal) {
        // PERF-001: în fundal evenimentele watchStepCount nu mai au consumator
        // vizibil și țin procesul treaz (CPU + setState fără render). Le oprim.
        stopWatchingSteps();
      } else if (aRevenitInAplicatie) {
        if (isEnabled) {
          fetchStepsToday();
          startWatchingSteps();
        }
      }
      appState.current = nextAppState;
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isEnabled, fetchStepsToday, startWatchingSteps, stopWatchingSteps]);

  // 4. Comutare activare sincronizare
  const toggleSync = async (enable: boolean): Promise<boolean> => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (enable) {
        let avail = isAvailable;
        try {
          const permResult = await Pedometer.requestPermissionsAsync();
          avail = permResult.granted && (await Pedometer.isAvailableAsync());
          setIsAvailable(avail);
        } catch {}
        setIsEnabled(true);
        await AsyncStorage.setItem(HEALTH_SYNC_ENABLED_KEY, 'true');
        await fetchStepsToday(avail);
        startWatchingSteps();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return true;
      } else {
        setIsEnabled(false);
        stopWatchingSteps();
        await AsyncStorage.setItem(HEALTH_SYNC_ENABLED_KEY, 'false');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return true;
      }
    } catch (e) {
      console.error('Eroare comutare sync:', e);
      return false;
    }
  };

  // 5. Setare obiectiv nou de pași
  const setNewStepGoal = async (goal: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStepGoal(goal);
      await AsyncStorage.setItem(STEP_GOAL_KEY, String(goal));
    } catch (e) {
      console.error('Eroare salvare obiectiv pași:', e);
    }
  };

  // Setare furnizor nou de fitness
  const setProvider = async (provider: HealthProvider) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedProvider(provider);
      await AsyncStorage.setItem(HEALTH_PROVIDER_KEY, provider);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Eroare salvare furnizor fitness:', e);
    }
  };

  // 6. Funcție de simulare/adăugare pași manual (utilă pentru testare în Expo Go sau antrenamente manuale)
  const addSimulatedSteps = async (amount: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const todayStr = ziLocalDeAzi();
      const manualKey = `${MANUAL_STEPS_KEY_PREFIX}${todayStr}`;
      const manualStr = await AsyncStorage.getItem(manualKey);
      const currentManual = manualStr ? parseInt(manualStr, 10) : 0;
      const nextManual = currentManual + amount;
      await AsyncStorage.setItem(manualKey, String(nextManual));
      
      const nextTotal = steps + amount;
      setSteps(nextTotal);
      setActiveCalories(Math.round(nextTotal * 0.04 * (weightRef.current / 70)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Eroare simulare pași:', e);
    }
  };

  const refreshSteps = useCallback(async () => {
    await fetchStepsToday();
  }, [fetchStepsToday]);

  return {
    isAvailable,
    isEnabled,
    steps,
    activeCalories,
    stepGoal,
    loading,
    platformName,
    selectedProvider,
    providerInfo,
    setProvider,
    toggleSync,
    setNewStepGoal,
    addSimulatedSteps,
    refreshSteps,
  };
}
