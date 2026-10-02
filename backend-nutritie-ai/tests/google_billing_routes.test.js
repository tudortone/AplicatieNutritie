'use strict';

const express = require('express');
const request = require('supertest');
const createBillingGoogleRouter = require('../routes/billingGoogle');
const createUserRouter = require('../routes/user');
const fs = require('fs');
const path = require('path');

const USER = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  esteTester: false,
  esteAdmin: false,
});

function requireAuth(req, res, next) {
  if (req.headers.authorization !== 'Bearer valid') {
    return res.status(401).json({ eroare: 'unauthorized' });
  }
  req.user = { ...USER };
  return next();
}

function harness() {
  const calls = [];
  const integrityCalls = [];
  const integrityGuard = (policy) => {
    integrityCalls.push(policy);
    return (req, _res, next) => {
      req.playIntegrity = { trusted: true, reason: 'VERIFIED', action: policy.action };
      next();
    };
  };
  const billingLimiter = (req, _res, next) => {
    calls.push(req.user?.id ?? null);
    next();
  };
  const billingService = {
    verifyAndPersist: jest.fn().mockResolvedValue({
      premium: true,
      productId: 'premium_monthly',
      expiresDate: '2030-01-01T00:00:00.000Z',
      validatServer: true,
    }),
    resync: jest.fn().mockResolvedValue({ results: [{ premium: true }] }),
    getPaidEntitlement: jest.fn().mockResolvedValue({
      premium: true,
      productId: 'premium_monthly',
      expiresDate: '2030-01-01T00:00:00.000Z',
      validatServer: true,
    }),
    verifyConsumable: jest.fn().mockResolvedValue({
      validatServer: true,
      productId: 'getflow_credits_10',
      creditsGranted: 10,
      consumed: true,
    }),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/billing/google', createBillingGoogleRouter({
    requireAuth,
    billingLimiter,
    billingService,
    googlePlayConfig: {
      packageName: 'com.totsrl.getflo',
      productIds: ['premium_monthly', 'premium_annual'],
      creditProductIds: ['getflow_credits_10', 'getflow_credits_30'],
    },
    integrityGuard,
  }));
  return { app, billingService, limiterCalls: calls, integrityCalls };
}

describe('rutele Google Play billing autentificate', () => {
  test('bootstrap-ul monteaza serviciul canonic pe prefixul v1', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    expect(source).toContain("require('./routes/billingGoogle')");
    expect(source).toContain("require('./repositories/googleBillingRepo')");
    expect(source).toContain("require('./services/billing/googleBillingService')");
    expect(source).toContain("app.use('/api/v1/billing/google', billingGoogleR)");
    expect(source).toContain('googlePlayConfig: config.googlePlay');
  });

  test('nu expun produse sau operatii fara identitate verificata', async () => {
    const { app, billingService, limiterCalls } = harness();
    expect((await request(app).get('/api/v1/billing/google/products')).statusCode).toBe(401);
    expect((await request(app).post('/api/v1/billing/google/verify').send({ purchaseToken: 'x'.repeat(24) })).statusCode)
      .toBe(401);
    expect(billingService.verifyAndPersist).not.toHaveBeenCalled();
    expect(limiterCalls).toEqual([]);
  });

  test('returneaza exclusiv package-ul si allowlist-ul sigure', async () => {
    const { app } = harness();
    const response = await request(app)
      .get('/api/v1/billing/google/products')
      .set('Authorization', 'Bearer valid');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      packageName: 'com.totsrl.getflo',
      productIds: ['premium_monthly', 'premium_annual'],
      creditProductIds: ['getflow_credits_10', 'getflow_credits_30'],
    });
    expect(JSON.stringify(response.body)).not.toMatch(/credential|secret|token/i);
  });

  test('verify ia userId numai din auth si accepta numai purchaseToken in corp', async () => {
    const { app, billingService, limiterCalls, integrityCalls } = harness();
    const response = await request(app)
      .post('/api/v1/billing/google/verify')
      .set('Authorization', 'Bearer valid')
      .send({ purchaseToken: 'google-play-token-1234567890' });
    expect(response.statusCode).toBe(200);
    expect(billingService.verifyAndPersist).toHaveBeenCalledWith({
      userId: USER.id,
      purchaseToken: 'google-play-token-1234567890',
    });
    expect(limiterCalls).toEqual([USER.id]);
    expect(integrityCalls).toContainEqual({
      action: 'billing.verify',
      canonicalPath: '/billing/google/verify',
      preserveEntitlement: true,
    });
    expect(response.body).toMatchObject({ premium: true, accessTier: 'premium', hasFullAccess: true });

    const injectat = await request(app)
      .post('/api/v1/billing/google/verify')
      .set('Authorization', 'Bearer valid')
      .send({ purchaseToken: 'google-play-token-1234567890', userId: 'attacker' });
    expect(injectat.statusCode).toBe(400);
  });

  test('resync accepta numai un vector de tokenuri si intoarce verdictul persistent curent', async () => {
    const { app, billingService } = harness();
    const response = await request(app)
      .post('/api/v1/billing/google/resync')
      .set('Authorization', 'Bearer valid')
      .send({ purchaseTokens: ['google-play-token-1234567890'] });
    expect(response.statusCode).toBe(200);
    expect(billingService.resync).toHaveBeenCalledWith({
      userId: USER.id,
      purchaseTokens: ['google-play-token-1234567890'],
    });
    expect(billingService.getPaidEntitlement).toHaveBeenCalledWith({ userId: USER.id });
    expect(response.body).toMatchObject({ premium: true, restored: 1, accessTier: 'premium' });

    const invalid = await request(app)
      .post('/api/v1/billing/google/resync')
      .set('Authorization', 'Bearer valid')
      .send({ purchaseTokens: 'not-an-array' });
    expect(invalid.statusCode).toBe(400);
  });

  test('verifica un consumabil cu identitatea exclusiva din auth', async () => {
    const { app, billingService } = harness();
    const response = await request(app)
      .post('/api/v1/billing/google/verify-consumable')
      .set('Authorization', 'Bearer valid')
      .send({ productId: 'getflow_credits_10', purchaseToken: 'google-play-token-1234567890' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ creditsGranted: 10, consumed: true, validatServer: true });
    expect(billingService.verifyConsumable).toHaveBeenCalledWith({
      userId: USER.id,
      productId: 'getflow_credits_10',
      purchaseToken: 'google-play-token-1234567890',
    });
    const injected = await request(app)
      .post('/api/v1/billing/google/verify-consumable')
      .set('Authorization', 'Bearer valid')
      .send({ productId: 'getflow_credits_10', purchaseToken: 'x'.repeat(24), userId: 'attacker' });
    expect(injected.statusCode).toBe(400);
  });

  test('traduce erorile billing in raspunsuri sigure fara token', async () => {
    const { app, billingService } = harness();
    billingService.verifyAndPersist.mockRejectedValue(Object.assign(new Error('contains raw token'), {
      code: 'ACCOUNT_MISMATCH',
      status: 409,
    }));
    const response = await request(app)
      .post('/api/v1/billing/google/verify')
      .set('Authorization', 'Bearer valid')
      .send({ purchaseToken: 'google-play-token-1234567890' });
    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      eroare: 'Verificarea Google Play nu a putut fi finalizata.',
      cod: 'ACCOUNT_MISMATCH',
    });
    expect(JSON.stringify(response.body)).not.toContain('google-play-token');
  });
});

