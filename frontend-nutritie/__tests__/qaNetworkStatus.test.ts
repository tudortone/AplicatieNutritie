import { renderHook, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true, default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn() },
}));
const oldFetch = global.fetch;
const oldEnv = process.env.EXPO_PUBLIC_APP_ENV;
afterEach(() => { global.fetch = oldFetch; process.env.EXPO_PUBLIC_APP_ENV = oldEnv; jest.clearAllMocks(); });

test('QA probes only local health and stays usable through USB without internet', async () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'qa';
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  const view = await renderHook(() => useNetworkStatus());
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:3000/health', expect.objectContaining({ method: 'GET' })));
  expect(NetInfo.addEventListener).not.toHaveBeenCalled();
  expect(view.result.current.isOffline).toBe(false);
  view.unmount();
});

test('QA reports unavailable fixture as offline rather than trying a remote fallback', async () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'qa';
  global.fetch = jest.fn().mockRejectedValue(new Error('fixture offline'));
  const view = await renderHook(() => useNetworkStatus());
  await waitFor(() => expect(view.result.current.isOffline).toBe(true));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('non-QA retains native connectivity subscription and its existing health URL', async () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'test';
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  const view = await renderHook(() => useNetworkStatus());
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('https://clients3.google.com/generate_204', expect.objectContaining({ method: 'HEAD' })));
  expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
  view.unmount();
});
