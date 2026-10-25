'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const { createFixtureServer } = require('./fixture-server.cjs');
const frontRequire = createRequire(require('node:path').resolve(__dirname, '../../frontend-nutritie/package.json'));
const { createClient } = frontRequire('@supabase/supabase-js');

async function withServer(run) {
  const server = createFixtureServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('bootstrap is explicitly synthetic and remote Host/Origin requests are rejected', () => withServer(async (base) => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).fixtureOnly, true);
  const spoofed = await new Promise((resolve, reject) => {
    http.get(`${base}/health`, { headers: { Host: 'attacker.invalid' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(spoofed, 403);
  assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
}));

test('only synthetic password identity is accepted; malformed bodies and wrong keys fail closed', () => withServer(async (base) => {
  const request = (body, key = 'qa-synthetic-anon-key') => fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body,
  });
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(JSON.stringify({ email: 'real@example.com', password: 'anything' }))).status, 400);
  assert.equal((await request('{}', 'hosted-key')).status, 401);
  assert.equal((await request('x'.repeat(9000))).status, 413);
}));

test('real Supabase SDK can sign in, read synthetic profile, refresh and sign out', () => withServer(async (base) => {
  const client = createClient(base, 'qa-synthetic-anon-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' });
  assert.equal(error, null);
  assert.equal(data.user.id, '00000000-0000-4000-8000-000000000024');
  assert.equal((await client.auth.getUser()).data.user.id, data.user.id);
  const profile = await client.from('profil').select('*').eq('user_id', data.user.id).maybeSingle();
  assert.equal(profile.error, null);
  assert.equal(profile.data.greutate, 75);
  assert.equal((await client.auth.refreshSession()).error, null);
  assert.equal((await client.auth.signOut()).error, null);
  assert.equal((await client.auth.getSession()).data.session, null);
}));

test('API data requires a fixture session and unsupported mutations cannot reach a provider', () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/v1/flow-credits`)).status, 401);
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'qa-synthetic-anon-key' }, body: JSON.stringify({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' }) });
  const { access_token: token } = await login.json();
  const headers = { Authorization: `Bearer ${token}`, apikey: 'qa-synthetic-anon-key' };
  const credits = await fetch(`${base}/api/v1/flow-credits`, { headers });
  assert.equal(credits.status, 200);
  assert.equal((await credits.json()).total, 0);
  for (const path of ['/api/v1/chat', '/api/v1/photo-analysis', '/rest/v1/profil', '/auth/v1/authorize']) {
    assert.equal((await fetch(`${base}${path}`, { method: 'POST', headers })).status, 501);
  }
  assert.equal((await fetch(`${base}/unimplemented`)).status, 501);
}));

test('separate API and Supabase listeners share only this fixture identity', async () => {
  const state = { session: null };
  const auth = createFixtureServer(state); const api = createFixtureServer(state);
  await Promise.all([auth, api].map((s) => new Promise((resolve) => s.listen(0, '127.0.0.1', resolve))));
  try {
    const login = await fetch(`http://127.0.0.1:${auth.address().port}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'qa-synthetic-anon-key' }, body: JSON.stringify({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' }) });
    const body = await login.json();
    const response = await fetch(`http://127.0.0.1:${api.address().port}/api/v1/user/profil`, { headers: { Authorization: `Bearer ${body.access_token}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).profil.greutate, 75);
  } finally { for (const s of [auth, api]) { s.closeAllConnections(); await new Promise((resolve) => s.close(resolve)); } }
});

for (const table of ['mese', 'antrenamente', 'produse_camara', 'exercitii']) {
  test(`startup SDK ${table} read returns an empty synthetic collection without accepting writes`, () => withServer(async (base) => {
    const client = createClient(base, 'qa-synthetic-anon-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    await client.auth.signInWithPassword({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' });
    const response = await client.from(table).select('*');
    assert.equal(response.error, null);
    assert.deepEqual(response.data, []);
    assert.equal((await client.from(table).insert({ synthetic: true })).status, table === 'mese' ? 400 : 501);
  }));
}

test('premium startup contract is complete and grants no entitlement', () => withServer(async (base) => {
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'qa-synthetic-anon-key' }, body: JSON.stringify({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' }) });
  const { access_token: token } = await login.json();
  const response = await fetch(`${base}/api/v1/user/premium-status`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.validatServer, true);
  assert.equal(body.fixtureOnly, true);
  assert.equal(body.accessTier, 'free');
  for (const key of ['isPremium', 'isTester', 'isAdmin', 'hasFullAccess']) assert.equal(body[key], false);
}));

test('SDK persisted synthetic session survives client reconstruction and logout revokes it', () => withServer(async (base) => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
  const client = () => createClient(base, 'qa-synthetic-anon-key', { auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
  const first = client();
  const login = await first.auth.signInWithPassword({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' });
  const restarted = client();
  assert.equal((await restarted.auth.getSession()).data.session.user.id, login.data.user.id);
  assert.equal((await restarted.auth.signOut()).error, null);
  const expired = await fetch(`${base}/auth/v1/user`, { headers: { apikey: 'qa-synthetic-anon-key', Authorization: `Bearer ${login.data.session.access_token}` } });
  assert.equal(expired.status, 401);
  assert.equal((await client().auth.getSession()).data.session, null);
}));
