'use strict';

const { createRewardedRepo } = require('../repositories/rewardedRepo');

describe('rewarded intent persistence', () => {
  test('loads replay material only through the restricted token lookup RPC', async () => {
    const rpc = jest.fn(async () => ({ data: {
      id: 'intent-1', userId: 'user-1', requestHash: 'request-hash',
      customData: 'opaque-secret', expiresAt: '2030-01-01T00:10:00Z', status: 'PENDING',
    }, error: null }));
    const repo = createRewardedRepo({ supabaseAdmin: { rpc, from: jest.fn() } });

    await expect(repo.findByIntegrityTokenHash({ tokenHash: 'a'.repeat(64) })).resolves.toEqual({
      id: 'intent-1', userId: 'user-1', requestHash: 'request-hash',
      customData: 'opaque-secret', expiresAt: '2030-01-01T00:10:00Z', status: 'PENDING',
    });
    expect(rpc).toHaveBeenCalledWith('get_flow_reward_intent_by_integrity_token', { p_token_hash: 'a'.repeat(64) });
  });

  test('creates through the atomic idempotent database authority', async () => {
    const rpc = jest.fn(async () => ({ data: { ok: true, replay: false }, error: null }));
    const repo = createRewardedRepo({ supabaseAdmin: { rpc, from: jest.fn() } });
    const intent = {
      id: 'intent-1', userId: 'user-1', customData: 'opaque-secret', customDataHash: 'b'.repeat(64),
      tokenHash: 'a'.repeat(64), requestHash: 'request-hash', expiresAt: '2030-01-01T00:10:00Z',
    };

    await repo.createIntent(intent);
    expect(rpc).toHaveBeenCalledWith('create_flow_reward_intent_idempotent', {
      p_id: intent.id, p_user_id: intent.userId, p_custom_data: intent.customData,
      p_custom_data_hash: intent.customDataHash, p_token_hash: intent.tokenHash,
      p_request_hash: intent.requestHash, p_expires_at: intent.expiresAt,
    });
  });
});
