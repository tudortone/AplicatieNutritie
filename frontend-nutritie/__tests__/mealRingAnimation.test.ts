import { decideCalorieRingUpdate } from '../lib/mealRingAnimation';

describe('Home calorie ring animation contract', () => {
  it('does not animate initial hydration or an unverified total change', () => {
    expect(decideCalorieRingUpdate({ previousPercent: 0, nextPercent: 25, verifiedSavePending: false, reducedMotion: false })).toBe('set');
  });

  it('animates a changed authoritative value after a verified save event', () => {
    expect(decideCalorieRingUpdate({ previousPercent: 25, nextPercent: 40, verifiedSavePending: true, reducedMotion: false })).toBe('animate');
  });

  it('does not replay duplicate/no-op events or animate with reduced motion', () => {
    expect(decideCalorieRingUpdate({ previousPercent: 25, nextPercent: 25, verifiedSavePending: true, reducedMotion: false })).toBe('unchanged');
    expect(decideCalorieRingUpdate({ previousPercent: 25, nextPercent: 40, verifiedSavePending: true, reducedMotion: true })).toBe('set');
  });
});
