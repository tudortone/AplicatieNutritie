import { TipMasa } from '../types';

export interface CategorieMasaMeta {
  id: TipMasa;
  label: string;
  icon: string;
}

export const MEAL_CATEGORIES: CategorieMasaMeta[] = [
  { id: 'mic_dejun', label: 'Mic Dejun', icon: '🍳' },
  { id: 'pranz', label: 'Prânz', icon: '🍲' },
  { id: 'gustare', label: 'Gustări', icon: '🍎' },
  { id: 'cina', label: 'Cină', icon: '🥗' },
];

export function getTipMasaDupaOra(date: Date = new Date()): TipMasa {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // 05:00 - 11:00 = Mic Dejun (300 min - <660 min)
  if (timeInMinutes >= 5 * 60 && timeInMinutes < 11 * 60) {
    return 'mic_dejun';
  }
  // 11:00 - 15:30 = Prânz (660 min - <930 min)
  if (timeInMinutes >= 11 * 60 && timeInMinutes < 15 * 60 + 30) {
    return 'pranz';
  }
  // 15:30 - 18:30 = Gustare (930 min - <1110 min)
  if (timeInMinutes >= 15 * 60 + 30 && timeInMinutes < 18 * 60 + 30) {
    return 'gustare';
  }
  // 18:30 - 23:59 sau 00:00 - 05:00 = Cină
  if (timeInMinutes >= 18 * 60 + 30 || timeInMinutes < 5 * 60) {
    return 'cina';
  }
  return 'gustare';
}

export function getMealCategoryLabel(tip?: TipMasa): string {
  switch (tip) {
    case 'mic_dejun':
      return 'Mic Dejun';
    case 'pranz':
      return 'Prânz';
    case 'cina':
      return 'Cină';
    case 'gustare':
      return 'Gustări';
    default:
      return 'Alte Mese';
  }
}

export function getMealCategoryIcon(tip?: TipMasa): string {
  switch (tip) {
    case 'mic_dejun':
      return '🍳';
    case 'pranz':
      return '🍲';
    case 'cina':
      return '🥗';
    case 'gustare':
      return '🍎';
    default:
      return '🍽️';
  }
}

// Erorile PostgREST cand o coloana lipsește din schema (PGRST204 / 42703).
const SEMNALE_COLOANA_LIPSA = /imagine_url|does not exist|could not find the/i;

/**
 * Inserare masa cu fallback la lipsa coloanei `imagine_url`: daca schema nu are
 * inca migrarea 20260806000001 aplicata, retry fara coloana, ca salvarea mesei
 * sa nu fie blocata. Odata coloana adaugata, fallback-ul nu se mai declanseaza.
 */
export async function insereazaMasaCuPoza(
  client: any,
  payload: Record<string, unknown>,
): Promise<{ data: any; error: any }> {
  // .select() face ca PostgREST să răspundă cu rândul creat (cu id real și
  // created_at), nu doar ok — necesar pentru adăugarea optimistă în jurnal (S10).
  const prima = await client.from('mese').insert(payload).select();
  if (prima.error && SEMNALE_COLOANA_LIPSA.test(String(prima.error.message))) {
    const faraPoza = { ...payload };
    delete faraPoza.imagine_url;
    return client.from('mese').insert(faraPoza).select();
  }
  return prima;
}

/** La fel ca `insereazaMasaCuPoza`, pentru editarea unei mese existente. */
export async function actualizeazaMasaCuPoza(
  client: any,
  id: string,
  valori: Record<string, unknown>,
): Promise<{ error: any }> {
  const prima = await client.from('mese').update(valori).eq('id', id);
  if (prima.error && SEMNALE_COLOANA_LIPSA.test(String(prima.error.message))) {
    const faraPoza = { ...valori };
    delete faraPoza.imagine_url;
    return client.from('mese').update(faraPoza).eq('id', id);
  }
  return prima;
}
