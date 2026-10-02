import React from 'react';
import { render } from '@testing-library/react-native';
import { categories, foodPresets } from '../constants/foodPresets';
import { CATEGORII } from '../constants/exercitii';
import { CATEGORIE_ICONA } from '../lib/mealUtils';
import { QUEST_POOL } from '../lib/questsEngine';
import { HEALTH_PROVIDERS } from '../hooks/useHealthSync';
import { FlowIcon, resolveFlowIconName } from '../components/ui/FlowIcon';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('expo-sensors', () => ({ Pedometer: {} }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../lib/healthSteps', () => ({ ziLocalDeAzi: jest.fn(), mergePașiTotal: jest.fn(), adaugaPașiManual: jest.fn() }));

jest.mock('lucide-react-native', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '__esModule') return false;
      return () => ReactMock.createElement(MockView, { testID: `icon-${String(name)}` });
    },
  });
});

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
}

describe('FlowIcon registry', () => {
  test('every catalog glyph resolves to a semantic vector icon name', () => {
    const glyphs = [
      ...foodPresets.map((preset) => preset.icon),
      ...categories.map((category) => category.icon),
      ...CATEGORII.flatMap((category) => category.icon ? [category.icon] : []),
      ...Object.values(CATEGORIE_ICONA),
      ...HEALTH_PROVIDERS.map((provider) => provider.icon),
      ...QUEST_POOL.map((quest) => quest.icon),
      'circle', 'scale', 'check', 'sun', 'refresh', 'copy', 'star',
    ];

    for (const glyph of new Set(glyphs)) {
      if (!resolveFlowIconName(glyph)) throw new Error(`Unmapped icon metadata: ${glyph}`);
    }
  });

  test('renders the resolved vector icon accessibly instead of the source glyph', async () => {
    const view = await render(<FlowIcon name="🍎" size={24} color="#aabbcc" accessibilityLabel="Apple" testID="flow-icon" />);

    expect(view.getByTestId('flow-icon')).toBeTruthy();
    expect(view.getByTestId('icon-Apple')).toBeTruthy();
    expect(view.getByLabelText('Apple')).toBeTruthy();
    expect(view.queryByText('🍎')).toBeNull();
  });

  test('unknown icon metadata uses a neutral vector fallback', async () => {
    const view = await render(<FlowIcon name="not-a-shipped-icon" />);
    expect(view.getByTestId('icon-Utensils')).toBeTruthy();
  });
});

describe('shipped locale copy', () => {
  test.each(['ro', 'en', 'fr', 'de'])('%s copy contains no decorative emoji pictographs', (locale) => {
    const messages = require(`../i18n/locales/${locale}.json`);
    const emoji = /\p{Extended_Pictographic}/u;
    expect(collectStrings(messages).filter((message) => emoji.test(message))).toEqual([]);
  });
});
