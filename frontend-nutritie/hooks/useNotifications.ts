import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useNotificationBanner } from '../context/NotificationBannerContext';
import {
  getConsent,
  grantConsent,
  revokeConsent,
  cancelManagedReminders,
} from '../lib/notificationConsent';
import { scheduleDailyMealReminders, DEFAULT_MEAL_REMINDERS } from '../lib/notifications';

export const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
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
  } catch {
    // Ignorăm
  }
}

export function useNotifications() {
  const [enabled, setEnabledState] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { showBanner } = useNotificationBanner();

  // Starea se citește din consimțământul persistat, nu dintr-un boolean local:
  // supraviețuiește restartului și re-loginului.
  useEffect(() => {
    (async () => {
      try {
        const stare = await getConsent();
        setEnabledState(stare.accepted);
      } catch (e) {
        console.error('Eroare la citirea consimțământului notificărilor:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    try {
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
        return true;
      }
      showBanner({
        title: 'Permisiune necesară',
        message: 'Activează notificările din setările telefonului pentru a primi remindere.',
        type: 'warning',
      });
      return false;
    } catch {
      // TASK-16: o eroare la permisiune NU înseamnă „acordat”. Altfel un catch
      // ar face aplicația să programeze remindere fără consimțământ real.
      return false;
    }
  };

  const scheduleMealReminders = useCallback(async (enable: boolean, accountId?: string) => {
    try {
      if (enable) {
        const hasPerm = await registerForPushNotificationsAsync();
        if (!hasPerm) {
          await revokeConsent();
          setEnabledState(false);
          return false;
        }

        // Consimțământ explicit, persistat înainte de orice programare.
        await grantConsent();

        // Delegația programării către lib/notifications (sursa unică), cu
        // înregistrarea id-urilor create (cancel = doar al nostru).
        const ids = await scheduleDailyMealReminders(DEFAULT_MEAL_REMINDERS, accountId);
        if (ids.length === 0) {
          await revokeConsent();
          setEnabledState(false);
          showBanner({
            title: 'Eroare',
            message: 'Nu s-au putut programa notificările.',
            type: 'warning',
          });
          return false;
        }

        setEnabledState(true);
        showBanner({
          title: 'Remindere Activate',
          message: 'Vei primi 3 notificări zilnice (08:00, 13:00 și 19:30) pentru jurnalul tău alimentar.',
          type: 'success',
        });
        return true;
      } else {
        // Opt-out persistat + anulare DOAR a remindere-lor create de aplicație.
        await revokeConsent();
        await cancelManagedReminders();
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