import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AppSplashScreen } from '../components/ui/AppSplashScreen';
import * as SplashScreen from 'expo-splash-screen';

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn().mockResolvedValue(true),
  preventAutoHideAsync: jest.fn().mockResolvedValue(true),
}));

describe('AppSplashScreen Minimalist Animation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders GetFlow branding elements cleanly on mount', async () => {
    const screen = await render(<AppSplashScreen isReady={false} />);

    expect(screen.getByTestId('app-splash-screen')).toBeTruthy();
    expect(screen.getByText('GetFlow')).toBeTruthy();
    expect(screen.getByText('NUTRIȚIE & ENERGIE')).toBeTruthy();
    expect(screen.getByLabelText('GetFlow Logo')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('triggers exit and unmounts after min display time when isReady is true', async () => {
    const onComplete = jest.fn();
    const screen = await render(
      <AppSplashScreen isReady={false} onAnimationComplete={onComplete} />
    );

    expect(screen.queryByTestId('app-splash-screen')).toBeTruthy();

    // Mark as ready
    await screen.rerender(<AppSplashScreen isReady={true} onAnimationComplete={onComplete} />);

    // Fast-forward beyond MIN_DISPLAY_MS and exit duration
    await act(async () => {
      jest.advanceTimersByTime(1200);
    });

    expect(onComplete).toHaveBeenCalled();
    expect(screen.queryByTestId('app-splash-screen')).toBeNull();
  });

  it('safely dismisses on max fallback timeout if app takes too long', async () => {
    const onComplete = jest.fn();
    const screen = await render(
      <AppSplashScreen isReady={false} onAnimationComplete={onComplete} />
    );

    expect(screen.queryByTestId('app-splash-screen')).toBeTruthy();

    // Fast-forward beyond MAX_FALLBACK_MS and exit duration
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(onComplete).toHaveBeenCalled();
    expect(screen.queryByTestId('app-splash-screen')).toBeNull();
  });

  it('respects reduceMotion accessibility setting and exits quickly without jarring animation', async () => {
    const motionHook = require('../hooks/useReducedMotion');
    jest.spyOn(motionHook, 'useReducedMotion').mockReturnValue(true);

    const onComplete = jest.fn();
    const screen = await render(
      <AppSplashScreen isReady={true} onAnimationComplete={onComplete} />
    );

    await act(async () => {
      jest.advanceTimersByTime(1200);
    });

    expect(onComplete).toHaveBeenCalled();
    expect(screen.queryByTestId('app-splash-screen')).toBeNull();
  });
});
