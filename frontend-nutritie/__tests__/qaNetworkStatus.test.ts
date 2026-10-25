import { renderHook, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true, default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn() },
}));
const oldFetch = global.fetch;
const oldEnv = process.env.EXPO_PUBLIC_APP_ENV;
const originalEnv = { ...process.env };
Object.assign(process.env, {
  APP_ENV: 'test', EAS_BUILD_PROFILE: 'qa-isolated', EXPO_PUBLIC_APP_ENV: 'qa',
  EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000', EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'qa-synthetic-anon-key', EXPO_PUBLIC_ADS_MODE: 'disabled',
  EXPO_PUBLIC_SENTRY_DSN: '', EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: '',
});
// Load the real immutable config after supplying QA inputs, as Metro does at build time.
const { useNetworkStatus } = jest.requireActual<typeof import('../hooks/useNetworkStatus')>('../hooks/useNetworkStatus');
afterAll(() => { process.env = originalEnv; });
afterEach(() => { global.fetch = oldFetch; process.env.EXPO_PUBLIC_APP_ENV = oldEnv; jest.clearAllMocks(); });

test('QA probes only local health and stays usable through USB without internet', async () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'qa';
  expect(jest.requireActual<typeof import('../constants/config')>('../constants/config').API_URL).toBe('http://127.0.0.1:3000');
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
