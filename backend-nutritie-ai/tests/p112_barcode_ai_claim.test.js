'use strict';

/**
 * P1-12 (remediere) — cursa pe cache RECE la fallback-ul AI de barcode.
 *
 * ==========================================================================
 * CE A RATAT VERIFICAREA INITIALA
 * ==========================================================================
 * Raportul P1-12 a declarat fallback-ul AI de barcode „protejat de cache-ul
 * durabil", citand `barcode_quota.test.js:117`. Acel test acopera insa DOAR
 * cache-ul CALD (rezultat deja existent). Nu exista niciun test pe cache RECE
 * cu concurenta reala — exact fereastra in care protectia lipsea:
 *
 *   A: cache MISS ─┐
 *   B: cache MISS ─┼─► ambele apeleaza Groq si debiteaza quota
 *                  ┘
 * Declansator realist (nu client ostil): timeout de retea ~15s pe mobil, fereastra
 * de dedupe pe client ~3s, cererea inca se executa pe server, clientul reia.
 *
 * Testele de mai jos ruleaza pe `createBarcodeRouter` REAL si numara apelurile
 * efective catre Groq si mutatiile de quota — fara aserțiuni pe textul sursei.
 */

const express = require('express');
const request = require('supertest');

const createBarcodeRouter = require('../routes/barcode');
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

const BARCODE = '5941234567890';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

/** Registru cu semantica atomica SET NX, ca Redis. */
function creeazaRegistruClaim({ degradat = false } = {}) {
  const stocare = new Map();
  // Zalogul se ELIBEREAZA la finalul cererii, deci `stocare` e goala dupa test.
  // `cheiVazute` pastreaza fiecare cheie revendicata, ca sa putem verifica
  // identitatea canonica a operatiei (ex. zerourile din fata) dupa terminare.
  const cheiVazute = [];
  return {
    stocare,
    cheiVazute,
    degradat,
    async get(k) { return stocare.get(k) || null; },
    async set(k, v) { stocare.set(k, v); },
    async setIfAbsent(k, v) {
      if (stocare.has(k)) return false;
      cheiVazute.push(k);
      stocare.set(k, v);
      return true;
    },
    async del(k) { stocare.delete(k); },
  };
}

/**
 * Depozit de estimari partajat intre cereri: MISS pana cand o cerere chiar
 * persista rezultatul. Fara asta, cursa pe cache rece nu poate fi reprodusa.
 */
function creeazaDepozitEstimari() {
  const randuri = new Map();
  return {
    randuri,
    cheie: (userId, cod) => `${userId}:${cod}`,
    async citeste(ctx, cod) {
      return randuri.get(`${ctx.userId}:${cod}`) || null;
    },
    async salveaza(ctx, { cod, produs }) {
      randuri.set(`${ctx.userId}:${cod}`, { produs });
    },
  };
}

function raspunsOffNegasit() {
  return { ok: false, status: 404, json: async () => ({ status: 0 }) };
}

function raspunsGroqValid(intarziereMs = 120) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({
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
    }), intarziereMs);
  });
}

function construieste({
  registru = creeazaRegistruClaim(),
  depozit = creeazaDepozitEstimari(),
  userId = USER_A,
  raspunsGroq = () => raspunsGroqValid(),
  getProdusBarcode = async () => null,
  citesteEstimareUtilizator = null,
} = {}) {
  const contor = {
    increment: jest.fn(async () => 1),
    decrement: jest.fn(async () => undefined),
    ttl: jest.fn(async () => 3600),
  };

  const fetchMock = jest.fn(async (url) => (
    String(url).includes('openfoodfacts') ? raspunsOffNegasit() : raspunsGroq()
  ));
  global.fetch = fetchMock;

  const app = express();
  app.use(express.json());
  app.use(createBarcodeRouter({
    requireAuth: (req, _res, next) => {
      req.user = { id: userId, esteTester: false, esteAdmin: false };
      next();
    },
    generalLimiter: (_req, _res, next) => next(),
    aiLimiter: (_req, _res, next) => next(),
    checkAiUsageQuota: creeazaCheckAiUsageQuota({ contor, limitaZi: 50, limitaTester: 500 }),
    contextDate: () => ({ userId }),
    config: { ai: { groqTextModels: ['openai/gpt-oss-120b'] } },
    registruClaim: registru,
    barcodeRepo: {
      getProdusBarcode,
      citesteEstimareUtilizator: citesteEstimareUtilizator
        || ((ctx, cod) => depozit.citeste(ctx, cod)),
      salveazaProdusOff: async () => undefined,
      salveazaEstimareUtilizator: (ctx, date) => depozit.salveaza(ctx, date),
    },
  }));

  const apeluriGroq = () => fetchMock.mock.calls
    .filter(([url]) => String(url).includes('api.groq.com')).length;

  return { app, contor, apeluriGroq, registru, depozit, fetchMock };
}

const cere = (app, cod = BARCODE) => request(app).get(`/produs-barcode/${cod}`);

