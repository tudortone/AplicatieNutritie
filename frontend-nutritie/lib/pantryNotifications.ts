/**
 * pantryNotifications.ts — Notificări Locale (expo-notifications) pentru Alimentele care Expiră.
 * Rrulează local pe telefon și verifică dinamic lista de produse din Cămară.
 * Programare zilnică la ora 10:00 AM dacă există produse ce expiră în <= 2 zile.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProdusCamara } from '../hooks/useCamara';

const PANTRY_NOTIF_KEY = 'nutriai_pantry_expiry_notif_enabled';

/**
 * Verifică produsele din cămară și programează sau anulează notificarea locală de expirare (ora 10:00 zilnic).
 */
export async function checkAndSchedulePantryExpiryNotification(produse: ProdusCamara[]): Promise<void> {
  // Dacă rulăm în Expo Go (pe Android în mod special din SDK 51+ nu suportă push pe cloud, dar local schedule funcționează)
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
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'pantry_expiry') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    // Filtrăm produsele care expiră în <= 2 zile și nu sunt congelate
    const expiringSoon = produse.filter(
      (p) =>
        !p.is_congelat &&
        typeof p.zile_valabilitate === 'number' &&
        p.zile_valabilitate <= 2 &&
        p.zile_valabilitate >= 0
    );

    if (expiringSoon.length === 0) {
      // Nu mai avem produse în prag de expirare — nu reprogramăm nimic
      await AsyncStorage.setItem(PANTRY_NOTIF_KEY, 'false');
      return;
    }

    // Pregătim textul notificării
    const numeAlimente = expiringSoon
      .slice(0, 3)
      .map((p) => `${p.nume} (${p.zile_valabilitate === 0 ? 'azi' : `${p.zile_valabilitate} zile`})`)
      .join(', ');
    const plusOthers = expiringSoon.length > 3 ? ` și încă ${expiringSoon.length - 3} produse` : '';

    await Notifications.scheduleNotificationAsync({
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

    await AsyncStorage.setItem(PANTRY_NOTIF_KEY, 'true');
  } catch (err) {
    console.warn('Eroare la programarea notificării de expirare pentru cămară:', err);
  }
}
