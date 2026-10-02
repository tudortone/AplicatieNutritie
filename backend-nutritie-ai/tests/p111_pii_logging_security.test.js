'use strict';

const express = require('express');
const request = require('supertest');
const {
  rezumatEroareSigur,
  scrubSentryEvent,
} = require('../utils/sentrySanitize');
const { creeazaServiciuChat } = require('../services/ai/chat');
const createAiRouter = require('../routes/ai');

describe('P1-11 — PII / provider error / logging security', () => {
  const groqKeyInitial = process.env.GROQ_API_KEY;
  const fetchInitial = global.fetch;

  afterEach(() => {
    process.env.GROQ_API_KEY = groqKeyInitial;
    global.fetch = fetchInitial;
    jest.restoreAllMocks();
  });

  test('rezumatul de eroare păstrează doar metadata tehnică sigură', () => {
    const error = Object.assign(
      new Error('Bearer secret-token user@example.com a mâncat burger 900 kcal'),
      {
        code: 'PROVIDER_TIMEOUT',
        status: 503,
        response: { data: { prompt: 'burger 900 kcal', api_key: 'secret' } },
      },
    );

    const summary = rezumatEroareSigur(error, {
      operation: 'chat_completion',
      provider: 'groq',
    });

    expect(summary).toEqual({
      operation: 'chat_completion',
      provider: 'groq',
      code: 'PROVIDER_TIMEOUT',
      name: 'Error',
      status: 503,
    });
    expect(JSON.stringify(summary)).not.toContain('secret-token');
    expect(JSON.stringify(summary)).not.toContain('user@example.com');
    expect(JSON.stringify(summary)).not.toContain('burger');
  });

  test('evenimentul Sentry elimină corpul requestului și mesajele arbitrare din excepții', () => {
    const event = scrubSentryEvent({
      message: 'request failed for user@example.com',
      request: {
        url: 'https://api.example.test/chat?email=user@example.com',
        headers: { authorization: 'Bearer secret-token' },
        data: JSON.stringify({ mesaj: 'burger 900 kcal', email: 'user@example.com' }),
      },
      user: { id: 'user-123', email: 'user@example.com' },
      extra: { user_prompt: 'burger 900 kcal' },
      exception: {
        values: [{
          type: 'ProviderError',
          value: 'provider echoed burger 900 kcal for user@example.com',
        }],
      },
    });

    expect(event.request).toEqual({
      url: 'https://api.example.test/chat',
      headers: {},
      data: '[SCRUBBED_PII]',
    });
    expect(event.user).toBeUndefined();
    expect(event.extra).toEqual({ redacted: true });
    expect(event.exception.values[0].value).toBe('ProviderError [DETAILS_REDACTED]');
    expect(JSON.stringify(event)).not.toContain('burger');
    expect(JSON.stringify(event)).not.toContain('user@example.com');
    expect(JSON.stringify(event)).not.toContain('secret-token');
  });

  test('calea reală chat nu loghează mesajul brut al erorii de provider', async () => {
    process.env.GROQ_API_KEY = 'configured-for-test';
    const sensitiveProviderError = new Error(
      'Bearer secret-token user@example.com prompt=burger 900 kcal',
    );
    global.fetch = jest.fn().mockRejectedValue(sensitiveProviderError);
    const genAI = {
      getGenerativeModel: () => ({
        generateContent: jest.fn().mockRejectedValue(sensitiveProviderError),
      }),
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const service = creeazaServiciuChat({
      config: { ai: { geminiModel: 'gemini-test', groqTextModels: ['groq-test'] } },
      genAI,
    });

    await expect(service.ruleazaChat({ mesaj: 'salut' })).rejects.toBe(sensitiveProviderError);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('provider');
    expect(logged).not.toContain('secret-token');
    expect(logged).not.toContain('user@example.com');
    expect(logged).not.toContain('burger');
  });

  test('ruta reală chat răspunde cu eroare normalizată, nu cu payloadul providerului', async () => {
    const sensitiveProviderError = new Error(
      'upstream payload: Bearer secret-token user@example.com burger 900 kcal',
    );
    const middleware = (_req, _res, next) => next();
    const app = express();
    app.use(express.json());
    app.use(createAiRouter({
      requireAuth: middleware,
      aiLimiter: middleware,
      generalLimiter: middleware,
      upload: { single: () => middleware },
      checkAiUsageQuota: middleware,
      imagekit: null,
      tasks: {},
      config: {
        sentryDsn: null,
        ai: {},
        imagekit: { urlEndpoint: 'https://ik.imagekit.io/getflow' },
        supabase: { url: 'https://project.supabase.co' },
      },
      serviciuVision: {},
      serviciuCascada: {},
      serviciuChat: {
        ruleazaChat: jest.fn().mockRejectedValue(sensitiveProviderError),
      },
      semaforAi: {},
    }));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app).post('/chat').send({ mesaj: 'date sensibile' });

    expect(response.statusCode).toBe(500);
    expect(response.body.raspuns).toContain('problema de conexiune');
    expect(JSON.stringify(response.body)).not.toContain('secret-token');
    expect(JSON.stringify(response.body)).not.toContain('user@example.com');
    expect(JSON.stringify(response.body)).not.toContain('burger');
  });
});
