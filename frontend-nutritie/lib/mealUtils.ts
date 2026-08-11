import { TipMasa, Masa, AlimentDetaliat } from '../types';
import type { ComponentType } from 'react';
import { Egg, Soup, Apple, Salad } from 'lucide-react-native';

/**
 * Limitele CHECK-urilor din baza de date public.mese (migrări 003/004) și ale
 * validatorului backend pentru gramaj. Protejăm insert-urile față de aceste
 * limite ca AI-ul să nu poată arunca o masă întreagă cu CHECK violation.
 */
export const LIMITE_DB_MESE = {
  calorii: 10000,
  proteine: 1000,
  grasimi: 1000,
  carbohidrati: 2000,
  fibre: 500,
  gramaj: 5000,
} as const;

export function clampValoare(valoare: number, max: number, min = 0): number {
  if (!Number.isFinite(valoare)) return min;
  return Math.min(max, Math.max(min, valoare));
}

/**
 * Normalizează tipul mesei (liber, venit din AI) la valorile acceptate de
 * CHECK-ul `mese_tip_masa_check` ('mic_dejun'|'pranz'|'cina'|'gustare').
 * Orice valoare necunoscută cade pe 'gustare' (același default ca chat).
 */
export function normalizeTipMasa(val?: string | null): TipMasa {
  const v = String(val || '').toLowerCase().trim().replace(/[\s.,\-]/g, '');
  const alias: Record<string, TipMasa> = {
    mic_dejun: 'mic_dejun',
    micdejun: 'mic_dejun',
    micdejunul: 'mic_dejun',
    mic: 'mic_dejun',
    breakfast: 'mic_dejun',
    pranz: 'pranz',
    prânz: 'pranz',
    pranzul: 'pranz',
    pranzului: 'pranz',
    lunch: 'pranz',
    masadepranz: 'pranz',
    cina: 'cina',
    cină: 'cina',
    dinner: 'cina',
    supper: 'cina',
    masa: 'cina',
    gustare: 'gustare',
    gustari: 'gustare',
    gustări: 'gustare',
    snack: 'gustare',
  };
  return alias[v] || 'gustare';
}

export interface CategorieMasaMeta {
  id: TipMasa;
  label: string;
}

export const MEAL_CATEGORIES: CategorieMasaMeta[] = [
  { id: 'mic_dejun', label: 'Mic Dejun' },
  { id: 'pranz', label: 'Prânz' },
  { id: 'gustare', label: 'Gustări' },
  { id: 'cina', label: 'Cină' },
];

// REMED-020: iconițele lucide ale categoriilor de masă, unice pentru toți
// consumatorii (istoric/chat/camera/AddMealBottomSheet) — nu se mai duplică
// maparea local, iar emoji-urile nu mai sunt folosite ca iconițe.
export const CATEGORIE_ICONA: Record<TipMasa, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  mic_dejun: Egg,
  pranz: Soup,
  gustare: Apple,
  cina: Salad,
};

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

/** Normalizeaza `alimente` (array sau string JSON) intr-un array. */
export function parseAlimente(masa: Pick<Masa, 'alimente'>): AlimentDetaliat[] {
  if (Array.isArray(masa.alimente)) return masa.alimente;
  if (typeof masa.alimente === 'string') {
    try {
      const parsed = JSON.parse(masa.alimente);
      if (Array.isArray(parsed)) return parsed as AlimentDetaliat[];
    } catch {
      // JSONB corupt — tratat ca list goala; macro-urile flat raman sursa.
    }
  }
  return [];
}

/**
 * Poza mesei = o singura sursa rezolvata: `masa.imagine_url` (coloana, optionala)
 * ?? prima imagine din `alimente[].imageUrl` (JSONB, autoritara pentru mesele din
 * camera). Gurdeaza ca mesele cu poza in JSONB sa afiseze si pe card, nu doar
 * cele care au coloana `imagine_url` aplicata.
 */
