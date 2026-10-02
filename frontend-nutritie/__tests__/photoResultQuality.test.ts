import {
  evaluatePhotoMealQuality,
  inferCanonicalMealType,
  normalizePhotoResultItems,
} from '../lib/photoResultQuality';

const normalMeal = [
  {
    nume: 'Cartofi prăjiți',
    estimare_grame: 180,
    calorii_per_100g: 312,
    proteine_per_100g: 3.4,
    grasimi_per_100g: 15,
    carbohidrati_per_100g: 41,
    fibre_per_100g: 3.8,
  },
  {
    nume: 'Ketchup',
    estimare_grame: 40,
    calorii_per_100g: 112,
    proteine_per_100g: 1.3,
    grasimi_per_100g: 0.2,
    carbohidrati_per_100g: 26,
    fibre_per_100g: 0.3,
  },
];

describe('Photo AI result data quality', () => {
  test('blocks the real-device 3180g / 9582 kcal anomaly instead of clamping or saving it', () => {
    const items = normalizePhotoResultItems([
      { ...normalMeal[0], estimare_grame: 3180 },
      normalMeal[1],
    ]);
    const quality = evaluatePhotoMealQuality(items);

    expect(items[0].estimare_grame).toBe(3180);
    expect(quality.requiresReview).toBe(true);
    expect(quality.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ITEM_QUANTITY_IMPLAUSIBLE', itemIndex: 0 }),
      expect.objectContaining({ code: 'MEAL_ENERGY_IMPLAUSIBLE' }),
    ]));
  });

  test('accepts a plausible plate and calculates all five nutrition totals', () => {
    const items = normalizePhotoResultItems(normalMeal);
    const quality = evaluatePhotoMealQuality(items);

    expect(quality.requiresReview).toBe(false);
    expect(quality.totals).toEqual(expect.objectContaining({
      kcal: 606.4,
      protein: 6.64,
      carbs: 84.2,
      fat: 27.08,
      fiber: 6.96,
    }));
  });

  test('does not fabricate missing fiber and rejects anonymous or structurally invalid ingredients', () => {
    const items = normalizePhotoResultItems([{ ...normalMeal[0], nume: '', fibre_per_100g: undefined }]);
    const quality = evaluatePhotoMealQuality(items);

    expect(items[0].fibre_per_100g).toBeNull();
    expect(quality.totals.fiber).toBeNull();
    expect(quality.requiresReview).toBe(true);
    expect(quality.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ITEM_NAME_MISSING', itemIndex: 0 }),
    ]));
  });
});

describe('Photo AI automatic meal classification', () => {
  test('uses a canonical AI suggestion without forcing a manual selection', () => {
    expect(inferCanonicalMealType({ aiMealType: 'cina', capturedAt: new Date('2026-09-25T09:00:00') }))
      .toBe('cina');
  });

  test('normalizes supported localized AI suggestions', () => {
    expect(inferCanonicalMealType({ aiMealType: 'Breakfast', capturedAt: new Date('2026-09-25T20:00:00') }))
      .toBe('mic_dejun');
    expect(inferCanonicalMealType({ aiMealType: 'Prânz', capturedAt: new Date('2026-09-25T20:00:00') }))
      .toBe('pranz');
  });

  test('falls back to the capture time when the AI suggestion is absent or unknown', () => {
    expect(inferCanonicalMealType({ capturedAt: new Date('2026-09-25T08:00:00') })).toBe('mic_dejun');
    expect(inferCanonicalMealType({ aiMealType: 'unknown', capturedAt: new Date('2026-09-25T13:00:00') }))
      .toBe('pranz');
  });
});
