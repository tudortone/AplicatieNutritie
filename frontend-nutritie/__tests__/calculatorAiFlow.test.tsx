import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import CalculatorAIScreen from '../app/calculator-ai';
import {
  calculeazaProfilLocal,
  FACTORI_ACTIVITATE,
  AJUSTARE_OBIECTIV,
  CALORII_MINIME_SEX,
} from '../lib/calculNutritional';
import { supabase } from '../supabase';
import { marcheazaMeseModificate, aboneazaLaModificariMese } from '../lib/freshnessMese';
import * as sincronizareModule from '../lib/sincronizeazaTargeturi';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../components/ui/KeyboardAwareScreen', () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  replace: jest.fn(),
  push: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

const mockShowBanner = jest.fn();
jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBannerActions: () => ({
    showBanner: mockShowBanner,
  }),
}));

const mockSession = {
  user: {
    id: 'test-user-1234',
    user_metadata: {
      varsta: 28,
      greutate: 78,
      inaltime: 182,
      sex: 'Masculin',
      activitate: 'Moderat',
      obiectiv: 'Slăbire',
    },
  },
  access_token: 'fake-token',
};

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: mockSession,
  }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#0a0d0e',
      cardBg: '#14181a',
      cardBorder: '#232b2e',
      accent: '#c5f467',
      accentGradient: ['#c5f467', '#9be136'],
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      textTertiary: '#64748b',
      surfaceBg: '#181d20',
      warning: '#f59e0b',
    },
    isDark: true,
  }),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
}));

// Mock Supabase
const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockUpdateUser = jest.fn().mockResolvedValue({ data: { user: mockSession.user }, error: null });

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      updateUser: (...args: any[]) => mockUpdateUser(...args),
    },
    from: jest.fn((table: string) => ({
      upsert: (...args: any[]) => mockUpsert(...args),
    })),
  },
}));

