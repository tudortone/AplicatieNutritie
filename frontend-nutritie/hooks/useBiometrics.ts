import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const BIOMETRIC_STORAGE_KEY = 'biometric_lock_enabled';
const LAST_ACTIVE_KEY = 'biometric_last_active_timestamp';
// AUTO_LOCK_TIMEOUT_MS rezervat pentru funcționalitate viitoare (5 min)
// const AUTO_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export function useBiometrics() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isEnrolled, setIsEnrolled] = useState<boolean>(false);
  const [biometricType, setBiometricType] = useState<'Face ID' | 'Amprentă' | 'Biometric'>('Biometric');
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const appState = useRef(AppState.currentState);

  // 1. Verificăm capabilitățile hardware ale telefonului
  const checkHardware = useCallback(async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsSupported(compatible);

      if (compatible) {
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsEnrolled(enrolled);

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Amprentă');
        } else {
          setBiometricType('Biometric');
        }
      }
    } catch (e) {
      console.error('Eroare verificare hardware biometric:', e);
    }
  }, []);

  // 2. Funcția principală de autentificare (Deblocare)
  const unlockApp = useCallback(async (): Promise<boolean> => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Deblochează NutriAI cu ${biometricType}`,
        fallbackLabel: 'Folosește PIN / Parolă dispozitiv',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
        return true;
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      }
    } catch (e) {
      console.error('Eroare la autentificare:', e);
      return false;
    }
  }, [biometricType]);

  // 3. Citim starea de activare din AsyncStorage și blocăm la pornire dacă e activat
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY);
      const enabled = stored === 'true';
      setIsEnabled(enabled);

      if (enabled) {
        setIsLocked(true);
        // Încercăm deblocarea automată la pornirea aplicației
        setTimeout(() => {
          unlockApp();
        }, 300);
      }
    } catch (e) {
      console.error('Eroare citire setare biometrică:', e);
    } finally {
      setLoading(false);
    }
  }, [unlockApp]);

  useEffect(() => {
    checkHardware();
    loadSettings();
  }, [checkHardware, loadSettings]);

  // 4. Comutare activare/dezactivare din setările de profil
  const toggleBiometric = async (enable: boolean): Promise<boolean> => {
    if (enable) {
      if (!isSupported || !isEnrolled) {
        return false;
      }
      // Solicităm confirmare biometrică pentru a activa securitatea
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Confirmă identitatea pentru activare ${biometricType}`,
        fallbackLabel: 'Folosește PIN',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsEnabled(true);
        await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, 'true');
        await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return true;
      } else {
        return false;
      }
    } else {
      setIsEnabled(false);
      setIsLocked(false);
      await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, 'false');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return true;
    }
  };

  // 5. Autentificarea se cere DOAR la pornirea inițială sau logare, fără re-blocare la comutarea aplicației
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return {
    isSupported,
    isEnrolled,
    biometricType,
    isEnabled,
    isLocked,
    loading,
    unlockApp,
    toggleBiometric,
  };
}
