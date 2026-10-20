'use strict';

function unwrapRpc(result, operation) {
  if (result?.error) {
    const error = new Error(`Flow Credits RPC failed: ${operation}.`);
    error.code = 'FLOW_CREDITS_RPC_FAILED';
    error.cause = result.error;
    throw error;
  }
  if (!result || typeof result.data !== 'object' || result.data === null) {
    const error = new Error(`Flow Credits RPC returned an invalid result: ${operation}.`);
    error.code = 'FLOW_CREDITS_RPC_INVALID_RESULT';
    throw error;
  }
  return result.data;
}

function createFlowCreditsRepo({ supabaseAdmin, rewardLimit = 5, dailyLimit = 3, premiumFairUse = 50 } = {}) {
  if (!supabaseAdmin?.rpc) throw new TypeError('Supabase admin RPC client is required.');
  return Object.freeze({
    async getBalance({ userId, now }) {
      return unwrapRpc(await supabaseAdmin.rpc('flow_credits_balance', {
        p_user_id: userId, p_now: now, p_daily_limit: dailyLimit, p_reward_limit: rewardLimit,
      }), 'balance');
    },
    async reservePhoto({ userId, logicalAnalysisId, requestFingerprint, now, entitlement }) {
      return unwrapRpc(await supabaseAdmin.rpc('reserve_flow_photo_credit_v2', {
        p_user_id: userId,
        p_logical_analysis_id: logicalAnalysisId,
        p_request_fingerprint: requestFingerprint,
        p_entitlement: entitlement || 'free',
        p_now: now,
        p_daily_limit: dailyLimit,
        p_premium_fair_use: premiumFairUse,
      }), 'reservePhoto');
    },
    async claimPhotoInference(input) {
      return unwrapRpc(await supabaseAdmin.rpc('claim_flow_photo_inference', {
        p_user_id: input.userId,
        p_reservation_id: input.reservationId,
        p_request_fingerprint: input.requestFingerprint,
        p_job_id: input.jobId || null,
        p_logical_analysis_id: input.logicalAnalysisId || null,
        p_image_url: input.imageUrl || null,
        p_image_file_id: input.imageFileId || null,
        p_now: input.now,
      }), 'claimPhotoInference');
    },
    async recordPhotoResult({ userId, reservationId, requestFingerprint, result }) {
      return unwrapRpc(await supabaseAdmin.rpc('record_flow_photo_result', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_request_fingerprint: requestFingerprint,
        p_result: result,
      }), 'recordPhotoResult');
    },
    async reconcilePhotoResult({ userId, reservationId, jobId, now }) {
      return unwrapRpc(await supabaseAdmin.rpc('reconcile_flow_photo_result', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_job_id: jobId,
        p_now: now,
      }), 'reconcilePhotoResult');
    },
    async listPhotoOutcomeReconciliationQueue({ limit = 50, now } = {}) {
      return unwrapRpc(await supabaseAdmin.rpc('list_flow_photo_outcome_reconciliation_queue', {
        p_limit: limit,
        p_now: now,
      }), 'listPhotoOutcomeReconciliationQueue');
    },
    async resolvePhotoOutcomeUnknown({ userId, reservationId, evidenceReference, operatorId, now }) {
      return unwrapRpc(await supabaseAdmin.rpc('resolve_flow_photo_outcome_unknown', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_confirmed_failure: true,
        p_evidence_reference: evidenceReference,
        p_resolved_by: operatorId,
        p_now: now,
      }), 'resolvePhotoOutcomeUnknown');
    },
    async settlePhoto({ userId, reservationId, action, reason = null, now }) {
      return unwrapRpc(await supabaseAdmin.rpc('settle_flow_photo_credit_v2', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_action: action,
        p_reason: reason,
        p_now: now || new Date().toISOString(),
      }), 'settlePhoto');
    },
  });
}

module.exports = { createFlowCreditsRepo };
