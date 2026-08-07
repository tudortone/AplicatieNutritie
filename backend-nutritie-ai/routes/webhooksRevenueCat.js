'use strict';

/**
 * P-01b: Webhook RevenueCat — credite AI cu idempotență pe event_id.
 */

const express = require('express');
const crypto = require('crypto');

// Credite acordate per produs (configurat pentru fiecare pachet din App Store / Play Store)
const CREDIT_AMOUNTS = {
  'nutri_credits_50': 50,
  'nutri_credits_150': 150,
  'nutri_credits_50_ios': 50,
  'nutri_credits_150_ios': 150,
};

const TIPURI_CREDITARE = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
]);

function egalSigur(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function inregistreazaCreditEsuat({ supabaseAdmin, eventId, appUserId, productId, credite, motiv, payload }) {
  try {
    if (!supabaseAdmin) return;
    await supabaseAdmin.from('credite_esuate').upsert({
      event_id: eventId,
      app_user_id: appUserId,
      product_id: productId,
      credite,
      motiv,
      payload,
    }, { onConflict: 'event_id' });
  } catch (e) {
    console.error('[RevenueCat] Nu am putut scrie în credite_esuate:', e.message);
  }
}

function createWebhooksRevenueCatRouter({ supabaseAdmin, config }) {
  const router = express.Router();

  router.post('/', express.json({ limit: '512kb' }), async (req, res) => {
    // Verificare antet Authorization (secretul configurat în RevenueCat dashboard)
    const authHeader = req.headers.authorization || '';
    const expectedSecret = config.revenuecat?.webhookSecret || process.env.REVENUECAT_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error('[RevenueCat Webhook] REVENUECAT_WEBHOOK_SECRET neconfigurat.');
      return res.status(500).json({ eroare: 'Webhook RevenueCat neconfigurat.' });
    }

    if (!egalSigur(authHeader, expectedSecret)) {
      console.warn('[RevenueCat Webhook] Autorizare invalidă.');
      return res.status(401).json({ eroare: 'Autorizare invalidă.' });
    }

    const event = req.body?.event;
    if (!event) {
      return res.status(400).json({ eroare: 'Payload invalid — câmpul event lipsește.' });
    }

    const {
      id: eventId,
      type: eventType,
      app_user_id: userId,
      product_id: productId,
      price_in_purchased_currency: price,
      currency,
    } = event;

    if (!eventId || !eventType || !userId) {
      return res.status(400).json({ eroare: 'Payload event incomplet (id, type, app_user_id obligatorii).' });
    }

    try {
      if (TIPURI_CREDITARE.has(eventType)) {
        const crediteDelta = CREDIT_AMOUNTS[productId] || 0;

        if (crediteDelta === 0) {
          console.warn(`[RevenueCat] Produs nerecunoscut: ${productId}. Creditele nu au fost acordate.`);
          await inregistreazaCreditEsuat({
            supabaseAdmin,
            eventId,
            appUserId: userId,
            productId,
            credite: 0,
            motiv: 'PRODUCT_NOT_IN_CREDIT_AMOUNTS',
            payload: event,
          });
          return res.json({ ok: true, avertisment: `Produs ${productId} neconfigurat în CREDIT_AMOUNTS.` });
        }

        let targetSupabaseUserId = userId;
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (!UUID_RE.test(userId)) {
          const { data: mapare, error: eroareMapare } = await supabaseAdmin
            .from('clerk_user_map')
            .select('supabase_user_id')
            .eq('clerk_user_id', userId)
            .maybeSingle();

          if (eroareMapare) {
            console.error('[RevenueCat] Citire clerk_user_map eșuată:', eroareMapare.message);
            return res.status(503).json({
              eroare: 'Maparea utilizatorului este temporar indisponibilă.',
              cod: 'USER_MAP_UNAVAILABLE',
            });
          }

          if (!mapare?.supabase_user_id) {
            await inregistreazaCreditEsuat({
              supabaseAdmin,
              eventId,
              appUserId: userId,
              productId,
              credite: crediteDelta,
              motiv: 'USER_NOT_MAPPED_YET',
              payload: event,
            });
            console.error(`[RevenueCat] Clerk ${userId} nemapat — cer retry.`);
            return res.status(503).json({
              eroare: 'Utilizator nemapat încă — reîncercați.',
              cod: 'USER_NOT_MAPPED_YET',
            });
          }

          targetSupabaseUserId = mapare.supabase_user_id;
        }

        // P-01b: funcție atomică cu UNIQUE pe event_id — idempotent
        const { data: soldNou, error: rpcError } = await supabaseAdmin.rpc(
          'aplica_tranzactie_credite',
          {
            p_user_id: targetSupabaseUserId,
            p_event_id: eventId,
            p_event_type: eventType,
            p_delta: crediteDelta,
            p_produs_id: productId,
            p_metadata: { price, currency, raw_event: eventType, original_app_user_id: userId },
          },
        );

        if (rpcError) {
          console.error('[RevenueCat] Eroare RPC aplica_tranzactie_credite:', rpcError.message);
          await inregistreazaCreditEsuat({
            supabaseAdmin,
            eventId,
            appUserId: userId,
            productId,
            credite: crediteDelta,
            motiv: `RPC_ERROR: ${rpcError.message}`,
            payload: event,
          });
          return res.status(500).json({ eroare: 'Nu s-au putut actualiza creditele.' });
        }

        // soldNou === -1 → event_id deja procesat (idempotent)
        if (soldNou === -1) {
          console.log(`[RevenueCat] Event ${eventId} deja procesat (idempotent).`);
          return res.json({ ok: true, idempotent: true });
        }

        console.log(`[RevenueCat] ${eventType} pentru ${userId}: +${crediteDelta} credite. Sold nou: ${soldNou}`);
        return res.json({ ok: true, soldNou, crediteDelta });
      }

      console.log(`[RevenueCat] Eveniment ${eventType} primit pentru ${userId} — fără modificare credite.`);
      return res.json({ ok: true, ignorat: true, eventType });
    } catch (err) {
      console.error('[RevenueCat] Eroare webhook:', err.message);
      return res.status(500).json({ eroare: 'Eroare internă la procesarea webhook-ului RevenueCat.' });
    }
  });

  return router;
}

module.exports = createWebhooksRevenueCatRouter;
