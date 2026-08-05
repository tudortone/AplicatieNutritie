const request = require('supertest');

process.env.REVENUECAT_SECRET_API_KEY = 'rc_key_test';

jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn((token) => {
          if (token === 'token_valid') {
            return Promise.resolve({ data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com' } }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Token invalid') });
        }),
        admin: { deleteUser: jest.fn().mockResolvedValue({ error: null }) },
      },
    })),
  };
});

const app = require('../server');
const createUserRouter = require('../routes/user');

describe('B-09 — Validare premium server-side (RevenueCat)', () => {
  beforeEach(() => {
    createUserRouter.curataPremiumCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ar trebui sa returneze premium=true cand entitlement-ul este activ', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        subscriber: { entitlements: { premium: { active: true, expires_date: '2026-09-01T00:00:00Z' } } },
      }),
    });

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_valid');
    expect(res.statusCode).toBe(200);
    expect(res.body.premium).toBe(true);
    expect(res.body.validatServer).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/subscribers/11111111-1111-4111-8111-111111111111'),
      expect.objectContaining({ headers: { Authorization: 'Bearer rc_key_test' } }),
    );
  });

  it('ar trebui sa refoloseasca timp de 60s numai un raspuns RevenueCat reusit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ subscriber: { entitlements: {} } }),
    });

    const prima = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_valid');
    const aDoua = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_valid');

    expect(prima.statusCode).toBe(200);
    expect(aDoua.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ar trebui sa returneze premium=false la entitlement inactiv (fail-closed)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ subscriber: { entitlements: {} } }),
    });

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_valid');
    expect(res.statusCode).toBe(200);
    expect(res.body.premium).toBe(false);
    expect(res.body.entitlement).toBeNull();
  });

  it('ar trebui sa raspunda 502 la o eroare RevenueCat — NU premium', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: jest.fn() });

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_valid');
    expect(res.statusCode).toBe(502);
    expect(res.body.premium).not.toBe(true);
  });

  it('ar trebui sa raspunda 503 la exceptie de retea — NU premium', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('conexiune esuata'));

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_valid');
    expect(res.statusCode).toBe(503);
  });
});
