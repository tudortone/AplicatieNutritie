'use strict';

const express = require('express');
const request = require('supertest');
const createFeedbackRouter = require('../routes/feedback');

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeApp({ authenticated = true, insert = jest.fn(async () => ({
  data: { id: 'feedback-1', created_at: '2026-10-09T12:00:00.000Z', delivery_status: 'not_configured' },
  error: null,
})), limiter } = {}) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use(createFeedbackRouter({
    requireAuth: (req, res, next) => {
      if (!authenticated) return res.status(401).json({ eroare: 'Acces neautorizat.' });
      req.user = { id: USER_ID };
      return next();
    },
    feedbackLimiter: limiter || ((_req, _res, next) => next()),
    contextDate: jest.fn(() => ({ db: { rpc: jest.fn((_name, args) => insert(args).then((result) => ({
      data: result.data ? [{
        id: result.data.id,
        created_at: result.data.created_at,
        delivery_status: result.data.delivery_status,
      }] : null,
      error: result.error,
    }))) } })),
  }));
  return { app, insert };
}

describe('POST /feedback', () => {
  test('persists bounded message with verified user reference and returns durable receipt', async () => {
    const { app, insert } = makeApp();
    const response = await request(app).post('/feedback').send({ message: '  Please improve meal search.  ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: 'feedback-1',
      createdAt: '2026-10-09T12:00:00.000Z',
      deliveryStatus: 'not_configured',
    });
    expect(insert).toHaveBeenCalledWith({ p_message: 'Please improve meal search.' });
  });

  test('rejects unauthorized requests without writing', async () => {
    const { app, insert } = makeApp({ authenticated: false });
    const response = await request(app).post('/feedback').send({ message: 'feedback message' });
    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  test.each([
    [{}, 'missing message'],
    [{ message: '  ' }, 'empty message'],
    [{ message: 'x'.repeat(2001) }, 'oversized message'],
    [{ message: 'valid', user_id: USER_ID }, 'client-supplied user identity'],
  ])('rejects invalid input (%s)', async (body) => {
    const { app, insert } = makeApp();
    const response = await request(app).post('/feedback').send(body);
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  test('rejects feedback request bodies above the endpoint byte limit', async () => {
    const { app, insert } = makeApp();
    const response = await request(app)
      .post('/feedback')
      .send({ message: 'x'.repeat(9 * 1024) });
    expect(response.status).toBe(413);
    expect(insert).not.toHaveBeenCalled();
  });

  test('returns a safe failure and never claims success when persistence fails', async () => {
    const { app } = makeApp({ insert: jest.fn(async () => ({ data: null, error: new Error('private db detail') })) });
    const response = await request(app).post('/feedback').send({ message: 'message' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ eroare: 'Feedback-ul nu a putut fi salvat.', cod: 'FEEDBACK_SAVE_FAILED' });
    expect(JSON.stringify(response.body)).not.toContain('private db detail');
  });

  test('keeps the successful persistence receipt when owner notification is marked failed', async () => {
    const insert = jest.fn(async () => ({
      data: { id: 'feedback-kept', created_at: '2026-10-09T12:00:00.000Z', delivery_status: 'failed' },
      error: null,
    }));
    const { app } = makeApp({ insert });
    const response = await request(app).post('/feedback').send({ message: 'Keep this message even if email fails.' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: 'feedback-kept', deliveryStatus: 'failed' });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  test('honors authenticated rate limiter on rapid repeat submissions', async () => {
    const limiter = (_req, res) => res.status(429).json({ eroare: 'limit' });
    const { app, insert } = makeApp({ limiter });
    const response = await request(app).post('/feedback').send({ message: 'message' });
    expect(response.status).toBe(429);
    expect(insert).not.toHaveBeenCalled();
  });
});
