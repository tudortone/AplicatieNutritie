import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const memoryByScope: Record<string, string> = {};
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => memoryByScope[key],
    set: (key: string, value: string) => {
      memoryByScope[key] = value;
    },
  }),
}), { virtual: true });

const mockInitSdk = jest.fn(async () => {});
const mockPreload = jest.fn();
const mockDiscard = jest.fn();
const mockShow = jest.fn(() => true);

jest.mock('../context/PremiumContext', () => ({
  usePremium: () => ({ hasFullAccess: false, loading: false }),
}));

jest.mock('../lib/ads/adsService', () => ({
  adsAvailable: true,
  discardPreloadedInterstitial: () => mockDiscard(),
  initializeAdsSdk: () => mockInitSdk(),
  preloadInterstitial: () => mockPreload(),
  refreshAdsAfterConsentChange: jest.fn(async () => {}),
  showPreloadedInterstitial: () => mockShow(),
}));

jest.mock('../lib/ads/adsConsent', () => ({
  resolveAdsConsent: jest.fn(async () => ({
    canRequestAds: true,
    personalized: true,
    privacyOptionsRequired: false,
  })),
  getCanRequestAds: () => true,
  getPrivacyOptionsRequired: () => false,
  showAdsPrivacyOptionsForm: jest.fn(async () => true),
}));

import { AdsProvider, useAds } from '../context/AdsContext';
import { __resetAdGateStoreForTests } from '../lib/ads/adGateStore';

let capturedAds: ReturnType<typeof useAds> | null = null;
function Probe() {
  capturedAds = useAds();
  return null;
}

describe('AdsProvider — just-in-time interstitial preload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(memoryByScope)) delete memoryByScope[k];
    __resetAdGateStoreForTests();
    capturedAds = null;
  });

  test('does not preload on mount or messages 1–5, preloads just-in-time on message 6, and shows on completion', async () => {
    await render(
      <AdsProvider userId="user-jit">
        <Probe />
      </AdsProvider>
    );

    await waitFor(() => expect(mockInitSdk).toHaveBeenCalledTimes(1));
    expect(mockPreload).not.toHaveBeenCalled();

    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        capturedAds?.recordChatUserMessage();
      });
      expect(mockPreload).not.toHaveBeenCalled();
    }

    act(() => {
      capturedAds?.recordChatUserMessage();
    });
    expect(mockPreload).toHaveBeenCalledTimes(1);

    act(() => {
      capturedAds?.maybeShowInterstitial('chat');
    });
    expect(mockShow).toHaveBeenCalledTimes(1);
  });
});
