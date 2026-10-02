'use strict';

const {
  GoogleBillingError,
  createGoogleBillingService,
  googlePlayAccountId,
  hashPurchaseToken,
} = require('../services/billing/googleBillingService');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'google-play-token-1234567890';

function googleSubscription(overrides = {}) {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: googlePlayAccountId(USER_ID),
    },
    lineItems: [{
      productId: 'premium_monthly',
      expiryTime: '2030-01-01T00:00:00.000Z',
      offerDetails: { basePlanId: 'monthly', offerId: 'intro' },
    }],
    ...overrides,
  };
}

function harness({ subscription = googleSubscription(), applyResult, owner = null } = {}) {
  const publisher = {
    getSubscription: jest.fn().mockResolvedValue(subscription),
    acknowledgeSubscription: jest.fn().mockResolvedValue(null),
  };
  const repo = {
    applyVerification: jest.fn().mockImplementation(async (record) => applyResult ?? ({
      applied: true,
      subscription: {
        purchase_token_hash: record.purchaseTokenHash,
        user_id: record.userId,
        product_id: record.productId,
        base_plan_id: record.basePlanId,
        offer_id: record.offerId,
        subscription_state: record.subscriptionState,
        expiry_time: record.expiryTime,
        acknowledgement_state: record.acknowledgementState,
        is_entitled: record.isEntitled,
        is_test_purchase: record.isTestPurchase,
      },
    })),
    applyAcknowledgementResult: jest.fn().mockResolvedValue(true),
    getPaidEntitlement: jest.fn().mockResolvedValue(null),
    findOwnerByToken: jest.fn().mockResolvedValue(owner),
    claimAcknowledgements: jest.fn().mockResolvedValue([]),
  };
  const service = createGoogleBillingService({
    publisher,
    repo,
    allowedProductIds: ['premium_monthly', 'premium_annual'],
    now: () => new Date('2026-09-14T10:00:00.000Z'),
  });
  return { publisher, repo, service };
}

