import React from 'react';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppUpdateNotice } from '../components/AppUpdateNotice';
import { checkForAppUpdate, openAppStore } from '../lib/versionCheck';

jest.mock('../lib/versionCheck', () => ({ checkForAppUpdate: jest.fn(), openAppStore: jest.fn() }));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ colors: { surfaceElevated:'#181D22', textPrimary:'#FFFFFF', textSecondary:'#9AA0B0', accent:'#CCFF00', textOnAccent:'#000000' } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }) }));
const check = checkForAppUpdate as jest.Mock;
const open = openAppStore as jest.Mock;
let resume: (state: AppStateStatus) => void;
const result = { checked:true, needsForceUpdate:false, needsOptionalUpdate:true, requiresUpdate:false,
  currentVersionCode:37, currentVersionName:'1.0.0', updateInfo:{ latestVersionCode:38 } };
beforeEach(() => {
  jest.clearAllMocks();check.mockResolvedValue(result);open.mockResolvedValue(true);
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event, callback) => {resume=callback;return { remove:jest.fn() };});
});
afterEach(() => jest.restoreAllMocks());
test('shows native update advice and can be dismissed without navigating', async () => {
  const ui=await render(<AppUpdateNotice enabled />);
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
  const ui=await render(<AppUpdateNotice enabled={false} />);
  expect(ui.toJSON()).toBeNull();expect(check).not.toHaveBeenCalled();
});
test('required policy remains dismissible when per-user Play availability is unverified', async () => {
  check.mockResolvedValue({...result,requiresUpdate:true});
  const ui=await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Update recommended to continue safely')).toBeTruthy());
  await fireEvent.press(ui.getByLabelText('Dismiss update notice'));
  expect(ui.queryByText('Update recommended to continue safely')).toBeNull();
});
test('rapid double tap while opening Play is pending opens once, failure retains retry and support', async () => {
  let finish!: (value:boolean) => void;
  open.mockImplementation(() => new Promise<boolean>(resolve => {finish=resolve;}));
  const ui=await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Open Google Play')).toBeTruthy());
  const button = ui.getByText('Open Google Play');
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(ui.getByText('Google Play could not open. Retry or contact support.')).toBeTruthy();
  jest.spyOn(Linking,'openURL').mockResolvedValue(undefined);
  await fireEvent.press(ui.getByText('Contact support'));
  expect(Linking.openURL).toHaveBeenCalledWith('mailto:supportgetflow@gmail.com');
  open.mockResolvedValue(true);await fireEvent.press(ui.getByText('Open Google Play'));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
});
test('pending version check is not duplicated and is ignored after unmount', async () => {
  let finish!: (value:unknown) => void;
  check.mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  const ui=await render(<AppUpdateNotice enabled />);
  await act(async () => resume('active'));
  expect(check).toHaveBeenCalledTimes(1);
  await ui.unmount();await act(async () => finish(result));
});
