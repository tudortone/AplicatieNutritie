const request = require('supertest');
const app = require('../server');
const { DAILY_LIMIT } = require('../utils/aiUsageQuota');

// Mock Supabase Auth for quota test
jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn((token) => {
          if (token === 'token_quota_user') {
            return Promise.resolve({ data: { user: { id: '99999999-9999-4999-8999-999999999999', email: 'quota@example.com' } }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Token invalid') });
        })
      }
    }))
  };
});

describe('S-10 — Plafon de Cost AI per Utilizator', () => {
  it('ar trebui să returneze header X-AI-Quota-Remaining la cererile AI', async () => {
    const res = await request(app)
      .post('/api/estimeaza-mancare-text')
      .set('Authorization', 'Bearer token_quota_user')
      .send({ text: 'un mar' });

    expect(res.headers['x-ai-quota-remaining']).toBeDefined();
    expect(Number(res.headers['x-ai-quota-remaining'])).toBeLessThan(DAILY_LIMIT);
  });
});
