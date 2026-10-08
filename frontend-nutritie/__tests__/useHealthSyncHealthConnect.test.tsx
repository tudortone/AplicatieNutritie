import React from 'react';
import { Platform } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockInitialize = jest.fn().mockResolvedValue(true);
const mockGetGrantedPermissions = jest.fn().mockResolvedValue([
  { accessType: 'read', recordType: 'Steps' },
]);
const mockRequestPermission = jest.fn().mockResolvedValue([
  { accessType: 'read', recordType: 'Steps' },
]);
const mockAggregateRecord = jest.fn().mockResolvedValue({ COUNT_TOTAL: 4321 });

jest.mock('react-native-health-connect', () => ({
  initialize: (...args: unknown[]) => mockInitialize(...args),
  getGrantedPermissions: (...args: unknown[]) => mockGetGrantedPermissions(...args),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
  aggregateRecord: (...args: unknown[]) => mockAggregateRecord(...args),
}));

const mockWatchRemove = jest.fn();
jest.mock('expo-sensors', () => ({
  Pedometer: {
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    getStepCountAsync: jest.fn().mockResolvedValue({ steps: 999 }),
    watchStepCount: jest.fn(() => ({ remove: mockWatchRemove })),
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

import { getHealthProvidersForPlatform, useHealthSync } from '../hooks/useHealthSync';

describe('useHealthSync Android Health Connect authority', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOs });
  });

  test('loads the aggregated Health Connect day total instead of the foreground pedometer', async () => {
    await AsyncStorage.setItem('health_sync_provider', 'samsung_health');
    const { result, unmount } = await renderHook(() => useHealthSync());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockInitialize).toHaveBeenCalled();
    expect(mockGetGrantedPermissions).toHaveBeenCalled();
    expect(mockAggregateRecord).toHaveBeenCalledWith(expect.objectContaining({
      recordType: 'Steps',
    }));
    expect(result.current.steps).toBe(4321);
    expect(result.current.selectedProvider).toBe('health_connect');
    expect(require('expo-sensors').Pedometer.watchStepCount).not.toHaveBeenCalled();
    unmount();
  });

  test('lets the user type an exact completed-step total without discarding Health Connect steps', async () => {
    const { result, unmount } = await renderHook(() => useHealthSync());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.setCompletedSteps(5000); });
    expect(result.current.steps).toBe(5000);
    const manualKeys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('manual_steps_'));
    expect(manualKeys).toHaveLength(1);
    expect(await AsyncStorage.getItem(manualKeys[0])).toBe('679');
    unmount();
  });
});
  test('offers only the actual Health Connect authority on Android', () => {
    expect(getHealthProvidersForPlatform('android').map((provider) => provider.id))
      .toEqual(['health_connect']);
  });
