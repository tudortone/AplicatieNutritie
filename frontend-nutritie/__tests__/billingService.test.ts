import {
  createGooglePlayBillingService,
  type BillingDependencies,
  type NativeBillingAdapter,
  type NativePurchase,
} from '../lib/billing/GooglePlayBillingService';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'google-play-client-token-123456';

function harness() {
  let currentUser = USER_A;
  let updated: ((purchase: NativePurchase) => void | Promise<void>) | null = null;
  let failed: ((error: { code?: string; message?: string }) => void) | null = null;
  const removeUpdated = jest.fn();
  const removeFailed = jest.fn();
  const adapter: NativeBillingAdapter = {
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(undefined),
    addPurchaseUpdatedListener: jest.fn((listener) => {
      updated = listener;
      return { remove: removeUpdated };
    }),
    addPurchaseErrorListener: jest.fn((listener) => {
      failed = listener;
      return { remove: removeFailed };
    }),
    fetchSubscriptions: jest.fn().mockResolvedValue([
      {
        id: 'premium_monthly',
        title: 'Premium lunar',
        description: 'Acces Premium',
        offers: [{
          basePlanId: 'monthly-base',
          offerId: 'intro-7d',
          offerToken: 'offer-token-monthly',
          displayPrice: '29,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1M',
        }],
      },
      {
        id: 'attacker_product',
        title: 'Not ours',
        description: '',
        offers: [],
      },
    ]),
    fetchConsumables: jest.fn().mockResolvedValue([{
      id: 'getflow_credits_10', title: '10 Flow Credits', description: 'Photo AI',
      displayPrice: '6,99 RON', currencyCode: 'RON',
    }]),
    requestSubscription: jest.fn().mockResolvedValue(undefined),
    requestConsumable: jest.fn().mockResolvedValue(undefined),
    getAvailablePurchases: jest.fn().mockResolvedValue([]),
    finishTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const backend = {
    getCatalog: jest.fn().mockResolvedValue({
      packageName: 'com.totsrl.getflo',
      productIds: ['premium_monthly', 'premium_annual'],
      creditProductIds: ['getflow_credits_10', 'getflow_credits_30'],
    }),
    verify: jest.fn().mockResolvedValue({ premium: true, validatServer: true }),
    resync: jest.fn().mockResolvedValue({ premium: true, validatServer: true, restored: 1 }),
    verifyConsumable: jest.fn().mockResolvedValue({
      validatServer: true, productId: 'getflow_credits_10', creditsGranted: 10, consumed: true,
    }),
  };
  const onVerified = jest.fn().mockResolvedValue(undefined);
  const dependencies: BillingDependencies = {
    adapter,
    backend,
    getAuthSnapshot: jest.fn(async () => ({
      userId: currentUser,
      accessToken: `access-${currentUser}`,
    })),
    hashAccountId: jest.fn(async () => 'a'.repeat(64)),
    hashToken: jest.fn(async (token) => `token-hash:${token}`),
    onVerified,
  };
  const service = createGooglePlayBillingService(dependencies);
  return {
    service,
    adapter,
    backend,
    onVerified,
    emitPurchase: async (purchase: NativePurchase) => updated?.(purchase),
    emitError: (error: { code?: string; message?: string }) => failed?.(error),
    switchToUser: (userId: string) => { currentUser = userId; },
    removeUpdated,
    removeFailed,
  };
}

describe('GooglePlayBillingService — limita nativa generica', () => {
  test('porneste o singura pereche de listeneri si o curata la stop', async () => {
    const { service, adapter, removeUpdated, removeFailed } = harness();
    await service.start();
    await service.start();
    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(adapter.addPurchaseUpdatedListener).toHaveBeenCalledTimes(1);
    expect(adapter.addPurchaseErrorListener).toHaveBeenCalledTimes(1);
    await service.stop();
    expect(removeUpdated).toHaveBeenCalledTimes(1);
    expect(removeFailed).toHaveBeenCalledTimes(1);
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
  });

  test('reincearca o conexiune initial esuata fara sa dubleze listenerii', async () => {
    const { service, adapter } = harness();
    (adapter.connect as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await service.start();
    expect(service.getState()).toEqual({ status: 'unavailable', code: 'BILLING_CONNECTION' });

    await service.start();
    expect(adapter.connect).toHaveBeenCalledTimes(2);
    expect(adapter.addPurchaseUpdatedListener).toHaveBeenCalledTimes(1);
    expect(adapter.addPurchaseErrorListener).toHaveBeenCalledTimes(1);
    expect(service.getState()).toEqual({ status: 'idle' });
  });

  test('interogheaza numai produsele autentificate de backend si pastreaza metadatele Play', async () => {
    const { service, adapter, backend } = harness();
    const products = await service.getProducts();
    expect(backend.getCatalog).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A }));
    expect(adapter.fetchSubscriptions).toHaveBeenCalledWith(['premium_monthly', 'premium_annual']);
    expect(products).toEqual([{
      id: 'premium_monthly',
      title: 'Premium lunar',
      description: 'Acces Premium',
      offers: [{
        basePlanId: 'monthly-base',
        offerId: 'intro-7d',
        offerToken: 'offer-token-monthly',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
      }],
    }]);
  });

  test('trimite offer token si hash-ul contului, niciodata UUID-ul brut', async () => {
    const { service, adapter } = harness();
    const [product] = await service.getProducts();
    await service.purchasePremium(product, product.offers[0]);
    expect(adapter.requestSubscription).toHaveBeenCalledWith({
      productId: 'premium_monthly',
      offerToken: 'offer-token-monthly',
      obfuscatedAccountId: 'a'.repeat(64),
    });
    expect(JSON.stringify((adapter.requestSubscription as jest.Mock).mock.calls)).not.toContain(USER_A);
    expect(service.getState()).toEqual({ status: 'purchasing' });
  });

  test('cumpără pack-ul și îl verifică server-side fără consume prematur pe client', async () => {
    const { service, adapter, backend, emitPurchase } = harness();
    await service.start();
    const [pack] = await service.getCreditProducts();
    await service.purchaseCredits(pack);
    expect(adapter.requestConsumable).toHaveBeenCalledWith({
      productId: 'getflow_credits_10', obfuscatedAccountId: 'a'.repeat(64),
    });
    const nativePurchase = {
      productId: pack.id, purchaseToken: TOKEN, state: 'purchased' as const, raw: {},
    };
    await emitPurchase(nativePurchase);
    expect(backend.verifyConsumable).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_A, productId: pack.id, purchaseToken: TOKEN,
    }));
    expect(adapter.finishTransaction).not.toHaveBeenCalledWith(nativePurchase);
    expect(service.getState()).toEqual({ status: 'verified' });
  });

  test('pending nu verifica, nu finalizeaza si nu emite Premium', async () => {
    const { service, adapter, backend, onVerified, emitPurchase } = harness();
    await service.start();
    const [product] = await service.getProducts();
    await service.purchasePremium(product, product.offers[0]);
    await emitPurchase({ productId: product.id, purchaseToken: TOKEN, state: 'pending', raw: {} });
    expect(service.getState()).toEqual({ status: 'pending' });
    expect(backend.verify).not.toHaveBeenCalled();
    expect(adapter.finishTransaction).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
  });

  test('purchased verifica backend-ul inainte de finish si abia apoi cere refresh de acces', async () => {
    const { service, adapter, backend, onVerified, emitPurchase } = harness();
    await service.start();
    const [product] = await service.getProducts();
    await service.purchasePremium(product, product.offers[0]);
    const purchase = { productId: product.id, purchaseToken: TOKEN, state: 'purchased' as const, raw: { id: 7 } };
    await emitPurchase(purchase);
    expect(backend.verify).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_A,
      purchaseToken: TOKEN,
    }));
    expect(backend.verify.mock.invocationCallOrder[0])
      .toBeLessThan((adapter.finishTransaction as jest.Mock).mock.invocationCallOrder[0]);
    expect(adapter.finishTransaction).toHaveBeenCalledWith(purchase);
    expect(onVerified).toHaveBeenCalledWith(USER_A);
    expect(service.getState()).toEqual({ status: 'verified' });
  });

  test('outage-ul backend pastreaza tranzactia nefinalizata pentru recovery', async () => {
    const { service, adapter, backend, onVerified, emitPurchase } = harness();
    backend.verify.mockRejectedValue(new Error('offline'));
    await service.start();
    const [product] = await service.getProducts();
    await service.purchasePremium(product, product.offers[0]);
    await emitPurchase({ productId: product.id, purchaseToken: TOKEN, state: 'purchased', raw: {} });
    expect(adapter.finishTransaction).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
    expect(service.getState()).toEqual({ status: 'error', code: 'VERIFICATION_PENDING' });
  });

  test('callback-ul lui A sosit dupa login B este respins inainte de backend', async () => {
    const { service, backend, emitPurchase, switchToUser } = harness();
    await service.start();
    const [product] = await service.getProducts();
    await service.purchasePremium(product, product.offers[0]);
    switchToUser(USER_B);
    await emitPurchase({ productId: product.id, purchaseToken: TOKEN, state: 'purchased', raw: {} });
    expect(backend.verify).not.toHaveBeenCalled();
    expect(service.getState()).toEqual({ status: 'error', code: 'ACCOUNT_CHANGED' });
  });

  test('deduplica livrarile native pentru aceeasi pereche owner/token', async () => {
    const { service, backend, emitPurchase } = harness();
    await service.start();
    const purchase = { productId: 'premium_monthly', purchaseToken: TOKEN, state: 'purchased' as const, raw: {} };
    await emitPurchase(purchase);
    await emitPurchase(purchase);
    expect(backend.verify).toHaveBeenCalledTimes(1);
  });

  test('restore trimite backend-ului numai tokenurile cumparate, deduplicate', async () => {
    const { service, adapter, backend, onVerified } = harness();
    (adapter.getAvailablePurchases as jest.Mock).mockResolvedValue([
      { productId: 'premium_monthly', purchaseToken: TOKEN, state: 'purchased', raw: {} },
      { productId: 'premium_monthly', purchaseToken: TOKEN, state: 'purchased', raw: {} },
      { productId: 'premium_annual', purchaseToken: 'pending-token-123456789012', state: 'pending', raw: {} },
    ]);
    await expect(service.restorePurchases()).resolves.toBe(true);
    expect(backend.resync).toHaveBeenCalledWith({
      userId: USER_A,
      accessToken: `access-${USER_A}`,
      purchaseTokens: [TOKEN],
    });
    expect(onVerified).toHaveBeenCalledWith(USER_A);
  });

  test('restore verifica separat consumabilele si nu le trimite la resync subscription', async () => {
    const { service, adapter, backend } = harness();
    await service.getCreditProducts();
    (adapter.getAvailablePurchases as jest.Mock).mockResolvedValue([
      { productId: 'premium_monthly', purchaseToken: TOKEN, state: 'purchased', raw: {} },
      { productId: 'getflow_credits_10', purchaseToken: 'credit-token-1234567890123', state: 'purchased', raw: {} },
    ]);

    await expect(service.restorePurchases()).resolves.toBe(true);

    expect(backend.resync).toHaveBeenCalledWith(expect.objectContaining({ purchaseTokens: [TOKEN] }));
    expect(backend.verifyConsumable).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'getflow_credits_10',
      purchaseToken: 'credit-token-1234567890123',
    }));
    expect(adapter.finishTransaction).toHaveBeenCalledTimes(1);
    expect(adapter.finishTransaction).toHaveBeenCalledWith(expect.objectContaining({ productId: 'premium_monthly' }));
  });
});
