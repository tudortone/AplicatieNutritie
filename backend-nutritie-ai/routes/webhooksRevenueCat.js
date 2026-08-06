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
  'nutri_credits_150_ios': 150,
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

    const crypto = require('crypto');
    function egalSigur(a, b) {
      const ba = Buffer.from(String(a));
      const bb = Buffer.from(String(b));
      if (ba.length !== bb.length) return false;
      return crypto.timingSafeEqual(ba, bb);
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
          // Returnăm 200 ca RevenueCat să nu reintre în retry
          return res.json({ ok: true, avertisment: `Produs ${productId} neconfigurat în CREDIT_AMOUNTS.` });
        }

        // Mapează app_user_id prin clerk_user_map dacă nu este deja UUID
        let targetSupabaseUserId = userId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

        if (!isUuid) {
          const { data: mapare } = await supabaseAdmin
            .from('clerk_user_map')
            .select('supabase_user_id')
            .eq('clerk_user_id', userId)
            .maybeSingle();

          if (mapare?.supabase_user_id) {
            targetSupabaseUserId = mapare.supabase_user_id;
          } else {
            console.error(`[RevenueCat] Utilizatorul Clerk ${userId} nu este mapat la un UUID Supabase.`);
            return res.status(200).json({
              ok: false,
              avertisment: `Utilizatorul ${userId} nu a fost găsit în clerk_user_map.`,
            });
          }
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
