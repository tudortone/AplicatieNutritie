const request = require('supertest');
const app = require('../server');

describe('A-9 — Idempotență pe Scrieri POST /api/mese', () => {
  jest.setTimeout(15000);

  it('ar trebui să ignore cererea duplicată când se trimite același Idempotency-Key', async () => {
    const key = 'test-idempotency-key-12345';

    // Prima cerere
    const res1 = await request(app)
      .post('/api/mese')
      .set('Authorization', 'Bearer token_valid_clerk')
      .set('Idempotency-Key', key)
      .send({ nume: 'Omletă test', calorii: 350 });

    // A doua cerere identică cu același key
    const res2 = await request(app)
      .post('/api/mese')
      .set('Authorization', 'Bearer token_valid_clerk')
      .set('Idempotency-Key', key)
      .send({ nume: 'Omletă test', calorii: 350 });

    expect(res1.status).toBe(res2.status);
    expect(res1.body).toEqual(res2.body);
  });
});
