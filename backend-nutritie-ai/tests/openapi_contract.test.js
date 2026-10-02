'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
  withScope: (callback) => callback({
    setLevel: jest.fn(),
    setTag: jest.fn(),
    setFingerprint: jest.fn(),
  }),
}));

const METODE_HTTP = ['get', 'post', 'put', 'patch', 'delete'];
const CALE_OPENAPI = path.join(__dirname, '..', '..', 'contracts', 'openapi.yaml');

function rezolvaReferinta(document, referinta) {
  if (!referinta?.startsWith('#/')) throw new Error(`Referinta OpenAPI nesuportata: ${referinta}`);
  return referinta
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((valoare, segment) => valoare?.[segment], document);
}

function rezolvaObiect(document, valoare) {
  if (!valoare?.$ref) return valoare;
  return { ...rezolvaReferinta(document, valoare.$ref), ...valoare, $ref: undefined };
}

function operatie(document, cale, metoda) {
  const pathItem = rezolvaObiect(document, document.paths?.[cale]);
  return rezolvaObiect(document, pathItem?.[metoda]);
}

function raspuns(document, cale, metoda, status) {
  return rezolvaObiect(document, operatie(document, cale, metoda)?.responses?.[String(status)]);
}

function schemaRaspuns(document, cale, metoda, status) {
  const schema = raspuns(document, cale, metoda, status)?.content?.['application/json']?.schema;
  return rezolvaObiect(document, schema);
}

function schemaAreVariantaCuCampObligatoriu(document, schema, camp) {
  const rezolvata = rezolvaObiect(document, schema);
  if (rezolvata?.required?.includes(camp)) return true;
  return [...(rezolvata?.oneOf || []), ...(rezolvata?.anyOf || [])]
    .some((varianta) => schemaAreVariantaCuCampObligatoriu(document, varianta, camp));
}

function inventarOpenApi(document) {
  const rezultat = new Set();
  for (const [cale, brut] of Object.entries(document.paths || {})) {
    const pathItem = rezolvaObiect(document, brut);
    for (const metoda of METODE_HTTP) {
      if (pathItem?.[metoda]) rezultat.add(`${metoda.toUpperCase()} ${cale}`);
    }
  }
  return rezultat;
}

function normalizaCaleExpress(cale) {
  const normalizata = String(cale || '')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/\/$/, '');
  return normalizata || '/';
}

let inventarExpressMemorat;

function inventarExpress() {
  if (inventarExpressMemorat) return new Set(inventarExpressMemorat);

  const express = require('express');
  const mounts = [];
  const originalUse = express.application.use;
  const useSpy = jest.spyOn(express.application, 'use').mockImplementation(function useCuInventar(...args) {
    if (typeof args[0] === 'string') {
      const prefix = args[0];
      for (const handler of args.slice(1).flat(Infinity)) {
        if (handler && Array.isArray(handler.stack)) mounts.push({ prefix, router: handler });
      }
    }
    return originalUse.apply(this, args);
  });
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  let app;
  try {
    app = require('../server');
  } finally {
    useSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  }

  const rezultat = new Set();
  const adaugaRuta = (prefix, ruta) => {
    const caleRuta = ruta.path === '/' ? '' : ruta.path;
    const cale = normalizaCaleExpress(`${prefix}${caleRuta}`);
    for (const [metoda, activ] of Object.entries(ruta.methods || {})) {
      if (activ && METODE_HTTP.includes(metoda)) rezultat.add(`${metoda.toUpperCase()} ${cale}`);
    }
  };

  for (const layer of app.router.stack) {
    if (layer.route) adaugaRuta('', layer.route);
  }
  for (const { prefix, router } of mounts) {
    for (const layer of router.stack) {
      if (layer.route) adaugaRuta(prefix, layer.route);
    }
  }
  inventarExpressMemorat = new Set(rezultat);
  return rezultat;
}

