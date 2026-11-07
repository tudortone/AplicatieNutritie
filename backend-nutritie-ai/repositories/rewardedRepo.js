'use strict';

function createRewardedRepo({ supabaseAdmin, dailyLimit = 5 } = {}) {
  if (!supabaseAdmin?.from || !supabaseAdmin?.rpc) throw new TypeError('Supabase admin client is required.');
  return Object.freeze({
    async findByIntegrityTokenHash({ tokenHash }) {
      try {
        const { data, error } = await supabaseAdmin.rpc('get_flow_reward_intent_by_integrity_token', {
          p_token_hash: tokenHash,
        });
        if (error) {
          if (error.code === 'PGRST202' || error.code === '42883') {
            return null;
          }
          throw error;
        }
        if (!data) return null;
        return {
          id: data.id,
          userId: data.userId,
          requestHash: data.requestHash,
          customData: data.customData,
          expiresAt: data.expiresAt,
          status: data.status,
        };
      } catch (err) {
        if (err.code === 'PGRST202' || err.code === '42883') {
          return null;
        }
        throw err;
      }
    },
    async createIntent({ id, userId, customData, customDataHash, tokenHash, requestHash, expiresAt }) {
      try {
        const { data, error } = await supabaseAdmin.rpc('create_flow_reward_intent_idempotent', {
          p_id: id,
          p_user_id: userId,
          p_custom_data: customData,
          p_custom_data_hash: customDataHash,
          p_token_hash: tokenHash,
          p_request_hash: requestHash,
          p_expires_at: expiresAt,
        });
        if (error) {
          if (error.code === 'PGRST202' || error.code === '42883') {
            const insertResult = await supabaseAdmin.from('flow_reward_intents').insert({
              id,
              user_id: userId,
              custom_data_hash: customDataHash,
              expires_at: expiresAt,
              status: 'PENDING',
            });
            if (insertResult.error) throw insertResult.error;
            return {
              ok: true,
              id,
              userId,
              customData,
              requestHash,
              expiresAt,
              status: 'PENDING',
              replay: false,
            };
          }
          throw error;
        }
        return data;
      } catch (err) {
        if (err.code === 'PGRST202' || err.code === '42883') {
          const insertResult = await supabaseAdmin.from('flow_reward_intents').insert({
            id,
            user_id: userId,
            custom_data_hash: customDataHash,
            expires_at: expiresAt,
            status: 'PENDING',
          });
          if (insertResult.error) throw insertResult.error;
          return {
            ok: true,
            id,
            userId,
            customData,
            requestHash,
            expiresAt,
            status: 'PENDING',
            replay: false,
          };
        }
        throw err;
      }
    },
    async getIntentStatus({ intentId, userId }) {
      const { data, error } = await supabaseAdmin
        .from('flow_reward_intents')
        .select('status,expires_at')
        .eq('id', intentId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { status: data.status, expiresAt: data.expires_at };
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
