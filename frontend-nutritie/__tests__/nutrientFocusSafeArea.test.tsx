import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#050707', cardBorder: '#202626', textPrimary: '#FFFFFF',
      textSecondary: '#99A0A8', surface: '#111515', surfaceBg: '#111515',
      accent: '#C8FF00', textTertiary: '#747C84',
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View> };
});

import { NutrientFocusSettingsModal } from '../components/jurnal/NutrientFocusSettingsModal';
import { DEFAULT_NUTRIENT_FOCUS_PREFERENCES } from '../lib/nutrientFocus';

describe('Nutrient Focus safe-area shell', () => {
  test('protects the modal header and close action with top and bottom safe-area edges', async () => {
    const view = await render(
      <NutrientFocusSettingsModal
        visible
        onClose={jest.fn()}
        preferences={DEFAULT_NUTRIENT_FOCUS_PREFERENCES}
        onPreferencesChanged={jest.fn()}
      />,
    );

    expect(view.getByTestId('nutrient-focus-settings-safe-area').props.edges)
      .toEqual(['top', 'bottom', 'left', 'right']);
    expect(view.getByLabelText('nutrientFocus.close')).toBeTruthy();
  });
});
