import {
  anatomyMapSize,
  dualAnatomyMapWidth,
  singleAnatomyMapWidth,
} from '../lib/anatomyLayout';

describe('P1-08 anatomy responsive contracts', () => {
  it.each([360, 390, 412, 600, 768])(
    'keeps both workout maps inside the horizontal and 300dp vertical budget at %dp',
    viewportWidth => {
      const width = dualAnatomyMapWidth(viewportWidth);
      const availableWidth = Math.min(viewportWidth - 32, 720);
      const front = anatomyMapSize('front', width);
      const back = anatomyMapSize('back', width);

      expect(width * 2 + 16).toBeLessThanOrEqual(availableWidth);
      expect(front.height).toBeLessThanOrEqual(300);
      expect(back.height).toBeLessThanOrEqual(300);
    },
  );

  it('clamps an explicitly oversized map by height while preserving each viewBox ratio', () => {
    const front = anatomyMapSize('front', 400, 300);
    const back = anatomyMapSize('back', 400, 300);

    expect(front.height).toBeCloseTo(300, 5);
    expect(front.width / front.height).toBeCloseTo(424 / 804, 5);
    expect(back.height).toBeCloseTo(300, 5);
    expect(back.width / back.height).toBeCloseTo(431 / 807, 5);
  });

  it('scales single anatomy surfaces on phones and caps them on tablets', () => {
    expect(singleAnatomyMapWidth(360, 184)).toBeGreaterThanOrEqual(158);
    expect(singleAnatomyMapWidth(412, 210)).toBeGreaterThan(singleAnatomyMapWidth(360, 210));
    expect(singleAnatomyMapWidth(768, 210)).toBe(210);
    expect(singleAnatomyMapWidth(768, 184)).toBe(184);
  });
});
