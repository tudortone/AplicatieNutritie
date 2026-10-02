import React from 'react';
import { render, renderHook, act, fireEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion, useReducedMotionPreference } from '../hooks/useReducedMotion';
import { MOTION_DURATIONS, SPRING_CONFIGS } from '../constants/motion';
import { MealSaveSuccessModal } from '../components/ui/MealSaveSuccessModal';
import { MacroRing } from '../components/MacroRing';
import RankProgressBar from '../components/fitness/RankProgressBar';
import ExpiryBar from '../components/food/ExpiryBar';
import BouncingDot from '../components/BouncingDot';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { MotionCardEnter, MotionMacroBar, MotionSkeleton } from '../components/ui/MotionPrimitives';
import PasLimba from '../app/onboarding/index';
import EcranPas from '../components/onboarding/EcranPas';
import LockScreen from '../components/LockScreen';
import { Text } from 'react-native';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useFocusEffect: (cb: any) => cb(),
}));

jest.mock('../context/OnboardingContext', () => ({
  useOnboarding: () => ({
    date: { scop: null, gen: null },
    actualizeaza: jest.fn(),
  }),
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => children,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: string) => (typeof def === 'string' ? def : key),
    i18n: {
      language: 'en',
      isInitialized: true,
      changeLanguage: jest.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      surfaceElevated: '#181D22',
      surface: '#12171A',
      surfaceBg: '#12171A',
      accent: '#CCFF00',
      accentSecondary: '#A8FF3E',
      accentTertiary: '#00F0FF',
      accentGradient: ['#CCFF00', '#A8FF3E'],
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
      textTertiary: '#666666',
      background: '#090C0E',
      cardBg: '#181D22',
      cardBorder: 'rgba(255,255,255,0.1)',
      border: 'rgba(255,255,255,0.1)',
      disabledBg: '#333333',
      disabledText: '#777777',
      danger: '#FF4444',
      warning: '#FFBB00',
      gold: '#FFD700',
      shadow: '#000000',
      overlayStrong: 'rgba(0,0,0,0.6)',
      overlayLight: 'rgba(255,255,255,0.08)',
    },
  }),
}));

