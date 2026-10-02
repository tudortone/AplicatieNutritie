import React from 'react';
import { render } from '@testing-library/react-native';
import { MealSaveSuccessModal, type MealSuccessData } from '../components/ui/MealSaveSuccessModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'postSave.mealAdded'
      ? 'Masă adăugată!'
      : key === 'postSave.savedOffline'
        ? 'Salvat offline'
        : key,
    i18n: { language: 'ro', isInitialized: true },
  }),
}));
jest.mock('../i18n', () => ({ __esModule: true, default: { language: 'ro', isInitialized: true } }));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      surfaceElevated: '#181D22',
      accent: '#CCFF00',
      accentTertiary: '#00F0FF',
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      background: '#090C0E',
    },
  }),
}));

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

describe('MealSaveSuccessModal — Canonical post-save animation', () => {
  const sampleMeal: MealSuccessData = {
    nume: 'Piept de pui cu orez',
    calorii: 450,
    proteine: 42,
  };

  it('renders correctly when visible is true and displays meal details and macros', async () => {
    const view = await render(
      <MealSaveSuccessModal
        visible={true}
        data={sampleMeal}
        onDismiss={jest.fn()}
      />
    );

    expect(view.getByText('Masă adăugată!')).toBeTruthy();
    expect(view.getByText('Piept de pui cu orez')).toBeTruthy();
    expect(view.getByText('+450 kcal')).toBeTruthy();
    expect(view.getByText('+42g P')).toBeTruthy();
  });

  it('displays offline status message when meal is queued offline', async () => {
    const offlineMeal: MealSuccessData = {
      ...sampleMeal,
      isOffline: true,
    };

    const view = await render(
      <MealSaveSuccessModal
        visible={true}
        data={offlineMeal}
        onDismiss={jest.fn()}
      />
    );

    expect(view.getByText('Salvat offline')).toBeTruthy();
  });

  it('renders null when visible is false or data is null', async () => {
    const view = await render(
      <MealSaveSuccessModal
        visible={false}
        data={sampleMeal}
        onDismiss={jest.fn()}
      />
    );

    expect(view.toJSON()).toBeNull();
  });
});
