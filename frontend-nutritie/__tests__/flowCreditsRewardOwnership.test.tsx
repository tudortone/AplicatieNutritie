import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

let mockSessionUserId = 'user-a';
let holdBalanceForUserB = false;
let resolveBalanceForUserB: ((value: object) => void) | null = null;
let holdRewardIntent = false;
let resolveRewardIntent: (() => void) | null = null;
const mockShowRewardedAdWithSsv = jest.fn();
const mockBillingState = {
  operation: { status: 'idle' },
  creditProducts: [],
  purchaseCredits: jest.fn(),
};
let mockPremiumState = { hasFullAccess: false, isPremium: false, loading: false };

jest.mock('../lib/api', () => ({ buildApiUrl: (path: string) => path }));
jest.mock('../lib/ads/adsService', () => ({ showRewardedAdWithSsv: (...args: unknown[]) => mockShowRewardedAdWithSsv(...args) }));
jest.mock('../lib/playIntegrityNative', () => ({ getPlayIntegrityHeaders: jest.fn(async () => ({})) }));
jest.mock('../context/BillingContext', () => ({ useBilling: () => mockBillingState }));
jest.mock('../context/PremiumContext', () => ({ usePremium: () => mockPremiumState }));
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: `token-${mockSessionUserId}`, user: { id: mockSessionUserId } } } })),
    },
  },
}));

const { FlowCreditsProvider, useFlowCredits } = require('../context/FlowCreditsContext') as typeof import('../context/FlowCreditsContext');
type FlowCreditsValue = ReturnType<typeof useFlowCredits>;
let latest: FlowCreditsValue | null = null;

function Probe() {
  latest = useFlowCredits();
  return <Text testID="credits-state">{`${latest.rewardState}|${latest.balance.total}`}</Text>;
}

function response(body: object) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

