'use strict';

/**
 * H3: Reconciliere credite AI (crash-window).
 *
 * Debitele `consuma_credit` sunt înregistrate atomic ca rânduri CONSUM_AI în
 * `credite_tranzactii`. Dacă procesul moare între debit și răspuns, rândul
 * rămâne fără marcaj `ok:` (succes) și fără `refund:` (eșec) — creditul ar fi
 * ars fără rezultat. Acest runner cheamă periodic
 * `reconcilia_credite_consumate()` care restituie debitele orfane, atomic și
 * idempotent pe event_id (exact ca aplica_tranzactie_credite pentru refund-ul
 * in-request).
 */

const Sentry = require('@sentry/node');
const { inregistreazaUtilizareAdmin } = require('./clientUtilizator');

async function reconciliaCrediteConsumate({ supabaseAdmin } = {}) {
  if (!supabaseAdmin) {
    console.warn('[Reconciliere credite] supabaseAdmin lipsa — tick ratat.');
    return { procesate: 0, erori: 1 };
  }

  // C1-S4: RPC de reconciliere executat prin client admin (service_role),
  // fara context per-cerere — job periodic, nu cerere de utilizator.
  inregistreazaUtilizareAdmin();

  const { data, error } = await supabaseAdmin.rpc('reconcilia_credite_consumate');
  if (error) {
    console.error('[Reconciliere credite] RPC esuat:', error.message);
    // H3: mișcarea de bani trebuie să fie vizibilă — fail-loud în Sentry,
    // ca pattern-ul M2 din gdpr.js (nu o înghițim cu un console.log).
    try {
      Sentry.withScope((scope) => {
        scope.setLevel('error');
        scope.setTag('reconcile.credite.failed', 'true');
        Sentry.captureException(error);
      });
    } catch {
      // Sentry indisponibil — eroarea e deja logată mai sus
    }
    return { procesate: 0, erori: 1 };
  }

  const randuri = Array.isArray(data) ? data : [];
  for (const r of randuri) {
    console.log(
      `[Reconciliere credite] Restituit credit: user=${r.user_id} consum=${r.event_id} refund=${r.refund_event_id} sold=${r.sold_nou}`
    );
  }
  if (randuri.length > 0) {
    console.log(`[Reconciliere credite] ${randuri.length} credit(e) restituite in acest tick.`);
  }
  return { procesate: randuri.length, erori: 0 };
}

module.exports = { reconciliaCrediteConsumate };
