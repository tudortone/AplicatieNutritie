/**
 * questsEngine.ts — Questuri zilnice și streak.
 *
 * Regulile de bază:
 *  - în fiecare zi se generează 3 questuri, alese determinist după dată
 *    (aceeași zi → aceleași questuri, indiferent de câte ori se deschide ecranul);
 *  - progresul se recalculează din antrenamentele zilei, nu se incrementează
 *    manual — astfel ștergerea unui set nu lasă progres fantomă;
 *  - o zi cu măcar un antrenament scurt crește streak-ul.
 *
 * Fișierul nu depinde de UI și nu importă nimic din React, ca să poată fi testat
 * și refolosit și în alte ecrane.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUEST_STATE_KEY = 'nutriai_quests_v1';
export const REWARD_STATE_KEY = 'nutriai_rewards_v1';

/** Un antrenament "mic" care contează pentru streak. */
export const MINI_WORKOUT_MIN_SETS = 3;
export const MINI_WORKOUT_MIN_MINUTES = 5;

// ─── Tipuri ───────────────────────────────────────────────────

export type QuestMetric =
  | 'sets'
  | 'volumeKg'
  | 'muscles'
  | 'exercises'
  | 'minutes'
  | 'reps';

export type QuestDef = {
  id: string;
  metric: QuestMetric;
  title: string;
  target: number;
  unit: string;
  xp: number;
  icon: string;
};

export type Quest = QuestDef & {
  progress: number;
  done: boolean;
  /** 0..1 */
  ratio: number;
};

/** Rezumatul activității de azi, calculat din antrenamentele salvate. */
export type DailySnapshot = {
  sets: number;
  volumeKg: number;
  /** numărul de grupe musculare distincte lucrate */
  muscles: number;
  /** numărul de exerciții distincte */
  exercises: number;
  minutes: number;
  reps: number;
};

export const EMPTY_SNAPSHOT: DailySnapshot = {
  sets: 0,
  volumeKg: 0,
  muscles: 0,
  exercises: 0,
  minutes: 0,
  reps: 0,
};

export type QuestState = {
  /** cheia zilei, format YYYY-MM-DD */
  day: string;
  questIds: string[];
  /** questurile deja premiate azi, ca să nu se acorde XP de două ori */
  claimed: string[];
  xpToday: number;
};

export type RewardState = {
  /** ultima zi care a contat pentru streak */
  lastActiveDay: string | null;
  streak: number;
  bestStreak: number;
  totalXp: number;
};

export const EMPTY_REWARD_STATE: RewardState = {
  lastActiveDay: null,
  streak: 0,
  bestStreak: 0,
  totalXp: 0,
};

// ─── Utilitare de dată ───────────────────────────────────────────

/** Cheia zilei în ora locală (nu UTC — altfel ziua se schimbă la ore ciudate). */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  return dayKey(dt);
}

/** PRNG determinist (mulberry32) — aceeași zi produce aceleași questuri. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromDay(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Catalogul de questuri ────────────────────────────────────────

export const QUEST_POOL: QuestDef[] = [
  { id: 'sets_10', metric: 'sets', title: 'Zi de volum', target: 10, unit: 'seturi', xp: 40, icon: '💪' },
  { id: 'sets_16', metric: 'sets', title: 'Sesiune serioasă', target: 16, unit: 'seturi', xp: 65, icon: '🔥' },
  { id: 'vol_2000', metric: 'volumeKg', title: 'Două tone ridicate', target: 2000, unit: 'kg', xp: 60, icon: '🏋️' },
  { id: 'vol_5000', metric: 'volumeKg', title: 'Cinci tone ridicate', target: 5000, unit: 'kg', xp: 110, icon: '⛓️' },
  { id: 'musc_3', metric: 'muscles', title: 'Full body ușor', target: 3, unit: 'grupe', xp: 45, icon: '🧬' },
  { id: 'musc_5', metric: 'muscles', title: 'Hartă aprinsă', target: 5, unit: 'grupe', xp: 80, icon: '🌋' },
  { id: 'ex_4', metric: 'exercises', title: 'Varietate', target: 4, unit: 'exerciții', xp: 45, icon: '🎯' },
  { id: 'min_20', metric: 'minutes', title: 'Douăzeci de minute', target: 20, unit: 'min', xp: 35, icon: '⏱️' },
  { id: 'min_45', metric: 'minutes', title: 'Sesiune completă', target: 45, unit: 'min', xp: 75, icon: '⏳' },
  { id: 'reps_100', metric: 'reps', title: 'O sută de repetări', target: 100, unit: 'rep', xp: 55, icon: '🔁' },
];

/** Alege determinist 3 questuri pentru o zi: unul ușor, unul mediu, unul greu. */
export function pickDailyQuests(day: string): QuestDef[] {
  const rnd = seededRandom(seedFromDay(day));
  const byXp = [...QUEST_POOL].sort((a, b) => a.xp - b.xp);
  const third = Math.ceil(byXp.length / 3);
  const buckets = [
    byXp.slice(0, third),
    byXp.slice(third, third * 2),
    byXp.slice(third * 2),
  ];
  const picked: QuestDef[] = [];
  for (const bucket of buckets) {
    if (!bucket.length) continue;
    const idx = Math.floor(rnd() * bucket.length) % bucket.length;
    picked.push(bucket[idx]);
  }
  return picked;
}

