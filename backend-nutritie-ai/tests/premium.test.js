'use strict';

const {
  compuneRaspunsAcces,
  derivaDrepturiAcces,
} = require('../utils/accessEntitlement');

describe('contractul canonic de acces server-authoritative', () => {
  test('abonamentul verificat de backend are prioritate fata de tester', () => {
    expect(derivaDrepturiAcces({ esteTester: true, esteAdmin: false }, true)).toEqual({
      premium: true,
      isPremium: true,
      isTester: false,
      isAdmin: false,
      accessTier: 'premium',
      hasFullAccess: true,
    });
  });

  test('testerul vine numai din identitatea verificata si nu devine Premium sau admin', () => {
    expect(derivaDrepturiAcces({ esteTester: true, esteAdmin: false }, false)).toEqual({
      premium: false,
      isPremium: false,
      isTester: true,
      isAdmin: false,
      accessTier: 'tester',
      hasFullAccess: true,
    });
  });

  test('rolul administrativ ramane separat de Premium si tester', () => {
    expect(derivaDrepturiAcces({ esteTester: false, esteAdmin: true }, false)).toEqual({
      premium: false,
      isPremium: false,
      isTester: false,
      isAdmin: true,
      accessTier: 'free',
      hasFullAccess: true,
    });
  });

  test('utilizatorul fara drept persistent ramane free si eligibil pentru portile free', () => {
    expect(compuneRaspunsAcces(
      { esteTester: false, esteAdmin: false },
      { premium: false, productId: null, expiresDate: null },
    )).toEqual({
      premium: false,
      productId: null,
      expiresDate: null,
      isPremium: false,
      isTester: false,
      isAdmin: false,
      accessTier: 'free',
      hasFullAccess: false,
      validatServer: true,
    });
  });
});
