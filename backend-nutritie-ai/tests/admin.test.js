const request = require('supertest');

process.env.REVENUECAT_SECRET_API_KEY = 'rc_key_test';

jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn((token) => {
          if (token === 'token_admin') {
            // Contul de admin are rolul in app_metadata (server-controlled).
            return Promise.resolve({
              data: {
                user: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  email: 'admin@nutriai.app',
                  app_metadata: { rol: 'admin' },
                },
              },
              error: null,
            });
          }
          if (token === 'token_valid') {
            return Promise.resolve({
              data: {
                user: {
                  id: '11111111-1111-4111-8111-111111111111',
                  email: 'test@example.com',
                },
              },
              error: null,
            });
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
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

describe('Admin (app_metadata.rol) — super-utilizator', () => {
  beforeEach(() => {
    createUserRouter.curataPremiumCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ar trebui sa acorde premium:true adminului FARA a apela RevenueCat', async () => {
    global.fetch = jest.fn();

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', 'Bearer token_admin');

    expect(res.statusCode).toBe(200);
    expect(res.body.premium).toBe(true);
    expect(res.body.validatServer).toBe(true);
    expect(res.body.entitlement).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ar trebui sa pastreze comportamentul normal pentru un utilizator ne-admin', async () => {
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
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('Admin — plafon AI (bypass in checkAiUsageQuota)', () => {
  it('ar trebui sa sara peste contor si sa continue pentru admin', async () => {
    const contor = {
      increment: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(0),
    };
    const check = creeazaCheckAiUsageQuota({ contor, limitaZi: 5, fereastraMs: 1000 });

    const req = { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', esteAdmin: true } };
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await check(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(contor.increment).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('ar trebui sa aplice plafonul pentru un utilizator ne-admin', async () => {
    const contor = {
      increment: jest.fn().mockResolvedValue(10),
      ttl: jest.fn().mockResolvedValue(3600),
    };
    const check = creeazaCheckAiUsageQuota({ contor, limitaZi: 5, fereastraMs: 1000 });

    const req = { user: { id: '11111111-1111-4111-8111-111111111111', esteAdmin: false } };
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await check(req, res, next);

    expect(contor.increment).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});