describe('Google Play billing service — autoritate backend', () => {
  test('respinge tokenuri invalide inainte de Google sau baza de date', async () => {
    const { service, publisher, repo } = harness();
    await expect(service.verifyAndPersist({ userId: USER_ID, purchaseToken: ' short token ' }))
      .rejects.toMatchObject({ code: 'INVALID_PURCHASE_TOKEN', status: 400 });
    expect(publisher.getSubscription).not.toHaveBeenCalled();
    expect(repo.applyVerification).not.toHaveBeenCalled();
  });

  test('verifica Google, leaga contul, persista si abia apoi confirma acknowledgement', async () => {
    const { service, publisher, repo } = harness();
    const result = await service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN });

    expect(publisher.getSubscription).toHaveBeenCalledWith(TOKEN);
    expect(repo.applyVerification).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      purchaseToken: TOKEN,
      purchaseTokenHash: hashPurchaseToken(TOKEN),
      productId: 'premium_monthly',
      basePlanId: 'monthly',
      offerId: 'intro',
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      isEntitled: true,
    }));
    expect(repo.applyVerification.mock.invocationCallOrder[0])
      .toBeLessThan(publisher.acknowledgeSubscription.mock.invocationCallOrder[0]);
    expect(publisher.acknowledgeSubscription).toHaveBeenCalledWith(TOKEN, 'premium_monthly');
    expect(repo.applyAcknowledgementResult).toHaveBeenCalledWith(expect.objectContaining({
      purchaseToken: TOKEN,
      succeeded: true,
    }));
    expect(result).toMatchObject({
      premium: true,
      productId: 'premium_monthly',
      expiresDate: '2030-01-01T00:00:00.000Z',
      acknowledgementPending: false,
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  test('nu persista si nu acorda un produs din afara allowlist-ului', async () => {
    const { service, repo } = harness({
      subscription: googleSubscription({
        lineItems: [{ productId: 'attacker_product', expiryTime: '2030-01-01T00:00:00.000Z' }],
      }),
    });
    await expect(service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN }))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_ALLOWED', status: 403 });
    expect(repo.applyVerification).not.toHaveBeenCalled();
  });

  test.each([
    undefined,
    { obfuscatedExternalAccountId: googlePlayAccountId(OTHER_USER_ID) },
  ])('respinge achizitia directa fara identificatorul contului curent (%p)', async (externalAccountIdentifiers) => {
    const { service, repo } = harness({
      subscription: googleSubscription({ externalAccountIdentifiers }),
    });
    await expect(service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN }))
      .rejects.toMatchObject({ code: 'ACCOUNT_MISMATCH', status: 409 });
    expect(repo.applyVerification).not.toHaveBeenCalled();
  });

  test('persista pending fail-closed si nu incearca acknowledgement', async () => {
    const { service, publisher, repo } = harness({
      subscription: googleSubscription({
        subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
      }),
    });
    const result = await service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN });
    expect(repo.applyVerification).toHaveBeenCalledWith(expect.objectContaining({ isEntitled: false }));
    expect(publisher.acknowledgeSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({ premium: false, acknowledgementPending: true });
  });

  test('pending-purchase-canceled ramane ne-entitled si revalideaza tokenul vechi legat', async () => {
    const { service, publisher, repo } = harness();
    const linkedToken = 'google-play-linked-token-123456';
    publisher.getSubscription
      .mockResolvedValueOnce(googleSubscription({
        subscriptionState: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
        linkedPurchaseToken: linkedToken,
      }))
      .mockResolvedValueOnce(googleSubscription({
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        linkedPurchaseToken: undefined,
      }));

    const result = await service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN });
    expect(publisher.getSubscription).toHaveBeenNthCalledWith(1, TOKEN);
    expect(publisher.getSubscription).toHaveBeenNthCalledWith(2, linkedToken);
    expect(repo.applyVerification).toHaveBeenNthCalledWith(1, expect.objectContaining({
      purchaseToken: TOKEN,
      linkedPurchaseToken: linkedToken,
      isEntitled: false,
    }));
    expect(repo.applyVerification).toHaveBeenNthCalledWith(2, expect.objectContaining({
      purchaseToken: linkedToken,
      isEntitled: true,
    }));
    expect(result).toMatchObject({ premium: true, productId: 'premium_monthly' });
  });

  test('pastreaza entitlement-ul persistent cand transportul acknowledgement esueaza', async () => {
    const { service, publisher, repo } = harness();
    publisher.acknowledgeSubscription.mockRejectedValue(Object.assign(new Error('secret response'), {
      code: 'GOOGLE_PLAY_UNAVAILABLE',
    }));

    const result = await service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN });
    expect(result).toMatchObject({ premium: true, acknowledgementPending: true });
    expect(repo.applyAcknowledgementResult).toHaveBeenCalledWith(expect.objectContaining({
      purchaseToken: TOKEN,
      succeeded: false,
      errorCode: 'GOOGLE_PLAY_UNAVAILABLE',
      nextRetryAt: '2026-09-14T10:05:00.000Z',
    }));
    expect(JSON.stringify(result)).not.toContain('secret response');
  });

  test('raspunsul foloseste verdictul persistat, inclusiv cand o verificare veche pierde cursa', async () => {
    const { service } = harness({
      applyResult: {
        applied: false,
        subscription: {
          product_id: 'premium_monthly',
          subscription_state: 'SUBSCRIPTION_STATE_EXPIRED',
          expiry_time: '2026-09-01T00:00:00.000Z',
          acknowledgement_state: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
          is_entitled: false,
          is_test_purchase: false,
        },
      },
    });
    await expect(service.verifyAndPersist({ userId: USER_ID, purchaseToken: TOKEN }))
      .resolves.toMatchObject({ premium: false, state: 'SUBSCRIPTION_STATE_EXPIRED' });
  });

  test('resync deduplica tokenurile si nu accepta un lot nelimitat', async () => {
    const { service, publisher } = harness();
    await service.resync({ userId: USER_ID, purchaseTokens: [TOKEN, TOKEN] });
    expect(publisher.getSubscription).toHaveBeenCalledTimes(1);

    await expect(service.resync({
      userId: USER_ID,
      purchaseTokens: Array.from({ length: 21 }, (_, i) => `google-play-token-${String(i).padStart(20, '0')}`),
    })).rejects.toMatchObject({ code: 'TOO_MANY_PURCHASE_TOKENS', status: 400 });
  });

  test('RTDN refoloseste proprietarul persistent si ignora sigur tokenul necunoscut', async () => {
    const necunoscut = harness({ owner: null });
    await expect(necunoscut.service.processRtdnToken({ purchaseToken: TOKEN, messageId: 'm-1' }))
      .resolves.toEqual({ processed: false, reason: 'UNKNOWN_TOKEN' });
    expect(necunoscut.publisher.getSubscription).not.toHaveBeenCalled();

    const cunoscut = harness({ owner: USER_ID });
    await expect(cunoscut.service.processRtdnToken({ purchaseToken: TOKEN, messageId: 'm-2' }))
      .resolves.toMatchObject({ processed: true, premium: true });
    expect(cunoscut.publisher.getSubscription).toHaveBeenCalledTimes(1);
  });

  test('workerul confirma lease-urile si programeaza retry fara tokenuri in rezultat', async () => {
    const { service, publisher, repo } = harness();
    repo.claimAcknowledgements.mockResolvedValue([
      { purchaseToken: TOKEN, productId: 'premium_monthly' },
      { purchaseToken: 'google-play-token-failure-1234', productId: 'premium_annual' },
    ]);
    publisher.acknowledgeSubscription
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'GOOGLE_PLAY_UNAVAILABLE' }));

    const result = await service.retryPendingAcknowledgements();
    expect(result).toEqual({ claimed: 2, succeeded: 1, failed: 1 });
    expect(repo.applyAcknowledgementResult).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  test('exporta erori publice fara token sau raspuns Google', () => {
    const error = new GoogleBillingError('ACCOUNT_MISMATCH', 409);
    expect(error.message).toBe('Google Play billing request could not be completed.');
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});
