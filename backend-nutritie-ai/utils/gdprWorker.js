'use strict';

/**
 * P-05: Worker GDPR pentru reluarea automată a ștergerilor întrerupte din outbox.
 */

const Sentry = require('@sentry/node');
const { stergeIdentitateClerk, stergeActiveImageKit } = require('../routes/gdpr');

async function stergeRanduriDbUtilizator(supabaseAdmin, userId) {
  if (!userId || !supabaseAdmin) return;
  const tabele = ['mese', 'profil', 'antrenamente', 'barcode_estimari_utilizator', 'audit_log', 'credite_ai'];
  for (const tabela of tabele) {
    try {
      await supabaseAdmin.from(tabela).delete().eq('user_id', userId);
    } catch {
      // Ignorăm tabele opționale care nu există pe schema curentă
    }
  }
}

async function reiaStergerileBlocate({ supabaseAdmin, config }) {
  if (!supabaseAdmin) return { reluate: 0 };

  const prag = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: randuri, error } = await supabaseAdmin
    .from('gdpr_deletions')
    .select('*')
    .neq('status', 'completed')
    .neq('status', 'failed')
    .lt('created_at', prag)
    .limit(20);

  if (error || !Array.isArray(randuri) || randuri.length === 0) {
    return { reluate: 0 };
  }

  let reluate = 0;
  for (const rand of randuri) {
    const numariIncercare = (rand.retry_count ?? 0) + 1;
    if (numariIncercare >= 5) {
      try {
        Sentry.withScope((scope) => {
          scope.setLevel('error');
          scope.setTag('gdpr.max_retries_exceeded', 'true');
          scope.setTag('gdpr.user_id', String(rand.user_id || ''));
          Sentry.captureMessage(`[GDPR] Ștergerea outbox ${rand.id} a atins numărul maxim de încercări.`);
        });
      } catch {
        // Sentry indisponibil
      }

      await supabaseAdmin
        .from('gdpr_deletions')
        .update({
          status: 'failed',
          last_error: 'Număr maxim de încercări atins (5).',
          retry_count: numariIncercare,
        })
        .eq('id', rand.id);
      continue;
    }

    try {
      let statusCurent = rand.status;

      // Pasul 1 (dacă s-a oprit la pending): DB rows delete
      if (statusCurent === 'pending') {
        if (rand.user_id) {
          await stergeRanduriDbUtilizator(supabaseAdmin, rand.user_id);
        }
        statusCurent = 'db_done';
        await supabaseAdmin
          .from('gdpr_deletions')
          .update({ status: 'db_done' })
          .eq('id', rand.id);
      }

      // Pasul 2 (dacă s-a oprit după db_done): Auth delete
      if (statusCurent === 'db_done') {
        if (rand.user_id && supabaseAdmin.auth?.admin?.deleteUser) {
          const { error: errAuth } = await supabaseAdmin.auth.admin.deleteUser(rand.user_id);
          // 404 sau inexistent în auth.users = deja șters = succes
          if (errAuth && !String(errAuth.message).toLowerCase().includes('not found')) {
            throw errAuth;
          }
        }
        statusCurent = 'auth_done';
        await supabaseAdmin
          .from('gdpr_deletions')
          .update({ status: 'auth_done' })
          .eq('id', rand.id);
      }

      // Pasul 3 (dacă s-a oprit după auth_done): Clerk delete
      if (statusCurent === 'auth_done') {
        if (rand.clerk_user_id) {
          try {
            await stergeIdentitateClerk({
              clerkUserId: rand.clerk_user_id,
              secretKey: process.env.CLERK_SECRET_KEY?.trim(),
            });
          } catch (e) {
            const msg = String(e.message);
            if (!msg.includes('404') && !msg.includes('CLERK_NOT_CONFIGURED')) throw e;
          }
        }
        statusCurent = 'clerk_done';
        await supabaseAdmin
          .from('gdpr_deletions')
          .update({ status: 'clerk_done' })
          .eq('id', rand.id);
      }

      // Pasul 4 (dacă s-a oprit după clerk_done): ImageKit media delete
      if (statusCurent === 'clerk_done') {
        if (rand.user_id) {
          try {
            await stergeActiveImageKit({
              userId: rand.user_id,
              fileIds: new Set(),
              privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim() || config?.imagekit?.privateKey,
            });
          } catch (e) {
            const msg = String(e.message);
            if (!msg.includes('404') && !msg.includes('IMAGEKIT_NOT_CONFIGURED')) throw e;
          }
        }
        await supabaseAdmin
          .from('gdpr_deletions')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', rand.id);
      }

      reluate += 1;
    } catch (e) {
      await supabaseAdmin
        .from('gdpr_deletions')
        .update({
          last_error: String(e?.message || e).slice(0, 300),
          retry_count: numariIncercare,
        })
        .eq('id', rand.id);
    }
  }

  return { reluate };
}

module.exports = {
  reiaStergerileBlocate,
};