function metricValue(snapshot: DailySnapshot, metric: QuestMetric): number {
  switch (metric) {
    case 'sets': return snapshot.sets;
    case 'volumeKg': return snapshot.volumeKg;
    case 'muscles': return snapshot.muscles;
    case 'exercises': return snapshot.exercises;
    case 'minutes': return snapshot.minutes;
    case 'reps': return snapshot.reps;
    default: return 0;
  }
}

/** Aplică progresul real peste definițiile questurilor. */
export function evaluateQuests(defs: QuestDef[], snapshot: DailySnapshot): Quest[] {
  return defs.map((def) => {
    const progress = Math.max(0, metricValue(snapshot, def.metric));
    const ratio = def.target > 0 ? Math.min(1, progress / def.target) : 0;
    return { ...def, progress, ratio, done: progress >= def.target };
  });
}

// ─── Persistență ──────────────────────────────────────────────

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stocarea locală poate eșua (spațiu plin) — nu blocăm UI-ul pentru asta
  }
}

export async function loadRewardState(): Promise<RewardState> {
  return readJson<RewardState>(REWARD_STATE_KEY, EMPTY_REWARD_STATE);
}

export async function saveRewardState(state: RewardState): Promise<void> {
  await writeJson(REWARD_STATE_KEY, state);
}

export async function loadQuestState(day = dayKey()): Promise<QuestState> {
  const fallback: QuestState = { day, questIds: [], claimed: [], xpToday: 0 };
  const stored = await readJson<QuestState>(QUEST_STATE_KEY, fallback);
  // Zi nouă → questuri noi, progres resetat
  if (stored.day !== day) return fallback;
  return stored;
}

// ─── API principal ─────────────────────────────────────────────

export type SyncResult = {
  quests: Quest[];
  /** questuri terminate chiar acum (pentru animație / toast) */
  justCompleted: Quest[];
  xpToday: number;
  reward: RewardState;
};

/**
 * Recalculează questurile și streak-ul din activitatea zilei.
 * Sigură la apeluri repetate: nu acordă de două ori același XP și nu crește
 * streak-ul de mai multe ori în aceeași zi.
 */
export async function syncProgress(
  snapshot: DailySnapshot,
  now: Date = new Date()
): Promise<SyncResult> {
  const day = dayKey(now);
  const [questState, rewardState] = await Promise.all([
    loadQuestState(day),
    loadRewardState(),
  ]);

  const defs = questState.questIds.length
    ? questState.questIds
        .map((id) => QUEST_POOL.find((q) => q.id === id))
        .filter((q): q is QuestDef => Boolean(q))
    : pickDailyQuests(day);

  const quests = evaluateQuests(defs, snapshot);

  const claimed = new Set(questState.claimed);
  const justCompleted: Quest[] = [];
  let xpToday = questState.xpToday;
  for (const q of quests) {
    if (q.done && !claimed.has(q.id)) {
      claimed.add(q.id);
      xpToday += q.xp;
      justCompleted.push(q);
    }
  }

  await writeJson(QUEST_STATE_KEY, {
    day,
    questIds: defs.map((d) => d.id),
    claimed: [...claimed],
    xpToday,
  } satisfies QuestState);

  // ─── Streak ───
  const isMiniWorkout =
    snapshot.sets >= MINI_WORKOUT_MIN_SETS ||
    snapshot.minutes >= MINI_WORKOUT_MIN_MINUTES;

  const next: RewardState = {
    ...rewardState,
    totalXp: rewardState.totalXp + justCompleted.reduce((s, q) => s + q.xp, 0),
  };

  if (isMiniWorkout && next.lastActiveDay !== day) {
    const continued = next.lastActiveDay === addDays(day, -1);
    next.streak = continued ? next.streak + 1 : 1;
    next.lastActiveDay = day;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
  } else if (
    !isMiniWorkout &&
    next.lastActiveDay &&
    next.lastActiveDay !== day &&
    next.lastActiveDay !== addDays(day, -1)
  ) {
    // Mai mult de o zi fără activitate → streak-ul se rupe
    next.streak = 0;
  }

  await saveRewardState(next);

  return { quests, justCompleted, xpToday, reward: next };
}
