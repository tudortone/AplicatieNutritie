'use strict';

const express = require('express');
const { Webhook } = require('svix');
const { tasks } = require('@trigger.dev/sdk/v3');

/**
 * Determină un id de utilizator Supabase REAL pentru un eveniment Clerk.
 *
 * Fără asta, `data.external_id || crypto.randomUUID()` crea un id inexistent în
 * `auth.users`, iar FK-urile de pe `profil.user_id` și `clerk_user_map.supabase_user_id`
 * erau încălcate → webhook 500 + retry infinit din partea Clerk.
 *
 * Ordine: (1) external_id valid în auth.users, (2) utilizator existent cu același
 * email, (3) creare auth user real (email_confirm) ca FK-ul să fie satisfăcut.
 * Returnează null dacă niciuna nu reușește.
 */
async function determinareSauCreareSupabaseUser({ supabaseAdmin, externalId, email }) {
  // 1. external_id dat și valid în auth.users → îl folosim direct.
  if (externalId) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(externalId);
      if (!error && data?.user) return data.user.id;
    } catch {
      // continuăm cu următoarele variante
    }
  }

  // 2. Email existent în auth.users → idempotență / utilizator deja înregistrat
  //    (inclusiv cei creați de fluxul Supabase auth din aplicație).
  if (email) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (!error && Array.isArray(data?.users)) {
        const gasit = data.users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
        if (gasit) return gasit.id;
      }
    } catch {
      // continuăm
    }
  }

  // 3. Cream auth user-ul real, ca FK-urile să fie valide. Parola e aleatoare:
  //    autentificarea reală vine de la Clerk, nu de la parolă.
  if (!email) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID().replace(/-/g, '') + 'Aa1!',
    });
    if (error || !data?.user) return null;
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

        // Verificăm dacă există deja o mapare pentru acest clerk_user_id
        const { data: mapareExistent } = await supabaseAdmin
          .from('clerk_user_map')
          .select('supabase_user_id')
          .eq('clerk_user_id', clerkUserId)
          .maybeSingle();

        let supabaseUserId = mapareExistent?.supabase_user_id;

        if (!supabaseUserId) {
          // Id Supabase REAL (external_id valid / email existent / auth user creat),
          // ca FK-ul de pe profil și clerk_user_map să nu fie încălcat.
          supabaseUserId = await determinareSauCreareSupabaseUser({
            supabaseAdmin,
            externalId: data.external_id,
            email,
          });
          if (!supabaseUserId) {
            return res.status(500).json({
              eroare: 'Nu s-a putut crea utilizatorul Supabase asociat contului Clerk.',
            });
          }
          await supabaseAdmin.from('clerk_user_map').upsert({
            clerk_user_id: clerkUserId,
            supabase_user_id: supabaseUserId,
          });
        }

        // Upsert în tabela profil — doar coloanele reale din migrarea 20260804000001
        // (nu există `greutate_kg`, `greutate_tinta_kg`, `*_tinta_g` sau `nume_complet`).
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

        // Apelare task asincron în Trigger.dev dacă este configurat
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
      return res.status(500).json({ eroare: 'Eroare internă la procesarea webhook-ului.' });
    }
  });

  return router;
}

module.exports = createWebhooksRouter;
module.exports.determinareSauCreareSupabaseUser = determinareSauCreareSupabaseUser;
