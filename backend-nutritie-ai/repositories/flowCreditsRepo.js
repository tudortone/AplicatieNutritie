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

function createFlowCreditsRepo({ supabaseAdmin, rewardLimit = 5 } = {}) {
  if (!supabaseAdmin?.rpc) throw new TypeError('Supabase admin RPC client is required.');
  return Object.freeze({
    async getBalance({ userId, now }) {
      return unwrapRpc(await supabaseAdmin.rpc('flow_credits_balance', {
        p_user_id: userId, p_now: now, p_daily_limit: 3, p_reward_limit: rewardLimit,
      }), 'balance');
    },
  });
}

module.exports = { createFlowCreditsRepo };
