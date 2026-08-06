'use strict';

/**
 * P-08: Handler Clerk webhooks — fix deblocare >1000 utilizatori + tratare erori tranzitorii/permanente & dead-letter.
 */

const express = require('express');
const crypto = require('crypto');
const { Webhook } = require('svix');
const { tasks } = require('@trigger.dev/sdk/v3');
const Sentry = require('@sentry/node');

class EroareTranzitorie extends Error {
  constructor(mesaj, cauza) {
    super(mesaj);
    this.name = 'EroareTranzitorie';
    this.tranzitorie = true;
    this.cauza = cauza;
  }
}

const CODURI_PERMANENTE = new Set([
  '23505', // unique_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
  '22P02', // invalid_text_representation
  '22001', // string_data_right_truncation
]);

function estePermanent(err) {
  return !!(err && err.code && CODURI_PERMANENTE.has(err.code));
}

async function inregistreazaWebhookEsuat({ supabaseAdmin, clerkUserId, type, motiv, payload }) {
  const alerteazaEsecDeadLetter = (detaliu, exceptie) => {
    console.error(
      `[Webhook Clerk] DEAD_LETTER_WRITE_FAILED: nu am putut scrie în clerk_webhook_esuate: ${detaliu}`,
    );
    try {
      Sentry.withScope((scope) => {
        scope.setLevel('error');
        scope.setTag('webhook', 'clerk');
        scope.setTag('webhook.dead_letter_failed', 'true');
        scope.setTag('webhook.event_type', String(type));
        scope.setFingerprint(['clerk-webhook-dead-letter', String(type)]);
        if (exceptie) Sentry.captureException(exceptie);
        else Sentry.captureMessage(`DEAD_LETTER_WRITE_FAILED: ${detaliu}`);
      });
    } catch {
      // Sentry indisponibil
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
      payload: payload ? (typeof payload === 'object' ? payload : { data: payload }) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clerk_user_id,event_type' });

    // PostgREST NU aruncă excepții: erorile de bază de date vin în `error`.
    // Fără ramura asta, o tabelă lipsă sau o politică RLS ar trece complet tăcut
    // pe lângă alerte, iar singurul semnal ar fi un 500 fără cauză în log.
    if (error) {
      alerteazaEsecDeadLetter(`${error.code || 'FARA_COD'} ${error.message || ''}`.trim());
      return false;
    }

    return true;
  } catch (e) {
    alerteazaEsecDeadLetter(e.message, e);
    return false;
  }
}

/**
 * Determină un id de utilizator Supabase REAL pentru un eveniment Clerk.
 */
async function determinareSauCreareSupabaseUser({ supabaseAdmin, externalId, email }) {
  // 1. external_id dat și valid în auth.users → îl folosim direct.
  if (externalId) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(externalId);
      if (!error && data?.user) return data.user.id;
    } catch (e) {
      if (!estePermanent(e)) {
        throw new EroareTranzitorie('Căutare getUserById eșuată', e);
      }
    }
  }

  // 2. RPC `get_auth_user_by_email` fără paginare.
  if (email) {
    try {
      const { data: rpcData, error: rpcError } = await supabaseAdmin
        .rpc('get_auth_user_by_email', { p_email: email });
      if (rpcError) {
        if (!estePermanent(rpcError)) {
          throw new EroareTranzitorie('RPC get_auth_user_by_email eșuat', rpcError);
        }
      } else if (Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData[0].id;
      }
    } catch (e) {
      if (e instanceof EroareTranzitorie) throw e;
      if (!estePermanent(e)) {
        throw new EroareTranzitorie('RPC get_auth_user_by_email indisponibil', e);
      }
    }
  }

  if (!email) return null;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID().replace(/-/g, '') + 'Aa1!',
    });

    if (error) {
      if (
        error.code === '23505' ||
        (error.message && error.message.toLowerCase().includes('already exists'))
      ) {
        try {
          const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            perPage: 50,
          });
          if (!listErr && Array.isArray(listData?.users)) {
            const gasit = listData.users.find(
              (u) => u.email && u.email.toLowerCase() === email.toLowerCase(),
            );
            if (gasit) return gasit.id;
          }
        } catch (e) {
          throw new EroareTranzitorie('listUsers eșuat pe fallback email deja existent', e);
        }
      } else if (!estePermanent(error)) {
        throw new EroareTranzitorie('createUser eșuat', error);
      }
      return null;
    }

    if (!data?.user) return null;
    return data.user.id;
  } catch (e) {
    if (e instanceof EroareTranzitorie) throw e;
    throw new EroareTranzitorie('Eroare internă la determinareSauCreareSupabaseUser', e);
  }
}

