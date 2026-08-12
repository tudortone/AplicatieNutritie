/**
 * pantryNotifications.ts — Notificări Locale (expo-notifications) pentru Alimentele care Expiră.
 * Rrulează local pe telefon și verifică dinamic lista de produse din Cămară.
 * Programare zilnică la ora 10:00 AM dacă există produse ce expiră în <= 2 zile.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProdusCamara } from '../hooks/useCamara';
import {
  getConsent,
  registerManagedReminder,
  unregisterManagedReminder,
} from './notificationConsent';

const PANTRY_NOTIF_KEY = 'nutriai_pantry_expiry_notif_enabled';

/**
 * Verifică produsele din cămară și programează sau anulează notificarea locală de expirare (ora 10:00 zilnic).
 */
export async function checkAndSchedulePantryExpiryNotification(produse: ProdusCamara[]): Promise<void> {
  // TASK-16: notificările de cămară respectă același consimțământ explicit ca
  // mementourile de masă. Fără consimțământ NU cerem permisiunea OS și NU
  // programăm nimic (evităm auto-activarea la fiecare deschidere a ecranului).
  const consent = await getConsent();
  if (!consent.accepted) {
    return;
  }

  // Dacă rulăm în Expo Go (pe Android în mod special Sdk 51+ nu suportă push pe cloud, dar local schedule funcționează)
  // Încercăm să obținem permisiunile
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return; // Fără permisiuni nu putem programa
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('pantry-expiry', {
        name: 'Alerte Expirare Cămară',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#FF003C',
      });
    }

    // Găsim toate notificările programate în prezent
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const iduriPantryVeche: string[] = [];
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'pantry_expiry') {
        iduriPantryVeche.push(notif.identifier);
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    // Filtrăm produsele care expiră mâine (exact 1 zi rămasă)
    const expiringSoon = produse.filter(
      (p) =>
        !p.is_congelat &&
        typeof p.zile_valabilitate === 'number' &&
        p.zile_valabilitate === 1
    );

    if (expiringSoon.length === 0) {
      // Nu mai avem produse în prag de expirare — nu reprogramăm nimic.
      // BUG-057: scoatem din registry id-urile vechi de cămară deja anulate.
      for (const idVechi of iduriPantryVeche) {
        await unregisterManagedReminder(idVechi);
      }
      await AsyncStorage.setItem(PANTRY_NOTIF_KEY, 'false');
      return;
    }

    // Pregătim textul notificării
    const numeAlimente = expiringSoon
      .slice(0, 3)
      .map((p) => `${p.nume} (${p.zile_valabilitate === 0 ? 'azi' : `${p.zile_valabilitate} zile`})`)
      .join(', ');
    const plusOthers = expiringSoon.length > 3 ? ` și încă ${expiringSoon.length - 3} produse` : '';

    const pantryId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Cămara NutriAI • Expirare Iminentă!',
        body: `Ai ${expiringSoon.length} aliment(e) pe cale să expire: ${numeAlimente}${plusOthers}. Intră în Cămară și folosește „Gătește cu AI” pentru o rețetă rapidă!`,
        sound: true,
        color: '#FF003C',
        data: { type: 'pantry_expiry', count: expiringSoon.length },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 10,
        minute: 0,
      },
    });

    // BUG-057: înregistrăm id-ul în registry-ul de mementouri gestionate, ca
    // logout/revocare/comutare cont (cancelManagedReminders) să o anuleze și pe
    // ea. Scop izolare: notificările contului A nu persistă după deconectare.
    // Apoi scoatem din registry id-urile vechi de cămară (deja anulate mai sus).
    await registerManagedReminder(pantryId);
    for (const idVechi of iduriPantryVeche) {
      await unregisterManagedReminder(idVechi);
    }

    await AsyncStorage.setItem(PANTRY_NOTIF_KEY, 'true');
  } catch (err) {
    console.warn('Eroare la programarea notificării de expirare pentru cămară:', err);
  }
}
