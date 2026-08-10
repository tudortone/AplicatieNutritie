import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UniversalStorage {
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: boolean | string | number) => void;
}

// Sursa UNICA de adevar pentru flag-urile persistate (ex. `onboarding_done`)
// este AsyncStorage (cheia `nutriai-<flag>`), care supravietuieste migrarii
// Expo Go -> build nativ fiind independent de NitroModules. MMKV ramane doar
// un cache sincron pentru boot rapid pe build-urile native; toate scrierile
// merg in AMBELE, iar syncFromAsyncStorage face migrare idempotenta
// MMKV -> AsyncStorage la primul boot nativ (BUG-003).
let mmkvStore: {
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: boolean | string | number) => void;
} | null = null;

try {
  // Încercăm să inițializăm MMKV (build-uri native EAS / Development Builds unde NitroModules sunt prezente)
  const { createMMKV } = require('react-native-mmkv');
  mmkvStore = createMMKV({ id: 'nutriai-storage' });
} catch {
  // Fallback de siguranță: Expo Go nu are NitroModules — doar AsyncStorage + cache în memorie.
  mmkvStore = null;
}

const memoryCache: Record<string, any> = {};

// Seed asincron: la boot, cache-ul din memorie se aliniază cu sursa autoritară.
AsyncStorage.getItem('nutriai-onboarding_done')
  .then((val) => {
    if (val !== null) {
      memoryCache['onboarding_done'] = val === 'true';
    }
  })
  .catch(() => {});

function citesteInitial(key: string): boolean | undefined {
  // MMKV e sincron: pe build nativ răspunde instant; AsyncStorage se re-citește
  // ca sursă la boot prin syncFromAsyncStorage.
  if (mmkvStore) {
    const v = mmkvStore.getBoolean(key);
    if (v !== undefined) return v;
  }
  return memoryCache[key];
}

export const storage: UniversalStorage = {
  getBoolean: (key) => citesteInitial(key),
  set: (key, value) => {
    memoryCache[key] = value;
    try {
      mmkvStore?.set(key, value);
    } catch {
      // MMKV indisponibil (Expo Go) — AsyncStorage rămâne sursa.
    }
    AsyncStorage.setItem(`nutriai-${key}`, String(value)).catch(() => {});
  },
};

export interface AppState {
  isOnboardingDone: boolean;
  setOnboardingDone: (val: boolean) => void;
  syncFromAsyncStorage: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  isOnboardingDone: storage.getBoolean('onboarding_done') ?? false,
  setOnboardingDone: (val: boolean) => {
    storage.set('onboarding_done', val);
    set({ isOnboardingDone: val });
  },
  syncFromAsyncStorage: async () => {
    try {
      const val = await AsyncStorage.getItem('nutriai-onboarding_done');
      if (val !== null) {
        const boolVal = val === 'true';
        // write-through la cache-ul sincron ca următorul boot să fie instant.
        try {
          mmkvStore?.set('onboarding_done', boolVal);
        } catch {
          // MMKV indisponibil — ignorat.
        }
        memoryCache['onboarding_done'] = boolVal;
        set({ isOnboardingDone: boolVal });
      } else if (mmkvStore) {
        // Migrare idempotentă: dacă flag-ul există doar în MMKV (build nativ vechi
        // înainte de dual-write), îl copiem în AsyncStorage ca să devină sursa unică.
        const mmkvVal = mmkvStore.getBoolean('onboarding_done');
        if (mmkvVal !== undefined) {
          await AsyncStorage.setItem('nutriai-onboarding_done', String(mmkvVal));
          set({ isOnboardingDone: mmkvVal });
        }
      }
    } catch {
      // Fallback MMKV: logăm eroarea
      console.warn('[useAppStore] Nu s-a putut sincroniza onboarding_done.');
    }
  },
}));
