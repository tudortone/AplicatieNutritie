import { TipMasa, Masa, AlimentDetaliat } from '../types';

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
export const CATEGORIE_ICONA: Record<TipMasa, string> = {
  mic_dejun: 'eggFried',
  pranz: 'utensilsCrossed',
  gustare: 'apple',
  cina: 'salad',
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

export function getMealCategoryLabel(tip?: TipMasa, t?: (key: string, options?: any) => string): string {
  let translator = t;
  if (!translator) {
    try {
      // Lazy load to prevent native AsyncStorage import in unit tests
      const i18nModule = require('../i18n');
      const i18nInstance = i18nModule.default || i18nModule;
      if (i18nInstance && i18nInstance.t) {
        translator = i18nInstance.t.bind(i18nInstance);
      }
    } catch {}
  }
  if (translator && tip) {
    const key = `chat.mealCategory.${tip}`;
    const translated = translator(key);
    if (translated && translated !== key) {
      return translated;
    }
  }
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
      return translator ? translator('chat.mealCategory.other', { defaultValue: 'Alte Mese' }) : 'Alte Mese';
  }
}

export function getMealCategoryIcon(tip?: TipMasa): string {
  switch (tip) {
    case 'mic_dejun':
      return 'egg';
    case 'pranz':
      return 'soup';
    case 'cina':
      return 'salad';
    case 'gustare':
      return 'apple';
    default:
      return 'utensils';
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
  const payloadCurat = { ...payload };
  // Schema Postgres pentru tabela 'mese' folosește id de tip bigint auto-increment.
  // Trimiterea unui string UUID provoacă 22P02: invalid input syntax for type bigint.
  if (payloadCurat.id !== undefined && (typeof payloadCurat.id === 'string' && isNaN(Number(payloadCurat.id)))) {
    delete payloadCurat.id;
  }
  // .select() face ca PostgREST să răspundă cu rândul creat (cu id real și
  // created_at), nu doar ok — necesar pentru adăugarea optimistă în jurnal (S10).
  const prima = await client.from('mese').insert(payloadCurat).select();
  if (prima.error && SEMNALE_COLOANA_LIPSA.test(String(prima.error.message))) {
    const faraPoza = { ...payloadCurat };
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

/**
 * F-04 — INVARIANT: totalul unei mese == suma descompunerii ei.
 *
 * PROBLEMA
 * La editarea unei mese cu MAI MULTE ingrediente, formularul plat
 * (calorii/proteine/...) ramane editabil, dar descompunerea `alimente` este
 * pastrata neatinsa (BUG-002/REMED-001, ca sa nu colapseze la un element).
 * Rezultatul: se scria un total NOU peste o descompunere VECHE, iar acelasi
 * card afisa doua adevaruri contradictorii (badge 600 kcal peste ingrediente
 * insumand 500). Mai rau, o editare ulterioara a unui ingredient recalcula
 * totalul din descompunere si stergea tacut corectia manuala a utilizatorului.
 *
 * DECIZIE (sursa unica de adevar)
 * Cand exista o descompunere cu date nutritionale reale, EA este sursa de
 * adevar, iar totalul se deriva mereu din ea — aceeasi regula pe care o aplica
 * deja MealDetailsModal prin `recalculeazaTotaluri` la editarea unui ingredient.
 * Astfel starea inconsistenta devine nereprezentabila, nu doar improbabila.
 *
 * EXCEPTIE (protejeaza datele mostenite)
 * Mesele vechi pot avea `alimente: [{ nume, grame }]` fara macro-uri. Acolo
 * derivarea ar duce totalul la 0, deci pastram totalul din formular. Detectam
 * cazul prin „descompunerea nu contine nicio informatie nutritionala".
 */
export function descompunereAreDateNutritionale(alimente: AlimentDetaliat[] | null | undefined): boolean {
  if (!Array.isArray(alimente) || alimente.length === 0) return false;
  return alimente.some((al) => {
    const valori = [al?.calorii, al?.proteine, al?.carbohidrati, al?.grasimi, al?.fibre];
    return valori.some((v) => Number.isFinite(Number(v)) && Number(v) > 0);
  });
}

export function totaluriPentruPersistare(
  alimente: AlimentDetaliat[] | null | undefined,
  totaluriFormular: TotaluriMasa,
): TotaluriMasa {
  if (!descompunereAreDateNutritionale(alimente)) return totaluriFormular;
  return recalculeazaTotaluri(alimente as AlimentDetaliat[]);
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

/** La fel ca `insereazaMasaCuPoza`, pentru editarea unei mese existente. Cu .select() pentru verificare persistență reală. */
export async function actualizeazaMasaCuPoza(
  client: any,
  id: string,
  valori: Record<string, unknown>,
): Promise<{ error: any; data?: any }> {
  const valoriCurate = { ...valori };
  if (valoriCurate.id !== undefined && (typeof valoriCurate.id === 'string' && isNaN(Number(valoriCurate.id)))) {
    delete valoriCurate.id;
  }
  const prima = await client.from('mese').update(valoriCurate).eq('id', id).select();
  if (prima.error && SEMNALE_COLOANA_LIPSA.test(String(prima.error.message))) {
    const faraPoza = { ...valoriCurate };
    delete faraPoza.imagine_url;
    return client.from('mese').update(faraPoza).eq('id', id).select();
  }
  return prima;
}

export interface NutritionalBasis {
  baseQuantity: number;
  kcalPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
  fiberPerUnit: number;
  unit: string;
}

/**
 * Extrage baza nutrițională autoritară (per unitate / per gram) dintr-un aliment existent.
 * Dacă alimentul are proprietăți per-100g (din Photo AI, Open Food Facts, Custom Food), acestea sunt prioritare.
 * Altfel, se folosește cantitatea și valorile curente pentru a determina raportul canonic.
 */
export function extrageBazaNutritionala(al: AlimentDetaliat): NutritionalBasis {
  const raw = al as unknown as Record<string, unknown>;
  const unit = String(raw.unit || raw.servingUnit || raw.unitate || 'g').trim() || 'g';

  // Verifică dacă există valori per 100g autoritare
  const calorii100 = Number(raw.calorii_per_100g);
  if (Number.isFinite(calorii100) && calorii100 > 0) {
    return {
      baseQuantity: 100,
      kcalPerUnit: calorii100 / 100,
      proteinPerUnit: (Number(raw.proteine_per_100g) || 0) / 100,
      carbsPerUnit: (Number(raw.carbohidrati_per_100g) || 0) / 100,
      fatPerUnit: (Number(raw.grasimi_per_100g) || 0) / 100,
      fiberPerUnit: (Number(raw.fibre_per_100g) || 0) / 100,
      unit,
    };
  }

  // Altfel, cantitatea curentă este baza
  const grame = Number(al.grame);
  const baseQty = Number.isFinite(grame) && grame > 0 ? grame : 100;
  return {
    baseQuantity: baseQty,
    kcalPerUnit: (Number(al.calorii) || 0) / baseQty,
    proteinPerUnit: (Number(al.proteine) || 0) / baseQty,
    carbsPerUnit: (Number(al.carbohidrati) || 0) / baseQty,
    fatPerUnit: (Number(al.grasimi) || 0) / baseQty,
    fiberPerUnit: (Number(al.fibre) || 0) / baseQty,
    unit,
  };
}

/**
 * Recalculează valorile nutriționale scalând direct din baza autoritară,
 * eliminând acumularea erorilor de rotunjire la editări succesive.
 */
export function scaleazaDinBaza(
  basis: NutritionalBasis,
  nouaCantitate: number,
): {
  calorii: number;
  proteine: number;
  carbohidrati: number;
  grasimi: number;
  fibre: number;
} {
  const q = Number.isFinite(nouaCantitate) && nouaCantitate > 0 ? nouaCantitate : 0;
  return {
    calorii: Math.round(basis.kcalPerUnit * q),
    proteine: Math.round(basis.proteinPerUnit * q * 10) / 10,
    carbohidrati: Math.round(basis.carbsPerUnit * q * 10) / 10,
    grasimi: Math.round(basis.fatPerUnit * q * 10) / 10,
    fibre: Math.round(basis.fiberPerUnit * q * 10) / 10,
  };
}

/**
 * Actualizează cantitatea unui aliment și recalculează toate valorile nutriționale
 * scalate din baza canonică.
 */
export function actualizeazaCantitateAliment(
  al: AlimentDetaliat,
  nouaCantitate: number,
  basis?: NutritionalBasis,
): AlimentDetaliat {
  const b = basis ?? extrageBazaNutritionala(al);
  const scalat = scaleazaDinBaza(b, nouaCantitate);

  let aminoacizi = al.aminoacizi;
  if (al.aminoacizi && b.baseQuantity > 0) {
    const f = nouaCantitate / b.baseQuantity;
    aminoacizi = Object.fromEntries(
      Object.entries(al.aminoacizi).map(([k, v]) => [
        k,
        typeof v === 'number' && Number.isFinite(v) ? Math.round(v * f) : v,
      ]),
    ) as any;
  }

  return {
    ...al,
    grame: nouaCantitate,
    calorii: scalat.calorii,
    proteine: scalat.proteine,
    carbohidrati: scalat.carbohidrati,
    grasimi: scalat.grasimi,
    fibre: scalat.fibre,
    ...(aminoacizi ? { aminoacizi } : {}),
  };
}

