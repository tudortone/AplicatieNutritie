import React from 'react';
import { AppState, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppUpdateNotice } from '../components/AppUpdateNotice';
import { checkForAppUpdate, openAppStore } from '../lib/versionCheck';

jest.mock('../lib/versionCheck', () => ({ checkForAppUpdate: jest.fn(), openAppStore: jest.fn() }));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ colors: { surfaceElevated:'#181D22', textPrimary:'#FFFFFF', textSecondary:'#9AA0B0', accent:'#CCFF00', textOnAccent:'#000000' } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }) }));
const check = checkForAppUpdate as jest.Mock;
const open = openAppStore as jest.Mock;
let resume: (state: string) => void;
const result = { checked:true, needsForceUpdate:false, needsOptionalUpdate:true, requiresUpdate:false,
  currentVersionCode:37, currentVersionName:'1.0.0', updateInfo:{ latestVersionCode:38 } };
beforeEach(() => {
  jest.clearAllMocks();check.mockResolvedValue(result);open.mockResolvedValue(true);
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event, callback) => {resume=callback;return { remove:jest.fn() };});
});
test('shows native update advice and can be dismissed without navigating', async () => {
  const ui=await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Update available')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('Dismiss update notice'));
  expect(ui.queryByText('Update available')).toBeNull();
  await act(async () => resume('active'));
  expect(check).toHaveBeenCalledTimes(1);
});
test('disabled startup does not query or display anything', async () => {
  const ui=await render(<AppUpdateNotice enabled={false} />);
  expect(ui.toJSON()).toBeNull();expect(check).not.toHaveBeenCalled();
});
test('required policy remains dismissible when per-user Play availability is unverified', async () => {
  check.mockResolvedValue({...result,requiresUpdate:true});
  const ui=await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Update recommended to continue safely')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('Dismiss update notice'));
  expect(ui.queryByText('Update recommended to continue safely')).toBeNull();
});
test('same-tick double tap opens Play once, failure retains retry and support', async () => {
  let finish!: (value:boolean) => void;
  open.mockImplementation(() => new Promise<boolean>(resolve => {finish=resolve;}));
  const ui=await render(<AppUpdateNotice enabled />);
  await waitFor(() => expect(ui.getByText('Open Google Play')).toBeTruthy());
  act(() => {fireEvent.press(ui.getByText('Open Google Play'));fireEvent.press(ui.getByText('Open Google Play'));});
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => finish(false));
  expect(ui.getByText('Google Play could not open. Retry or contact support.')).toBeTruthy();
  jest.spyOn(Linking,'openURL').mockResolvedValue(undefined);
  fireEvent.press(ui.getByText('Contact support'));
  expect(Linking.openURL).toHaveBeenCalledWith('mailto:supportgetflow@gmail.com');
  open.mockResolvedValue(true);fireEvent.press(ui.getByText('Open Google Play'));
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
