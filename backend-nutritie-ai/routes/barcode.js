// @ts-check
'use strict';

const express = require('express');
const { callWithTimeout } = require('../utils/httpTimeout');
const { parseJsonFromLlm } = require('../utils/llmJson');
const { numarModel } = require('../services/ai/vision');
const { construiesteUrlOpenFoodFacts, EroareProprietateProdus } = require('../utils/barcode');
// Task 1: codEroare mutat în utilitarul comun (utils/codEroare.js) — aceeași
// definiție ca în storePartajat/gdpr, ca tot backendul să logheze coduri identice.
const { codEroare } = require('../utils/codEroare');

const GROQ_CHAT_URL = ['https:', '', 'api.groq.com', 'openai', 'v1', 'chat', 'completions'].join('/');

function numarIntrare(value, max) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'boolean' || typeof value === 'object') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function createBarcodeRouter({ requireAuth, generalLimiter, contextDate, barcodeRepo }) {
  const router = express.Router();
  const raspunsBarcode = (res, { produs, sursa, estimat, dinCache }) => res.json({
    produs,
    sursa,
    source: sursa,
    estimat: Boolean(estimat),
    dinCache: Boolean(dinCache),
  });

  router.get('/produs-barcode/:code', requireAuth, generalLimiter, async (req, res) => {
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
      if (groqApiKey) {
        try {
          const aiPrompt = `Utilizatorul din Romania a scanat codul de bare EAN/UPC "${code}" dar produsul nu a fost gasit. Daca il cunosti cu certitudine, returneaza date reale; altfel returneaza un profil generic marcat ca estimare. Returneaza strict JSON cu codBare, nume, brand, cantitate, calorii, proteine, carbohidrati si grasimi.`;
          const aiResp = await callWithTimeout((signal) => fetch(GROQ_CHAT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqApiKey}`,
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
            const parsed = /** @type {Record<string, unknown> | null} */ (
              content ? parseJsonFromLlm(content, { asteapta: 'obiect' }) : null
            );
            if (parsed?.nume) {
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
              } catch (err) {
                console.warn('[Barcode] Salvare estimare esuata:', codEroare(err));
              }
              return raspunsBarcode(res, {
                produs: normalizedAi,
                sursa: 'estimare_ai',
                estimat: true,
                dinCache: false,
              });
            }
          }
        } catch (err) {
          console.warn('[Barcode] Estimare AI esuata:', codEroare(err));
        }
      }

      return res.status(404).json({
        eroare: 'Produsul nu a fost gasit.',
        allowManualEntry: true,
        suggestedAction: 'manual_or_ai_text',
      });
    } catch (err) {
      console.error('[Barcode] Interogare esuata:', codEroare(err));
      return res.status(500).json({ eroare: 'Eroare la interogarea codului de bare.' });
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
