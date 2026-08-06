'use strict';

/**
 * P-01b: Webhook RevenueCat — credite AI cu idempotență pe event_id.
 *
 * Tratează evenimentele:
 *   INITIAL_PURCHASE, NON_RENEWING_PURCHASE, RENEWAL → creditare
 *   CANCELLATION, EXPIRATION → nu modificăm creditele (se epuizează natural)
 *
 * Securitate:
 *   - Antetul `Authorization` cu secretul configurat în RevenueCat
 *   - Fiecare event_id e unic (UNIQUE constraint în DB) → idempotent
 *
 * Creditare:
 *   - Consumă ÎNTÂI creditele plătite, APOI cota gratuită — nu invers.
 *   - Suma de credite per produs e configurată în CREDIT_AMOUNTS.
 */

const express = require('express');

// Credite acordate per produs (configurat pentru fiecare pachet din App Store / Play Store)
const CREDIT_AMOUNTS = {
  'nutri_credits_50': 50,
  'nutri_credits_150': 150,
  'nutri_credits_50_ios': 50,
  'nutri_credits_150_ios': 50,
  // Adaugă alte ID-uri de produs după caz
};

const TIPURI_CREDITARE = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
]);

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

    if (authHeader !== expectedSecret) {
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
          // Returnăm 200 ca RevenueCat să nu reintre în retry
          return res.json({ ok: true, avertisment: `Produs ${productId} neconfigurat în CREDIT_AMOUNTS.` });
        }

        // P-01b: funcție atomică cu UNIQUE pe event_id — idempotent
        const { data: soldNou, error: rpcError } = await supabaseAdmin.rpc(
          'aplica_tranzactie_credite',
          {
            p_user_id: userId,
            p_event_id: eventId,
            p_event_type: eventType,
            p_delta: crediteDelta,
            p_produs_id: productId,
            p_metadata: { price, currency, raw_event: eventType },
          },
        );

        if (rpcError) {
          console.error('[RevenueCat] Eroare RPC aplica_tranzactie_credite:', rpcError.message);
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

      // CANCELLATION / EXPIRATION / alte tipuri → nu modificăm creditele
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
module.exports.CREDIT_AMOUNTS = CREDIT_AMOUNTS;
module.exports.TIPURI_CREDITARE = TIPURI_CREDITARE;
