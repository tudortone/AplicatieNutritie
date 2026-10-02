import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock('expo-iap', () => ({
  endConnection: jest.fn(),
  fetchProducts: jest.fn(),
  finishTransaction: jest.fn(),
  getAvailablePurchases: jest.fn(),
  initConnection: jest.fn(),
  purchaseErrorListener: jest.fn(),
  purchaseUpdatedListener: jest.fn(),
  requestPurchase: jest.fn(),
}));
import {
  BillingProvider,
  useBilling,
  type BillingServiceApi,
} from '../context/BillingContext';
import type { BillingOperationState, BillingProduct } from '../lib/billing/types';
import fs from 'fs';
import path from 'path';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeService() {
  let stateListener: ((state: BillingOperationState) => void) | null = null;
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn((listener) => {
      stateListener = listener;
      listener({ status: 'idle' });
      return jest.fn();
    }),
    getState: jest.fn(() => ({ status: 'idle' as const })),
    getProducts: jest.fn().mockResolvedValue([]),
    getCreditProducts: jest.fn().mockResolvedValue([]),
    purchasePremium: jest.fn().mockResolvedValue(undefined),
    purchaseCredits: jest.fn().mockResolvedValue(undefined),
    restorePurchases: jest.fn().mockResolvedValue(false),
    emit: (state: BillingOperationState) => stateListener?.(state),
  } as unknown as BillingServiceApi & { emit: (state: BillingOperationState) => void };
}

let latest: ReturnType<typeof useBilling> | null = null;
function Probe() {
  const value = useBilling();
  latest = value;
  return <Text testID="billing">{`${value.operation.status}|${value.products.map((p) => p.id).join(',')}`}</Text>;
}

const PRODUCT_A: BillingProduct = {
  id: 'premium_monthly',
  title: 'Monthly',
  description: '',
  offers: [{
    basePlanId: 'monthly',
    offerId: null,
    offerToken: 'offer-a',
    displayPrice: '29,99 RON',
    currencyCode: 'RON',
    billingPeriod: 'P1M',
  }],
};

describe('BillingContext root lifecycle', () => {
  beforeEach(() => { latest = null; });

  test('porneste serviciul/listenerii o singura data si ii opreste la unmount', async () => {
    const service = fakeService();
    const view = await render(
      <BillingProvider appUserId="user-a" serviceOverride={service} nativeAvailableOverride>
        <Probe />
      </BillingProvider>,
    );
    await waitFor(() => expect(service.start).toHaveBeenCalledTimes(1));
    await view.rerender(
      <BillingProvider appUserId="user-b" serviceOverride={service} nativeAvailableOverride>
        <Probe />
      </BillingProvider>,
    );
    expect(service.start).toHaveBeenCalledTimes(1);
    await act(async () => { view.unmount(); });
    expect(service.stop).toHaveBeenCalledTimes(1);
  });

  test('asteapta conexiunea BillingClient inainte de prima interogare ProductDetails', async () => {
    const service = fakeService();
    const connection = deferred<void>();
    (service.start as jest.Mock).mockImplementation(() => connection.promise);
    (service.getProducts as jest.Mock).mockResolvedValue([PRODUCT_A]);

    const view = await render(
      <BillingProvider appUserId="user-a" serviceOverride={service} nativeAvailableOverride>
        <Probe />
      </BillingProvider>,
    );

    await waitFor(() => expect(service.start).toHaveBeenCalledTimes(1));
    expect(service.getProducts).not.toHaveBeenCalled();
    expect(service.getCreditProducts).not.toHaveBeenCalled();

    await act(async () => {
      connection.resolve();
      await connection.promise;
    });

    await waitFor(() => expect(view.getByTestId('billing').props.children)
      .toContain('premium_monthly'));
    expect(service.getProducts).toHaveBeenCalledTimes(1);
    expect(service.getCreditProducts).toHaveBeenCalledTimes(1);
  });

  test('layout-ul monteaza BillingProvider deasupra PremiumProvider', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../app/_layout.tsx'), 'utf8');
    const billing = source.indexOf('<BillingProvider');
    const premium = source.indexOf('<PremiumProvider');
    expect(billing).toBeGreaterThan(0);
    expect(billing).toBeLessThan(premium);
  });

  test('catalogul vechi nu poate ajunge in contul nou', async () => {
    const service = fakeService();
    const a = deferred<BillingProduct[]>();
    const b = deferred<BillingProduct[]>();
    (service.getProducts as jest.Mock)
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);
    const view = await render(
      <BillingProvider appUserId="user-a" serviceOverride={service} nativeAvailableOverride>
        <Probe />
      </BillingProvider>,
    );
    await waitFor(() => expect(service.getProducts).toHaveBeenCalledTimes(1));
    await view.rerender(
      <BillingProvider appUserId="user-b" serviceOverride={service} nativeAvailableOverride>
        <Probe />
      </BillingProvider>,
    );
    await waitFor(() => expect(service.getProducts).toHaveBeenCalledTimes(2));
    await act(async () => { b.resolve([]); await b.promise; });
    await act(async () => { a.resolve([PRODUCT_A]); await a.promise; });
    expect(view.getByTestId('billing').props.children).toBe('idle|');
  });

  test('expune starea verificata si delega oferta exacta si restore', async () => {
    const service = fakeService();
    (service.getProducts as jest.Mock).mockResolvedValue([PRODUCT_A]);
    const view = await render(
      <BillingProvider appUserId="user-a" serviceOverride={service} nativeAvailableOverride>
        <Probe />
      </BillingProvider>,
    );
    await waitFor(() => expect(view.getByTestId('billing').props.children).toContain('premium_monthly'));
    await act(async () => { service.emit({ status: 'verified' }); });
    expect(view.getByTestId('billing').props.children).toBe('verified|premium_monthly');
    await act(async () => { await latest!.purchasePremium(PRODUCT_A, PRODUCT_A.offers[0]); });
    expect(service.purchasePremium).toHaveBeenCalledWith(PRODUCT_A, PRODUCT_A.offers[0]);
    await act(async () => { await latest!.restorePurchases(); });
    expect(service.restorePurchases).toHaveBeenCalledTimes(1);
  });
});
