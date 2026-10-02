'use strict';

/**
 * P1-12 (decontare financiara) — deconectarea NU este o dovada de esec.
 *
 * ==========================================================================
 * BLOCANTUL
 * ==========================================================================
 * Dupa ce am legat zalogul de operatia logica (operatia CONTINUA dupa
 * deconectare), decontarea a ramas legata de socket:
 *
 *   quota/credit consumat
 *   → clientul inchide socketul
 *   → `res.close` + !writableEnded → `aiUsageQuota` RESTITUIE unitatea
 *   → operatia continua, Groq raspunde, rezultatul se PERSISTA
 *   → reluarea ia rezultatul din cache, fara nicio debitare
 *
 * Net: cost real de furnizor platit de noi, rezultat utilizabil livrat
 * utilizatorului, iar consumul lui net = 0. Un scanner care se deconecteaza
 * deliberat isi pastreaza cota zilnica la zero la nesfarsit.
 *
 * Regula corecta: autoritatea de decontare este REZULTATUL OPERATIEI, nu starea
 * conexiunii HTTP. Testele numara apeluri reale de debitare/restituire.
 */

const express = require('express');
const http = require('http');

const createBarcodeRouter = require('../routes/barcode');
const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');

const BARCODE = '5941234567890';
const USER_A = '11111111-1111-4111-8111-111111111111';

function creeazaRegistruClaim() {
  const stocare = new Map();
  return {
    stocare,
    degradat: false,
    async get(k) { return stocare.has(k) ? stocare.get(k) : null; },
    async set(k, v) { stocare.set(k, v); },
    async setIfAbsent(k, v) {
      if (stocare.has(k)) return false;
      stocare.set(k, v);
      return true;
    },
    async del(k) { stocare.delete(k); },
    async delIfMatch(k, v) {
      if (stocare.get(k) !== v) return false;
      stocare.delete(k);
      return true;
    },
  };
}

function creeazaDepozitEstimari({ salvareEsueaza = false } = {}) {
  const randuri = new Map();
  return {
    randuri,
    async citeste(ctx, cod) { return randuri.get(`${ctx.userId}:${cod}`) || null; },
    async salveaza(ctx, { cod, produs }) {
      if (salvareEsueaza) throw new Error('DB indisponibil la persistare');
      randuri.set(`${ctx.userId}:${cod}`, { produs });
    },
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
            codBare: BARCODE, nume: 'Produs estimat', brand: 'AI Estimat',
            cantitate: '100g', calorii: 100, proteine: 5, carbohidrati: 10, grasimi: 4,
          }),
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }),
  };
}

function creeazaPoartaFurnizor() {
  const asteptari = [];
  let deschisa = false;
  let rezultat = () => corpGroqValid();
  let intarziereMs = 0;
  return {
    seteazaRezultat(fn) { rezultat = fn; },
    /** Furnizor lent dar auto-rezolvabil: cererea e real „in zbor" la deconectare. */
    seteazaIntarziere(ms) { intarziereMs = ms; },
    async intra() {
      if (deschisa) {
        if (intarziereMs > 0) await new Promise((r) => { setTimeout(r, intarziereMs); });
        return rezultat();
      }
      await new Promise((resolve) => { asteptari.push(resolve); });
      return rezultat();
    },
    deschide() {
      deschisa = true;
      while (asteptari.length) asteptari.shift()();
    },
  };
}

/** Client admin fals care inregistreaza EXACT miscarile de credite platite. */
function creeazaSupabaseCredite({ sold = 5 } = {}) {
  const apeluri = { consum: [], refund: [], confirm: [] };
  return {
    apeluri,
    rpc: jest.fn(async (nume, argumente) => {
      if (nume === 'consuma_credit') {
        apeluri.consum.push(argumente);
        return { data: sold - apeluri.consum.length, error: null };
      }
      if (nume === 'aplica_tranzactie_credite') {
        if (argumente.p_event_type === 'REFUND_AI_FAILURE') apeluri.refund.push(argumente);
        if (argumente.p_event_type === 'CONSUM_AI_CONFIRM') apeluri.confirm.push(argumente);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }),
  };
}

async function porneste({
  registru = creeazaRegistruClaim(),
  depozit = creeazaDepozitEstimari(),
  poarta = creeazaPoartaFurnizor(),
  supabaseCredite = null, // null => calea cotei GRATUITE
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
    requireAuth: (req, _res, next) => {
      req.user = { id: USER_A, esteTester: false, esteAdmin: false };
      next();
    },
    generalLimiter: (_req, _res, next) => next(),
    aiLimiter: (_req, _res, next) => next(),
    checkAiUsageQuota: creeazaCheckAiUsageQuota({
      contor,
      supabaseAdmin: supabaseCredite,
      limitaZi: 50,
      limitaTester: 500,
    }),
    contextDate: () => ({ userId: USER_A }),
    config: { ai: { groqTextModels: ['openai/gpt-oss-120b'] } },
    registruClaim: registru,
    barcodeRepo: {
      getProdusBarcode: async () => null,
      citesteEstimareUtilizator: (ctx, cod) => depozit.citeste(ctx, cod),
      salveazaProdusOff: async () => undefined,
      salveazaEstimareUtilizator: (ctx, date) => depozit.salveaza(ctx, date),
    },
  }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    port: server.address().port,
    contor,
    registru,
    depozit,
    poarta,
    credite: supabaseCredite,
    apeluriGroq: () => fetchMock.mock.calls
      .filter(([u]) => String(u).includes('api.groq.com')).length,
    async opreste() { await new Promise((r) => server.close(r)); },
  };
}

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
  return { terminata, distruge: () => cerere.destroy() };
}

