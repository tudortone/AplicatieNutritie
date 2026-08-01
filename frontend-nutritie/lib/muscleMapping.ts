/**
 * muscleMapping.ts — SURSA UNICA DE ADEVAR pentru maparea oricarei denumiri
 * de muschi (romana / engleza / cheie de catalog / mesh 3D) catre MuscleId canonic.
 *
 * FIX: inainte existau doua implementari paralele si divergente:
 *   - `toCanonicalMuscle` in components/fitness/exerciseIntensity.ts (dictionar de alias-uri)
 *   - `mapToCanonicalMuscleIds` in lib/fitnessEngine.ts (reguli regex)
 * Rezultatul: aceeasi denumire putea fi recunoscuta intr-un ecran si ignorata in altul
 * (ex: "abductori" lipsea complet din dictionarul de alias-uri).
 * Acum ambele fisiere re-exporta din acest modul.
 */

import { ALL_MUSCLE_IDS, type MuscleId } from '../components/fitness/heatColor';

export type { MuscleId };

/** Rezultatul mapping-ului: un muschi canonic + ponderea contributiei (0..1). */
export type CanonicalMuscleWeight = { id: MuscleId; weight: number };

const CANONICAL_IDS: MuscleId[] = ALL_MUSCLE_IDS as unknown as MuscleId[];

