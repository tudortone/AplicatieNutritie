'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash, AFTER } = require('./apply-sdk-metadata-patch.cjs');
const root = path.resolve(process.env.GETFLOW_TRIGGER_TOOL_ROOT);
const expectedLock = fs.readFileSync(path.join(__dirname, 'package-lock.json'));

test('clean installation retains the exact audited lock and supported installed package versions', () => {
  assert.equal(hash(fs.readFileSync(path.join(root, 'package-lock.json'))), hash(expectedLock));
  const lock = JSON.parse(expectedLock);
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (!name) continue;
    assert.match(pkg.resolved, /^https:\/\/registry\.npmjs\.org\//);
    assert.match(pkg.integrity, /^sha512-/);
    const file = path.join(root, name, 'package.json');
    if (fs.existsSync(file)) assert.equal(JSON.parse(fs.readFileSync(file)).version, pkg.version, name);
    else assert.ok(pkg.optional && ((pkg.os && !pkg.os.includes(process.platform)) || (pkg.cpu && !pkg.cpu.includes(process.arch))), `MISSING_REQUIRED_PACKAGE:${name}`);
  }
  assert.equal(hash(fs.readFileSync(path.join(root, 'node_modules/trigger.dev/dist/esm/build/plugins.js'))), AFTER);
});

test('official CLI and SDK tarball integrity values and package alignment remain fixed', () => {
  const lock = JSON.parse(expectedLock);
  assert.equal(lock.packages['node_modules/trigger.dev'].version, '4.8.1');
  assert.equal(lock.packages['node_modules/@trigger.dev/sdk'].version, '4.8.1');
  assert.equal(lock.packages['node_modules/trigger.dev'].integrity, 'sha512-I1352vflcmAmiRmCMpQUFJmicpME7kpgvdy/oSvHcioRTHwibiahlAGPnXx6tlOuvLHaADoOE3MZKC/b6jTayQ==');
  assert.equal(lock.packages['node_modules/@trigger.dev/sdk'].integrity, 'sha512-PD4+pXCWZRQFNaftP0GAOX+MnnljDJrRhs5c8JlTjcFaiVXnb4sWeEy0N5VbDUsQglZJLJI7Y1UVc0Vqpz3l9A==');
});
