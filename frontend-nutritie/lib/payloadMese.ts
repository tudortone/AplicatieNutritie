import type { AlimentScanat } from '../components/food/FoodScanSuccessModal';
import type { TipMasa } from '../types';
import { localDayKey } from './dateUtils';
import { generareUuidDeterminist, idMasaDinOperatie, idOperatieNoua } from './idUtils';
import { normalizeazaNutrient } from './nutritionTotals';
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
      fibre: clampValoare(Math.round((r.fibre_per_100g ?? 0) * f), LIMITE_DB_MESE.fibre),
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
  ora: string;
  created_at: string;
}

/**
 * Construiește payload-ul mesei din rezultatul scanului.
 *
 * P1-01: identitatea rândului vine din ACȚIUNEA de salvare (`idOperatie`), nu din
 * conținut. Înainte era derivată din `user|zi|nume|gramaje`, ceea ce oprea corect
 * reluările, dar bloca și a doua salvare deliberată a aceleiași farfurii.
 * Reluarea aceleiași acțiuni păstrează `idOperatie` -> același id -> PK 23505 ->
 * un singur rând. O acțiune nouă primește alt `idOperatie` -> rând nou.
 */
export function construiestePayloadMasaCamera(params: {
  user_id: string;
  rezultat: AlimentScanat[];
  now: Date;
  poza?: PozaScan;
  /** Id-ul acțiunii logice de salvare, generat o singură dată la apăsarea butonului. */
  idOperatie?: string;
}): { payload: PayloadMasaCamera } {
  const { user_id, rezultat, now, poza } = params;
  // Fără `idOperatie` (apelant încă nemigrat) generăm unul nou: fiecare apel devine
  // o acțiune distinctă. Este alegerea sigură — riscăm un rând în plus la un retry
  // nemigrat, niciodată pierderea unei mese pe care utilizatorul chiar a adăugat-o.
  const idOperatie = params.idOperatie && params.idOperatie.trim() !== ''
    ? params.idOperatie
    : idOperatieNoua();
  const alimente = construiesteAlimenteScan(rezultat, poza);
  const totalCalorii = alimente.reduce((s, a) => s + a.calorii, 0);
  const totalProteine = alimente.reduce((s, a) => s + a.proteine, 0);
  const totalGrasimi = alimente.reduce((s, a) => s + a.grasimi, 0);
  const totalCarbohidrati = alimente.reduce((s, a) => s + a.carbohidrati, 0);
  const totalFibre = alimente.reduce((s, a) => s + a.fibre, 0);
  const nume = rezultat.map((r) => `${r.nume} (${Math.round(r.estimare_grame)}g)`).join(', ');
  return {
    payload: {
      id: idMasaDinOperatie(user_id, idOperatie),
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
      ora: now.toTimeString().slice(0, 8),
      created_at: now.toISOString(),
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

const CODURI_RETEA_EXPLICITE = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND']);

/**
 * RC-002: Verifică dacă o eroare fără cod de server reprezintă un eșec real de transport/fetch.
 */
export function esteEroareRetea(err: unknown): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : String((err as any)?.message || '');
  const name = err instanceof Error ? err.name : String((err as any)?.name || '');

  if (name === 'AbortError' || /aborterror/i.test(name)) return true;

  const reteaRegex = /network request failed|failed to fetch|network error|net::err|internet connection appears to be offline|socket hang up|connection refused/i;
  return reteaRegex.test(msg);
}

/**
 * REV-001 / CORR-001 / RC-002: Clasifică determinist rezultatul unei inserări de masă.
 * Ordine strictă:
 * 1. 23505 -> duplicate;
 * 2. Coduri explicite de transport OS/Node (ETIMEDOUT, ECONNREFUSED, ECONNRESET, ENOTFOUND) -> offline;
 * 3. Orice alt cod SQL / HTTP sau status (ex: 57014 DB statement timeout, 42501 RLS, 23502, 23514) -> server error;
 * 4. AbortError sau mesaje verificate de fetch/rețea fără cod de server -> offline;
 * 5. Orice altceva necunoscut (TypeError de programare, Error generic) -> server/system error.
 */
export function clasificaRezultatInsertMasa(
  rezultatOrError: { error: any } | Error | null | undefined
): TipRezultatInsertMasa {
  if (!rezultatOrError) {
    return { tip: 'succes' };
  }

  const rawErr = (rezultatOrError instanceof Error) ? rezultatOrError : (rezultatOrError as any).error;
  if (!rawErr) {
    return { tip: 'succes' };
  }

  const msg = typeof rawErr === 'string' ? rawErr : rawErr.message || rawErr.details || String(rawErr);
  const name = rawErr.name || '';
  const codRaw = rawErr.code ?? rawErr.status;
  const cod = (codRaw !== null && codRaw !== undefined) ? String(codRaw).trim() : '';

  // 1. 23505 (unique_violation) -> duplicat idempotent
  if (esteEroareDuplicate(rawErr)) {
    return { tip: 'duplicat' };
  }

  // 2. Coduri explicite de transport/rețea (ETIMEDOUT, ECONNREFUSED, ECONNRESET, ENOTFOUND)
  if (cod && CODURI_RETEA_EXPLICITE.has(cod.toUpperCase())) {
    return { tip: 'offline', motiv: msg };
  }

  // 3. Orice alt cod SQL/HTTP/status nenul -> eroare structurată de server (inclusiv 57014 timeout statement, 42501 RLS)
  if (cod) {
    return { tip: 'eroare_server', mesaj: msg, cod };
  }

  // 4. Erori fără cod de server: AbortError sau mesaje verificate de rețea/transport
  if (name === 'AbortError' || /aborterror/i.test(name) || esteEroareRetea(rawErr)) {
    return { tip: 'offline', motiv: msg };
  }

  // 5. Tot restul (inclusiv TypeError de programare sau Error generic) -> eroare de server/sistem
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
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
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
 * clampate la limitele CHECK-urilor DB (BUG-007), iar tip_masa e adus la valorile valide.
 *
 * P1-01: identitatea fiecărui rând vine din ACȚIUNEA de salvare (`idOperatie`) plus
 * poziția alimentului în propunere — nu din conținut. O propunere cu mai multe
 * alimente produce rânduri distincte, dar stabile la reluare.
 *
 * ATENȚIE la granița cu P1-12: `idOperatie` de aici este al PERSISTĂRII în jurnal,
 * complet separat de id-ul operației de generare AI. Reluarea generării nu salvează
 * nimic; reluarea salvării nu reapelează furnizorul.
 */
export function construiesteRinduriMasaChat(params: {
  user_id: string;
  items: ItemPropunere[];
  now: Date;
  meal_type?: string;
  /** Id-ul acțiunii logice „Adaugă în jurnal", generat o singură dată la apăsare. */
  idOperatie?: string;
}): RindMasaChat[] {
  const { user_id, items, now, meal_type } = params;
  const idOperatie = params.idOperatie && params.idOperatie.trim() !== ''
    ? params.idOperatie
    : idOperatieNoua();
  const zi = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const ora = now.toTimeString().slice(0, 8);
  const tip = normalizeTipMasa(meal_type);
  return items.map((item, index) => {
    const qty = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 100;
    return {
      id: idMasaDinOperatie(user_id, `${idOperatie}#${index}`),
      user_id,
      nume: `${item.name} (${qty}${item.unit || 'g'})`,
      calorii: clampValoare(laNumarStrict(item.kcal), LIMITE_DB_MESE.calorii),
      proteine: clampValoare(laNumarStrict(item.protein_g), LIMITE_DB_MESE.proteine),
      carbohidrati: clampValoare(laNumarStrict(item.carbs_g), LIMITE_DB_MESE.carbohidrati),
      grasimi: clampValoare(laNumarStrict(item.fat_g), LIMITE_DB_MESE.grasimi),
      fibre: clampValoare(laNumarStrict(item.fiber_g), LIMITE_DB_MESE.fibre),
      data: zi,
      ora,
      tip_masa: tip,
    };
  });
}

/**
 * P1-01 — payload canonic pentru SALVAREA MANUALĂ a unei mese.
 *
 * Există ca abstracție de producție reutilizabilă (folosită de
 * `AddMealBottomSheet`) tocmai pentru ca identitatea logică să fie construită
 * într-un singur loc, testabil, și să fie aceeași pe calea online și pe cea
 * offline.
 *
 * Defectul pe care îl închide: payload-ul manual nu avea deloc `id`, deci
 * Postgres genera `gen_random_uuid()` la fiecare INSERT, iar la timeout-ul local
 * de 9s masa intra în coada offline cu un UUID nou. Serverul putea să fi scris
 * deja rândul → reluarea cozii adăuga AL DOILEA rând pentru o singură acțiune.
 *
 * `idOperatie` se generează O SINGURĂ DATĂ, la apăsarea butonului, și se
 * refolosește identic la orice reluare (retry, enqueue offline, replay după
 * repornire). Identitatea NU derivă din conținutul mesei: două mese identice
 * salvate deliberat au `idOperatie` diferit și produc două rânduri.
 */
export function construiestePayloadMasaManuala(params: {
  user_id: string;
  idOperatie: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  fibre: number;
  tip_masa: string;
  alimente?: unknown[];
  imagine_url?: string | null;
  now?: Date;
}): {
  id: string;
  user_id: string;
  nume: string;
  calorii: number;
  proteine: number;
  grasimi: number;
  carbohidrati: number;
  fibre: number;
  tip_masa: string;
  alimente: unknown[];
  imagine_url: string | null;
  data: string;
  ora: string;
  created_at: string;
} {
  const { user_id, idOperatie, nume, tip_masa } = params;
  const now = params.now instanceof Date ? params.now : new Date();
  const zi = localDayKey(now);
  const ora = now.toTimeString().slice(0, 8);
  return {
    id: idMasaDinOperatie(user_id, idOperatie),
    user_id,
    nume,
    calorii: clampValoare(params.calorii, LIMITE_DB_MESE.calorii),
    proteine: clampValoare(params.proteine, LIMITE_DB_MESE.proteine),
    grasimi: clampValoare(params.grasimi, LIMITE_DB_MESE.grasimi),
    carbohidrati: clampValoare(params.carbohidrati, LIMITE_DB_MESE.carbohidrati),
    fibre: clampValoare(params.fibre, LIMITE_DB_MESE.fibre),
    tip_masa: normalizeTipMasa(tip_masa),
    alimente: params.alimente ?? [],
    imagine_url: params.imagine_url ?? null,
    data: zi,
    ora,
    created_at: now.toISOString(),
  };
}

/**
 * P1-01 (remediere) — o coliziune `23505` NU dovedește singură „aceeași salvare".
 *
 * Ea dovedește doar că EXISTĂ un rând cu acel id. Dacă identitatea acțiunii a
 * ajuns cumva să fie folosită pentru alt conținut, tratarea necondiționată a lui
 * 23505 drept succes îi confirmă utilizatorului valorile din payload-ul LOCAL,
 * în timp ce jurnalul păstrează primul conținut scris — pierdere silențioasă de
 * date, fără nicio eroare vizibilă.
 *
 * Aici citim rândul chiar persistat și comparăm câmpurile canonice. Numerele se
 * compară după normalizarea canonică P1-03 (`normalizeazaNutrient`), ca un
 * `"40.0"` din PostgREST să nu pară diferit de `40`.
 *
 * Rezultatul `necunoscut` este deliberat distinct de `reluare_confirmata`:
 * dacă nu putem citi rândul, nu avem voie să pretindem succes.
 */
export type RezultatReluareMasa =
  | { tip: 'reluare_confirmata'; rand: Record<string, unknown> }
  | { tip: 'conflict_continut'; rand: Record<string, unknown> }
  | { tip: 'necunoscut' };

const CAMPURI_NUMERICE_CANONICE = ['calorii', 'proteine', 'grasimi', 'carbohidrati', 'fibre'] as const;

export async function verificaReluareMasa(
  client: {
    from: (tabela: string) => {
      select: (coloane: string) => {
        eq: (coloana: string, valoare: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        };
      };
    };
  },
  payload: { id: string; nume?: string; tip_masa?: string } & Record<string, unknown>,
): Promise<RezultatReluareMasa> {
  let rand: Record<string, unknown> | null = null;
  try {
    const raspuns = await client
      .from('mese')
      .select('id, nume, tip_masa, calorii, proteine, grasimi, carbohidrati, fibre')
      .eq('id', payload.id)
      .maybeSingle();
    if (raspuns?.error) return { tip: 'necunoscut' };
    rand = raspuns?.data ?? null;
  } catch {
    return { tip: 'necunoscut' };
  }

  // Rândul lipsește (șters între timp, ori replică fără el): nu putem dovedi nimic.
  if (!rand) return { tip: 'necunoscut' };

  for (const camp of CAMPURI_NUMERICE_CANONICE) {
    if (normalizeazaNutrient(rand[camp]) !== normalizeazaNutrient(payload[camp])) {
      return { tip: 'conflict_continut', rand };
    }
  }
  if (String(rand.nume ?? '') !== String(payload.nume ?? '')) {
    return { tip: 'conflict_continut', rand };
  }
  if (String(rand.tip_masa ?? '') !== String(payload.tip_masa ?? '')) {
    return { tip: 'conflict_continut', rand };
  }

  return { tip: 'reluare_confirmata', rand };
}

/**
 * P1-01 (remediere finală) — DECIZIA unică după un INSERT de masă.
 *
 * `clasificaRezultatInsertMasa` întoarce `duplicat` doar pe baza codului de
 * eroare, fără să citească nimic. Ecranele tratau apoi `duplicat` ca `succes`,
 * deci o coliziune pe cheia primară confirma utilizatorului payload-ul LOCAL,
 * nu rândul chiar persistat.
 *
 * Aici clasificarea rămâne neschimbată, dar `duplicat` NU mai este un verdict:
 * se citește rândul persistat (`verificaReluareMasa`, singura implementare a
 * comparării) și se întoarce unul dintre trei rezultate distincte. Ecranele nu
 * mai au voie să deducă singure ce înseamnă un 23505.
 *
 * Acceptă un payload sau o listă (propunerea din chat scrie mai multe rânduri
 * într-o singură acțiune): un singur rând neconform face întreaga operație
 * `conflict_continut`; un rând necitibil o face `verificare_esuata`.
 */
export type DecizieInsertMasa =
  | { tip: 'succes' }
  | { tip: 'reluare_confirmata' }
  | { tip: 'conflict_continut' }
  | { tip: 'verificare_esuata' }
  | { tip: 'eroare_server'; mesaj: string; cod?: string }
  | { tip: 'offline'; motiv?: string };

export async function decideRezultatInsertMasa(
  client: Parameters<typeof verificaReluareMasa>[0],
  payloads: ({ id: string } & Record<string, unknown>) | ({ id: string } & Record<string, unknown>)[],
  rezultatOrError: { error: unknown } | Error | null | undefined,
): Promise<DecizieInsertMasa> {
  const clasificare = clasificaRezultatInsertMasa(rezultatOrError as never);

  if (clasificare.tip !== 'duplicat') {
    // Succes, eroare de server și offline păstrează exact semantica existentă.
    return clasificare as DecizieInsertMasa;
  }

  const lista = Array.isArray(payloads) ? payloads : [payloads];
  let vreunNecunoscut = false;

  for (const payload of lista) {
    const verificare = await verificaReluareMasa(client, payload);
    // Conflictul are prioritate: dovedește că rândul persistat NU e al nostru.
    if (verificare.tip === 'conflict_continut') return { tip: 'conflict_continut' };
    if (verificare.tip === 'necunoscut') vreunNecunoscut = true;
  }

  if (vreunNecunoscut) return { tip: 'verificare_esuata' };
  return { tip: 'reluare_confirmata' };
}