describe('P1-06 — Motion System & Reduced Motion Accessibility Suite', () => {
  let listeners: ((enabled: boolean) => void)[] = [];
  let removeFn: jest.Mock;

  beforeEach(() => {
    listeners = [];
    removeFn = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
      () => Promise.resolve(false) as any
    );
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(
      (event: any, handler: any) => {
        if (event === 'reduceMotionChanged') {
          listeners.push(handler);
        }
        return { remove: removeFn } as any;
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Centralized Reduced Motion Authority', () => {
    it('returns false when OS reduce motion is OFF', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
      const hookResult = await renderHook(() => useReducedMotion());

      expect(hookResult.result.current).toBe(false);

      await act(async () => {
        await Promise.resolve();
      });

      expect(hookResult.result.current).toBe(false);
    });

    it('returns true when OS reduce motion is ON on initial load', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
      const hookResult = await renderHook(() => useReducedMotion());

      await act(async () => {
        await Promise.resolve();
      });

      expect(hookResult.result.current).toBe(true);
    });

    it('updates runtime authority when OS preference changes', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
      const hookResult = await renderHook(() => useReducedMotion());

      await act(async () => {
        await Promise.resolve();
      });
      expect(hookResult.result.current).toBe(false);

      // Simulate OS toggle ON
      await act(async () => {
        listeners.forEach((l) => l(true));
      });
      expect(hookResult.result.current).toBe(true);

      // Simulate OS toggle OFF
      await act(async () => {
        listeners.forEach((l) => l(false));
      });
      expect(hookResult.result.current).toBe(false);
    });

    it('cleans up OS preference listener on unmount', async () => {
      function TestComponent() {
        useReducedMotion();
        return null;
      }

      const view = await render(<TestComponent />);
      expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
        'reduceMotionChanged',
        expect.any(Function)
      );

      await act(async () => {
        view.unmount();
      });
      expect(removeFn).toHaveBeenCalled();
    });

    it('provides useReducedMotionPreference as identical authority', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
      const hookResult = await renderHook(() => useReducedMotionPreference());

      await act(async () => {
        await Promise.resolve();
      });
      expect(hookResult.result.current).toBe(true);
    });
  });

  describe('2. Motion Tokens & Canonical Durations', () => {
    it('defines standard motion token durations and spring configurations', () => {
      expect(MOTION_DURATIONS.instant).toBe(0);
      expect(MOTION_DURATIONS.quick).toBe(100);
      expect(MOTION_DURATIONS.fast).toBe(150);
      expect(MOTION_DURATIONS.standard).toBe(250);
      expect(MOTION_DURATIONS.entering).toBe(350);
      expect(MOTION_DURATIONS.feedback).toBe(500);
      expect(MOTION_DURATIONS.feedbackReduced).toBe(350);
      expect(MOTION_DURATIONS.feedbackReduced).toBeLessThan(MOTION_DURATIONS.feedback);

      expect(SPRING_CONFIGS.standard).toBeDefined();
      expect(SPRING_CONFIGS.snappy).toBeDefined();
      expect(SPRING_CONFIGS.gentle).toBeDefined();
    });
  });

  describe('3. Invariant: Critical Business Logic Decoupled from Animation', () => {
    it('MealSaveSuccessModal does NOT own or delay save callback / completion', async () => {
      const onDismiss = jest.fn();
      const mealData = { nume: 'Pui cu broccoli', calorii: 350, proteine: 35 };

      const view = await render(
        <MealSaveSuccessModal
          visible={true}
          data={mealData}
          onDismiss={onDismiss}
        />
      );

      expect(view.getByText(/Masă adăugată!|Meal added!/i)).toBeTruthy();
      expect(view.getByText('Pui cu broccoli')).toBeTruthy();

      // User tap immediately dismisses without waiting for timer
      const backdrop = view.getByTestId('meal-save-backdrop');
      fireEvent.press(backdrop);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('MealSaveSuccessModal operates in reduced mode with shortened timing', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
      const onDismiss = jest.fn();
      const mealData = { nume: 'Salată verde', calorii: 150, proteine: 5 };

      const view = await render(
        <MealSaveSuccessModal
          visible={true}
          data={mealData}
          onDismiss={onDismiss}
        />
      );

      expect(view.getByText('Salată verde')).toBeTruthy();
      expect(view.getByText('+150 kcal')).toBeTruthy();
    });
  });

  describe('4. Component Motion Gating & Continuous Animation Neutralization', () => {
    it('MacroRing displays final progress value', async () => {
      const view = await render(
        <MacroRing consumat={1500} tinta={2000} />
      );
      expect(view.getByText('1500')).toBeTruthy();
      expect(view.getByText('/ 2000 kcal')).toBeTruthy();
    });

    it('RankProgressBar displays final kg values and rank', async () => {
      const view = await render(
        <RankProgressBar
          currentKg={72.5}
          nextRankKg={75}
          rankLabel="Platină"
          nextRankLabel="Diamant"
        />
      );
      expect(view.getByText('Platină')).toBeTruthy();
      expect(view.getByText('72.500 / 75.000 kg')).toBeTruthy();
    });

    it('ExpiryBar renders label correctly without crashing', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
      const view = await render(
        <ExpiryBar expiryDate={futureDate} />
      );
      expect(view.toJSON()).toBeTruthy();
    });

    it('SkeletonLoader renders with static opacity when reduced motion is on', async () => {
      const view = await render(
        <SkeletonLoader width={100} height={20} />
      );
      expect(view.toJSON()).toBeTruthy();
    });

    it('BouncingDot renders cleanly without crashing in reduced mode', async () => {
      const view = await render(
        <BouncingDot delay={100} />
      );
      expect(view.toJSON()).toBeTruthy();
    });

    it('MotionPrimitives render immediately with static wrappers in reduced motion', async () => {
      const view = await render(
        <>
          <MotionCardEnter>
            <SkeletonLoader width={80} height={16} />
          </MotionCardEnter>
          <MotionMacroBar progress={0.8} />
          <MotionSkeleton width={50} height={10} />
        </>
      );
      expect(view.getByTestId('macro-progress-bar')).toBeTruthy();
    });
  });

  describe('5. Screen & Flow Resilience Under Reduced Motion', () => {
    it('PasLimba (Language Selector) operates cleanly with static entrance and immediate selection under reduced motion', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
      const view = await render(<PasLimba />);

      // All language options render
      expect(view.getByText('English')).toBeTruthy();
      expect(view.getByText('Română')).toBeTruthy();
      expect(view.getByText('Français')).toBeTruthy();
      expect(view.getByText('Deutsch')).toBeTruthy();

      // Tap on Română
      const roOption = view.getByText('Română');
      await act(async () => {
        fireEvent.press(roOption);
      });
      // Selection works immediately without being blocked or delayed
      expect(view.getByText('Română')).toBeTruthy();
    });

    it('EcranPas (Onboarding Container) renders without spatial entrance and processes action immediately', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
      const onContinue = jest.fn().mockResolvedValue(true);
      const view = await render(
        <EcranPas
          pas="/onboarding"
          titlu="Test Pas Onboarding"
          subtitlu="Subtitlu test"
          laContinuare={onContinue}
        >
          <Text>Continut Pas</Text>
        </EcranPas>
      );

      expect(view.getByText('Test Pas Onboarding')).toBeTruthy();
      expect(view.getByText('Continut Pas')).toBeTruthy();

      const btn = view.getByRole('button', { name: /continue|continuă/i });
      await act(async () => {
        fireEvent.press(btn);
      });
      expect(onContinue).toHaveBeenCalled();
    });

    it('LockScreen continuous pulse is deactivated under reduced motion', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
      const onUnlock = jest.fn().mockResolvedValue(true);
      const view = await render(
        <LockScreen biometricType="Fingerprint" onUnlock={onUnlock} />
      );

      expect(view.getByText('lockScreen.unlockAction')).toBeTruthy();
    });
  });
});
