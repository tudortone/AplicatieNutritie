// @ts-check
'use strict';

const express = require('express');
const router = express.Router();

/**
 * B-17: tipurile nutritionale au o singura sursa de adevar — contractul partajat
 * backend-nutritie-ai/contracts/nutritie/types.ts. Referentiat aici prin JSDoc,
 * fara import runtime (CommonJS). Forma emisa de ruta (produs de barcode) NU este
 * AlimentAI — typedef-ul de mai jos leaga contractul, nu forteaza un tip gresit.
 * @typedef {import('../contracts/nutritie/types').AlimentAI} AlimentAI
 */

const { callWithTimeout } = require('../utils/httpTimeout');
const { parseJsonFromLlm } = require('../utils/llmJson');
const { numarModel } = require('../services/ai/vision');
const { construiesteUrlOpenFoodFacts, EroareProprietateProdus } = require('../utils/barcode');

/**
 * Rute de cod de bare (GET /api/produs-barcode/:code, POST /api/salveaza-produs-barcode).
 *
 * Contract unic de raspuns pentru toate ramurile de succes:
 *   { produs, sursa, source (alias legacy), estimat, dinCache }
 * Inainte, aceeasi ruta intorcea trei forme diferite, cu cheia sursei alternand
 * intre `sursa` si `source` - clientul trebuia sa ghiceasca.
 */
