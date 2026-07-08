import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useNotificationBanner } from '../context/NotificationBannerContext';

export const isExpoGo = Constants.appOwnership === 'expo';

// Set handler for when notification arrives while app is in foreground
// P0.1: Dezactivăm afișarea nativă OS când aplicația este activă,
// deoarece notificarea va fi interceptată și afișată ca banner in-app NutriAI.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });
} catch (e) {
  // Ignorăm în Expo Go (SDK 53+)
}

const STORAGE_KEY = 'notifications_enabled';

export function useNotifications() {
  const [enabled, setEnabledState] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { showBanner } = useNotificationBanner();

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const isEnabled = stored === 'true';
        setEnabledState(isEnabled);
      } catch (e) {
        console.error('Eroare la citirea stării notificărilor:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    try {
      let permissionGranted = false;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('meal-reminders', {
          name: 'Remindere Mese NutriAI',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#CCFF00',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === 'granted') {
        permissionGranted = true;
      } else {
        showBanner({
          title: 'Permisiune necesară',
          message: 'Activează notificările din setările telefonului pentru a primi remindere.',
          type: 'warning',
        });
      }

      return permissionGranted;
    } catch (e) {
      return true;
    }
  };

  const scheduleMealReminders = useCallback(async (enable: boolean) => {
    try {
      if (enable) {
        const hasPerm = await registerForPushNotificationsAsync();
        if (!hasPerm) {
          await AsyncStorage.setItem(STORAGE_KEY, 'false');
          setEnabledState(false);
          return false;
        }

        await Notifications.cancelAllScheduledNotificationsAsync();

        // 1. Mic dejun (08:00)
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'NutriAI • 🍳 Bună dimineața!',
            body: 'Timpul pentru micul dejun. Scanează sau înregistrează masa în NutriAI!',
            sound: true,
            color: '#CCFF00',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 8,
            minute: 0,
          },
        });

        // 2. Prânz (13:00)
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'NutriAI • 🥗 Poftă bună la prânz!',
            body: 'Adaugă prânzul în jurnal pentru a rămâne în obiectivul caloric și de proteine.',
            sound: true,
            color: '#CCFF00',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 13,
            minute: 0,
          },
        });

        // 3. Cină (19:30)
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'NutriAI • 🍽️ Jurnalul de seară',
            body: 'Loghează cina și verifică dacă ți-ai atins țintele macro pentru azi!',
            sound: true,
            color: '#CCFF00',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 19,
            minute: 30,
          },
        });

        await AsyncStorage.setItem(STORAGE_KEY, 'true');
        setEnabledState(true);
        showBanner({
          title: 'Remindere Activate',
          message: 'Vei primi 3 notificări zilnice (08:00, 13:00 și 19:30) pentru jurnalul tău alimentar.',
          type: 'success',
        });
        return true;
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
        await AsyncStorage.setItem(STORAGE_KEY, 'false');
        setEnabledState(false);
        showBanner({
          title: 'Remindere Dezactivate',
          message: 'Nu vei mai primi notificări de reamintire a meselor.',
          type: 'info',
        });
        return true;
      }
    } catch (e) {
      console.error('Eroare la programarea notificărilor:', e);
      showBanner({
        title: 'Eroare',
        message: 'Nu s-a putut modifica starea notificărilor.',
        type: 'warning',
      });
      return false;
    }
  }, [showBanner]);

  return {
    enabled,
    loading,
    isExpoGo,
    toggleReminders: scheduleMealReminders,
  };
}
