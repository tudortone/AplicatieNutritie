import React from 'react';
import { AppState, BackHandler, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { AppUpdateNotice } from '../components/AppUpdateNotice';
import { checkForAppUpdate, openAppStore } from '../lib/versionCheck';

jest.mock('expo-updates', () => ({
  isEnabled: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));
jest.mock('../lib/versionCheck', () => ({ checkForAppUpdate: jest.fn(), openAppStore: jest.fn() }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      surfaceElevated: '#181D22',
      textPrimary: '#FFFFFF',
      textSecondary: '#9AA0B0',
      accent: '#CCFF00',
      textOnAccent: '#000000',
    },
  }),
}));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 12 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }) }));

const check = checkForAppUpdate as jest.Mock;
const open = openAppStore as jest.Mock;
const mutableUpdates = Updates as unknown as {
  isEnabled: boolean;
  checkForUpdateAsync: jest.Mock;
  fetchUpdateAsync: jest.Mock;
  reloadAsync: jest.Mock;
};
let resume: (state: AppStateStatus) => void;
const result = {
  checked: true,
  needsForceUpdate: false,
  needsOptionalUpdate: true,
  requiresUpdate: false,
  currentVersionCode: 37,
  currentVersionName: '1.0.0',
  updateInfo: { latestVersionCode: 38, latestVersionName: '1.0.1' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mutableUpdates.isEnabled = false;
  check.mockResolvedValue(result);
  open.mockResolvedValue(true);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    resume = callback;
    return { remove: jest.fn() };
  });
});

afterEach(() => jest.restoreAllMocks());

test('shows optional update advice and can be dismissed without navigating', async () => {
  const ui = await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Update available')).toBeTruthy());
  await fireEvent.press(ui.getByLabelText('Dismiss update notice'));
  expect(ui.queryByText('Update available')).toBeNull();
  await act(async () => resume('active'));
  expect(check).toHaveBeenCalledTimes(1);
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now + 61000);
  await act(async () => resume('active'));
  expect(check).toHaveBeenCalledTimes(2);
  expect(ui.queryByText('Update available')).toBeNull();
});

test('disabled startup does not query or display anything', async () => {
  const ui = await render(<AppUpdateNotice enabled={false} />);
  expect(ui.toJSON()).toBeNull();
  expect(check).not.toHaveBeenCalled();
});

test('forced update blocks dismissal, intercepts hardware back, and re-checks on Play return', async () => {
  const backSpy = jest.spyOn(BackHandler, 'addEventListener');
  check.mockResolvedValue({ ...result, requiresUpdate: true, needsForceUpdate: true });
  const ui = await render(<AppUpdateNotice enabled />);

  await waitFor(() => expect(ui.getByTestId('force-update-blocking-screen')).toBeTruthy());
  expect(ui.getByText('Update required')).toBeTruthy();
  expect(ui.queryByLabelText('Dismiss update notice')).toBeNull();
  expect(backSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));

  const handler = backSpy.mock.calls.find(([evt]) => evt === 'hardwareBackPress')?.[1];
  expect(handler?.()).toBe(true);

  await fireEvent.press(ui.getByTestId('force-update-recheck-btn'));
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2));

  check.mockResolvedValueOnce({ ...result, requiresUpdate: false, needsForceUpdate: false, needsOptionalUpdate: false });
  await act(async () => resume('active'));
  await waitFor(() => expect(ui.queryByTestId('force-update-blocking-screen')).toBeNull());
});

test('OTA update downloads and reloads automatically when enabled and available in non-dev builds', async () => {
  const g = globalThis as { __DEV__?: boolean };
  const prevDev = g.__DEV__;
  g.__DEV__ = false;
  try {
    mutableUpdates.isEnabled = true;
    mutableUpdates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true });
    mutableUpdates.fetchUpdateAsync.mockResolvedValueOnce({ isNew: true });
    mutableUpdates.reloadAsync.mockResolvedValueOnce(undefined);
    check.mockResolvedValue({ ...result, needsOptionalUpdate: false });

    const ui = await render(<AppUpdateNotice enabled />);
    await waitFor(() => expect(mutableUpdates.fetchUpdateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mutableUpdates.reloadAsync).toHaveBeenCalledTimes(1));
    expect(ui.getByTestId('ota-update-blocking-screen')).toBeTruthy();
  } finally {
    g.__DEV__ = prevDev;
  }
});

test('rapid double tap while opening Play is pending opens once, failure retains retry and support', async () => {
  let finish!: (value: boolean) => void;
  open.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const ui = await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Open Google Play')).toBeTruthy());
  const button = ui.getByText('Open Google Play');
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(ui.getByText('Google Play could not open. Retry or contact support.')).toBeTruthy();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await fireEvent.press(ui.getByText('Contact support'));
  expect(Linking.openURL).toHaveBeenCalledWith('mailto:supportgetflow@gmail.com');
  open.mockResolvedValue(true);
  await fireEvent.press(ui.getByText('Open Google Play'));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
});

test('pending version check is not duplicated and is ignored after unmount', async () => {
  let finish!: (value: unknown) => void;
  check.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const ui = await render(<AppUpdateNotice enabled />);
  await act(async () => resume('active'));
  expect(check).toHaveBeenCalledTimes(1);
  await ui.unmount();
  await act(async () => finish(result));
});
