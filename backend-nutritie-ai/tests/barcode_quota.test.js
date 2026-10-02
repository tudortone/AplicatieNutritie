'use strict';

const express = require('express');
const request = require('supertest');

const createBarcodeRouter = require('../routes/barcode');
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

const BARCODE = '5941234567890';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function creeazaContor(rezultatIncrement) {
  return {
    increment: jest.fn(async () => rezultatIncrement),
    decrement: jest.fn(async () => undefined),
    ttl: jest.fn(async () => 3600),
  };
}

function raspunsOffNegasit() {
  return { ok: false, status: 404, json: async () => ({ status: 0 }) };
}

function raspunsGroqValid() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            codBare: BARCODE,
            nume: 'Produs estimat',
            brand: 'AI Estimat',
            cantitate: '100g',
            calorii: 100,
            proteine: 5,
            carbohidrati: 10,
            grasimi: 4,
          }),
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }),
  };
}

function creeazaFetchMissCuGroq() {
  return jest.fn(async (url) => (
    String(url).includes('openfoodfacts') ? raspunsOffNegasit() : raspunsGroqValid()
  ));
}

function numaraApeluriGroq(fetchMock) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('api.groq.com')).length;
}

function creeazaAplicatie({
  rezultatIncrement = 1,
  barcodeRepo = {},
  aiLimiter = (_req, _res, next) => next(),
} = {}) {
  const contor = creeazaContor(rezultatIncrement);
  const app = express();
  app.use(express.json());
  app.use(createBarcodeRouter({
    requireAuth: (req, res, next) => {
      const token = req.get('authorization');
      if (token !== 'Bearer free' && token !== 'Bearer tester') {
        return res.status(401).json({ eroare: 'Neautorizat.' });
      }
      req.user = {
        id: USER_ID,
        esteTester: token === 'Bearer tester',
        esteAdmin: false,
      };
      return next();
    },
    generalLimiter: (_req, _res, next) => next(),
    aiLimiter,
    checkAiUsageQuota: creeazaCheckAiUsageQuota({
      contor,
      limitaZi: 50,
      limitaTester: 500,
    }),
    contextDate: () => ({ userId: USER_ID }),
    config: { ai: { groqTextModels: ['openai/gpt-oss-120b'] } },
    barcodeRepo: {
      getProdusBarcode: async () => null,
      citesteEstimareUtilizator: async () => null,
      salveazaProdusOff: async () => undefined,
      salveazaEstimareUtilizator: async () => undefined,
      ...barcodeRepo,
    },
  }));
  return { app, contor };
}

