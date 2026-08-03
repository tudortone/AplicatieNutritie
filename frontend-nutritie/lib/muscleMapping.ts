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
 *
 * Id-urile canonice sunt cele 19 din geometria reala (assets/anatomy/*.svg,
 * components/fitness/anatomyFront.ts / anatomyBack.ts): abs, adductors, biceps,
 * calves, chest, delts, forearms, glutes, hamstrings, hip_flexors, infraspinatus,
 * lats, lower_back, neck, obliques, quads, serratus, traps, triceps.
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
  chest: 'chest',
  piept: 'chest',
  pectoral: 'chest',
  pectorali: 'chest',
  pectoralis: 'chest',
  pectoralis_major: 'chest',
  // spate
  back: 'lats',
  spate: 'lats',
  lats: 'lats',
  latissimus: 'lats',
  dorsali: 'lats',
  rhomboids: 'traps',
  romboizi: 'traps',
  lower_back: 'lower_back',
  lombari: 'lower_back',
  erector_spinae: 'lower_back',
  trapezius: 'traps',
  traps: 'traps',
  trapez: 'traps',
  infraspinatus: 'infraspinatus',
  infraspinos: 'infraspinatus',
  neck: 'neck',
  gat: 'neck',
  cervicali: 'neck',
  // umeri
  shoulders: 'delts',
  umeri: 'delts',
  delts: 'delts',
  front_delts: 'delts',
  deltoid_anterior: 'delts',
  umeri_anteriori: 'delts',
  side_delts: 'delts',
  delts_side: 'delts',
  lateral_delts: 'delts',
  deltoid_lateral: 'delts',
  umeri_laterali: 'delts',
  rear_delts: 'delts',
  delts_rear: 'delts',
  deltoid_posterior: 'delts',
  umeri_posteriori: 'delts',
  // brate
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  antebrate: 'forearms',
  brahioradial: 'forearms',
  // trunchi
  core: 'abs',
  abs: 'abs',
  abdomen: 'abs',
  abdominali: 'abs',
  obliques: 'obliques',
  oblici: 'obliques',
  serratus: 'serratus',
  seratus: 'serratus',
  // picioare
  glutes: 'glutes',
  fesieri: 'glutes',
  quads: 'quads',
  quadriceps: 'quads',
  cvadriceps: 'quads',
  hamstrings: 'hamstrings',
  ischiogambieri: 'hamstrings',
  femurali: 'hamstrings',
  calves: 'calves',
  gambe: 'calves',
  soleus: 'calves',
  adductors: 'adductors',
  adductori: 'adductors',
  hip_flexors: 'hip_flexors',
  flexori_sold: 'hip_flexors',
  psoas: 'hip_flexors',
  // Nu exista slot de abductori in desenul anatomic — se distribuie pe fesieri (zona soldului).
  abductors: 'glutes',
  abductori: 'glutes',
  gluteus_medius: 'glutes',
};

/** Grupe generice care se distribuie pe mai multi muschi. */
const GROUP_EXPANSIONS: Record<string, CanonicalMuscleWeight[]> = {
  umeri: [{ id: 'delts', weight: 1.0 }],
  deltoizi: [{ id: 'delts', weight: 1.0 }],
  brate: [
    { id: 'biceps', weight: 0.7 },
    { id: 'triceps', weight: 0.7 },
    { id: 'forearms', weight: 0.4 },
  ],
  arms: [
    { id: 'biceps', weight: 0.7 },
    { id: 'triceps', weight: 0.7 },
    { id: 'forearms', weight: 0.4 },
  ],
  spate: [
    { id: 'lats', weight: 1.0 },
    { id: 'traps', weight: 0.6 },
    { id: 'lower_back', weight: 0.4 },
  ],
  picioare: [
    { id: 'quads', weight: 1.0 },
    { id: 'hamstrings', weight: 0.7 },
    { id: 'glutes', weight: 0.7 },
    { id: 'calves', weight: 0.4 },
  ],
  legs: [
    { id: 'quads', weight: 1.0 },
    { id: 'hamstrings', weight: 0.7 },
    { id: 'glutes', weight: 0.7 },
    { id: 'calves', weight: 0.4 },
  ],
  full_body: [
    { id: 'quads', weight: 0.7 },
    { id: 'chest', weight: 0.6 },
    { id: 'lats', weight: 0.6 },
    { id: 'abs', weight: 0.6 },
  ],
  corp_intreg: [
    { id: 'quads', weight: 0.7 },
    { id: 'chest', weight: 0.6 },
    { id: 'lats', weight: 0.6 },
    { id: 'abs', weight: 0.6 },
  ],
  cardio: [
    { id: 'quads', weight: 0.7 },
    { id: 'calves', weight: 0.5 },
    { id: 'abs', weight: 0.4 },
  ],
};

/** Chei valide, dar care nu produc incarcare musculara (nu sunt erori). */
const NON_MUSCLE_KEYS = /mobilitate|stretching|intindere|incalzire|echilibru|recuperare|respiratie/;

/**
 * Reguli de potrivire partiala, aplicate in ordine. SPECIFIC INAINTE DE GENERIC.
 * Ordinea conteaza: "antebrate" inainte de "brate", "abductori" inainte de "adductori".
 */
const PARTIAL_RULES: Array<{ test: RegExp; result: CanonicalMuscleWeight[] }> = [
  { test: /pectorali|piept|pectoral/, result: [{ id: 'chest', weight: 1.0 }] },
  { test: /deltoid|deltoizi|umeri|delts|shoulder/, result: [{ id: 'delts', weight: 1.0 }] },
  // antebrate INAINTE de brate
  { test: /antebrate|forearms|brahioradial/, result: [{ id: 'forearms', weight: 1.0 }] },
  { test: /biceps/, result: [{ id: 'biceps', weight: 1.0 }] },
  { test: /triceps/, result: [{ id: 'triceps', weight: 1.0 }] },
  { test: /^brate$|brahial/, result: GROUP_EXPANSIONS.brate },
  { test: /abdomen|abdominali|core|^abs$/, result: [{ id: 'abs', weight: 1.0 }] },
  { test: /oblici|obliques/, result: [{ id: 'obliques', weight: 0.85 }] },
  { test: /trapez|traps|trapezius/, result: [{ id: 'traps', weight: 0.85 }] },
  { test: /^spate$/, result: GROUP_EXPANSIONS.spate },
  { test: /dorsali|lats|latissimus/, result: [{ id: 'lats', weight: 1.0 }] },
  { test: /lombari|lower_back|coloana/, result: [{ id: 'lower_back', weight: 0.8 }] },
  // Romboizii nu au slot separat in desen — se distribuie pe trapez (zona dintre omoplati).
  { test: /romboizi|rhomboids/, result: [{ id: 'traps', weight: 0.75 }] },
  { test: /infraspinatus|infraspinos/, result: [{ id: 'infraspinatus', weight: 0.8 }] },
  { test: /^gat$|cervicali|neck/, result: [{ id: 'neck', weight: 0.8 }] },
  { test: /serratus|seratus/, result: [{ id: 'serratus', weight: 0.8 }] },
  { test: /fesieri|glutes|solduri/, result: [{ id: 'glutes', weight: 0.9 }] },
  { test: /^picioare$/, result: GROUP_EXPANSIONS.picioare },
  { test: /cvadriceps|quads|quadriceps/, result: [{ id: 'quads', weight: 1.0 }] },
  { test: /ischiogambieri|hamstrings|femurali/, result: [{ id: 'hamstrings', weight: 0.9 }] },
  { test: /gambe|calves|soleus/, result: [{ id: 'calves', weight: 0.8 }] },
  { test: /hip_flexors|flexori_sold|psoas/, result: [{ id: 'hip_flexors', weight: 0.8 }] },
  // abductori INAINTE de adductori (altfel /adductori/ ar prinde si "abductori")
  { test: /abductori|abductors|fesier_mijlociu|gluteus_medius/, result: [{ id: 'glutes', weight: 0.7 }] },
  { test: /adductori|adductors/, result: [{ id: 'adductors', weight: 0.7 }] },
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
