'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const front = path.resolve(__dirname, '../../frontend-nutritie');
const load = createRequire(path.join(front, 'package.json'));
const fingerprint = load('expo/fingerprint');
const fingerprintLoad = createRequire(load.resolve('@expo/fingerprint/package.json'));

test('locked modern and legacy glob consumers keep their own brace API contracts', () => {
  const modern = fingerprintLoad('minimatch');
  assert.deepEqual(modern.braceExpand('meal-{a,b}.json'), ['meal-a.json', 'meal-b.json']);
  const legacy = load('minimatch');
  assert.deepEqual(legacy.braceExpand('meal-{a,b}.json'), ['meal-a.json', 'meal-b.json']);
  const expoLoad = createRequire(load.resolve('expo/package.json'));
  assert.deepEqual(expoLoad('minimatch').braceExpand('meal-{a,b}.json'), ['meal-a.json', 'meal-b.json']);
});

test('actual Expo Android fingerprint completes without a skip flag', { timeout: 120000 }, async () => {
  assert.equal(process.env.EAS_SKIP_AUTO_FINGERPRINT, undefined);
  const previous = process.env;
  try {
    process.env = { ...previous, ...JSON.parse(fs.readFileSync(path.join(front, 'eas.json'))).build['qa-isolated'].env,
      EAS_BUILD_PROFILE: 'qa-isolated', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' };
    const result = await fingerprint.createFingerprintAsync(front, {
      platforms: ['android'], ignorePaths: ['android/**/*', 'ios/**/*'], silent: true,
    });
    assert.match(result.hash, /^[a-f0-9]{40,64}$/);
    assert.ok(result.sources.length > 0);
  } finally { process.env = previous; }
});
