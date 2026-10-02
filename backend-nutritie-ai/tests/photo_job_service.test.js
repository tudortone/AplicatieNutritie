'use strict';

const { createPhotoJobService, PhotoJobError } = require('../services/ai/photoJobService');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function harness({ reserveResult, dispatchError } = {}) {
  const records = new Map();
  let nextId = 1;
  const repo = {
    findByLogicalId: jest.fn(async ({ userId, logicalAnalysisId }) =>
      [...records.values()].find((job) =>
        job.userId === userId && job.logicalAnalysisId === logicalAnalysisId) ?? null),
    create: jest.fn(async (input) => {
      const job = { ...input, id: `job-${nextId++}`, status: 'queued' };
      records.set(job.id, job);
      return job;
    }),
    attachTriggerRun: jest.fn(async ({ jobId, triggerRunId }) => {
      Object.assign(records.get(jobId), { triggerRunId });
    }),
    markFailed: jest.fn(async ({ jobId, errorCode }) => {
      Object.assign(records.get(jobId), { status: 'failed', errorCode });
    }),
    getOwned: jest.fn(async ({ userId, jobId }) => {
      const row = records.get(jobId);
      return row?.userId === userId ? row : null;
    }),
    getActiveOwned: jest.fn(async ({ userId }) =>
      [...records.values()].find((job) => job.userId === userId &&
        ['queued', 'running'].includes(job.status)) ?? null),
  };
  const flowCredits = {
    reservePhoto: jest.fn(async () => reserveResult ?? ({
      ok: true,
      reservationId: 'reservation-1',
      source: 'DAILY',
      status: 'RESERVED',
    })),
    releasePhoto: jest.fn(async () => ({ ok: true, status: 'RELEASED' })),
  };
  const tasks = {
    trigger: jest.fn(async () => {
      if (dispatchError) throw dispatchError;
      return { id: `run-${nextId}` };
    }),
  };
  const billing = {
    getPaidEntitlement: jest.fn(async () => ({ premium: false })),
  };
  return {
    repo, flowCredits, tasks, billing, records,
    service: createPhotoJobService({ repo, flowCredits, tasks, billing }),
  };
}

describe('durable Photo AI job admission', () => {
  const input = {
    userId: USER_A,
    logicalAnalysisId: 'logical-1',
    imageUrl: 'https://ik.imagekit.io/getflow/mancare/11111111-1111-4111-8111-111111111111/a.jpg',
    imageFileId: 'mancare/user/a',
    mealType: 'Pranz',
    language: 'ro',
    fullAccess: false,
  };

  test('reserves before durable job creation and Trigger dispatch', async () => {
    const h = harness();
    await expect(h.service.submit(input)).resolves.toMatchObject({ status: 'queued' });
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_A,
      logicalAnalysisId: 'logical-1',
      entitlement: 'free',
    }));
    expect(h.repo.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_A,
      creditReservationId: 'reservation-1',
      queueName: 'ai-photo',
    }));
    expect(h.tasks.trigger).toHaveBeenCalledWith('analiza-mancare-ai', expect.objectContaining({
      userId: USER_A,
      reservationId: 'reservation-1',
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
  });

  test('same logical operation replays its durable job without another spend or dispatch', async () => {
    const h = harness();
    const first = await h.service.submit(input);
    const second = await h.service.submit(input);
    expect(second.id).toBe(first.id);
    expect(second.replay).toBe(true);
    expect(h.flowCredits.reservePhoto).toHaveBeenCalledTimes(1);
    expect(h.tasks.trigger).toHaveBeenCalledTimes(1);
  });

  test('another active Photo for the user is rejected truthfully for every entitlement', async () => {
    for (const code of ['PHOTO_IN_PROGRESS']) {
      const h = harness({ reserveResult: { ok: false, code } });
      await expect(h.service.submit({ ...input, fullAccess: true }))
        .rejects.toMatchObject({ code, status: 409 });
      expect(h.repo.create).not.toHaveBeenCalled();
    }
  });

  test('full access comes only from server identity; premium comes only from billing authority', async () => {
    const full = harness();
    await full.service.submit({ ...input, fullAccess: true });
    expect(full.flowCredits.reservePhoto).toHaveBeenCalledWith(expect.objectContaining({ entitlement: 'full_access' }));

    const premium = harness();
    premium.billing.getPaidEntitlement.mockResolvedValue({ premium: true });
    await premium.service.submit({ ...input, logicalAnalysisId: 'logical-premium', fullAccess: false });
    expect(premium.flowCredits.reservePhoto).toHaveBeenCalledWith(expect.objectContaining({ entitlement: 'premium' }));
  });

  test('Trigger dispatch rejection marks the job failed and releases exactly once', async () => {
    const h = harness({ dispatchError: new Error('network unavailable') });
    await expect(h.service.submit(input)).rejects.toBeInstanceOf(PhotoJobError);
    expect(h.repo.markFailed).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'TRIGGER_DISPATCH_FAILED' }));
    expect(h.flowCredits.releasePhoto).toHaveBeenCalledTimes(1);
    expect(h.flowCredits.releasePhoto).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_A,
      reservationId: 'reservation-1',
    }));
  });

  test('job result and active recovery are always scoped to the authenticated account', async () => {
    const h = harness();
    const job = await h.service.submit(input);
    await expect(h.service.getJob({ userId: USER_B, jobId: job.id }))
      .rejects.toMatchObject({ code: 'PHOTO_JOB_NOT_FOUND', status: 404 });
    await expect(h.service.getJob({ userId: USER_A, jobId: job.id })).resolves.toMatchObject({ id: job.id });
    await expect(h.service.getActive({ userId: USER_B })).resolves.toBeNull();
    expect(h.repo.getOwned).toHaveBeenCalledWith({ userId: USER_A, jobId: job.id });
  });
});
