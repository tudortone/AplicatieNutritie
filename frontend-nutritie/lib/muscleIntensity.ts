/**
 * muscleIntensity.ts — pipeline unic de intensitate pentru harta musculara.
 *
 * Context (audit harta musculara):
 * `MuscleHeatmapSVG` primea uneori tonaj brut (kg) si alteori valori deja
 * normalizate 0..1, fara sa stie care. Ghicea prin euristica:
 *
 *   const isRatio = Math.max(...values) <= 1;
 *
 * Asta se rupe in doua situatii reale:
 *   1. un antrenament cu tonaj total sub 1 kg (banda elastica, greutate corporala
 *      contorizata partial) este interpretat drept procente;
 *   2. daca euristica greseste, valorile trec inca o data prin scalarea
 *      logaritmica si cad la ~0.08 — corpul apare complet stins.
 *
 * Solutia: sursa datelor declara EXPLICIT ce trimite. Nu se mai ghiceste niciodata.
 */

import { mapToCanonicalMuscleIds, type MuscleId } from './muscleMapping';
import { ALL_MUSCLE_IDS } from '../constants/muscles';

/** Intensitati normalizate 0..1 pe muschi canonic. */
export type IntensityMap = Partial<Record<MuscleId, number>>;

/**
 * Intrarea in pipeline. `tip` este obligatoriu — exact asta elimina ghicitul.
 *
 * - `tonaj`: kilograme ridicate (serii x repetari x greutate). Se normalizeaza
 *   logaritmic, pentru ca diferenta 0 -> 500 kg conteaza mult mai mult decat
 *   9500 -> 10000 kg.
 * - `ratio`: valori deja normalizate 0..1. Se folosesc ca atare.
 * - `serii`: numar de serii efectuate pe muschi. Se normalizeaza la un prag de
 *   saturatie (implicit 12 serii pe saptamana = intensitate maxima).
 */
export type MuscleLoadInput =
  | { tip: 'tonaj'; valori: Record<string, number> }
  | { tip: 'ratio'; valori: Record<string, number> }
  | { tip: 'serii'; valori: Record<string, number>; saturatie?: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** Prag implicit de saturatie pentru volumul saptamanal, in serii per muschi. */
export const SERII_SATURATIE = 12;

/**
 * Normalizare logaritmica a tonajului, raportata la maximul din setul curent.
 * Rezultatul este intotdeauna in 0..1, iar muschiul cu tonajul maxim primeste 1.
 */
function normalizeTonaj(valori: Record<string, number>): Record<string, number> {
  const pozitive = Object.values(valori).filter((v) => Number.isFinite(v) && v > 0);
  if (pozitive.length === 0) return {};

  const max = Math.max(...pozitive);
  const logMax = Math.log1p(max);
  if (logMax <= 0) return {};

  const out: Record<string, number> = {};
  for (const [cheie, valoare] of Object.entries(valori)) {
    if (!Number.isFinite(valoare) || valoare <= 0) continue;
    out[cheie] = clamp01(Math.log1p(valoare) / logMax);
  }
  return out;
}

function normalizeSerii(
  valori: Record<string, number>,
  saturatie: number,
): Record<string, number> {
  const prag = saturatie > 0 ? saturatie : SERII_SATURATIE;
  const out: Record<string, number> = {};
  for (const [cheie, valoare] of Object.entries(valori)) {
    if (!Number.isFinite(valoare) || valoare <= 0) continue;
    out[cheie] = clamp01(valoare / prag);
  }
  return out;
}

/**
 * Traduce cheile brute ("piept", "chest", "lats", "picioare") in MuscleId canonic,
 * aplicand ponderile din `muscleMapping`. Cand doua chei brute cad pe acelasi
 * muschi, se pastreaza valoarea maxima (nu se aduna — ar depasi 1).
 *
 * Aici era al doilea bug major: harta desena dupa MuscleId canonic
 * ("pectorali"), dar primea chei brute ("piept"), deci nicio suprafata nu se
 * aprindea niciodata, oricate antrenamente ar fi fost salvate.
 */
function canonicalize(valori: Record<string, number>): IntensityMap {
  const out: IntensityMap = {};
  for (const [cheie, valoare] of Object.entries(valori)) {
    if (!Number.isFinite(valoare) || valoare <= 0) continue;
    for (const { id, weight } of mapToCanonicalMuscleIds(cheie)) {
      const nou = clamp01(valoare * weight);
      out[id] = Math.max(out[id] ?? 0, nou);
    }
  }
  return out;
}

/**
 * Punctul unic de intrare al hartii musculare.
 * Orice ecran care afiseaza harta trebuie sa treaca prin aceasta functie.
 */
export function buildIntensityMap(input: MuscleLoadInput | null | undefined): IntensityMap {
  if (!input || !input.valori || Object.keys(input.valori).length === 0) return {};

  switch (input.tip) {
    case 'ratio':
      return canonicalize(input.valori);
    case 'tonaj':
      return canonicalize(normalizeTonaj(input.valori));
    case 'serii':
      return canonicalize(normalizeSerii(input.valori, input.saturatie ?? SERII_SATURATIE));
    default:
      return {};
  }
}

/** Numarul de muschi considerati "lucrati" (peste pragul de vizibilitate). */
export function countMuschiActivi(map: IntensityMap, prag = 0.05): number {
  return Object.values(map).filter((v) => (v ?? 0) >= prag).length;
}

/** Muschii sortati descrescator dupa intensitate — util pentru rezumate si topuri. */
export function topMuschi(map: IntensityMap, limita = 5): Array<{ id: MuscleId; valoare: number }> {
  return (Object.entries(map) as Array<[MuscleId, number]>)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limita)
    .map(([id, valoare]) => ({ id, valoare }));
}

/**
 * Muschii neglijati: sub prag, dintr-un set complet de muschi canonici.
 * Util pentru sugestii de tip "nu ai lucrat spatele saptamana asta".
 */
export function muschiNeglijati(map: IntensityMap, prag = 0.15): MuscleId[] {
  return (ALL_MUSCLE_IDS as MuscleId[]).filter((id) => (map[id] ?? 0) < prag);
}
