'use strict';

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: (definition) => definition,
  defineConfig: (definition) => definition,
}));
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {} }));

const triggerModule = require('../src/trigger/analiza-mancare-ai');
const triggerConfig = require('../trigger.config');

describe('Trigger/Gemini Photo production contract', () => {
  test('targets the existing GetFlow Trigger.dev project', () => {
    expect(triggerConfig.project).toBe('proj_elmgvpjxptegigrzrhtv');
    expect(triggerConfig.dirs).toEqual(['src/trigger']);
  });

  test('uses the existing primary Gemini model and bounds provider calls per run', () => {
    expect(typeof triggerModule._test.construiesteIncercariGemini).toBe('function');
    const attempts = triggerModule._test.construiesteIncercariGemini({
      preferredModel: '',
      keys: ['key-1', 'key-2', 'key-3', 'key-4'],
      maxAttempts: 2,
    });
    expect(attempts).toEqual([
      { key: 'key-1', model: 'gemini-2.5-flash' },
      { key: 'key-2', model: 'gemini-2.5-flash' },
    ]);
  });

  test('deduplicates keys, clamps attempt limit, and never fans out across models', () => {
    const attempts = triggerModule._test.construiesteIncercariGemini({
      preferredModel: 'gemini-2.0-flash',
      keys: ['key-1', ' key-1 ', 'key-2', 'key-3'],
      maxAttempts: 99,
    });
    expect(attempts).toHaveLength(3);
    expect(attempts.every(({ model }) => model === 'gemini-2.0-flash')).toBe(true);
    expect(new Set(attempts.map(({ key }) => key))).toHaveProperty('size', 3);
  });

  test('terminal retry hooks own failure release while run is retried at most three times', () => {
    expect(triggerModule.analizaMancareTask.retry).toEqual(expect.objectContaining({ maxAttempts: 3 }));
    expect(triggerModule.analizaMancareTask.onFailure).toEqual(expect.any(Function));
    expect(triggerModule.analizaMancareTask.onCancel).toEqual(expect.any(Function));
  });

  test('flags the real 3180g / 9582 kcal class of output for review without silently rewriting grams', () => {
    const items = triggerModule._test.normalizePhotoItems([
      {
        nume: 'Cartofi prăjiți', estimare_grame: 3180, calorii_per_100g: 300,
        proteine_per_100g: 3, grasimi_per_100g: 15, carbohidrati_per_100g: 40,
        fibre_per_100g: 4, tip_masa_sugerat: 'pranz', incredere: 'mediu',
      },
      {
        nume: 'Ketchup', estimare_grame: 40, calorii_per_100g: 105,
        proteine_per_100g: 1, grasimi_per_100g: 0.2, carbohidrati_per_100g: 25,
        fibre_per_100g: 0.3, tip_masa_sugerat: 'pranz', incredere: 'mediu',
      },
    ]);
    const quality = triggerModule._test.evaluatePhotoQuality(items);

    expect(items[0].estimare_grame).toBe(3180);
    expect(quality.requiresReview).toBe(true);
    expect(quality.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ITEM_QUANTITY_IMPLAUSIBLE', itemIndex: 0 }),
      expect.objectContaining({ code: 'MEAL_ENERGY_IMPLAUSIBLE' }),
    ]));
  });

  test('rejects structurally invalid model numbers instead of fabricating defaults', () => {
    expect(() => triggerModule._test.normalizePhotoItems([{
      nume: 'Cartofi', estimare_grame: 'unknown', calorii_per_100g: 80,
      proteine_per_100g: 2, grasimi_per_100g: 0.1, carbohidrati_per_100g: 17,
    }])).toThrow('PHOTO_RESULT_INVALID');
  });

  test('uses AI meal suggestion when canonical and the submitted time-based context otherwise', () => {
    expect(triggerModule._test.inferMealType('Dinner', 'mic_dejun')).toBe('cina');
    expect(triggerModule._test.inferMealType('unknown', 'pranz')).toBe('pranz');
    expect(triggerModule._test.inferMealType(null, 'invalid')).toBe('gustare');
  });

  test('codEroareSigur maps timeout, image size, and generic errors without leaking internals', () => {
    const fn = triggerModule._test.codEroareSigur;
    expect(fn({ name: 'TimeoutAiError' })).toBe('TIMEOUT');
    expect(fn({ name: 'AbortError' })).toBe('TIMEOUT');
    expect(fn({ message: 'IMAGINE_PREA_MARE' })).toBe('IMAGINE_PREA_MARE');
    expect(fn({ code: 'RATE_LIMIT' })).toBe('RATE_LIMIT');
    expect(fn({})).toBe('ANALIZA_ESUATA');
    expect(fn(null)).toBe('ANALIZA_ESUATA');
  });

  test('run fails closed safely with needs_config when mandatory env vars are missing without throwing or consuming credits', async () => {
    const prevEnv = { ...process.env };
    delete process.env.GEMINI_API_KEY;
    delete process.env.SUPABASE_URL;

    const res = await triggerModule.analizaMancareTask.run({
      userId: '11111111-1111-4111-8111-111111111111',
      jobId: 'job-missing-config',
      reservationId: 'res-1',
      imageUrl: 'https://ik.imagekit.io/getflow/mancare/11111111-1111-4111-8111-111111111111/meal.jpg',
    });

    expect(res).toEqual(expect.objectContaining({
      success: false,
      status: 'needs_config',
      eroare: 'Task-ul de analiza nu este configurat complet.',
    }));
    Object.assign(process.env, prevEnv);
  });

  test('run rejects malformed payloads and invalid user UUIDs without running Gemini', async () => {
    process.env.GEMINI_API_KEY = 'mock_gemini_key';
    process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/getflow';
    process.env.SUPABASE_URL = 'https://mock.supabase.co';

    const res = await triggerModule.analizaMancareTask.run({
      userId: 'invalid-non-uuid-user',
      jobId: 'job-bad-user',
      reservationId: 'res-bad',
      imageUrl: 'https://ik.imagekit.io/getflow/mancare/invalid/meal.jpg',
    });

    expect(res).toEqual({
      success: false,
      eroare: 'Payload invalid pentru analiza imaginii.',
    });
  });

  test('onFailure and onCancel hooks handle null/undefined payloads gracefully', async () => {
    await expect(triggerModule.analizaMancareTask.onFailure({
      payload: null,
      error: new Error('Network failure'),
    })).resolves.not.toThrow();

    await expect(triggerModule.analizaMancareTask.onCancel({
      payload: null,
    })).resolves.not.toThrow();
  });
});

