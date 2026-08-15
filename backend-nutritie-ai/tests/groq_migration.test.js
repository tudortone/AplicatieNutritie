'use strict';

/**
 * Teste pentru:
 * - RC-001: Strict MEAL_PROPOSAL contract & validation in ruleazaChat
 * - RC-003: Model pricing (openai/gpt-oss-120b vs qwen/qwen3.6-27b)
 * - RC-004: Barcode route utilizing central groqTextModels and metrics
 * - CORR-003: Model migration from deprecated llama-3.3-70b-versatile
 */

const request = require('supertest');
const express = require('express');
const { creeazaServiciuChat } = require('../services/ai/chat');
const createBarcodeRouter = require('../routes/barcode');
const metrics = require('../utils/metrics');

describe('AI Text Models & Contracts (RC-001, RC-003, RC-004, CORR-003)', () => {
  const fetchOriginal = global.fetch;
  const cheieGroqOriginala = process.env.GROQ_API_KEY;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'gsk_test_mock_key';
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    process.env.GROQ_API_KEY = cheieGroqOriginala;
  });

  function creeazaServiciuCuConfig(modeleText = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']) {
    return creeazaServiciuChat({
      config: {
        ai: {
          geminiModel: 'gemini-2.5-flash',
          groqTextModels: modeleText,
        },
      },
      genAI: {
        getGenerativeModel: () => ({
          generateContent: async () => ({
            response: {
              text: () => JSON.stringify({
                type: 'MEAL_PROPOSAL',
                meal_type: 'cina',
                items: [{ name: 'Salata Gemini', qty: 100, unit: 'g', protein_g: 5, carbs_g: 10, fat_g: 2, kcal: 80, fiber_g: 3 }],
                totals: { protein_g: 5, carbs_g: 10, fat_g: 2, kcal: 80, fiber_g: 3 },
              }),
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
            },
          }),
        }),
      },
    });
  }

  describe('RC-001: ruleazaChat Meal Proposal Contract & Validation', () => {
    it('1. System prompt conține contractul exact MEAL_PROPOSAL și regulile de jurnal', async () => {
      let promptCapturat = '';
      global.fetch = jest.fn(async (url, optiuni) => {
        const corp = JSON.parse(optiuni.body);
        promptCapturat = corp.messages[0].content;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Raspuns asistent nutritional' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10 },
          }),
        };
      });

      const serviciu = creeazaServiciuCuConfig();
      await serviciu.ruleazaChat({ mesaj: 'Ce imi recomanzi pentru masa de pranz?' });

      expect(promptCapturat).toContain('REGULA JURNAL ALIMENTAR DIN CHAT:');
      expect(promptCapturat).toContain('"type": "MEAL_PROPOSAL"');
      expect(promptCapturat).toContain('"meal_type": "mic_dejun"');
      expect(promptCapturat).toContain('"items": [');
      expect(promptCapturat).toContain('"totals": {');
    });

    it('2. Propunere validă MEAL_PROPOSAL de la GPT-OSS pe mesaj de logare masă este acceptată', async () => {
      const mealJson = JSON.stringify({
        type: 'MEAL_PROPOSAL',
        meal_type: 'pranz',
        items: [{ name: 'Piept de pui', qty: 150, unit: 'g', protein_g: 45, carbs_g: 0, fat_g: 5, kcal: 225, fiber_g: 0 }],
        totals: { protein_g: 45, carbs_g: 0, fat_g: 5, kcal: 225, fiber_g: 0 },
      });

      global.fetch = jest.fn(async (url, optiuni) => {
        const corp = JSON.parse(optiuni.body);
        expect(corp.model).toBe('openai/gpt-oss-120b');
        expect(corp.response_format).toEqual({ type: 'json_object' });
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: mealJson } }],
            usage: { prompt_tokens: 20, completion_tokens: 40 },
          }),
        };
      });

      const serviciu = creeazaServiciuCuConfig();
      const rez = await serviciu.ruleazaChat({ mesaj: 'am mancat 150g piept de pui' });
      expect(rez.raspuns).toBe(mealJson);
    });

    it('3. JSON valid dar contract MEAL_PROPOSAL invalid de la GPT-OSS încearcă Qwen', async () => {
      const cereri = [];
      const validQwenMeal = JSON.stringify({
        type: 'MEAL_PROPOSAL',
        meal_type: 'cina',
        items: [{ name: 'Salata', qty: 200, unit: 'g', protein_g: 4, carbs_g: 8, fat_g: 2, kcal: 70, fiber_g: 3 }],
        totals: { protein_g: 4, carbs_g: 8, fat_g: 2, kcal: 70, fiber_g: 3 },
      });

      global.fetch = jest.fn(async (url, optiuni) => {
        const corp = JSON.parse(optiuni.body);
        cereri.push(corp.model);
        if (corp.model === 'openai/gpt-oss-120b') {
          // Returneaza JSON valid sintactic, dar fara items sau type corect
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: '{"status": "ok", "message": "Am inteles masa"}' } }],
              usage: { prompt_tokens: 20, completion_tokens: 20 },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: validQwenMeal } }],
            usage: { prompt_tokens: 20, completion_tokens: 40 },
          }),
        };
      });

      const serviciu = creeazaServiciuCuConfig();
      const rez = await serviciu.ruleazaChat({ mesaj: 'logheaza o salata' });
      expect(cereri).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']);
      expect(rez.raspuns).toBe(validQwenMeal);
    });

    it('4. Output invalid de la ambele modele Groq declanșează fallback-ul Gemini', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"broken": true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        }),
      }));

      const serviciu = creeazaServiciuCuConfig();
      const rez = await serviciu.ruleazaChat({ mesaj: 'am consumat 2 oua fierte' });
      expect(rez.raspuns).toContain('Salata Gemini');
    });

    it('5. Chat obișnuit non-meal returnează text conversațional simplu', async () => {
      global.fetch = jest.fn(async (url, optiuni) => {
        const corp = JSON.parse(optiuni.body);
        expect(corp.response_format).toBeUndefined();
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Pentru a slabi sanatos, mentine un deficit caloric moderat.' } }],
            usage: { prompt_tokens: 15, completion_tokens: 20 },
          }),
        };
      });

      const serviciu = creeazaServiciuCuConfig();
      const rez = await serviciu.ruleazaChat({ mesaj: 'Cum pot slabi 2 kilograme?' });
      expect(rez.raspuns).toBe('Pentru a slabi sanatos, mentine un deficit caloric moderat.');
    });
  });

  describe('RC-003: Model Pricing Snapshots', () => {
    it('1. Prețurile oficiale Groq sunt calculate corect (0.75 USD / 1M pentru GPT-OSS, 3.60 USD / 1M pentru Qwen)', () => {
      const costGpt = metrics.estimeazaCost('openai/gpt-oss-120b', 1_000_000, 1_000_000);
      expect(costGpt).toBeCloseTo(0.15 + 0.60); // 0.75

      const costQwen = metrics.estimeazaCost('qwen/qwen3.6-27b', 1_000_000, 1_000_000);
      expect(costQwen).toBeCloseTo(0.60 + 3.00); // 3.60
    });
  });

  describe('RC-004: Barcode Central Config & Fallback', () => {
    function creeazaAppBarcode({ _mockFetch, mockBarcodeRepo }) {
      const app = express();
      app.use(express.json());
      const router = createBarcodeRouter({
        requireAuth: (_req, _res, next) => next(),
        generalLimiter: (_req, _res, next) => next(),
        contextDate: () => ({ userId: 'test-user' }),
        config: {
          ai: {
            groqTextModels: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'],
          },
        },
        barcodeRepo: mockBarcodeRepo || {
          getProdusBarcode: async () => null,
          citesteEstimareUtilizator: async () => null,
          salveazaEstimareUtilizator: async () => {},
        },
      });
      app.use(router);
      return app;
    }

    it('1. Barcode AI folosește primul model configurat (openai/gpt-oss-120b)', async () => {
      const cereri = [];
      global.fetch = jest.fn(async (url, optiuni) => {
        if (url.includes('openfoodfacts')) {
          return { ok: false, status: 404, json: async () => ({ status: 0 }) };
        }
        const corp = JSON.parse(optiuni.body);
        cereri.push(corp.model);
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  codBare: '5941234567890',
                  nume: 'Iaurt Grecesc 10%',
                  brand: 'Brand Local',
                  cantitate: '150g',
                  calorii: 120,
                  proteine: 6,
                  carbohidrati: 4,
                  grasimi: 10,
                }),
              },
            }],
            usage: { prompt_tokens: 30, completion_tokens: 30 },
          }),
        };
      });

      const app = creeazaAppBarcode({});
      const res = await request(app).get('/produs-barcode/5941234567890');

      expect(res.status).toBe(200);
      expect(res.body.sursa).toBe('estimare_ai');
      expect(res.body.produs.nume).toBe('Iaurt Grecesc 10%');
      expect(cereri).toEqual(['openai/gpt-oss-120b']);
    });

    it('2. Barcode AI trece pe fallback Qwen când modelul primar returnează 5xx sau JSON invalid', async () => {
      const cereri = [];
      global.fetch = jest.fn(async (url, optiuni) => {
        if (url.includes('openfoodfacts')) {
          return { ok: false, status: 404, json: async () => ({ status: 0 }) };
        }
        const corp = JSON.parse(optiuni.body);
        cereri.push(corp.model);
        if (corp.model === 'openai/gpt-oss-120b') {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  codBare: '5941234567890',
                  nume: 'Iaurt Grecesc de la Qwen',
                  brand: 'Brand Qwen',
                  cantitate: '150g',
                  calorii: 120,
                  proteine: 6,
                  carbohidrati: 4,
                  grasimi: 10,
                }),
              },
            }],
            usage: { prompt_tokens: 30, completion_tokens: 30 },
          }),
        };
      });

      const app = creeazaAppBarcode({});
      const res = await request(app).get('/produs-barcode/5941234567890');

      expect(res.status).toBe(200);
      expect(res.body.produs.nume).toBe('Iaurt Grecesc de la Qwen');
      expect(cereri).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']);
    });

    it('3. Răspunsul reușit de la Qwen înregistrează modelul Qwen în metrici pe ruta barcode-estimate', async () => {
      const inregistrari = [];
      const spyMetrics = jest.spyOn(metrics, 'inregistreazaAi').mockImplementation((date) => {
        inregistrari.push(date);
      });

      global.fetch = jest.fn(async (url, optiuni) => {
        if (url.includes('openfoodfacts')) {
          return { ok: false, status: 404, json: async () => ({ status: 0 }) };
        }
        const corp = JSON.parse(optiuni.body);
        if (corp.model === 'openai/gpt-oss-120b') {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  codBare: '5941234567890',
                  nume: 'Produs estimat Qwen',
                  brand: 'Brand Qwen',
                  cantitate: '100g',
                  calorii: 100,
                  proteine: 5,
                  carbohidrati: 10,
                  grasimi: 5,
                }),
              },
            }],
            usage: { prompt_tokens: 25, completion_tokens: 25 },
          }),
        };
      });

      const app = creeazaAppBarcode({});
      const res = await request(app).get('/produs-barcode/5941234567890');

      expect(res.status).toBe(200);
      expect(res.body.produs.nume).toBe('Produs estimat Qwen');

      const qwenRec = inregistrari.find((r) => r.model === 'qwen/qwen3.6-27b' && r.ok === true);
      expect(qwenRec).toBeDefined();
      expect(qwenRec.ruta).toBe('barcode-estimate');
      expect(qwenRec.provider).toBe('groq');

      spyMetrics.mockRestore();
    });

    it('4. Eșecul complet al modelelor păstrează răspunsul 404 cu allowManualEntry', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }));

      const app = creeazaAppBarcode({});
      const res = await request(app).get('/produs-barcode/5941234567890');

      expect(res.status).toBe(404);
      expect(res.body.allowManualEntry).toBe(true);
    });
  });

  describe('CORR-003: Deprecated Model Elimination Assertions', () => {
    it('1. Modelul depreciat llama-3.3-70b-versatile nu este cerut niciodată', async () => {
      const modeleCerute = [];
      global.fetch = jest.fn(async (url, optiuni) => {
        const corp = JSON.parse(optiuni.body);
        modeleCerute.push(corp.model);
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  nume: 'Mar Ionatan',
                  calorii: 80,
                  proteine: 0,
                  carbohidrati: 20,
                  grasimi: 0,
                  gramajDefault: 150,
                  aminoacizi: {},
                  micronutrienti: {},
                }),
              },
            }],
            usage: { prompt_tokens: 10, completion_tokens: 10 },
          }),
        };
      });

      const serviciu = creeazaServiciuCuConfig();
      await serviciu.estimeazaMancareText({ text: '1 mar' });
      await serviciu.profilNutritiv({ aliment: 'mar ionatan' });

      expect(modeleCerute).not.toContain('llama-3.3-70b-versatile');
      for (const m of modeleCerute) {
        expect(['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']).toContain(m);
      }
    });
  });
});
