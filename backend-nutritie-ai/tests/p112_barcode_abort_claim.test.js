'use strict';

/**
 * P1-12 (a doua remediere) — durata de viata a ZALOGULUI de barcode.
 *
 * ==========================================================================
 * BLOCANTUL
 * ==========================================================================
 * Prima remediere elibera zalogul din `res.once('close')`. `close` se declanseaza
 * SI la deconectarea prematura a clientului, dar apelul Groq NU este anulat de
 * deconectare. Rezulta:
 *
 *   A: MISS → zalog → quota → Groq incepe
 *   A: clientul se deconecteaza → 'close' → zalog STERS
 *   A: Groq inca ruleaza
 *   B: MISS → zalog LIBER → quota → al doilea Groq
 *
 * Adica exact dubla debitare pe care zalogul trebuia sa o previna. Zalogul era
 * legat de CONEXIUNEA HTTP, nu de OPERATIA LOGICA.
 *
 * Testele ruleaza pe un `http.Server` REAL cu socket-uri reale (nu doar pe app-ul
 * express), pentru ca deconectarea trebuie sa fie una autentica, la nivel de TCP.
 */

const express = require('express');
const http = require('http');

const createBarcodeRouter = require('../routes/barcode');
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

const BARCODE = '5941234567890';
const USER_A = '11111111-1111-4111-8111-111111111111';

/** Registru cu semantica atomica SET NX + compare-and-delete, ca Redis. */
function creeazaRegistruClaim({ degradat = false, delEsueaza = false } = {}) {
  const stocare = new Map();
  const cheiVazute = [];
  const stergeriVazute = [];
  return {
    stocare,
    cheiVazute,
    stergeriVazute,
    degradat,
    async get(k) { return stocare.has(k) ? stocare.get(k) : null; },
    async set(k, v) { stocare.set(k, v); },
    ttlVazute: [],
    async setIfAbsent(k, v, ttlMs) {
      if (stocare.has(k)) return false;
      cheiVazute.push(k);
      this.ttlVazute.push(ttlMs);
      stocare.set(k, v);
      return true;
    },
    async del(k) {
      stergeriVazute.push(k);
      if (delEsueaza) throw new Error('Redis del indisponibil');
      stocare.delete(k);
    },
    async delIfMatch(k, v) {
      stergeriVazute.push(k);
      if (delEsueaza) throw new Error('Redis del indisponibil');
      if (!stocare.has(k)) return false;
      if (JSON.stringify(stocare.get(k)) !== JSON.stringify(v)) return false;
      stocare.delete(k);
      return true;
    },
  };
}

function creeazaDepozitEstimari() {
  const randuri = new Map();
  return {
    randuri,
    async citeste(ctx, cod) { return randuri.get(`${ctx.userId}:${cod}`) || null; },
    async salveaza(ctx, { cod, produs }) { randuri.set(`${ctx.userId}:${cod}`, { produs }); },
  };
}

