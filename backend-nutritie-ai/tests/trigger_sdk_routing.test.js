'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('real SDK preserves legacy/v2 routing, replay bindings and CJS/ESM registration', () => {
  // The SDK uses dynamic imports; native Node avoids changing Jest VM policy globally.
  const output = execFileSync(process.execPath, [
    '--test', path.join(__dirname, 'fixtures/triggerSdkRoutingProbe.cjs'),
  ], {
    encoding: 'utf8',
    timeout: 20000,
    env: {
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      TRIGGER_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
    },
  });
  expect(output).toMatch(/# pass 4\b/);
  expect(output).toMatch(/# fail 0\b/);
}, 25000);