describe('P1-12 — cursa pe cache RECE (blocantul din review)', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;

  beforeEach(() => { process.env.GROQ_API_KEY = 'groq-test-key'; });
  afterEach(() => { global.fetch = fetchOriginal; jest.restoreAllMocks(); });
  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('1. doua cereri SIMULTANE pe cache rece → 1 apel Groq, 1 mutatie de quota', async () => {
    const h = construieste();

    const [r1, r2] = await Promise.all([cere(h.app), cere(h.app)]);

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    // Cel putin una raspunde util; niciuna nu executa a doua generare platita.
    expect([r1.status, r2.status].some((s) => s === 200)).toBe(true);
  });

  test('2. 10 cereri SIMULTANE pe cache rece → tot 1 apel Groq, 1 mutatie de quota', async () => {
    const h = construieste();

    const raspunsuri = await Promise.all(Array.from({ length: 10 }, () => cere(h.app)));

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(raspunsuri.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    // Nicio cerere nu primeste 500: duplicatele au semantica explicita.
    expect(raspunsuri.every((r) => [200, 409].includes(r.status))).toBe(true);
  });

  test('3. replay secvential dupa succes → rezultat din cache, 0 apeluri Groq in plus', async () => {
    const h = construieste();

    const prima = await cere(h.app);
    expect(prima.status).toBe(200);
    expect(h.apeluriGroq()).toBe(1);

    const aDoua = await cere(h.app);

    expect(aDoua.status).toBe(200);
    expect(aDoua.body.dinCache).toBe(true);
    expect(aDoua.body.produs).toEqual(prima.body.produs);
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
  });

  test('4. raspuns HTTP pierdut + reluare → 1 apel Groq in total, 1 debitare', async () => {
    const h = construieste();

    // Cererea PORNESTE efectiv (supertest trimite abia la .then), apoi clientul
    // pierde conexiunea la mijlocul apelului Groq — exact tiparul mobil descris in
    // review. Serverul continua si persista rezultatul.
    const inZbor = cere(h.app);
    const terminata = inZbor.then(() => null, () => null);
    await new Promise((r) => setTimeout(r, 60));
    inZbor.abort();
    await terminata;

    // Lasam serverul sa termine generarea si persistarea inainte de reluare.
    await new Promise((r) => setTimeout(r, 300));
    const reluare = await cere(h.app);

    expect(reluare.status).toBe(200);
    expect(reluare.body.dinCache).toBe(true);
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
  });

  test('5. duplicat sosit in timpul unui apel LENT nu porneste al doilea apel', async () => {
    const h = construieste({ raspunsGroq: () => raspunsGroqValid(400) });

    const a = cere(h.app);
    await new Promise((r) => setTimeout(r, 60));
    const b = await cere(h.app);
    await a;

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect([200, 409]).toContain(b.status);
  });

  test('6. dupa esecul final al furnizorului, operatia redevine reincercabila', async () => {
    let esueaza = true;
    const h = construieste({
      raspunsGroq: async () => {
        if (esueaza) throw new Error('groq indisponibil');
        return raspunsGroqValid(10);
      },
    });

    const esuata = await cere(h.app);
    expect(esuata.status).toBe(404);

    // Zalogul nu ramane blocat: o reluare ulterioara poate executa din nou.
    esueaza = false;
    const reusita = await cere(h.app);

    expect(reusita.status).toBe(200);
    expect(h.apeluriGroq()).toBe(2);
  });
});

describe('P1-12 — izolare intre conturi si identitate canonica a codului', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;

  beforeEach(() => { process.env.GROQ_API_KEY = 'groq-test-key'; });
  afterEach(() => { global.fetch = fetchOriginal; jest.restoreAllMocks(); });
  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('7. acelasi cod, doi utilizatori → fiecare isi plateste propria operatie', async () => {
    const registru = creeazaRegistruClaim();
    const depozit = creeazaDepozitEstimari();

    const a = construieste({ registru, depozit, userId: USER_A });
    const ra = await cere(a.app);
    const b = construieste({ registru, depozit, userId: USER_B });
    const rb = await cere(b.app);

    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    // Zalogul lui A nu il blocheaza pe B si nu ii consuma creditul.
    expect(a.contor.increment).toHaveBeenCalledTimes(1);
    expect(b.contor.increment).toHaveBeenCalledTimes(1);
    // Estimarile raman separate per utilizator (RLS pe auth.uid()).
    expect(depozit.randuri.size).toBe(2);
  });

  test('8. zalogurile celor doi utilizatori nu se suprapun in stocul partajat', async () => {
    const registru = creeazaRegistruClaim();
    const depozit = creeazaDepozitEstimari();

    await Promise.all([
      cere(construieste({ registru, depozit, userId: USER_A }).app),
      cere(construieste({ registru, depozit, userId: USER_B }).app),
    ]);

    const cheiBarcode = registru.cheiVazute.filter((k) => k.startsWith('barcode-ai:'));
    expect(cheiBarcode).toHaveLength(2);
    // Doua chei DISTINCTE: zalogul lui A nu este acelasi cu al lui B.
    expect(new Set(cheiBarcode).size).toBe(2);
  });

  test('9. coduri diferite nu se ciocnesc', async () => {
    const h = construieste();

    await cere(h.app, '5941234567890');
    await cere(h.app, '5949999999999');

    expect(h.apeluriGroq()).toBe(2);
    expect(h.contor.increment).toHaveBeenCalledTimes(2);
  });

  test('10. zerourile din fata sunt pastrate — EAN-8 "00012345" nu devine 12345', async () => {
    const registru = creeazaRegistruClaim();
    const depozit = creeazaDepozitEstimari();
    const h = construieste({ registru, depozit });

    await cere(h.app, '00012345');
    await cere(h.app, '12345');

    // Doua operatii logice DISTINCTE: cheia nu a fost convertita numeric.
    expect(h.apeluriGroq()).toBe(2);
    const chei = registru.cheiVazute.filter((k) => k.startsWith('barcode-ai:'));
    expect(new Set(chei).size).toBe(2);
    expect(chei.some((k) => k.endsWith(':00012345'))).toBe(true);
    expect(chei.some((k) => k.endsWith(':12345'))).toBe(true);
    expect(depozit.randuri.has(`${USER_A}:00012345`)).toBe(true);
    expect(depozit.randuri.has(`${USER_A}:12345`)).toBe(true);
  });
});

