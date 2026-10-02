'use strict';

/**
 * P1-12 — Replay / idempotenta logica / dubla debitare pe rutele AI.
 *
 * ==========================================================================
 * DE CE EXISTA ACEST TEST
 * ==========================================================================
 * Infrastructura de idempotenta (utils/idempotency.js) era deja corecta CAND
 * clientul trimite `Idempotency-Key`. Gaura reala descoperita la P1-12 este ca
 * antetul lipseste pe majoritatea rutelor AI: middleware-ul facea `return next()`
 * tacut, deci cel mai scump apel din aplicatie (analiza foto) nu avea NICIO
 * protectie la replay.
 *
 * Testele de mai jos numara APELURILE REALE catre furnizor si mutatiile de cota,
 * nu siruri din sursa. „Operatia logica" = (utilizator, ruta, payload), nu
 * identitatea de transport a cererii HTTP.
 */

const express = require('express');
const fs = require('fs');
const request = require('supertest');
const { creeazaMiddlewareIdempotenta } = require('../utils/idempotency');

// Handler-ul de analiza foto citeste fisierul temporar salvat de multer. Testele
// nu scriu pe disc: interceptam citirea si stergerea, restul caii ramane reala.
beforeAll(() => {
  jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('imagine-falsa'));
  jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
});
afterAll(() => jest.restoreAllMocks());

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

/** Registru K/V in-memory cu semantica atomica setIfAbsent (ca Redis SET NX). */
function creeazaRegistruFals() {
  const stocare = new Map();
  return {
    stocare,
    degradat: false,
    partajat: true,
    async get(k) { return stocare.get(k) || null; },
    async set(k, v) { stocare.set(k, v); },
    async setIfAbsent(k, v) {
      if (stocare.has(k)) return false;
      stocare.set(k, v);
      return true;
    },
    async del(k) { stocare.delete(k); },
  };
}

/**
 * Construieste routerul AI real cu furnizori instrumentati.
 * `apeluriFurnizor` numara invocarile efective ale modelului.
 */
function construiesteApp({ userId = USER_A, tasks = null, registru: registruInjectat = null } = {}) {
  const apeluriFurnizor = { chat: 0, text: 0, vision: 0, profil: 0 };
  const mutatiiCota = { consum: 0 };
  const registru = registruInjectat || creeazaRegistruFals();

  const middlewareCritic = creeazaMiddlewareIdempotenta({
    registru,
    rutaCritica: true,
    permiteMultipart: true,
  });

  const createAiRouter = require('../routes/ai');
  const app = express();
  app.use(express.json());

  const aiRouter = createAiRouter({
    requireAuth: (req, _res, next) => { req.user = { id: userId }; next(); },
    aiLimiter: (_req, _res, next) => next(),
    generalLimiter: (_req, _res, next) => next(),
    upload: {
      single: () => (req, _res, next) => {
        req.file = { path: 'dummy.jpg', mimetype: 'image/jpeg' };
        next();
      },
    },
    // Instrumentam consumul de cota: orice trecere prin acest middleware
    // reprezinta o debitare (credit platit sau cota gratuita).
    checkAiUsageQuota: (_req, _res, next) => { mutatiiCota.consum += 1; next(); },
    imagekit: null,
    tasks,
    config: {
      imagekit: { urlEndpoint: 'https://ik.imagekit.io/test' },
      supabase: { url: 'https://test.supabase.co' },
      triggerSecretKey: tasks ? 'tr_test_cheie' : null,
      ai: { geminiApiKey: 'test' },
    },
    serviciuVision: { detectImageMime: () => 'image/jpeg' },
    serviciuCascada: {
      ruleazaCascadaVision: async () => {
        apeluriFurnizor.vision += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { text: JSON.stringify([{ nume: 'Mar', estimare_grame: 150 }]) };
      },
      getProviderStatus: async () => ({ status: 'ok' }),
    },
    serviciuChat: {
      ruleazaChat: async () => {
        apeluriFurnizor.chat += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { raspuns: 'OK Chat' };
      },
      estimeazaMancareText: async () => {
        apeluriFurnizor.text += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { nume: 'Mar', calorii: 52 };
      },
      profilNutritiv: async () => {
        apeluriFurnizor.profil += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { calorii_per_100g: 52 };
      },
      logFoodDinChat: async () => {
        apeluriFurnizor.chat += 1;
        return { propunere: 'x' };
      },
    },
    semaforAi: { ruleaza: async (fn) => fn() },
    idempotencyCritic: middlewareCritic,
    supabaseAdmin: null,
  });

  app.use('/api/v1', aiRouter);
  return { app, apeluriFurnizor, mutatiiCota, registru };
}

