import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl } from './api';
import { idMasaDinOperatie } from './idUtils';
import { getPlayIntegrityHeaders } from './playIntegrityNative';

export type PhotoJobStatus = 'queued' | 'running' | 'processing' | 'succeeded' | 'completed' | 'failed' | 'cancelled';

export interface PhotoJobResult {
  success: boolean;
  items: Array<Record<string, unknown>>;
  totals?: {
    kcal?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number | null;
  };
  quality?: {
    requiresReview?: boolean;
    issues?: Array<{ code?: string; itemIndex?: number }>;
  };
  tipMasa?: string;
  processedAt?: string;
}

export interface PhotoJob {
  id: string;
  status: PhotoJobStatus;
  logicalAnalysisId?: string;
  errorCode?: string | null;
  result?: PhotoJobResult | null;
  imageUrl?: string;
  imageFileId?: string | null;
}

export interface ActivePhotoJobPointer {
  userId: string;
  jobId: string;
  /** Durable idempotency identity for the user's Journal save of this job. */
  saveOperationId?: string;
  /** Exact user-reviewed payload needed to safely retry after app/process restart. */
  savePayload?: Record<string, unknown>;
  imageUrl?: string;
  imageFileId?: string | null;
  localImageUri?: string;
  draftUri?: string;
  savedAt: number;
}

export type RecoveredPhotoJob = { job: PhotoJob; pointer: ActivePhotoJobPointer; missingJob?: false };
export type RecoveredPhotoJobForCamera =
  | RecoveredPhotoJob
  | { job: null; pointer: ActivePhotoJobPointer; missingJob: true };

export class PhotoApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code = 'PHOTO_REQUEST_FAILED') {
    super('Photo analysis is temporarily unavailable.');
    this.name = 'PhotoApiError';
    this.status = status;
    this.code = code;
  }
}

const ACTIVE_PREFIX = '@getflow/photo-job/v1/';
const RUNNING = new Set<PhotoJobStatus>(['queued', 'running', 'processing']);
const TERMINAL_SUCCESS = new Set<PhotoJobStatus>(['succeeded', 'completed']);

