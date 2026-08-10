import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ziLocalDeAzi, mergePașiTotal, adaugaPașiManual } from '../lib/healthSteps';

const HEALTH_SYNC_ENABLED_KEY = 'health_sync_enabled';
const STEP_GOAL_KEY = 'health_step_goal';
const MANUAL_STEPS_KEY_PREFIX = 'manual_steps_';
const HEALTH_PROVIDER_KEY = 'health_sync_provider';
// Totalul zilnic (senzor live + manual) persistat pe zi LOCALĂ, ca numărul să
// supraviețuiască repornirilor aplicației — pe Android singura sursă disponibilă.
const STEPS_TOTAL_KEY_PREFIX = 'steps_total_';

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
  addManualSteps: (amount: number) => Promise<void>;
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
  // Oglindă sincronă a totalului afișat, ca flushSteps/addManualSteps să persiste
  // valoarea corectă fără a depinde de ordinea rulării efectelor React.
  const stepsRef = useRef(0);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const persistaTotalPași = useCallback(async (total: number, todayStr: string) => {
    try {
      await AsyncStorage.setItem(`${STEPS_TOTAL_KEY_PREFIX}${todayStr}`, String(total));
    } catch {}
  }, []);

  const flushSteps = useCallback(() => {
    const buffered = stepBufferRef.current;
    stepBufferRef.current = 0;
    if (buffered <= 0) return;
    const nextSteps = stepsRef.current + buffered;
    stepsRef.current = nextSteps;
    setSteps(nextSteps);
    setActiveCalories(Math.round(nextSteps * 0.04 * (weightRef.current / 70)));
    persistaTotalPași(nextSteps, ziLocalDeAzi());
  }, [persistaTotalPași]);

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
      const storedStr = await AsyncStorage.getItem(`${STEPS_TOTAL_KEY_PREFIX}${todayStr}`);
      const storedTotal = storedStr ? parseInt(storedStr, 10) : 0;

      let sensorSteps = 0;
      let citireSenzorOk = false;
      // Android: getStepCountAsync nu este suportat (NotSupportedException), deci
      // citirea „de la miezul nopții" se face doar pe iOS. Pe Android restaurăm
      // totalul persistat al zilei și continuăm acumularea din watch-ul live.
      if (sensorAvailable && Platform.OS === 'ios') {
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

      // Pașii totali: pe iOS senzorul + manualul; pe Android totalul persistat
      // (senzor live + manual), restaurat la fiecare deschidere/revenire.
      const totalSteps = mergePașiTotal({ storedTotal, manualSteps, sensorSteps, citireSenzorOk });
      stepsRef.current = totalSteps;
      setSteps(totalSteps);
      await persistaTotalPași(totalSteps, todayStr);

      // Calcul calorii arse: formula aproximativă ~0.04 kcal/pas pentru 70kg ajustat la greutatea reală
      const burned = Math.round(totalSteps * 0.04 * (currentWeight / 70));
      setActiveCalories(burned);
    } catch (e) {
      console.error('Eroare citire pași azi:', e);
    }
  }, [isAvailable, weight, persistaTotalPași]);

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

  // 6. Adăugare pași manual — funcționează și fără senzor; persistă totalul zilei.
  const addManualSteps = async (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const todayStr = ziLocalDeAzi();
      const manualKey = `${MANUAL_STEPS_KEY_PREFIX}${todayStr}`;
      const manualStr = await AsyncStorage.getItem(manualKey);
      const currentManual = manualStr ? parseInt(manualStr, 10) : 0;
      const nextManual = currentManual + Math.round(amount);
      await AsyncStorage.setItem(manualKey, String(nextManual));

      const nextTotal = adaugaPașiManual(stepsRef.current, amount);
      stepsRef.current = nextTotal;
      setSteps(nextTotal);
      setActiveCalories(Math.round(nextTotal * 0.04 * (weightRef.current / 70)));
      await persistaTotalPași(nextTotal, todayStr);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Eroare adăugare pași manual:', e);
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
    addManualSteps,
    refreshSteps,
  };
}
