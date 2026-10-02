'use strict';

let mapGoogleSubscription;
try {
  ({ mapGoogleSubscription } = require('../services/billing/googleSubscriptionState'));
} catch {
  mapGoogleSubscription = undefined;
}

const NOW = Date.parse('2026-09-14T12:00:00.000Z');
const FUTURE = '2026-10-14T12:00:00.000Z';
const PAST = '2026-09-13T12:00:00.000Z';
const ALLOWED = new Set(['premium_monthly', 'premium_annual']);

function purchase(state, overrides = {}) {
  return {
    subscriptionState: state,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [{
      productId: 'premium_monthly',
      expiryTime: FUTURE,
      offerDetails: { basePlanId: 'monthly', offerId: 'intro' },
    }],
    ...overrides,
  };
}

function mapped(value) {
  return mapGoogleSubscription(value, { nowMs: NOW, allowedProductIds: ALLOWED });
}

describe('Google SubscriptionPurchaseV2 canonical state mapping', () => {
  test('exports the pure mapper required by the billing service', () => {
    expect(typeof mapGoogleSubscription).toBe('function');
  });

  test.each([
    ['SUBSCRIPTION_STATE_ACTIVE', true],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', true],
    ['SUBSCRIPTION_STATE_CANCELED', true],
    ['SUBSCRIPTION_STATE_PENDING', false],
    ['SUBSCRIPTION_STATE_PAUSED', false],
    ['SUBSCRIPTION_STATE_ON_HOLD', false],
    ['SUBSCRIPTION_STATE_EXPIRED', false],
    ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', false],
    ['SUBSCRIPTION_STATE_UNSPECIFIED', false],
    ['SUBSCRIPTION_STATE_FUTURE_UNKNOWN', false],
  ])('%s maps entitled=%s', (state, entitled) => {
    expect(mapped(purchase(state)).entitled).toBe(entitled);
  });

  test('canceled access ends exactly at authoritative expiry', () => {
    expect(mapped(purchase('SUBSCRIPTION_STATE_CANCELED', {
      lineItems: [{ productId: 'premium_monthly', expiryTime: PAST }],
    })).entitled).toBe(false);
    expect(mapped(purchase('SUBSCRIPTION_STATE_CANCELED', {
      lineItems: [{ productId: 'premium_monthly', expiryTime: new Date(NOW).toISOString() }],
    })).entitled).toBe(false);
  });

  test('expired or malformed line-item time never grants Premium even for ACTIVE', () => {
    for (const expiryTime of [PAST, 'not-a-date', null, undefined]) {
      expect(mapped(purchase('SUBSCRIPTION_STATE_ACTIVE', {
        lineItems: [{ productId: 'premium_monthly', expiryTime }],
      })).entitled).toBe(false);
    }
  });

  test('selects the latest current allowlisted line item and preserves real offer metadata', () => {
    const result = mapped(purchase('SUBSCRIPTION_STATE_ACTIVE', {
      lineItems: [
        { productId: 'not-ours', expiryTime: '2026-12-01T00:00:00.000Z' },
        { productId: 'premium_monthly', expiryTime: '2026-10-01T00:00:00.000Z' },
        {
          productId: 'premium_annual',
          expiryTime: '2027-09-14T12:00:00.000Z',
          offerDetails: { basePlanId: 'annual-base', offerId: 'returning-user' },
        },
      ],
    }));

    expect(result).toMatchObject({
      entitled: true,
      productAllowed: true,
      productId: 'premium_annual',
      expiryTime: '2027-09-14T12:00:00.000Z',
      basePlanId: 'annual-base',
      offerId: 'returning-user',
    });
  });

  test('a product outside the server allowlist cannot grant Premium', () => {
    const result = mapped(purchase('SUBSCRIPTION_STATE_ACTIVE', {
      lineItems: [{ productId: 'attacker_product', expiryTime: FUTURE }],
    }));
    expect(result.entitled).toBe(false);
    expect(result.productAllowed).toBe(false);
    expect(result.reason).toBe('PRODUCT_NOT_ALLOWED');
  });

  test('preserves acknowledgement, linked-token and test-purchase facts without treating them as authority', () => {
    const result = mapped(purchase('SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', {
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      linkedPurchaseToken: 'linked-secret-token',
      testPurchase: {},
    }));
    expect(result).toMatchObject({
      entitled: false,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      linkedPurchaseToken: 'linked-secret-token',
      shouldFollowLinkedToken: true,
      isTestPurchase: true,
    });
  });

  test('does not mutate the Google response', () => {
    const input = purchase('SUBSCRIPTION_STATE_ACTIVE');
    const before = JSON.stringify(input);
    mapped(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
