import { ziLocalDeAzi, mergePașiTotal, adaugaPașiManual } from '../lib/healthSteps';

describe('ziLocalDeAzi', () => {
  it('formatează data în calendar LOCAL (august = luna 7, index 0-based)', () => {
    expect(ziLocalDeAzi(new Date(2026, 7, 11))).toBe('2026-08-11');
  });

  it('completează cu zerouri luna și ziua', () => {
    expect(ziLocalDeAzi(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('folosește data curentă când nu primește argument', () => {
    expect(ziLocalDeAzi()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('mergePașiTotal', () => {
  it('pe iOS (citire senzor reușită) ia senzorul + pașii manuali, ignorând totalul persistat', () => {
    expect(
      mergePașiTotal({ storedTotal: 500, manualSteps: 200, sensorSteps: 1000, citireSenzorOk: true })
    ).toBe(1200);
  });

  it('pe Android (citire indisponibilă) restaurează totalul persistat al zilei', () => {
    expect(
      mergePașiTotal({ storedTotal: 3400, manualSteps: 300, sensorSteps: 0, citireSenzorOk: false })
    ).toBe(3400);
  });

  it('fără total persistat folosește pașii manuali (fără dublă numărare)', () => {
    expect(
      mergePașiTotal({ storedTotal: 0, manualSteps: 300, sensorSteps: 0, citireSenzorOk: false })
    ).toBe(300);
  });

  it('nu scade never schimbă sensul când pașii manuali depășesc totalul stocat', () => {
    expect(
      mergePașiTotal({ storedTotal: 40, manualSteps: 300, sensorSteps: 0, citireSenzorOk: false })
    ).toBe(300);
  });
});

describe('adaugaPașiManual', () => {
  it('adună cantitatea validă', () => {
    expect(adaugaPașiManual(100, 500)).toBe(600);
  });

  it('ignore cantități negative sau non-numerice', () => {
    expect(adaugaPașiManual(100, -5)).toBe(100);
    expect(adaugaPașiManual(100, NaN)).toBe(100);
  });

  it('rotunjește cantitățile fracționare', () => {
    expect(adaugaPașiManual(100, 499.6)).toBe(600);
  });
});