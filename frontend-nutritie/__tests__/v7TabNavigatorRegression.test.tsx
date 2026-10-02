import React from 'react';
import { render } from '@testing-library/react-native';

let mockLanguage = 'en';
let mockWidth = 360;
let mockHeight = 800;
let mockFontScale = 1;
const mockScreens: Array<{ name: string; options: Record<string, unknown> }> = [];

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: mockHeight, scale: 1, fontScale: mockFontScale }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => {
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };
    return {
      t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], resources[mockLanguage]) ?? key,
      i18n: { language: mockLanguage },
    };
  },
}));

jest.mock('expo-router', () => {
  const R = require('react');
  const Tabs = ({ children }: any) => R.createElement(R.Fragment, null, children);
  Tabs.Screen = ({ name, options }: any) => {
    mockScreens.push({ name, options });
    return null;
  };
  return { Tabs, useRouter: () => ({ push: jest.fn() }) };
});

jest.mock('../../frontend-nutritie/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#111111' }),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children ?? null }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import TabLayout from '../app/(tabs)/_layout';

describe('V7 real-device tab navigator regression', () => {
  beforeEach(() => {
    mockScreens.length = 0;
    mockWidth = 360;
    mockHeight = 800;
    mockFontScale = 1;
  });

  test.each([
    ['ro', 'Stat.', 'AI', 'Statistici', 'Asistent GetFlow'],
    ['en', 'Stats', 'AI', 'Statistics', 'GetFlow Assistant'],
    ['fr', 'Stats', 'IA', 'Statistiques', 'Assistant GetFlow'],
    ['de', 'Stat.', 'KI', 'Statistiken', 'GetFlow Assistent'],
  ])('mounts the actual compact navigator in %s without raw or clipped stats/assistant keys', async (language, stats, assistant, statsA11y, assistantA11y) => {
    mockLanguage = language;
    mockWidth = 360;
    mockFontScale = 1.3;
    await render(<TabLayout />);

    const byName = Object.fromEntries(mockScreens.map((screen) => [screen.name, screen.options]));
    expect(byName.statistici.title).toBe(stats);
    expect(byName.chat.title).toBe(assistant);
    expect(byName.statistici.tabBarAccessibilityLabel).toBe(statsA11y);
    expect(byName.chat.tabBarAccessibilityLabel).toBe(assistantA11y);
    const visibleValues = mockScreens.flatMap(({ options }) => [options.title, options.tabBarAccessibilityLabel]);
    expect(JSON.stringify(visibleValues)).not.toMatch(/tabs\.|Compact|Accessibility/);
  });

  test.each([
    [360, 640, 1],
    [360, 800, 1.15],
    [390, 844, 1.3],
    [412, 915, 1.4],
  ])('uses compact labels at %ix%i / fontScale %s', async (width, height, fontScale) => {
    mockLanguage = 'de';
    mockWidth = width;
    mockHeight = height;
    mockFontScale = fontScale;
    await render(<TabLayout />);
    const byName = Object.fromEntries(mockScreens.map((screen) => [screen.name, screen.options]));
    expect(byName.statistici.title).toBe('Stat.');
    expect(byName.chat.title).toBe('KI');
  });
});