const pauza = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function panaCand(conditie, limitaMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < limitaMs) {
    if (await conditie()) return true;
    await pauza(15);
  }
  return false;
}

/** Porneste, intra la furnizor, apoi distruge socketul clientului. */
async function deconecteazaInTimpulFurnizorului(h) {
  const a = cereReal(h.port);
  expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);
  a.distruge();
  await a.terminata;
  await pauza(120);
  return a;
}

describe('P1-12 — decontarea urmeaza REZULTATUL OPERATIEI, nu socketul', () => {
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

  test('1. BLOCANT — cota GRATUITA: deconectare + operatie reusita → net consumat 1', async () => {
    h = await porneste();
    await deconecteazaInTimpulFurnizorului(h);

    h.poarta.deschide();
    expect(await panaCand(() => h.depozit.randuri.size > 0)).toBe(true);
    await pauza(150);

    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    // Aici era gaura: `res.close` restituia unitatea desi operatia a reusit.
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 20000);

  test('2. BLOCANT — CREDIT PLATIT: deconectare + operatie reusita → net consumat 1', async () => {
    h = await porneste({ supabaseCredite: creeazaSupabaseCredite() });
    await deconecteazaInTimpulFurnizorului(h);

    h.poarta.deschide();
    expect(await panaCand(() => h.depozit.randuri.size > 0)).toBe(true);
    await pauza(150);

    expect(h.credite.apeluri.consum).toHaveLength(1);
    expect(h.credite.apeluri.refund).toHaveLength(0);
    // Marcajul `ok:` este obligatoriu: fara el, reconcilierea ar restitui debitul.
    expect(h.credite.apeluri.confirm).toHaveLength(1);
  }, 20000);

  test('3. cota GRATUITA, client conectat, succes → net consumat 1', async () => {
    h = await porneste();
    h.poarta.deschide();

    const r = await cereReal(h.port).terminata;
    await pauza(150);

    expect(r.status).toBe(200);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 20000);

  test('4. CREDIT PLATIT, client conectat, succes → net consumat 1', async () => {
    h = await porneste({ supabaseCredite: creeazaSupabaseCredite() });
    h.poarta.deschide();

    const r = await cereReal(h.port).terminata;
    await pauza(150);

    expect(r.status).toBe(200);
    expect(h.credite.apeluri.consum).toHaveLength(1);
    expect(h.credite.apeluri.refund).toHaveLength(0);
    expect(h.credite.apeluri.confirm).toHaveLength(1);
  }, 20000);

  test('5. cota GRATUITA, deconectare + ESEC final de furnizor → restituit', async () => {
    h = await porneste();
    h.poarta.seteazaRezultat(() => { throw new Error('groq indisponibil'); });
    await deconecteazaInTimpulFurnizorului(h);

    h.poarta.deschide();
    expect(await panaCand(() => h.contor.decrement.mock.calls.length > 0)).toBe(true);

    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(1);
    expect(h.depozit.randuri.size).toBe(0);
  }, 20000);

  test('6. CREDIT PLATIT, deconectare + ESEC final de furnizor → restituit exact o data', async () => {
    h = await porneste({ supabaseCredite: creeazaSupabaseCredite() });
    h.poarta.seteazaRezultat(() => { throw new Error('groq indisponibil'); });
    await deconecteazaInTimpulFurnizorului(h);

    h.poarta.deschide();
    expect(await panaCand(() => h.credite.apeluri.refund.length > 0)).toBe(true);
    await pauza(150);

    expect(h.credite.apeluri.consum).toHaveLength(1);
    expect(h.credite.apeluri.refund).toHaveLength(1);
    expect(h.credite.apeluri.confirm).toHaveLength(0);
  }, 20000);

  test('7. client CONECTAT + esec final de furnizor → restituit (niciun rezultat utilizabil)', async () => {
    h = await porneste({ supabaseCredite: creeazaSupabaseCredite() });
    h.poarta.seteazaRezultat(() => { throw new Error('groq indisponibil'); });
    h.poarta.deschide();

    const r = await cereReal(h.port).terminata;
    await pauza(200);

    expect(r.status).toBe(404);
    expect(h.credite.apeluri.consum).toHaveLength(1);
    expect(h.credite.apeluri.refund).toHaveLength(1);
  }, 20000);

  test('8. deconectare + succes + reluare din cache → furnizor 1, debitare totala 1', async () => {
    h = await porneste();
    await deconecteazaInTimpulFurnizorului(h);
    h.poarta.deschide();
    expect(await panaCand(() => h.depozit.randuri.size > 0)).toBe(true);
    await pauza(150);

    const reluare = await cereReal(h.port).terminata;

    expect(reluare.status).toBe(200);
    expect(reluare.body.dinCache).toBe(true);
    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 20000);

  test('9. deconectare + succes + reluari MULTIPLE → debitarea ramane exact 1', async () => {
    h = await porneste();
    await deconecteazaInTimpulFurnizorului(h);
    h.poarta.deschide();
    expect(await panaCand(() => h.depozit.randuri.size > 0)).toBe(true);
    await pauza(150);

    for (let i = 0; i < 3; i += 1) {
      const r = await cereReal(h.port).terminata;
      expect(r.status).toBe(200);
    }

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 25000);

  test('10. duplicatul care primeste 409 nu consuma nimic', async () => {
    h = await porneste();
    const a = cereReal(h.port);
    expect(await panaCand(() => h.apeluriGroq() >= 1)).toBe(true);

    const b = cereReal(h.port);
    await pauza(300);

    // O singura debitare: duplicatul nu a trecut niciodata prin quota.
    expect(h.contor.increment).toHaveBeenCalledTimes(1);

    h.poarta.deschide();
    await Promise.all([a.terminata, b.terminata]);
    await pauza(150);

    expect(h.apeluriGroq()).toBe(1);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 20000);

  test('11. persistare ESUATA + client deconectat → niciun rezultat utilizabil → restituit', async () => {
    h = await porneste({ depozit: creeazaDepozitEstimari({ salvareEsueaza: true }) });
    await deconecteazaInTimpulFurnizorului(h);

    h.poarta.deschide();
    expect(await panaCand(() => h.contor.decrement.mock.calls.length > 0)).toBe(true);

    // Furnizorul a reusit, dar nimic nu a supravietuit si clientul nu a primit nimic.
    expect(h.depozit.randuri.size).toBe(0);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(1);
  }, 20000);

  test('12. persistare ESUATA + client CONECTAT (primeste rezultatul) → debitarea ramane', async () => {
    h = await porneste({ depozit: creeazaDepozitEstimari({ salvareEsueaza: true }) });
    h.poarta.deschide();

    const r = await cereReal(h.port).terminata;
    await pauza(200);

    // Clientul a primit un rezultat utilizabil, chiar daca nu s-a putut persista.
    expect(r.status).toBe(200);
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 20000);

  test('13. ABUZ repetat prin deconectare pe coduri diferite → fiecare generare costa 1', async () => {
    h = await porneste();
    h.poarta.seteazaIntarziere(200);
    h.poarta.deschide();

    const coduri = ['5900000000001', '5900000000002', '5900000000003'];
    for (const cod of coduri) {
      const cerere = cereReal(h.port, cod);
      // Asteptam ca cererea sa intre efectiv la furnizor, apoi taiem socketul:
      // exact tiparul de abuz „ma deconectez ca sa nu platesc".
      const inainte = h.apeluriGroq();
      expect(await panaCand(() => h.apeluriGroq() > inainte)).toBe(true);
      cerere.distruge();
      await cerere.terminata;
    }
    // Lasam operatiile sa se incheie server-side.
    expect(await panaCand(() => h.depozit.randuri.size === coduri.length, 6000)).toBe(true);
    await pauza(200);

    // Scriptul de abuz NU isi mentine consumul la zero.
    expect(h.contor.increment).toHaveBeenCalledTimes(coduri.length);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 30000);

  test('14. decontarea este SERVER-INTERNA: niciun antet de client nu o poate influenta', async () => {
    h = await porneste();
    h.poarta.deschide();

    const cerere = http.request({
      host: '127.0.0.1',
      port: h.port,
      path: `/produs-barcode/${BARCODE}`,
      method: 'GET',
      headers: {
        'X-Quota-Settlement': 'operation',
        'X-Disable-Refund': 'true',
        'X-Keep-Charge': 'false',
      },
    });
    const gata = new Promise((resolve) => {
      cerere.on('response', (res) => { res.resume(); res.on('end', resolve); });
      cerere.on('error', resolve);
    });
    cerere.end();
    await gata;
    await pauza(150);

    // Comportamentul e identic cu cel fara antete: debitare 1, fara restituire.
    expect(h.contor.increment).toHaveBeenCalledTimes(1);
    expect(h.contor.decrement).toHaveBeenCalledTimes(0);
  }, 20000);
});
