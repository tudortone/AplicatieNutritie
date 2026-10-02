'use strict';

const express = require('express');
const request = require('supertest');
const createBarcodeRouter = require('../routes/barcode');

function creeazaAplicatie() {
  const app = express();
  app.use(express.json());
  app.use(createBarcodeRouter({
    requireAuth: (req, res, next) => {
      if (req.get('authorization') !== 'Bearer token-valid') {
        return res.status(401).json({ eroare: 'Neautorizat.' });
      }
      req.user = { id: '11111111-1111-4111-8111-111111111111' };
      return next();
    },
    generalLimiter: (_req, _res, next) => next(),
    aiLimiter: (_req, _res, next) => next(),
    checkAiUsageQuota: (_req, _res, next) => next(),
    contextDate: () => ({ userId: '11111111-1111-4111-8111-111111111111' }),
    config: { ai: { groqTextModels: [] } },
    barcodeRepo: {},
  }));
  return app;
}

describe('GET /cauta-produs', () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  test('cere autentificare inainte de a cauta in catalogul extern', async () => {
    global.fetch = jest.fn();

    const raspuns = await request(creeazaAplicatie()).get('/cauta-produs?q=iaurt');

    expect(raspuns.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('cauta prin Search-a-licious POST si pastreaza contractul normalizat limitat', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        hits: [{
          code: '5941234567890',
          product_name: 'Iaurt simplu',
          brands: 'Ferma',
          nutriments: {
            'energy-kcal_100g': 61,
            proteins_100g: 4.2,
            carbohydrates_100g: 5.1,
            fat_100g: 2.8,
          },
          ingredients_text: 'nu trebuie expus clientului',
        }],
      }),
    }));

    const raspuns = await request(creeazaAplicatie())
      .get('/cauta-produs?q=iaurt')
      .set('Authorization', 'Bearer token-valid');

    expect(raspuns.status).toBe(200);
    expect(raspuns.body).toEqual([{ 
      code: '5941234567890',
      product_name: 'Iaurt simplu',
      brands: 'Ferma',
      nutriments: {
        'energy-kcal_100g': 61,
        proteins_100g: 4.2,
        carbohydrates_100g: 5.1,
        fat_100g: 2.8,
      },
    }]);
    expect(global.fetch).toHaveBeenCalledWith('https://search.openfoodfacts.org/search', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'GetFlow/1.0.0 (https://api.nutriai.ro)',
      }),
      body: expect.any(String),
      signal: expect.anything(),
    }));
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({
      q: 'iaurt',
      page_size: 20,
      fields: expect.arrayContaining(['code', 'product_name', 'brands', 'nutriments']),
      langs: expect.arrayContaining(['ro', 'en']),
    });
    expect(JSON.stringify(raspuns.body)).not.toContain('ingredients_text');
  });

  test('normalizeaza si rezultatul Search-a-licious imbricat', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ hits: { hits: [{ _source: { code: '5941234567890', product_name: 'Chefir', nutriments: {} } }] } }),
    }));

    const raspuns = await request(creeazaAplicatie())
      .get('/cauta-produs?q=chefir')
      .set('Authorization', 'Bearer token-valid');

    expect(raspuns.status).toBe(200);
    expect(raspuns.body).toEqual([{
      code: '5941234567890', product_name: 'Chefir', brands: '',
      nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
    }]);
  });

  test('raporteaza indisponibilitatea upstream fara sa expuna corpul extern', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'private upstream detail' }));

    const raspuns = await request(creeazaAplicatie())
      .get('/cauta-produs?q=iaurt')
      .set('Authorization', 'Bearer token-valid');

    expect(raspuns.status).toBe(502);
    expect(JSON.stringify(raspuns.body)).not.toContain('private upstream detail');
  });

  test('respinge interogarile prea scurte fara apel extern', async () => {
    global.fetch = jest.fn();

    const raspuns = await request(creeazaAplicatie())
      .get('/cauta-produs?q=x')
      .set('Authorization', 'Bearer token-valid');

    expect(raspuns.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
