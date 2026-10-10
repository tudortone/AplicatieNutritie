'use strict';

/**
 * Clerk webhooks are accepted only for signature verification and minimal,
 * idempotent reconciliation records. Supabase Auth remains canonical for mobile.
 */

const express = require('express');
const { Webhook } = require('svix');
const Sentry = require('@sentry/node');
const { rezumatEroareSigur } = require('../utils/sentrySanitize');

async function inregistreazaWebhookEsuat({ supabaseAdmin, clerkUserId, type, motiv, externalIdPresent }) {
  const alerteazaEsecDeadLetter = (detaliu, exceptie) => {
    const rezumat = rezumatEroareSigur(exceptie || { code: detaliu }, {
      operation: `dead_letter_${type || 'unknown'}`,
      provider: 'supabase',
    });
    console.error('[Webhook Clerk] DEAD_LETTER_WRITE_FAILED', rezumat);
    try {
      Sentry.withScope((scope) => {
        scope.setLevel('error');
        scope.setTag('webhook', 'clerk');
        scope.setTag('webhook.dead_letter_failed', 'true');
        scope.setTag('webhook.event_type', rezumat.operation);
        scope.setFingerprint(['clerk-webhook-dead-letter', rezumat.operation]);
        scope.setExtra('error_summary', rezumat);
        Sentry.captureMessage('CLERK_WEBHOOK_DEAD_LETTER_WRITE_FAILED');
      });
    } catch {
      // Sentry indisponibil.
    }
  };

  try {
    if (!supabaseAdmin) {
      alerteazaEsecDeadLetter('client supabaseAdmin indisponibil');
      return false;
    }

    const { error } = await supabaseAdmin.from('clerk_webhook_esuate').upsert({
      clerk_user_id: clerkUserId,
      event_type: type,
      motiv,
      // Nu păstrăm email, nume, metadata sau payload-ul original.
      payload: { external_id_present: Boolean(externalIdPresent) },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clerk_user_id,event_type' });

    if (error) {
      alerteazaEsecDeadLetter(error.code || 'FARA_COD', error);
      return false;
    }
    return true;
  } catch (error) {
    alerteazaEsecDeadLetter(error?.code || error?.name || 'EXCEPTION', error);
    return false;
  }
}

function createWebhooksRouter({ supabaseAdmin, config }) {
  const router = express.Router();

  router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
    const webhookSecret = config.clerkWebhookSecret;
    if (!webhookSecret) {
      console.error('[Webhook Clerk] Secret-ul de semnare nu este configurat pe server.');
      return res.status(500).json({ eroare: 'Configurație webhook incompletă pe server.' });
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ eroare: 'Antete Svix lipsă.' });
    }

    const payload = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    let evt;
    try {
      evt = new Webhook(webhookSecret).verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (error) {
      console.error('[Webhook Clerk]', rezumatEroareSigur(error, {
        operation: 'verify_signature',
        provider: 'clerk',
      }));
      return res.status(401).json({ eroare: 'Semnătură webhook invalidă.' });
    }

    const { type, data } = evt;
    const clerkUserId = data?.id;
    if (!clerkUserId) {
      return res.status(400).json({ eroare: 'Payload-ul nu conține id utilizator.' });
    }

    if (!['user.created', 'user.updated', 'user.deleted'].includes(type)) {
      return res.json({ ok: true, type });
    }

    // external_id, email and historical mappings are not proof that the Clerk
    // principal owns a Supabase Auth UUID. Disable every cross-provider profile
    // mutation until an authenticated account-link flow exists. This also makes
    // duplicate/retried deliveries harmless and preserves Supabase sign-in/data.
    const motiv = type === 'user.deleted'
      ? 'CLERK_DELETE_NOT_SUPABASE_AUTHORITY'
      : 'CLERK_SYNC_REQUIRES_VERIFIED_ACCOUNT_LINK';
    const saved = await inregistreazaWebhookEsuat({
      supabaseAdmin,
      clerkUserId,
      type,
      motiv,
      externalIdPresent: typeof data?.external_id === 'string' && data.external_id.length > 0,
    });
    if (!saved) {
      return res.status(500).json({ eroare: 'Nu s-a putut scrie în dead-letter.', cod: 'DEAD_LETTER_WRITE_FAILED' });
    }
    return res.status(200).json({
      ok: false,
      type,
      avertisment: 'Sincronizarea Clerk nu este activată fără asociere de cont verificată — eveniment înregistrat pentru reconciliere.',
    });
  });

  return router;
}

module.exports = createWebhooksRouter;
