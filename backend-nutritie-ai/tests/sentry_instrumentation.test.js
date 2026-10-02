'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

describe('instrumentarea Sentry pentru Express', () => {
  test('initializeaza Sentry inainte ca Express sa fie incarcat', () => {
    const rezultat = spawnSync(
      process.execPath,
      ['-e', "require('./server'); setImmediate(() => process.exit(0))"],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          SENTRY_DSN: 'https://public@sentry.io/123',
        },
        encoding: 'utf8',
        timeout: 15000,
      },
    );

    expect(rezultat.status).toBe(0);
    expect(`${rezultat.stdout}\n${rezultat.stderr}`).not.toContain('express is not instrumented');
  });
});