const STATUSURI_CANONICE = {
  'GET /': [200],
  'GET /health': [200, 429, 503],
  'GET /api/v1/ai-status': [200, 401, 409, 429, 500, 503],
  'GET /api/v1/imagekit-auth': [200, 401, 409, 429, 500, 503],
  'POST /api/v1/trigger-analiza-mancare': [202, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/analiza-foto': [200, 400, 401, 409, 413, 429, 499, 500, 503],
  'POST /api/v1/analizeaza-mancare-structurat': [200, 400, 401, 409, 413, 429, 499, 500, 503],
  'POST /api/v1/chat': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/log-food-from-chat': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/log-food': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/log-food-chat': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/estimeaza-mancare-text': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/profil-nutritiv': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/vision-fallback': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/corecteaza-mancare-vizual-text': [200, 400, 401, 409, 413, 429, 500, 503],
  'GET /api/v1/cauta-produs': [200, 400, 401, 409, 429, 502, 503],
  'GET /api/v1/produs-barcode/{code}': [200, 400, 401, 404, 409, 429, 500, 503],
  'POST /api/v1/salveaza-produs-barcode': [200, 400, 401, 403, 409, 413, 429, 500, 503],
  'POST /api/v1/calculeaza-profil': [200, 400, 401, 409, 413, 429, 500, 503],
  'POST /api/v1/mese': [200, 400, 401, 409, 413, 429, 500, 503],
  'PUT /api/v1/mese/{id}': [200, 400, 401, 404, 409, 413, 429, 500, 503],
  'DELETE /api/v1/mese/{id}': [200, 400, 401, 404, 409, 429, 500, 503],
  'GET /api/v1/user/profil': [200, 401, 409, 429, 503],
  'GET /api/v1/user/premium-status': [200, 401, 409, 429, 503],
  'GET /api/v1/billing/google/products': [200, 401, 409, 429, 503],
  'POST /api/v1/billing/google/verify': [200, 400, 401, 403, 409, 413, 429, 503],
  'POST /api/v1/billing/google/resync': [200, 400, 401, 403, 409, 413, 429, 503],
  'GET /api/v1/user/export-data': [200, 401, 409, 429, 500, 503],
  'DELETE /api/v1/user/delete-account': [200, 401, 409, 429, 500, 503],
  'POST /api/v1/webhooks/clerk': [200, 400, 401, 429, 500],
  'POST /api/v1/webhooks/google-play': [204, 400, 401, 403, 413, 429, 503],
};

describe('contractul OpenAPI urmareste runtime-ul Express', () => {
  const document = yaml.safeLoad(fs.readFileSync(CALE_OPENAPI, 'utf8'));

  test('documenteaza exact toate combinatiile explicite metoda + cale', () => {
    expect([...inventarOpenApi(document)].sort()).toEqual([...inventarExpress()].sort());
  });

  test('marcheaza verificabil fiecare alias legacy /api cu succesor si sunset', () => {
    const legacy = [...inventarExpress()]
      .map((intrare) => intrare.split(' ')[1])
      .filter((cale) => cale.startsWith('/api/') && !cale.startsWith('/api/v1/'));

    for (const cale of new Set(legacy)) {
      expect(document.paths[cale]?.['x-legacy-alias']).toEqual({
        canonical: `/api/v1${cale.slice('/api'.length)}`,
        sunset: '2026-09-30T00:00:00Z',
      });
    }
  });

  test.each(Object.entries(STATUSURI_CANONICE))('%s declara toate statusurile runtime', (cheie, statusuri) => {
    const [metoda, cale] = cheie.split(' ');
    expect(Object.keys(operatie(document, cale, metoda.toLowerCase())?.responses || {}).sort())
      .toEqual(statusuri.map(String).sort());
  });

  test('aplica bearer auth rutelor canonice normale si nu webhook-urilor/publicului', () => {
    for (const cheie of Object.keys(STATUSURI_CANONICE)) {
      const [metoda, cale] = cheie.split(' ');
      const op = operatie(document, cale, metoda.toLowerCase());
      const securitate = op?.security ?? document.security;
      if (cale === '/' || cale === '/health' || cale.includes('/webhooks/')) {
        expect(securitate).toEqual([]);
      } else {
        expect(securitate).toEqual([{ bearerAuth: [] }]);
      }
    }
  });

  test('descrie contractele critice care au deviat anterior', () => {
    const statusSchema = schemaRaspuns(document, '/api/v1/ai-status', 'get', 200);
    expect(statusSchema.required).toEqual(['gemini', 'openai', 'groq', 'openrouter']);
    expect(statusSchema.properties).not.toHaveProperty('metriciAi');

    const triggerSchema = schemaRaspuns(document, '/api/v1/trigger-analiza-mancare', 'post', 202);
    expect(triggerSchema.required).toEqual(expect.arrayContaining(['jobId', 'succes', 'taskId', 'status', 'mesaj']));
    expect(raspuns(document, '/api/v1/trigger-analiza-mancare', 'post', 200)).toBeUndefined();

    for (const status of [400, 500]) {
      const chatSchema = schemaRaspuns(document, '/api/v1/chat', 'post', status);
      expect(schemaAreVariantaCuCampObligatoriu(document, chatSchema, 'raspuns')).toBe(true);
    }

    const barcodeSchema = schemaRaspuns(document, '/api/v1/produs-barcode/{code}', 'get', 200);
    expect(barcodeSchema.properties.sursa.enum).toEqual(expect.arrayContaining(['user_manual', 'necunoscut']));

    const exportSchema = schemaRaspuns(document, '/api/v1/user/export-data', 'get', 200);
    expect(exportSchema.required).toContain('audit_log');
    expect(exportSchema.properties).toHaveProperty('audit_log');
    expect(exportSchema.required).toEqual(expect.arrayContaining([
      'produse_camara',
      'gamificare_evenimente',
      'workout_logs',
      'ai_jobs',
      'credite_ai',
      'credite_tranzactii',
      'abonamente_google_play',
    ]));
    expect(exportSchema.properties.abonamente_google_play.items.properties)
      .not.toHaveProperty('purchase_token');
  });
});
