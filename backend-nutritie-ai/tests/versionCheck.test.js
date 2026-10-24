'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const express = require('express');
const request = require('supertest');
const createVersionCheckRouter = require('../routes/versionCheck');

describe('Version Check API', () => {
  let app;

  beforeEach(() => {
    delete process.env.APP_MIN_VERSION_CODE;
    delete process.env.APP_LATEST_VERSION_CODE;
    delete process.env.APP_FORCE_UPDATE;

    app = express();
    const router = createVersionCheckRouter({
      config: {
        app: {
          minVersionCode: 30,
          latestVersionCode: 31,
          latestVersionName: '1.0.0',
        },
      },
    });
    app.use('/api/v1', router);
  });

  test('GET /api/v1/version-check returns 200 with version information', async () => {
    const res = await request(app).get('/api/v1/version-check');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('minVersionCode', 30);
    expect(res.body).toHaveProperty('latestVersionCode', 31);
    expect(res.body).toHaveProperty('storeUrl');
    expect(res.body).toHaveProperty('marketUrl');
    expect(res.body.title).toHaveProperty('ro');
    expect(res.body.message).toHaveProperty('ro');
  });

  test('requires forceUpdate when client versionCode is lower than minVersionCode', async () => {
    const res = await request(app).get('/api/v1/version-check?versionCode=28');
    expect(res.status).toBe(200);
    expect(res.body.forceUpdate).toBe(true);
    expect(res.body.isOutdated).toBe(true);
  });

  test('does not require forceUpdate when client versionCode is at latest', async () => {
    const res = await request(app).get('/api/v1/version-check?versionCode=31');
    expect(res.status).toBe(200);
    expect(res.body.forceUpdate).toBe(false);
    expect(res.body.isOutdated).toBe(false);
  });

  test('respects APP_FORCE_UPDATE env override', async () => {
    process.env.APP_FORCE_UPDATE = 'true';
    const res = await request(app).get('/api/v1/version-check?versionCode=30');
    expect(res.status).toBe(200);
    expect(res.body.forceUpdate).toBe(true);
    expect(res.body.isOutdated).toBe(true);
  });

  test('keeps production v31 usable when no minimum-version override is configured', async () => {
    const defaultApp = express();
    defaultApp.use('/api/v1', createVersionCheckRouter({ config: {} }));
    const res = await request(defaultApp).get('/api/v1/version-check?versionCode=31');
    expect(res.status).toBe(200);
    expect(res.body.forceUpdate).toBe(false);
    expect(res.body.isOutdated).toBe(true);
  });

  test('preserves an explicitly configured minimum version', async () => {
    process.env.APP_MIN_VERSION_CODE = '32';
    process.env.APP_LATEST_VERSION_CODE = '32';
    const res = await request(app).get('/api/v1/version-check?versionCode=31');
    expect(res.status).toBe(200);
    expect(res.body.minVersionCode).toBe(32);
    expect(res.body.forceUpdate).toBe(true);
  });

  test('Priority 6: all local modules required by server.js resolve and are tracked in git for clean-checkout boot', () => {
    const backendDir = path.resolve(__dirname, '..');
    const serverSource = fs.readFileSync(path.join(backendDir, 'server.js'), 'utf8');
    const localRequires = [...serverSource.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)].map((m) => m[1]);
    expect(localRequires).toContain('./routes/versionCheck');

    for (const relReq of localRequires) {
      const resolvedPath = require.resolve(path.resolve(backendDir, relReq));
      expect(fs.existsSync(resolvedPath)).toBe(true);
      const tracked = execFileSync('git', ['ls-files', '--error-unmatch', resolvedPath], {
        cwd: backendDir,
        encoding: 'utf8',
      }).trim();
      expect(tracked.length).toBeGreaterThan(0);
    }
  });
});
