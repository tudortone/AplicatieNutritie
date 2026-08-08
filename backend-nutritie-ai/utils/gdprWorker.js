'use strict';

/**
 * P-05: Worker GDPR pentru reluarea automată a ștergerilor întrerupte din outbox.
 */

const Sentry = require('@sentry/node');
const { stergeIdentitateClerk, stergeActiveImageKit, CODURI_TABELA_INEXISTENTA } = require('./gdprServices');
const { inregistreazaUtilizareAdmin, TABELE_CU_RLS_UTILIZATOR } = require('./clientUtilizator');
// TASK-11: tag-urile Sentry nu pot conține identificatori bruti (PII). Folosim
// pseudonimizatorul central ca să păstrăm corelarea unui anumit cont fără a
// expune user_id/sesiunea în telemetrie.
const { pseudonimizeaza } = require('./sentrySanitize');

// Codurile tolerate („tabela nu există") sunt definite o singură dată, în
// utils/gdprServices.js — le importăm de acolo, ca ruta și workerul să
// folosească aceeași listă. Orice altă eroare oprește avansarea statusului,
// altfel am marca `completed` o ștergere care nu s-a întâmplat (P-05b).

async function stergeRanduriDbUtilizator(supabaseAdmin, userId) {
  if (!userId || !supabaseAdmin) return;
  // C1-S4: stergere admin (service_role) pe tabele de utilizator, fara context —
  // calea GDPR worker (reluarea stergerilor intrerupte din outbox).
  inregistreazaUtilizareAdmin();
  // N-03: aceeași listă unică de tabele user-scoped ca ruta — sursa de adevăr e
  // TABELE_CU_RLS_UTILIZATOR din clientUtilizator.js. Un tabel inexistent pe un
  // mediu nou e tolerat prin CODURI_TABELA_INEXISTENTA (importat mai
  // sus din utils/gdprServices.js — definiția unică, nu mai e copiată local).
  const tabele = TABELE_CU_RLS_UTILIZATOR;
  for (const tabela of tabele) {
    // supabase-js NU aruncă pentru erori de bază de date: le întoarce în `error`.
    // Un `catch {}` aici nu s-ar executa niciodată pe calea reală și ar lăsa
    // datele în baza de date cu rândul avansat spre `completed`.
    const rezultat = await supabaseAdmin.from(tabela).delete().eq('user_id', userId);
    const eroare = rezultat?.error;
    if (eroare && !CODURI_TABELA_INEXISTENTA.has(eroare.code)) {
      throw new Error(
        `Ștergere eșuată din ${tabela}: ${eroare.code || 'FARA_COD'} ${eroare.message || ''}`.trim(),
      );
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
          // PII pe tag → pseudonimizat (TASK-11): corelabil dar nu reversibil
          // fără saltul secret. Randul `rand.id` e un ID intern de outbox, nu
          // identificator de utilizator.
          scope.setTag('gdpr.user_pseudonym', pseudonimizeaza(rand.user_id));
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

      // Pasul 2 (dacă s-a oprit după db_done): Clerk delete — REVERSIBIL
      // N-02: aliniat la ordinea rutei (DB → Clerk → ImageKit → auth), nu la
      // ordinea veche (auth înainte de Clerk/ImageKit). M-06: pașii reversibili
      // se execută ÎNAINTE de auth.deleteUser, ca un eșec să lase contul intact.
      if (statusCurent === 'db_done') {
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

      // Pasul 3 (dacă s-a oprit după clerk_done): ImageKit media delete — REVERSIBIL
      if (statusCurent === 'clerk_done') {
        if (rand.user_id) {
          try {
            // N-04: la reluare, fileIds-urile vin din outbox (ruta le-a persistat
            // ÎNAINTE de ștergerea mesei); baza de date e deja ștearsă, deci o
            // re-extragere ar fi goală. Rânduri vechi fără coloana file_ids →
            // listă goală (comportamentul inițial).
            const fileIds = Array.isArray(rand.file_ids) ? new Set(rand.file_ids) : new Set();
            await stergeActiveImageKit({
              userId: rand.user_id,
              fileIds,
              privateKey: process.env.IMAGEKIT_PRIVATE_KEY?.trim() || config?.imagekit?.privateKey,
            });
          } catch (e) {
            const msg = String(e.message);
            if (!msg.includes('404') && !msg.includes('IMAGEKIT_NOT_CONFIGURED')) throw e;
          }
        }
        statusCurent = 'imagekit_done';
        await supabaseAdmin
          .from('gdpr_deletions')
          .update({ status: 'imagekit_done' })
          .eq('id', rand.id);
      }

      // Pasul 4 (dacă s-a oprit după imagekit_done): auth.deleteUser — IREVERSIBIL,
      // ULTIMUL pas (M-06): rulează doar după ce curățarea Clerk/ImageKit a reușit.
      // Statusul `imagekit_done` e scris înaintea operației ireversibile, ca o
      // reluare după un crash în timpul lui deleteUser să reia doar acest pas
      // (404 = deja șters = succes).
      if (statusCurent === 'imagekit_done') {
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

      // Pasul 5 (dacă s-a oprit după auth_done): confirmare finală
      if (statusCurent === 'auth_done') {
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
