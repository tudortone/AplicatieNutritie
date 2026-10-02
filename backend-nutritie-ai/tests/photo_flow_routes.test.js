'use strict';

const express = require('express');
const request = require('supertest');
const createPhotoFlowRouter = require('../routes/photoFlow');
const { createPlayIntegrityGuard } = require('../utils/playIntegrity');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_URL = `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.jpg`;

function build({ fullAccess = false, integrityGuard: integrityGuardOverride } = {}) {
  const integrityCalls = [];
  const recordingIntegrityGuard = (policy) => {
    integrityCalls.push(policy);
    return (req, _res, next) => next();
  };
  const integrityGuard = integrityGuardOverride || recordingIntegrityGuard;
  const photoJobs = {
    submit: jest.fn(async (input) => ({
      id: 'job-1', status: 'queued', logicalAnalysisId: input.logicalAnalysisId,
    })),
    getActive: jest.fn(async () => ({ id: 'job-1', status: 'running' })),
    getJob: jest.fn(async ({ jobId }) => ({ id: jobId, status: 'succeeded', result: { items: [] } })),
  };
  const flowCredits = {
    getBalance: jest.fn(async () => ({ daily_remaining: 3, rewarded_balance: 0, purchased_balance: 0 })),
  };
  const imagekit = {
    getFileDetails: jest.fn(async () => ({ filePath: `/mancare/${USER_ID}/meal.jpg` })),
    deleteFile: jest.fn(async () => undefined),
  };
  const requireAuth = (req, _res, next) => {
    req.user = { id: USER_ID, esteTester: fullAccess };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createPhotoFlowRouter({
    requireAuth,
    aiLimiter: (_req, _res, next) => next(),
    generalLimiter: (_req, _res, next) => next(),
    photoJobs,
    flowCredits,
    contextDate: () => ({ db: {}, userId: USER_ID }),
    config: {
      triggerSecretKey: 'tr_dev_test',
      imagekit: { urlEndpoint: 'https://ik.imagekit.io/getflow' },
      supabase: { url: 'https://project.supabase.co' },
    },
    imagekit,
    integrityGuard,
  }));
  return { app, photoJobs, flowCredits, imagekit, integrityCalls };
}

describe('Photo Flow HTTP contract', () => {
  test('returns the server-authoritative Flow Credits balance', async () => {
    const { app, flowCredits } = build();
    const response = await request(app).get('/api/v1/flow-credits').expect(200);
    expect(response.body).toEqual(expect.objectContaining({ daily_remaining: 3 }));
    expect(flowCredits.getBalance).toHaveBeenCalledWith({ userId: USER_ID });
  });

  test('submits an owned ImageKit URL and ignores client entitlement flags', async () => {
    const { app, photoJobs, integrityCalls } = build({ fullAccess: false });
    const response = await request(app).post('/api/v1/photo-jobs').send({
      imageUrl: IMAGE_URL,
      imageFileId: 'file-1',
      analysisId: 'client-analysis-1',
      fullAccess: true,
      mealType: 'Pranz',
      language: 'ro',
    }).expect(202);
    expect(response.body).toEqual(expect.objectContaining({ id: 'job-1', status: 'queued' }));
    expect(photoJobs.submit).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      imageUrl: IMAGE_URL,
      fullAccess: false,
      logicalAnalysisId: 'client-analysis-1',
    }));
    expect(integrityCalls).toContainEqual({
      action: 'photo.submit',
      canonicalPath: '/photo-jobs',
    });
  });

  test('rejects another account folder before reserving a credit', async () => {
    const { app, photoJobs } = build();
    await request(app).post('/api/v1/photo-jobs').send({
      imageUrl: 'https://ik.imagekit.io/getflow/mancare/another-user/meal.jpg',
      analysisId: 'client-analysis-2',
    }).expect(400);
    expect(photoJobs.submit).not.toHaveBeenCalled();
  });

  test('fails closed on the actual high-cost route while low-risk balance remains available', async () => {
    const integrityGuard = createPlayIntegrityGuard({
      mode: 'enforce',
      verifier: { verify: jest.fn(async () => ({ trusted: false, reason: 'TOKEN_MISSING' })) },
    });
    const { app, photoJobs, flowCredits } = build({ integrityGuard });
    await request(app).post('/api/v1/photo-jobs').send({
      imageUrl: IMAGE_URL,
      analysisId: 'protected-analysis',
    }).expect(403);
    expect(photoJobs.submit).not.toHaveBeenCalled();

    await request(app).get('/api/v1/flow-credits').expect(200);
    expect(flowCredits.getBalance).toHaveBeenCalledTimes(1);
  });

  test('recovers only through the authenticated service boundary', async () => {
    const { app, photoJobs } = build();
    await request(app).get('/api/v1/photo-jobs/active').expect(200);
    await request(app).get('/api/v1/photo-jobs/job-1').expect(200);
    expect(photoJobs.getActive).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }));
    expect(photoJobs.getJob).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, jobId: 'job-1' }));
  });

  test('deletes an abandoned ImageKit asset only after verifying its user folder', async () => {
    const { app, imagekit } = build();
    await request(app).post('/api/v1/photo-assets/cleanup').send({ fileId: 'file-1' }).expect(204);
    expect(imagekit.getFileDetails).toHaveBeenCalledWith('file-1');
    expect(imagekit.deleteFile).toHaveBeenCalledWith('file-1');

    imagekit.getFileDetails.mockResolvedValueOnce({ filePath: '/mancare/another-user/meal.jpg' });
    await request(app).post('/api/v1/photo-assets/cleanup').send({ fileId: 'file-2' }).expect(403);
    expect(imagekit.deleteFile).not.toHaveBeenCalledWith('file-2');
  });
});
