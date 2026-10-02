'use strict';

jest.mock('@trigger.dev/sdk/v3', () => ({ task: (definition) => definition }));
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {} }));

const { createPhotoJobService } = require('../services/ai/photoJobService');
const { analizaMancareTask } = require('../src/trigger/analiza-mancare-ai');
const { userSyncTask } = require('../src/trigger/user-sync');

const USERS = Array.from({ length: 40 }, (_, index) =>
  `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`);

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function capacityHarness() {
  const records = new Map();
  const logical = new Map();
  const queued = [];
  const reservations = new Map();
  let nextJob = 1;
  let nextReservation = 1;

  const repo = {
    findByLogicalId: jest.fn(async ({ userId, logicalAnalysisId }) =>
      logical.get(`${userId}:${logicalAnalysisId}`) || null),
    create: jest.fn(async (input) => {
      const row = { ...input, id: `job-${nextJob++}`, status: 'queued' };
      records.set(row.id, row);
      logical.set(`${input.userId}:${input.logicalAnalysisId}`, row);
      return row;
    }),
    attachTriggerRun: jest.fn(async ({ jobId, triggerRunId }) => {
      records.get(jobId).triggerRunId = triggerRunId;
    }),
    markFailed: jest.fn(),
    getOwned: jest.fn(),
    getActiveOwned: jest.fn(),
  };
  const flowCredits = {
    reservePhoto: jest.fn(async ({ userId, logicalAnalysisId }) => {
      const reservationId = `reservation-${nextReservation++}`;
      reservations.set(`${userId}:${logicalAnalysisId}`, reservationId);
      return { ok: true, reservationId, source: 'DAILY' };
    }),
    releasePhoto: jest.fn(),
  };
  const tasks = {
    trigger: jest.fn(async (_taskId, payload) => {
      queued.push({ payload, admittedAt: 0 });
      return { id: `run-${queued.length}` };
    }),
  };
  const billing = { getPaidEntitlement: jest.fn(async () => ({ premium: false })) };
  return {
    records, logical, queued, reservations, repo, flowCredits, tasks,
    service: createPhotoJobService({ repo, flowCredits, tasks, billing }),
  };
}

function drainMockedGemini(queue, concurrency = 8, duration = 100) {
  const waits = [];
  const activeByUser = new Map();
  let maxRunning = 0;
  let maxPerUser = 0;
  let now = 0;
  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const wave = queue.slice(offset, offset + concurrency);
    for (const job of wave) {
      waits.push(now - job.admittedAt);
      const active = (activeByUser.get(job.payload.userId) || 0) + 1;
      activeByUser.set(job.payload.userId, active);
      maxPerUser = Math.max(maxPerUser, active);
    }
    maxRunning = Math.max(maxRunning, wave.length);
    now += duration;
    for (const job of wave) activeByUser.set(job.payload.userId, 0);
  }
  return {
    maxRunning,
    maxPerUser,
    queueP50Ms: percentile(waits, 0.5),
    queueP95Ms: percentile(waits, 0.95),
    drainMs: now,
  };
}

describe('40-user mocked Photo capacity gate', () => {
  test('uses an eight-wide Photo queue and a separate identity queue', () => {
    expect(analizaMancareTask.queue).toEqual({ name: 'ai-photo', concurrencyLimit: 8 });
    expect(userSyncTask.queue).toEqual({ name: 'identity-sync', concurrencyLimit: 2 });
  });

  test('admits 40/40 durable jobs, drains at <=8, and never duplicates spend', async () => {
    const h = capacityHarness();
    const submissions = USERS.map((userId, index) => h.service.submit({
      userId,
      logicalAnalysisId: `analysis-${index + 1}`,
      imageUrl: `https://ik.imagekit.io/getflow/mancare/${userId}/meal.jpg`,
      dataContext: { db: {} },
    }));
    const accepted = await Promise.all(submissions);

    expect(accepted).toHaveLength(40);
    expect(h.records).toHaveProperty('size', 40);
    expect(h.queued).toHaveLength(40);
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledTimes(40);
    expect(h.reservations).toHaveProperty('size', 40);

    const replays = await Promise.all(USERS.map((userId, index) => h.service.submit({
      userId,
      logicalAnalysisId: `analysis-${index + 1}`,
      imageUrl: `https://ik.imagekit.io/getflow/mancare/${userId}/meal.jpg`,
      dataContext: { db: {} },
    })));
    expect(replays.every((job) => job.replay === true)).toBe(true);
    expect(h.records).toHaveProperty('size', 40);
    expect(h.queued).toHaveLength(40);
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledTimes(40);

    const metrics = drainMockedGemini(h.queued);
    expect(metrics).toEqual({
      maxRunning: 8,
      maxPerUser: 1,
      queueP50Ms: 200,
      queueP95Ms: 400,
      drainMs: 500,
    });
  });
});

module.exports = { drainMockedGemini };
