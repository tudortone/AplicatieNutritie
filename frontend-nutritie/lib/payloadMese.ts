import type { AlimentScanat } from '../components/food/FoodScanSuccessModal';
import type { TipMasa } from '../types';
import { localDayKey } from './dateUtils';
import { generareUuidDeterminist } from './idUtils';
import { LIMITE_DB_MESE, clampValoare, getTipMasaDupaOra, normalizeTipMasa } from './mealUtils';

export interface AlimentScanatPayload {
  nume: string;
  grame: number;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  fibre: number;
  imageUrl?: string;
  imageKitFileId?: string;
}

export interface PozaScan {
  url?: string | null;
  fileId?: string | null;
}

/** Per-100g din AI -> valori absolute (gramaj real), clampate la limitele DB. */
export function construiesteAlimenteScan(
  rezultat: AlimentScanat[],
  poza?: PozaScan,
): AlimentScanatPayload[] {
  return rezultat.map((r) => {
    const grame = clampValoare(Math.round(r.estimare_grame || 0), LIMITE_DB_MESE.gramaj, 1);
    const f = grame / 100;
    return {
      nume: r.nume,
      grame,
      calorii: clampValoare(Math.round((r.calorii_per_100g ?? 0) * f), LIMITE_DB_MESE.calorii),
      proteine: clampValoare(Math.round((r.proteine_per_100g ?? 0) * f), LIMITE_DB_MESE.proteine),
      carbohidrati: clampValoare(Math.round((r.carbohidrati_per_100g ?? 0) * f), LIMITE_DB_MESE.carbohidrati),
      grasimi: clampValoare(Math.round((r.grasimi_per_100g ?? 0) * f), LIMITE_DB_MESE.grasimi),
      fibre: 0,
      ...(poza?.url ? { imageUrl: poza.url } : {}),
      ...(poza?.fileId ? { imageKitFileId: poza.fileId } : {}),
    };
  });
}

export interface PayloadMasaCamera {
  id: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  fibre: number;
  tip_masa: TipMasa;
  alimente: AlimentScanatPayload[];
  data: string;
}

/**
 * Construiește payload-ul mesei din rezultatul scanului. Id-ul e UUID
 * determinist din conținut (user + zi + nume + gramaje): același scan resalvat
 * (retry, dublu-tap) primește același id -> PK 23505 la a doua salvare, tratat
 * ca „deja adăugat", fără rând duplicat.
 */
export function construiestePayloadMasaCamera(params: {
  user_id: string;
  rezultat: AlimentScanat[];
  now: Date;
  poza?: PozaScan;
}): { payload: PayloadMasaCamera } {
  const { user_id, rezultat, now, poza } = params;
  const alimente = construiesteAlimenteScan(rezultat, poza);
  const totalCalorii = alimente.reduce((s, a) => s + a.calorii, 0);
  const totalProteine = alimente.reduce((s, a) => s + a.proteine, 0);
  const totalGrasimi = alimente.reduce((s, a) => s + a.grasimi, 0);
  const totalCarbohidrati = alimente.reduce((s, a) => s + a.carbohidrati, 0);
  const totalFibre = alimente.reduce((s, a) => s + a.fibre, 0);
  const nume = rezultat.map((r) => `${r.nume} (${Math.round(r.estimare_grame)}g)`).join(', ');
  const cheieIdempotenta = `${user_id}|${localDayKey(now)}|${nume}|${alimente.map((a) => `${a.nume}:${a.grame}:${a.calorii}`).join('|')}`;
  return {
    payload: {
      id: generareUuidDeterminist(cheieIdempotenta),
      user_id,
      nume,
      calorii: clampValoare(totalCalorii, LIMITE_DB_MESE.calorii),
      proteine: clampValoare(totalProteine, LIMITE_DB_MESE.proteine),
      grasimi: clampValoare(totalGrasimi, LIMITE_DB_MESE.grasimi),
      carbohidrati: clampValoare(totalCarbohidrati, LIMITE_DB_MESE.carbohidrati),
      fibre: clampValoare(totalFibre, LIMITE_DB_MESE.fibre),
      tip_masa: normalizeTipMasa(getTipMasaDupaOra(now)),
      alimente,
      data: localDayKey(now),
    },
  };
}

/** Eroare Postgres 23505 (unique_violation) sau echivalentul ei text. */
export function esteEroareDuplicate(error: any): boolean {
  const cod = String(error?.code || '');
  const mesaj = String(error?.message || '');
  return cod === '23505' || /duplicate key|unique constraint|already exists/i.test(mesaj);
}