function corpGroqValid() {
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

/**
 * Poarta controlata manual pentru apelul la furnizor: testul decide EXACT cand
 * se termina Groq, deci poate tine operatia A „in zbor" cat timp trimite B.
 */
function creeazaPoartaFurnizor() {
  const asteptari = [];
  let deschisa = false;
  let rezultat = () => corpGroqValid();
  return {
    intrari: 0,
    get asteptariActive() { return asteptari.length; },
    seteazaRezultat(fn) { rezultat = fn; },
    async intra() {
      this.intrari += 1;
      if (deschisa) return rezultat();
      await new Promise((resolve) => { asteptari.push(resolve); });
      return rezultat();
    },
    deschide() {
      deschisa = true;
      while (asteptari.length) asteptari.shift()();
    },
  };
}

async function porneste({
  registru = creeazaRegistruClaim(),
  depozit = creeazaDepozitEstimari(),
  poarta = creeazaPoartaFurnizor(),
  getProdusBarcode = async () => null,
} = {}) {
  const contor = {
    increment: jest.fn(async () => 1),
    decrement: jest.fn(async () => undefined),
    ttl: jest.fn(async () => 3600),
  };

  const fetchMock = jest.fn(async (url) => {
    if (String(url).includes('openfoodfacts')) {
      return { ok: false, status: 404, json: async () => ({ status: 0 }) };
    }
    return poarta.intra();
  });
  global.fetch = fetchMock;

  const app = express();
  app.use(createBarcodeRouter({
    requireAuth: (req, _res, next) => { req.user = { id: USER_A }; next(); },
    generalLimiter: (_req, _res, next) => next(),
    aiLimiter: (_req, _res, next) => next(),
    checkAiUsageQuota: creeazaCheckAiUsageQuota({ contor, limitaZi: 50, limitaTester: 500 }),
    contextDate: () => ({ userId: USER_A }),
    config: { ai: { groqTextModels: ['openai/gpt-oss-120b'] } },
    registruClaim: registru,
    barcodeRepo: {
      getProdusBarcode,
      citesteEstimareUtilizator: (ctx, cod) => depozit.citeste(ctx, cod),
      salveazaProdusOff: async () => undefined,
      salveazaEstimareUtilizator: (ctx, date) => depozit.salveaza(ctx, date),
    },
  }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    server,
    port,
    contor,
    registru,
    depozit,
    poarta,
    apeluriGroq: () => fetchMock.mock.calls
      .filter(([u]) => String(u).includes('api.groq.com')).length,
    async opreste() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Cerere HTTP reala; `distruge()` inchide socket-ul TCP, ca un client cazut. */
function cereReal(port, cod = BARCODE) {
  let raspuns = null;
  const cerere = http.request(
    { host: '127.0.0.1', port, path: `/produs-barcode/${cod}`, method: 'GET' },
    (res) => {
      const bucati = [];
      res.on('data', (d) => bucati.push(d));
      res.on('end', () => {
        let corp = null;
        try { corp = JSON.parse(Buffer.concat(bucati).toString()); } catch { corp = null; }
        raspuns = { status: res.statusCode, body: corp };
      });
    },
  );
  const terminata = new Promise((resolve) => {
    cerere.on('close', () => resolve(raspuns));
    cerere.on('error', () => resolve(raspuns));
  });
  cerere.end();
  return {
    terminata,
    distruge: () => cerere.destroy(),
  };
}

const pauza = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Asteapta pana cand `conditie()` devine adevarata sau expira timpul. */
async function panaCand(conditie, limitaMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < limitaMs) {
    if (await conditie()) return true;
    await pauza(15);
  }
  return false;
}

describe('P1-12 — zalogul apartine OPERATIEI LOGICE, nu conexiunii HTTP', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;
  let h = null;

  beforeEach(() => { process.env.GROQ_API_KEY = 'groq-test-key'; });
  afterEach(async () => {
    if (h) { h.poarta.deschide(); await h.opreste(); h = null; }
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });
  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('1. BLOCANT: deconectare in timpul apelului la furnizor + reluare imediata → 1 apel, 1 quota', async () => {
    h = await porneste();

    // A porneste si intra efectiv in apelul la furnizor (poarta il tine blocat).
    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.registru.cheiVazute).toHaveLength(1);

    // Clientul A cade la nivel de TCP, CU furnizorul inca in executie.
    a.distruge();
    await a.terminata;
    await pauza(120); // serverul observa 'close'

    // B reia imediat, cat timp A este inca in zbor.
    const b = cereReal(h.port);
    await pauza(250);

    // Aici era gaura: inainte de fix, B revendica zalogul eliberat si pornea al
    // doilea Groq cu a doua debitare.
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);

    h.poarta.deschide();
    await b.terminata;

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    // SEMANTICA DE DEBITARE LA DECONECTARE — fixata explicit, ca sa nu se schimbe tacut.
    // Decontarea apartine REZULTATULUI operatiei, nu socketului: operatia a continuat,
    // a reusit si a persistat un rezultat durabil pe care utilizatorul il va primi la
    // reluare, deci debitarea RAMANE. O restituire aici ar transforma deconectarea in
    // utilizare AI gratuita (vezi p112_barcode_settlement.test.js).
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
    expect(h.depozit.randuri.size).toBe(1);
  }, 20000);

  test('2. deconectare + duplicat dupa 100ms, furnizorul inca nerezolvat → 1 apel, 1 quota', async () => {
    h = await porneste();

    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
    a.distruge();
    await a.terminata;
    await pauza(100);

    const b = cereReal(h.port);
    await pauza(200);

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);

    h.poarta.deschide();
    await b.terminata;
  }, 20000);

  test('3. deconectare + duplicat dupa 2s, furnizorul inca tinut → 1 apel, 1 quota', async () => {
    h = await porneste();

    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
    a.distruge();
    await a.terminata;
    await pauza(2000);

    const b = cereReal(h.port);
    await pauza(300);

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);

    h.poarta.deschide();
    await b.terminata;
  }, 25000);

  test('4. deconectare → detinatorul termina si PERSISTA → reluarea ulterioara ia din cache', async () => {
    h = await porneste();

    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
    a.distruge();
    await a.terminata;
    await pauza(120);

    // Operatia continua desi clientul a disparut: rezultatul trebuie persistat.
    h.poarta.deschide();
    expect(await panaCand(() => h.depozit.randuri.size > 0)).toBe(true);
    // ...si abia dupa persistare se elibereaza zalogul.
    expect(await panaCand(() => h.registru.stocare.size === 0)).toBe(true);

    const reluare = await cereReal(h.port).terminata;

    expect(reluare.status).toBe(200);
    expect(reluare.body.dinCache).toBe(true);
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
  }, 20000);

  test('5. deconectare + esec final al furnizorului → zalogul se elibereaza dupa tratarea esecului', async () => {
    h = await porneste();
    h.poarta.seteazaRezultat(() => { throw new Error('groq indisponibil'); });

    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
    a.distruge();
    await a.terminata;
    await pauza(120);

    // Cat timp furnizorul e in zbor, zalogul ramane detinut.
    expect(h.registru.stocare.size).toBe(1);

    h.poarta.deschide();
    expect(await panaCand(() => h.registru.stocare.size === 0)).toBe(true);
    // Nimic persistat: esecul nu inventeaza rezultat.
    expect(h.depozit.randuri.size).toBe(0);
  }, 20000);

  test('6. dupa esecul final, o reluare legitima poate revendica din nou', async () => {
    h = await porneste();
    h.poarta.seteazaRezultat(() => { throw new Error('groq indisponibil'); });
    h.poarta.deschide();

    const prima = await cereReal(h.port).terminata;
    expect(prima.status).toBe(404);
    expect(await panaCand(() => h.registru.stocare.size === 0)).toBe(true);

    h.poarta.seteazaRezultat(() => corpGroqValid());
    const aDoua = await cereReal(h.port).terminata;

    expect(aDoua.status).toBe(200);
    expect(h.apeluriGroq()).toBe(2);
  }, 20000);

  test('7. succes obisnuit (fara deconectare) → zalog eliberat DUPA persistare', async () => {
    h = await porneste();
    h.poarta.deschide();

    const r = await cereReal(h.port).terminata;

    expect(r.status).toBe(200);
    expect(h.depozit.randuri.size).toBe(1);
    expect(await panaCand(() => h.registru.stocare.size === 0)).toBe(true);
    expect(h.registru.stergeriVazute).toHaveLength(1);
  }, 20000);

  test('8. eliberare esuata in Redis → cache-ul durabil previne totusi al doilea apel', async () => {
    h = await porneste({ registru: creeazaRegistruClaim({ delEsueaza: true }) });
    h.poarta.deschide();

    const prima = await cereReal(h.port).terminata;
    expect(prima.status).toBe(200);

    // Zalogul ramane (stergerea a esuat), dar cache-ul cald scurtcircuiteaza
    // cererea INAINTE de zalog, deci reluarea nu plateste nimic.
    const aDoua = await cereReal(h.port).terminata;

    expect(aDoua.status).toBe(200);
    expect(aDoua.body.dinCache).toBe(true);
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
  }, 20000);
});

