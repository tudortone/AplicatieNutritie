import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  activePhotoJobKey,
  cleanupPhotoAsset,
  clearActivePhotoJob,
  hasPendingPhotoSave,
  recoverPhotoJob,
  recoverPhotoJobForCamera,
  savePhotoJobSaveAttempt,
  submitPhotoJob,
  waitForPhotoJob,
  PhotoApiError,
} from '../lib/photoJobs';
import { getPlayIntegrityHeaders } from '../lib/playIntegrityNative';
import { idMasaDinOperatie } from '../lib/idUtils';

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

function validPendingMeal(operationId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: idMasaDinOperatie(USER_A, operationId),
    user_id: USER_A,
    nume: 'Măr (100g)',
    calorii: 52,
    proteine: 0.3,
    grasimi: 0.2,
    carbohidrati: 14,
    fibre: 2.4,
    tip_masa: 'gustare',
    alimente: [{ nume: 'Măr', grame: 100 }],
    imagine_url: null,
    data: '2026-10-11',
    ora: '20:15:00',
    created_at: '2026-10-11T17:15:00.000Z',
    ...overrides,
  };
}

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

  test('photo Journal save operation identity survives a camera/process restart for the same job', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => response(202, { id: 'job-save-1', status: 'queued' }))
      .mockImplementationOnce(() => response(200, {
        id: 'job-save-1', status: 'succeeded',
        result: { success: true, items: [{ nume: 'Măr' }] },
      }));
    await submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/meal.jpg',
      analysisId: 'analysis-save-1', mealType: 'Gustare', language: 'ro',
    });

    const reviewedMeal = {
      ...validPendingMeal('save-operation-1'),
      nume: 'Măr (175g)',
      calorii: 91,
      proteine: 1,
      grasimi: 0,
      carbohidrati: 25,
      fibre: 4,
      alimente: [{ nume: 'Măr', grame: 175, calorii: 91, proteine: 1, grasimi: 0, carbohidrati: 25, fibre: 4 }],
    };
    expect(await savePhotoJobSaveAttempt(USER_A, 'job-save-1', 'save-operation-1', reviewedMeal)).toBe(true);
    expect(await hasPendingPhotoSave(USER_A)).toBe(true);
    await expect(submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/next-meal.jpg',
      analysisId: 'analysis-next-meal', mealType: 'Pranz', language: 'ro',
    })).rejects.toMatchObject({ status: 409, code: 'PHOTO_JOURNAL_SAVE_PENDING' });
    const recovered = await recoverPhotoJob({ token: 'token-a', userId: USER_A });

    expect(recovered?.pointer.saveOperationId).toBe('save-operation-1');
    expect(recovered?.pointer.savePayload).toEqual(reviewedMeal);
    await clearActivePhotoJob(USER_A, 'job-save-1');
    expect(await hasPendingPhotoSave(USER_A)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('corrupt pending meal snapshot fails closed and is never cleared or replaced', async () => {
    const key = activePhotoJobKey(USER_A);
    const corruptPointer = JSON.stringify({
      userId: USER_A,
      jobId: 'job-corrupt-save',
      savedAt: 123,
      saveOperationId: 'save-operation-corrupt',
      savePayload: {
        id: 'meal-corrupt',
        // A pending snapshot without the owner identity cannot be retried safely.
        alimente: [{ nume: 'Sensitive meal data should remain local' }],
      },
    });
    await AsyncStorage.setItem(key, corruptPointer);
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => response(404, { cod: 'PHOTO_JOB_NOT_FOUND' }));

    await expect(hasPendingPhotoSave(USER_A)).rejects.toMatchObject({
      status: 500,
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });
    await expect(submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/next-meal.jpg',
      analysisId: 'analysis-next-meal', mealType: 'Pranz', language: 'ro',
    })).rejects.toMatchObject({ code: 'INVALID_PENDING_MEAL_SAVE_DRAFT' });
    await expect(recoverPhotoJob({ token: 'token-a', userId: USER_A })).rejects.toMatchObject({
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });
    await expect(clearActivePhotoJob(USER_A, 'job-corrupt-save')).rejects.toMatchObject({
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });

    expect(await AsyncStorage.getItem(key)).toBe(corruptPointer);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('save operation id without its reviewed payload is corrupt and blocks recovery or replacement', async () => {
    const key = activePhotoJobKey(USER_A);
    const corruptPointer = JSON.stringify({
      userId: USER_A,
      jobId: 'job-missing-save-payload',
      savedAt: 123,
      saveOperationId: 'save-operation-without-payload',
    });
    await AsyncStorage.setItem(key, corruptPointer);
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(hasPendingPhotoSave(USER_A)).rejects.toMatchObject({
      status: 500,
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });
    await expect(submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/next-meal.jpg',
      analysisId: 'analysis-after-missing-payload', mealType: 'Pranz', language: 'ro',
    })).rejects.toMatchObject({ code: 'INVALID_PENDING_MEAL_SAVE_DRAFT' });
    await expect(recoverPhotoJob({ token: 'token-a', userId: USER_A })).rejects.toMatchObject({
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });
    await expect(clearActivePhotoJob(USER_A, 'job-missing-save-payload')).rejects.toMatchObject({
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });

    expect(await AsyncStorage.getItem(key)).toBe(corruptPointer);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['missing meal time', (operationId: string) => {
      const { ora: _ignored, ...payload } = validPendingMeal(operationId);
      return payload;
    }],
    ['missing creation timestamp', (operationId: string) => {
      const { created_at: _ignored, ...payload } = validPendingMeal(operationId);
      return payload;
    }],
    ['non-canonical creation timestamp', (operationId: string) =>
      validPendingMeal(operationId, { created_at: '11/10/2026 17:15:00' })],
    ['id not derived from the save operation', (operationId: string) =>
      validPendingMeal(operationId, { id: '123e4567-e89b-42d3-a456-426614174000' })],
  ])('%s pending snapshot fails closed without clearing or fetching', async (_label, payloadFactory) => {
    const key = activePhotoJobKey(USER_A);
    const pointer = {
      userId: USER_A,
      jobId: 'job-invalid-canonical-snapshot',
      savedAt: 123,
      saveOperationId: 'save-operation-invalid-snapshot',
      savePayload: payloadFactory('save-operation-invalid-snapshot'),
    };
    const serializedPointer = JSON.stringify(pointer);
    await AsyncStorage.setItem(key, serializedPointer);
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(recoverPhotoJobForCamera({ token: 'token-a', userId: USER_A })).rejects.toMatchObject({
      status: 500,
      code: 'INVALID_PENDING_MEAL_SAVE_DRAFT',
    });

    expect(await AsyncStorage.getItem(key)).toBe(serializedPointer);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('expired backend job returns a validated owner-scoped pending save snapshot for safe recovery', async () => {
    jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => response(202, { id: 'job-expired-save', status: 'queued' }))
      .mockImplementationOnce(() => response(404, { cod: 'PHOTO_JOB_NOT_FOUND' }));
    await submitPhotoJob({
      token: 'token-a', userId: USER_A,
      imageUrl: 'https://ik.imagekit.io/getflow/meal.jpg',
      analysisId: 'analysis-expired-save', mealType: 'Gustare', language: 'ro',
    });
    const payload = validPendingMeal('save-expired');
    expect(await savePhotoJobSaveAttempt(USER_A, 'job-expired-save', 'save-expired', payload)).toBe(true);

    const recovered = await recoverPhotoJobForCamera({ token: 'token-a', userId: USER_A });
    expect(recovered).toEqual({
      missingJob: true,
      job: null,
      pointer: expect.objectContaining({
        userId: USER_A,
        jobId: 'job-expired-save',
        saveOperationId: 'save-expired',
        savePayload: payload,
      }),
    });
    const stored = await AsyncStorage.getItem(activePhotoJobKey(USER_A));
    expect(JSON.parse(stored || '{}').savePayload).toEqual(payload);
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
