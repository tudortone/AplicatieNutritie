import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

// BUG-035: cand updateUser esueaza (offline), profilul salveaza targeturile doar
// local. Flag-ul marcheaza ca exista modificari locale NESINCRONIZATE, asa ca
// cititorii (useMeseAzi) prefera localul fata de user_metadata stale, iar la
// reconectare impingem inapoi la server.
export const TARGETURI_PENDING_KEY = 'targeturi_pending_sync';
export const TARGETURI_PENDING_PREFIX = 'targeturi_pending_sync_';

export function getTargeturiPendingKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim().length > 0) {
    return `${TARGETURI_PENDING_PREFIX}${userId.trim()}`;
  }
  return TARGETURI_PENDING_KEY;
}

/**
 * Impinge targeturile locale nesincronizate inapoi la server, la primul boot /
 * relogin cu conexiune. Idempotent: daca flag-ul nu e setat, nu face nimic; dupa
 * succes, flag-ul se sterge, deci urmatorul fetch foloseste din nou serverul.
 */
export async function sincronizeazaTargeturiLocale(userId?: string | null): Promise<void> {
  try {
    const key = getTargeturiPendingKey(userId);
    const [pendingUser, pendingLegacy] = await Promise.all([
      AsyncStorage.getItem(key),
      AsyncStorage.getItem(TARGETURI_PENDING_KEY),
    ]);
    if (pendingUser !== '1' && pendingLegacy !== '1') return;

    const [greutate, caloriiTinta, proteineTinta, carbiTinta, grasimiTinta] = await Promise.all([
      AsyncStorage.getItem('greutate'),
      AsyncStorage.getItem('caloriiTinta'),
      AsyncStorage.getItem('proteineTinta'),
      AsyncStorage.getItem('carbiTinta'),
      AsyncStorage.getItem('grasimiTinta'),
    ]);

    // Doar campurile prezente, ca sa nu suprascriem cu default-uri un camp care
    // nu s-a schimbat local.
    const data: Record<string, number> = {};
    if (greutate) {
      const v = parseFloat(greutate);
      if (Number.isFinite(v)) data.greutate = v;
    }
    if (caloriiTinta) {
      const v = parseInt(caloriiTinta, 10);
      if (Number.isFinite(v)) data.caloriiTinta = v;
    }
    if (proteineTinta) {
      const v = parseInt(proteineTinta, 10);
      if (Number.isFinite(v)) data.proteineTinta = v;
    }
    if (carbiTinta) {
      const v = parseInt(carbiTinta, 10);
      if (Number.isFinite(v)) data.carbiTinta = v;
    }
    if (grasimiTinta) {
      const v = parseInt(grasimiTinta, 10);
      if (Number.isFinite(v)) data.grasimiTinta = v;
    }

    if (Object.keys(data).length === 0) {
      // Fara valori locale valide — nimic de impins; curatam flag-ul.
      await AsyncStorage.multiRemove([key, TARGETURI_PENDING_KEY]);
      return;
    }

    const { error } = await supabase.auth.updateUser({ data });
    if (!error) {
      await AsyncStorage.multiRemove([key, TARGETURI_PENDING_KEY]);
    }
  } catch {
    // Fara retea sau eroare — incercam din nou la urmatorul boot.
  }
}
