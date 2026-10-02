import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { WorkoutV2Experience } from '../components/workout-v2/WorkoutV2Experience';

let mockWidth = 320;
let mockHeight = 568;
let mockFontScale = 1;
let mockLocale: 'ro' | 'en' | 'fr' | 'de' = 'en';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: mockHeight, scale: 1, fontScale: mockFontScale }),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#090c0e', surfaceBg: '#181d22', border: '#333', textPrimary: '#fff', textSecondary: '#999',
    textTertiary: '#777', accent: '#ccff00', accentTertiary: '#00f0ff', textOnAccent: '#000', danger: '#f55',
    success: '#0f0', disabledText: '#555', disabledBg: '#333', inputBg: '#111', inputBorder: '#444',
    warning: '#f90', muscleBase: '#222',
  } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const resources = {
        ro: require('../i18n/locales/ro.json'), en: require('../i18n/locales/en.json'),
        fr: require('../i18n/locales/fr.json'), de: require('../i18n/locales/de.json'),
      } as Record<string, Record<string, unknown>>;
      const found = key.split('.').reduce<unknown>((value, part) => (
        value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
      ), resources[mockLocale]);
      if (typeof found !== 'string') return `MISSING:${key}`;
      return Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), found);
    },
  }),
}));

afterEach(async () => cleanup());

const matrix = [
  [320, 568, 1.0, 'ro'], [320, 568, 1.2, 'en'], [320, 568, 1.4, 'fr'],
  [360, 640, 1.0, 'de'], [360, 800, 1.2, 'ro'], [360, 800, 1.4, 'en'],
  [390, 844, 1.0, 'fr'], [390, 844, 1.2, 'de'], [390, 844, 1.4, 'ro'],
  [412, 915, 1.0, 'en'], [412, 915, 1.2, 'fr'], [412, 915, 1.4, 'de'],
] as const;

describe('Workout V2 responsive and accessibility matrix', () => {
  test.each(matrix)('keeps preview actions reachable at %ix%i / fontScale %s / %s', async (width, height, scale, locale) => {
    mockWidth = width;
    mockHeight = height;
    mockFontScale = scale;
    mockLocale = locale;
    const view = await render(<WorkoutV2Experience />);
    expect(view.getByTestId('workout-v2-preset-push').props.accessibilityRole).toBe('button');
    expect(view.getByTestId('workout-v2-strength').props.accessibilityRole).toBe('button');
    await fireEvent.press(view.getByTestId('workout-v2-strength'));
    expect(view.getByTestId('workout-v2-strength-summary')).toBeTruthy();
    expect(view.getByLabelText(locale === 'ro' ? 'Arată vederea din față'
      : locale === 'fr' ? 'Afficher la vue avant'
        : locale === 'de' ? 'Vorderansicht anzeigen' : 'Show front view')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('MISSING:workoutV2');
  });
});