describe('Nutritional Math & Calculator AI Flow Verification', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('1. Mathematical Engine (calculeazaProfilLocal) Parity', () => {
    it('calculates Mifflin-St Jeor correctly for male with moderate activity and weight loss', () => {
      // Formula: 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780 BMR
      // TDEE: 1780 * 1.55 = 2759
      // Adjustment: -550 -> 2209 kcal
      // Protein: 2209 * 0.3 / 4 = 165.675 -> 166g
      // Carbs: 2209 * 0.4 / 4 = 220.9 -> 221g
      // Fat: 2209 * 0.3 / 9 = 73.63 -> 74g
      const res = calculeazaProfilLocal({
        varsta: 30,
        greutate: 80,
        inaltime: 180,
        sex: 'Masculin',
        activitate: 'Moderat',
        obiectiv: 'Slăbire',
      });

      expect(res).not.toBeNull();
      expect(res?.bmr).toBe(1780);
      expect(res?.tdee).toBe(2759);
      expect(res?.caloriiTinta).toBe(2209);
      expect(res?.proteineTinta).toBe(166);
      expect(res?.carbiTinta).toBe(221);
      expect(res?.grasimiTinta).toBe(74);
      expect(res?.ajustare).toBe(-550);
      expect(res?.limitatLaMinim).toBe(false);
    });

    it('calculates Mifflin-St Jeor correctly for female with muscle gain (+550 kcal)', () => {
      // Formula: 10 * 60 + 6.25 * 165 - 5 * 25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 BMR
      // Sedentary (1.2): 1345.25 * 1.2 = 1614.3 TDEE
      // Target: 1614.3 + 550 = 2164 kcal
      const res = calculeazaProfilLocal({
        varsta: 25,
        greutate: 60,
        inaltime: 165,
        sex: 'Feminin',
        activitate: 'Sedentar',
        obiectiv: 'Masă Musculară',
      });

      expect(res).not.toBeNull();
      expect(res?.bmr).toBe(1345);
      expect(res?.tdee).toBe(1614);
      expect(res?.caloriiTinta).toBe(2164);
      expect(res?.limitatLaMinim).toBe(false);
    });

    it('enforces safety calorie floor (1200 kcal for female, 1500 kcal for male)', () => {
      // Female, low weight, severe deficit
      const resFemale = calculeazaProfilLocal({
        varsta: 50,
        greutate: 40,
        inaltime: 150,
        sex: 'Feminin',
        activitate: 'Sedentar',
        obiectiv: 'Slăbire',
      });
      expect(resFemale).not.toBeNull();
      expect(resFemale?.limitatLaMinim).toBe(true);
      expect(resFemale?.caloriiTinta).toBe(1200);

      // Male, low weight, deficit
      const resMale = calculeazaProfilLocal({
        varsta: 60,
        greutate: 45,
        inaltime: 155,
        sex: 'Masculin',
        activitate: 'Sedentar',
        obiectiv: 'Slăbire',
      });
      expect(resMale).not.toBeNull();
      expect(resMale?.limitatLaMinim).toBe(true);
      expect(resMale?.caloriiTinta).toBe(1500);
    });

    it('rejects invalid inputs gracefully with null', () => {
      expect(calculeazaProfilLocal({ varsta: 15, greutate: 70, inaltime: 170, sex: 'Masculin', activitate: 'Moderat', obiectiv: 'Menținere' })).toBeNull();
      expect(calculeazaProfilLocal({ varsta: 30, greutate: 20, inaltime: 170, sex: 'Masculin', activitate: 'Moderat', obiectiv: 'Menținere' })).toBeNull();
      expect(calculeazaProfilLocal({ varsta: 30, greutate: 70, inaltime: 90, sex: 'Masculin', activitate: 'Moderat', obiectiv: 'Menținere' })).toBeNull();
    });
  });

  describe('2. UI & Interaction Flow on CalculatorAIScreen', () => {
    it('prefills inputs from user metadata on mount', async () => {
      const view = await render(<CalculatorAIScreen />);

      await waitFor(() => {
        expect(view.getByTestId('calculator-ai-age-input').props.value).toBe('28');
        expect(view.getByTestId('calculator-ai-weight-input').props.value).toBe('78');
        expect(view.getByTestId('calculator-ai-height-input').props.value).toBe('182');
      });
    });

    it('shows validation banner when fields are out of bounds', async () => {
      const view = await render(<CalculatorAIScreen />);

      await waitFor(() => {
        expect(view.getByTestId('calculator-ai-age-input').props.value).toBe('28');
      });

      // Change age to 12 (invalid, under 18)
      const ageInput = view.getByTestId('calculator-ai-age-input');
      await fireEvent.changeText(ageInput, '12');

      const calcButton = view.getByTestId('calculator-ai-calculate-btn');
      await fireEvent.press(calcButton);

      expect(mockShowBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: expect.stringContaining('18'),
        })
      );
    });

    it('calculates targets and displays interactive result card', async () => {
      const view = await render(<CalculatorAIScreen />);

      await waitFor(() => {
        expect(view.getByTestId('calculator-ai-age-input').props.value).toBe('28');
      });

      // Press calculate
      const calcButton = view.getByTestId('calculator-ai-calculate-btn');
      await act(async () => {
        await fireEvent.press(calcButton);
      });

      await waitFor(() => {
        // Result preview appears
        expect(view.getByTestId('calculator-ai-results-card')).toBeTruthy();
        expect(view.getByTestId('calculator-ai-save-btn')).toBeTruthy();
        expect(view.getByTestId('calculator-ai-modify-btn')).toBeTruthy();
      });
    });

    it('persists targets to AsyncStorage, PendingQueue, Supabase Auth, and DB, then calls marcheazaMeseModificate', async () => {
      const spySavePending = jest.spyOn(sincronizareModule, 'salveazaTargeturiPending');
      const view = await render(<CalculatorAIScreen />);

      await waitFor(() => {
        expect(view.getByTestId('calculator-ai-age-input').props.value).toBe('28');
      });

      // 1. Calculate
      const calcButton = view.getByTestId('calculator-ai-calculate-btn');
      await act(async () => {
        await fireEvent.press(calcButton);
      });

      await waitFor(() => {
        expect(view.getByTestId('calculator-ai-save-btn')).toBeTruthy();
      });

      // 2. Save
      const saveButton = view.getByTestId('calculator-ai-save-btn');
      await act(async () => {
        await fireEvent.press(saveButton);
      });

      await waitFor(() => {
        // MultiSet in AsyncStorage
        expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.arrayContaining(['caloriiTinta']),
            expect.arrayContaining(['proteineTinta']),
            expect.arrayContaining(['carbiTinta']),
            expect.arrayContaining(['grasimiTinta']),
          ])
        );

        // Pending targets for offline/sync consistency
        expect(spySavePending).toHaveBeenCalledWith(
          'test-user-1234',
          expect.objectContaining({
            caloriiTinta: expect.any(Number),
            proteineTinta: expect.any(Number),
            carbiTinta: expect.any(Number),
            grasimiTinta: expect.any(Number),
          })
        );

        // Supabase Auth metadata updated
        expect(mockUpdateUser).toHaveBeenCalledWith({
          data: expect.objectContaining({
            caloriiTinta: expect.any(Number),
            proteineTinta: expect.any(Number),
            carbiTinta: expect.any(Number),
            grasimiTinta: expect.any(Number),
          }),
        });

        // Supabase profil upsert called
        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: 'test-user-1234',
            calorii_tinta: expect.any(Number),
            proteine_tinta: expect.any(Number),
            carbi_tinta: expect.any(Number),
            grasimi_tinta: expect.any(Number),
          }),
          { onConflict: 'user_id' }
        );

        // Success banner & router back
        expect(mockShowBanner).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
            title: 'Profil Actualizat',
          })
        );
        expect(mockRouter.back).toHaveBeenCalled();
      });
    });
  });

  describe('3. Multi-surface Propagation Signal (marcheazaMeseModificate)', () => {
    it('notifies subscribers (such as useMeseAzi on Home/Journal tabs) when targets are modified', async () => {
      let notifiedUserId: string | null = null;
      const unsubscribe = aboneazaLaModificariMese((uid) => {
        notifiedUserId = uid;
      });

      marcheazaMeseModificate('test-user-1234');

      expect(notifiedUserId).toBe('test-user-1234');
      unsubscribe();
    });
  });
});
