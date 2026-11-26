const listeners = new Map<string, (...args: unknown[]) => void>();
const rewarded = {
  loaded: false,
  load: jest.fn(),
  show: jest.fn(async () => {}),
  addAdEventListener: jest.fn((type: string, listener: (...args: unknown[]) => void) => {
    listeners.set(type, listener);
    return jest.fn();
  }),
};
const mockCreateRewarded = jest.fn((_unitId: unknown, _options: unknown) => rewarded);

let mockCanRequestAds = true;
let mockConsentNetworkFailed = false;

jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'standalone' } }));
jest.mock('../lib/ads/adsConsent', () => ({
  getCanRequestAds: () => mockCanRequestAds,
  getConsentNetworkFailed: () => mockConsentNetworkFailed,
  getConsentPersonalizedAllowed: () => false,
}));
jest.mock('react-native-google-mobile-ads', () => ({
  default: () => ({ initialize: jest.fn(async () => []) }),
  InterstitialAd: { createForAdRequest: jest.fn() },
  RewardedAd: { createForAdRequest: (unitId: unknown, options: unknown) => mockCreateRewarded(unitId, options) },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned' },
  AdEventType: { ERROR: 'error', CLOSED: 'closed' },
  TestIds: { INTERSTITIAL: 'test-interstitial', REWARDED: 'test-rewarded' },
}));

import {
  showRewardedAdWithSsv,
  preloadRewardedAdWithSsv,
  discardPreloadedRewardedAd,
  isAdBlockerOrNetworkError,
  __resetAdsServiceForTests,
} from '../lib/ads/adsService';

