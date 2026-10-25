'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { createFixtureServer } = require('./fixture-server.cjs');
const { createClient } = createRequire(path.resolve(__dirname, '../../frontend-nutritie/package.json'))('@supabase/supabase-js');
const USER = '00000000-0000-4000-8000-000000000024';
const meal = { id: '10001', user_id: USER, nume: 'Synthetic oats', tip_masa: 'Mic dejun', calorii: 300, proteine: 12, carbohidrati: 45, grasimi: 8, fibre: 4.5, data: '2026-10-25', ora: '10:00:00', created_at: '2026-10-25T07:00:00.000Z', alimente: [], imagine_url: null };

async function session(run) {
  const server = createFixtureServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = createClient(base, 'qa-synthetic-anon-key', { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const result = await client.auth.signInWithPassword({ email: 'samsung.qa@example.invalid', password: 'Fixture-only-2026!' });
    assert.equal(result.error, null);
    await run(client, base);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('manual synthetic insert/read/replay preserves confirmed values and does not duplicate', () => session(async (client) => {
  const saved = await client.from('mese').insert(meal).select();
  assert.equal(saved.error, null);
  assert.deepEqual(saved.data, [meal]);
  const replay = await client.from('mese').insert({ ...meal, calorii: 999 }).select();
  assert.equal(replay.error.code, '23505');
  const restored = await client.from('mese').select('*').eq('user_id', USER).eq('id', meal.id).maybeSingle();
  assert.equal(restored.error, null);
  assert.deepEqual(restored.data, meal);
}));

test('the BIGINT fixture exposes the real UUID error so the existing app fallback can save', () => session(async (client) => {
  const input = { ...meal, id: '11111111-2222-5333-a444-555555555555' };
  const rejected = await client.from('mese').insert(input).select();
  assert.equal(rejected.error?.code, '22P02');
  const fallback = { ...input };
  delete fallback.id;
  const saved = await client.from('mese').insert(fallback).select();
  assert.equal(saved.error, null);
  assert.match(saved.data[0].id, /^[1-9]\d*$/);
  assert.equal((await client.from('mese').select('*')).data.length, 1);
}));

test('edit/delete are bounded by one row; journal date reads reflect synthetic state', () => session(async (client) => {
  assert.equal((await client.from('mese').insert(meal).select()).error, null);
  assert.equal((await client.from('mese').update({ calorii: 400 }).select()).status, 400);
  const edit = await client.from('mese').update({ calorii: 350 }).eq('id', meal.id).select();
  assert.equal(edit.error, null);
  assert.equal(edit.data[0].calorii, 350);
  assert.deepEqual((await client.from('mese').select('*').gte('created_at', '2026-10-26T00:00:00Z')).data, []);
  assert.equal((await client.from('mese').delete().eq('id', meal.id)).error, null);
  assert.deepEqual((await client.from('mese').select('*')).data, []);
}));

test('foreign owner, invalid nutrients, unknown fields and unauthenticated writes fail closed', () => session(async (client, base) => {
  assert.equal((await client.from('mese').insert({ ...meal, user_id: 'another-user' }).select()).status, 403);
  for (const invalid of [{ calorii: -1 }, { calorii: 1.5 }, { synthetic: true }, { imagine_url: 'https://remote.invalid/private.png' }]) {
    assert.equal((await client.from('mese').insert({ ...meal, ...invalid }).select()).status, 400);
  }
  assert.equal((await fetch(`${base}/rest/v1/mese`, { method: 'POST', headers: { apikey: 'qa-synthetic-anon-key' }, body: JSON.stringify(meal) })).status, 401);
  assert.deepEqual((await client.from('mese').select('*')).data, []);
}));
