import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

let mockSessionUserId = 'user-a';
const mockBillingState = {
  operation: { status: 'idle' },
  creditProducts: [],
  purchaseCredits: jest.fn(),
};
let mockPremiumState = { hasFullAccess: false, isPremium: false, loading: false };

jest.mock('../lib/api', () => ({ buildApiUrl: (path: string) => path }));
jest.mock('../lib/ads/adsService', () => ({ showRewardedAdWithSsv: jest.fn() }));
jest.mock('../lib/playIntegrityNative', () => ({ getPlayIntegrityHeaders: jest.fn(async () => ({})) }));
jest.mock('../context/BillingContext', () => ({ useBilling: () => mockBillingState }));
jest.mock('../context/PremiumContext', () => ({ usePremium: () => mockPremiumState }));
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: {
            access_token: `token-${mockSessionUserId}`,
            user: { id: mockSessionUserId },
          },
        },
      })),
    },
  },
}));

const { FlowCreditsProvider, useFlowCredits, hasConfirmedZeroFlowCredits } = require('../context/FlowCreditsContext') as typeof import('../context/FlowCreditsContext');
type FlowCreditsValue = ReturnType<typeof useFlowCredits>;
let latest: FlowCreditsValue | null = null;

function Probe() {
  latest = useFlowCredits();
  return (
    <Text testID="credits-probe">
      {`${latest.balance.dailyRemaining}:${latest.balance.rewarded}:${latest.balance.purchased}:${latest.balance.total}|cat:${latest.lastConsumedCategory}|unlimited:${latest.unlimited}`}
    </Text>
  );
}

function response(body: object) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

