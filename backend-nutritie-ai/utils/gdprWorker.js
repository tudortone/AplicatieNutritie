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
  extrageFileIdsUtilizator,
  CODURI_TABELA_INEXISTENTA,
} = require('./gdprServices');
const {
  inregistreazaUtilizareAdmin,
  TABELE_STERGERE_GDPR_UTILIZATOR,
} = require('./clientUtilizator');
const { pseudonimizeaza } = require('./sentrySanitize');
const { codEroare } = require('./codEroare');

function esteTokenFencingValid(token) {
  return Number.isInteger(token) && token > 0;
}

function parseazaExpirareLeaseValida(leaseExpiresAt, nowMs = Date.now()) {
  if (typeof leaseExpiresAt !== 'string' || leaseExpiresAt.trim().length === 0) {
    return null;
  }
  const timestamp = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(timestamp) || timestamp <= nowMs) {
    return null;
  }
  return timestamp;
}

/**
 * Actualizează statusul unui rând din outbox cu verificare de proprietate (workerId, fencingToken, expectedStatus).
 * Respinge tranzacția dacă lease-ul a expirat sau dacă tokenul de fencing a fost depășit.
 */
async function actualizeazaStatusOutbox(supabaseAdmin, id, payload, {
  workerId,
  fencingToken,
  expectedStatus,
} = {}) {
  if (
    typeof id !== 'string'
    || id.trim().length === 0
    || typeof workerId !== 'string'
    || workerId.trim().length === 0
    || !esteTokenFencingValid(fencingToken)
  ) {
    const error = new Error('GDPR_OUTBOX_STATUS_UPDATE_FAILED');
    error.code = 'GDPR_OUTBOX_STATUS_UPDATE_FAILED';
    throw error;
  }

  let query = supabaseAdmin
    .from('gdpr_deletions')
    .update(payload)
    .eq('id', id);

  if (expectedStatus && typeof query?.eq === 'function') {
    query = query.eq('status', expectedStatus);
  }
  if (typeof query?.eq === 'function') {
    query = query.eq('claimed_by', workerId);
  }
  if (typeof query?.eq === 'function') {
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
 * Un raspuns boolean legacy, malformat, fara fencing_token pozitiv sau fara lease_expires_at valid in viitor
 * este respins fail-closed. Zero operații distructive sunt permise fără claim valid.
 */
async function revendicaRandOutbox(supabaseAdmin, id, {
  workerId,
  expectedStatus,
  leaseSeconds = 300,
} = {}) {
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  const normalizedWorkerId = typeof workerId === 'string' ? workerId.trim() : '';
  const normalizedStatus = typeof expectedStatus === 'string' ? expectedStatus.trim() : '';
  if (!normalizedId || !normalizedWorkerId || !normalizedStatus) {
    return { success: false, error: 'INVALID_CLAIM_PARAMETERS' };
  }
  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    return { success: false, error: 'RPC_UNAVAILABLE' };
  }
  try {
    const res = await supabaseAdmin.rpc('claim_gdpr_deletion', {
      p_id: normalizedId,
      p_worker_id: normalizedWorkerId,
      p_expected_status: normalizedStatus,
      p_lease_seconds: leaseSeconds,
    });
    if (res?.error) {
      return { success: false, error: res.error };
    }
    const data = res?.data;
    if (typeof data === 'boolean') {
      return { success: false, error: 'LEGACY_BOOLEAN_CLAIM_REJECTED' };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.success !== true) {
      return { success: false, error: data?.error || 'CLAIM_REJECTED' };
    }
    if (!esteTokenFencingValid(data.fencing_token)) {
      return { success: false, error: 'INVALID_FENCING_TOKEN' };
    }
    const leaseTimestamp = parseazaExpirareLeaseValida(data.lease_expires_at);
    if (leaseTimestamp === null) {
      return { success: false, error: 'INVALID_OR_EXPIRED_LEASE' };
    }
    if (data.id !== undefined && data.id !== normalizedId) {
      return { success: false, error: 'CLAIM_JOB_ID_MISMATCH' };
    }
    if (data.claimed_by !== undefined && data.claimed_by !== normalizedWorkerId) {
      return { success: false, error: 'CLAIM_OWNER_MISMATCH' };
    }
    if (data.worker_id !== undefined && data.worker_id !== normalizedWorkerId) {
      return { success: false, error: 'CLAIM_OWNER_MISMATCH' };
    }
    if (data.status !== undefined && data.status !== normalizedStatus) {
      return { success: false, error: 'CLAIM_STATUS_MISMATCH' };
    }
    return {
      success: true,
      workerId: normalizedWorkerId,
      fencingToken: data.fencing_token,
      leaseExpiresAt: data.lease_expires_at,
    };
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
  if (
    !supabaseAdmin
    || typeof supabaseAdmin.rpc !== 'function'
    || typeof id !== 'string'
    || !id.trim()
    || typeof workerId !== 'string'
    || !workerId.trim()
    || !esteTokenFencingValid(fencingToken)
  ) {
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
  const data = res?.data;
  if (
    res?.error
    || !data
    || typeof data !== 'object'
    || data.success !== true
    || (data.fencing_token !== undefined && data.fencing_token !== fencingToken)
    || parseazaExpirareLeaseValida(data.lease_expires_at) === null
  ) {
    const err = new Error('GDPR_LEASE_RENEWAL_FAILED');
    err.code = 'GDPR_LEASE_RENEWAL_FAILED';
    if (res?.error) err.cause = res.error;
    throw err;
  }
  return data;
}

async function asiguraLeaseActiv(supabaseAdmin, id, {
  workerId,
  fencingToken,
  leaseExpiresAt = null,
  leaseSeconds = 300,
} = {}) {
  if (
    typeof id !== 'string'
    || !id.trim()
    || typeof workerId !== 'string'
    || !workerId.trim()
    || !esteTokenFencingValid(fencingToken)
  ) {
    const err = new Error('GDPR_LEASE_INVALID');
    err.code = 'GDPR_LEASE_INVALID';
    throw err;
  }
  const nowMs = Date.now();
  const expMs = parseazaExpirareLeaseValida(leaseExpiresAt, nowMs);
  if (expMs === null) {
    const err = new Error('GDPR_LEASE_EXPIRED');
    err.code = 'GDPR_LEASE_EXPIRED';
    throw err;
  }
  const remainingMs = expMs - nowMs;
  if (remainingMs > 120 * 1000) {
    return leaseExpiresAt;
  }
  const renewed = await reinoiesteLeaseOutbox(supabaseAdmin, id, {
    workerId,
    fencingToken,
    leaseSeconds,
  });
  return renewed.lease_expires_at;
}

async function cuReinnoireLeaseContinua(operatie, reinnoieste, intervalMs = 45_000) {
  let eroareLease = null;
  let oprit = false;
  const timer = setInterval(async () => {
    if (oprit || eroareLease) return;
    try {
      await reinnoieste();
    } catch (err) {
      eroareLease = err;
    }
  }, intervalMs);
  if (typeof timer?.unref === 'function') timer.unref();

  try {
    const rezultat = await operatie();
    if (eroareLease) throw eroareLease;
    return rezultat;
  } finally {
    oprit = true;
    clearInterval(timer);
  }
}

/**
 * Pregătire canonică pre-delete (rută + worker):
 * 1. Verifică lease-ul activ.
 * 2. Enumeră paginat toate fileId-urile ImageKit din `mese` (fail-closed la eroare sau trunchiere).
 * 3. Citește și combină cu `file_ids` deja persistate în `gdpr_deletions` (nu suprascrie niciodată o listă
 *    existentă cu una goală dacă `mese` a fost deja parțial sau integral ștearsă la o încercare anterioară).
 * 4. Persistează durabil `file_ids` în `gdpr_deletions` sub protecție de fencing ÎNAINTE de ștergerea DB.
 */
async function pregatesteSiPersistaFileIdsOutbox(supabaseAdmin, {
  outboxId,
  userId,
  workerId,
  fencingToken,
  leaseExpiresAt,
  existingFileIds = null,
} = {}) {
  const updatedLeaseExpiresAt = await asiguraLeaseActiv(supabaseAdmin, outboxId, {
    workerId,
    fencingToken,
    leaseExpiresAt,
  });

  const merged = new Set(
    Array.isArray(existingFileIds)
      ? existingFileIds.filter((fid) => typeof fid === 'string' && fid.trim().length > 0)
      : [],
  );

  let extrase = new Set();
  if (userId) {
    const tabelMese = supabaseAdmin.from('mese');
    if (typeof tabelMese?.select === 'function') {
      extrase = await extrageFileIdsUtilizator({ supabaseAdmin, userId });
    }
  }

  let retryCountDinOutbox = null;
  let cititDinDb = false;
  const tabelOutbox = supabaseAdmin.from('gdpr_deletions');
  const selectQuery = typeof tabelOutbox?.select === 'function'
    ? tabelOutbox.select('file_ids,retry_count')
    : null;
  if (selectQuery && typeof selectQuery.eq === 'function') {
    const { data: randOutbox, error: eroareCitireOutbox } = await selectQuery
      .eq('id', outboxId)
      .maybeSingle();
    if (eroareCitireOutbox || !randOutbox) {
      const err = new Error('GDPR_OUTBOX_FILE_IDS_READ_FAILED');
      err.code = 'GDPR_OUTBOX_FILE_IDS_READ_FAILED';
      if (eroareCitireOutbox) err.cause = eroareCitireOutbox;
      throw err;
    }
    cititDinDb = true;
    if (typeof randOutbox.retry_count === 'number') {
      retryCountDinOutbox = randOutbox.retry_count;
    }
    if (Array.isArray(randOutbox.file_ids)) {
      for (const fid of randOutbox.file_ids) {
        if (typeof fid === 'string' && fid.trim().length > 0) {
          merged.add(fid);
        }
      }
    }
  }

  for (const fid of extrase) {
    if (typeof fid === 'string' && fid.trim().length > 0) {
      merged.add(fid);
    }
  }

  if (cititDinDb || merged.size > 0) {
    try {
      await actualizeazaStatusOutbox(supabaseAdmin, outboxId, {
        file_ids: [...merged],
      }, {
        workerId,
        fencingToken,
        expectedStatus: 'pending',
      });
    } catch (err) {
      const persistError = new Error('GDPR_OUTBOX_FILE_IDS_PERSIST_FAILED');
      persistError.code = 'GDPR_OUTBOX_FILE_IDS_PERSIST_FAILED';
      persistError.cause = err;
      throw persistError;
    }
  }

  return {
    fileIds: merged,
    retryCount: retryCountDinOutbox,
    leaseExpiresAt: updatedLeaseExpiresAt,
  };
}

async function stergeRanduriDbUtilizator(
  supabaseAdmin,
  userId,
  clerkUserId = null,
  { onBeforeStep = null } = {},
) {
  if (!userId || !supabaseAdmin) return;
  inregistreazaUtilizareAdmin();
  if (typeof onBeforeStep === 'function') await onBeforeStep();
  const tabele = TABELE_STERGERE_GDPR_UTILIZATOR;
  await stergeEvenimenteRtdnUtilizator({ supabaseAdmin, userId, onBeforeDelete: onBeforeStep });
  for (const tabela of tabele) {
    if (typeof onBeforeStep === 'function') await onBeforeStep();
    const rezultat = await supabaseAdmin.from(tabela).delete().eq('user_id', userId);
    const eroare = rezultat?.error;
    if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) {
      throw new Error(
        `Ștergere eșuată din ${tabela}: ${eroare.code || 'FARA_COD'} ${eroare.message || ''}`.trim(),
      );
    }
  }
  await stergeDeadLetterUtilizator({
    supabaseAdmin, userId, clerkUserId, onBeforeDelete: onBeforeStep,
  });
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
    let leaseExpiresAt = claim.leaseExpiresAt;
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

    let statusCurent = rand.status;
    let fileIds = new Set(Array.isArray(rand.file_ids) ? rand.file_ids : []);
    const verificaSiReinnoiesteLease = async () => {
      leaseExpiresAt = await asiguraLeaseActiv(supabaseAdmin, rand.id, {
        workerId,
        fencingToken,
        leaseExpiresAt,
      });
    };

    try {
      // Pasul 1 (dacă s-a oprit la pending): enumerare + persistare durabilă file_ids ÎNAINTE de DB delete
      if (statusCurent === 'pending') {
        const pregatire = await pregatesteSiPersistaFileIdsOutbox(supabaseAdmin, {
          outboxId: rand.id,
          userId: rand.user_id,
          workerId,
          fencingToken,
          leaseExpiresAt,
          existingFileIds: Array.isArray(rand.file_ids) ? rand.file_ids : [],
        });
        fileIds = pregatire.fileIds;
        leaseExpiresAt = pregatire.leaseExpiresAt;

        if (rand.user_id) {
          await stergeRanduriDbUtilizator(supabaseAdmin, rand.user_id, rand.clerk_user_id, {
            onBeforeStep: verificaSiReinnoiesteLease,
          });
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
        await verificaSiReinnoiesteLease();
        if (rand.clerk_user_id) {
          await cuReinnoireLeaseContinua(
            () => stergeIdentitateClerk({
              clerkUserId: rand.clerk_user_id,
              secretKey: process.env.CLERK_SECRET_KEY?.trim(),
            }),
            verificaSiReinnoiesteLease,
          );
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
        await verificaSiReinnoiesteLease();
        if (rand.user_id) {
          await cuReinnoireLeaseContinua(
            () => stergeActiveImageKit({
              userId: rand.user_id,
              fileIds,
              privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim() || config?.imagekit?.privateKey,
              onBeforeStep: verificaSiReinnoiesteLease,
            }),
            verificaSiReinnoiesteLease,
          );
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
        await verificaSiReinnoiesteLease();
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
        await verificaSiReinnoiesteLease();
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
          ...(numariIncercare >= 5 ? { status: 'failed' } : {}),
          last_error: codEroare(e),
          retry_count: numariIncercare,
        }, {
          workerId,
          fencingToken,
          expectedStatus: statusCurent,
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
  asiguraLeaseActiv,
  cuReinnoireLeaseContinua,
  pregatesteSiPersistaFileIdsOutbox,
  stergeRanduriDbUtilizator,
  reiaStergerileBlocate,
};
