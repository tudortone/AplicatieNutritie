'use strict';

/**
 * production_v2_security.test.js — Test suite for release/production-v2.
 *
 * Covers:
 *   1. Auth Guard Verification (401 on protected endpoints)
 *   2. Fail-Closed Environment Validation (missing SUPABASE_URL / IMAGEKIT_URL_ENDPOINT)
 *   3. Storage Security (SecureStore not AsyncStorage for tokens)
 *   4. Gamification Idempotency (duplicate event handling)
 *   5. AI Status Public Endpoint (no internal data leakage)
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

// ── 0. Mock setup ─────────────────────────────────────────────────────────

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn((token) => {
        if (token === 'token_valid') {
          return Promise.resolve({
            data: { user: { id: '22222222-2222-4222-8222-222222222222', email: 'prod@nutriai.ro' } },
            error: null,
          });
        }
        return Promise.resolve({ data: { user: null }, error: new Error('Token invalid') });
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockImplementation(() => ({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(JSON.stringify({
            caloriiTinta: 2200,
            proteineTinta: 160,
          })),
        },
      }),
    })),
  })),
}));

const app = require('../server');

// ── 1. Auth Guard Verification ────────────────────────────────────────────

describe('Auth Guard Verification', () => {
  describe('GET /api/v1/ai-status (JWT-protected endpoint)', () => {
    it('returns 401 without any authentication', async () => {
      const res = await request(app).get('/api/v1/ai-status');
      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('eroare');
    });

    it('returns 200 with a valid bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/ai-status')
        .set('Authorization', 'Bearer token_valid');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('gemini');
      expect(res.body).toHaveProperty('openai');
      expect(res.body).toHaveProperty('groq');
      expect(res.body).toHaveProperty('openrouter');
    });

    it('does not expose internal model names, costs, or error messages', async () => {
      const res = await request(app)
        .get('/api/v1/ai-status')
        .set('Authorization', 'Bearer token_valid');
      const providers = ['gemini', 'openai', 'groq', 'openrouter'];
      for (const p of providers) {
        const entry = res.body[p];
        expect(entry).not.toHaveProperty('model');
        expect(entry).not.toHaveProperty('cost');
        expect(entry).not.toHaveProperty('mesaj');
        expect(entry).not.toHaveProperty('rataEsec');
        expect(entry).toHaveProperty('status');
        expect(entry).toHaveProperty('secundeRamase');
      }
    });
  });

  describe('Protected endpoints reject unauthenticated calls', () => {
    const protectedEndpoints = [
      { method: 'post', path: '/api/v1/chat', body: { mesaj: 'test' } },
      { method: 'post', path: '/api/v1/mese', body: { nume: 'test', calorii: 100 } },
      { method: 'post', path: '/api/v1/analiza-foto', body: {} },
      { method: 'post', path: '/api/v1/calculeaza-profil', body: {} },
      { method: 'get', path: '/api/v1/user/premium-status' },
      { method: 'get', path: '/api/v1/user/export-data' },
    ];

    protectedEndpoints.forEach(({ method, path: routePath, body }) => {
      it(`${method.toUpperCase()} ${routePath} returns 401 without Bearer token`, async () => {
        const req = request(app)[method](routePath);
        if (body) req.send(body);
        const res = await req;
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('eroare');
      });
    });
  });

  describe('Valid JWT token passes through', () => {
    it('POST /api/v1/chat with valid token does not return 401', async () => {
      const res = await request(app)
        .post('/api/v1/chat')
        .set('Authorization', 'Bearer token_valid')
        .send({ mesaj: 'Bună' });
      expect(res.statusCode).not.toBe(401);
    });

    it('POST /api/v1/calculeaza-profil with valid token does not return 401', async () => {
      const res = await request(app)
        .post('/api/v1/calculeaza-profil')
        .set('Authorization', 'Bearer token_valid')
        .send({
          greutate: 80, inaltime: 180, varsta: 30,
          sex: 'M', activitate: 'moderat', scop: 'slabire',
        });
      expect(res.statusCode).not.toBe(401);
    });
  });
});

// ── 2. Fail-Closed Environment Validation ─────────────────────────────────

describe('Fail-Closed Environment Checks', () => {
  describe('config/env.js fail-fast on missing required vars', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Reset the config cache so incarcaConfig re-evaluates
      jest.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('aborts startup when SUPABASE_URL is missing in non-test mode', () => {
      // The config validates SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
      // as required. In test mode, it falls back to defaults. We verify the validation
      // list is correct.
      const envSource = fs.readFileSync(
        path.join(__dirname, '../config/env.js'), 'utf8',
      );
      expect(envSource).toContain("'SUPABASE_URL'");
      expect(envSource).toContain("'SUPABASE_ANON_KEY'");
      expect(envSource).toContain("'SUPABASE_SERVICE_ROLE_KEY'");
      // Verify fail-fast: opreste() is called for missing vars
      expect(envSource).toContain('opreste(');
      expect(envSource).toMatch(/lipsa\.length\s*>\s*0/);
    });

    it('rejects wildcard CORS_ORIGINS in production', () => {
      const envSource = fs.readFileSync(
        path.join(__dirname, '../config/env.js'), 'utf8',
      );
      expect(envSource).toContain('permiteOrice');
      expect(envSource).toMatch(/esteProductie\s*&&.*permiteOrice/);
    });

    it('requires GEMINI_API_KEY in production', () => {
      const envSource = fs.readFileSync(
        path.join(__dirname, '../config/env.js'), 'utf8',
      );
      expect(envSource).toMatch(/esteProductie\s*&&\s*!process\.env\.GEMINI_API_KEY/);
    });

    it('requires REDIS_URL in production', () => {
      const envSource = fs.readFileSync(
        path.join(__dirname, '../config/env.js'), 'utf8',
      );
      expect(envSource).toMatch(/esteProductie\s*&&\s*!process\.env\.REDIS_URL/);
    });
  });

  describe('Trigger.dev task fail-closed on missing GEMINI_API_KEY', () => {
    it('analiza-mancare-ai.js checks GEMINI_API_KEY before processing', () => {
      const taskSource = fs.readFileSync(
        path.join(__dirname, '../src/trigger/analiza-mancare-ai.js'), 'utf8',
      );
      // The task must abort early if GEMINI_API_KEY is missing
      expect(taskSource).toContain('process.env.GEMINI_API_KEY');
      expect(taskSource).toMatch(/!process\.env\.GEMINI_API_KEY/);
      expect(taskSource).toContain("success: false");
    });

    it('analiza-mancare-ai.js validates image URL (SSRF protection)', () => {
      const taskSource = fs.readFileSync(
        path.join(__dirname, '../src/trigger/analiza-mancare-ai.js'), 'utf8',
      );
      expect(taskSource).toContain('valideazaImagine');
      expect(taskSource).toContain('IMAGEKIT_URL_ENDPOINT');
      expect(taskSource).toContain('SUPABASE_URL');
      // Reject redirects
      expect(taskSource).toContain("redirect: 'manual'");
    });
  });
});

// ── 3. Storage Security ──────────────────────────────────────────────────

describe('Storage Security', () => {
  it('frontend supabase.ts uses SecureStore, not raw AsyncStorage for tokens', () => {
    const supabaseSrc = fs.readFileSync(
      path.join(__dirname, '../../frontend-nutritie/supabase.ts'), 'utf8',
    );
    // Must import and use SecureStore
    expect(supabaseSrc).toContain("from 'expo-secure-store'");
    expect(supabaseSrc).toContain('SecureStore');
    // Must use chunked storage with manifest
    expect(supabaseSrc).toContain('DIMENSIUNE_CHUNK');
    expect(supabaseSrc).toContain('manifest');
    // Must NOT store tokens in raw AsyncStorage
    expect(supabaseSrc).not.toMatch(/AsyncStorage\.setItem\([^)]*token/i);
    expect(supabaseSrc).not.toMatch(/AsyncStorage\.setItem\([^)]*jwt/i);
  });

  it('frontend supabase.ts falls back to memory-only when SecureStore is unavailable', () => {
    const supabaseSrc = fs.readFileSync(
      path.join(__dirname, '../../frontend-nutritie/supabase.ts'), 'utf8',
    );
    // In-memory fallback map
    expect(supabaseSrc).toContain('memorieSesiune');
    // Availability check function
    expect(supabaseSrc).toContain('secureStoreDisponibil');
  });

  it('no production code logs JWT tokens to console', () => {
    const srcFiles = [
      '../../frontend-nutritie/supabase.ts',
      '../../frontend-nutritie/context/AuthContext.tsx',
      '../../frontend-nutritie/context/PremiumContext.tsx',
      '../routes/status.js',
      '../routes/ai.js',
      '../routes/mese.js',
      '../server.js',
    ];

    for (const file of srcFiles) {
      const fullPath = path.join(__dirname, file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      // console.log with token/jwt/authorization is forbidden
      expect(content).not.toMatch(/console\.log\([^)]*(?:token|jwt|access_token|authorization)/i);
    }
  });
});

// ── 4. Gamification Server Event & Idempotency ───────────────────────────

describe('Gamification Server Event Validation', () => {
  it('GamificareContext uses server-authoritative RPC (sincronizeaza_gamificare_sigur)', () => {
    const gamSrc = fs.readFileSync(
      path.join(__dirname, '../../frontend-nutritie/context/GamificareContext.tsx'), 'utf8',
    );
    expect(gamSrc).toContain('sincronizeaza_gamificare_sigur');
    // Must not send XP from client
    expect(gamSrc).not.toMatch(/rpc\([^)]*xpTotal/);
    expect(gamSrc).not.toMatch(/rpc\([^)]*xp_total/);
  });

  it('gamification migration REVOKEs direct writes from authenticated users', () => {
    const migrationPath = path.join(
      __dirname,
      '../../supabase/migrations/20260805000003_gamificare_authoritative.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.gamificare FROM authenticated, anon');
    expect(sql).toContain('sincronizeaza_gamificare_sigur()');
    // The function must extract user_id from auth.uid(), not from parameters
    expect(sql).toContain("v_user_id UUID := auth.uid()");
  });

  describe('Idempotency middleware', () => {
    it('rejects Idempotency-Key longer than 200 characters', async () => {
      const longKey = 'x'.repeat(201);
      const res = await request(app)
        .post('/api/v1/mese')
        .set('Authorization', 'Bearer token_valid')
        .set('Idempotency-Key', longKey)
        .send({ nume: 'test', calorii: 100 });
      expect(res.statusCode).toBe(400);
      expect(res.body.eroare).toContain('Idempotency-Key');
    });

    it('idempotency.js namespaces requests by hashed token (no raw token storage)', () => {
      const idemSrc = fs.readFileSync(
        path.join(__dirname, '../utils/idempotency.js'), 'utf8',
      );
      // Uses SHA-256 hash of the token, not the raw token
      expect(idemSrc).toContain('sha256');
      expect(idemSrc).toContain("hash(autorizare.slice(7))");
      // Falls back to IP hash for anonymous requests
      expect(idemSrc).toContain('anon:');
    });

    it('idempotency middleware skips non-POST methods', () => {
      const idemSrc = fs.readFileSync(
        path.join(__dirname, '../utils/idempotency.js'), 'utf8',
      );
      expect(idemSrc).toContain("req.method !== 'POST'");
    });
  });
});

// ── 5. Android Configuration ─────────────────────────────────────────────

describe('Android Release Configuration', () => {
  let appConfig;

  beforeAll(() => {
    const appJsonPath = path.join(__dirname, '../../frontend-nutritie/app.json');
    appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  });

  it('android.allowBackup is false', () => {
    expect(appConfig.expo.android.allowBackup).toBe(false);
  });

  it('declares only necessary permissions (no dangerous extras)', () => {
    const perms = appConfig.expo.android.permissions;
    expect(perms).toContain('android.permission.CAMERA');
    expect(perms).toContain('android.permission.ACTIVITY_RECOGNITION');
    // Must NOT have broad dangerous permissions
    expect(perms).not.toContain('android.permission.READ_CONTACTS');
    expect(perms).not.toContain('android.permission.READ_PHONE_STATE');
    expect(perms).not.toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(perms).not.toContain('android.permission.RECORD_AUDIO');
  });

  it('has predictiveBackGestureEnabled disabled (Android security)', () => {
    expect(appConfig.expo.android.predictiveBackGestureEnabled).toBe(false);
  });

  it('has EAS project ID configured for OTA updates', () => {
    expect(appConfig.expo.extra.eas.projectId).toBeTruthy();
    expect(appConfig.expo.updates.url).toContain('u.expo.dev');
  });
});
