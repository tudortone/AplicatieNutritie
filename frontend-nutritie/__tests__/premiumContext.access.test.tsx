import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import type { BillingProduct } from '../lib/billing/types';

const mockPurchasePremium = jest.fn();
const mockRestorePurchases = jest.fn();
const mockBillingProduct: BillingProduct = {
  id: 'premium_monthly',
  title: 'Premium lunar',
  description: '',
  offers: [{
    basePlanId: 'monthly',
    offerId: null,
    offerToken: 'offer-token',
    displayPrice: '29,99 RON',
    currencyCode: 'RON',
    billingPeriod: 'P1M',
  }],
};

jest.mock('../context/BillingContext', () => ({
  useBilling: () => ({
    purchasesAvailable: true,
    operation: { status: 'idle' },
    products: [mockBillingProduct],
    refreshProducts: jest.fn(),
    purchasePremium: mockPurchasePremium,
    restorePurchases: mockRestorePurchases,
  }),
}));

let mockSessionUserId = 'tester-a';
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

const {
  ACCESS_REQUEST_TIMEOUT_MS,
  PremiumProvider,
  usePremium,
} = require('../context/PremiumContext') as typeof import('../context/PremiumContext');
type PremiumStatus = ReturnType<typeof usePremium>;
let latestStatus: PremiumStatus | null = null;

function Probe() {
  const status = usePremium();
  latestStatus = status;
  return (
    <Text testID="access-status">
      {`${status.accessTier}|${status.isPremium}|${status.isTester}|${status.hasFullAccess}|${status.isAdmin}|${status.subscriptionPackages.length}`}
    </Text>
  );
}

function response(body: object) {
  return Promise.resolve({ ok: true, json: async () => body });
}

const FREE = {
  premium: false,
  isPremium: false,
  isTester: false,
  isAdmin: false,
  accessTier: 'free',
  hasFullAccess: false,
  validatServer: true,
};
const TESTER = {
  ...FREE,
  isTester: true,
  accessTier: 'tester',
  hasFullAccess: true,
};
const PREMIUM = {
  ...FREE,
  premium: true,
  isPremium: true,
  accessTier: 'premium',
  hasFullAccess: true,
};

describe('PremiumContext — exclusiv server-authoritative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestStatus = null;
    mockSessionUserId = 'tester-a';
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    mockRestorePurchases.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each([
    [TESTER, 'tester|false|true|true|false|1'],
    [PREMIUM, 'premium|true|false|true|false|1'],
    [FREE, 'free|false|false|false|false|1'],
  ])('accepta numai contractul complet al backend-ului %#', async (server, expected) => {
    global.fetch = jest.fn(() => response(server)) as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toBe(expected));
  });

  it('revoca drepturile la revalidare si esueaza inchis la outage inclusiv pentru Premium', async () => {
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response(PREMIUM))
      .mockRejectedValue(new Error('offline'));
    global.fetch = fetchMock as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('premium|true'));
    await act(async () => { await latestStatus?.refresh(); });
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('free|false'));
  });

  it('revoca bounded un verdict vechi cand requestul backend ramane blocat', async () => {
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response(PREMIUM))
      .mockImplementationOnce((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }));
    global.fetch = fetchMock as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('premium|true'));

    jest.useFakeTimers();
    await act(async () => {
      void latestStatus?.refresh();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(ACCESS_REQUEST_TIMEOUT_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.getByTestId('access-status').props.children).toContain('free|false');
  });

  it('nu transfera accesul contului A catre contul B', async () => {
    global.fetch = jest.fn((_url: string, init?: { headers?: { Authorization?: string } }) =>
      response(init?.headers?.Authorization === 'Bearer token-tester-a' ? TESTER : FREE)) as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('tester|false|true'));
    mockSessionUserId = 'free-b';
    await view.rerender(<PremiumProvider appUserId="free-b"><Probe /></PremiumProvider>);
    expect(view.getByTestId('access-status').props.children).not.toContain('tester|false|true');
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('free|false'));
  });

  it('respinge un payload inconsistent chiar daca declara full access', async () => {
    global.fetch = jest.fn(() => response({ ...FREE, hasFullAccess: true })) as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('free|false'));
  });

  it('delegă exact produsul si oferta bridge-ului generic fara grant local', async () => {
    global.fetch = jest.fn(() => response(FREE)) as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(latestStatus?.subscriptionPackages).toEqual([mockBillingProduct]));
    await act(async () => {
      await latestStatus!.purchaseSubscription(mockBillingProduct, mockBillingProduct.offers[0]);
    });
    expect(mockPurchasePremium).toHaveBeenCalledWith(mockBillingProduct, mockBillingProduct.offers[0]);
    expect(view.getByTestId('access-status').props.children).toContain('free|false');
  });

  it('revalideaza automat drepturile in cel mult 60 de secunde', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response(TESTER))
      .mockImplementation(() => response(FREE));
    global.fetch = fetchMock as jest.Mock;
    const view = await render(<PremiumProvider appUserId="tester-a"><Probe /></PremiumProvider>);
    await waitFor(() => expect(view.getByTestId('access-status').props.children).toContain('tester|false|true'));
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByTestId('access-status').props.children).toContain('free|false');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
