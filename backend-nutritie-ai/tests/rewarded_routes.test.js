'use strict';

const express = require('express');
const request = require('supertest');
const createRewardedRouter = require('../routes/rewarded');
const TOKEN_HASH = 'a'.repeat(64);
const REQUEST_HASH = 'b'.repeat(43);

function build({ verifyError, applyError, verified, intentStatus = { status: 'PENDING', expiresAt: '2030-01-01T00:10:00.000Z' }, integrityError, integrityValue, user = {}, paidEntitlement = { premium: false }, entitlementError } = {}) {
  const rewardedService = {
    createIntent: jest.fn(async () => ({ intentId: 'intent-1', customData: 'secret-1', expiresAt: '2030-01-01T00:10:00Z', status: 'PENDING' })),
    getIntentStatus: jest.fn(async ({ userId }) => userId.endsWith('1111') ? intentStatus : null),
    applyVerified: jest.fn(async () => { if (applyError) throw applyError; return { applied: true, amount: 1 }; }),
  };
  const verifier = { verify: jest.fn(async () => { if (verifyError) throw verifyError; return verified || { kind: 'reward', intentId: 'intent-1', customData: 'secret-1', transactionId: 'tx-1' }; }) };
  const requireAuth = (req, res, next) => { if (!req.headers.authorization) return res.status(401).end(); req.user = { id: '11111111-1111-4111-8111-111111111111', ...user }; return next(); };
  const billingService = { getPaidEntitlement: jest.fn(async () => { if (entitlementError) throw entitlementError; return paidEntitlement; }) };
  const integrityCalls = [];
  const integrityGuard = (policy) => {
    integrityCalls.push(policy);
    return (req, res, next) => {
      if (integrityError) return res.status(403).json({ cod: 'PLAY_INTEGRITY_FAILED' });
      req.playIntegrity = integrityValue || { trusted: true, tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH };
      return next();
    };
  };
  const app = express(); app.use(express.json()); app.use('/api/v1', createRewardedRouter({ requireAuth, generalLimiter: (_q, _s, n) => n(), rewardedService, billingService, verifier, integrityGuard }));
  return { app, rewardedService, billingService, integrityCalls };
}

describe('rewarded routes', () => {
  test('requires authentication for one-time intent creation', async () => { const { app } = build(); await request(app).post('/api/v1/rewarded/intents').expect(401); await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(201); });
  test.each([
    { label: 'paid Premium', paidEntitlement: { premium: true } },
    { label: 'tester', user: { esteTester: true } },
    { label: 'admin', user: { esteAdmin: true } },
  ])('rejects rewarded intent creation for full-access $label accounts', async ({ paidEntitlement, user }) => {
    const { app, rewardedService } = build({ paidEntitlement, user });
    const response = await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(403);
    expect(response.body.cod).toBe('REWARDED_NOT_ELIGIBLE');
    expect(rewardedService.createIntent).not.toHaveBeenCalled();
  });
  test('fails closed when paid entitlement cannot be verified', async () => {
    const { app, rewardedService } = build({ entitlementError: Object.assign(new Error('billing temporarily unavailable'), { code: 'UPSTREAM_UNAVAILABLE' }) });
    const response = await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(503);
    expect(response.body.cod).toBe('UPSTREAM_UNAVAILABLE');
    expect(rewardedService.createIntent).not.toHaveBeenCalled();
  });
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
    const { app, integrityCalls, rewardedService } = build();
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(201);
    expect(integrityCalls).toContainEqual({ action: 'rewarded.intent', canonicalPath: '/rewarded/intents' });
    expect(rewardedService.createIntent).toHaveBeenCalledWith({
      userId: '11111111-1111-4111-8111-111111111111', tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH,
    });
  });
  test('does not create a rewarded intent without a verified durable binding', async () => {
    const { app, rewardedService } = build({ integrityValue: { trusted: false, reason: 'DISABLED' } });
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(403);
    expect(rewardedService.createIntent).not.toHaveBeenCalled();
  });
  test('returns the same intent status on verified token replay', async () => {
    const { app, rewardedService } = build();
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(201);
    rewardedService.createIntent.mockResolvedValueOnce({
      intentId: 'intent-1', customData: 'secret-1', expiresAt: '2030-01-01T00:10:00Z', status: 'PENDING', replay: true,
    });
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(200);
    expect(rewardedService.createIntent).toHaveBeenNthCalledWith(1, {
      userId: '11111111-1111-4111-8111-111111111111', tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH,
    });
    expect(rewardedService.createIntent).toHaveBeenNthCalledWith(2, {
      userId: '11111111-1111-4111-8111-111111111111', tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH,
    });
  });
  test('includes the unchanged expired state on exact replay and never reactivates it', async () => {
    const { app, rewardedService } = build();
    rewardedService.createIntent.mockResolvedValueOnce({
      intentId: 'intent-expired', customData: 'secret-expired', expiresAt: '2029-12-31T23:59:59Z',
      status: 'EXPIRED', replay: true,
    });
    await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid')
      .expect(200).expect(({ body }) => expect(body).toEqual({
        intentId: 'intent-expired', expiresAt: '2029-12-31T23:59:59Z', status: 'EXPIRED',
        ssv: { userId: 'intent-expired', customData: 'secret-expired' },
      }));
    expect(rewardedService.createIntent).toHaveBeenCalledTimes(1);
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
