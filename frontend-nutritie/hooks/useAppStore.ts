import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UniversalStorage {
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: boolean | string | number) => Promise<void>;
}

// Sursa UNICA de adevar pentru flag-urile persistate (ex. `onboarding_done`)
// este AsyncStorage (cheia `nutriai-<flag>`).
// Cache-ul sincron in memorie ofera acces instantaneu fara apeluri native C++ la boot.
const memoryCache: Record<string, boolean | string | number> = {};

// Seed asincron: la boot, cache-ul din memorie se aliniază cu sursa autoritară.
AsyncStorage.getItem('nutriai-onboarding_done')
  .then((val) => {
    if (val !== null) {
      memoryCache['onboarding_done'] = val === 'true';
    }
  })
  .catch(() => {});

function citesteInitial(key: string): boolean | undefined {
  const val = memoryCache[key];
  return typeof val === 'boolean' ? val : undefined;
}

export const storage: UniversalStorage = {
  getBoolean: (key) => citesteInitial(key),
  set: async (key, value) => {
    // AsyncStorage este sursa autoritară: nu confirmăm operația până când
    // scrierea durabilă nu s-a încheiat. Altfel, o închidere/reîncărcare imediat
    // după onboarding poate pierde flag-ul și reporni chestionarul.
    await AsyncStorage.setItem(`nutriai-${key}`, String(value));
    memoryCache[key] = value;
  },
};

export interface AppState {
  isOnboardingDone: boolean;
  setOnboardingDone: (val: boolean) => Promise<void>;
  syncFromAsyncStorage: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  isOnboardingDone: storage.getBoolean('onboarding_done') ?? false,
  setOnboardingDone: async (val: boolean) => {
    await storage.set('onboarding_done', val);
    set({ isOnboardingDone: val });
  },
  syncFromAsyncStorage: async () => {
    try {
      const val = await AsyncStorage.getItem('nutriai-onboarding_done');
      if (val !== null) {
        const boolVal = val === 'true';
        memoryCache['onboarding_done'] = boolVal;
        set({ isOnboardingDone: boolVal });
      }
    } catch {
      console.warn('[useAppStore] Nu s-a putut sincroniza onboarding_done.');
    }
  },
}));
