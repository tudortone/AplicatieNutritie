'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const front = path.join(root, 'frontend-nutritie');
const eas = JSON.parse(fs.readFileSync(path.join(front, 'eas.json'), 'utf8'));
const { assertQaEnvironment } = require(path.join(front, 'lib/qaEnvironment'));
const proposed = { ...eas.build['qa-isolated'].env, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000', EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
test('actual QA profile contains both explicit fixture URLs and no dotenv loader is needed', () => {
  assert.equal(fs.existsSync(path.join(front, 'qa-isolated.env')), false);
  assert.equal(eas.build['qa-isolated'].extends, undefined);
  assert.equal(eas.build['qa-isolated'].environment, 'development');
  assert.doesNotThrow(() => assertQaEnvironment(eas.build['qa-isolated'].env));
  assert.equal(eas.build['qa-isolated'].env.EXPO_PUBLIC_API_URL, proposed.EXPO_PUBLIC_API_URL);
  assert.equal(eas.build['qa-isolated'].env.EXPO_PUBLIC_SUPABASE_URL, proposed.EXPO_PUBLIC_SUPABASE_URL);
});
test('minimal proposed profile environment passes without shell-only values', () => {
  assert.doesNotThrow(() => assertQaEnvironment(proposed));
  assert.equal(proposed.EXPO_PUBLIC_ADS_MODE, 'disabled');
  assert.equal(proposed.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'qa-synthetic-anon-key');
});
test('installed EAS resolver carries the proposed profile env to the Android builder contract', async () => {
  const { EasJsonAccessor, EasJsonUtils } = require('C:/Users/tudor/AppData/Roaming/npm/node_modules/eas-cli/node_modules/@expo/eas-json');
  const hypothetical = structuredClone(eas);
  hypothetical.build['qa-isolated'].env = proposed;
  const resolved = await EasJsonUtils.getBuildProfileAsync(EasJsonAccessor.fromRawString(JSON.stringify(hypothetical)), 'android', 'qa-isolated');
  assert.deepEqual(resolved.env, proposed);
  assert.equal(resolved.credentialsSource, 'remote');
  assert.equal(resolved.buildType, 'apk');
  assert.equal(resolved.autoIncrement, false);
  assert.doesNotThrow(() => assertQaEnvironment(resolved.env));
});
test('missing URL, Production URL and real provider credentials remain rejected', () => {
  for (const change of [
    { EXPO_PUBLIC_API_URL: undefined },
    { EXPO_PUBLIC_SUPABASE_URL: undefined },
    { EXPO_PUBLIC_API_URL: 'https://nutritie-backend-ai.onrender.com' },
    { EXPO_PUBLIC_SENTRY_DSN: 'forbidden' },
    { EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'forbidden' },
    { EXPO_PUBLIC_ADS_MODE: 'real' },
  ]) assert.throws(() => assertQaEnvironment({ ...proposed, ...change }));
});
test('proposed environment evaluates to QA package with OTA and SDK plugins disabled', () => {
  const previous = process.env;
  try {
    process.env = { ...proposed, EAS_BUILD_PROFILE: 'qa-isolated' };
    const config = require(path.join(front, 'app.config.js'))({ config: require(path.join(front, 'app.json')).expo });
    assert.equal(config.android.package, 'com.totsrl.getflo.qa');
    assert.equal(config.updates.enabled, false);
    const names = config.plugins.map(p => Array.isArray(p) ? p[0] : p);
    assert.ok(names.includes('./plugins/withQaLoopbackNetwork'));
    assert.ok(!names.some(n => ['@sentry/react-native', '@sentry/react-native/expo', 'react-native-google-mobile-ads'].includes(n)));
  } finally { process.env = previous; }
});
test('actual change is exactly the two authorized keys; every other profile is unchanged', () => {
  const original = JSON.parse(execFileSync('git', ['show', '17f6a2ab05a3c1fcb836277edc8d444ddbc626df:frontend-nutritie/eas.json'], { cwd: root, encoding: 'utf8' }));
  const restored = structuredClone(eas);
  delete restored.build['qa-isolated'].env.EXPO_PUBLIC_API_URL;
  delete restored.build['qa-isolated'].env.EXPO_PUBLIC_SUPABASE_URL;
  assert.deepEqual(restored, original);
  const hypothetical = structuredClone(eas);
  hypothetical.build['qa-isolated'].env = proposed;
  for (const name of Object.keys(eas.build).filter(n => n !== 'qa-isolated')) assert.deepEqual(hypothetical.build[name], original.build[name]);
});
