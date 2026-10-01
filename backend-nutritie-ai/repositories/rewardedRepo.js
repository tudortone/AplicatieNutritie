'use strict';

function createRewardedRepo({ supabaseAdmin, dailyLimit = 5 } = {}) {
  if (!supabaseAdmin?.from || !supabaseAdmin?.rpc) throw new TypeError('Supabase admin client is required.');
  return Object.freeze({
    async createIntent({ id, userId, customDataHash, expiresAt }) {
      const { error } = await supabaseAdmin.from('flow_reward_intents').insert({
        id, user_id: userId, custom_data_hash: customDataHash, expires_at: expiresAt,
      });
      if (error) throw error;
      return { id, userId, expiresAt };
    },
    async grantVerified({ intentId, customDataHash, transactionId, now }) {
      const { data, error } = await supabaseAdmin.rpc('grant_flow_reward_ssv', {
        p_intent_id: intentId,
        p_custom_data_hash: customDataHash,
        p_transaction_id: transactionId,
        p_now: now,
        p_daily_limit: dailyLimit,
      });
      if (error) throw error;
      return data;
    },
  });
}

module.exports = { createRewardedRepo };
