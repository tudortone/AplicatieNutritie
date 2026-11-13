import i18next from 'i18next';
import roLocale from '../i18n/locales/ro.json';
import enLocale from '../i18n/locales/en.json';
import frLocale from '../i18n/locales/fr.json';
import deLocale from '../i18n/locales/de.json';

const LOCALE_BUNDLES = {
  ro: roLocale,
  en: enLocale,
  fr: frLocale,
  de: deLocale,
} as const;

export type SportTranslateFn = (key: string, options?: Record<string, unknown>) => string;

function lookupBundleKey(lang: string, key: string): string | undefined {
  const base = String(lang || 'ro').toLowerCase().split('-')[0] as keyof typeof LOCALE_BUNDLES;
  const bundle = LOCALE_BUNDLES[base] ?? roLocale;
  const val = key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    bundle,
  );
  return typeof val === 'string' ? val : undefined;
}

export function sportKeyExists(key: string): boolean {
  if (i18next.isInitialized) return i18next.exists(key);
  return lookupBundleKey('ro', key) !== undefined || lookupBundleKey('en', key) !== undefined;
}

export const defaultTranslate: SportTranslateFn = (key, options) => {
  if (i18next.isInitialized) {
    const res = options
      ? i18next.t(key, options as Record<string, string>)
      : i18next.t(key);
    return String(res);
  }
  const raw =
    lookupBundleKey(i18next.language || 'ro', key) ??
    lookupBundleKey('ro', key) ??
    lookupBundleKey('en', key);
  if (raw === undefined) {
    return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
  }
  return Object.entries(options ?? {}).reduce(
    (acc, [k, v]) => (k === 'defaultValue' ? acc : acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))),
    raw,
  );
};

export const sportI18n = {
  t: defaultTranslate,
  exists: sportKeyExists,
  get language() {
    return i18next.language || 'ro';
  },
};

const i18n = sportI18n;

/**
 * Strips diacritics and collapses punctuation/whitespace for locale-independent search.
 */
export function normalizeSearchText(value: string): string {
  return String(value ?? '')
    .replace(/ß/g, 'ss')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSportLocaleTag(language?: string): string {
  const base = String(language || i18n.language || 'en')
    .toLowerCase()
    .split('-')[0];
  switch (base) {
    case 'ro':
      return 'ro-RO';
    case 'fr':
      return 'fr-FR';
    case 'de':
      return 'de-DE';
    default:
      return 'en-US';
  }
}

export function getLocalizedExerciseName(
  exerciseOrId: string | { id?: string; nume?: string; name?: string } | null | undefined,
  fallbackOrT?: string | SportTranslateFn,
  maybeT: SportTranslateFn = defaultTranslate,
): string {
  const fallback = typeof fallbackOrT === 'string' ? fallbackOrT : undefined;
  const t = typeof fallbackOrT === 'function' ? fallbackOrT : maybeT;
  const id = typeof exerciseOrId === 'string' ? exerciseOrId : exerciseOrId?.id;
  const fb =
    fallback ??
    (typeof exerciseOrId === 'string'
      ? exerciseOrId
      : exerciseOrId?.nume || exerciseOrId?.name || exerciseOrId?.id) ??
    '';

  if (!id) return fb;
  const key = `sport.exercises.${id}`;
  if (i18n.exists(key)) {
    return t(key, { defaultValue: fb });
  }
  return fb;
}

export function getLocalizedExerciseDescription(
  exercise: { id: string; descriere?: string },
  t: SportTranslateFn = defaultTranslate,
): string {
  const key = `sport.exerciseDetails.${exercise.id}.description`;
  if (i18n.exists(key)) {
    return t(key);
  }
  if (exercise.descriere) {
    return exercise.descriere;
  }
  return t('sport.detail.defaultDesc');
}

function readIndexedTranslationList(
  prefix: string,
  t: SportTranslateFn,
): string[] | null {
  const items: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const key = `${prefix}.${i}`;
    if (!i18n.exists(key)) break;
    items.push(t(key));
  }
  return items.length > 0 ? items : null;
}

