// @ts-check
'use strict';

const express = require('express');
const crypto = require('crypto');
const { callWithTimeout } = require('../utils/httpTimeout');
const { parseJsonFromLlm } = require('../utils/llmJson');
const { numarModel } = require('../services/ai/vision');
const { construiesteUrlOpenFoodFacts, EroareProprietateProdus } = require('../utils/barcode');
// Task 1: codEroare mutat în utilitarul comun (utils/codEroare.js) — aceeași
// definiție ca în storePartajat/gdpr, ca tot backendul să logheze coduri identice.
const { codEroare } = require('../utils/codEroare');
const { creeazaRegistruCheiValori } = require('../utils/storePartajat');
const metrics = require('../utils/metrics');

const GROQ_CHAT_URL = ['https:', '', 'api.groq.com', 'openai', 'v1', 'chat', 'completions'].join('/');
const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search';
const OFF_USER_AGENT = 'GetFlow/1.0.0 (https://api.nutriai.ro)';

function extrageRezultateCautareOff(payload) {
  const direct = Array.isArray(payload?.hits) ? payload.hits : null;
  if (direct) return direct.map((hit) => hit?._source || hit);

  const nested = Array.isArray(payload?.hits?.hits) ? payload.hits.hits : null;
  if (nested) return nested.map((hit) => hit?._source || hit);

  return Array.isArray(payload?.results) ? payload.results : [];
}

// P1-12 (remediere) — zălog atomic pentru fallback-ul AI de barcode.
//
// PROBLEMA: cache-ul durabil de produse previne munca duplicată DOAR după ce un
// rezultat există. Pe cache RECE, două cereri concurente ale aceluiași utilizator
// pentru același cod observă amândouă MISS înainte ca vreuna să persiste ceva:
//   A: MISS ─┐
//   B: MISS ─┴─► două apeluri Groq, două debitări
// Declanșator obișnuit (nu client ostil): timeout de rețea pe mobil + reluare, cât
// timp cererea inițială încă se execută pe server.
//
// TTL-ul se DERIVĂ din durata maximă reală a operației, nu se presupune. Cascada
// încearcă fiecare model configurat cu timeout de 18s (`callWithTimeout` mai jos),
// deci limita superioară crește dacă cineva adaugă modele în `config.ai.groqTextModels`.
// Un TTL fix de 60s ar fi expirat sub 4 modele, exact în timpul execuției — iar
// expirarea sub execuție e fereastra în care un duplicat ar porni a doua generare
// plătită. Marja acoperă persistarea și tratarea eșecului de după ultimul model.
const TIMEOUT_MODEL_MS = 18000;
const MARJA_ZALOG_MS = 15000;
const TTL_ZALOG_MINIM_MS = 60 * 1000;
function ttlZalogBarcode(numarModele) {
  const modele = Number.isInteger(numarModele) && numarModele > 0 ? numarModele : 1;
  return Math.max(TTL_ZALOG_MINIM_MS, modele * TIMEOUT_MODEL_MS + MARJA_ZALOG_MS);
}
// Așteptare MĂRGINITĂ pentru duplicate (fără busy-spin): 8 × 500ms = max 4s.
const ASTEPTARE_PASI = 8;
const ASTEPTARE_PAS_MS = 500;