export type TipRezultatInsertMasa =
  | { tip: 'succes' }
  | { tip: 'duplicat' }
  | { tip: 'offline'; motiv: string }
  | { tip: 'eroare_server'; mesaj: string; cod?: string };

/**
 * REV-001: Clasifică determinist rezultatul unei inserări de masă (Supabase sau excepție rețea).
 * Previne transformarea erorilor structurate de server (RLS 42501, constrângeri, validare)
 * în succese false salvate în coada offline.
 */
export function clasificaRezultatInsertMasa(
  rezultatOrError: { error: any } | Error | null | undefined
): TipRezultatInsertMasa {
  if (!rezultatOrError) {
    return { tip: 'succes' };
  }

  // Cazul în care a fost aruncată o excepție (de ex. fetch eșuat / rețea offline)
  if (rezultatOrError instanceof Error) {
    const msg = rezultatOrError.message || '';
    // Dacă este o excepție de rețea/transport (Failed to fetch, Network request failed, timeout, offline)
    if (/network|fetch|timeout|offline|abort|econnrefused/i.test(msg) || !('code' in rezultatOrError)) {
      return { tip: 'offline', motiv: msg };
    }
    return { tip: 'eroare_server', mesaj: msg, cod: (rezultatOrError as any).code };
  }

  const { error } = rezultatOrError;
  if (!error) {
    return { tip: 'succes' };
  }

  if (esteEroareDuplicate(error)) {
    return { tip: 'duplicat' };
  }

  // Dacă eroarea are un cod SQL / HTTP sau este o eroare structurată de server (RLS 42501, 23502, 23503, etc.)
  const cod = String(error.code || error.status || '').trim();
  const msg = error.message || error.details || 'Eroare server Supabase';

  if (cod || error.status) {
    return { tip: 'eroare_server', mesaj: msg, cod: cod || undefined };
  }

  // Dacă Supabase a returnat o eroare de transport/rețea fără cod
  if (/network|fetch|offline|failed to fetch/i.test(msg)) {
    return { tip: 'offline', motiv: msg };
  }

  return { tip: 'eroare_server', mesaj: msg };
}

export function eliminaAlimentScanat(rezultat: AlimentScanat[], index: number): AlimentScanat[] {
  return rezultat.filter((_, i) => i !== index);
}

export function adaugaAlimentScanat(rezultat: AlimentScanat[], aliment: AlimentScanat): AlimentScanat[] {
  return [...rezultat, aliment];
}

// --- Chat: propunere de masă (MEAL_PROPOSAL) ---

export interface RindMasaChat {
  id: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  fibre: number;
  data: string;
  ora: string;
  tip_masa: TipMasa;
}

export interface ItemPropunere {
  name: string;
  qty: number;
  unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

// Extrage un număr dintr-o valoare cu unități ("200 kcal", "30 g") sau liberă.
function laNumarStrict(val: unknown): number {
  if (val === undefined || val === null) return 0;
  const numStr = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = Number(numStr);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Construiește rândurile de mese din propunerea AI. Valorile sunt normalizate și
 * clampate la limitele CHECK-urilor DB (BUG-007), tip_masa e adus la valorile
 * valide, iar fiecare rând are un `id` UUID determinist -> reluarea aceleiași
 * propuneri se ciocnește pe PK (23505), fără rânduri duplicate.
 */
export function construiesteRinduriMasaChat(params: {
  user_id: string;
  items: ItemPropunere[];
  now: Date;
  meal_type?: string;
}): RindMasaChat[] {
  const { user_id, items, now, meal_type } = params;
  const zi = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const ora = now.toTimeString().slice(0, 8);
  const tip = normalizeTipMasa(meal_type);
  return items.map((item) => {
    const qty = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 100;
    return {
      id: generareUuidDeterminist(`${user_id}|${tip}|${zi}|${item.name}|${qty}`),
      user_id,
      nume: `${item.name} (${qty}${item.unit || 'g'})`,
      calorii: clampValoare(Math.round(laNumarStrict(item.kcal)), LIMITE_DB_MESE.calorii),
      proteine: clampValoare(laNumarStrict(item.protein_g), LIMITE_DB_MESE.proteine),
      carbohidrati: clampValoare(laNumarStrict(item.carbs_g), LIMITE_DB_MESE.carbohidrati),
      grasimi: clampValoare(laNumarStrict(item.fat_g), LIMITE_DB_MESE.grasimi),
      fibre: clampValoare(Math.round(laNumarStrict(item.fiber_g)), LIMITE_DB_MESE.fibre),
      data: zi,
      ora,
      tip_masa: tip,
    };
  });
}