export function getLocalizedExerciseInstructions(
  exercise: { id: string; instructiuni?: string[] },
  t: SportTranslateFn = defaultTranslate,
): string[] {
  const localized = readIndexedTranslationList(
    `sport.exerciseDetails.${exercise.id}.instructions`,
    t,
  );
  if (localized) return localized;
  if (exercise.instructiuni && exercise.instructiuni.length > 0) {
    return exercise.instructiuni;
  }
  return [t('sport.detail.defaultInstruction')];
}

export function getLocalizedExerciseMistakes(
  exercise: { id: string; greseliComune?: string[] },
  t: SportTranslateFn = defaultTranslate,
): string[] {
  const localized = readIndexedTranslationList(
    `sport.exerciseDetails.${exercise.id}.mistakes`,
    t,
  );
  if (localized) return localized;
  return exercise.greseliComune ?? [];
}

export function getLocalizedCategoryName(
  categoryId: string,
  fallbackOrT?: string | SportTranslateFn,
  maybeT: SportTranslateFn = defaultTranslate,
): string {
  const fallback = typeof fallbackOrT === 'string' ? fallbackOrT : undefined;
  const t = typeof fallbackOrT === 'function' ? fallbackOrT : maybeT;
  const key = `sport.categories.${categoryId}`;
  if (i18n.exists(key)) {
    return t(key, { defaultValue: fallback ?? categoryId });
  }
  return fallback ?? categoryId;
}

export function getLocalizedDifficulty(
  difficulty: string,
  t: SportTranslateFn = defaultTranslate,
): string {
  const norm = normalizeSearchText(difficulty);
  const key = `sport.difficulties.${norm}`;
  if (i18n.exists(key)) {
    return t(key, { defaultValue: difficulty });
  }
  return difficulty;
}

const MUSCLE_ALIASES: Record<string, string> = {
  piept: 'chest',
  chest: 'chest',
  pectorali: 'chest',
  pectorals: 'chest',
  'pectoral superior': 'upper_chest',
  'upper chest': 'upper_chest',
  'pectoral inferior': 'lower_chest',
  'lower chest': 'lower_chest',
  'pectoral interior': 'inner_chest',
  'inner chest': 'inner_chest',
  umeri: 'shoulders',
  shoulders: 'shoulders',
  deltoizi: 'delts',
  delts: 'delts',
  'deltoid anterior': 'front_delts',
  'front delts': 'front_delts',
  'deltoid lateral': 'side_delts',
  'side delts': 'side_delts',
  'deltoid posterior': 'rear_delts',
  'rear delts': 'rear_delts',
  spate: 'back',
  back: 'back',
  dorsali: 'lats',
  lats: 'lats',
  trapez: 'traps',
  traps: 'traps',
  trapezius: 'traps',
  'trapez mijlociu': 'mid_traps',
  'mid traps': 'mid_traps',
  romboizi: 'rhomboids',
  rhomboids: 'rhomboids',
  infraspinos: 'infraspinatus',
  infraspinatus: 'infraspinatus',
  lombari: 'lower_back',
  'lower back': 'lower_back',
  gat: 'neck',
  neck: 'neck',
  brate: 'arms',
  arms: 'arms',
  biceps: 'biceps',
  brahial: 'brachialis',
  brachialis: 'brachialis',
  triceps: 'triceps',
  antebrate: 'forearms',
  forearms: 'forearms',
  prindere: 'grip',
  grip: 'grip',
  abdomen: 'abs',
  abdomeni: 'abs',
  abs: 'abs',
  'abdomeni inferiori': 'lower_abs',
  'lower abs': 'lower_abs',
  'transvers abdominal': 'transverse_abs',
  'transverse abs': 'transverse_abs',
  oblici: 'obliques',
  obliques: 'obliques',
  'seratus anterior': 'serratus',
  serratus: 'serratus',
  picioare: 'legs',
  legs: 'legs',
  fesieri: 'glutes',
  glutes: 'glutes',
  cvadriceps: 'quads',
  quads: 'quads',
  femurali: 'hamstrings',
  ischiogambieri: 'hamstrings',
  hamstrings: 'hamstrings',
  gambe: 'calves',
  calves: 'calves',
  adductori: 'adductors',
  adductors: 'adductors',
  abductori: 'abductors',
  abductors: 'abductors',
  'flexori sold': 'hip_flexors',
  'flexori de sold': 'hip_flexors',
  'hip flexors': 'hip_flexors',
  solduri: 'hips',
  hips: 'hips',
  cardio: 'cardio',
  core: 'core',
  coloana: 'spine',
  spine: 'spine',
  'corp intreg': 'full_body',
  'full body': 'full_body',
  mobilitate: 'mobility',
  mobility: 'mobility',
};