const pauza = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function numarIntrare(value, max) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'boolean' || typeof value === 'object') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function createBarcodeRouter({
  requireAuth,
  generalLimiter,
  aiLimiter,
  checkAiUsageQuota,
  contextDate,
  config,
  barcodeRepo,
  // P1-12: stocul partajat de zăloguri. Aceeași infrastructură ca idempotența
  // (Redis `SET NX` prin `creeazaRegistruCheiValori`) — NU un al doilea subsistem
  // de blocare. Injectat din server.js cu prefix propriu, ca să nu se ciocnească
  // cu cheile altor tipuri de operații.
  //
  // Implicitul NU este o slăbire tăcută: construiește exact același registru
  // partajat din `REDIS_URL`, la fel ca `utils/idempotency.js`. Dacă injecția ar
  // lipsi vreodată, comportamentul în producție rămâne cel corect (Redis partajat),
  // nu unul per-proces.
  registruClaim = creeazaRegistruCheiValori({
    url: process.env.REDIS_URL,
    prefix: 'nutri:barcode-ai',
  }),
}) {
  const router = express.Router();
  const groqTextModels = config?.ai?.groqTextModels || ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'];
  // P1-12: scrierea răspunsului se sare dacă socket-ul clientului a dispărut, dar
  // NIMIC din corectitudinea server-side (persistare, finalizare, eliberare zălog)
  // nu depinde de asta — acelea rulează oricum, înainte.
  // Întoarce `true` doar dacă răspunsul chiar a putut fi scris către client.
  // Handlerul de fallback AI folosește asta ca să distingă „rezultat livrat" de
  // „client dispărut" atunci când decide decontarea.
  const raspunsBarcode = (res, { produs, sursa, estimat, dinCache }) => {
    if (res.destroyed || res.writableEnded) return false;
    res.json({
      produs,
      sursa,
      source: sursa,
      estimat: Boolean(estimat),
      dinCache: Boolean(dinCache),
    });
    return true;
  };

  /**
   * Eliberarea zălogului, deținută de OPERAȚIE. Se apelă o singură dată, din
   * `finally`-ul handlerului final, după terminarea completă a operației logice.
   * Compare-and-delete: doar proprietarul care a pus jetonul îl poate scoate.
   */
  const elibereazaZalog = async (res) => {
    const zalog = res.locals?.barcodeAi?.zalog;
    if (!zalog) return;
    res.locals.barcodeAi.zalog = null; // idempotent: nu eliberăm de două ori
    try {
      if (typeof registruClaim.delIfMatch === 'function') {
        await registruClaim.delIfMatch(zalog.cheie, zalog.token);
      } else {
        await registruClaim.del?.(zalog.cheie);
      }
    } catch (err) {
      // Eliberarea eșuată nu este o breșă: zălogul expiră la TTL, iar între timp
      // cache-ul durabil (verificat ÎNAINTEA zălogului) servește reluările.
      console.warn('[Barcode] Eliberare zalog esuata:', codEroare(err));
    }
  };

  /**
   * Cheia OPERAȚIEI LOGICE de fallback AI.
   *
   * - identitatea vine din `req.user.id` (JWT verificat), NICIODATĂ din corp/query;
   * - este hash-uită, ca id-ul brut să nu ajungă în chei/loguri Redis;
   * - codul de bare se folosește VERBATIM, ca șir validat `^[0-9]{4,20}$`. Nicio
   *   conversie numerică: „00012345" (EAN-8) și „12345" trebuie să rămână două
   *   operații distincte, altfel zerourile din față s-ar pierde;
   * - prefixul `barcode-ai:` separă spațiul de chei de celelalte operații.
   * Mărginită prin construcție: hash de 64 hex + cod de maximum 20 de cifre.
   */
  const cheieZalog = (userId, code) => {
    const identitate = crypto.createHash('sha256').update(String(userId)).digest('hex');
    return `barcode-ai:${identitate}:${code}`;
  };

  /** Citește rezultatul durabil (cache public global, apoi estimarea utilizatorului). */
  const citesteRezultatDurabil = async (ctx, code) => {
    const dinGlobal = await barcodeRepo.getProdusBarcode(ctx, code);
    if (dinGlobal) {
      return { produs: dinGlobal.produs, sursa: dinGlobal.sursa, estimat: false };
    }
    const alUtilizatorului = await barcodeRepo.citesteEstimareUtilizator(ctx, code);
    if (alUtilizatorului) {
      return { produs: alUtilizatorului.produs, sursa: 'estimare_ai', estimat: true };
    }
    return null;
  };

  /**
   * Revendicare atomică ÎNAINTE de orice muncă facturabilă.
   *
   * Ordinea în lanțul rutei este esențială și deliberată:
   *   … handler de cache (MISS) → ACEST middleware → aiLimiter → checkAiUsageQuota → Groq
   * Zălogul trebuie să preceadă ȘI quota, ȘI furnizorul. Invers (quota, apoi zălog)
   * ar lăsa duplicatele concurente să debiteze de două ori înainte de serializare.
   */
  const revendicaFallbackAi = async (req, res, next) => {
    const { code, ctx } = res.locals.barcodeAi;

    // Identitatea zălogului vine EXCLUSIV din sesiunea verificată. Fără ea nu există
    // proprietar pentru cotă/credite și nici cheie corect scopată, deci nu executăm
    // nimic facturabil — fail-closed, nu o cheie globală care ar amesteca utilizatorii.
    // În lanțul real `requireAuth` garantează prezența; aceasta este o plasă de siguranță.
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ eroare: 'Acces neautorizat. Token lipsă sau nevalidat.' });
    }
    const cheie = cheieZalog(userId, code);

    // Fail-closed: fără stoc partajat funcțional nu putem garanta at-most-once, iar
    // un apel neprotejat la furnizor înseamnă exact dubla debitare pe care o
    // prevenim. În producție `REDIS_URL` este obligatoriu (config/env.js), deci
    // aceasta este o plasă de siguranță pentru degradarea lui Redis, nu calea normală.
    if (registruClaim?.degradat) {
      return res.status(503).json({
        eroare: 'Serviciul de verificare a idempotenței este temporar indisponibil.',
        cod: 'IDEMPOTENCY_STORE_UNAVAILABLE',
      });
    }

    // Jeton unic de proprietate: doar cel care a revendicat poate elibera. Fără el,
    // eliberarea prin `del` simplu are defectul clasic de lock distribuit — un
    // proprietar vechi, întârziat peste TTL, ar șterge zălogul proprietarului NOU.
    const token = crypto.randomUUID();

    let detine = false;
    try {
      detine = await registruClaim.setIfAbsent(
        cheie,
        token,
        ttlZalogBarcode(groqTextModels.length),
      );
    } catch (err) {
      console.warn('[Barcode] Revendicare zalog esuata:', codEroare(err));
      return res.status(503).json({
        eroare: 'Serviciul de verificare a idempotenței este temporar indisponibil.',
        cod: 'IDEMPOTENCY_STORE_UNAVAILABLE',
      });
    }

    if (detine) {
      // P1-12 (a doua remediere) — zălogul NU se mai eliberează din `res.close`.
      //
      // `close` se declanșează și la deconectarea prematură a clientului, dar apelul
      // la furnizor NU este anulat de deconectare. Eliberarea acolo însemna: zălog
      // șters cât timp Groq încă rulează → o reluare imediată îl revendica din nou și
      // pornea a doua generare, cu a doua debitare. Zălogul era legat de CONEXIUNEA
      // HTTP; el aparține OPERAȚIEI LOGICE.
      //
      // Proprietatea se transmite prin starea cererii, iar eliberarea se face în
      // `finally`-ul handlerului final, DUPĂ ce furnizorul a terminat și după ce
      // persistarea/tratarea eșecului s-au încheiat. Un client dispărut nu mai poate
      // scurta durata de viață a zălogului. TTL-ul rămâne plasa de siguranță pentru
      // crash/kill/blocaj — singurele situații în care `finally` nu mai rulează.
      res.locals.barcodeAi.zalog = { cheie, token };

      // P1-12 (decontare) — această operație supraviețuiește deconectării, deci
      // socketul NU are voie să decidă facturarea. Fără acest semnal,
      // `aiUsageQuota` ar restitui unitatea la `close`, iar operația ar continua,
      // ar persista un rezultat durabil și utilizatorul l-ar primi la reluare cu
      // consum net zero — utilizare AI gratuită, deterministă.
      //
      // Semnalul este strict server-intern (`res.locals`, setat aici, după
      // autentificare). Niciun antet și niciun câmp din corp nu îl poate produce.
      res.locals.decontareAiPeOperatie = true;
      return next();
    }

    // Duplicat concurent: NU apelăm furnizorul și NU consumăm quotă/credite.
    // Așteptăm mărginit rezultatul deținătorului, apoi îl servim din stocarea durabilă.
    for (let i = 0; i < ASTEPTARE_PASI; i += 1) {
      await pauza(ASTEPTARE_PAS_MS);
      try {
        const gata = await citesteRezultatDurabil(ctx, code);
        if (gata) {
          return raspunsBarcode(res, { ...gata, dinCache: true });
        }
      } catch (err) {
        // Citire eșuată: continuăm să așteptăm. Important este că NU trecem pe calea
        // de execuție — zălogul rămâne singura autoritate asupra cine execută.
        console.warn('[Barcode] Citire in asteptarea zalogului esuata:', codEroare(err));
      }
      let inca = null;
      try {
        inca = await registruClaim.get(cheie);
      } catch {
        inca = null;
      }
      // Deținătorul a terminat fără să persiste un rezultat (eșec de furnizor).
      // Nu preluăm execuția aici: răspundem retryable, ca reluarea să fie o încercare
      // logică nouă, explicită, nu o a doua generare ascunsă în aceeași cerere.
      if (!inca) break;
    }

    res.setHeader('Retry-After', '2');
    return res.status(409).json({
      eroare: 'O estimare AI pentru acest cod de bare este deja in curs.',
      cod: 'BARCODE_AI_IN_PROGRESS',
    });
  };

  router.get('/cauta-produs', requireAuth, generalLimiter, async (req, res) => {
    const termen = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (termen.length < 2 || termen.length > 80) {
      return res.status(400).json({ eroare: 'Termenul de cautare trebuie sa aiba intre 2 si 80 de caractere.' });
    }

    try {
      const response = await callWithTimeout((signal) => fetch(OFF_SEARCH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': OFF_USER_AGENT,
        },
        body: JSON.stringify({
          q: termen,
          page: 1,
          page_size: 20,
          fields: ['code', 'product_name', 'product_name_ro', 'product_name_en', 'product_name_fr', 'product_name_de', 'brands', 'nutriments'],
          langs: ['ro', 'en', 'fr', 'de'],
        }),
        signal,
      }), 12000);

      if (!response.ok) {
        return res.status(502).json({ eroare: 'Catalogul extern nu este disponibil momentan.' });
      }

      const payload = await response.json();
      const produse = extrageRezultateCautareOff(payload).slice(0, 20);
      return res.json(produse.map((produs) => ({
        code: String(produs?.code || '').slice(0, 20),
        product_name: String(produs?.product_name || '').slice(0, 150),
        brands: String(produs?.brands || '').slice(0, 100),
        nutriments: {
          'energy-kcal_100g': numarModel(produs?.nutriments?.['energy-kcal_100g'], { max: 1000 }),
          proteins_100g: numarModel(produs?.nutriments?.proteins_100g, { max: 100 }),
          carbohydrates_100g: numarModel(produs?.nutriments?.carbohydrates_100g, { max: 100 }),
          fat_100g: numarModel(produs?.nutriments?.fat_100g, { max: 100 }),
        },
      })));
    } catch (err) {
      console.warn('[Barcode] Cautare OpenFoodFacts esuata:', codEroare(err));
      return res.status(502).json({ eroare: 'Catalogul extern nu este disponibil momentan.' });
    }
  });

  router.get('/produs-barcode/:code', requireAuth, generalLimiter, async (req, res, next) => {
    try {
      const code = (req.params.code || '').trim();
      if (!/^[0-9]{4,20}$/.test(code)) {
        return res.status(400).json({ eroare: 'Cod de bare invalid.' });
      }
      const ctx = contextDate(req, res);

      try {
        const dinGlobal = await barcodeRepo.getProdusBarcode(ctx, code);
        if (dinGlobal) {
          return raspunsBarcode(res, {
            produs: dinGlobal.produs,
            sursa: dinGlobal.sursa,
            estimat: false,
            dinCache: true,
          });
        }
        const alUtilizatorului = await barcodeRepo.citesteEstimareUtilizator(ctx, code);
        if (alUtilizatorului) {
          return raspunsBarcode(res, {
            produs: alUtilizatorului.produs,
            sursa: 'estimare_ai',
            estimat: true,
            dinCache: true,
          });
        }
      } catch (err) {
        console.warn('[Barcode] Citire cache esuata:', codEroare(err));
      }

      const resp = await callWithTimeout((signal) => fetch(construiesteUrlOpenFoodFacts(code), {
        headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
        signal,
      }), 12000);

      if (resp.ok) {
        const data = await resp.json();
        const product = data?.product;
        const statusOffValid = data?.status === 1 || data?.status === 'success' || data?.status === 'success_with_errors';
        if (statusOffValid && product) {
          const nutriments = product.nutriments || {};
          const normalized = {
            codBare: code,
            nume: String(product.product_name || product.product_name_ro || 'Produs necunoscut').substring(0, 150),
            brand: String(product.brands || '').substring(0, 100),
            cantitate: String(product.quantity || '').substring(0, 50),
            calorii: numarModel(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'], { max: 1000 }),
            proteine: numarModel(nutriments.proteins_100g, { max: 100 }),
            carbohidrati: numarModel(nutriments.carbohydrates_100g, { max: 100 }),
            grasimi: numarModel(nutriments.fat_100g, { max: 100 }),
            // Ambele aliasuri raman intentionat pentru compatibilitatea clientilor
            // existenti; au aceeasi sursa si nu introduc calcule divergente.
            aminoacizi_100g: nutriments,
            micronutrienti_100g: nutriments,
            imagine_url: product.image_front_small_url || product.image_url || null,
          };
          try {
            await barcodeRepo.salveazaProdusOff(ctx, {
              cod: code,
              produs: normalized,
              payload: product,
            });
          } catch (err) {
            console.warn('[Barcode] Salvare OpenFoodFacts esuata:', codEroare(err));
          }
          return raspunsBarcode(res, {
            produs: normalized,
            sursa: 'openfoodfacts',
            estimat: false,
            dinCache: false,
          });
        }
      }

      const groqApiKey = process.env.GROQ_API_KEY?.trim();
      if (!groqApiKey || groqTextModels.length === 0) {
        return res.status(404).json({
          eroare: 'Produsul nu a fost gasit.',
          allowManualEntry: true,
          suggestedAction: 'manual_or_ai_text',
        });
      }

      // Lookup-urile locale/OFF sunt gratuite. Numai miss-ul care urmeaza sa
      // invoce Groq avanseaza la limitatorul si quota canonica AI de mai jos.
      res.locals.barcodeAi = { code, ctx, groqApiKey };
      return next();
    } catch (err) {
      console.error('[Barcode] Interogare esuata:', codEroare(err));
      return res.status(500).json({ eroare: 'Eroare la interogarea codului de bare.' });
    }
    // P1-12: zălogul atomic se interpune ÎNAINTE de aiLimiter/checkAiUsageQuota,
    // deci înainte de orice debitare și înainte de orice apel la furnizor.
  }, revendicaFallbackAi, aiLimiter, checkAiUsageQuota, async (_req, res) => {
    const { code, ctx, groqApiKey } = res.locals.barcodeAi;
    const aiPrompt = `Utilizatorul din Romania a scanat codul de bare EAN/UPC "${code}" dar produsul nu a fost gasit. Daca il cunosti cu certitudine, returneaza date reale; altfel returneaza un profil generic marcat ca estimare. Returneaza strict JSON cu codBare, nume, brand, cantitate, calorii, proteine, carbohidrati si grasimi.`;

    // P1-12 (decontare) — „rezultat utilizabil" = utilizatorul chiar a obținut ceva:
    // fie persistat durabil (îl va primi la reluare), fie livrat pe conexiune.
    // Doar asta justifică păstrarea debitării; altfel operația se restituie.
    let rezultatUtilizabil = false;

    // P1-12 (a doua remediere) — OPERAȚIA LOGICĂ, delimitată explicit.
    // `finally` garantează că zălogul se eliberează DUPĂ ce bucla de furnizori s-a
    // încheiat și după persistare/tratarea eșecului — niciodată la deconectarea
    // clientului. Un `return` din interior trece tot prin `finally`.
    try {
      for (const modelName of groqTextModels) {
        try {
          const aiResp = await callWithTimeout((signal) => fetch(GROQ_CHAT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages: [{ role: 'user', content: aiPrompt }],
              temperature: 0.1,
              max_tokens: 400,
              response_format: { type: 'json_object' },
            }),
            signal,
          }), 18000);

          if (!aiResp.ok) {
            metrics.inregistreazaAi({ provider: 'groq', model: modelName, ruta: 'barcode-estimate', ok: false });
            continue;
          }

          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content;
          const parsed = /** @type {Record<string, unknown> | null} */ (
            content ? parseJsonFromLlm(content, { asteapta: 'obiect' }) : null
          );
          if (parsed && typeof parsed === 'object' && parsed.nume) {
            metrics.inregistreazaAi({
              provider: 'groq',
              model: modelName,
              ruta: 'barcode-estimate',
              usage: aiData.usage,
              ok: true,
            });

            const normalizedAi = {
              codBare: code,
              nume: String(parsed.nume).substring(0, 150),
              brand: String(parsed.brand || 'AI Estimat').substring(0, 100),
              cantitate: String(parsed.cantitate || '100g').substring(0, 50),
              calorii: numarModel(parsed.calorii, { max: 1000 }),
              proteine: numarModel(parsed.proteine, { max: 100 }),
              carbohidrati: numarModel(parsed.carbohidrati, { max: 100 }),
              grasimi: numarModel(parsed.grasimi, { max: 100 }),
            };
            try {
              await barcodeRepo.salveazaEstimareUtilizator(ctx, {
                cod: code,
                produs: normalizedAi,
              });
              rezultatUtilizabil = true;
            } catch (err) {
              console.warn('[Barcode] Salvare estimare esuata:', codEroare(err));
            }
            // Chiar dacă persistarea a eșuat, un client conectat primește rezultatul
            // — tot un rezultat utilizabil, deci debitarea rămâne. Dacă și persistarea
            // a eșuat, ȘI clientul a dispărut, nu există nimic de plătit.
            const livrat = raspunsBarcode(res, {
              produs: normalizedAi,
              sursa: 'estimare_ai',
              estimat: true,
              dinCache: false,
            });
            if (livrat) rezultatUtilizabil = true;
            return livrat;
          }
          metrics.inregistreazaAi({ provider: 'groq', model: modelName, ruta: 'barcode-estimate', ok: false });
        } catch (err) {
          metrics.inregistreazaAi({ provider: 'groq', model: modelName, ruta: 'barcode-estimate', ok: false });
          console.warn(`[Barcode] Estimare AI esuata pe modelul ${modelName}:`, codEroare(err));
        }
      }

      if (res.destroyed || res.writableEnded) return undefined;
      return res.status(404).json({
        eroare: 'Produsul nu a fost gasit.',
        allowManualEntry: true,
        suggestedAction: 'manual_or_ai_text',
      });
    } finally {
      // P1-12 (decontare) — autoritatea este REZULTATUL operației, nu socketul.
      // `aiUsageQuota` nu mai decontează pe `close`/`finish` pentru această rută
      // (vezi `decontareAiPeOperatie`), deci aici se decide definitiv:
      //   rezultat utilizabil → consumul rămâne (marcaj `ok:` pentru reconciliere);
      //   niciun rezultat      → restituire, exact o dată.
      const decontare = res.locals?.decontareAi;
      if (decontare) {
        if (rezultatUtilizabil) decontare.confirma();
        else decontare.restituie();
      }
      // Abia după decontare eliberăm zălogul.
      await elibereazaZalog(res);
    }
  });

  router.post('/salveaza-produs-barcode', requireAuth, generalLimiter, async (req, res) => {
    try {
      const { code, name, brand, quantity, kcal_100g, protein_100g, carbs_100g, fat_100g } = req.body;
      if (!code || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ eroare: 'Codul si numele produsului sunt obligatorii.' });
      }
      const codeCurat = String(code).trim();
      if (!/^[0-9]{4,20}$/.test(codeCurat)) {
        return res.status(400).json({ eroare: 'Cod de bare malformat.' });
      }

      const kc = numarIntrare(kcal_100g, 1000);
      const p = numarIntrare(protein_100g, 100);
      const c = numarIntrare(carbs_100g, 100);
      const f = numarIntrare(fat_100g, 100);
      if ([kc, p, c, f].some((value) => value === null)) {
        return res.status(400).json({ eroare: 'Valori nutritionale invalide sau imposibile fizic.' });
      }
      if (p + c + f > 100) {
        return res.status(400).json({ eroare: 'Suma macro-nutrientilor depaseste 100g per 100g.' });
      }

      const ctx = contextDate(req, res);
      const salvare = await barcodeRepo.salveazaProdusBarcode(ctx, {
        code: codeCurat,
        valori: {
          name: name.trim().substring(0, 150),
          brand: typeof brand === 'string' ? brand.trim().substring(0, 100) : '',
          quantity: typeof quantity === 'string' ? quantity.trim().substring(0, 50) : '',
          kcal_100g: kc,
          protein_100g: p,
          carbs_100g: c,
          fat_100g: f,
        },
      });
      if (!salvare.permis) {
        return res.status(salvare.status).json({ eroare: salvare.motiv });
      }
      return res.json({ succes: true, message: 'Produs salvat in cache-ul local.' });
    } catch (err) {
      if (err instanceof EroareProprietateProdus) {
        return res.status(err.status).json({ eroare: err.motiv });
      }
      console.error('[Barcode] Salvare esuata:', codEroare(err));
      return res.status(500).json({ eroare: 'Eroare la salvarea produsului.' });
    }
  });

  return router;
}

createBarcodeRouter.numarIntrare = numarIntrare;
module.exports = createBarcodeRouter;
