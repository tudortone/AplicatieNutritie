'use strict';

const { valideazaMasa } = require('../utils/validareMese');
const createProfilRouter = require('../routes/profil');
const createUserRouter = require('../routes/user');

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

  test('un entitlement marcat activ dar expirat ramane fail-closed', () => {
    expect(createUserRouter.entitlementEsteActiv({
      active: true,
      expires_date: '2020-01-01T00:00:00Z',
    }, Date.parse('2026-08-06T00:00:00Z'))).toBe(false);
  });

  test('un entitlement cu expirare viitoare este activ chiar fara campul active', () => {
    expect(createUserRouter.entitlementEsteActiv({
      expires_date: '2026-09-01T00:00:00Z',
    }, Date.parse('2026-08-06T00:00:00Z'))).toBe(true);
  });
});