function createBarcodeRouter({ requireAuth, generalLimiter, contextDate, barcodeRepo }) {
  const raspunsBarcode = (res, { produs, sursa, estimat, dinCache }) =>
    res.json({
      produs,
      sursa,
      source: sursa,
      estimat: Boolean(estimat),
      dinCache: Boolean(dinCache),
    });

  // ==========================================
  // RUTA 2.1: PROXY OPENFOODFACTS + CACHE + FALLBACK AI
  // ==========================================
  router.get('/produs-barcode/:code', requireAuth, generalLimiter, async (req, res) => {
    try {
      const code = (req.params.code || '').trim();
      if (!/^[0-9]{4,20}$/.test(code)) {
        return res.status(400).json({ eroare: 'Cod de bare invalid.' });
      }

      const ctx = contextDate(req, res);

      // STRAT 1: cache global (surse verificate) + estimarile AI per utilizator (C2).
      try {
        // `barcode_cache` este backend-only prin proiectare (politica `using (false)`);
        // repo-ul il citeste prin clientul admin — singura cale corecta.
        const dinGlobal = await barcodeRepo.getProdusBarcode(ctx, code);
        if (dinGlobal) {
          return raspunsBarcode(res, {
            produs: dinGlobal.produs,
            sursa: dinGlobal.sursa,
            estimat: false,
            dinCache: true,
          });
        }

        // Estimarile sunt date ale utilizatorului: repo-ul le citeste prin clientul cu RLS.
        const alUtilizatorului = await barcodeRepo.citesteEstimareUtilizator(ctx, code);
        if (alUtilizatorului) {
          return raspunsBarcode(res, {
            produs: alUtilizatorului.produs,
            sursa: 'estimare_ai',
            estimat: true,
            dinCache: true,
          });
        }
      } catch (cacheErr) {
        console.warn('Avertisment citire barcode_cache:', cacheErr.message);
      }

      // STRAT 2: OpenFoodFacts (C7: URL construit prin helper validat)
      const resp = await callWithTimeout((signal) => fetch(construiesteUrlOpenFoodFacts(code), {
        headers: { 'User-Agent': 'NutriAI - React Native App' },
        signal,
      }), 12000);

      if (resp.ok) {
        const data = await resp.json();
        const product = data?.product;
        if (data?.status === 1 && product) {
          const nutriments = product.nutriments || {};
          const normalized = {
            codBare: code,
            nume: product.product_name || product.product_name_ro || 'Produs necunoscut',
            brand: product.brands || '',
            cantitate: product.quantity || '',
            calorii: numarModel(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'], { max: 1000 }),
            proteine: numarModel(nutriments.proteins_100g, { max: 100 }),
            carbohidrati: numarModel(nutriments.carbohydrates_100g, { max: 100 }),
            grasimi: numarModel(nutriments.fat_100g, { max: 100 }),
            // TODO(datorie): cele doua chei de mai jos contin acelasi obiect si sunt
            // pastrate doar pentru compatibilitate cu clientul actual. De eliminat
            // dupa migrarea frontend-ului la un camp unic `nutrimente_100g`.
            aminoacizi_100g: nutriments,
            micronutrienti_100g: nutriments,
            imagine_url: product.image_front_small_url || product.image_url || null,
          };

          try {
            await barcodeRepo.salveazaProdusOff(ctx, { cod: code, produs: normalized, payload: product });
          } catch (saveErr) {
            console.warn('Nu s-a putut salva in barcode_cache:', saveErr.message);
          }

          return raspunsBarcode(res, {
            produs: normalized,
            sursa: 'openfoodfacts',
            estimat: false,
            dinCache: false,
          });
        }
      }

      // STRAT 3: estimare AI.
      // ATENTIE: valorile de aici sunt GENERATE, nu masurate. Sunt marcate
      // `estimat: true` si salvate strict per utilizator; clientul are obligatia
      // sa le afiseze ca estimari, nu ca date verificate.
      try {
        console.warn(`Barcode ${code} negasit in cache sau OpenFoodFacts, activam estimare AI...`);
        const aiPrompt = `Utilizatorul din Romania a scanat codul de bare EAN/UPC "${code}" dar nu a fost gasit in baza internationala.
Daca cunosti cu certitudine acest cod de bare si produsul asociat, returneaza detaliile reale.
Daca NU cunosti produsul, returneaza un profil generic marcat clar ca estimare (ex. Nume: "Produs alimentar ambalat (${code})").
RETURNEAZA STRICT EXCLUSIV UN OBIECT JSON valid in acest format:
{
  "codBare": "${code}",
  "nume": "Numele produsului (sau Produs alimentar ambalat)",
  "brand": "Brand recunoscut sau Estimat",
  "cantitate": "100g",
  "calorii": 250,
  "proteine": 10,
  "carbohidrati": 30,
  "grasimi": 10
}`;

        const aiResp = await callWithTimeout((signal) => fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: aiPrompt }],
            temperature: 0.1,
            max_tokens: 400,
            response_format: { type: 'json_object' },
          }),
          signal,
        }), 18000);

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content;
          // parsed e JSON nevalidat emis de LLM (B-17): tipat Record<string, unknown>,
          // nu un tip precis pe output-ul unui model. @ts-check accepta accesele, iar
          // normalizeazaMaiJos face toti pasii de siguranta (String/numarModel).
          const parsed = /** @type {Record<string, unknown>} */ (
            content ? parseJsonFromLlm(content, { asteapta: 'obiect' }) : null
          );

          if (parsed && parsed.nume) {
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
            } catch (sErr) {
              console.warn('Nu s-a putut salva estimarea per utilizator:', sErr.message);
            }

            return raspunsBarcode(res, {
              produs: normalizedAi,
              sursa: 'estimare_ai',
              estimat: true,
              dinCache: false,
            });
          }
        }
      } catch (aiErr) {
        console.warn('Eroare la estimarea AI a codului de bare:', aiErr.message);
      }

      return res.status(404).json({
        eroare: 'Produsul nu a fost gasit.',
        allowManualEntry: true,
        suggestedAction: 'manual_or_ai_text',
      });
    } catch (err) {
      console.error('Eroare interogare barcode OpenFoodFacts proxy:', err.message);
      return res.status(500).json({ eroare: 'Eroare la interogarea codului de bare.' });
    }
  });

  // ==========================================
  // RUTA 2.2: SALVARE PRODUS BARCODE COMPLETAT MANUAL
  // ==========================================
  router.post('/salveaza-produs-barcode', requireAuth, generalLimiter, async (req, res) => {
    try {
      const { code, name, brand, quantity, kcal_100g, protein_100g, carbs_100g, fat_100g } = req.body;
      if (!code || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ eroare: 'Codul si numele produsului sunt obligatorii.' });
      }

      const kc = Number(kcal_100g || 0);
      const p = Number(protein_100g || 0);
      const c = Number(carbs_100g || 0);
      const f = Number(fat_100g || 0);

      if (![kc, p, c, f].every((n) => Number.isFinite(n))) {
        return res.status(400).json({ eroare: 'Valori nutritionale invalide.' });
      }

      if (kc > 1000 || kc < 0) return res.status(400).json({ eroare: 'Numar de calorii imposibil fizic pentru 100g.' });
      if (p > 100 || p < 0 || c > 100 || c < 0 || f > 100 || f < 0) {
        return res.status(400).json({ eroare: 'Macro-nutrientii gresiti (peste 100g din 100g).' });
      }
      if ((p + c + f) > 100) {
        return res.status(400).json({ eroare: 'Suma macro-nutrientilor depaseste 100g per total de 100g.' });
      }

      if (!/^[0-9]{4,20}$/.test(String(code).trim())) {
        return res.status(400).json({ eroare: 'Cod de bare malformat.' });
      }

      const ctx = contextDate(req, res);

      // Pre-verificare pentru un mesaj de eroare clar, INAINTE de a incerca scrierea.
      // Nu este bariera de securitate - bariera este predicatul din RPC, evaluat sub
      // blocarea randului. Un refuz aparut intre cele doua momente vine ca
      // EroareProprietateProdus si este tratat mai jos.
      const salvare = await barcodeRepo.salveazaProdusBarcode(ctx, {
        code: String(code).trim(),
        valori: { name, brand, quantity, kcal_100g: kc, protein_100g: p, carbs_100g: c, fat_100g: f },
      });
      if (!salvare.permis) {
        return res.status(salvare.status).json({ eroare: salvare.motiv });
      }
      return res.json({ succes: true, message: 'Produs salvat in cache-ul local.' });
    } catch (err) {
      // Conflict de proprietate pierdut la limita: 409, nu 500. Utilizatorul trebuie
      // sa afle ca produsul are alt proprietar, nu ca serverul s-a defectat.
      if (err instanceof EroareProprietateProdus) {
        return res.status(err.status).json({ eroare: err.motiv });
      }
      console.error('Eroare la salvare produs barcode:', err.message);
      return res.status(500).json({ eroare: 'Eroare la salvarea produsului.' });
    }
  });

  return router;
}

module.exports = createBarcodeRouter;
