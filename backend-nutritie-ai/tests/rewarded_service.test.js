'use strict';

const { createRewardedService } = require('../services/monetization/rewardedService');
const USER = '11111111-1111-4111-8111-111111111111';

describe('rewarded service', () => {
  test('creates an opaque ten-minute intent bound to the authenticated user', async () => {
    const repo = { createIntent: jest.fn(async x => x), grantVerified: jest.fn() };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn(async () => ({ rewardedGrantsRemaining: 1 })) }, now: () => new Date('2030-01-01T00:00:00Z') });
    const value = await service.createIntent({ userId: USER });
    expect(value.expiresAt).toBe('2030-01-01T00:10:00.000Z');
    expect(repo.createIntent).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, customDataHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
  test('blocks intent creation when five rewards were already granted', async () => {
    const repo = { createIntent: jest.fn(), grantVerified: jest.fn() };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn(async () => ({ rewardedGrantsRemaining: 0 })) } });
    await expect(service.createIntent({ userId: USER })).rejects.toMatchObject({ code: 'REWARDED_DAILY_LIMIT', status: 429 });
    expect(repo.createIntent).not.toHaveBeenCalled();
  });
  test('sends only a hash of custom_data to the atomic SQL authority', async () => {
    const repo = { createIntent: jest.fn(), grantVerified: jest.fn(async () => ({ applied: true, amount: 1 })) };
    const service = createRewardedService({ repo, flowCredits: { getBalance: jest.fn() } });
    await service.applyVerified({ intentId: USER, customData: 'opaque-secret', transactionId: 'tx-1' });
    expect(repo.grantVerified).toHaveBeenCalledWith(expect.objectContaining({ intentId: USER, transactionId: 'tx-1', customDataHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(JSON.stringify(repo.grantVerified.mock.calls)).not.toContain('opaque-secret');
  });
});
