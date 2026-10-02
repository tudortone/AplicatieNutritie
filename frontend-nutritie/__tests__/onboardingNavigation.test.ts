import {
  DURATA_PROTECTIE_NAVIGARE_MS,
  anuleazaProtectieNavigare,
  incepeProtectieNavigare,
  protectieNavigareRamasa,
} from '../lib/onboardingNavigationGuard';

describe('protecția navigării onboarding', () => {
  beforeEach(anuleazaProtectieNavigare);

  it('respinge al doilea tap chiar dacă următorul ecran s-a montat deja', () => {
    const primulTap = 1_000;
    expect(incepeProtectieNavigare(primulTap)).toBe(true);
    expect(incepeProtectieNavigare(primulTap + 100)).toBe(false);
    expect(protectieNavigareRamasa(primulTap + 100)).toBe(DURATA_PROTECTIE_NAVIGARE_MS - 100);
  });

  it('permite intenționat următoarea acțiune după fereastra anti-dublu-tap', () => {
    expect(incepeProtectieNavigare(1_000)).toBe(true);
    expect(incepeProtectieNavigare(1_000 + DURATA_PROTECTIE_NAVIGARE_MS)).toBe(true);
  });
});
