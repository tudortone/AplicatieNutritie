import i18n, { changeLanguage } from '../i18n';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

const locales = ['ro', 'en', 'fr', 'de'] as const;
const safeFallback: Record<(typeof locales)[number], string> = {
  ro: 'Text indisponibil',
  en: 'Text unavailable',
  fr: 'Texte indisponible',
  de: 'Text nicht verfügbar',
};
const tierOneKeys = [
  'profile.aiSetupTitle',
  'profile.aiSetupSub',
  'profile.weight',
  'profile.target_weight',
  'profile.calories',
  'profile.protein',
  'profile.carbs',
  'profile.fats',
  'nutrition.protein',
  'nutrition.carbs',
  'nutrition.fats',
  'nutrition.fiber',
  'home.friend',
  'jurnal.category',
  'onboarding.back',
  'postSave.mealAdded',
];

describe('Tier-1 localized copy availability and safe missing-key behavior', () => {
  afterAll(async () => {
    await changeLanguage('en');
  });

  it.each(locales)('provides translated Tier-1 copy in %s', async (locale) => {
    await changeLanguage(locale);

    for (const key of tierOneKeys) {
      const value = i18n.t(key);
      expect(value).not.toBe(key);
      expect(value).not.toBe(safeFallback[locale]);
      expect(value).not.toMatch(/^(profile|PROFILE|nutrition|tabs|camera|common)\./);
      expect(value.trim()).not.toBe('');
    }

    expect(i18n.t('flowCredits.photoAnalyses', { count: 2 })).not.toMatch(/^(flowCredits\.)/);
  });

  it.each(locales)('never exposes a future missing production key in %s', async (locale) => {
    await changeLanguage(locale);
    const diagnostics = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const futureKeys = [
      'profile.futureTierOneKey', 'PROFILE.futureTierOneKey', 'nutrition.futureTierOneKey',
      'tabs.futureTierOneKey', 'camera.futureTierOneKey', 'common.futureTierOneKey',
    ];

    for (const key of futureKeys) {
      const fallback = i18n.t(key);
      expect(fallback).toBe(safeFallback[locale]);
      expect(fallback).toBe(i18n.t('common.translationUnavailable'));
      expect(fallback).not.toBe(key);
      expect(fallback).not.toMatch(/^(profile|PROFILE|nutrition|tabs|camera|common)\./);
    }
    expect(diagnostics).toHaveBeenCalled();
    diagnostics.mockRestore();
  });
});
