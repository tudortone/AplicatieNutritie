'use strict';

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: (definition) => definition,
  defineConfig: (definition) => definition,
}));
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {} }));

const express = require('express');
const fs = require('fs');
const request = require('supertest');
const createAiRouter = require('../routes/ai');
const { createPhotoJobService } = require('../services/ai/photoJobService');
const { createPlayIntegrityGuard } = require('../utils/playIntegrity');
const triggerModule = require('../src/trigger/analiza-mancare-ai');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

beforeAll(() => {
  jest.spyOn(fs.promises, 'readFile').mockResolvedValue(VALID_PNG);
  jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

function createHarness({
  authenticated = true,
  integrityMode = 'enforce',
  integrityAllows = true,
  reserveResult = null,
  visionResponse = JSON.stringify([
    {
      nume: 'Somon la gratar',
      estimare_grame: 180,
      calorii_per_100g: 208,
      proteine_per_100g: 20,
      carbohidrati_per_100g: 0,
      grasimi_per_100g: 13,
      fibre_per_100g: 0,
      incredere: 'ridicat',
      tip_masa_sugerat: 'pranz',
    },
  ]),
  visionError = null,
  triggerError = null,
} = {}) {
  const jobs = new Map();
  const byLogical = new Map();
  let seq = 1;

  const repo = {
    findByLogicalId: jest.fn(async ({ userId, logicalAnalysisId }) =>
      byLogical.get(`${userId}:${logicalAnalysisId}`) || null),
    create: jest.fn(async (input) => {
      const row = { ...input, id: `job-${seq++}`, status: 'queued' };
      jobs.set(row.id, row);
      byLogical.set(`${input.userId}:${input.logicalAnalysisId}`, row);
      return row;
    }),
    attachTriggerRun: jest.fn(async ({ jobId, triggerRunId }) => {
      const row = jobs.get(jobId);
      if (row) row.triggerRunId = triggerRunId;
      return row;
    }),
    markFailed: jest.fn(async ({ jobId, errorCode }) => {
      const row = jobs.get(jobId);
      if (row) {
        row.status = 'failed';
        row.errorCode = errorCode;
      }
      return row;
    }),
    getOwned: jest.fn(),
    getActiveOwned: jest.fn(),
  };

  const flowCredits = {
    reservationState: null,
    claimedReservations: new Set(),
    reservePhoto: jest.fn(async ({ logicalAnalysisId, requestFingerprint }) => {
      if (typeof reserveResult === 'function') {
        return reserveResult({ logicalAnalysisId });
      }
      if (reserveResult) return reserveResult;
      if (flowCredits.reservationState) {
        return { ...flowCredits.reservationState, replay: true };
      }
      flowCredits.reservationState = {
        ok: true,
        reservationId: `res-${logicalAnalysisId}`,
        source: 'DAILY',
        status: 'RESERVED',
        requestFingerprint,
        inferenceClaimed: false,
        replay: false,
      };
      return {
        ...flowCredits.reservationState,
      };
    }),
    claimPhotoInference: jest.fn(async ({ reservationId }) => {
      if (flowCredits.claimedReservations.has(reservationId)) {
        return { ok: true, acquired: false, status: 'running', inferenceClaimed: true };
      }
      flowCredits.claimedReservations.add(reservationId);
      if (flowCredits.reservationState) flowCredits.reservationState.inferenceClaimed = true;
      return { ok: true, acquired: true, status: 'RESERVED' };
    }),
    recordPhotoResult: jest.fn(async ({ result }) => {
      if (flowCredits.reservationState) flowCredits.reservationState.result = result;
      return { ok: true, result, replay: false };
    }),
    releasePhoto: jest.fn(async () => {
      if (flowCredits.reservationState?.inferenceClaimed
        && flowCredits.reservationState.result?.success !== false) {
        return { ok: false, code: 'PHOTO_OUTCOME_UNKNOWN' };
      }
      if (flowCredits.reservationState) flowCredits.reservationState.status = 'RELEASED';
      return { ok: true, status: 'RELEASED' };
    }),
    commitPhoto: jest.fn(async () => {
      if (flowCredits.reservationState?.result?.success !== true) {
        return { ok: false, code: 'VALID_PHOTO_RESULT_REQUIRED' };
      }
      if (flowCredits.reservationState) flowCredits.reservationState.status = 'COMMITTED';
      return { ok: true, status: 'COMMITTED' };
    }),
  };

  const tasks = {
    trigger: jest.fn(async () => {
      if (triggerError) throw triggerError;
      return { id: 'run-legacy-photo-1' };
    }),
  };

  const billingService = {
    getPaidEntitlement: jest.fn(async () => ({ premium: false })),
  };

  const photoJobs = createPhotoJobService({
    repo,
    flowCredits,
    tasks,
    billing: billingService,
  });

  const serviciuCascada = {
    ruleazaCascadaText: jest.fn(),
    ruleazaCascadaStructurat: jest.fn(),
    ruleazaCascadaVision: jest.fn(async () => {
      if (visionError) throw visionError;
      return { text: visionResponse };
    }),
    getProviderStatus: jest.fn(async () => ({ status: 'ok' })),
  };

  const verifier = {
    verify: jest.fn(async () => (
      integrityAllows
        ? { trusted: true, reason: 'TRUSTED' }
        : { trusted: false, reason: 'TOKEN_MISSING' }
    )),
  };

  const integrityGuard = createPlayIntegrityGuard({
    verifier,
    mode: integrityMode,
  });

  const requireAuth = (req, res, next) => {
    if (!authenticated) {
      return res.status(401).json({ eroare: 'Neautorizat' });
    }
    req.user = { id: USER_ID, esteTester: false };
    return next();
  };

  const app = express();
  app.use(express.json());
  const router = createAiRouter({
    requireAuth,
    aiLimiter: (_req, _res, next) => next(),
    generalLimiter: (_req, _res, next) => next(),
    upload: {
      single: () => (req, _res, next) => {
        req.file = { path: 'dummy-meal.png', mimetype: 'image/png' };
        next();
      },
    },
    // Legacy quota middleware passes (simulating the 50/day fallback bypass!)
    checkAiUsageQuota: (_req, _res, next) => next(),
    imagekit: null,
    tasks,
    config: {
      imagekit: { urlEndpoint: 'https://ik.imagekit.io/getflow' },
      supabase: { url: 'https://proj.supabase.co' },
      triggerSecretKey: 'tr_test_secret',
      playIntegrity: { mode: integrityMode },
    },
    serviciuVision: { detectImageMime: () => 'image/png' },
    serviciuCascada,
    serviciuChat: {
      ruleazaChat: jest.fn(),
      estimeazaMancareText: jest.fn(),
      profilNutritiv: jest.fn(),
      logFoodDinChat: jest.fn(),
    },
    semaforAi: { ruleaza: async (fn) => fn() },
    idempotencyCritic: (_req, _res, next) => next(),
    supabaseAdmin: null,
    billingService,
    photoJobs,
    flowCredits,
    contextDate: (req) => ({ db: {}, userId: req.user?.id }),
    integrityGuard,
  });

  app.use('/api/v1', router);
  app.use('/api', router);

  return {
    app,
    repo,
    flowCredits,
    tasks,
    photoJobs,
    serviciuCascada,
    verifier,
  };
}

describe('P0 Security Remediation — Legacy Photo AI Endpoints & Job Ownership', () => {
  test('1. unauthorized requests cannot trigger billable inference on any legacy photo endpoint', async () => {
    const h = createHarness({ authenticated: false });

    const r1 = await request(h.app)
      .post('/api/v1/trigger-analiza-mancare')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });
    const r2 = await request(h.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    const r3 = await request(h.app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(401);
    expect(h.flowCredits.reservePhoto).not.toHaveBeenCalled();
    expect(h.tasks.trigger).not.toHaveBeenCalled();
    expect(h.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
  });

  test('2. insufficient-credit users (402 FLOW_CREDITS_EXHAUSTED) cannot bypass charging on any legacy route', async () => {
    const h = createHarness({
      reserveResult: { ok: false, reason: 'FLOW_CREDITS_EXHAUSTED' },
    });

    const r1 = await request(h.app)
      .post('/api/v1/trigger-analiza-mancare')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });
    const r2 = await request(h.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    const r3 = await request(h.app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(r1.status).toBe(402);
    expect(r1.body.code).toBe('FLOW_CREDITS_EXHAUSTED');
    expect(r2.status).toBe(402);
    expect(r2.body.code).toBe('FLOW_CREDITS_EXHAUSTED');
    expect(r3.status).toBe(402);
    expect(r3.body.code).toBe('FLOW_CREDITS_EXHAUSTED');

    expect(h.tasks.trigger).not.toHaveBeenCalled();
    expect(h.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
  });

  test('3. Play Integrity enforcement cannot be bypassed through legacy photo endpoints', async () => {
    const h = createHarness({
      integrityMode: 'enforce',
      integrityAllows: false,
    });

    const r1 = await request(h.app)
      .post('/api/v1/trigger-analiza-mancare')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });
    const r2 = await request(h.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    const r3 = await request(h.app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(r1.status).toBe(403);
    expect(r1.body.cod || r1.body.code).toBe('PLAY_INTEGRITY_REQUIRED');
    expect(r2.status).toBe(403);
    expect(r2.body.cod || r2.body.code).toBe('PLAY_INTEGRITY_REQUIRED');
    expect(r3.status).toBe(403);
    expect(r3.body.cod || r3.body.code).toBe('PLAY_INTEGRITY_REQUIRED');

    expect(h.flowCredits.reservePhoto).not.toHaveBeenCalled();
    expect(h.tasks.trigger).not.toHaveBeenCalled();
    expect(h.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
  });

  test('4. accepted jobs reserve credits exactly once and commit on synchronous completion', async () => {
    const h = createHarness();

    const asyncRes = await request(h.app)
      .post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'legacy-async-key-1')
      .send({
        imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg`,
        tipMasa: 'pranz',
        limba: 'ro',
      });

    expect(asyncRes.status).toBe(202);
    expect(asyncRes.body).toEqual(expect.objectContaining({
      succes: true,
      jobId: 'job-1',
      taskId: 'run-legacy-photo-1',
      status: 'pending',
    }));
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(h.tasks.trigger).toHaveBeenCalledWith(
      'analiza-mancare-ai',
      expect.objectContaining({
        jobId: 'job-1',
        reservationId: expect.stringMatching(/^res-/),
        userId: USER_ID,
      }),
      expect.any(Object),
    );

    const syncRes = await request(h.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'legacy-sync-key-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(syncRes.status).toBe(200);
    expect(Array.isArray(syncRes.body)).toBe(true);
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledTimes(2);
    expect(h.flowCredits.commitPhoto).toHaveBeenCalledTimes(1);
    expect(h.flowCredits.releasePhoto).not.toHaveBeenCalled();
  });

  test('5. ambiguous dispatch/provider outcomes stay reserved; confirmed non-food releases the credit', async () => {
    const hDispatchFail = createHarness({
      triggerError: new Error('TRIGGER_UNAVAILABLE'),
    });

    const rAsyncFail = await request(hDispatchFail.app)
      .post('/api/v1/trigger-analiza-mancare')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });

    expect(rAsyncFail.status).toBe(503);
    expect(hDispatchFail.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(hDispatchFail.flowCredits.releasePhoto).not.toHaveBeenCalled();

    const hNotFood = createHarness({
      visionResponse: JSON.stringify([]),
    });

    const rNotFood = await request(hNotFood.app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .attach('imagine', VALID_PNG, { filename: 'not-food.png', contentType: 'image/png' });

    expect(rNotFood.status).toBe(200);
    expect(rNotFood.body).toEqual([]);
    expect(hNotFood.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(hNotFood.flowCredits.releasePhoto).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      reason: 'NOT_FOOD',
    }));
    expect(hNotFood.flowCredits.commitPhoto).not.toHaveBeenCalled();

    const hVisionErr = createHarness({
      visionError: new Error('VISION_TIMEOUT'),
    });

    const rVisionErr = await request(hVisionErr.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(rVisionErr.status).toBe(500);
    expect(hVisionErr.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(hVisionErr.flowCredits.releasePhoto).not.toHaveBeenCalled();
    expect(hVisionErr.flowCredits.commitPhoto).not.toHaveBeenCalled();
    expect(hVisionErr.flowCredits.reservationState.status).toBe('RESERVED');
  });

  test('6. replay and parallel requests cannot duplicate work or overspend', async () => {
    const h = createHarness();

    const first = await request(h.app)
      .post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'same-logical-id')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });

    const replay = await request(h.app)
      .post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'same-logical-id')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(replay.body.jobId).toBe(first.body.jobId);
    expect(replay.body.replay).toBe(true);
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(h.tasks.trigger).toHaveBeenCalledTimes(1);

    const hInProgress = createHarness({
      reserveResult: { ok: false, reason: 'PHOTO_IN_PROGRESS', activeReservationId: 'res-active' },
    });

    const parallelSync = await request(hInProgress.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(parallelSync.status).toBe(409);
    expect(parallelSync.body.code).toBe('PHOTO_IN_PROGRESS');
    expect(hInProgress.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
  });

  test('7. Trigger worker requireOwnedJob rejects any payload missing jobId or reservationId', async () => {
    await expect(
      triggerModule._test.requireOwnedJob({
        jobId: null,
        userId: USER_ID,
        imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg`,
        reservationId: 'res-1',
      }),
    ).rejects.toThrow('JOB_OWNERSHIP_MISMATCH');

    await expect(
      triggerModule._test.requireOwnedJob({
        jobId: 'job-1',
        userId: USER_ID,
        imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg`,
        reservationId: null,
      }),
    ).rejects.toThrow('JOB_OWNERSHIP_MISMATCH');
  });

  test('8. GPT P0 reproduction: replaying a COMMITTED reservation never authorizes a second AI inference', async () => {
    const reservations = new Map();
    const h = createHarness({
      reserveResult: ({ logicalAnalysisId }) => {
        const key = `${USER_ID}:${logicalAnalysisId}`;
        if (reservations.has(key)) {
          const existing = reservations.get(key);
          return { ...existing, replay: true };
        }
        const created = {
          ok: true,
          reservationId: `res-${logicalAnalysisId}`,
          source: 'DAILY',
          status: 'RESERVED',
          replay: false,
        };
        reservations.set(key, created);
        return created;
      },
    });
    h.flowCredits.commitPhoto.mockImplementation(async ({ reservationId }) => {
      for (const value of reservations.values()) {
        if (value.reservationId === reservationId) {
          value.status = 'COMMITTED';
          return { ok: true, status: 'COMMITTED', replay: false };
        }
      }
      return { ok: false, code: 'RESERVATION_NOT_FOUND' };
    });

    const first = await request(h.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'gpt-replay-committed-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    const replay = await request(h.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'gpt-replay-committed-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(409);
    expect(replay.body.code || replay.body.cod).toBe('PHOTO_RESERVATION_ALREADY_COMMITTED');
    expect(h.serviciuCascada.ruleazaCascadaVision).toHaveBeenCalledTimes(1);
    expect(h.flowCredits.commitPhoto).toHaveBeenCalledTimes(1);
    expect(h.flowCredits.releasePhoto).not.toHaveBeenCalled();

    const replayStructurat = await request(h.app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .set('Idempotency-Key', 'gpt-replay-committed-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(replayStructurat.status).toBe(409);
    expect(replayStructurat.body.code || replayStructurat.body.cod).toBe('PHOTO_RESERVATION_ALREADY_COMMITTED');
    expect(h.serviciuCascada.ruleazaCascadaVision).toHaveBeenCalledTimes(1);
  });

  test('9. reservation states (RELEASED, RESERVED replay, missing, malformed, expired, cross-account) fail closed without inference', async () => {
    const hReleased = createHarness({
      reserveResult: {
        ok: true,
        reservationId: 'res-released-1',
        source: 'DAILY',
        status: 'RELEASED',
        replay: true,
      },
    });
    const rReleased = await request(hReleased.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'rel-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    expect(rReleased.status).toBe(409);
    expect(rReleased.body.code || rReleased.body.cod).toBe('PHOTO_RESERVATION_RELEASED');
    expect(hReleased.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
    expect(hReleased.flowCredits.releasePhoto).not.toHaveBeenCalled();

    const hReservedReplay = createHarness({
      reserveResult: {
        ok: true,
        reservationId: 'res-in-flight-1',
        source: 'DAILY',
        status: 'RESERVED',
        replay: true,
      },
    });
    const rReservedReplay = await request(hReservedReplay.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'inflight-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    expect(rReservedReplay.status).toBe(409);
    expect(rReservedReplay.body.code || rReservedReplay.body.cod).toBe('PHOTO_IN_PROGRESS');
    expect(hReservedReplay.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
    expect(hReservedReplay.flowCredits.releasePhoto).not.toHaveBeenCalled();

    const hMalformed = createHarness({
      reserveResult: {
        ok: true,
        reservationId: '',
        source: 'DAILY',
        status: 'RESERVED',
        replay: false,
      },
    });
    const rMalformed = await request(hMalformed.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    expect(rMalformed.status).toBe(503);
    expect(rMalformed.body.code || rMalformed.body.cod).toBe('INVALID_CREDIT_RESERVATION');
    expect(hMalformed.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();

    const hExpired = createHarness({
      reserveResult: {
        ok: true,
        reservationId: 'res-expired-1',
        source: 'DAILY',
        status: 'RESERVED',
        replay: false,
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    });
    const rExpired = await request(hExpired.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    expect(rExpired.status).toBe(409);
    expect(rExpired.body.code || rExpired.body.cod).toBe('CREDIT_RESERVATION_EXPIRED');
    expect(hExpired.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();

    const hCrossAccount = createHarness({
      reserveResult: {
        ok: true,
        reservationId: 'res-foreign-1',
        source: 'DAILY',
        status: 'RESERVED',
        replay: false,
        userId: '22222222-2222-4222-8222-222222222222',
      },
    });
    const rCrossAccount = await request(hCrossAccount.app)
      .post('/api/v1/analiza-foto')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });
    expect(rCrossAccount.status).toBe(403);
    expect(rCrossAccount.body.code || rCrossAccount.body.cod).toBe('RESERVATION_OWNERSHIP_MISMATCH');
    expect(hCrossAccount.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();
    expect(hCrossAccount.flowCredits.releasePhoto).not.toHaveBeenCalled();
  });

  test('10. ambiguous commit is reconciled without blindly releasing the reservation', async () => {
    const hCommitThrows = createHarness();
    hCommitThrows.flowCredits.commitPhoto.mockRejectedValueOnce(new Error('DB_COMMIT_TIMEOUT'));
    hCommitThrows.flowCredits.reservePhoto.mockResolvedValueOnce({
      ok: true, reservationId: 'res-commit-throws-1', source: 'DAILY', status: 'RESERVED', replay: false,
    }).mockResolvedValueOnce({
      ok: true,
      reservationId: 'res-commit-throws-1',
      source: 'DAILY',
      status: 'COMMITTED',
      replay: true,
    });

    const rThrows = await request(hCommitThrows.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'commit-throws-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(rThrows.status).toBe(200);
    expect(hCommitThrows.flowCredits.releasePhoto).not.toHaveBeenCalled();
    expect(hCommitThrows.flowCredits.reservePhoto).toHaveBeenCalledTimes(2);

    const hCommitStillReserved = createHarness();
    hCommitStillReserved.flowCredits.commitPhoto.mockRejectedValueOnce(new Error('DB_COMMIT_TIMEOUT'));
    hCommitStillReserved.flowCredits.reservePhoto.mockResolvedValueOnce({
      ok: true, reservationId: 'res-commit-throws-1', source: 'DAILY', status: 'RESERVED', replay: false,
    }).mockResolvedValueOnce({
      ok: true,
      reservationId: 'res-commit-throws-1',
      source: 'DAILY',
      status: 'RESERVED',
      replay: true,
    });
    const rStillReserved = await request(hCommitStillReserved.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'commit-still-reserved-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(rStillReserved.status).toBe(503);
    expect(rStillReserved.body.code || rStillReserved.body.cod).toBe('CREDIT_SETTLEMENT_PENDING');
    expect(hCommitStillReserved.flowCredits.releasePhoto).not.toHaveBeenCalled();
    expect(hCommitStillReserved.serviciuCascada.ruleazaCascadaVision).toHaveBeenCalledTimes(1);

    const hCommitRejected = createHarness();
    hCommitRejected.flowCredits.commitPhoto.mockResolvedValueOnce({
      ok: false,
      code: 'RESERVATION_NOT_FOUND',
    });

    const rRejected = await request(hCommitRejected.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'commit-rejected-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(rRejected.status).toBe(503);
    expect(rRejected.body.code || rRejected.body.cod).toBe('CREDIT_SETTLEMENT_PENDING');

    const hCommitReplayed = createHarness();
    hCommitReplayed.flowCredits.commitPhoto.mockResolvedValueOnce({
      ok: true,
      status: 'COMMITTED',
      replay: true,
    });

    const rReplayedCommit = await request(hCommitReplayed.app)
      .post('/api/v1/analiza-foto')
      .set('Idempotency-Key', 'commit-replayed-1')
      .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' });

    expect(rReplayedCommit.status).toBe(200);
  });

  test('11. concurrent requests enforce single authoritative processing ownership per logical operation and per user', async () => {
    const reservations = new Map();
    const h = createHarness({
      reserveResult: async ({ logicalAnalysisId }) => {
        await new Promise((r) => setTimeout(r, 15));
        const key = `${USER_ID}:${logicalAnalysisId}`;
        if (reservations.has(key)) {
          return { ...reservations.get(key), replay: true };
        }
        const activeForUser = [...reservations.values()].find((r) => r.status === 'RESERVED');
        if (activeForUser) {
          return {
            ok: false,
            code: 'PHOTO_IN_PROGRESS',
            reason: 'PHOTO_IN_PROGRESS',
            activeReservationId: activeForUser.reservationId,
          };
        }
        const created = {
          ok: true,
          reservationId: `res-${logicalAnalysisId}`,
          source: 'DAILY',
          status: 'RESERVED',
          replay: false,
        };
        reservations.set(key, created);
        return created;
      },
    });
    h.serviciuCascada.ruleazaCascadaVision.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return {
        text: JSON.stringify([{ nume: 'Salata', estimare_grame: 200, calorii_per_100g: 120 }]),
      };
    });
    h.flowCredits.commitPhoto.mockImplementation(async ({ reservationId }) => {
      await new Promise((r) => setTimeout(r, 15));
      for (const val of reservations.values()) {
        if (val.reservationId === reservationId) {
          val.status = 'COMMITTED';
          return { ok: true, status: 'COMMITTED', replay: false };
        }
      }
      return { ok: false, code: 'RESERVATION_NOT_FOUND' };
    });

    const [sameId1, sameId2] = await Promise.all([
      request(h.app)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'concurrent-same-logical-id')
        .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' }),
      request(h.app)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'concurrent-same-logical-id')
        .attach('imagine', VALID_PNG, { filename: 'meal.png', contentType: 'image/png' }),
    ]);

    expect([sameId1.status, sameId2.status].sort()).toEqual([200, 409]);
    expect(h.serviciuCascada.ruleazaCascadaVision).toHaveBeenCalledTimes(1);
    expect(h.flowCredits.commitPhoto).toHaveBeenCalledTimes(1);
    expect(h.flowCredits.releasePhoto).not.toHaveBeenCalled();

    const [diffJob1, diffJob2] = await Promise.all([
      request(h.app)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'concurrent-diff-job-1')
        .attach('imagine', VALID_PNG, { filename: 'meal1.png', contentType: 'image/png' }),
      request(h.app)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'concurrent-diff-job-2')
        .attach('imagine', VALID_PNG, { filename: 'meal2.png', contentType: 'image/png' }),
    ]);

    expect([diffJob1.status, diffJob2.status].sort()).toEqual([200, 409]);
    expect(h.serviciuCascada.ruleazaCascadaVision).toHaveBeenCalledTimes(2);
    expect(h.flowCredits.commitPhoto).toHaveBeenCalledTimes(2);
  });

  test('12. Play Integrity request binding: token attested for Photo A cannot authorize Photo B on multipart routes', async () => {
    const crypto = require('crypto');
    const {
      buildPlayIntegrityRequestHash,
      createPlayIntegrityVerifier,
    } = require('../utils/playIntegrity');

    const PHOTO_A = Buffer.concat([VALID_PNG, Buffer.from('photo-content-A')]);
    const PHOTO_B = Buffer.concat([VALID_PNG, Buffer.from('photo-content-B')]);
    const digestA = crypto.createHash('sha256').update(PHOTO_A).digest('hex');

    const NOW = 1_800_000_000_000;
    const hashForPhotoA = buildPlayIntegrityRequestHash({
      method: 'POST',
      path: '/analiza-foto',
      userId: USER_ID,
      idempotencyKey: 'integrity-photo-binding-1',
      payloadFingerprint: digestA,
      body: {},
    });

    const tokenBindings = new Map();
    const realVerifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo',
      now: () => NOW,
      bindToken: async ({ tokenHash, expectedRequestHash, userId, contentDigest }) => {
        const binding = { expectedRequestHash, userId, contentDigest };
        const existing = tokenBindings.get(tokenHash);
        if (!existing) {
          tokenBindings.set(tokenHash, binding);
          return true;
        }
        return existing.expectedRequestHash === binding.expectedRequestHash
          && existing.userId === binding.userId
          && existing.contentDigest === binding.contentDigest;
      },
      decodeToken: async (token) => {
        if (token !== 'token-for-photo-A') throw new Error('unknown token');
        return {
          tokenPayloadExternal: {
            requestDetails: {
              requestPackageName: 'com.totsrl.getflo',
              requestHash: hashForPhotoA,
              timestampMillis: String(NOW - 500),
            },
            appIntegrity: {
              appRecognitionVerdict: 'PLAY_RECOGNIZED',
              packageName: 'com.totsrl.getflo',
            },
            deviceIntegrity: {
              deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
            },
            accountDetails: {
              appLicensingVerdict: 'LICENSED',
            },
          },
        };
      },
    });

    let currentUploadedBytes = PHOTO_B;
    fs.promises.readFile.mockImplementation(async () => currentUploadedBytes);

    const h = createHarness({ integrityMode: 'enforce' });
    const appWithRealIntegrity = express();
    appWithRealIntegrity.use(express.json());
    const router = createAiRouter({
      requireAuth: (req, _res, next) => {
        req.user = { id: USER_ID, esteTester: false };
        next();
      },
      aiLimiter: (_req, _res, next) => next(),
      generalLimiter: (_req, _res, next) => next(),
      upload: {
        single: () => (req, _res, next) => {
          req.file = { path: 'uploaded-photo.png', mimetype: 'image/png' };
          req.body = req.body || {};
          next();
        },
      },
      checkAiUsageQuota: (_req, _res, next) => next(),
      imagekit: null,
      tasks: h.tasks,
      config: {
        imagekit: { urlEndpoint: 'https://ik.imagekit.io/getflow' },
        supabase: { url: 'https://proj.supabase.co' },
        triggerSecretKey: 'tr_test_secret',
        playIntegrity: { mode: 'enforce' },
      },
      serviciuVision: { detectImageMime: () => 'image/png' },
      serviciuCascada: h.serviciuCascada,
      serviciuChat: {
        ruleazaChat: jest.fn(),
        estimeazaMancareText: jest.fn(),
        profilNutritiv: jest.fn(),
        logFoodDinChat: jest.fn(),
      },
      semaforAi: { ruleaza: async (fn) => fn() },
      idempotencyCritic: (_req, _res, next) => next(),
      supabaseAdmin: null,
      billingService: { getPaidEntitlement: jest.fn(async () => ({ premium: false })) },
      photoJobs: h.photoJobs,
      flowCredits: h.flowCredits,
      contextDate: (req) => ({ db: {}, userId: req.user?.id }),
      integrityGuard: createPlayIntegrityGuard({
        mode: 'enforce',
        verifier: realVerifier,
      }),
    });
    appWithRealIntegrity.use('/api/v1', router);

    try {
      // 1. Attempt to upload Photo B using token attested for Photo A (without fingerprint header)
      currentUploadedBytes = PHOTO_B;
      const resPhotoBNoHeader = await request(appWithRealIntegrity)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'integrity-photo-binding-1')
        .set('X-Play-Integrity', 'token-for-photo-A')
        .attach('imagine', PHOTO_B, { filename: 'photoB.png', contentType: 'image/png' });

      expect(resPhotoBNoHeader.status).toBe(403);
      expect(resPhotoBNoHeader.body.cod || resPhotoBNoHeader.body.code).toBe('PLAY_INTEGRITY_REJECTED');
      expect(h.flowCredits.reservePhoto).not.toHaveBeenCalled();
      expect(h.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();

      // 2. Attempt to upload Photo B while spoofing X-Payload-Fingerprint = digestA
      currentUploadedBytes = PHOTO_B;
      const resPhotoBSpoofedHeader = await request(appWithRealIntegrity)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'integrity-photo-binding-1')
        .set('X-Play-Integrity', 'token-for-photo-A')
        .set('X-Payload-Fingerprint', digestA)
        .attach('imagine', PHOTO_B, { filename: 'photoB.png', contentType: 'image/png' });

      expect(resPhotoBSpoofedHeader.status).toBe(403);
      expect(resPhotoBSpoofedHeader.body.cod || resPhotoBSpoofedHeader.body.code).toBe('PLAY_INTEGRITY_REJECTED');
      expect(h.flowCredits.reservePhoto).not.toHaveBeenCalled();
      expect(h.serviciuCascada.ruleazaCascadaVision).not.toHaveBeenCalled();

      // 3. Uploading the genuine Photo A with token-for-photo-A succeeds
      currentUploadedBytes = PHOTO_A;
      const resPhotoAGenuine = await request(appWithRealIntegrity)
        .post('/api/v1/analiza-foto')
        .set('Idempotency-Key', 'integrity-photo-binding-1')
        .set('X-Play-Integrity', 'token-for-photo-A')
        .attach('imagine', PHOTO_A, { filename: 'photoA.png', contentType: 'image/png' });

      expect(resPhotoAGenuine.status).toBe(200);
      expect(h.serviciuCascada.ruleazaCascadaVision).toHaveBeenCalledTimes(1);
    } finally {
      fs.promises.readFile.mockResolvedValue(VALID_PNG);
    }
  });
});