export function activePhotoJobKey(userId: string): string {
  const safe = typeof userId === 'string' ? userId.trim() : '';
  if (!safe) throw new TypeError('A user id is required.');
  return `${ACTIVE_PREFIX}${safe}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const CANONICAL_MEAL_TYPES = new Set(['mic_dejun', 'pranz', 'cina', 'gustare']);
const CANONICAL_MEAL_NUMBER_FIELDS = ['calorii', 'proteine', 'grasimi', 'carbohidrati', 'fibre'] as const;

function isValidPendingMealSaveDraft(
  userId: string,
  operationId: unknown,
  payload: unknown,
): payload is Record<string, unknown> {
  if (typeof operationId !== 'string' || !operationId.trim() || operationId.length > 200
    || !isRecord(payload) || payload.user_id !== userId
    || typeof payload.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id)
    || !Array.isArray(payload.alimente) || payload.alimente.length === 0
    || payload.alimente.some((item) => !isRecord(item) || typeof item.nume !== 'string' || !item.nume.trim())
    || typeof payload.nume !== 'string' || !payload.nume.trim()
    || !CANONICAL_MEAL_TYPES.has(String(payload.tip_masa))) {
    return false;
  }

  try {
    if (payload.id !== idMasaDinOperatie(userId, operationId)) return false;
  } catch {
    return false;
  }

  if (CANONICAL_MEAL_NUMBER_FIELDS.some((field) =>
    typeof payload[field] !== 'number' || !Number.isFinite(payload[field]) || (payload[field] as number) < 0,
  )) return false;

  // Journal date/time is the user's already-reviewed local value. Require both
  // even though the database timestamp is UTC, so recovery can never silently
  // confirm an incomplete snapshot by skipping an optional-field comparison.
  if (typeof payload.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.data)) return false;
  const [year, month, day] = payload.data.split('-').map(Number);
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (dateCheck.getUTCFullYear() !== year || dateCheck.getUTCMonth() !== month - 1 || dateCheck.getUTCDate() !== day) return false;
  if (typeof payload.ora !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(payload.ora)) return false;
  if (typeof payload.created_at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.created_at)
    || !Number.isFinite(Date.parse(payload.created_at))) return false;

  try {
    if (JSON.stringify(payload).length > 48_000) return false;
  } catch {
    return false;
  }
  return true;
}

function parseJob(value: unknown): PhotoJob {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.status !== 'string') {
    throw new PhotoApiError(502, 'INVALID_PHOTO_JOB_RESPONSE');
  }
  const status = value.status as PhotoJobStatus;
  if (!RUNNING.has(status) && !TERMINAL_SUCCESS.has(status) && status !== 'failed' && status !== 'cancelled') {
    throw new PhotoApiError(502, 'INVALID_PHOTO_JOB_STATUS');
  }
  if (TERMINAL_SUCCESS.has(status)) {
    if (!isRecord(value.result) || value.result.success !== true || !Array.isArray(value.result.items)) {
      throw new PhotoApiError(502, 'INVALID_PHOTO_JOB_RESULT');
    }
  }
  return value as unknown as PhotoJob;
}

async function parseResponse(response: Response): Promise<unknown> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new PhotoApiError(response.status || 502, 'INVALID_PHOTO_RESPONSE');
  }
  if (!response.ok) {
    const code = isRecord(body) && typeof body.cod === 'string' ? body.cod : 'PHOTO_REQUEST_FAILED';
    throw new PhotoApiError(response.status, code);
  }
  return body;
}

async function savePointer(pointer: ActivePhotoJobPointer): Promise<void> {
  await AsyncStorage.setItem(activePhotoJobKey(pointer.userId), JSON.stringify(pointer));
}

async function readPointer(userId: string): Promise<ActivePhotoJobPointer | null> {
  const raw = await AsyncStorage.getItem(activePhotoJobKey(userId));
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PhotoApiError(500, 'CORRUPT_ACTIVE_PHOTO_JOB_POINTER');
  }

  // A malformed pointer cannot safely be treated as absent: it may contain the
  // only retry identity for a meal write whose server response was ambiguous.
  if (!isRecord(value) || value.userId !== userId || typeof value.jobId !== 'string' || !value.jobId) {
    throw new PhotoApiError(500, 'CORRUPT_ACTIVE_PHOTO_JOB_POINTER');
  }

  const hasOperationId = value.saveOperationId !== undefined;
  const hasSavePayload = value.savePayload !== undefined;
  if (hasOperationId && !hasSavePayload) {
    // A save operation without its reviewed payload cannot be retried safely,
    // and must never be mistaken for an empty pointer that may be replaced.
    throw new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT');
  }
  if (hasSavePayload && !isValidPendingMealSaveDraft(userId, value.saveOperationId, value.savePayload)) {
      throw new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT');
  }

  return value as unknown as ActivePhotoJobPointer;
}

export async function clearActivePhotoJob(userId: string, jobId: string): Promise<void> {
  const pointer = await readPointer(userId);
  if (pointer?.jobId === jobId) await AsyncStorage.removeItem(activePhotoJobKey(userId));
}

export async function hasPendingPhotoSave(userId: string): Promise<boolean> {
  const pointer = await readPointer(userId);
  return Boolean(pointer?.saveOperationId || pointer?.savePayload);
}

/** Persist the idempotency key and exact reviewed meal payload atomically in the per-user job pointer. */
export async function savePhotoJobSaveAttempt(
  userId: string,
  jobId: string,
  operationId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!operationId.trim() || operationId.length > 200) {
    throw new TypeError('A valid photo save operation id is required.');
  }
  if (!isValidPendingMealSaveDraft(userId, operationId, payload)) {
    throw new TypeError('A photo save payload must belong to its authenticated user.');
  }
  const pointer = await readPointer(userId);
  if (!pointer || pointer.jobId !== jobId) return false;
  await savePointer({ ...pointer, saveOperationId: operationId, savePayload: payload });
  return true;
}

export async function cleanupPhotoAsset({
  token, fileId, signal,
}: { token: string; fileId: string; signal?: AbortSignal }): Promise<void> {
  const response = await fetch(buildApiUrl('/photo-assets/cleanup'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileId }),
    signal,
  });
  if (!response.ok) {
    let code = 'MEDIA_CLEANUP_FAILED';
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.cod === 'string') code = body.cod;
    } catch {}
    throw new PhotoApiError(response.status, code);
  }
}

export interface SubmitPhotoJobInput {
  token: string;
  userId: string;
  imageUrl: string;
  imageFileId?: string | null;
  analysisId: string;
  mealType: string;
  language: string;
  localImageUri?: string;
  draftUri?: string;
  signal?: AbortSignal;
}

export async function submitPhotoJob(input: SubmitPhotoJobInput): Promise<PhotoJob> {
  if (await hasPendingPhotoSave(input.userId)) {
    throw new PhotoApiError(409, 'PHOTO_JOURNAL_SAVE_PENDING');
  }
  const body = {
    imageUrl: input.imageUrl,
    imageFileId: input.imageFileId || null,
    analysisId: input.analysisId,
    mealType: input.mealType,
    language: input.language,
  };
  const integrityHeaders = await getPlayIntegrityHeaders({ method: 'POST', path: '/photo-jobs', body });
  const response = await fetch(buildApiUrl('/photo-jobs'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
      ...integrityHeaders,
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  const job = parseJob(await parseResponse(response));
  await savePointer({
    userId: input.userId,
    jobId: job.id,
    imageUrl: input.imageUrl,
    imageFileId: input.imageFileId || null,
    localImageUri: input.localImageUri,
    draftUri: input.draftUri,
    savedAt: Date.now(),
  });
  return job;
}

export async function getPhotoJob({
  token, jobId, signal,
}: { token: string; jobId: string; signal?: AbortSignal }): Promise<PhotoJob> {
  const response = await fetch(buildApiUrl(`/photo-jobs/${encodeURIComponent(jobId)}`), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  return parseJob(await parseResponse(response));
}

async function getBackendActivePhotoJob(token: string, signal?: AbortSignal): Promise<PhotoJob | null> {
  const response = await fetch(buildApiUrl('/photo-jobs/active'), {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  const body = await parseResponse(response);
  if (!isRecord(body) || body.job === null) return null;
  return parseJob(body.job);
}

export async function recoverPhotoJobForCamera({
  token, userId, signal,
}: { token: string; userId: string; signal?: AbortSignal }): Promise<RecoveredPhotoJobForCamera | null> {
  let pointer = await readPointer(userId);
  if (pointer) {
    try {
      return { job: await getPhotoJob({ token, jobId: pointer.jobId, signal }), pointer };
    } catch (error) {
      if (!(error instanceof PhotoApiError) || error.status !== 404) throw error;
      // A stale job record is normally safe to clear. Once a Journal write has
      // an idempotency marker, its owner-bound exact payload is the only safe
      // retry source and must remain available for explicit reconciliation.
      if (pointer.saveOperationId && pointer.savePayload
        && pointer.savePayload.user_id === userId) {
        return { job: null, pointer, missingJob: true };
      }
      await clearActivePhotoJob(userId, pointer.jobId);
      pointer = null;
    }
  }
  const job = await getBackendActivePhotoJob(token, signal);
  if (!job) return null;
  pointer = { userId, jobId: job.id, imageUrl: job.imageUrl, imageFileId: job.imageFileId, savedAt: Date.now() };
  await savePointer(pointer);
  return { job, pointer };
}

/** Status-card recovery requires a live backend job; only Camera can reconcile a saved local meal snapshot. */
export async function recoverPhotoJob({
  token, userId, signal,
}: { token: string; userId: string; signal?: AbortSignal }): Promise<RecoveredPhotoJob | null> {
  const recovered = await recoverPhotoJobForCamera({ token, userId, signal });
  if (recovered?.missingJob) {
    throw new PhotoApiError(404, 'PHOTO_JOB_MISSING_PENDING_MEAL_SAVE');
  }
  return recovered;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export async function waitForPhotoJob({
  token,
  userId: _userId,
  jobId,
  signal,
  pollIntervalMs = 1200,
  sleep = defaultSleep,
  onStatus,
}: {
  token: string;
  userId: string;
  jobId: string;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onStatus?: (job: PhotoJob) => void;
}): Promise<PhotoJob> {
  void _userId;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const job = await getPhotoJob({ token, jobId, signal });
    onStatus?.(job);
    if (TERMINAL_SUCCESS.has(job.status)) return job;
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new PhotoApiError(422, job.errorCode || 'PHOTO_ANALYSIS_FAILED');
    }
    await sleep(pollIntervalMs, signal);
  }
}