/** Normalizeaza o cheie: lowercase, fara diacritice, spatii/liniute -> underscore. */
export function normalizeMuscleKey(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

/**
 * Dictionar de alias-uri (1:1). Cheile sunt deja normalizate (vezi normalizeMuscleKey).
 * Contine si alias-urile canonice catre ele insele, ca sa nu depinda de ordinea verificarilor.
 */
export const MUSCLE_ALIASES: Record<string, MuscleId> = {
  // piept
  chest: 'pectorali',
  piept: 'pectorali',
  pectoral: 'pectorali',
  pectorali: 'pectorali',
  pectoralis: 'pectorali',
  pectoralis_major: 'pectorali',
  // spate
  back: 'dorsali',
  spate: 'dorsali',
  lats: 'dorsali',
  latissimus: 'dorsali',
  dorsali: 'dorsali',
  rhomboids: 'romboizi',
  romboizi: 'romboizi',
  lower_back: 'lombari',
  lombari: 'lombari',
  erector_spinae: 'lombari',
  trapezius: 'trapez',
  traps: 'trapez',
  trapez: 'trapez',
  // umeri
  shoulders: 'deltoid_anterior',
  umeri: 'deltoid_anterior',
  delts: 'deltoid_anterior',
  front_delts: 'deltoid_anterior',
  deltoid_anterior: 'deltoid_anterior',
  umeri_anteriori: 'deltoid_anterior',
  side_delts: 'deltoid_lateral',
  delts_side: 'deltoid_lateral',
  lateral_delts: 'deltoid_lateral',
  deltoid_lateral: 'deltoid_lateral',
  umeri_laterali: 'deltoid_lateral',
  rear_delts: 'deltoid_posterior',
  delts_rear: 'deltoid_posterior',
  deltoid_posterior: 'deltoid_posterior',
  umeri_posteriori: 'deltoid_posterior',
  // brate
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'antebrate',
  antebrate: 'antebrate',
  brahioradial: 'antebrate',
  // trunchi
  core: 'abdomen',
  abs: 'abdomen',
  abdomen: 'abdomen',
  abdominali: 'abdomen',
  obliques: 'oblici',
  oblici: 'oblici',
  // picioare
  glutes: 'fesieri',
  fesieri: 'fesieri',
  quads: 'cvadriceps',
  quadriceps: 'cvadriceps',
  cvadriceps: 'cvadriceps',
  hamstrings: 'ischiogambieri',
  ischiogambieri: 'ischiogambieri',
  femurali: 'ischiogambieri',
  calves: 'gambe',
  gambe: 'gambe',
  soleus: 'gambe',
  adductors: 'adductori',
  adductori: 'adductori',
  // FIX: abductorii lipseau complet din dictionar => erau tratati ca adductori sau ignorati
  abductors: 'abductori',
  abductori: 'abductori',
  gluteus_medius: 'abductori',
};

/** Grupe generice care se distribuie pe mai multi muschi. */
const GROUP_EXPANSIONS: Record<string, CanonicalMuscleWeight[]> = {
  umeri: [
    { id: 'deltoid_anterior', weight: 0.8 },
    { id: 'deltoid_lateral', weight: 0.8 },
    { id: 'deltoid_posterior', weight: 0.5 },
  ],
  deltoizi: [
    { id: 'deltoid_anterior', weight: 0.8 },
    { id: 'deltoid_lateral', weight: 0.8 },
    { id: 'deltoid_posterior', weight: 0.5 },
  ],
  brate: [
    { id: 'biceps', weight: 0.7 },
    { id: 'triceps', weight: 0.7 },
    { id: 'antebrate', weight: 0.4 },
  ],
  arms: [
    { id: 'biceps', weight: 0.7 },
    { id: 'triceps', weight: 0.7 },
    { id: 'antebrate', weight: 0.4 },
  ],
  spate: [
    { id: 'dorsali', weight: 1.0 },
    { id: 'trapez', weight: 0.6 },
    { id: 'romboizi', weight: 0.6 },
    { id: 'lombari', weight: 0.4 },
  ],
  picioare: [
    { id: 'cvadriceps', weight: 1.0 },
    { id: 'ischiogambieri', weight: 0.7 },
    { id: 'fesieri', weight: 0.7 },
    { id: 'gambe', weight: 0.4 },
  ],
  legs: [
    { id: 'cvadriceps', weight: 1.0 },
    { id: 'ischiogambieri', weight: 0.7 },
    { id: 'fesieri', weight: 0.7 },
    { id: 'gambe', weight: 0.4 },
  ],
  full_body: [
    { id: 'cvadriceps', weight: 0.7 },
    { id: 'pectorali', weight: 0.6 },
    { id: 'dorsali', weight: 0.6 },
    { id: 'abdomen', weight: 0.6 },
  ],
  corp_intreg: [
    { id: 'cvadriceps', weight: 0.7 },
    { id: 'pectorali', weight: 0.6 },
    { id: 'dorsali', weight: 0.6 },
    { id: 'abdomen', weight: 0.6 },
  ],
  cardio: [
    { id: 'cvadriceps', weight: 0.7 },
    { id: 'gambe', weight: 0.5 },
    { id: 'abdomen', weight: 0.4 },
  ],
};

/** Chei valide, dar care nu produc incarcare musculara (nu sunt erori). */
const NON_MUSCLE_KEYS = /mobilitate|stretching|intindere|incalzire|echilibru|recuperare|respiratie/;

/**
 * Reguli de potrivire partiala, aplicate in ordine. SPECIFIC INAINTE DE GENERIC.
 * Ordinea conteaza: "antebrate" inainte de "brate", "abductori" inainte de "adductori".
 */
const PARTIAL_RULES: Array<{ test: RegExp; result: CanonicalMuscleWeight[] }> = [
  { test: /pectorali|piept|pectoral/, result: [{ id: 'pectorali', weight: 1.0 }] },
  { test: /deltoid_anterior|umeri_anteriori/, result: [{ id: 'deltoid_anterior', weight: 1.0 }] },
  { test: /deltoid_lateral|umeri_laterali/, result: [{ id: 'deltoid_lateral', weight: 1.0 }] },
  { test: /deltoid_posterior|umeri_posteriori/, result: [{ id: 'deltoid_posterior', weight: 1.0 }] },
  { test: /^umeri$|deltoizi/, result: GROUP_EXPANSIONS.umeri },
  // antebrate INAINTE de brate
  { test: /antebrate|brahioradial/, result: [{ id: 'antebrate', weight: 1.0 }] },
  { test: /biceps/, result: [{ id: 'biceps', weight: 1.0 }] },
  { test: /triceps/, result: [{ id: 'triceps', weight: 1.0 }] },
  { test: /^brate$|brahial/, result: GROUP_EXPANSIONS.brate },
  { test: /abdomen|abdominali|core/, result: [{ id: 'abdomen', weight: 1.0 }] },
  { test: /oblici/, result: [{ id: 'oblici', weight: 0.85 }] },
  { test: /trapez/, result: [{ id: 'trapez', weight: 0.85 }] },
  { test: /^spate$/, result: GROUP_EXPANSIONS.spate },
  { test: /dorsali/, result: [{ id: 'dorsali', weight: 1.0 }] },
  { test: /lombari|coloana/, result: [{ id: 'lombari', weight: 0.8 }] },
  { test: /romboizi/, result: [{ id: 'romboizi', weight: 0.75 }] },
  { test: /fesieri|solduri/, result: [{ id: 'fesieri', weight: 0.9 }] },
  { test: /^picioare$/, result: GROUP_EXPANSIONS.picioare },
  { test: /cvadriceps/, result: [{ id: 'cvadriceps', weight: 1.0 }] },
  { test: /ischiogambieri|femurali/, result: [{ id: 'ischiogambieri', weight: 0.9 }] },
  { test: /gambe/, result: [{ id: 'gambe', weight: 0.8 }] },
  // abductori INAINTE de adductori (altfel /adductori/ ar prinde si "abductori")
  { test: /abductori|fesier_mijlociu/, result: [{ id: 'abductori', weight: 1.0 }] },
  { test: /adductori/, result: [{ id: 'adductori', weight: 0.7 }] },
  { test: /full_body|corp_intreg|cardio/, result: GROUP_EXPANSIONS.full_body },
];

/**
 * Mapare 1:1 catre un MuscleId canonic. Returneaza null daca denumirea nu e recunoscuta.
 * Pentru grupe generice (ex: "picioare") returneaza muschiul dominant.
 */
export function toCanonicalMuscle(value: string): MuscleId | null {
  const key = normalizeMuscleKey(value);
  if (!key) return null;
  if (CANONICAL_IDS.includes(key as MuscleId)) return key as MuscleId;
  const alias = MUSCLE_ALIASES[key];
  if (alias) return alias;
  const expanded = mapToCanonicalMuscleIds(value);
  return expanded.length > 0 ? expanded[0].id : null;
}

/**
 * Mapeaza orice denumire catre lista de MuscleId canonice + ponderi.
 * Returneaza [] pentru chei non-musculare (mobilitate, stretching etc.).
 */
export function mapToCanonicalMuscleIds(key: string): CanonicalMuscleWeight[] {
  const g = normalizeMuscleKey(key);
  if (!g) return [];

  // 1. Este deja un MuscleId canonic?
  if (CANONICAL_IDS.includes(g as MuscleId)) {
    return [{ id: g as MuscleId, weight: 1.0 }];
  }

  // 2. Grupa generica cunoscuta?
  const group = GROUP_EXPANSIONS[g];
  if (group) return group;

  // 3. Alias exact?
  const alias = MUSCLE_ALIASES[g];
  if (alias) return [{ id: alias, weight: 1.0 }];

  // 4. Chei valide fara incarcare musculara.
  if (NON_MUSCLE_KEYS.test(g)) return [];

  // 5. Potrivire partiala (specific inainte de generic).
  for (const rule of PARTIAL_RULES) {
    if (rule.test.test(g)) return rule.result;
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[muscle] cheie nemapata:', g);
  }
  return [];
}