describe('P1-12 — cache cald si degradare in siguranta', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;

  beforeEach(() => { process.env.GROQ_API_KEY = 'groq-test-key'; });
  afterEach(() => { global.fetch = fetchOriginal; jest.restoreAllMocks(); });
  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('11. hit din cache-ul global PUBLIC → fara zalog, fara quota, fara Groq', async () => {
    const h = construieste({
      getProdusBarcode: async () => ({ produs: { nume: 'Produs public' }, sursa: 'openfoodfacts' }),
    });

    const r = await cere(h.app);

    expect(r.status).toBe(200);
    expect(r.body.dinCache).toBe(true);
    expect(h.apeluriGroq()).toBe(0);
    expect(h.contor.increment).not.toHaveBeenCalled();
    expect(h.registru.cheiVazute).toHaveLength(0);
  });

  test('12. stoc de zaloguri DEGRADAT → 503 fail-closed, fara apel neprotejat la furnizor', async () => {
    const h = construieste({ registru: creeazaRegistruClaim({ degradat: true }) });

    const r = await cere(h.app);

    expect(r.status).toBe(503);
    expect(r.body.cod).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
    expect(h.apeluriGroq()).toBe(0);
    expect(h.contor.increment).not.toHaveBeenCalled();
  });

  test('13. eroare tranzitorie la citirea cache-ului nu deschide calea dublei executii', async () => {
    const h = construieste({
      citesteEstimareUtilizator: async () => { throw new Error('DB indisponibil'); },
    });

    await Promise.all([cere(h.app), cere(h.app)]);

    // Citirea cache-ului esueaza deschis (prin design), dar zalogul tot serializeaza.
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
  });
});

describe('P1-12 — zalogul nu se construieste niciodata fara identitate verificata', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;

  beforeEach(() => { process.env.GROQ_API_KEY = 'groq-test-key'; });
  afterEach(() => { global.fetch = fetchOriginal; jest.restoreAllMocks(); });
  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('14. fara sesiune verificata → 401, fara zalog, fara quota, fara furnizor', async () => {
    const registru = creeazaRegistruClaim();
    const contor = {
      increment: jest.fn(async () => 1),
      decrement: jest.fn(async () => undefined),
      ttl: jest.fn(async () => 3600),
    };
    const fetchMock = jest.fn(async (url) => (
      String(url).includes('openfoodfacts') ? raspunsOffNegasit() : raspunsGroqValid(5)
    ));
    global.fetch = fetchMock;

    const app = express();
    app.use(createBarcodeRouter({
      // Identitate ABSENTA: cheia zalogului nu poate fi scopata pe utilizator.
      requireAuth: (_req, _res, next) => next(),
      generalLimiter: (_req, _res, next) => next(),
      aiLimiter: (_req, _res, next) => next(),
      checkAiUsageQuota: creeazaCheckAiUsageQuota({ contor, limitaZi: 50 }),
      contextDate: () => ({ userId: undefined }),
      config: { ai: { groqTextModels: ['openai/gpt-oss-120b'] } },
      registruClaim: registru,
      barcodeRepo: {
        getProdusBarcode: async () => null,
        citesteEstimareUtilizator: async () => null,
        salveazaProdusOff: async () => undefined,
        salveazaEstimareUtilizator: async () => undefined,
      },
    }));

    const r = await request(app).get(`/produs-barcode/${BARCODE}`);

    expect(r.status).toBe(401);
    expect(registru.cheiVazute).toHaveLength(0);
    expect(contor.increment).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('api.groq.com'))).toHaveLength(0);
  });
});

