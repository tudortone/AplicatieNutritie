'use strict';
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { handleMeals } = require('./manual-meals.cjs');
const BODY_LIMIT = 8192;
const KEY = 'qa-synthetic-anon-key';
const USER = Object.freeze({ id: '00000000-0000-4000-8000-000000000024', aud: 'authenticated',
  role: 'authenticated', email: 'samsung.qa@example.invalid', email_confirmed_at: '2026-10-23T00:00:00Z',
  created_at: '2026-10-23T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { fixtureOnly: true }, identities: [] });
const PROFILE = Object.freeze({ user_id: USER.id, varsta: 30, greutate: 75, inaltime: 175,
  sex: 'masculin', activitate: 'moderat', obiectiv: 'mentinere',
  calorii_tinta: 2200, proteine_tinta: 140, carbi_tinta: 260, grasimi_tinta: 67 });

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-GetFlow-Fixture': 'synthetic-only', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let text = ''; let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > BODY_LIMIT) { reject(Object.assign(new Error('Body too large'), { status: 413 })); return; }
      text += chunk.toString('utf8');
    });
    req.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function newSession() {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
  // shortcut: deliberately non-authoritative fixture JWT, never accepted by real services.
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER.id, exp: expiry, role: 'authenticated', fixtureOnly: true })}.${randomBytes(32).toString('base64url')}`;
  return { access_token: token, refresh_token: randomBytes(32).toString('hex'),
    expires_in: 3600, expires_at: expiry, token_type: 'bearer', user: USER };
}

function createFixtureServer(state = { session: null }) {
  state.meals ??= new Map();
  state.nextMealId ??= 1000000;
  async function route(req, res) {
    const authority = `127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== `http://${authority}`)) {
      return reply(res, 403, { code: 'LOCAL_CLIENT_ONLY' });
    }
    const url = new URL(req.url, `http://${authority}`);
    if (req.method === 'GET' && url.pathname === '/health') return reply(res, 200, { fixtureOnly: true });
    const supabase = url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rest/');
    if (supabase && req.headers.apikey !== KEY) return reply(res, 401, { code: 'SYNTHETIC_KEY_REQUIRED' });
    if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
      const body = await readJson(req);
      const validPassword = url.searchParams.get('grant_type') === 'password' && body?.email === USER.email && body?.password === 'Fixture-only-2026!';
      const validRefresh = url.searchParams.get('grant_type') === 'refresh_token' && state.session && body?.refresh_token === state.session.refresh_token;
      if (!validPassword && !validRefresh) return reply(res, 400, { error: 'invalid_grant', error_description: 'Synthetic identity only' });
      state.session = newSession();
      return reply(res, 200, state.session);
    }
    const authorized = state.session && state.session.expires_at > Date.now() / 1000 && req.headers.authorization === `Bearer ${state.session.access_token}`;
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') return reply(res, authorized ? 200 : 401, authorized ? USER : { code: 'UNAUTHORIZED' });
    if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
      if (!authorized) return reply(res, 401, { code: 'UNAUTHORIZED' });
      state.session = null; return reply(res, 200, {});
    }
    if (url.pathname === '/rest/v1/mese') {
      if (!authorized) return reply(res, 401, { code: 'UNAUTHORIZED' });
      return handleMeals(req, res, url, state, { reply, readJson, userId: USER.id });
    }
    return readFixture(req, res, url, authorized);
  }
  return http.createServer({ maxHeaderSize: BODY_LIMIT, requestTimeout: 5000 }, (req, res) => {
    route(req, res).catch((error) => reply(res, error.status === 413 ? 413 : 400, { code: 'INVALID_FIXTURE_REQUEST' }));
  });
}

function readFixture(req, res, url, authorized) {
  const reads = {
    '/api/v1/user/premium-status': { validatServer: true, fixtureOnly: true, isPremium: false, isTester: false, isAdmin: false, accessTier: 'free', hasFullAccess: false },
    '/api/v1/flow-credits': { dailyRemaining: 0, rewarded: 0, purchased: 0, total: 0, rewardedGrantsRemaining: 0, serverDay: new Date().toISOString().slice(0, 10) },
    '/api/v1/user/profil': { exista: true, complet: true, profil: { ...PROFILE, caloriiTinta: 2200, proteineTinta: 140, carbiTinta: 260, grasimiTinta: 67 } },
    '/rest/v1/profil': req.headers.accept?.includes('application/vnd.pgrst.object+json') ? PROFILE : [PROFILE],
    '/rest/v1/antrenamente': [],
    '/rest/v1/produse_camara': [],
    '/rest/v1/exercitii': [],
  };
  if (req.method !== 'GET' || !Object.hasOwn(reads, url.pathname)) return reply(res, 501, { code: 'FIXTURE_UNSUPPORTED', fixtureOnly: true });
  if (!authorized) return reply(res, 401, { code: 'UNAUTHORIZED' });
  const filter = url.searchParams.get('user_id');
  if (filter && filter !== `eq.${USER.id}`) return reply(res, 403, { code: 'SYNTHETIC_USER_ONLY' });
  return reply(res, 200, reads[url.pathname]);
}

exports.createFixtureServer = createFixtureServer;
if (require.main === module) {
  const state = { session: null };
  for (const port of [3000, 54321]) {
    const server = createFixtureServer(state);
    server.on('error', () => { console.error(`Fixture bind failed on loopback port ${port}; no alternate interface selected.`); process.exit(1); });
    server.listen(port, '127.0.0.1', () => console.log(`SYNTHETIC_ONLY http://127.0.0.1:${port}`));
  }
}
