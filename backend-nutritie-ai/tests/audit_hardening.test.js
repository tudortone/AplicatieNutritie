'use strict';

const { valideazaMasa } = require('../utils/validareMese');
const createProfilRouter = require('../routes/profil');
const { mapGoogleSubscription } = require('../services/billing/googleSubscriptionState');

describe('Audit hardening — validare si fail-closed', () => {
  test('pastreaza precizia zecimala a macro-urilor', () => {
    const rezultat = valideazaMasa({
      nume: 'Iaurt',
      calorii: 123.4,
      proteine: 12.5,
      grasimi: 3.25,
      carbohidrati: 9.75,
      alimente: [{ nume: 'Iaurt', calorii: 123.4, proteine: 12.5 }],
    });

    expect(rezultat.ok).toBe(true);
    expect(rezultat.payload.proteine).toBe(12.5);
    expect(rezultat.payload.grasimi).toBe(3.25);
    expect(rezultat.payload.alimente[0].proteine).toBe(12.5);
  });

  test('respinge numere partial parsabile si varste fractionare', () => {
    expect(createProfilRouter.numarStrict('70kg')).toBeNull();
    expect(createProfilRouter.numarStrict('70.5')).toBe(70.5);
  });

  test('un abonament Google activ dar expirat ramane fail-closed', () => {
    expect(mapGoogleSubscription({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'premium_monthly', expiryTime: '2020-01-01T00:00:00Z' }],
    }, {
      allowedProductIds: ['premium_monthly'],
      nowMs: Date.parse('2026-08-06T00:00:00Z'),
    }).entitled).toBe(false);
  });

  test('un abonament Google pending ramane blocat chiar cu expirare viitoare', () => {
    expect(mapGoogleSubscription({
      subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
      lineItems: [{ productId: 'premium_monthly', expiryTime: '2026-09-01T00:00:00Z' }],
    }, {
      allowedProductIds: ['premium_monthly'],
      nowMs: Date.parse('2026-08-06T00:00:00Z'),
    }).entitled).toBe(false);
  });
});