describe('premium-status citeste numai verdictul Google persistent', () => {
  test('pastreaza ordinea premium > tester si nu face apel comercial extern', async () => {
    const billingService = {
      getPaidEntitlement: jest.fn().mockResolvedValue({
        premium: true,
        productId: 'premium_annual',
        expiresDate: '2030-01-01T00:00:00.000Z',
      }),
    };
    const app = express();
    app.use('/api/v1/user', createUserRouter({
      requireAuth: (req, _res, next) => {
        req.user = { ...USER, esteTester: true };
        next();
      },
      generalLimiter: (_req, _res, next) => next(),
      contextDate: () => ({}),
      profilRepo: { getProfil: jest.fn() },
      billingService,
    }));

    const response = await request(app).get('/api/v1/user/premium-status');
    expect(response.statusCode).toBe(200);
    expect(billingService.getPaidEntitlement).toHaveBeenCalledWith({ userId: USER.id });
    expect(response.body).toMatchObject({
      premium: true,
      isPremium: true,
      isTester: false,
      accessTier: 'premium',
      hasFullAccess: true,
      validatServer: true,
    });
  });

  test('testerul ramane full-access fara sa fie declarat Premium sau admin', async () => {
    const billingService = { getPaidEntitlement: jest.fn().mockResolvedValue(null) };
    const app = express();
    app.use('/api/v1/user', createUserRouter({
      requireAuth: (req, _res, next) => {
        req.user = { ...USER, esteTester: true };
        next();
      },
      generalLimiter: (_req, _res, next) => next(),
      contextDate: () => ({}),
      profilRepo: { getProfil: jest.fn() },
      billingService,
    }));
    const response = await request(app).get('/api/v1/user/premium-status');
    expect(response.body).toMatchObject({
      premium: false,
      isPremium: false,
      isTester: true,
      isAdmin: false,
      accessTier: 'tester',
      hasFullAccess: true,
      productId: null,
      basePlanId: null,
      offerId: null,
      state: null,
      expiresDate: null,
      acknowledgementPending: false,
      isTestPurchase: false,
    });
  });

  test('testerul ramane full-access cand persistenta comerciala este indisponibila', async () => {
    const billingService = { getPaidEntitlement: jest.fn().mockRejectedValue(new Error('db secret')) };
    const app = express();
    app.use('/api/v1/user', createUserRouter({
      requireAuth: (req, _res, next) => {
        req.user = { ...USER, esteTester: true };
        next();
      },
      generalLimiter: (_req, _res, next) => next(),
      contextDate: () => ({}),
      profilRepo: { getProfil: jest.fn() },
      billingService,
    }));

    const response = await request(app).get('/api/v1/user/premium-status');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      premium: false,
      isPremium: false,
      isTester: true,
      isAdmin: false,
      accessTier: 'tester',
      hasFullAccess: true,
      validatServer: true,
    });
    expect(JSON.stringify(response.body)).not.toContain('db secret');
  });

  test('o eroare DB este fail-closed 503 si nu acorda contract de acces', async () => {
    const billingService = { getPaidEntitlement: jest.fn().mockRejectedValue(new Error('db secret')) };
    const app = express();
    app.use('/api/v1/user', createUserRouter({
      requireAuth: (req, _res, next) => { req.user = { ...USER }; next(); },
      generalLimiter: (_req, _res, next) => next(),
      contextDate: () => ({}),
      profilRepo: { getProfil: jest.fn() },
      billingService,
    }));
    const response = await request(app).get('/api/v1/user/premium-status');
    expect(response.statusCode).toBe(503);
    expect(response.body.premium).not.toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('db secret');
  });
});
