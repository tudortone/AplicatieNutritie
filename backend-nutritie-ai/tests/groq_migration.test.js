'use strict';

/**
 * Teste pentru CORR-003: Migrarea modelelor text Groq
 * - openai/gpt-oss-120b (primar)
 * - qwen/qwen3.6-27b (fallback)
 * - eliminare completa llama-3.3-70b-versatile
 */

const { creeazaServiciuChat } = require('../services/ai/chat');
const metrics = require('../utils/metrics');

describe('CORR-003: Groq Text Model Migration', () => {
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
              text: () => 'Raspuns fallback Gemini',
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
            },
          }),
        }),
      },
    });
  }

  it('1. Cererea primara de chat apeleaza modelul primar openai/gpt-oss-120b', async () => {
    const cereri = [];
    global.fetch = jest.fn(async (url, optiuni) => {
      const corp = JSON.parse(optiuni.body);
      cereri.push(corp);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Salut! Cu ce te pot ajuta nutritiv?' } }],
          usage: { prompt_tokens: 15, completion_tokens: 25 },
        }),
      };
    });

    const serviciu = creeazaServiciuCuConfig();
    const rez = await serviciu.ruleazaChat({ mesaj: 'Ce pot manca la micul dejun?' });

    expect(rez.raspuns).toBe('Salut! Cu ce te pot ajuta nutritiv?');
    expect(cereri).toHaveLength(1);
    expect(cereri[0].model).toBe('openai/gpt-oss-120b');
    expect(cereri[0].model).not.toBe('llama-3.3-70b-versatile');
  });

  it('2. Modelul depreciat llama-3.3-70b-versatile nu este cerut niciodata pe nicio ruta', async () => {
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
                fibre: 3,
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
    await serviciu.ruleazaChat({ mesaj: 'Calorii mar' });
    await serviciu.estimeazaMancareText({ text: '1 mar' });
    await serviciu.profilNutritiv({ aliment: 'mar ionatan' });

    expect(modeleCerute).not.toContain('llama-3.3-70b-versatile');
    for (const m of modeleCerute) {
      expect(['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']).toContain(m);
    }
  });

  it('3. La esecul modelului primar, se apeleaza fallback-ul qwen/qwen3.6-27b', async () => {
    const modeleApelate = [];
    global.fetch = jest.fn(async (url, optiuni) => {
      const corp = JSON.parse(optiuni.body);
      modeleApelate.push(corp.model);
      if (corp.model === 'openai/gpt-oss-120b') {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Raspuns de la Qwen fallback' } }],
          usage: { prompt_tokens: 20, completion_tokens: 30 },
        }),
      };
    });

    const serviciu = creeazaServiciuCuConfig();
    const rez = await serviciu.ruleazaChat({ mesaj: 'Vreau o reteta de ovaz' });

    expect(rez.raspuns).toBe('Raspuns de la Qwen fallback');
    expect(modeleApelate).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']);
  });

  it('4. Metricele si estimarea de cost recunosc noile modele', async () => {
    const costGpt = metrics.estimeazaCost('openai/gpt-oss-120b', 1000000, 1000000);
    expect(costGpt).toBeCloseTo(0.15 + 0.6);

    const costQwen = metrics.estimeazaCost('qwen/qwen3.6-27b', 1000000, 1000000);
    expect(costQwen).toBeCloseTo(0.15 + 0.6);

    global.fetch = jest.fn(async (url, optiuni) => {
      const corp = JSON.parse(optiuni.body);
      if (corp.model === 'openai/gpt-oss-120b') {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"nume":"Mar","calorii":80,"proteine":0,"carbohidrati":20,"grasimi":0,"gramajDefault":150}' } }],
          usage: { prompt_tokens: 50, completion_tokens: 50 },
        }),
      };
    });

    const serviciu = creeazaServiciuCuConfig();
    const rez = await serviciu.estimeazaMancareText({ text: 'Mar' });
    expect(rez.nume).toBe('Mar');
    expect(rez.calorii).toBe(80);

    const stats = metrics.getAiStatistici();
    const rutaStats = stats.rute.find((r) => r.nume === 'estimeaza-mancare-text');
    expect(rutaStats).toBeDefined();
    expect(rutaStats.apeluri).toBeGreaterThanOrEqual(1);
  });

  it('5. logFoodDinChat returneaza un MEAL_PROPOSAL valid cu noile modele', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'MEAL_PROPOSAL',
              meal_type: 'pranz',
              items: [{ name: 'Piept de pui la gratar', qty: 150, unit: 'g', protein_g: 45, carbs_g: 0, fat_g: 5, kcal: 225, fiber_g: 0 }],
              totals: { protein_g: 45, carbs_g: 0, fat_g: 5, kcal: 225, fiber_g: 0 },
            }),
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 60 },
      }),
    }));

    const serviciu = creeazaServiciuCuConfig();
    const propunere = await serviciu.logFoodDinChat({ mesaj: 'am mancat 150g piept de pui' });

    expect(propunere.type).toBe('MEAL_PROPOSAL');
    expect(propunere.meal_type).toBe('pranz');
    expect(propunere.items).toHaveLength(1);
    expect(propunere.items[0].kcal).toBe(225);
  });

  it('6. profilNutritiv respecta contractul de micronutrienti cu noile modele', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              nume: 'Avocado',
              calorii: 160,
              proteine: 2,
              carbohidrati: 9,
              grasimi: 15,
              fibre: 7,
              aminoacizi: { leucina: 150 },
              micronutrienti: { potasiu: 485, magneziu: 29 },
            }),
          },
        }],
        usage: { prompt_tokens: 80, completion_tokens: 70 },
      }),
    }));

    const serviciu = creeazaServiciuCuConfig();
    const profil = await serviciu.profilNutritiv({ aliment: 'avocado' });

    expect(profil.nume).toBe('Avocado');
    expect(profil.calorii).toBe(160);
    expect(profil.fibre).toBe(7);
    expect(profil.aminoacizi.leucina).toBe(150);
    expect(profil.micronutrienti.potasiu).toBe(485);
  });

  it('7. Daca ambele modele Groq esueaza, ruleazaChat apeleaza fallback Gemini', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    const serviciu = creeazaServiciuCuConfig();
    const rez = await serviciu.ruleazaChat({ mesaj: 'Cum imi cresc proteinele?' });

    expect(rez.raspuns).toBe('Raspuns fallback Gemini');
  });
});
