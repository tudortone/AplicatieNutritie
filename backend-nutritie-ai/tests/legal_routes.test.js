const request = require('supertest');
const app = require('../server');

describe('Legal Documents & Public Static Routes', () => {
  test('GET /privacy returns 200 HTML with complete data retention statement', async () => {
    const res = await request(app).get('/privacy');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Data Retention and Deletion Practices');
    expect(res.text).toContain('android.permission.health.READ_STEPS');
    expect(res.text).toContain('30 calendar days');
    expect(res.text).toContain('supportgetflow@gmail.com');
  });

  test('GET /politica-de-confidentialitate returns 200 HTML', async () => {
    const res = await request(app).get('/politica-de-confidentialitate');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Politică de Confidențialitate');
  });

  test('GET /app-ads.txt returns 200 text/plain with publisher ID', async () => {
    const res = await request(app).get('/app-ads.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('google.com, pub-5202280855139508, DIRECT, f08c47fec0942fa0');
  });

  test('GET /stergere-cont returns 200 HTML with account deletion instructions', async () => {
    const res = await request(app).get('/stergere-cont');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Ștergere Cont');
  });

  test('GET /terms returns 200 HTML', async () => {
    const res = await request(app).get('/terms');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
