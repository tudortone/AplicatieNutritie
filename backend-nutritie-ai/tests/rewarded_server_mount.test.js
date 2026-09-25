'use strict';

const request = require('supertest');

test('production app mounts canonical SSV route and rejects unsigned requests', async () => {
  const app = require('../server');
  const response = await request(app).get('/api/v1/webhooks/admob/rewarded');
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ cod: 'SSV_FORMAT_INVALID' });
});
