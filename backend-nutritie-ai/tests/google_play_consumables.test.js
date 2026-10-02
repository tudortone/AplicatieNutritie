'use strict';

const {
  createGoogleBillingService,
  googlePlayAccountId,
  hashPurchaseToken,
} = require('../services/billing/googleBillingService');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'purchase-token-that-is-long-enough-123';

function build({ accountId = googlePlayAccountId(USER_ID), state = 'PURCHASED', consumeError } = {}) {
  const calls = [];
  const publisher = {
    getProductPurchase: jest.fn(async () => ({
      purchaseStateContext: { purchaseState: state },
      productLineItem: [{ productId: 'getflow_credits_10' }],
      externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
    })),
    consumeProduct: jest.fn(async () => {
      calls.push('consume');
      if (consumeError) throw consumeError;
    }),
  };
  const flowCredits = {
    grantPackVerified: jest.fn(async ({ purchaseEventId }) => {
      calls.push('grant');
      return { applied: true, amount: 10, replay: false, purchaseEventId };
    }),
  };
  const repo = {
    getPaidEntitlement: jest.fn(),
  };
  return {
    calls, publisher, flowCredits,
    service: createGoogleBillingService({
      publisher, repo,
      allowedProductIds: ['premium_monthly', 'premium_annual'],
      allowedCreditProductIds: ['getflow_credits_10', 'getflow_credits_30'],
      flowCredits,
    }),
  };
}

describe('Google Play consumable Flow Credit packs', () => {
  test('verifies owner/product/purchased, durably grants, then consumes', async () => {
    const h = build();
    const result = await h.service.verifyConsumable({
      userId: USER_ID, purchaseToken: TOKEN, productId: 'getflow_credits_10',
    });
    expect(result).toEqual(expect.objectContaining({
      validatServer: true, productId: 'getflow_credits_10', creditsGranted: 10, consumed: true,
    }));
    expect(h.flowCredits.grantPackVerified).toHaveBeenCalledWith({
      userId: USER_ID,
      purchaseEventId: hashPurchaseToken(TOKEN),
      productId: 'getflow_credits_10',
    });
    expect(h.calls).toEqual(['grant', 'consume']);
  });

  test('rejects account mismatch before grant or consume', async () => {
    const h = build({ accountId: googlePlayAccountId('another-user') });
    await expect(h.service.verifyConsumable({
      userId: USER_ID, purchaseToken: TOKEN, productId: 'getflow_credits_10',
    })).rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH', status: 409 });
    expect(h.flowCredits.grantPackVerified).not.toHaveBeenCalled();
    expect(h.publisher.consumeProduct).not.toHaveBeenCalled();
  });

  test('rejects pending/unrecognized products before durable grant', async () => {
    const h = build({ state: 'PENDING' });
    await expect(h.service.verifyConsumable({
      userId: USER_ID, purchaseToken: TOKEN, productId: 'getflow_credits_10',
    })).rejects.toMatchObject({ code: 'PURCHASE_NOT_COMPLETED' });
    await expect(h.service.verifyConsumable({
      userId: USER_ID, purchaseToken: TOKEN, productId: 'other_pack',
    })).rejects.toMatchObject({ code: 'PRODUCT_NOT_ALLOWED', status: 403 });
  });

  test('a consume failure is retryable without allowing a second credit grant', async () => {
    const h = build({ consumeError: new Error('temporary') });
    await expect(h.service.verifyConsumable({
      userId: USER_ID, purchaseToken: TOKEN, productId: 'getflow_credits_10',
    })).rejects.toMatchObject({ code: 'CONSUME_PENDING', status: 503 });
    expect(h.calls).toEqual(['grant', 'consume']);
  });
});
