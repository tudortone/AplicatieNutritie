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
    reservePhoto: jest.fn(async ({ logicalAnalysisId }) => {
      if (typeof reserveResult === 'function') {
        return reserveResult({ logicalAnalysisId });
      }
      if (reserveResult) return reserveResult;
      return {
        ok: true,
        reservationId: `res-${logicalAnalysisId}`,
        source: 'DAILY',
        replay: false,
      };
    }),
    releasePhoto: jest.fn(async () => ({ ok: true, status: 'RELEASED' })),
    commitPhoto: jest.fn(async () => ({ ok: true, status: 'COMMITTED' })),
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

  test('5. failed and non-food jobs release reserved credits on both async and sync legacy routes', async () => {
    const hDispatchFail = createHarness({
      triggerError: new Error('TRIGGER_UNAVAILABLE'),
    });

    const rAsyncFail = await request(hDispatchFail.app)
      .post('/api/v1/trigger-analiza-mancare')
      .send({ imageUrl: `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg` });

    expect(rAsyncFail.status).toBe(503);
    expect(hDispatchFail.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(hDispatchFail.flowCredits.releasePhoto).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      reason: 'TRIGGER_DISPATCH_FAILED',
    }));

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
    expect(hVisionErr.flowCredits.releasePhoto).toHaveBeenCalledTimes(1);
    expect(hVisionErr.flowCredits.commitPhoto).not.toHaveBeenCalled();
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
});