describe('rewarded ad SSV client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    __resetAdsServiceForTests();
    mockCanRequestAds = true;
    mockConsentNetworkFailed = false;
    process.env.EXPO_PUBLIC_ADS_MODE = 'test';
  });

  test('passes only opaque intent data to SSV and never grants on loaded/opened/closed', async () => {
    const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-1', customData: 'secret-1' });
    expect(mockCreateRewarded).toHaveBeenCalledWith('test-rewarded', expect.objectContaining({
      requestNonPersonalizedAdsOnly: true,
      serverSideVerificationOptions: { userId: 'intent-1', customData: 'secret-1' },
    }));
    listeners.get('rewarded_loaded')?.();
    expect(rewarded.show).toHaveBeenCalledTimes(1);
    listeners.get('closed')?.();
    await expect(resultPromise).resolves.toBe('dismissed');
  });

  test('earned event only signals the UI to await server SSV credit', async () => {
    const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-2', customData: 'secret-2' });
    listeners.get('rewarded_loaded')?.();
    listeners.get('rewarded_earned')?.({ amount: 1, type: 'flow_credit' });
    listeners.get('closed')?.();
    await expect(resultPromise).resolves.toBe('earned-awaiting-server');
  });

  test('load failure is unavailable and never grants or opens the ad', async () => {
    const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-3', customData: 'secret-3' });

    listeners.get('error')?.({ code: 'no-fill' });

    await expect(resultPromise).resolves.toBe('unavailable');
    expect(rewarded.show).not.toHaveBeenCalled();
  });

  test('duplicate earned and closed callbacks settle only one server-awaiting outcome', async () => {
    const onSettled = jest.fn();
    const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-4', customData: 'secret-4' });
    void resultPromise.then(onSettled);

    listeners.get('rewarded_loaded')?.();
    listeners.get('rewarded_earned')?.({ amount: 1, type: 'flow_credit' });
    listeners.get('rewarded_earned')?.({ amount: 1, type: 'flow_credit' });
    listeners.get('closed')?.();
    listeners.get('closed')?.();

    await expect(resultPromise).resolves.toBe('earned-awaiting-server');
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(rewarded.show).toHaveBeenCalledTimes(1);
  });

  test('pre-warmed rewarded ad shows immediately once LOADED without reloading', async () => {
    const started = preloadRewardedAdWithSsv({ intentId: 'intent-pre', customData: 'secret-pre' });
    expect(started).toBe(true);
    expect(rewarded.load).toHaveBeenCalledTimes(1);

    listeners.get('rewarded_loaded')?.();

    const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-pre', customData: 'secret-pre' });
    expect(rewarded.load).toHaveBeenCalledTimes(1);
    expect(rewarded.show).toHaveBeenCalledTimes(1);

    listeners.get('rewarded_earned')?.({ amount: 1, type: 'flow_credit' });
    listeners.get('closed')?.();
    await expect(resultPromise).resolves.toBe('earned-awaiting-server');
  });

  test('discardPreloadedRewardedAd invalidates pre-warmed ad and falls back to fresh load', async () => {
    preloadRewardedAdWithSsv({ intentId: 'intent-discard', customData: 'secret-discard' });
    listeners.get('rewarded_loaded')?.();
    discardPreloadedRewardedAd();

    const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-discard', customData: 'secret-discard' });
    expect(rewarded.load).toHaveBeenCalledTimes(2);
    listeners.get('rewarded_loaded')?.();
    listeners.get('closed')?.();
    await expect(resultPromise).resolves.toBe('dismissed');
  });

  test('does not abort a 30s rewarded ad at t=15s once LOADED triggers ad.show()', async () => {
    jest.useFakeTimers();
    try {
      const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-30s', customData: 'secret-30s' });
      jest.advanceTimersByTime(1_000);
      listeners.get('rewarded_loaded')?.();
      expect(rewarded.show).toHaveBeenCalledTimes(1);

      // Advance well past REWARDED_LOAD_TIMEOUT_MS (15s) to simulate a full 30s video playback.
      jest.advanceTimersByTime(30_000);
      listeners.get('rewarded_earned')?.({ amount: 1, type: 'flow_credit' });
      listeners.get('closed')?.();

      await expect(resultPromise).resolves.toBe('earned-awaiting-server');
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not abort a preloaded 30s rewarded ad at t=15s after immediate ad.show()', async () => {
    jest.useFakeTimers();
    try {
      preloadRewardedAdWithSsv({ intentId: 'intent-pre-30s', customData: 'secret-pre-30s' });
      listeners.get('rewarded_loaded')?.();

      const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-pre-30s', customData: 'secret-pre-30s' });
      expect(rewarded.show).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30_000);
      listeners.get('rewarded_earned')?.({ amount: 1, type: 'flow_credit' });
      listeners.get('closed')?.();

      await expect(resultPromise).resolves.toBe('earned-awaiting-server');
    } finally {
      jest.useRealTimers();
    }
  });

  test('still times out at 15s when the rewarded ad never emits LOADED', async () => {
    jest.useFakeTimers();
    try {
      const resultPromise = showRewardedAdWithSsv({ intentId: 'intent-hang', customData: 'secret-hang' });
      jest.advanceTimersByTime(15_000);
      await expect(resultPromise).resolves.toBe('unavailable');
      expect(rewarded.show).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('classifies network/DNS ad-blocker errors as blocked while keeping no-fill unavailable', async () => {
    expect(isAdBlockerOrNetworkError({ code: 'googleMobileAds/network-error', message: 'Network error' })).toBe(true);
    expect(isAdBlockerOrNetworkError({ message: 'Unable to resolve host "googleads.g.doubleclick.net"' })).toBe(true);
    expect(isAdBlockerOrNetworkError({ message: 'Blocked by AdGuard DNS' })).toBe(true);
    expect(isAdBlockerOrNetworkError({ code: 'googleMobileAds/no-fill', message: 'No fill' })).toBe(false);

    const networkPromise = showRewardedAdWithSsv({ intentId: 'intent-net', customData: 'secret-net' });
    listeners.get('error')?.({ code: 'googleMobileAds/network-error', message: 'Network error' });
    await expect(networkPromise).resolves.toBe('blocked');
    expect(rewarded.show).not.toHaveBeenCalled();

    listeners.clear();
    const noFillPromise = showRewardedAdWithSsv({ intentId: 'intent-nofill', customData: 'secret-nofill' });
    listeners.get('error')?.({ code: 'googleMobileAds/no-fill', message: 'No fill' });
    await expect(noFillPromise).resolves.toBe('unavailable');

    mockCanRequestAds = false;
    mockConsentNetworkFailed = true;
    await expect(showRewardedAdWithSsv({ intentId: 'intent-ump', customData: 'secret-ump' })).resolves.toBe('blocked');
  });
});
