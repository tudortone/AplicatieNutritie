import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Text } from 'react-native';

// Mocks for dependencies
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  wrap: (comp: any) => comp,
}));
jest.mock('../i18n', () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      'globalError.title': 'Ceva nu a funcționat corect',
      'globalError.message': 'A apărut o problemă neașteptată.',
      'globalError.retry': 'Reîncearcă',
    };
    return map[key] || key;
  },
}));

import { GETFLOW_PRODUCTION_ADMOB, isGetFlowProductionAppId, isGetFlowProductionUnitId } from '../lib/ads/adConfig.production';
import { sanitizeAdGateState, AD_GATE_INITIAL_STATE } from '../lib/ads/adGate';
import { loadAdGateState, saveAdGateState, purgeAdGateState, __resetAdGateStoreForTests } from '../lib/ads/adGateStore';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { createPlayIntegrityClient } from '../lib/playIntegrity';

describe('androidProductionStartupRegression — Complete Android Startup Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAdGateStoreForTests();
  });

  describe('Contract 1: Production Configuration Integrity', () => {
    it('contains strictly authorized GetFlow production AdMob IDs with NO sample/test IDs', () => {
      expect(GETFLOW_PRODUCTION_ADMOB.appIdAndroid).toBe('ca-app-pub-5202280855139508~6141533757');
      expect(GETFLOW_PRODUCTION_ADMOB.rewardedAndroidUnitId).toBe('ca-app-pub-5202280855139508/3566028223');
      expect(GETFLOW_PRODUCTION_ADMOB.interstitialAndroidUnitId).toBe('ca-app-pub-5202280855139508/1542500110');

      // Zero Google sample/test IDs allowed
      expect(GETFLOW_PRODUCTION_ADMOB.appIdAndroid).not.toContain('3940256099942544');
      expect(GETFLOW_PRODUCTION_ADMOB.rewardedAndroidUnitId).not.toContain('3940256099942544');
      expect(GETFLOW_PRODUCTION_ADMOB.interstitialAndroidUnitId).not.toContain('3940256099942544');

      expect(isGetFlowProductionAppId(GETFLOW_PRODUCTION_ADMOB.appIdAndroid)).toBe(true);
      expect(isGetFlowProductionUnitId(GETFLOW_PRODUCTION_ADMOB.rewardedAndroidUnitId)).toBe(true);
      expect(isGetFlowProductionUnitId(GETFLOW_PRODUCTION_ADMOB.interstitialAndroidUnitId)).toBe(true);
    });

    it('rejects Google sample test IDs in production validator', () => {
      expect(isGetFlowProductionAppId('ca-app-pub-3940256099942544~3347511713')).toBe(false);
      expect(isGetFlowProductionUnitId('ca-app-pub-3940256099942544/1033173712')).toBe(false);
    });
  });

  describe('Contract 2: Cold-Start MMKV Immunity (P0 Root Cause Fix)', () => {
    it('loadAdGateState operates synchronously with zero MMKV / native C++ calls', () => {
      // If any code attempts to load MMKV, throw fatal
      jest.doMock('react-native-mmkv', () => {
        throw new Error('FATAL: MMKV must never be loaded during cold start!');
      });

      const state = loadAdGateState('anon');
      expect(state).toEqual(AD_GATE_INITIAL_STATE);
      expect(state.successfulAnalysisCount).toBe(0);
      expect(state.chatMessageCount).toBe(0);
      expect(state.lastAdShownAtMs).toBeNull();
    });

    it('handles multiple user scopes cleanly in memory', () => {
      saveAdGateState('user-alpha', {
        ...AD_GATE_INITIAL_STATE,
        successfulAnalysisCount: 2,
      });

      expect(loadAdGateState('user-alpha').successfulAnalysisCount).toBe(2);
      expect(loadAdGateState('user-beta').successfulAnalysisCount).toBe(0);

      purgeAdGateState('user-alpha');
      expect(loadAdGateState('user-alpha').successfulAnalysisCount).toBe(0);
    });
  });

  describe('Contract 3: Persisted State Resilience (v8-v13 migration & corruption safety)', () => {
    it('safely normalizes null, undefined, malformed, or corrupt state', () => {
      expect(sanitizeAdGateState(null)).toEqual(AD_GATE_INITIAL_STATE);
      expect(sanitizeAdGateState(undefined)).toEqual(AD_GATE_INITIAL_STATE);
      expect(sanitizeAdGateState('corrupted string' as any)).toEqual(AD_GATE_INITIAL_STATE);
      expect(sanitizeAdGateState(12345 as any)).toEqual(AD_GATE_INITIAL_STATE);
      expect(sanitizeAdGateState({} as any)).toEqual(AD_GATE_INITIAL_STATE);
    });

    it('sanitizes partial, out-of-range, and unexpected values', () => {
      const sanitized = sanitizeAdGateState({
        successfulAnalysisCount: -5, // negative should reset to 0
        chatMessageCount: 'not-a-number' as any,
        lastAdShownAtMs: 'invalid-date' as any,
        unexpectedField: 'discarded',
      });

      expect(sanitized.successfulAnalysisCount).toBe(0);
      expect(sanitized.chatMessageCount).toBe(0);
      expect(sanitized.lastAdShownAtMs).toBeNull();
      expect((sanitized as any).unexpectedField).toBeUndefined();
    });
  });

  describe('Contract 4: Startup Error Containment', () => {
    // Suppress console.error in boundary tests
    const origError = console.error;
    beforeAll(() => {
      console.error = jest.fn();
    });
    afterAll(() => {
      console.error = origError;
    });

    it('GlobalErrorBoundary prevents unhandled React render crashes and allows retry', async () => {
      let shouldThrow = true;
      function CrashingChild() {
        if (shouldThrow) {
          throw new Error('Simulated startup render crash');
        }
        return <Text testID="recovered-ui">App Recovered Successfully</Text>;
      }

      const screen = await render(
        <GlobalErrorBoundary>
          <CrashingChild />
        </GlobalErrorBoundary>
      );

      // Boundary caught the error, child UI is not rendered
      expect(screen.queryByTestId('recovered-ui')).toBeNull();
      expect(screen.getByText('Ceva nu a funcționat corect')).toBeTruthy();

      expect(screen.getByText('Ceva nu a funcționat corect')).toBeTruthy();
      expect(screen.getByText('Reîncearcă')).toBeTruthy();

      // Retry updates state back to hasError: false
      shouldThrow = false;
      const retryBtn = screen.getByText('Reîncearcă');
      await act(async () => {
        fireEvent.press(retryBtn);
      });
      expect(screen.queryByText('A apărut o problemă neașteptată.')).toBeNull();
      expect(screen.getByText('App Recovered Successfully')).toBeTruthy();
    });
  });

  describe('Contract 5: Optional Subsystem Isolation & Fault Containment', () => {
    it('Play Integrity client degrades gracefully to empty headers when token preparation throws', async () => {
      const client = createPlayIntegrityClient({
        platform: 'android',
        cloudProjectNumber: '435128681048',
        prepare: jest.fn().mockRejectedValue(new Error('Play Integrity native service unavailable')),
        requestToken: jest.fn(),
      });

      const headers = await client.headers({ method: 'POST', path: '/auth/login' });
      expect(headers).toEqual({});
    });

    it('Play Integrity client rejects non-numeric project numbers fail-safe without throwing', async () => {
      const client = createPlayIntegrityClient({
        platform: 'android',
        cloudProjectNumber: 'not-a-number',
        prepare: jest.fn(),
        requestToken: jest.fn(),
      });

      const headers = await client.headers({ method: 'GET', path: '/api/status' });
      expect(headers).toEqual({});
    });
  });
});
