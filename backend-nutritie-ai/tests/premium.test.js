const request = require('supertest');

process.env.REVENUECAT_SECRET_API_KEY = 'rc_key_test';
// P-13: delay-uri zero în teste (nu vrem timeout de 1+2+4s în CI)
process.env.PREMIUM_RETRY_DELAYS_MS = '0,0,0';

// Contorul asigură că fiecare test folosește un user_id diferit → zero interferență de cache
let testCounter = 0;

jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn((token) => {
          // token_valid_N → user_id cu N în SHA
          const m = token.match(/^token_valid_(\d+)$/);
          if (m) {
            const n = m[1].padStart(4, '0');
            return Promise.resolve({
              data: { user: { id: `11111111-1111-4111-8111-11111111${n}`, email: `test${m[1]}@example.com` } },
              error: null,
            });
          }
          if (token === 'token_valid') {
            return Promise.resolve({ data: { user: { id: '11111111-1111-4111-8111-111111110000', email: 'test@example.com' } }, error: null });
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

// Helper: token unic per test (user_id diferit → nu se poate hit cache-ul altui test)
function tokenUnic() {
  testCounter++;
  return `token_valid_${String(testCounter).padStart(4, '0')}`;
}

describe('B-09 — Validare premium server-side (RevenueCat)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (global.fetch) global.fetch = undefined;
  });

  it('ar trebui sa returneze premium=true cand entitlement-ul este activ', async () => {
    const token = tokenUnic();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        subscriber: { entitlements: { premium: { active: true, expires_date: '2026-09-01T00:00:00Z' } } },
      }),
    });

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.premium).toBe(true);
    expect(res.body.validatServer).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/subscribers/'),
      expect.objectContaining({ headers: { Authorization: 'Bearer rc_key_test' } }),
    );
  });

  it('ar trebui sa refoloseasca timp de 60s numai un raspuns RevenueCat reusit', async () => {
    const token = tokenUnic();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ subscriber: { entitlements: {} } }),
    });

    const prima = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', `Bearer ${token}`);
    const aDoua = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', `Bearer ${token}`);

    expect(prima.statusCode).toBe(200);
    expect(aDoua.statusCode).toBe(200);
    // Prima cerere apelează RevenueCat, a doua vine din cache
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ar trebui sa returneze premium=false la entitlement inactiv (fail-closed)', async () => {
    const token = tokenUnic();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ subscriber: { entitlements: {} } }),
    });

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.premium).toBe(false);
    expect(res.body.entitlement).toBeNull();
  });

  it('ar trebui sa raspunda 502 sau 503 la o eroare RevenueCat — NU premium', async () => {
    const token = tokenUnic();
    // P-13: cu retry (pana la 3 incercari), fetch-ul e apelat de mai multe ori pe 500
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: jest.fn() });

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', `Bearer ${token}`);
    // P-13: dupa retry-uri pe 500, primim 502 sau 503
    expect([502, 503]).toContain(res.statusCode);
    expect(res.body.premium).not.toBe(true);
  });

  it('ar trebui sa raspunda 503 la exceptie de retea — NU premium', async () => {
    const token = tokenUnic();
    global.fetch = jest.fn().mockRejectedValue(new Error('conexiune esuata'));

    const res = await request(app)
      .get('/api/user/premium-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(503);
  });
});
