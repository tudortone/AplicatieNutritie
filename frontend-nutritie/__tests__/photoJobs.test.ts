import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  activePhotoJobKey,
  cleanupPhotoAsset,
  clearActivePhotoJob,
  recoverPhotoJob,
  submitPhotoJob,
  waitForPhotoJob,
  PhotoApiError,
} from '../lib/photoJobs';
import { getPlayIntegrityHeaders } from '../lib/playIntegrityNative';

jest.mock('../lib/playIntegrityNative', () => ({
  getPlayIntegrityHeaders: jest.fn(async () => ({ 'X-Play-Integrity': 'opaque-integrity-token' })),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    clear: jest.fn(async () => { store = {}; }),
  };
});

jest.mock('../constants/config', () => ({ API_URL: 'https://api.getflow.test' }));

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
}

describe('async Photo job client', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  test('submits JSON after ImageKit upload and persists an account-scoped recovery pointer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => response(202, {
      id: 'job-1', status: 'queued', logicalAnalysisId: 'analysis-1',
    }));
    const job = await submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_A}/meal.jpg`,
      imageFileId: 'file-1', analysisId: 'analysis-1', mealType: 'Pranz', language: 'ro',
      localImageUri: 'file:///meal.jpg', draftUri: 'file:///draft.jpg',
    });
    expect(job).toEqual(expect.objectContaining({ id: 'job-1', status: 'queued' }));
    expect(fetchMock).toHaveBeenCalledWith('https://api.getflow.test/api/v1/photo-jobs', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-a',
        'Content-Type': 'application/json',
        'X-Play-Integrity': 'opaque-integrity-token',
      }),
    }));
    const submittedBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(submittedBody).toEqual(expect.objectContaining({ imageFileId: 'file-1', analysisId: 'analysis-1' }));
    expect(getPlayIntegrityHeaders).toHaveBeenCalledWith({
      method: 'POST',
      path: '/photo-jobs',
      body: submittedBody,
    });
    expect(JSON.parse((await AsyncStorage.getItem(activePhotoJobKey(USER_A)))!)).toEqual(expect.objectContaining({
      userId: USER_A, jobId: 'job-1', localImageUri: 'file:///meal.jpg',
    }));
  });

  test('polls queued/running until a validated succeeded result is available', async () => {
    const statuses = [
      { id: 'job-1', status: 'queued' },
      { id: 'job-1', status: 'running' },
      { id: 'job-1', status: 'succeeded', result: { success: true, items: [{ nume: 'Măr' }] } },
    ];
    jest.spyOn(global, 'fetch').mockImplementation(() => response(200, statuses.shift()));
    const job = await waitForPhotoJob({
      token: 'token-a', userId: USER_A, jobId: 'job-1',
      pollIntervalMs: 0, sleep: async () => {},
    });
    expect(job.status).toBe('succeeded');
    expect(job.result?.items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('process restart recovery is isolated by account and falls back to backend active job', async () => {
    await AsyncStorage.setItem(activePhotoJobKey(USER_A), JSON.stringify({
      userId: USER_A, jobId: 'job-a', imageUrl: 'https://safe/a.jpg', savedAt: 1,
    }));
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      expect(String(url)).toContain('/photo-jobs/active');
      return response(200, { job: { id: 'job-b', status: 'running' } });
    });
    const recoveredB = await recoverPhotoJob({ token: 'token-b', userId: USER_B });
    expect(recoveredB?.job.id).toBe('job-b');
    expect(recoveredB?.pointer.userId).toBe(USER_B);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(activePhotoJobKey(USER_A))).not.toBeNull();
  });

  test('only clears the current account pointer when the job id matches', async () => {
    await AsyncStorage.setItem(activePhotoJobKey(USER_A), JSON.stringify({
      userId: USER_A, jobId: 'job-new', savedAt: 1,
    }));
    await clearActivePhotoJob(USER_A, 'job-old');
    expect(await AsyncStorage.getItem(activePhotoJobKey(USER_A))).not.toBeNull();
    await clearActivePhotoJob(USER_A, 'job-new');
    expect(await AsyncStorage.getItem(activePhotoJobKey(USER_A))).toBeNull();
  });

  test('requests owned temporary asset cleanup without exposing the file id in the URL', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({ ok: true, status: 204 } as Response));
    await cleanupPhotoAsset({ token: 'token-a', fileId: 'file-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.getflow.test/api/v1/photo-assets/cleanup',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-a' }),
        body: JSON.stringify({ fileId: 'file-1' }),
      }),
    );
  });

  test('prevents duplicate active jobs when one is already in progress (duplicate-job prevention)', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => response(409, {
      ok: false,
      cod: 'PHOTO_IN_PROGRESS',
    }));

    await expect(submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/meal.jpg',
      imageFileId: 'file-1', analysisId: 'analysis-duplicate', mealType: 'Pranz', language: 'ro',
    })).rejects.toMatchObject({
      name: 'PhotoApiError',
      status: 409,
      code: 'PHOTO_IN_PROGRESS',
    });
  });

  test('replays existing job on repeated analysisId to protect Flow Credits from double spend (duplicate-credit prevention)', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => response(200, {
      id: 'job-existing-1',
      status: 'processing',
      logicalAnalysisId: 'analysis-idempotent-key',
      replay: true,
    }));

    const job = await submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/meal.jpg',
      imageFileId: 'file-1', analysisId: 'analysis-idempotent-key', mealType: 'Pranz', language: 'ro',
    });

    expect(job.id).toBe('job-existing-1');
    expect(job.status).toBe('processing');
    const pointer = JSON.parse((await AsyncStorage.getItem(activePhotoJobKey(USER_A)))!);
    expect(pointer.jobId).toBe('job-existing-1');
  });
});