export function obtinePozaMasa(masa: Pick<Masa, 'imagine_url' | 'alimente'>): string | null {
  if (masa.imagine_url) return masa.imagine_url;
  const alimente = parseAlimente(masa);
  for (const al of alimente) {
    if (al.imageUrl) return al.imageUrl;
  }
  return null;
}

/**
 * REMED-018: thumbnail pentru pozele din jurnal — același URL rezolvat de
 * `obtinePozaMasa`, redimensionat pe server ImageKit (`?tr=w-<latime>`), ca
 * cardurile/modalele să nu mai descarce rezoluția full la fiecare randare.
 * Dacă URL-ul are deja un transform `tr=` sau nu aparține ImageKit, îl lăsăm
 * intact (fără query-uri false care ar putea strica semnăturile).
 */
export function obtinePozaMasaThumb(
  masa: Pick<Masa, 'imagine_url' | 'alimente'>,
  latime = 480,
): string | null {
  const url = obtinePozaMasa(masa);
  if (!url) return null;
  // Pozele meselor vin din ImageKit (lib/imagekit.ts). Doar pentru ele
  // apendăm transformul; orice alt URL (data URI, alt CDN) rămâne nemodificat.
  if (!url.includes('ik.imagekit.io')) return url;
  if (/[?&]tr=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}tr=w-${latime}`;
}

export interface TotaluriMasa {
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  fibre: number;
}

/** Rotunjime iesipe 1 zecimala (kcal) / 2 (macro) — aliniat cu validatorul backend. */
function rotunjeste(valoare: number, zecimale: number): number {
  if (!Number.isFinite(valoare) || valoare < 0) return 0;
  const factor = Math.pow(10, zecimale);
  return Math.round(valoare * factor) / factor;
}

/** Recalculeaza totalurile mesei din ingredient (suma, clamp>=0). */
export function recalculeazaTotaluri(alimente: AlimentDetaliat[]): TotaluriMasa {
  const total = alimente.reduce(
    (acc, al) => {
      acc.calorii += Number(al.calorii) || 0;
      acc.proteine += Number(al.proteine) || 0;
      acc.carbohidrati += Number(al.carbohidrati) || 0;
      acc.grasimi += Number(al.grasimi) || 0;
      acc.fibre += Number(al.fibre) || 0;
      return acc;
    },
    { calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0 },
  );
  return {
    calorii: rotunjeste(total.calorii, 1),
    proteine: rotunjeste(total.proteine, 2),
    carbohidrati: rotunjeste(total.carbohidrati, 2),
    grasimi: rotunjeste(total.grasimi, 2),
    fibre: rotunjeste(total.fibre, 2),
  };
}

export interface ConstruireAlimenteParams {
  /** Descompunerea originala a mesei editate (null daca masa nu avea alimente). */
  original: AlimentDetaliat[] | null;
  /** true daca utilizatorul a redefinit alimentul (a introdus gramaj/preset/AI). */
  aRedefinitAlimentul: boolean;
  /** Alimentul construit din formular (un singur element). */
  alimentNou: AlimentDetaliat;
}

/**
 * Decide ce `alimente` se scriu la salvare/update fara a pierde descompunerea
 * originala (BUG-002):
 * - masa fara descompunere sau redefinita complet -> `[alimentNou]`;
 * - editare doar de nume/macro (gramaj gol) -> se pastreaza `original` intreg
 *   (toate alimentele, gramajele, pozele, imageKitFileId, aminoacizi etc.);
 * - editare gramaj pe o masa cu UN aliment -> se actualizeaza doar acel aliment,
 *   pastrand id/poza/imageKitFileId prin spread peste original.
 */
export function construiesteAlimenteLaSalvare({
  original,
  aRedefinitAlimentul,
  alimentNou,
}: ConstruireAlimenteParams): AlimentDetaliat[] {
  if (original && original.length > 0 && !aRedefinitAlimentul) {
    return original;
  }
  if (original && original.length === 1 && aRedefinitAlimentul) {
    return [{ ...original[0], ...alimentNou }];
  }
  return [alimentNou];
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
