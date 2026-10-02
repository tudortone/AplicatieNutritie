/**
 * adGate.ts — logica PURĂ (fără RN/MMKV/SDK) a "porții" de reclame pentru
 * utilizatorii gratuiți:
 * 1. 1 reclamă interstițială la fiecare 3 analize foto REUȘITE.
 * 2. 1 reclamă interstițială după mesajul #15 trimis în chat de utilizator către AI
 *    (afișată DOAR după ce răspunsul AI s-a finalizat complet).
 * 3. Cooldown partajat de minimum 10 minute (600 secunde) între ORICARE două reclame
 *    (previne: reclamă foto -> imediat reclamă chat).
 * 4. Utilizatori Premium / testeri interni: NICIODATĂ nicio reclamă.
 */

export const AD_EVERY_N_SUCCESSFUL_ANALYSES = 3;
export const AD_EVERY_N_CHAT_MESSAGES = 15;
export const SHARED_AD_COOLDOWN_SECONDS = 600; // 10 minute cooldown partajat
export const MIN_AD_INTERVAL_SECONDS_DEFAULT = SHARED_AD_COOLDOWN_SECONDS;

export type AdSource = 'photo' | 'chat';

export interface AdGateState {
  /** Numărul total de analize foto REUȘITE, de la instalare/cont (monoton). */
  successfulAnalysisCount: number;
  /** Numărul de mesaje trimise în chat de utilizator către AI (se resetează după reclamă). */
  chatMessageCount: number;
  /** Timestamp (ms epoch) al ULTIMEI încercări de afișare a unei reclame (partajat foto + chat). */
  lastAdShownAtMs: number | null;
  /** Valoarea contorului foto pentru care s-a încercat deja o reclamă (idempotency). */
  lastAdCounterValue: number | null;
  /** Valoarea contorului chat pentru care s-a încercat deja o reclamă. */
  lastChatAdCounterValue: number | null;
}

export const AD_GATE_INITIAL_STATE: Readonly<AdGateState> = Object.freeze({
  successfulAnalysisCount: 0,
  chatMessageCount: 0,
  lastAdShownAtMs: null,
  lastAdCounterValue: null,
  lastChatAdCounterValue: null,
});

function sanitizeNonNegativeInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function sanitizeNonNegativeIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Fail-safe: orice stare coruptă/veche/malformată (JSON parțial, NaN, negativ) redevine stare validă, niciodată aruncă. */
export function sanitizeAdGateState(raw: unknown): AdGateState {
  if (!raw || typeof raw !== 'object') return { ...AD_GATE_INITIAL_STATE };
  const r = raw as Partial<Record<keyof AdGateState, unknown>>;
  return {
    successfulAnalysisCount: sanitizeNonNegativeInt(r.successfulAnalysisCount),
    chatMessageCount: sanitizeNonNegativeInt(r.chatMessageCount),
    lastAdShownAtMs: sanitizeNonNegativeIntOrNull(r.lastAdShownAtMs),
    lastAdCounterValue: sanitizeNonNegativeIntOrNull(r.lastAdCounterValue),
    lastChatAdCounterValue: sanitizeNonNegativeIntOrNull(r.lastChatAdCounterValue),
  };
}

/**
 * Înregistrează O SINGURĂ analiză foto reușită. NU decide nimic despre
 * reclame — apelantul trebuie să apeleze `evaluateAdEligibility` separat.
 */
export function recordSuccessfulAnalysis(state: AdGateState): AdGateState {
  const safe = sanitizeAdGateState(state);
  return { ...safe, successfulAnalysisCount: safe.successfulAnalysisCount + 1 };
}

/**
 * Înregistrează UN SINGUR mesaj trimis de utilizator în chat către AI.
 */
export function recordChatUserMessage(state: AdGateState): AdGateState {
  const safe = sanitizeAdGateState(state);
  return { ...safe, chatMessageCount: safe.chatMessageCount + 1 };
}

export type AdEligibilityReason =
  | 'full-access'
  | 'zero-count'
  | 'not-multiple'
  | 'already-attempted-for-count'
  | 'min-interval'
  | 'eligible';

export interface AdEligibilityOptions {
  hasFullAccess: boolean;
  nowMs: number;
  source?: AdSource;
  everyN?: number;
  minIntervalSeconds?: number;
}

export interface AdEligibilityResult {
  eligible: boolean;
  reason: AdEligibilityReason;
  /**
   * Starea de persistat DOAR dacă apelantul CHIAR încearcă acum să afișeze
   * reclama (indiferent de succesul afișării). Dacă `eligible` e `false`,
   * este identică cu starea sanitizată de intrare (nicio schimbare).
   */
  nextStateIfAttempted: AdGateState;
}

/**
 * Decide dacă o reclamă interstițială poate fi încercată ACUM (foto sau chat).
 * Respectă cooldown-ul partajat de 10 minute între orice două afișări.
 */
export function evaluateAdEligibility(
  state: AdGateState,
  options: AdEligibilityOptions,
): AdEligibilityResult {
  const safe = sanitizeAdGateState(state);
  const source = options.source || 'photo';
  const minIntervalSeconds = options.minIntervalSeconds ?? MIN_AD_INTERVAL_SECONDS_DEFAULT;
  const minIntervalMs = Math.max(0, minIntervalSeconds) * 1000;

  const notEligible = (reason: AdEligibilityReason): AdEligibilityResult => ({
    eligible: false,
    reason,
    nextStateIfAttempted: safe,
  });

  if (options.hasFullAccess) return notEligible('full-access');

  // 2. Evaluare specifică sursei
  if (source === 'chat') {
    const threshold = options.everyN && options.everyN > 0
      ? Math.floor(options.everyN)
      : AD_EVERY_N_CHAT_MESSAGES;

    if (safe.chatMessageCount < threshold) {
      return notEligible('not-multiple');
    }

    if (safe.lastAdShownAtMs !== null && options.nowMs - safe.lastAdShownAtMs < minIntervalMs) {
      return notEligible('min-interval');
    }

    return {
      eligible: true,
      reason: 'eligible',
      nextStateIfAttempted: {
        ...safe,
        chatMessageCount: 0,
        lastChatAdCounterValue: safe.chatMessageCount,
        lastAdShownAtMs: options.nowMs,
      },
    };
  }

  // Sursa: foto (implicit)
  const everyN = options.everyN && options.everyN > 0
    ? Math.floor(options.everyN)
    : AD_EVERY_N_SUCCESSFUL_ANALYSES;
  const count = safe.successfulAnalysisCount;

  if (count <= 0) return notEligible('zero-count');
  if (count % everyN !== 0) return notEligible('not-multiple');
  if (safe.lastAdCounterValue === count) return notEligible('already-attempted-for-count');
  if (safe.lastAdShownAtMs !== null && options.nowMs - safe.lastAdShownAtMs < minIntervalMs) {
    return notEligible('min-interval');
  }

  return {
    eligible: true,
    reason: 'eligible',
    nextStateIfAttempted: {
      ...safe,
      lastAdCounterValue: count,
      lastAdShownAtMs: options.nowMs,
    },
  };
}
