'use strict';

/**
 * P-08: Handler Clerk webhooks — fix deblocare >1000 utilizatori.
 *
 * PROBLEMA (P-08): handlerul `user.created` apela
 * `supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })` și căuta liniar
 * după email. Peste pagina 1, potrivirea eșua → `createUser` pe email existent
 * → eroare → 500 → Clerk reîncerca la infinit.
 *
 * FIX: RPC `get_auth_user_by_email` în loc de scanare totală. Dacă RPC-ul
 * eșuează (e.g. nu a fost aplicat încă), se cade pe `createUser` cu tratarea
 * "email already exists" ca succes idempotent (200, nu 500).
 *
 * P-21: `require('crypto')` explicit în loc de global Node.
 */

const express = require('express');
const crypto = require('crypto'); // P-21: explicit, nu global
const { Webhook } = require('svix');
const { tasks } = require('@trigger.dev/sdk/v3');

/**
 * Determină un id de utilizator Supabase REAL pentru un eveniment Clerk.
 *
 * Ordine:
 * 1. external_id valid în auth.users → îl folosim direct
 * 2. Email — RPC `get_auth_user_by_email` (fără paginare, O(log n))
 * 3. Creare auth user real (email_confirm) ca FK-ul să fie satisfăcut
 *    — tratăm "email deja existent" ca succes idempotent
 *
 * Returnează null dacă niciuna nu reușește.
 */
async function determinareSauCreareSupabaseUser({ supabaseAdmin, externalId, email }) {
  // 1. external_id dat și valid în auth.users → îl folosim direct.
  if (externalId) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(externalId);
      if (!error && data?.user) return data.user.id;
    } catch {
      // continuăm cu alternativele
    }
  }

  // 2. P-08 FIX: RPC `get_auth_user_by_email` fără paginare.
  //    Funcția e definită în migrarea 20260807000001_fix_identitate_rls.sql.
  if (email) {
    try {
      const { data: rpcData, error: rpcError } = await supabaseAdmin
        .rpc('get_auth_user_by_email', { p_email: email });
      if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData[0].id;
      }
    } catch {
      // RPC indisponibil (migrarea nu a rulat încă) → continuăm
    }
  }

  // 3. Creare auth user real. Tratăm "email already exists" (23505 / ALREADY_EXISTS)
  //    ca succes idempotent — returnăm 200, nu 500, ca Clerk să oprească retry-ul.
  if (!email) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID().replace(/-/g, '') + 'Aa1!',
    });
    if (error) {
      // Email deja existent → idempotent, refacem căutarea directă
      if (
        error.code === '23505' ||
        (error.message && error.message.toLowerCase().includes('already exists'))
      ) {
        // Ultima șansă: căutăm cu listUsers (perPage mic = primii 50)
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
        } catch {
          // ignorăm
        }
      }
      return null;
    }
    if (!data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Endpoint securizat pentru recepționarea webhook-urilor Clerk și sincronizarea
 * stării utilizatorilor cu baza de date Supabase și Trigger.dev.
 */
function createWebhooksRouter({ supabaseAdmin, config }) {
  const router = express.Router();

  // Webhook-ul Clerk folosește corpul brut JSON pentru verificarea semnăturii
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

        // Verificăm dacă există deja o mapare pentru acest clerk_user_id (idempotent)
        const { data: mapareExistent } = await supabaseAdmin
          .from('clerk_user_map')
          .select('supabase_user_id')
          .eq('clerk_user_id', clerkUserId)
          .maybeSingle();

        let supabaseUserId = mapareExistent?.supabase_user_id;

        if (!supabaseUserId) {
          // P-08: determinareSauCreareSupabaseUser folosește RPC, nu listUsers(1000)
          supabaseUserId = await determinareSauCreareSupabaseUser({
            supabaseAdmin,
            externalId: data.external_id,
            email,
          });
          if (!supabaseUserId) {
            // Returnăm 200 (nu 500) ca Clerk să NU reintre în retry infinit.
            // Logăm pentru monitorizare manuală.
            console.error('[Webhook Clerk] Nu s-a putut determina/crea userId Supabase pentru:', clerkUserId);
            return res.status(200).json({
              ok: false,
              type,
              avertisment: 'userId Supabase nedeterminat — mapare omisă.',
            });
          }
          await supabaseAdmin.from('clerk_user_map').upsert({
            clerk_user_id: clerkUserId,
            supabase_user_id: supabaseUserId,
          });
        }

        // Upsert în tabela profil
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

      // Confirmare succes către Clerk
      return res.json({ ok: true, type });
    } catch (err) {
      console.error(`[Webhook Clerk] Eroare la procesarea evenimentului ${type}:`, err.message);

      // Trimitere alertă Sentry pentru monitorizare
      try {
        const Sentry = require('@sentry/node');
        Sentry.withScope((scope) => {
          scope.setLevel('error');
          scope.setTag('webhook', 'clerk');
          scope.setExtra('event_type', type);
          scope.setExtra('clerk_user_id', clerkUserId);
          Sentry.captureException(err);
        });
      } catch {
        // Sentry indisponibil
      }

      // P-08: Erorile permanente de date (payload invalid/missing params) -> 200 cu avertisment ca Clerk să oprească retry-ul
      if (err.isPermanent || err.code === '23505') {
        return res.status(200).json({
          ok: false,
          type,
          avertisment: 'Eroare permanentă la procesarea webhook-ului.',
        });
      }

      // Erorile tranzitorii de infrastructură/DB network -> 500 pentru ca Clerk să reîncerce mai târziu
      return res.status(500).json({
        eroare: 'Eroare tranzitorie de infrastructură la procesarea webhook-ului.',
      });
    }
  });

  return router;
}

module.exports = createWebhooksRouter;
module.exports.determinareSauCreareSupabaseUser = determinareSauCreareSupabaseUser;
