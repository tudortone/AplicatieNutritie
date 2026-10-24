'use strict';
const express = require('express');
const request = require('supertest');
const createRouter = require('../routes/versionCheck');
const names = ['APP_MIN_VERSION_CODE', 'APP_LATEST_VERSION_CODE', 'APP_FORCE_UPDATE'];
const saved = Object.fromEntries(names.map(k => [k, process.env[k]]));
beforeEach(() => names.forEach(k => delete process.env[k]));
afterAll(() => names.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }));
function app() { const a = express(); a.use('/api/v1', createRouter({ config: {} })); return a; }
test.each(['abc', '-1', '1.5', '9007199254740992', ['37','38']])('rejects invalid client code %s', async code => {
  const result = await request(app()).get('/api/v1/version-check').query({ versionCode: code });
  expect(result.status).toBe(400); expect(result.body.forceUpdate).not.toBe(true);
});
test.each([['38','32'], ['abc','38'], ['31','Infinity'], ['31','38.5']])('rejects incoherent configured policy %s/%s without gating clients', async (min, latest) => {
  process.env.APP_MIN_VERSION_CODE = min; process.env.APP_LATEST_VERSION_CODE = latest;
  const result = await request(app()).get('/api/v1/version-check?versionCode=37');
  expect(result.status).toBe(503); expect(result.body.forceUpdate).toBe(false);
});
test('valid explicit 38 policy preserves canonical Play identity and legacy minimum', async () => {
  process.env.APP_LATEST_VERSION_CODE = '38';
  const result = await request(app()).get('/api/v1/version-check?versionCode=37');
  expect(result.status).toBe(200); expect(result.body).toMatchObject({ minVersionCode:31, latestVersionCode:38, forceUpdate:false, isOutdated:true });
  expect(result.body.storeUrl).toBe('https://play.google.com/store/apps/details?id=com.totsrl.getflo');
});
