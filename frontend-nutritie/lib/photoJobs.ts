import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl } from './api';
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
  imageUrl?: string;
  imageFileId?: string | null;
  localImageUri?: string;
  draftUri?: string;
  savedAt: number;
}

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
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.userId !== userId || typeof value.jobId !== 'string') return null;
    return value as unknown as ActivePhotoJobPointer;
  } catch {
    return null;
  }
}

export async function clearActivePhotoJob(userId: string, jobId: string): Promise<void> {
  const pointer = await readPointer(userId);
  if (pointer?.jobId === jobId) await AsyncStorage.removeItem(activePhotoJobKey(userId));
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

export async function recoverPhotoJob({
  token, userId, signal,
}: { token: string; userId: string; signal?: AbortSignal }): Promise<{
  job: PhotoJob;
  pointer: ActivePhotoJobPointer;
} | null> {
  let pointer = await readPointer(userId);
  if (pointer) {
    try {
      return { job: await getPhotoJob({ token, jobId: pointer.jobId, signal }), pointer };
    } catch (error) {
      if (!(error instanceof PhotoApiError) || error.status !== 404) throw error;
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
