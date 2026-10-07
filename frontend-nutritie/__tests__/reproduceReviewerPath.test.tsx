import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import PasDataNasterii from '../app/onboarding/data-nasterii';
import PasInaltime from '../app/onboarding/inaltime';
import { OnboardingProvider } from '../context/OnboardingContext';
import { anuleazaProtectieNavigare } from '../lib/onboardingNavigationGuard';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      canGoBack: mockCanGoBack,
      replace: mockPush,
    }),
    useFocusEffect: (cb: () => void) => {
      ReactModule.useEffect(() => {
        cb();
      }, []);
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: any) => {
      if (typeof def === 'string') return def;
      return key;
    },
    i18n: { language: 'en', isInitialized: true },
  }),
}));

describe('Reviewer Path Reproduction & Remediation', () => {
  beforeEach(() => {
    anuleazaProtectieNavigare();
    mockPush.mockClear();
    jest.clearAllMocks();
  });

  it('renders PasDataNasterii with enabled Continue button and labels', async () => {
    const view = await render(
      <OnboardingProvider>
        <PasDataNasterii />
      </OnboardingProvider>
    );

    await waitFor(() => {
      expect(view.getByText('onboarding.birthdateTitle')).toBeTruthy();
    });

    const continueButton = view.getByLabelText('Continue');
    expect(continueButton).toBeTruthy();
    expect(continueButton.props.accessibilityState.disabled).toBe(false);
    expect(continueButton.props.accessibilityState.busy).toBe(false);
  });

  it('navigates from PasDataNasterii to /onboarding/inaltime when Continue is pressed', async () => {
    const view = await render(
      <OnboardingProvider>
        <PasDataNasterii />
      </OnboardingProvider>
    );

    await waitFor(() => {
      expect(view.getByText('onboarding.birthdateTitle')).toBeTruthy();
    });

    const continueButton = view.getByLabelText('Continue');
    await act(async () => {
      fireEvent.press(continueButton);
    });

    expect(mockPush).toHaveBeenCalledWith('/onboarding/inaltime');
  });

  it('supports wheel adjustments via onScrollEndDrag on Android', async () => {
    const view = await render(
      <OnboardingProvider>
        <PasDataNasterii />
      </OnboardingProvider>
    );

    await waitFor(() => {
      expect(view.getByText('onboarding.birthdateTitle')).toBeTruthy();
    });

    const yearWheel = view.getByLabelText('onboarding.birthdateYearA11y');
    expect(yearWheel).toBeTruthy();

    await act(async () => {
      fireEvent(yearWheel, 'scrollEndDrag', {
        nativeEvent: { contentOffset: { y: 2 * 46 } },
      });
    });

    const continueButton = view.getByLabelText('Continue');
    await act(async () => {
      fireEvent.press(continueButton);
    });

    expect(mockPush).toHaveBeenCalledWith('/onboarding/inaltime');
  });

  it('recovers button interactivity after failsafe timeout if screen remains in view', async () => {
    const view = await render(
      <OnboardingProvider>
        <PasDataNasterii />
      </OnboardingProvider>
    );

    await waitFor(() => {
      expect(view.getByText('onboarding.birthdateTitle')).toBeTruthy();
    });

    const continueButton = view.getByLabelText('Continue');
    await act(async () => {
      fireEvent.press(continueButton);
    });

    expect(mockPush).toHaveBeenCalledWith('/onboarding/inaltime');

    // Wait for the 1200ms failsafe timer using real time
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });

    const updatedButton = view.getByLabelText('Continue');
    expect(updatedButton.props.accessibilityState.busy).toBe(false);
    expect(updatedButton.props.accessibilityState.disabled).toBe(false);
  });

  it('renders PasInaltime and navigates to /onboarding/greutate', async () => {
    const view = await render(
      <OnboardingProvider>
        <PasInaltime />
      </OnboardingProvider>
    );

    await waitFor(() => {
      expect(view.getByText('onboarding.heightTitle')).toBeTruthy();
    });

    const continueButton = view.getByLabelText('Continue');
    await act(async () => {
      fireEvent.press(continueButton);
    });

    expect(mockPush).toHaveBeenCalledWith('/onboarding/greutate');
  });
});