export function getLocalizedMuscleLabel(
  rawMuscle: string,
  t: SportTranslateFn = defaultTranslate,
): string {
  const norm = normalizeSearchText(rawMuscle);
  const mapped = MUSCLE_ALIASES[norm] ?? norm.replace(/\s+/g, '_');
  const key = `sport.muscles.${mapped}`;
  if (i18n.exists(key)) {
    return t(key, { defaultValue: rawMuscle });
  }
  const v2Key = `workoutV2.muscles.${mapped}`;
  if (i18n.exists(v2Key)) {
    return t(v2Key, { defaultValue: rawMuscle });
  }
  return rawMuscle;
}

const EQUIPMENT_ALIASES: Record<string, string> = {
  bara: 'barbell',
  barbell: 'barbell',
  'bara ez': 'ez_bar',
  gantera: 'dumbbell',
  gantere: 'dumbbell',
  dumbbell: 'dumbbell',
  banca: 'bench',
  'banca scott': 'bench',
  'banca romana': 'bench',
  bench: 'bench',
  cablu: 'cable',
  cabluri: 'cable',
  cable: 'cable',
  aparat: 'machine',
  masina: 'machine',
  machine: 'machine',
  bodyweight: 'bodyweight',
  corp: 'bodyweight',
  'greutate corporala': 'bodyweight',
  niciunul: 'bodyweight',
  'corp+greutate': 'weighted',
  greutate: 'weighted',
  greutati: 'plate',
  disc: 'plate',
  kettlebell: 'kettlebell',
  bicicleta: 'cardio',
  cardio: 'cardio',
  'banda elastica': 'band',
  benzi: 'band',
  band: 'band',
  'bara fixa': 'pullup_bar',
  'pullup bar': 'pullup_bar',
  paralele: 'parallel_bars',
  'parallel bars': 'parallel_bars',
  roata: 'ab_wheel',
  'roata abdominala': 'ab_wheel',
  'roata abdomen': 'ab_wheel',
  rola: 'ab_wheel',
  'ab wheel': 'ab_wheel',
  'minge medicinala': 'medicine_ball',
  'medicine ball': 'medicine_ball',
  coarda: 'rope',
  frenghii: 'rope',
  franghii: 'rope',
  funii: 'rope',
  rope: 'rope',
  'foam roller': 'foam_roller',
  sanie: 'sled',
  cutie: 'box',
  baston: 'stick',
  gripper: 'gripper',
  other: 'other',
  altele: 'other',
};

export function getLocalizedEquipmentLabel(
  rawEquipment: string,
  t: SportTranslateFn = defaultTranslate,
): string {
  const norm = normalizeSearchText(rawEquipment);
  const directLower = String(rawEquipment ?? '').trim().toLowerCase();
  const mapped =
    EQUIPMENT_ALIASES[directLower] ??
    EQUIPMENT_ALIASES[norm] ??
    norm.replace(/\s+/g, '_');
  const key = `sport.equipment.${mapped}`;
  if (i18n.exists(key)) {
    return t(key, { defaultValue: rawEquipment });
  }
  return rawEquipment;
}

export function filterExercisesByCategory<T extends { categorie: string }>(
  exercises: T[],
  categoryId: string,
): T[] {
  if (categoryId === 'full-body' || categoryId === 'corp_intreg') {
    return exercises.filter(
      (ex) => ex.categorie === 'full-body' || ex.categorie === 'corp_intreg',
    );
  }
  return exercises.filter((ex) => ex.categorie === categoryId);
}
