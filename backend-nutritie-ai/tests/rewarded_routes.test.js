'use strict';

const express = require('express');
const request = require('supertest');
const createRewardedRouter = require('../routes/rewarded');

function build({ verifyError, applyError } = {}) {
  const rewardedService = {
    createIntent: jest.fn(async () => ({ intentId: 'intent-1', customData: 'secret-1', expiresAt: '2030-01-01T00:10:00Z' })),
    applyVerified: jest.fn(async () => { if (applyError) throw applyError; return { applied: true, amount: 1 }; }),
  };
  const verifier = { verify: jest.fn(async () => { if (verifyError) throw verifyError; return { intentId: 'intent-1', customData: 'secret-1', transactionId: 'tx-1' }; }) };
  const requireAuth = (req, res, next) => { if (!req.headers.authorization) return res.status(401).end(); req.user = { id: '11111111-1111-4111-8111-111111111111' }; return next(); };
  const app = express(); app.use(express.json()); app.use('/api/v1', createRewardedRouter({ requireAuth, generalLimiter: (_q, _s, n) => n(), rewardedService, verifier }));
  return { app, rewardedService };
}

describe('rewarded routes', () => {
  test('requires authentication for one-time intent creation', async () => { const { app } = build(); await request(app).post('/api/v1/rewarded/intents').expect(401); await request(app).post('/api/v1/rewarded/intents').set('Authorization', 'Bearer valid').expect(201); });
  test('applies only verified callback data', async () => { const { app, rewardedService } = build(); await request(app).get('/api/v1/webhooks/admob/rewarded?x=1').expect(200); expect(rewardedService.applyVerified).toHaveBeenCalledWith({ intentId: 'intent-1', customData: 'secret-1', transactionId: 'tx-1' }); });
  test('invalid signatures never touch credits', async () => { const { app, rewardedService } = build({ verifyError: Object.assign(new Error('bad'), { code: 'SSV_SIGNATURE_INVALID', status: 403 }) }); await request(app).get('/api/v1/webhooks/admob/rewarded?signature=bad').expect(403); expect(rewardedService.applyVerified).not.toHaveBeenCalled(); });
  test('database failure is a controlled fail-closed 503', async () => { const { app } = build({ applyError: new Error('db unavailable') }); await request(app).get('/api/v1/webhooks/admob/rewarded?x=1').expect(503, { eroare: 'Creditul recompensat nu a putut fi procesat.', cod: 'REWARDED_UNAVAILABLE' }); });
});
