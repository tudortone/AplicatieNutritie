'use strict';

const express = require('express');
const request = require('supertest');
const createRewardedRouter = require('../routes/rewarded');

function build({ verifyError, applyError, verified, intentStatus = { status: 'PENDING', expiresAt: '2030-01-01T00:10:00.000Z' }, integrityError } = {}) {
  const rewardedService = {
    createIntent: jest.fn(async () => ({ intentId: 'intent-1', customData: 'secret-1', expiresAt: '2030-01-01T00:10:00Z' })),
    getIntentStatus: jest.fn(async ({ userId }) => userId.endsWith('1111') ? intentStatus : null),
    applyVerified: jest.fn(async () => { if (applyError) throw applyError; return { applied: true, amount: 1 }; }),
  };
  const verifier = { verify: jest.fn(async () => { if (verifyError) throw verifyError; return verified || { kind: 'reward', intentId: 'intent-1', customData: 'secret-1', transactionId: 'tx-1' }; }) };
  const requireAuth = (req, res, next) => { if (!req.headers.authorization) return res.status(401).end(); req.user = { id: '11111111-1111-4111-8111-111111111111' }; return next(); };
  const integrityCalls = [];
  const integrityGuard = (policy) => {
    integrityCalls.push(policy);
    return (_req, res, next) => integrityError ? res.status(403).json({ cod: 'PLAY_INTEGRITY_FAILED' }) : next();
  };
  const app = express(); app.use(express.json()); app.use('/api/v1', createRewardedRouter({ requireAuth, generalLimiter: (_q, _s, n) => n(), rewardedService, verifier, integrityGuard }));
  return { app, rewardedService, integrityCalls };
}

describe('rewarded routes', () => {
  test('requires authentication for one-time intent creation', async () => { const { app } = build(); await request(app).post('/api/v1/rewarded/intents').expect(401); await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(201); });
  test('returns only the authenticated owner’s reward intent status', async () => {
    const { app, rewardedService } = build({ intentStatus: { status: 'GRANTED', expiresAt: '2030-01-01T00:10:00.000Z' } });
    await request(app).get('/api/v1/rewarded/intents/intent-1').set('Authorization', 'Bearer valid').expect(200, { status: 'GRANTED' });
    expect(rewardedService.getIntentStatus).toHaveBeenCalledWith({ intentId: 'intent-1', userId: '11111111-1111-4111-8111-111111111111' });
  });
  test('does not reveal an intent when it is not owned by the authenticated account', async () => {
    const { app } = build({ intentStatus: null });
    await request(app).get('/api/v1/rewarded/intents/other-intent').set('Authorization', 'Bearer valid').expect(404, { eroare: 'Creditul recompensat nu a putut fi procesat.', cod: 'REWARDED_INTENT_NOT_FOUND' });
  });
  test('passes intent creation through the configured Play Integrity guard', async () => {
    const { app, integrityCalls } = build();
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(201);
    expect(integrityCalls).toContainEqual({ action: 'rewarded.intent', canonicalPath: '/rewarded/intents' });
  });
  test('rejects intent creation when Play Integrity is enforcing and the request is invalid', async () => {
    const { app, rewardedService } = build({ integrityError: true });
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(403);
    expect(rewardedService.createIntent).not.toHaveBeenCalled();
  });
  test('applies only verified callback data', async () => { const { app, rewardedService } = build(); await request(app).get('/api/v1/webhooks/admob/rewarded?x=1').expect(200); expect(rewardedService.applyVerified).toHaveBeenCalledWith({ kind: 'reward', intentId: 'intent-1', customData: 'secret-1', transactionId: 'tx-1' }); });
  test('returns 200 for a verified console probe, including replay, without calling the credit service', async () => {
    const { app, rewardedService } = build({ verified: { kind: 'console_verification', transactionId: 'probe-1' } });
    await request(app).get('/api/v1/webhooks/admob/rewarded?probe=1').expect(200, { ok: true });
    await request(app).get('/api/v1/webhooks/admob/rewarded?probe=1').expect(200, { ok: true });
    expect(rewardedService.applyVerified).not.toHaveBeenCalled();
  });
  test('invalid signatures never touch credits', async () => { const { app, rewardedService } = build({ verifyError: Object.assign(new Error('bad'), { code: 'SSV_SIGNATURE_INVALID', status: 403 }) }); await request(app).get('/api/v1/webhooks/admob/rewarded?signature=bad').expect(403); expect(rewardedService.applyVerified).not.toHaveBeenCalled(); });
  test('database failure is a controlled fail-closed 503', async () => { const { app } = build({ applyError: new Error('db unavailable') }); await request(app).get('/api/v1/webhooks/admob/rewarded?x=1').expect(503, { eroare: 'Creditul recompensat nu a putut fi procesat.', cod: 'REWARDED_UNAVAILABLE' }); });
});
