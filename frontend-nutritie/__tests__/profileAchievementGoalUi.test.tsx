import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import PasScop from '../app/onboarding/scop';
import PasPlan from '../app/onboarding/plan';
import { INSIGNE_LIST } from '../constants/insigne';
import AchievementCard from '../components/gamification/AchievementCard';
import ro from '../i18n/locales/ro.json';
import en from '../i18n/locales/en.json';
import fr from '../i18n/locales/fr.json';
import de from '../i18n/locales/de.json';
import { getAchievementGridColumns } from '../lib/achievementLayout';

jest.mock('@react-native-async-storage/async-storage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage/jest/async-storage-mock');
});

let mockSelectedGoal: string | null = null;
let mockI18nLocale = 'ro';
let mockResolveTranslations = false;
const mockUpdateGoal = jest.fn();

jest.mock('../context/OnboardingContext', () => ({
  useOnboarding: () => ({
    date: { scop: mockSelectedGoal, greutateKg: 70, greutateTintaKg: 70, ritmKgSaptamana: 0 },
    plan: { calorii: 2000, proteineG: 150, carbohidratiG: 220, grasimiG: 65, bmr: 1500, tdee: 2000, ajustare: 0, dataEstimata: null, limitatLaMinim: false },
    actualizeaza: mockUpdateGoal,
  }),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#090c0e', cardBg: '#14191b', cardBorder: '#30383b',
    accent: '#c5f467', accentSecondary: '#aa88ff', success: '#55dd88', danger: '#ff5555',
    accentGradient: ['#c5f467', '#aaee55'], textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#777', overlayStrong: '#555',
  } }),
}));
jest.mock('../components/onboarding/EcranPas', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (!mockResolveTranslations) return key;
      const resources: Record<string, Record<string, unknown>> = {
        ro: require('../i18n/locales/ro.json'), en: require('../i18n/locales/en.json'),
        fr: require('../i18n/locales/fr.json'), de: require('../i18n/locales/de.json'),
      };
      return key.split('.').reduce((value: unknown, part) => {
        return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined;
      }, resources[mockI18nLocale]) ?? 'Text unavailable';
    },
    i18n: { language: mockI18nLocale },
  }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

describe('GetFlow profile achievements and goal-selection presentation', () => {
  beforeEach(() => {
    mockSelectedGoal = null;
    mockI18nLocale = 'ro';
    mockResolveTranslations = false;
    mockUpdateGoal.mockClear();
  });

  test('each achievement has localized human-facing title, description and requirement in all supported locales', () => {
    const locales = [ro, en, fr, de];
    for (const badge of INSIGNE_LIST) {
      expect(badge.numeI18n).toBeTruthy();
      expect(badge.descriereI18n).toBeTruthy();
      expect(badge.conditieI18n).toBeTruthy();
      for (const locale of locales) {
        const copy = locale.profile.achievements[badge.id as keyof typeof locale.profile.achievements];
        expect(copy.name).toBeTruthy();
        expect(copy.description).toBeTruthy();
        expect(copy.requirement).toBeTruthy();
        expect(copy.requirement).not.toMatch(/>=|<=/);
      }
    }
  });

  test.each(['ro', 'en', 'fr', 'de'])('mounts the actual Daily Plan result with localized macro labels in %s', async (locale) => {
    mockI18nLocale = locale;
    mockResolveTranslations = true;
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'), en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'), de: require('../i18n/locales/de.json'),
    };
    const view = await render(<PasPlan />);
    expect(view.getByText(resources[locale].nutrition.protein)).toBeTruthy();
    expect(view.getByText(resources[locale].nutrition.carbs)).toBeTruthy();
    expect(view.getByText(resources[locale].nutrition.fats)).toBeTruthy();
  });

  test('achievement card renders full two-line copy and a visible lock without clipping its width', async () => {
    const view = await render(
      <AchievementCard
        id="streak_7"
        name="Războinic Săptămânal"
        requirement="Ține-ți ritmul 7 zile la rând"
        unlocked={false}
        width={156}
      />,
    );

    expect(view.getByTestId('achievement-card-streak_7').props.style).toEqual(
      expect.objectContaining({ width: 156 }),
    );
    expect(view.getByText('Războinic Săptămânal').props.numberOfLines).toBe(2);
    expect(view.getByText('Ține-ți ritmul 7 zile la rând').props.numberOfLines).toBe(2);
    expect(view.getByTestId('achievement-lock-streak_7')).toBeTruthy();
  });

  test('goal selection renders vector trend icons instead of text arrows and preserves canonical values', async () => {
    const view = await render(<PasScop />);

    expect(view.getByTestId('goal-icon-slabire')).toBeTruthy();
    expect(view.getByTestId('goal-icon-mentinere')).toBeTruthy();
    expect(view.getByTestId('goal-icon-masa')).toBeTruthy();
    expect(view.queryByText('↓')).toBeNull();
    expect(view.queryByText('↔')).toBeNull();
    expect(view.queryByText('↑')).toBeNull();

    fireEvent.press(view.getByRole('radio', { name: /onboarding\.goalLoseTitle/ }));
    expect(mockUpdateGoal).toHaveBeenCalledWith({ scop: 'slabire' });
  });

  test('selected goal remains an accessible selected radio option', async () => {
    mockSelectedGoal = 'mentinere';
    const view = await render(<PasScop />);

    expect(view.getByRole('radio', { name: /onboarding\.goalMaintainTitle/ }).props.accessibilityState)
      .toEqual({ selected: true });
    expect(view.getByRole('radio', { name: /onboarding\.goalLoseTitle/ }).props.accessibilityState)
      .toEqual({ selected: false });
  });

  test.each([
    [360, 1, 1], [390, 1, 2], [412, 1, 2],
    [360, 1.3, 1], [390, 1.3, 1], [412, 1.3, 1],
  ])('achievement grid at width %i and font scale %f uses %i columns', (width, scale, columns) => {
    expect(getAchievementGridColumns(width, scale)).toBe(columns);
  });
});
