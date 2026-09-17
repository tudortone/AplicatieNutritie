import type { Masa } from '../types';

/**
 * P1-03 — AUTORITATEA UNICĂ pentru totalurile nutriționale CONSUMATE.
 *
 * ==========================================================================
 * DE CE EXISTĂ ACEST MODUL
 * ==========================================================================
 * Înainte, aceleași totaluri se calculau în patru locuri independente (toate în
 * `useMeseAzi`): agregatul zilei, agregatul pe categorii, adăugarea optimistă și
 * ștergerea optimistă. Ultimele două făceau aritmetică pe DELTĂ peste un total
 * deja rotunjit, ceea ce nu este inversabil: „adaugă apoi șterge" nu readucea
 * totalul inițial. Iar agregatul pe categorii nu aplica aceeași rotunjire ca
 * agregatul zilei, deci suma categoriilor putea să nu fie egală cu totalul zilei.
 *
 * Aici există o singură regulă, iar toți consumatorii o derivă din setul canonic
 * de mese persistate:
 *
 *      rânduri canonice `mese`  →  calculeazaTotaluriZi()  →  totaluriPentruAfisare()
 *
 * ==========================================================================
 * UNITĂȚI CANONICE (verificate în schema `mese` și în types.ts)
 * ==========================================================================
 *   calorii      → kcal
 *   proteine     → grame
 *   grasimi      → grame
 *   carbohidrati → grame
 *   fibre        → grame
 *
 * ==========================================================================
 * AUTORITATEA CONSUMULUI
 * ==========================================================================
 * Coloanele de pe RÂNDUL mesei (`mese.calorii`, `mese.proteine`, …) sunt sursa
 * de adevăr pentru consum. `mese.alimente` (JSONB) descrie compoziția și susține
 * editarea/afișarea detaliilor, dar NU se însumează peste totalurile rândului —
 * altfel aceeași masă ar fi numărată de două ori. Consistența dintre cele două
 * reprezentări se asigură la persistare (`lib/payloadMese.ts`, `lib/mealUtils.ts`).
 *
 * ==========================================================================
 * ȚINTE vs CONSUM
 * ==========================================================================
 * Acest modul acoperă EXCLUSIV consumul. Țintele zilnice vin din profil, iar
 * „rămas" se derivă (`țintă - consumat`); nu se ține niciodată separat.
 */

export interface TotaluriZi {
  /** kcal */
  calorii: number;
  /** grame */
  proteine: number;
  /** grame */
  grasimi: number;
  /** grame */
  carbohidrati: number;
  /** grame */
  fibre: number;
}

export const TOTALURI_ZERO: TotaluriZi = Object.freeze({
  calorii: 0,
  proteine: 0,
  grasimi: 0,
  carbohidrati: 0,
  fibre: 0,
});

/**
 * Normalizare la GRANIȚA aritmeticii canonice.
 *
 * Intrările pot veni din PostgREST (numere), din rânduri legacy (șiruri numerice,
 * `null`) sau dintr-un furnizor extern. Regula este deliberat conservatoare:
 * orice valoare care nu este un număr finit ≥ 0 contribuie cu 0.
 *
 * `Infinity` NU se plafonează la o valoare mare „plauzibilă": o intrare invalidă
 * nu trebuie să devină date nutriționale care par reale. Se ignoră.
 * Valorile negative sunt invalide prin regulile produsului (consumul nu scade),
 * deci contribuie tot cu 0 în loc să scadă din total.
 */
export function normalizeazaNutrient(valoare: unknown): number {
  if (typeof valoare === 'number') {
    return Number.isFinite(valoare) && valoare > 0 ? valoare : 0;
  }
  if (typeof valoare === 'string') {
    const trimis = valoare.trim();
    if (trimis === '') return 0;
    const numar = Number(trimis);
    return Number.isFinite(numar) && numar > 0 ? numar : 0;
  }
  return 0;
}

/**
 * Totalurile BRUTE ale unei zile, derivate din setul canonic de mese.
 *
 * Nu rotunjește și nu plafonează: rotunjirea se aplică o singură dată, la afișare
 * (`totaluriPentruAfisare`). Sumarea pe valori brute este singurul mod în care
 * agregatele parțiale (pe categorii) pot fi garantat egale cu totalul zilei.
 */
export function calculeazaTotaluriZi(mese: readonly Masa[] | null | undefined): TotaluriZi {
  if (!Array.isArray(mese) || mese.length === 0) return { ...TOTALURI_ZERO };

  let calorii = 0;
  let proteine = 0;
  let grasimi = 0;
  let carbohidrati = 0;
  let fibre = 0;

  for (const masa of mese) {
    if (!masa || typeof masa !== 'object') continue;
    calorii += normalizeazaNutrient(masa.calorii);
    proteine += normalizeazaNutrient(masa.proteine);
    grasimi += normalizeazaNutrient(masa.grasimi);
    carbohidrati += normalizeazaNutrient(masa.carbohidrati);
    fibre += normalizeazaNutrient(masa.fibre);
  }

  return { calorii, proteine, grasimi, carbohidrati, fibre };
}

/**
 * POLITICA DE ROTUNJIRE — una singură, aplicată exclusiv la prezentare.
 *
 *   calorii  → întreg (kcal)
 *   macro-uri → o zecimală (grame)
 *
 * Plafoanele păstrează comportamentul anterior al ecranelor (o valoare absurdă nu
 * trebuie să spargă layoutul), dar acum se aplică DUPĂ normalizare, deci nu mai pot
 * transforma un `Infinity` într-un număr care pare real — acesta a fost deja ignorat.
 */
export const PLAFON_CALORII = 100000;
export const PLAFON_MACRO = 5000;

export function totaluriPentruAfisare(totaluri: TotaluriZi): TotaluriZi {
  const intreg = (v: number, plafon: number) =>
    Math.min(plafon, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
  const zecimala = (v: number, plafon: number) =>
    Math.min(plafon, Math.max(0, Math.round((Number.isFinite(v) ? v : 0) * 10) / 10));

  return {
    calorii: intreg(totaluri.calorii, PLAFON_CALORII),
    proteine: zecimala(totaluri.proteine, PLAFON_MACRO),
    grasimi: zecimala(totaluri.grasimi, PLAFON_MACRO),
    carbohidrati: zecimala(totaluri.carbohidrati, PLAFON_MACRO),
    fibre: zecimala(totaluri.fibre, PLAFON_MACRO),
  };
}

/** Comoditate: setul canonic de mese → totaluri gata de afișat, într-un singur pas. */
export function totaluriZiAfisate(mese: readonly Masa[] | null | undefined): TotaluriZi {
  return totaluriPentruAfisare(calculeazaTotaluriZi(mese));
}
