'use strict';

/**
 * P-05: Worker GDPR pentru reluarea automată a ștergerilor întrerupte din outbox.
 * Fencing & Leasing: Single-owner enforcement via claim_gdpr_deletion & fencing_token.
 */

const Sentry = require('@sentry/node');
const {
  stergeIdentitateClerk,
  stergeActiveImageKit,
  stergeDeadLetterUtilizator,
  stergeEvenimenteRtdnUtilizator,
  CODURI_TABELA_INEXISTENTA,
} = require('./gdprServices');
const {
  inregistreazaUtilizareAdmin,
  TABELE_STERGERE_GDPR_UTILIZATOR,
} = require('./clientUtilizator');
const { pseudonimizeaza } = require('./sentrySanitize');
const { codEroare } = require('./codEroare');

/**
 * Actualizează statusul unui rând din outbox cu verificare de proprietate (workerId, fencingToken, expectedStatus).
 * Respinge tranzacția dacă lease-ul a expirat sau dacă tokenul de fencing a fost depășit.
 */
async function actualizeazaStatusOutbox(supabaseAdmin, id, payload, {
  workerId,
  fencingToken,
  expectedStatus,
} = {}) {
  let query = supabaseAdmin
    .from('gdpr_deletions')
    .update(payload)
    .eq('id', id);

  if (expectedStatus && typeof query?.eq === 'function') {
    query = query.eq('status', expectedStatus);
  }
  if (workerId && typeof query?.eq === 'function') {
    query = query.eq('claimed_by', workerId);
  }
  if (fencingToken !== undefined && fencingToken !== null && typeof query?.eq === 'function') {
    query = query.eq('fencing_token', fencingToken);
  }
  if (typeof query?.gte === 'function') {
    query = query.gte('lease_expires_at', new Date().toISOString());
  }

  const rezultat = await query
    .select('id')
    .maybeSingle();

  if (rezultat?.error || !rezultat?.data?.id) {
    const error = new Error('GDPR_OUTBOX_STATUS_UPDATE_FAILED');
    error.code = 'GDPR_OUTBOX_STATUS_UPDATE_FAILED';
    if (rezultat?.error) error.cause = rezultat.error;
    throw error;
  }
}

/**
 * Revendică atomic un rând din outbox (fail-closed).
 * Dacă RPC-ul lipsește, aruncă eroare, sau întoarce altceva decât succes, returnează success: false.
 * Zero operații distructive sunt permise dacă claim-ul nu a reușit.
 */
async function revendicaRandOutbox(supabaseAdmin, id, {
  workerId,
  expectedStatus,
  leaseSeconds = 300,
} = {}) {
  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    return { success: false, error: 'RPC_UNAVAILABLE' };
  }
  try {
    const res = await supabaseAdmin.rpc('claim_gdpr_deletion', {
      p_id: id,
      p_worker_id: workerId || 'worker_default',
      p_expected_status: expectedStatus,
      p_lease_seconds: leaseSeconds,
    });
    if (res?.error) {
      return { success: false, error: res.error };
    }
    const data = res?.data;
    if (typeof data === 'boolean') {
      return { success: data, fencingToken: null };
    }
    if (data && typeof data === 'object' && data.success === true) {
      return {
        success: true,
        fencingToken: data.fencing_token,
        leaseExpiresAt: data.lease_expires_at,
      };
    }
    return { success: false, error: data?.error || 'CLAIM_REJECTED' };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Reînnoiește lease-ul activ pentru proprietarul curent.
 * Eșuează dacă lease-ul a expirat deja sau a fost revendicat de un alt worker.
 */
async function reinoiesteLeaseOutbox(supabaseAdmin, id, {
  workerId,
  fencingToken,
  leaseSeconds = 300,
} = {}) {
  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    const err = new Error('GDPR_LEASE_RENEWAL_FAILED');
    err.code = 'GDPR_LEASE_RENEWAL_FAILED';
    throw err;
  }
  const res = await supabaseAdmin.rpc('renew_gdpr_lease', {
    p_id: id,
    p_worker_id: workerId,
    p_fencing_token: fencingToken,
    p_lease_seconds: leaseSeconds,
  });
  if (res?.error || res?.data?.success !== true) {
    const err = new Error('GDPR_LEASE_RENEWAL_FAILED');
    err.code = 'GDPR_LEASE_RENEWAL_FAILED';
    if (res?.error) err.cause = res.error;
    throw err;
  }
  return res.data;
}

async function stergeRanduriDbUtilizator(supabaseAdmin, userId, clerkUserId = null) {
  if (!userId || !supabaseAdmin) return;
  inregistreazaUtilizareAdmin();
  const tabele = TABELE_STERGERE_GDPR_UTILIZATOR;
  await stergeEvenimenteRtdnUtilizator({ supabaseAdmin, userId });
  for (const tabela of tabele) {
    const rezultat = await supabaseAdmin.from(tabela).delete().eq('user_id', userId);
    const eroare = rezultat?.error;
    if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) {
      throw new Error(
        `Ștergere eșuată din ${tabela}: ${eroare.code || 'FARA_COD'} ${eroare.message || ''}`.trim(),
      );
    }
  }
  await stergeDeadLetterUtilizator({ supabaseAdmin, userId, clerkUserId });
}

