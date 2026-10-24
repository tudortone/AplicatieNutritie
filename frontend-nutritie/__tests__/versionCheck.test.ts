import { Linking, Platform } from 'react-native';
import { checkForAppUpdate, getCurrentVersionCode, openAppStore } from '../lib/versionCheck';
import * as Application from 'expo-application';

jest.mock('expo-application', () => ({ __esModule: true, nativeBuildVersion: '37', nativeApplicationVersion: '1.0.0', applicationId: 'com.totsrl.getflo' }));
jest.mock('expo-constants', () => ({ expoConfig: { android: { versionCode: 999 }, version: 'wrong-ota-label' } }));
jest.mock('../lib/api', () => ({ buildApiUrl: (p: string) => `https://example.invalid/api/v1${p}` }));

const policy = { minVersionCode: 31, latestVersionCode: 38, latestVersionName: '1.0.0', forceUpdate: false, isOutdated: true,
  storeUrl: 'https://play.google.com/store/apps/details?id=com.totsrl.getflo', marketUrl: 'market://details?id=com.totsrl.getflo' };
const originalFetch = global.fetch;
const mutableApp = Application as unknown as { nativeBuildVersion: string | null; applicationId: string };
const respond = (body: unknown) => jest.fn().mockResolvedValue({ ok: true, json: async () => body });

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mutableApp.nativeBuildVersion = '37'; mutableApp.applicationId = 'com.totsrl.getflo';
  global.fetch = respond(policy);
});
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); jest.restoreAllMocks(); });

test('uses the installed native build, never app config or a hardcoded fallback', () => {
  expect(getCurrentVersionCode()).toBe(37);
  mutableApp.nativeBuildVersion = null;
  expect(getCurrentVersionCode()).toBeNull();
});
test('checks actual native code and returns an optional notice', async () => {
  const result = await checkForAppUpdate();
  expect(result).toMatchObject({ checked: true, currentVersionCode: 37, currentVersionName: '1.0.0', needsOptionalUpdate: true, needsForceUpdate: false });
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('versionCode=37&platform=android'), expect.anything());
});
test('server minimum is handled as required advice, never an unverified hard gate', async () => {
  global.fetch = respond({ ...policy, minVersionCode: 38, forceUpdate: true });
  expect(await checkForAppUpdate()).toMatchObject({ checked: true, requiresUpdate: true, needsForceUpdate: false, needsOptionalUpdate: true });
});
test('current or newer binary receives no outdated notice', async () => {
  mutableApp.nativeBuildVersion = '38';
  expect(await checkForAppUpdate()).toMatchObject({ checked: true, needsForceUpdate: false, needsOptionalUpdate: false });
});
test.each([null, [], { ...policy, minVersionCode: 39 }, { ...policy, latestVersionCode: -1 },
  { ...policy, latestVersionCode: '38' }, { ...policy, forceUpdate: 'false' },
  { ...policy, storeUrl: 'https://attacker.invalid/' }, { ...policy, marketUrl: 'market://details?id=other.app' },
  { ...policy, latestVersionName: 'x'.repeat(1000) }, { ...policy, minVersionCode: 1.5 }])('rejects malformed/untrusted policy %# without blocking', async (body) => {
  global.fetch = respond(body);
  expect(await checkForAppUpdate()).toMatchObject({ checked: false, needsForceUpdate: false, needsOptionalUpdate: false });
});
test('QA package does not call Production version service', async () => {
  mutableApp.applicationId = 'com.totsrl.getflo.qa';
  expect(await checkForAppUpdate()).toMatchObject({ checked: false, needsForceUpdate: false });
  expect(global.fetch).not.toHaveBeenCalled();
});
test('unknown native version does not check with a fabricated code', async () => {
  mutableApp.nativeBuildVersion = null;
  expect(await checkForAppUpdate()).toMatchObject({ checked: false, needsForceUpdate: false });
  expect(global.fetch).not.toHaveBeenCalled();
});
test.each(['offline', 'invalid-json', 'http-404'])('fails open on %s', async (mode) => {
  global.fetch = mode === 'offline' ? jest.fn().mockRejectedValue(new Error('sensitive-request-context'))
    : mode === 'invalid-json' ? jest.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad'); } })
      : jest.fn().mockResolvedValue({ ok: false });
  expect(await checkForAppUpdate()).toMatchObject({ checked: false, needsForceUpdate: false });
});
test('enforces timeout even when a transport ignores abort', async () => {
  jest.useFakeTimers(); global.fetch = jest.fn(() => new Promise<Response>(() => {}));
  const result = checkForAppUpdate(100);
  await jest.advanceTimersByTimeAsync(101);
  expect(await result).toMatchObject({ checked: false, needsForceUpdate: false });
});
test('Play open uses only canonical URLs even when caller supplies malicious ones', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  expect(await openAppStore('market://details?id=other.app', 'https://attacker.invalid/')).toBe(true);
  expect(Linking.openURL).toHaveBeenCalledWith(policy.marketUrl);
});
test('Play failure falls back once to canonical HTTPS and reports final failure', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('unavailable'));
  expect(await openAppStore()).toBe(false);
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, policy.marketUrl);
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, policy.storeUrl);
});
