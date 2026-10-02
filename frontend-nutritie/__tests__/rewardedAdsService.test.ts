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

jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'standalone' } }));
jest.mock('../lib/ads/adsConsent', () => ({
  getCanRequestAds: () => true,
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

import { showRewardedAdWithSsv, __resetAdsServiceForTests } from '../lib/ads/adsService';

describe('rewarded ad SSV client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    __resetAdsServiceForTests();
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
});
