let mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __store: () => mockStore,
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  clear: jest.fn(async () => { mockStore = {}; }),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const mockAnim = {
    duration: () => mockAnim,
    delay: () => mockAnim,
    springify: () => mockAnim,
  };
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (c: any) => c,
    },
    FadeInDown: mockAnim,
    FadeInUp: mockAnim,
    FadeIn: mockAnim,
    FadeOut: mockAnim,
    LinearTransition: mockAnim,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
  };
});

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      accent: '#CCFF00',
      accentGradient: ['#CCFF00', '#A8FF3E'],
      overlayStrong: 'rgba(255,255,255,0.08)',
      surface: '#12171A',
      border: 'rgba(255,255,255,0.1)',
    },
  }),
}));

jest.mock('../context/OnboardingContext', () => ({
  useOnboarding: () => ({
    date: { scop: null, gen: null },
    actualizeaza: jest.fn(),
  }),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    canGoBack: () => true,
    replace: mockPush,
  }),
  useFocusEffect: (callback: any) => require('react').useEffect(callback, [callback]),
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { changeLanguage, SUPPORTED_LANGUAGES, LANGUAGE_NAMES, LANGUAGE_STORAGE_KEY } from '../i18n';
import PasLimba from '../app/onboarding/index';
import { PASI_ONBOARDING, pasulUrmator } from '../components/onboarding/pasi';

describe('Fresh Install Language Selector & First-Launch Contract', () => {
  beforeEach(async () => {
    mockStore = {};
    mockPush.mockClear();
    mockBack.mockClear();
    await changeLanguage('en');
  });

  it('1. verifies fresh install default language is English (en)', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('2. verifies first onboarding step is /onboarding (dedicated language selector)', () => {
    expect(PASI_ONBOARDING[0]).toBe('/onboarding');
    expect(PASI_ONBOARDING[1]).toBe('/onboarding/gen');
    expect(PASI_ONBOARDING[2]).toBe('/onboarding/data-nasterii');
    expect(PASI_ONBOARDING[3]).toBe('/onboarding/inaltime');
    expect(PASI_ONBOARDING[4]).toBe('/onboarding/greutate');
    expect(PASI_ONBOARDING[5]).toBe('/onboarding/scop');
  });

  it('3. renders language options for English, Romanian, French, German in PasLimba', async () => {
    const { getByText } = await render(<PasLimba />);

    // Verify all 4 languages are present
    expect(getByText('English')).toBeTruthy();
    expect(getByText('Română')).toBeTruthy();
    expect(getByText('Français')).toBeTruthy();
    expect(getByText('Deutsch')).toBeTruthy();

    // Verify flags
    expect(getByText('🇬🇧')).toBeTruthy();
    expect(getByText('🇷🇴')).toBeTruthy();
    expect(getByText('🇫🇷')).toBeTruthy();
    expect(getByText('🇩🇪')).toBeTruthy();
  });

  it('4. displays English preselected on fresh install and Continue button enabled', async () => {
    const { getByText } = await render(<PasLimba />);
    expect(getByText('Choose your language')).toBeTruthy();
    expect(getByText('Select your preferred language for GetFlow.')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });

  it('5. switching language persists to storage and updates subsequent screen text immediately', async () => {
    const { getByText } = await render(<PasLimba />);

    // Tap Romanian
    await act(async () => {
      fireEvent.press(getByText('Română'));
    });

    await waitFor(async () => {
      expect(i18n.language).toBe('ro');
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      expect(stored).toBe('ro');
    });

    // Verify header and Continue button switched to Romanian immediately
    expect(getByText('Alege limba')).toBeTruthy();
    expect(getByText('Selectează limba preferată pentru GetFlow.')).toBeTruthy();
    expect(getByText('Continuă')).toBeTruthy();

    // Verify next step text is also now in Romanian
    expect(i18n.t('onboarding.genderTitle')).toBe('Hai să te cunoaștem');
    expect(i18n.t('onboarding.genderSubtitle')).toBe('Ne ajută să personalizăm planul și recomandările pentru tine.');

    // Switch to French
    await act(async () => {
      fireEvent.press(getByText('Français'));
    });
    await waitFor(async () => {
      expect(i18n.language).toBe('fr');
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      expect(stored).toBe('fr');
    });
    expect(getByText('Choisissez votre langue')).toBeTruthy();
    expect(getByText('Continuer')).toBeTruthy();

    // Switch to German
    await act(async () => {
      fireEvent.press(getByText('Deutsch'));
    });
    await waitFor(async () => {
      expect(i18n.language).toBe('de');
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      expect(stored).toBe('de');
    });
    expect(getByText('Wähle deine Sprache')).toBeTruthy();
    expect(getByText('Weiter')).toBeTruthy();
  });

  it('6. verifies step transition from language selector to gender step', () => {
    const urmator = pasulUrmator('/onboarding', null);
    expect(urmator).toBe('/onboarding/gen');
  });
});