describe('P1-12 — TTL ca plasa de siguranta si proprietate prin jeton', () => {
  const fetchOriginal = global.fetch;
  const groqKeyOriginal = process.env.GROQ_API_KEY;
  let h = null;

  beforeEach(() => { process.env.GROQ_API_KEY = 'groq-test-key'; });
  afterEach(async () => {
    if (h) { h.poarta.deschide(); await h.opreste(); h = null; }
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });
  afterAll(() => {
    if (groqKeyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOriginal;
  });

  test('9. simulare de crash (finally nu ruleaza niciodata) → zalogul supravietuieste prin TTL', async () => {
    h = await porneste();

    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);

    // Procesul „moare": nici raspunsul, nici `finally` nu se mai executa. Singurul
    // mecanism ramas este expirarea TTL — deci TTL-ul trebuie sa existe si sa fie
    // suficient pentru durata maxima a operatiei, nu o valoare presupusa.
    expect(h.registru.stocare.size).toBe(1);
    const ttl = h.registru.ttlVazute[0];
    expect(typeof ttl).toBe('number');
    expect(ttl).toBeGreaterThanOrEqual(60000);
    // 1 model x 18s + marja de 15s incape sub minimul de 60s.
    expect(ttl).toBeGreaterThanOrEqual(1 * 18000 + 15000);

    h.poarta.deschide();
    await a.terminata;
  }, 20000);

  test('10. TTL-ul creste cu numarul de modele configurate (nu expira sub executie)', async () => {
    const registru = creeazaRegistruClaim();
    const poarta = creeazaPoartaFurnizor();
    poarta.deschide();
    const contor = {
      increment: jest.fn(async () => 1), decrement: jest.fn(), ttl: jest.fn(async () => 3600),
    };
    global.fetch = jest.fn(async (url) => (String(url).includes('openfoodfacts')
      ? { ok: false, status: 404, json: async () => ({ status: 0 }) }
      : poarta.intra()));

    const depozit = creeazaDepozitEstimari();
    const app = express();
    app.use(createBarcodeRouter({
      requireAuth: (req, _res, next) => { req.user = { id: USER_A }; next(); },
      generalLimiter: (_q, _r, n) => n(),
      aiLimiter: (_q, _r, n) => n(),
      checkAiUsageQuota: creeazaCheckAiUsageQuota({ contor, limitaZi: 50 }),
      contextDate: () => ({ userId: USER_A }),
      // Patru modele x 18s = 72s: un TTL fix de 60s ar expira IN TIMPUL executiei.
      config: { ai: { groqTextModels: ['m1', 'm2', 'm3', 'm4'] } },
      registruClaim: registru,
      barcodeRepo: {
        getProdusBarcode: async () => null,
        citesteEstimareUtilizator: (ctx, cod) => depozit.citeste(ctx, cod),
        salveazaProdusOff: async () => undefined,
        salveazaEstimareUtilizator: (ctx, date) => depozit.salveaza(ctx, date),
      },
    }));
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));

    await cereReal(server.address().port).terminata;
    await new Promise((r) => server.close(r));

    expect(registru.ttlVazute[0]).toBeGreaterThan(4 * 18000);
  }, 20000);

  test('11. un proprietar VECHI, intarziat, nu poate sterge zalogul proprietarului NOU', async () => {
    h = await porneste();

    // A revendica si intra la furnizor.
    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
    const cheie = h.registru.cheiVazute[0];
    const tokenA = h.registru.stocare.get(cheie);

    // Simulam expirarea TTL a lui A, apoi B revendica ACEEASI cheie cu alt jeton.
    h.registru.stocare.delete(cheie);
    const tokenB = 'jeton-proprietar-nou';
    expect(await h.registru.setIfAbsent(cheie, tokenB, 60000)).toBe(true);
    expect(tokenA).not.toBe(tokenB);

    // Abia acum se termina A si ii ruleaza `finally`-ul (curatenie intarziata).
    h.poarta.deschide();
    await a.terminata;
    await pauza(150);

    // Fara compare-and-delete, A ar fi sters zalogul lui B, iar un al treilea
    // apelant ar fi pornit a doua generare platita.
    expect(h.registru.stocare.get(cheie)).toBe(tokenB);
  }, 20000);
});

