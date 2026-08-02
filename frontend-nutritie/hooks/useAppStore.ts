import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UniversalStorage {
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: boolean | string | number) => void;
}

let storageImpl: UniversalStorage;

try {
  // Încercăm să inițializăm MMKV (pentru build-uri native EAS / Development Builds unde NitroModules sunt prezente)
  const { createMMKV } = require('react-native-mmkv');
  const mmkv = createMMKV({ id: 'nutriai-storage' });
  storageImpl = {
    getBoolean: (key: string) => mmkv.getBoolean(key),
    set: (key: string, value: boolean | string | number) => mmkv.set(key, value),
  };
} catch {
  // Fallback de siguranță în memorie + AsyncStorage pentru Expo Go unde nu există NitroModules
  const memoryCache: Record<string, any> = {};
  
  AsyncStorage.getItem('nutriai-onboarding_done').then((val) => {
    if (val !== null) {
      memoryCache['onboarding_done'] = val === 'true';
    }
  }).catch(() => {});

  storageImpl = {
    getBoolean: (key: string) => memoryCache[key],
    set: (key: string, value: boolean | string | number) => {
      memoryCache[key] = value;
      AsyncStorage.setItem(`nutriai-${key}`, String(value)).catch(() => {});
    },
  };
}

export const storage = storageImpl;

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
        set({ isOnboardingDone: boolVal });
      }
    } catch {
      // Fallback MMKV: logam eroarea
      console.warn('[useAppStore] Nu s-a putut citi onboarding_done din AsyncStorage.');
    }
  },
}));
