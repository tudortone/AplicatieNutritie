'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const load = createRequire(path.join(root, 'package.json'));
const sdk = load('@trigger.dev/sdk/v3');
const core = load('@trigger.dev/core/v3');
const version = 'candidate SDK';
const legacy = { userId: 'synthetic', jobId: 'synthetic-job', reservationId: 'synthetic-reservation', imageUrl: 'https://fixture.invalid/food.png' };
const bound = { ...legacy, logicalAnalysisId: 'synthetic-operation', requestFingerprint: 'a'.repeat(64) };
const key = 'synthetic-stable-key';

async function capture(payload, options = {}) {
  let body;
  const previous = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:1/api/v1/tasks/analiza-mancare-ai/trigger');
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'run_fixture_only', isCached: false }), { status: 200 });
  };
  try {
    sdk.configure({ baseURL: 'http://127.0.0.1:1', accessToken: 'tr_dev_synthetic_offline_only' });
    await sdk.tasks.trigger('analiza-mancare-ai', payload, { idempotencyKey: key, idempotencyKeyTTL: '24h', ...options });
    core.TriggerTaskRequestBody.parse(body);
    assert.deepEqual(await core.parsePacket({ data: body.payload, dataType: body.options.payloadType }), payload);
    return body;
  } finally { global.fetch = previous; }
}

test(`${version}: legacy producer can pin an old worker without altering v1 payload`, async () => {
  process.env.TRIGGER_VERSION = '20261012.2';
  delete process.env.TRIGGER_EXTERNAL_DEPLOYMENT_ID;
  const body = await capture(legacy);
  assert.equal(body.options.lockToVersion, '20261012.2');
  assert.equal(body.options.idempotencyKey, createHash('sha256').update(key).digest('hex'));
});

test(`${version}: v2 producer pin, exact retry binding and distinct operation key`, async () => {
  process.env.TRIGGER_VERSION = '20261025.synthetic-v2';
  const first = await capture(bound);
  assert.equal(first.options.lockToVersion, '20261025.synthetic-v2');
  assert.deepEqual(await capture(bound), first);
  assert.notEqual((await capture({ ...bound, logicalAnalysisId: 'synthetic-distinct' }, { idempotencyKey: 'synthetic-distinct-key' })).options.idempotencyKey, first.options.idempotencyKey);
});

test(`${version}: immutable external deployment id is serialized independently of current-version promotion`, async () => {
  delete process.env.TRIGGER_VERSION;
  process.env.TRIGGER_EXTERNAL_DEPLOYMENT_ID = '8f6977f8d6b76ae096587c6a8840ce2afeb6c3f7';
  const body = await capture(bound);
  assert.equal(body.options.externalDeploymentId, process.env.TRIGGER_EXTERNAL_DEPLOYMENT_ID);
  assert.equal(body.options.lockToVersion, undefined);
  delete process.env.TRIGGER_EXTERNAL_DEPLOYMENT_ID;
});

test(`${version}: actual separate ESM and CJS entrypoints preserve task registration and retry metadata`, async () => {
  const esmPath = load.resolve('@trigger.dev/sdk/v3').replace(/dist[\\/]commonjs[\\/]/, 'dist/esm/');
  assert.ok(esmPath.includes('dist/esm/'));
  const esm = await import(pathToFileURL(esmPath).href);
  const { StandardResourceCatalog } = load('@trigger.dev/core/v3/workers');
  core.resourceCatalog.setGlobalResourceCatalog(new StandardResourceCatalog());
  core.resourceCatalog.setCurrentFileContext('offline.fixture.js', 'offline.fixture.mjs');
  for (const [suffix, api] of [['cjs', sdk], ['esm', esm]]) {
    api.task({ id: `offline-${suffix}`, retry: { maxAttempts: 3 }, run: async (payload) => payload });
    assert.equal(core.resourceCatalog.taskExists(`offline-${suffix}`), true);
    assert.equal(core.resourceCatalog.getTaskManifest(`offline-${suffix}`).retry.maxAttempts, 3);
  }
  assert.deepEqual(core.resourceCatalog.listTaskIdCollisions(), []);
  core.resourceCatalog.clearCurrentFileContext();
});