describe('P1-12 — replay FARA Idempotency-Key (clientii deja lansati)', () => {
  test('1. replay secvential identic pe /estimeaza-mancare-text → UN singur apel la furnizor', async () => {
    const { app, apeluriFurnizor } = construiesteApp();
    const corp = { text: '100g piept de pui' };

    const r1 = await request(app).post('/api/v1/estimeaza-mancare-text').send(corp);
    const r2 = await request(app).post('/api/v1/estimeaza-mancare-text').send(corp);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(apeluriFurnizor.text).toBe(1);
  });

  test('2. replay secvential fara cheie → cota NU se consuma a doua oara', async () => {
    const { app, mutatiiCota } = construiesteApp();
    const corp = { text: '100g orez' };

    await request(app).post('/api/v1/estimeaza-mancare-text').send(corp);
    await request(app).post('/api/v1/estimeaza-mancare-text').send(corp);

    expect(mutatiiCota.consum).toBe(1);
  });

  test('3. duplicat CONCURENT fara cheie (dublu tap) → UN singur apel la furnizor', async () => {
    const { app, apeluriFurnizor } = construiesteApp();
    const corp = { mesaj: 'Ce am mancat azi?', mesaje: [] };

    const [r1, r2] = await Promise.all([
      request(app).post('/api/v1/chat').send(corp),
      request(app).post('/api/v1/chat').send(corp),
    ]);

    expect(apeluriFurnizor.chat).toBe(1);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  test('4. payload DIFERIT fara cheie → se executa normal (nu e acelasi logic op)', async () => {
    const { app, apeluriFurnizor } = construiesteApp();

    await request(app).post('/api/v1/estimeaza-mancare-text').send({ text: 'mar' });
    await request(app).post('/api/v1/estimeaza-mancare-text').send({ text: 'para' });

    expect(apeluriFurnizor.text).toBe(2);
  });

  test('5. acelasi payload, utilizatori DIFERITI → izolare (fiecare isi executa operatia)', async () => {
    const corp = { text: '100g somon' };
    const a = construiesteApp({ userId: USER_A });
    const b = construiesteApp({ userId: USER_B });

    await request(a.app).post('/api/v1/estimeaza-mancare-text').send(corp);
    await request(b.app).post('/api/v1/estimeaza-mancare-text').send(corp);

    expect(a.apeluriFurnizor.text).toBe(1);
    expect(b.apeluriFurnizor.text).toBe(1);
  });

  test('6. cheia derivata expira mai repede decat cea explicita (repetare deliberata ramane posibila)', () => {
    const { TTL_DERIVAT_MS, TTL_MS } = require('../utils/idempotency');
    expect(TTL_DERIVAT_MS).toBeLessThan(TTL_MS);
  });
});

describe('P1-12 — multipart: amprenta trebuie sa reflecte continutul imaginii', () => {
  test('7. aceeasi cheie + imagine DIFERITA → 409, nu replay tacut al primei analize', async () => {
    const { app } = construiesteApp();
    const cheie = 'foto-logic-op-001';

    const r1 = await request(app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .set('Idempotency-Key', cheie)
      .set('X-Payload-Fingerprint', 'a'.repeat(64))
      .attach('imagine', Buffer.from('poza-1'), 'a.jpg');

    const r2 = await request(app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .set('Idempotency-Key', cheie)
      .set('X-Payload-Fingerprint', 'b'.repeat(64))
      .attach('imagine', Buffer.from('poza-2'), 'b.jpg');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(409);
    expect(r2.body.cod).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  test('8. aceeasi cheie + aceeasi imagine → replay, UN singur apel vision', async () => {
    const { app, apeluriFurnizor } = construiesteApp();
    const cheie = 'foto-logic-op-002';
    const amprenta = 'c'.repeat(64);

    const r1 = await request(app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .set('Idempotency-Key', cheie)
      .set('X-Payload-Fingerprint', amprenta)
      .attach('imagine', Buffer.from('poza-3'), 'c.jpg');
    const r2 = await request(app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .set('Idempotency-Key', cheie)
      .set('X-Payload-Fingerprint', amprenta)
      .attach('imagine', Buffer.from('poza-3'), 'c.jpg');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(apeluriFurnizor.vision).toBe(1);
  });

  test('9. amprenta malformata este respinsa, nu acceptata tacut', async () => {
    const { app } = construiesteApp();
    const r = await request(app)
      .post('/api/v1/analizeaza-mancare-structurat')
      .set('Idempotency-Key', 'foto-logic-op-003')
      .set('X-Payload-Fingerprint', 'nu-e-hex')
      .attach('imagine', Buffer.from('poza-4'), 'd.jpg');

    expect(r.status).toBe(400);
  });
});

describe('P1-12 — Trigger.dev: retry-ul workerului nu trebuie sa dubleze analiza', () => {
  test('10. tasks.trigger primeste un idempotencyKey stabil, derivat din operatia logica', async () => {
    const apeluri = [];
    const tasks = {
      trigger: async (id, payload, optiuni) => {
        apeluri.push({ id, payload, optiuni });
        return { id: 'run_1' };
      },
    };
    const { app } = construiesteApp({ tasks });

    const imageUrl = `https://ik.imagekit.io/test/mancare/${USER_A}/poza.jpg`;
    await request(app)
      .post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'trigger-op-001')
      .send({ imageUrl, tipMasa: 'Pranz' });

    expect(apeluri).toHaveLength(1);
    expect(typeof apeluri[0].optiuni?.idempotencyKey).toBe('string');
    expect(apeluri[0].optiuni.idempotencyKey.length).toBeGreaterThan(0);
  });

  test('11. acelasi utilizator + aceeasi imagine → acelasi idempotencyKey Trigger', async () => {
    const chei = [];
    const tasks = {
      trigger: async (_id, _payload, optiuni) => {
        chei.push(optiuni?.idempotencyKey);
        return { id: 'run_x' };
      },
    };
    const imageUrl = `https://ik.imagekit.io/test/mancare/${USER_A}/aceeasi.jpg`;

    // Doua cereri HTTP distincte (chei de transport diferite), aceeasi operatie logica.
    const a = construiesteApp({ tasks });
    await request(a.app).post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'transport-1').send({ imageUrl, tipMasa: 'Pranz' });
    const b = construiesteApp({ tasks });
    await request(b.app).post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'transport-2').send({ imageUrl, tipMasa: 'Pranz' });

    expect(chei).toHaveLength(2);
    expect(typeof chei[0]).toBe('string');
    expect(chei[0]).toBe(chei[1]);
  });

  test('12. utilizatori diferiti pe aceeasi imagine → chei Trigger DIFERITE (izolare)', async () => {
    const chei = [];
    const tasks = {
      trigger: async (_id, _payload, optiuni) => {
        chei.push(optiuni?.idempotencyKey);
        return { id: 'run_y' };
      },
    };
    const a = construiesteApp({ tasks, userId: USER_A });
    await request(a.app).post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'k').send({
        imageUrl: `https://ik.imagekit.io/test/mancare/${USER_A}/p.jpg`, tipMasa: 'Pranz',
      });
    const b = construiesteApp({ tasks, userId: USER_B });
    await request(b.app).post('/api/v1/trigger-analiza-mancare')
      .set('Idempotency-Key', 'k').send({
        imageUrl: `https://ik.imagekit.io/test/mancare/${USER_B}/p.jpg`, tipMasa: 'Pranz',
      });

    expect(chei[0]).not.toBe(chei[1]);
  });
});

describe('P1-12 — izolare intre conturi pe un registru PARTAJAT (cazul real Redis)', () => {
  test('13. aceeasi cheie, utilizatori diferiti → fara scurgere de rezultat, ambii executa', async () => {
    // Registru comun = exact situatia din productie (un singur Redis pentru toate
    // instantele). Daca namespace-ul pe utilizator ar lipsi, B ar primi raspunsul lui A.
    const registru = creeazaRegistruFals();
    const a = construiesteApp({ userId: USER_A, registru });
    const b = construiesteApp({ userId: USER_B, registru });
    const cheie = 'cheie-ghicita-de-atacator';
    const corp = { text: '100g tofu' };

    const rA = await request(a.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', cheie).send(corp);
    const rB = await request(b.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', cheie).send(corp);

    expect(rA.status).toBe(200);
    expect(rB.status).toBe(200);
    // Fiecare si-a executat PROPRIA operatie: B nu a primit un replay al lui A.
    expect(a.apeluriFurnizor.text).toBe(1);
    expect(b.apeluriFurnizor.text).toBe(1);
    expect(rB.headers['idempotency-status']).toBeUndefined();
  });

  test('14. cheile celor doi utilizatori nu se suprapun in stocarea partajata', async () => {
    const registru = creeazaRegistruFals();
    const a = construiesteApp({ userId: USER_A, registru });
    const b = construiesteApp({ userId: USER_B, registru });
    const corp = { text: '100g linte' };

    await request(a.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', 'aceeasi').send(corp);
    await request(b.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', 'aceeasi').send(corp);

    expect(registru.stocare.size).toBe(2);
  });
});

describe('P1-12 — concurenta reala: 10 cereri simultane, o singura executie', () => {
  test('15. 10 duplicate concurente cu aceeasi cheie → 1 apel furnizor, 1 debitare', async () => {
    const { app, apeluriFurnizor, mutatiiCota } = construiesteApp();
    const cheie = 'incarcare-concurenta-001';
    const corp = { mesaj: 'Cate calorii am azi?', mesaje: [] };

    const raspunsuri = await Promise.all(
      Array.from({ length: 10 }, () => request(app).post('/api/v1/chat')
        .set('Idempotency-Key', cheie).send(corp)),
    );

    expect(apeluriFurnizor.chat).toBe(1);
    expect(mutatiiCota.consum).toBe(1);

    const reusite = raspunsuri.filter((r) => r.status === 200);
    const inCurs = raspunsuri.filter((r) => r.status === 409);
    expect(reusite).toHaveLength(1);
    expect(inCurs).toHaveLength(9);
    for (const r of inCurs) expect(r.body.cod).toBe('IDEMPOTENCY_IN_PROGRESS');
  });

  test('16. 10 duplicate concurente FARA cheie (dublu tap repetat) → tot 1 apel furnizor', async () => {
    const { app, apeluriFurnizor, mutatiiCota } = construiesteApp();
    const corp = { text: '200g cartofi' };

    await Promise.all(
      Array.from({ length: 10 }, () => request(app)
        .post('/api/v1/estimeaza-mancare-text').send(corp)),
    );

    expect(apeluriFurnizor.text).toBe(1);
    expect(mutatiiCota.consum).toBe(1);
  });
});

describe('P1-12 — chei invalide: respinse explicit, nu ignorate tacut', () => {
  test('17. cheie mai lunga de 200 de caractere → 400', async () => {
    const { app, apeluriFurnizor } = construiesteApp();
    const r = await request(app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', 'k'.repeat(201)).send({ text: 'mar' });

    expect(r.status).toBe(400);
    expect(apeluriFurnizor.text).toBe(0);
  });

  // Caracterele de control sunt respinse de clientul HTTP al Node-ului si nu
  // ajung niciodata la server; forma testabila la nivel de aplicatie e un
  // caracter permis in HTTP dar in afara gramaticii cheii (spatiu).
  test('18. cheie cu spatiu → 400, fara apel la furnizor', async () => {
    const { app, apeluriFurnizor } = construiesteApp();
    const r = await request(app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', 'cheie invalida').send({ text: 'mar' });

    expect(r.status).toBe(400);
    expect(apeluriFurnizor.text).toBe(0);
  });

  test('19. amprenta de continut prea scurta → 400 (nu se accepta un hash slab)', async () => {
    const { app, apeluriFurnizor } = construiesteApp();
    const r = await request(app).post('/api/v1/estimeaza-mancare-text')
      .set('X-Payload-Fingerprint', 'abcd').send({ text: 'mar' });

    expect(r.status).toBe(400);
    expect(r.body.cod).toBe('AMPRENTA_INVALIDA');
    expect(apeluriFurnizor.text).toBe(0);
  });
});

describe('P1-12 — starea traieste in stocul partajat, nu in procesul Node', () => {
  test('20. dupa "repornirea serverului" (proces nou, acelasi Redis) replay-ul se pastreaza', async () => {
    const registru = creeazaRegistruFals();
    const cheie = 'op-inainte-de-repornire';
    const corp = { text: '150g quinoa' };

    // Procesul 1 executa operatia.
    const inainte = construiesteApp({ registru });
    const r1 = await request(inainte.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', cheie).send(corp);
    expect(r1.status).toBe(200);
    expect(inainte.apeluriFurnizor.text).toBe(1);

    // Procesul 2: instanta complet noua de app + middleware (memoria procesului s-a
    // pierdut), dar acelasi registru partajat. Daca idempotenta ar fi tinuta intr-un
    // Map per-proces, aici s-ar reapela furnizorul si s-ar debita din nou.
    const dupa = construiesteApp({ registru });
    const r2 = await request(dupa.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', cheie).send(corp);

    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(r2.headers['idempotency-status']).toBe('replayed');
    expect(dupa.apeluriFurnizor.text).toBe(0);
    expect(dupa.mutatiiCota.consum).toBe(0);
  });
});

describe('P1-12 — esec de furnizor: retry-ul nu debiteaza a doua oara', () => {
  function appCuFurnizorCazut(registru) {
    const apeluri = { text: 0 };
    const mutatiiCota = { consum: 0 };
    const middlewareCritic = creeazaMiddlewareIdempotenta({
      registru, rutaCritica: true, permiteMultipart: true,
    });
    const createAiRouter = require('../routes/ai');
    const app = express();
    app.use(express.json());
    app.use('/api/v1', createAiRouter({
      requireAuth: (req, _res, next) => { req.user = { id: USER_A }; next(); },
      aiLimiter: (_req, _res, next) => next(),
      generalLimiter: (_req, _res, next) => next(),
      upload: { single: () => (_req, _res, next) => next() },
      checkAiUsageQuota: (_req, _res, next) => { mutatiiCota.consum += 1; next(); },
      imagekit: null,
      tasks: null,
      config: {
        imagekit: { urlEndpoint: 'https://ik.imagekit.io/test' },
        supabase: { url: 'https://test.supabase.co' },
        ai: {},
      },
      serviciuVision: { detectImageMime: () => 'image/jpeg' },
      serviciuCascada: {},
      serviciuChat: {
        estimeazaMancareText: async () => {
          apeluri.text += 1;
          throw new Error('furnizor indisponibil');
        },
      },
      semaforAi: { ruleaza: async (fn) => fn() },
      idempotencyCritic: middlewareCritic,
    }));
    return { app, apeluri, mutatiiCota };
  }

  test('21. 5xx de la furnizor + retry cu aceeasi cheie → esecul se reia, furnizorul NU se reapeleaza', async () => {
    const registru = creeazaRegistruFals();
    const cheie = 'op-esuata-001';
    const corp = { text: '100g nuci' };

    const unu = appCuFurnizorCazut(registru);
    const r1 = await request(unu.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', cheie).send(corp);
    expect(r1.status).toBe(500);
    expect(unu.apeluri.text).toBe(1);

    const doi = appCuFurnizorCazut(registru);
    const r2 = await request(doi.app).post('/api/v1/estimeaza-mancare-text')
      .set('Idempotency-Key', cheie).send(corp);

    expect(r2.status).toBe(500);
    expect(r2.headers['idempotency-status']).toBe('replayed');
    // Esential: nicio a doua generare si nicio a doua debitare pentru acelasi esec.
    expect(doi.apeluri.text).toBe(0);
    expect(doi.mutatiiCota.consum).toBe(0);
  });
});
