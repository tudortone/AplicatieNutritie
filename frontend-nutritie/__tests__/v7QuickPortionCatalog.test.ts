import { foodPresets } from '../constants/foodPresets';
import { getQuickPortionLabel, hasCompleteQuickPortionTranslations } from '../i18n/quickPortions';

describe('V7 quick-portion localization catalog', () => {
  test('every production quick portion has a complete EN/FR/DE presentation label', () => {
    const presetsWithUnits = foodPresets.filter((preset) => (preset.unitati?.length ?? 0) > 0);
    expect(presetsWithUnits.length).toBeGreaterThan(0);

    for (const preset of presetsWithUnits) {
      expect(hasCompleteQuickPortionTranslations(preset)).toBe(true);
      for (const language of ['ro', 'en', 'fr', 'de']) {
        preset.unitati!.forEach((_unit, index) => {
          expect(getQuickPortionLabel(preset, index, language).trim()).not.toBe('');
        });
      }
    }
  });

  test('localization changes presentation only, never authoritative grams or macros', () => {
    const apple = foodPresets.find((preset) => preset.id === 'mar')!;
    const before = {
      grams: apple.unitati!.map((unit) => unit.grame),
      calories: apple.calorii,
      protein: apple.proteine,
      carbs: apple.carbohidrati,
      fat: apple.grasimi,
    };

    for (const language of ['ro', 'en', 'fr', 'de']) {
      apple.unitati!.forEach((_unit, index) => getQuickPortionLabel(apple, index, language));
    }

    expect({
      grams: apple.unitati!.map((unit) => unit.grame),
      calories: apple.calorii,
      protein: apple.proteine,
      carbs: apple.carbohidrati,
      fat: apple.grasimi,
    }).toEqual(before);
  });
});