describe('P0-03 — quota branch-local pentru fallback-ul Groq de barcode', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'groq-test-key';
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('FREE: hit-ul din baza locala nu debiteaza quota AI si nu apeleaza Groq', async () => {
    global.fetch = jest.fn();
    const { app, contor } = creeazaAplicatie({
      rezultatIncrement: 51,
      barcodeRepo: {
        getProdusBarcode: async () => ({
          produs: { nume: 'Produs local' },
          sursa: 'cache_global',
        }),
      },
    });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer free');

    expect(res.status).toBe(200);
    expect(res.body.produs.nume).toBe('Produs local');
    expect(res.headers['x-ai-quota-remaining']).toBeUndefined();
    expect(contor.increment).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('FREE: miss-ul trece prin aiLimiter si nu ajunge la Groq daca limiterul refuza', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app, contor } = creeazaAplicatie({
      aiLimiter: (_req, res) => res.status(429).json({ cod: 'AI_RATE_LIMITED' }),
    });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer free');

    expect(res.status).toBe(429);
    expect(res.body.cod).toBe('AI_RATE_LIMITED');
    expect(contor.increment).not.toHaveBeenCalled();
    expect(numaraApeluriGroq(fetchMock)).toBe(0);
  });

  test('FREE: miss-ul sub limita debiteaza quota canonica imediat inainte de Groq', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app } = creeazaAplicatie({ rezultatIncrement: 1 });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer free');

    expect(res.status).toBe(200);
    expect(res.body.sursa).toBe('estimare_ai');
    expect(res.headers['x-ai-quota-tier']).toBe('free');
    expect(res.headers['x-ai-quota-remaining']).toBe('49');
    expect(numaraApeluriGroq(fetchMock)).toBe(1);
  });

  test('FREE: miss-ul peste limita este blocat inainte de apelul Groq', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app } = creeazaAplicatie({ rezultatIncrement: 51 });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer free');

    expect(res.status).toBe(429);
    expect(res.body.cod).toBe('AI_QUOTA_EXCEEDED');
    expect(numaraApeluriGroq(fetchMock)).toBe(0);
  });

  test('TESTER: miss-ul exact la plafonul 500 este permis', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app } = creeazaAplicatie({ rezultatIncrement: 500 });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer tester');

    expect(res.status).toBe(200);
    expect(res.headers['x-ai-quota-tier']).toBe('tester');
    expect(res.headers['x-ai-quota-remaining']).toBe('0');
    expect(numaraApeluriGroq(fetchMock)).toBe(1);
  });

  test('TESTER: miss-ul peste plafonul 500 este blocat inainte de Groq', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app } = creeazaAplicatie({ rezultatIncrement: 501 });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer tester');

    expect(res.status).toBe(429);
    expect(res.body.cod).toBe('AI_TESTER_QUOTA_EXCEEDED');
    expect(numaraApeluriGroq(fetchMock)).toBe(0);
  });

  test('flagurile de acces trimise de client nu transforma un FREE in TESTER/PREMIUM', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app } = creeazaAplicatie({ rezultatIncrement: 51 });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}?isTester=true&accessTier=tester&premium=true`)
      .set('Authorization', 'Bearer free')
      .set('X-Is-Tester', 'true')
      .send({ isTester: true, accessTier: 'tester', premium: true });

    expect(res.status).toBe(429);
    expect(res.body.cod).toBe('AI_QUOTA_EXCEEDED');
    expect(numaraApeluriGroq(fetchMock)).toBe(0);
  });

  test('auth invalid opreste ruta inainte de lookup, quota si Groq', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app, contor } = creeazaAplicatie({ rezultatIncrement: 1 });

    const res = await request(app).get(`/produs-barcode/${BARCODE}`);

    expect(res.status).toBe(401);
    expect(contor.increment).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('defectul contorului de quota esueaza inchis fara apel Groq', async () => {
    const fetchMock = creeazaFetchMissCuGroq();
    global.fetch = fetchMock;
    const { app } = creeazaAplicatie({ rezultatIncrement: Number.NaN });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer free');

    expect(res.status).toBe(503);
    expect(res.body.cod).toBe('AI_QUOTA_STORE_UNAVAILABLE');
    expect(numaraApeluriGroq(fetchMock)).toBe(0);
  });

  test('rezultatul OpenFoodFacts ramane necontorizat si neschimbat', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        product: {
          product_name: 'Iaurt OFF',
          brands: 'Ferma',
          quantity: '150g',
          nutriments: {
            'energy-kcal_100g': 61,
            proteins_100g: 4.2,
            carbohydrates_100g: 5.1,
            fat_100g: 2.8,
          },
        },
      }),
    }));
    const { app, contor } = creeazaAplicatie({ rezultatIncrement: 51 });

    const res = await request(app)
      .get(`/produs-barcode/${BARCODE}`)
      .set('Authorization', 'Bearer free');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sursa: 'openfoodfacts', estimat: false, dinCache: false });
    expect(res.body.produs.nume).toBe('Iaurt OFF');
    expect(contor.increment).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`https://world.openfoodfacts.org/api/v3/product/${BARCODE}.json`);
    expect(global.fetch.mock.calls[0][1].headers['User-Agent']).toBe('GetFlow/1.0.0 (https://api.nutriai.ro)');
  });
});
