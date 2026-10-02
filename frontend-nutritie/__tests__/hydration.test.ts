import {
  calculateDailyWaterTargetMl,
  glassesToMilliliters,
  isValidBodyWeightKg,
  WATER_GLASS_ML,
  WATER_ML_PER_KG,
} from '../lib/hydration';

describe('hydration calculations', () => {
  it.each([
    [50, 1750],
    [70, 2450],
    [80, 2800],
    [100, 3500],
  ])('calculates a %s kg target as %s ml', (weightKg, expectedMl) => {
    expect(calculateDailyWaterTargetMl(weightKg)).toBe(expectedMl);
  });

  it('accepts the supported weight boundaries and rejects invalid weights', () => {
    expect(isValidBodyWeightKg(30)).toBe(true);
    expect(isValidBodyWeightKg(250)).toBe(true);

    for (const weight of [null, undefined, '70', 0, -1, 29.9, 250.1, Number.NaN, Infinity]) {
      expect(isValidBodyWeightKg(weight)).toBe(false);
      expect(calculateDailyWaterTargetMl(weight)).toBeNull();
    }
  });

  it('uses one 250 ml glass conversion without changing the weight-based target', () => {
    expect(WATER_ML_PER_KG).toBe(35);
    expect(WATER_GLASS_ML).toBe(250);
    expect(glassesToMilliliters(3)).toBe(750);
  });
});