async function reiaStergerileBlocate({ supabaseAdmin, config }) {
  if (!supabaseAdmin) return { reluate: 0 };

  const prag = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: randuri, error } = await supabaseAdmin
    .from('gdpr_deletions')
    .select('*')
    .neq('status', 'completed')
    .neq('status', 'failed')
    .lt('initiated_at', prag)
    .limit(20);

  if (error || !Array.isArray(randuri) || randuri.length === 0) {
    return { reluate: 0 };
  }

  let reluate = 0;
  for (const rand of randuri) {
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // P1 FINDING 1 & 4: Revendică atomic rândul ÎNAINTE de orice operație.
    // Un worker nu poate avansa și nu poate marca status 'failed' dacă nu obține claim-ul.
    const claim = await revendicaRandOutbox(supabaseAdmin, rand.id, {
      workerId,
      expectedStatus: rand.status,
    });
    if (!claim.success) {
      // Un alt worker sau ruta deține deja claim-ul activ pe acest rând
      continue;
    }

    const fencingToken = claim.fencingToken;
    const numariIncercare = (rand.retry_count ?? 0) + 1;

    if (numariIncercare >= 5) {
      try {
        Sentry.withScope((scope) => {
          scope.setLevel('error');
          scope.setTag('gdpr.max_retries_exceeded', 'true');
          scope.setTag('gdpr.user_pseudonym', pseudonimizeaza(rand.user_id));
          Sentry.captureMessage(`[GDPR] Ștergerea outbox ${rand.id} a atins numărul maxim de încercări.`);
        });
      } catch {}

      try {
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, {
          status: 'failed',
          last_error: 'Număr maxim de încercări atins (5).',
          retry_count: numariIncercare,
        }, {
          workerId,
          fencingToken,
          expectedStatus: rand.status,
        });
      } catch (errFailed) {
        try { Sentry.captureException(errFailed); } catch {}
      }
      continue;
    }

    try {
      let statusCurent = rand.status;

      // Pasul 1 (dacă s-a oprit la pending): DB rows delete
      if (statusCurent === 'pending') {
        if (rand.user_id) {
          await stergeRanduriDbUtilizator(supabaseAdmin, rand.user_id, rand.clerk_user_id);
        }
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, { status: 'db_done' }, {
          workerId,
          fencingToken,
          expectedStatus: 'pending',
        });
        statusCurent = 'db_done';
      }

      // Pasul 2 (dacă s-a oprit după db_done): Clerk delete
      if (statusCurent === 'db_done') {
        if (rand.clerk_user_id) {
          await stergeIdentitateClerk({
            clerkUserId: rand.clerk_user_id,
            secretKey: process.env.CLERK_SECRET_KEY?.trim(),
          });
        }
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, { status: 'clerk_done' }, {
          workerId,
          fencingToken,
          expectedStatus: 'db_done',
        });
        statusCurent = 'clerk_done';
      }

      // Pasul 3 (dacă s-a oprit după clerk_done): ImageKit media delete
      if (statusCurent === 'clerk_done') {
        if (rand.user_id) {
          const fileIds = Array.isArray(rand.file_ids) ? new Set(rand.file_ids) : new Set();
          await stergeActiveImageKit({
            userId: rand.user_id,
            fileIds,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim() || config?.imagekit?.privateKey,
          });
        }
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, { status: 'imagekit_done' }, {
          workerId,
          fencingToken,
          expectedStatus: 'clerk_done',
        });
        statusCurent = 'imagekit_done';
      }

      // Pasul 4 (dacă s-a oprit după imagekit_done): auth.deleteUser
      if (statusCurent === 'imagekit_done') {
        if (rand.user_id && !supabaseAdmin.auth?.admin?.deleteUser) {
          const error = new Error('ADMIN_DELETE_UNAVAILABLE');
          error.code = 'ADMIN_DELETE_UNAVAILABLE';
          throw error;
        }
        if (rand.user_id) {
          const { error: errAuth } = await supabaseAdmin.auth.admin.deleteUser(rand.user_id);
          if (errAuth && !String(errAuth.message).toLowerCase().includes('not found')) {
            throw errAuth;
          }
        }
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, { status: 'auth_done' }, {
          workerId,
          fencingToken,
          expectedStatus: 'imagekit_done',
        });
        statusCurent = 'auth_done';
      }

      // Pasul 5 (dacă s-a oprit după auth_done): confirmare finală
      if (statusCurent === 'auth_done') {
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          user_id: rand.id,
          clerk_user_id: null,
          file_ids: [],
          last_error: null,
        }, {
          workerId,
          fencingToken,
          expectedStatus: 'auth_done',
        });
      }

      reluate += 1;
    } catch (e) {
      try {
        await actualizeazaStatusOutbox(supabaseAdmin, rand.id, {
          last_error: codEroare(e),
          retry_count: numariIncercare,
        }, {
          workerId,
          fencingToken,
          expectedStatus: rand.status,
        });
      } catch (errActualizare) {
        try {
          Sentry.withScope((scope) => {
            scope.setLevel('error');
            scope.setTag('gdpr.outbox_update_failed', 'true');
            scope.setTag('gdpr.outbox_id', String(rand.id));
            Sentry.captureException(errActualizare);
          });
        } catch {}
      }
    }
  }

  return { reluate };
}

module.exports = {
  actualizeazaStatusOutbox,
  revendicaRandOutbox,
  reinoiesteLeaseOutbox,
  reiaStergerileBlocate,
};