describe('Flow Credits rewarded operation ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionUserId = 'user-a';
    latest = null;
    holdBalanceForUserB = false;
    resolveBalanceForUserB = null;
    holdRewardIntent = false;
    resolveRewardIntent = null;
    mockPremiumState = { hasFullAccess: false, isPremium: false, loading: false };
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/flow-credits') {
        if (mockSessionUserId === 'user-b' && holdBalanceForUserB) {
          return new Promise((resolve) => {
            resolveBalanceForUserB = (body) => { resolve(response(body)); };
          });
        }
        return response({ total: mockSessionUserId === 'user-a' ? 8 : 2, rewardedGrantsRemaining: 3 });
      }
      if (path === '/rewarded/intents') {
        if (holdRewardIntent) {
          return new Promise((resolve) => {
            resolveRewardIntent = () => resolve({ ok: true, status: 200, json: async () => ({ intentId: 'intent-a', ssv: { userId: 'intent-a', customData: 'opaque' } }) });
          });
        }
        return response({ intentId: 'intent-a', ssv: { userId: 'intent-a', customData: 'opaque' } });
      }
      if (path === '/rewarded/intents/intent-a') return response({ status: 'PENDING' });
      throw new Error(`Unexpected request ${path}`);
    }) as jest.Mock;
    mockShowRewardedAdWithSsv.mockResolvedValue('earned-awaiting-server');
  });

  test('account switching while the native ad is open cancels old-account polling and UI state', async () => {
    let resolveAd!: (value: 'earned-awaiting-server') => void;
    mockShowRewardedAdWithSsv.mockReturnValueOnce(new Promise(resolve => { resolveAd = resolve; }));
    const fetchMock = global.fetch as jest.Mock;
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|8'));

    let operation!: ReturnType<FlowCreditsValue['watchRewarded']>;
    await act(async () => {
      operation = latest!.watchRewarded();
      await waitFor(() => expect(mockShowRewardedAdWithSsv).toHaveBeenCalledTimes(1));
    });

    mockSessionUserId = 'user-b';
    await act(async () => {
      view.rerender(<FlowCreditsProvider appUserId="user-b"><Probe /></FlowCreditsProvider>);
    });
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|2'));

    await act(async () => {
      resolveAd('earned-awaiting-server');
      await expect(operation).resolves.toBe('unavailable');
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/rewarded/intents/intent-a')).toBe(false);
    expect(view.getByTestId('credits-state').props.children).toBe('idle|2');
  });

  test('does not send an account A balance request with account B’s Supabase session', async () => {
    mockSessionUserId = 'user-b';
    const fetchMock = global.fetch as jest.Mock;
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(latest?.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.getByTestId('credits-state').props.children).toBe('idle|0');
  });

  test('never renders account A credits while account B balance refresh is pending', async () => {
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|8'));

    holdBalanceForUserB = true;
    mockSessionUserId = 'user-b';
    await act(async () => {
      view.rerender(<FlowCreditsProvider appUserId="user-b"><Probe /></FlowCreditsProvider>);
    });

    expect(view.getByTestId('credits-state').props.children).toBe('idle|0');
    await waitFor(() => expect(resolveBalanceForUserB).toEqual(expect.any(Function)));
    await act(async () => {
      resolveBalanceForUserB?.({ total: 2, rewardedGrantsRemaining: 1 });
    });
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|2'));
  });

  test.each([
    { tier: 'tester', isPremium: false },
    { tier: 'Premium', isPremium: true },
  ])('$tier account with full access cannot create a reward intent or open an ad', async ({ isPremium }) => {
    mockPremiumState = { hasFullAccess: true, isPremium, loading: false };
    const fetchMock = global.fetch as jest.Mock;
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|8'));

    await act(async () => {
      await expect(latest!.watchRewarded()).resolves.toBe('unavailable');
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/rewarded/intents')).toBe(false);
    expect(mockShowRewardedAdWithSsv).not.toHaveBeenCalled();
  });

  test('fails closed while authoritative entitlement is still loading', async () => {
    mockPremiumState = { hasFullAccess: false, isPremium: false, loading: true };
    const fetchMock = global.fetch as jest.Mock;
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|8'));

    await act(async () => {
      await expect(latest!.watchRewarded()).resolves.toBe('unavailable');
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/rewarded/intents')).toBe(false);
    expect(mockShowRewardedAdWithSsv).not.toHaveBeenCalled();
  });

  test('rechecks entitlement after creating the intent and before showing the ad', async () => {
    holdRewardIntent = true;
    const fetchMock = global.fetch as jest.Mock;
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|8'));

    let operation!: ReturnType<FlowCreditsValue['watchRewarded']>;
    await act(async () => {
      operation = latest!.watchRewarded();
      await waitFor(() => expect(resolveRewardIntent).toEqual(expect.any(Function)));
    });
    // Return a new provider value like PremiumContext does after entitlement
    // revalidation; mutating one shared object would not exercise the ref.
    mockPremiumState = { hasFullAccess: true, isPremium: true, loading: false };
    await act(async () => view.rerender(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>));

    await act(async () => {
      resolveRewardIntent?.();
      await expect(operation).resolves.toBe('unavailable');
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/rewarded/intents')).toBe(true);
    expect(mockShowRewardedAdWithSsv).not.toHaveBeenCalled();
    expect(latest!.rewardState).toBe('unavailable');
  });

  test('entitlement revalidation during intent request ends the busy state and allows retry after free status returns', async () => {
    holdRewardIntent = true;
    const fetchMock = global.fetch as jest.Mock;
    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|8'));

    let operation!: ReturnType<FlowCreditsValue['watchRewarded']>;
    await act(async () => {
      operation = latest!.watchRewarded();
      await waitFor(() => expect(resolveRewardIntent).toEqual(expect.any(Function)));
    });

    mockPremiumState = { hasFullAccess: false, isPremium: false, loading: true };
    await act(async () => view.rerender(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>));
    await act(async () => {
      resolveRewardIntent?.();
      await expect(operation).resolves.toBe('unavailable');
    });
    expect(latest!.rewardState).toBe('unavailable');

    mockPremiumState = { hasFullAccess: false, isPremium: false, loading: false };
    await act(async () => view.rerender(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>));
    expect(latest!.loading).toBe(false);
    expect(latest!.rewardState).toBe('unavailable');

    holdRewardIntent = false;
    mockShowRewardedAdWithSsv.mockResolvedValueOnce('unavailable');
    await act(async () => {
      await expect(latest!.watchRewarded()).resolves.toBe('unavailable');
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/rewarded/intents')).toHaveLength(2);
    expect(latest!.rewardState).toBe('unavailable');
  });

  test('consumeOptimisticCredit records lastConsumedCategory and rollback resets it to null', async () => {
    global.fetch = jest.fn(async () =>
      response({ total: 3, dailyRemaining: 2, rewarded: 1, purchased: 0, rewardedGrantsRemaining: 3 }),
    ) as jest.Mock;

    const view = await render(<FlowCreditsProvider appUserId="user-a"><Probe /></FlowCreditsProvider>);
    await waitFor(() => expect(view.getByTestId('credits-state').props.children).toBe('idle|3'));
    expect(latest!.lastConsumedCategory).toBeNull();

    await act(async () => {
      const cat = latest!.consumeOptimisticCredit();
      expect(cat).toBe('daily');
    });
    expect(latest!.lastConsumedCategory).toBe('daily');
    expect(latest!.balance.total).toBe(2);
    expect(latest!.balance.dailyRemaining).toBe(1);

    // Explicit rollback restores balance and clears lastConsumedCategory
    await act(async () => {
      latest!.rollbackOptimisticCredit();
    });
    expect(latest!.lastConsumedCategory).toBeNull();
    expect(latest!.balance.total).toBe(3);
    expect(latest!.balance.dailyRemaining).toBe(2);

    // Server refresh after a released/failed reservation (total restored from 2 -> 3) also clears lastConsumedCategory
    await act(async () => {
      latest!.consumeOptimisticCredit();
    });
    expect(latest!.lastConsumedCategory).toBe('daily');
    expect(latest!.balance.total).toBe(2);

    await act(async () => {
      await latest!.refresh();
    });
    expect(latest!.balance.total).toBe(3);
    expect(latest!.lastConsumedCategory).toBeNull();
  });
});
