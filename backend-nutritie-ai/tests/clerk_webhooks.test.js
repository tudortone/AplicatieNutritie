'use strict';

const request = require('supertest');
const { Webhook } = require('svix');

const TEST_SECRET = 'whsec_' + Buffer.from('12345678901234567890123456789012').toString('base64');

describe('Clerk Webhooks & User Sync Audit', () => {
  let app;

  beforeAll(() => {
    process.env.CLERK_WEBHOOK_SECRET = TEST_SECRET;
    app = require('../server');
  });

  test('POST /api/v1/webhooks/clerk fara antete Svix returneaza 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .send({ type: 'user.created', data: { id: 'user_123' } });

    expect(res.status).toBe(400);
    expect(res.body.eroare).toMatch(/Antete Svix lipsă/i);
  });

  test('POST /api/v1/webhooks/clerk cu semnatura invalida returneaza 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set('svix-id', 'msg_123')
      .set('svix-timestamp', '123456789')
      .set('svix-signature', 'v1,invalid_signature')
      .send({ type: 'user.created', data: { id: 'user_123' } });

    expect(res.status).toBe(401);
    expect(res.body.eroare).toMatch(/Semnătură webhook invalidă/i);
  });

  test('POST /api/v1/webhooks/clerk cu semnatura Svix valida proceseaza user.created', async () => {
    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_clerk_test_123',
        first_name: 'Test',
        last_name: 'User',
        email_addresses: [{ email_address: 'test@example.com' }],
        unsafe_metadata: { calorii_tinta: 2200, proteine_tinta: 160 },
      },
    });

    const wh = new Webhook(TEST_SECRET);
    const now = new Date();
    // Generam antetele valide Svix
    const msgId = 'msg_test_001';
    const timestamp = Math.floor(now.getTime() / 1000).toString();
    const signature = wh.sign(msgId, now, payload);

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set('svix-id', msgId)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', signature)
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.type).toBe('user.created');
  });
});