function createWebhooksRouter({ supabaseAdmin, config }) {
  const router = express.Router();

  router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
    const webhookSecret = config.clerkWebhookSecret;

    if (!webhookSecret) {
      console.error('[Webhook Clerk] Secret-ul CLERK_WEBHOOK_SECRET nu este configurat pe server.');
      return res.status(500).json({ eroare: 'Configurație webhook incompletă pe server.' });
    }

    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return res.status(400).json({ eroare: 'Antete Svix lipsă.' });
    }

    const payload = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    const wh = new Webhook(webhookSecret);
    let evt;

    try {
      evt = wh.verify(payload, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err) {
      console.error('[Webhook Clerk] Verificare semnătură eșuată:', err.message);
      return res.status(401).json({ eroare: 'Semnătură webhook invalidă.' });
    }

    const { type, data } = evt;
    const clerkUserId = data?.id;

    if (!clerkUserId) {
      return res.status(400).json({ eroare: 'Payload-ul nu conține id utilizator.' });
    }

    try {
      if (type === 'user.created') {
        const email = data.email_addresses?.[0]?.email_address || null;
        const meta = data.unsafe_metadata || data.public_metadata || {};

        const { data: mapareExistent } = await supabaseAdmin
          .from('clerk_user_map')
          .select('supabase_user_id')
          .eq('clerk_user_id', clerkUserId)
          .maybeSingle();

        let supabaseUserId = mapareExistent?.supabase_user_id;

        if (!supabaseUserId) {
          supabaseUserId = await determinareSauCreareSupabaseUser({
            supabaseAdmin,
            externalId: data.external_id,
            email,
          });

          if (!supabaseUserId) {
            const scrisDl = await inregistreazaWebhookEsuat({
              supabaseAdmin,
              clerkUserId,
              type,
              motiv: 'USER_ID_NEDETERMINAT',
              payload: data,
            });
            if (scrisDl) {
              console.warn('[Webhook Clerk] userId Supabase nedeterminat, salvat în dead-letter:', clerkUserId);
              return res.status(200).json({
                ok: false,
                type,
                avertisment: 'userId Supabase nedeterminat — înregistrat pentru intervenție manuală.',
              });
            }
            return res.status(500).json({ eroare: 'Nu s-a putut scrie în dead-letter.', cod: 'DEAD_LETTER_WRITE_FAILED' });
          }

          await supabaseAdmin.from('clerk_user_map').upsert({
            clerk_user_id: clerkUserId,
            supabase_user_id: supabaseUserId,
          });
        }

        await supabaseAdmin.from('profil').upsert({
          user_id: supabaseUserId,
          nume: `${data.first_name || ''} ${data.last_name || ''}`.trim() || null,
          greutate: Number(meta.greutate) || null,
          calorii_tinta: Number(meta.calorii_tinta) || 2000,
          proteine_tinta: Number(meta.proteine_tinta) || 150,
          carbi_tinta: Number(meta.carbi_tinta) || 250,
          grasimi_tinta: Number(meta.grasimi_tinta) || 70,
          updated_at: new Date().toISOString(),
        });

        if (config.triggerSecretKey) {
          try {
            await tasks.trigger('user-sync', { action: 'user.created', clerkUserId, supabaseUserId, email, meta });
          } catch (e) {
            console.warn('[Webhook Clerk] Nu s-a putut declanșa task-ul Trigger.dev:', e.message);
          }
        }
      } else if (type === 'user.updated') {
        const { data: mapare } = await supabaseAdmin
          .from('clerk_user_map')
          .select('supabase_user_id')
          .eq('clerk_user_id', clerkUserId)
          .maybeSingle();

        if (mapare?.supabase_user_id) {
          await supabaseAdmin.from('profil').update({
            nume: `${data.first_name || ''} ${data.last_name || ''}`.trim() || null,
            updated_at: new Date().toISOString(),
          }).eq('user_id', mapare.supabase_user_id);
        }

        if (config.triggerSecretKey) {
          try {
            await tasks.trigger('user-sync', { action: 'user.updated', clerkUserId, data });
          } catch (e) {
            console.warn('[Webhook Clerk] Trigger.dev error on user.updated:', e.message);
          }
        }
      } else if (type === 'user.deleted') {
        const { data: mapare } = await supabaseAdmin
          .from('clerk_user_map')
          .select('supabase_user_id')
          .eq('clerk_user_id', clerkUserId)
          .maybeSingle();

        const supabaseUserId = mapare?.supabase_user_id;

        if (supabaseUserId) {
          await supabaseAdmin.from('mese').delete().eq('user_id', supabaseUserId);
          await supabaseAdmin.from('antrenamente').delete().eq('user_id', supabaseUserId);
          await supabaseAdmin.from('profil').delete().eq('user_id', supabaseUserId);
          await supabaseAdmin.from('clerk_user_map').delete().eq('clerk_user_id', clerkUserId);
        }

        if (config.triggerSecretKey) {
          try {
            await tasks.trigger('user-sync', { action: 'user.deleted', clerkUserId, supabaseUserId });
          } catch (e) {
            console.warn('[Webhook Clerk] Trigger.dev error on user.deleted:', e.message);
          }
        }
      }

      return res.json({ ok: true, type });
    } catch (err) {
      console.error(`[Webhook Clerk] Eroare la procesarea evenimentului ${type}:`, err.message);

      try {
        Sentry.withScope((scope) => {
          scope.setLevel('error');
          scope.setTag('webhook', 'clerk');
          scope.setTag('webhook.event_type', String(type));
          scope.setTag('webhook.are_user_id', String(!!clerkUserId));
          scope.setFingerprint(['clerk-webhook', String(type)]);
          Sentry.captureException(err);
        });
      } catch {
        // Sentry indisponibil
      }

      if (estePermanent(err)) {
        return res.status(200).json({
          ok: false,
          type,
          avertisment: 'Eroare permanentă la procesarea webhook-ului.',
        });
      }

      return res.status(500).json({
        eroare: 'Eroare tranzitorie de infrastructură la procesarea webhook-ului.',
      });
    }
  });

  return router;
}

module.exports = createWebhooksRouter;
module.exports.determinareSauCreareSupabaseUser = determinareSauCreareSupabaseUser;
module.exports.EroareTranzitorie = EroareTranzitorie;
