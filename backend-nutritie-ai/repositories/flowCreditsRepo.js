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
    async reservePhoto({ userId, logicalAnalysisId, now, entitlement }) {
      return unwrapRpc(await supabaseAdmin.rpc('reserve_flow_photo_credit', {
        p_user_id: userId,
        p_logical_analysis_id: logicalAnalysisId,
        p_entitlement: entitlement || 'free',
        p_now: now,
        p_daily_limit: dailyLimit,
        p_premium_fair_use: premiumFairUse,
      }), 'reservePhoto');
    },
    async settlePhoto({ userId, reservationId, action, reason = null, now }) {
      return unwrapRpc(await supabaseAdmin.rpc('settle_flow_photo_credit', {
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
