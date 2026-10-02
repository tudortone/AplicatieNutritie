jest.mock('expo-iap', () => ({
  __esModule: true,
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  purchaseUpdatedListener: jest.fn(),
  purchaseErrorListener: jest.fn(),
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(),
  getAvailablePurchases: jest.fn(),
  finishTransaction: jest.fn(),
}));

import * as ExpoIap from 'expo-iap';

import { createExpoIapBillingAdapter } from '../lib/billing/expoIapAdapter';

const mockIap = ExpoIap as jest.Mocked<typeof ExpoIap>;

describe('expo-iap 5.5.1 adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIap.initConnection.mockResolvedValue(true);
    mockIap.endConnection.mockResolvedValue(true);
    mockIap.purchaseUpdatedListener.mockReturnValue({ remove: jest.fn() });
    mockIap.purchaseErrorListener.mockReturnValue({ remove: jest.fn() });
    mockIap.requestPurchase.mockResolvedValue([]);
    mockIap.finishTransaction.mockResolvedValue(undefined);
  });

  test('transforma ProductDetails Android in produse cu base plans si offer tokens reale', async () => {
    mockIap.fetchProducts.mockResolvedValue(([
      {
        id: 'premium_monthly',
        platform: 'android',
        type: 'subs',
        productStatusAndroid: 'ok',
        title: 'Premium lunar (GetFlow)',
        description: 'Acces Premium',
        subscriptionOffers: [{
          id: 'intro-7d',
          basePlanIdAndroid: 'monthly-base',
          offerTokenAndroid: 'offer-token-1',
          displayPrice: '29,99 RON/lună',
          currency: 'RON',
          pricingPhasesAndroid: {
            pricingPhaseList: [
              { formattedPrice: '0,00 RON', priceCurrencyCode: 'RON', billingPeriod: 'P7D', priceAmountMicros: '0' },
              { formattedPrice: '29,99 RON', priceCurrencyCode: 'RON', billingPeriod: 'P1M', priceAmountMicros: '29990000' },
            ],
          },
        }],
      },
      {
        id: 'premium_annual',
        platform: 'android',
        type: 'subs',
        productStatusAndroid: 'no-offers-available',
        title: 'Annual',
        description: '',
        subscriptionOffers: [],
      },
    ]) as never);
    const adapter = createExpoIapBillingAdapter();
    await expect(adapter.fetchSubscriptions(['premium_monthly', 'premium_annual'])).resolves.toEqual([{
      id: 'premium_monthly',
      title: 'Premium lunar (GetFlow)',
      description: 'Acces Premium',
      offers: [{
        basePlanId: 'monthly-base',
        offerId: 'intro-7d',
        offerToken: 'offer-token-1',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
        priceAmountMicros: '29990000',
        offerTags: [],
        pricingPhases: [
          { formattedPrice: '0,00 RON', priceCurrencyCode: 'RON', billingPeriod: 'P7D', priceAmountMicros: '0', recurrenceMode: undefined, billingCycleCount: undefined },
          { formattedPrice: '29,99 RON', priceCurrencyCode: 'RON', billingPeriod: 'P1M', priceAmountMicros: '29990000', recurrenceMode: undefined, billingCycleCount: undefined },
        ],
        trialPhase: {
          formattedPrice: '0,00 RON',
          priceCurrencyCode: 'RON',
          billingPeriod: 'P7D',
          priceAmountMicros: '0',
          recurrenceMode: undefined,
          billingCycleCount: undefined,
        },
        introPhase: null,
      }],
    }]);
    expect(mockIap.fetchProducts).toHaveBeenCalledWith({
      skus: ['premium_monthly', 'premium_annual'],
      type: 'subs',
    });
  });

  test('foloseste forma requestPurchase curenta cu subscriptionOffers si obfuscatedAccountId', async () => {
    const adapter = createExpoIapBillingAdapter();
    await adapter.requestSubscription({
      productId: 'premium_monthly',
      offerToken: 'offer-token-1',
      obfuscatedAccountId: 'a'.repeat(64),
    });
    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      request: {
        google: {
          skus: ['premium_monthly'],
          subscriptionOffers: [{ sku: 'premium_monthly', offerToken: 'offer-token-1' }],
          obfuscatedAccountId: 'a'.repeat(64),
        },
      },
      type: 'subs',
    });
  });

  test('încarcă și pornește consumabilele cu prețul autoritativ Play', async () => {
    mockIap.fetchProducts.mockResolvedValue(([{
      id: 'getflow_credits_10',
      platform: 'android',
      type: 'in-app',
      productStatusAndroid: 'ok',
      title: '10 Flow Credits',
      description: 'Photo AI credits',
      displayPrice: '6,99 RON',
      currency: 'RON',
      nameAndroid: 'getflow_credits_10',
    }]) as never);
    const adapter = createExpoIapBillingAdapter();
    await expect(adapter.fetchConsumables(['getflow_credits_10'])).resolves.toEqual([{
      id: 'getflow_credits_10',
      title: '10 Flow Credits',
      description: 'Photo AI credits',
      displayPrice: '6,99 RON',
      currencyCode: 'RON',
    }]);
    await adapter.requestConsumable({
      productId: 'getflow_credits_10', obfuscatedAccountId: 'a'.repeat(64),
    });
    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      request: { google: { skus: ['getflow_credits_10'], obfuscatedAccountId: 'a'.repeat(64) } },
      type: 'in-app',
    });
  });

  test('normalizeaza purchase state si finalizeaza numai ca non-consumabil', async () => {
    const rawPurchase = {
      productId: 'premium_monthly',
      purchaseToken: 'google-play-token-1234567890',
      purchaseState: 'purchased',
    };
    let delivered: unknown;
    mockIap.purchaseUpdatedListener.mockImplementation((listener) => {
      delivered = listener(rawPurchase as never);
      return { remove: jest.fn() };
    });
    mockIap.getAvailablePurchases.mockResolvedValue(([
      rawPurchase,
      { ...rawPurchase, purchaseToken: 'suspended-token-1234567890', isSuspendedAndroid: true },
    ]) as never);
    const adapter = createExpoIapBillingAdapter();
    const listener = jest.fn();
    adapter.addPurchaseUpdatedListener(listener);
    await delivered;
    expect(listener).toHaveBeenCalledWith({
      productId: 'premium_monthly',
      purchaseToken: 'google-play-token-1234567890',
      state: 'purchased',
      raw: rawPurchase,
    });
    const available = await adapter.getAvailablePurchases();
    expect(mockIap.getAvailablePurchases).toHaveBeenCalledWith({ includeSuspendedAndroid: false });
    expect(available).toHaveLength(1);

    const purchase = {
      productId: 'premium_monthly',
      purchaseToken: 'google-play-token-1234567890',
      state: 'purchased' as const,
      raw: rawPurchase,
    };
    await adapter.finishTransaction(purchase);
    expect(mockIap.finishTransaction).toHaveBeenCalledWith({
      purchase: rawPurchase,
      isConsumable: false,
    });
  });
});