describe('Flow Credits Optimistic Debit & Ledger Synchronization Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionUserId = 'user-a';
    latest = null;
    mockPremiumState = { hasFullAccess: false, isPremium: false, loading: false };
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/flow-credits') {
        if (mockSessionUserId === 'user-a') {
          return response({
            dailyRemaining: 2,
            rewarded: 1,
            purchased: 3,
            total: 6,
            rewardedGrantsRemaining: 3,
            serverDay: '2026-10-19',
          });
        }
        return response({
          dailyRemaining: 1,
          rewarded: 0,
          purchased: 0,
          total: 1,
          rewardedGrantsRemaining: 5,
          serverDay: '2026-10-19',
        });
      }
      throw new Error(`Unexpected request ${path}`);
    }) as jest.Mock;
  });

  test('1. optimistic debit consumes categories in strict priority order (daily -> rewarded -> purchased)', async () => {
    const view = await render(
      <FlowCreditsProvider appUserId="user-a">
        <Probe />
      </FlowCreditsProvider>
    );

    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('2:1:3:6|cat:null|unlimited:false');
    });

    // 1st debit: uses daily credit
    let category: string | null = null;
    await act(async () => {
      category = latest!.consumeOptimisticCredit();
    });
    expect(category).toBe('daily');
    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('1:1:3:5|cat:daily|unlimited:false');
    });

    // 2nd debit: exhausts daily credit
    await act(async () => {
      category = latest!.consumeOptimisticCredit();
    });
    expect(category).toBe('daily');
    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('0:1:3:4|cat:daily|unlimited:false');
    });

    // 3rd debit: falls back to rewarded credit
    await act(async () => {
      category = latest!.consumeOptimisticCredit();
    });
    expect(category).toBe('rewarded');
    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('0:0:3:3|cat:rewarded|unlimited:false');
    });

    // 4th debit: falls back to purchased credit
    await act(async () => {
      category = latest!.consumeOptimisticCredit();
    });
    expect(category).toBe('purchased');
    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('0:0:2:2|cat:purchased|unlimited:false');
    });
  });

  test('2. authoritative server refresh reconciles UI balance after optimistic deduction or refund', async () => {
    const view = await render(
      <FlowCreditsProvider appUserId="user-a">
        <Probe />
      </FlowCreditsProvider>
    );

    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('2:1:3:6|cat:null|unlimited:false');
    });

    // Optimistic decrement
    await act(async () => {
      latest!.consumeOptimisticCredit();
    });
    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('1:1:3:5|cat:daily|unlimited:false');
    });

    // Server refresh (e.g. after settlement confirmed or non-food refund)
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      response({
        dailyRemaining: 1,
        rewarded: 1,
        purchased: 3,
        total: 5,
        rewardedGrantsRemaining: 3,
        serverDay: '2026-10-19',
      })
    );

    await act(async () => {
      await latest!.refresh();
    });

    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toContain(':5|');
    });
    expect(latest?.balance.dailyRemaining).toBe(1);
    expect(latest?.balance.rewarded).toBe(1);
    expect(latest?.balance.purchased).toBe(3);
  });

  test('3. premium user does not consume credits optimistically', async () => {
    mockPremiumState = { hasFullAccess: true, isPremium: true, loading: false };

    const view = await render(
      <FlowCreditsProvider appUserId="user-a">
        <Probe />
      </FlowCreditsProvider>
    );

    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toContain('unlimited:true');
    });

    let cat: string | null = 'not-null';
    await act(async () => {
      cat = latest!.consumeOptimisticCredit();
    });

    expect(cat).toBeNull();
    expect(latest?.lastConsumedCategory).toBeNull();
  });

  test('4. account switch resets balance and lastConsumedCategory immediately', async () => {
    const view = await render(
      <FlowCreditsProvider appUserId="user-a">
        <Probe />
      </FlowCreditsProvider>
    );

    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('2:1:3:6|cat:null|unlimited:false');
    });
    await act(async () => {
      latest!.consumeOptimisticCredit();
    });
    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('1:1:3:5|cat:daily|unlimited:false');
    });

    // Switch account to user-b
    mockSessionUserId = 'user-b';
    await act(async () => {
      view.rerender(
        <FlowCreditsProvider appUserId="user-b">
          <Probe />
        </FlowCreditsProvider>
      );
    });

    await waitFor(() => {
      expect(view.getByTestId('credits-probe').props.children).toBe('1:0:0:1|cat:null|unlimited:false');
    });
    expect(latest?.lastConsumedCategory).toBeNull();
  });

  test('5. hasConfirmedZeroFlowCredits returns true only when balanceReady is true, not loading/unlimited, and total <= 0', async () => {
    expect(hasConfirmedZeroFlowCredits({
      balance: { dailyRemaining: 0, rewarded: 0, purchased: 0, total: 0, rewardedGrantsRemaining: 5, serverDay: null },
      balanceReady: false,
      loading: false,
      unlimited: false,
    })).toBe(false);
    expect(hasConfirmedZeroFlowCredits({
      balance: { dailyRemaining: 0, rewarded: 0, purchased: 0, total: 0, rewardedGrantsRemaining: 5, serverDay: null },
      balanceReady: true,
      loading: true,
      unlimited: false,
    })).toBe(false);
    expect(hasConfirmedZeroFlowCredits({
      balance: { dailyRemaining: 0, rewarded: 0, purchased: 0, total: 0, rewardedGrantsRemaining: 5, serverDay: null },
      balanceReady: true,
      loading: false,
      unlimited: true,
    })).toBe(false);
    expect(hasConfirmedZeroFlowCredits({
      balance: { dailyRemaining: 1, rewarded: 0, purchased: 0, total: 1, rewardedGrantsRemaining: 5, serverDay: null },
      balanceReady: true,
      loading: false,
      unlimited: false,
    })).toBe(false);
    expect(hasConfirmedZeroFlowCredits({
      balance: { dailyRemaining: 0, rewarded: 0, purchased: 0, total: 0, rewardedGrantsRemaining: 5, serverDay: null },
      balanceReady: true,
      loading: false,
      unlimited: false,
    })).toBe(true);

    // Live provider transitions to balanceReady: true after fetching user-a credits
    const view = await render(
      <FlowCreditsProvider appUserId="user-a">
        <Probe />
      </FlowCreditsProvider>
    );
    await waitFor(() => {
      expect(latest?.balanceReady).toBe(true);
    });
    expect(hasConfirmedZeroFlowCredits(latest)).toBe(false);
  });
});
