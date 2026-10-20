'use strict';

const { createRewardedService } = require('../services/monetization/rewardedService');
const USER = '11111111-1111-4111-8111-111111111111';
const TOKEN_HASH = 'a'.repeat(64);
const REQUEST_HASH = 'b'.repeat(43);
const BINDING = { tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH };

describe('rewarded service', () => {
  test('creates an opaque ten-minute intent bound to the authenticated user', async () => {
    const repo = {
      findByIntegrityTokenHash: jest.fn(async () => null),
      createIntent: jest.fn(async x => ({ ok: true, id: x.id, userId: x.userId, requestHash: x.requestHash,
        customData: x.customData, expiresAt: x.expiresAt, status: 'PENDING', replay: false })),
      grantVerified: jest.fn(),
    };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn(async () => ({ rewardedGrantsRemaining: 1 })) }, now: () => new Date('2030-01-01T00:00:00Z') });
    const value = await service.createIntent({ userId: USER, ...BINDING });
    expect(value.expiresAt).toBe('2030-01-01T00:10:00.000Z');
    expect(repo.createIntent).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER,
      tokenHash: TOKEN_HASH,
      requestHash: REQUEST_HASH,
      customDataHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
  test('blocks intent creation when five rewards were already granted', async () => {
    const repo = { findByIntegrityTokenHash: jest.fn(async () => null), createIntent: jest.fn(), grantVerified: jest.fn() };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn(async () => ({ rewardedGrantsRemaining: 0 })) } });
    await expect(service.createIntent({ userId: USER, ...BINDING })).rejects.toMatchObject({ code: 'REWARDED_DAILY_LIMIT', status: 429 });
    expect(repo.createIntent).not.toHaveBeenCalled();
  });
  test('returns the original durable intent on an exact token and request replay without checking balance', async () => {
    const original = { id: 'intent-1', userId: USER, tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH,
      customData: 'original-secret', expiresAt: '2030-01-01T00:10:00.000Z', status: 'PENDING' };
    const repo = {
      findByIntegrityTokenHash: jest.fn(async () => original),
      createIntent: jest.fn(), grantVerified: jest.fn(),
    };
    const getBalance = jest.fn();
    const service = createRewardedService({ repo, flowCredits: { getBalance } });
    await expect(service.createIntent({ userId: USER, ...BINDING })).resolves.toEqual({
      intentId: 'intent-1', customData: 'original-secret', expiresAt: original.expiresAt, status: 'PENDING', replay: true,
    });
    expect(getBalance).not.toHaveBeenCalled();
    expect(repo.createIntent).not.toHaveBeenCalled();
  });
  test('returns an exact replay as expired after the original expiry without extending or recreating it', async () => {
    const original = { id: 'intent-1', userId: USER, requestHash: REQUEST_HASH,
      customData: 'original-secret', expiresAt: '2029-12-31T23:59:59.000Z', status: 'PENDING' };
    const repo = {
      findByIntegrityTokenHash: jest.fn(async () => original),
      createIntent: jest.fn(), grantVerified: jest.fn(),
    };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn() }, now: () => new Date('2030-01-01T00:00:00Z') });
    await expect(service.createIntent({ userId: USER, ...BINDING })).resolves.toEqual({
      intentId: 'intent-1', customData: 'original-secret', expiresAt: original.expiresAt, status: 'EXPIRED', replay: true,
    });
    expect(repo.createIntent).not.toHaveBeenCalled();
  });
  test.each([
    [{ userId: '22222222-2222-4222-8222-222222222222', ...BINDING }],
    [{ userId: USER, tokenHash: TOKEN_HASH, requestHash: 'c'.repeat(43) }],
  ])('rejects a cross-user or modified binding replay', async (request) => {
    const repo = {
      findByIntegrityTokenHash: jest.fn(async () => ({ id: 'intent-1', userId: USER,
        tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH, customData: 'original-secret',
        expiresAt: '2030-01-01T00:10:00.000Z', status: 'PENDING' })),
      createIntent: jest.fn(), grantVerified: jest.fn(),
    };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn() } });
    await expect(service.createIntent(request)).rejects.toMatchObject({ code: 'REWARDED_TOKEN_REPLAY', status: 403 });
    expect(repo.createIntent).not.toHaveBeenCalled();
  });
  test('sends only a hash of custom_data to the atomic SQL authority', async () => {
    const repo = { createIntent: jest.fn(), grantVerified: jest.fn(async () => ({ applied: true, amount: 1 })) };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn() } });
    await service.applyVerified({ intentId: USER, customData: 'opaque-secret', transactionId: 'tx-1' });
    expect(repo.grantVerified).toHaveBeenCalledWith(expect.objectContaining({ intentId: USER, transactionId: 'tx-1', customDataHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(JSON.stringify(repo.grantVerified.mock.calls)).not.toContain('opaque-secret');
  });

  test('returns owner-scoped status without exposing SSV secrets', async () => {
    const repo = {
      createIntent: jest.fn(),
      grantVerified: jest.fn(),
      getIntentStatus: jest.fn(async ({ intentId, userId }) => ({ id: intentId, userId, status: 'GRANTED', expiresAt: '2030-01-01T00:10:00.000Z' })),
    };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn() } });
    const status = await service.getIntentStatus({ intentId: 'intent-1', userId: USER });
    expect(status).toEqual({ status: 'GRANTED' });
    expect(repo.getIntentStatus).toHaveBeenCalledWith({ intentId: 'intent-1', userId: USER });
    expect(status).not.toHaveProperty('customDataHash');
    expect(status).not.toHaveProperty('transactionId');
  });

  test('reports a pending owner-scoped intent as expired after its deadline', async () => {
    const repo = {
      createIntent: jest.fn(), grantVerified: jest.fn(),
      getIntentStatus: jest.fn(async () => ({ status: 'PENDING', expiresAt: '2029-12-31T23:59:59.000Z' })),
    };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn() }, now: () => new Date('2030-01-01T00:00:00Z') });
    await expect(service.getIntentStatus({ intentId: 'intent-1', userId: USER })).resolves.toEqual({ status: 'EXPIRED' });
  });
});
