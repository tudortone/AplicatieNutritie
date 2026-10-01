import type {
  BillingAuthSnapshot,
  BillingBackend,
  BillingCreditProduct,
  BillingOffer,
  BillingOperationState,
  BillingProduct,
  NativeBillingAdapter,
  NativeListenerSubscription,
  NativePurchase,
} from './types';

export type {
  BillingCreditProduct,
  BillingOffer,
  BillingOperationState,
  BillingProduct,
  NativeBillingAdapter,
  NativePurchase,
} from './types';

export type BillingDependencies = {
  adapter: NativeBillingAdapter;
  backend: BillingBackend;
  getAuthSnapshot: () => Promise<BillingAuthSnapshot | null>;
  hashAccountId: (userId: string) => Promise<string>;
  hashToken: (token: string) => Promise<string>;
  onVerified: (userId: string) => Promise<void>;
};

type PendingCheckout = { ownerId: string; sequence: number; kind: 'subscription' | 'credits' };
type StateListener = (state: BillingOperationState) => void;

const CANCELED_CODES = new Set([
  'E_USER_CANCELLED',
  'USER_CANCELED',
  'USER_CANCELLED',
  'user-cancelled',
]);

function publicCode(error: unknown, fallback: string) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : fallback;
}

function requireAuth(auth: BillingAuthSnapshot | null): BillingAuthSnapshot {
  if (!auth?.userId || !auth.accessToken) throw Object.assign(new Error('Authentication required.'), {
    code: 'AUTH_REQUIRED',
  });
  return auth;
}

function validPurchaseToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 20 && token.length <= 4096 && /^[\x21-\x7e]+$/.test(token);
}

export function createGooglePlayBillingService(deps: BillingDependencies) {
  const listeners = new Set<StateListener>();
  const processed = new Set<string>();
  const products = new Map<string, BillingProduct>();
  const creditProducts = new Map<string, BillingCreditProduct>();
  const creditProductIds = new Set<string>();
  let state: BillingOperationState = { status: 'idle' };
  let started = false;
  let lifecycle = 0;
  let checkoutSequence = 0;
  let pendingCheckout: PendingCheckout | null = null;
  let nativeUpdated: NativeListenerSubscription | null = null;
  let nativeError: NativeListenerSubscription | null = null;

  const publish = (next: BillingOperationState) => {
    state = { ...next };
    for (const listener of listeners) listener({ ...state });
  };

  const processPurchase = async (purchase: NativePurchase, listenerLifecycle: number) => {
    if (!started || listenerLifecycle !== lifecycle || !validPurchaseToken(purchase.purchaseToken)) return;
    if (purchase.state === 'pending') {
      publish({ status: 'pending' });
      return;
    }
    if (purchase.state !== 'purchased') return;

    const current = requireAuth(await deps.getAuthSnapshot());
    if (pendingCheckout && pendingCheckout.ownerId !== current.userId) {
      pendingCheckout = null;
      publish({ status: 'error', code: 'ACCOUNT_CHANGED' });
      return;
    }
    const ownerId = pendingCheckout?.ownerId ?? current.userId;
    const deliveryKey = `${ownerId}:${await deps.hashToken(purchase.purchaseToken)}`;
    if (processed.has(deliveryKey)) return;
    processed.add(deliveryKey);
    publish({ status: 'verifying' });

    try {
      const isCreditPurchase = pendingCheckout?.kind === 'credits' || creditProductIds.has(purchase.productId);
      const verified = isCreditPurchase
        ? await deps.backend.verifyConsumable({
          userId: ownerId,
          accessToken: current.accessToken,
          productId: purchase.productId,
          purchaseToken: purchase.purchaseToken,
        })
        : await deps.backend.verify({
          userId: ownerId,
          accessToken: current.accessToken,
          purchaseToken: purchase.purchaseToken,
        });
      if (!verified.validatServer) throw Object.assign(new Error('Invalid backend authority.'), {
        code: 'INVALID_BACKEND_AUTHORITY',
      });
      if (isCreditPurchase && (!('consumed' in verified) || verified.consumed !== true)) {
        throw Object.assign(new Error('Consumable not completed by backend.'), {
          code: 'CONSUME_PENDING',
        });
      }
      const afterVerify = requireAuth(await deps.getAuthSnapshot());
      if (afterVerify.userId !== ownerId || listenerLifecycle !== lifecycle) {
        publish({ status: 'error', code: 'ACCOUNT_CHANGED' });
        return;
      }
      if (!isCreditPurchase) await deps.adapter.finishTransaction(purchase);
      await deps.onVerified(ownerId);
      pendingCheckout = null;
      publish({ status: 'verified' });
    } catch {
      processed.delete(deliveryKey);
      publish({ status: 'error', code: 'VERIFICATION_PENDING' });
    }
  };

  return Object.freeze({
    getState(): BillingOperationState {
      return { ...state };
    },

    subscribe(listener: StateListener) {
      listeners.add(listener);
      listener({ ...state });
      return () => listeners.delete(listener);
    },

    async start() {
      if (started) {
        // A failed initConnection must not make the in-app Retry action a
        // permanent no-op. Reconnect without registering a second listener
        // pair; purchase delivery remains owned by the original lifecycle.
        if (state.status !== 'unavailable' || state.code !== 'BILLING_CONNECTION') return;
        try {
          const connected = await deps.adapter.connect();
          publish(connected
            ? { status: 'idle' }
            : { status: 'unavailable', code: 'BILLING_CONNECTION' });
        } catch {
          publish({ status: 'unavailable', code: 'BILLING_CONNECTION' });
        }
        return;
      }
      started = true;
      const listenerLifecycle = ++lifecycle;
      try {
        nativeUpdated = deps.adapter.addPurchaseUpdatedListener((purchase) =>
          processPurchase(purchase, listenerLifecycle));
        nativeError = deps.adapter.addPurchaseErrorListener((error) => {
          const code = publicCode(error, 'PURCHASE_FAILED');
          pendingCheckout = null;
          publish({ status: CANCELED_CODES.has(code) ? 'canceled' : 'error', code });
        });
      } catch {
        nativeUpdated = null;
        nativeError = null;
        publish({ status: 'unavailable', code: 'BILLING_LISTENER_FAILED' });
        return;
      }
      try {
        const connected = await deps.adapter.connect();
        publish(connected
          ? { status: 'idle' }
          : { status: 'unavailable', code: 'BILLING_CONNECTION' });
      } catch {
        publish({ status: 'unavailable', code: 'BILLING_CONNECTION' });
      }
    },

    async stop() {
      if (!started) return;
      started = false;
      lifecycle += 1;
      pendingCheckout = null;
      nativeUpdated?.remove();
      nativeError?.remove();
      nativeUpdated = null;
      nativeError = null;
      await deps.adapter.disconnect();
    },

    async getProducts(): Promise<BillingProduct[]> {
      publish({ status: 'loading' });
      try {
        const auth = requireAuth(await deps.getAuthSnapshot());
        const catalog = await deps.backend.getCatalog(auth);
        if (!Array.isArray(catalog.productIds) || catalog.productIds.length === 0) {
          throw new Error('Empty billing catalog.');
        }
        const allowed = new Set(catalog.productIds);
        creditProductIds.clear();
        for (const id of catalog.creditProductIds || []) creditProductIds.add(id);
        const nativeProducts = await deps.adapter.fetchSubscriptions(catalog.productIds);
        const safeProducts = nativeProducts.filter((product) => allowed.has(product.id));
        products.clear();
        for (const product of safeProducts) products.set(product.id, product);
        publish({ status: 'idle' });
        return safeProducts.map((product) => ({
          ...product,
          offers: product.offers.map((offer) => ({ ...offer })),
        }));
      } catch {
        products.clear();
        publish({ status: 'unavailable' });
        return [];
      }
    },

    async getCreditProducts(): Promise<BillingCreditProduct[]> {
      publish({ status: 'loading' });
      try {
        const auth = requireAuth(await deps.getAuthSnapshot());
        const catalog = await deps.backend.getCatalog(auth);
        const allowed = new Set(catalog.creditProductIds || []);
        creditProductIds.clear();
        for (const id of allowed) creditProductIds.add(id);
        const nativeProducts = await deps.adapter.fetchConsumables([...allowed]);
        const safeProducts = nativeProducts.filter((product) => allowed.has(product.id));
        creditProducts.clear();
        for (const product of safeProducts) creditProducts.set(product.id, product);
        publish({ status: 'idle' });
        return safeProducts.map((product) => ({ ...product }));
      } catch {
        creditProducts.clear();
        publish({ status: 'unavailable' });
        return [];
      }
    },

    async purchasePremium(product: BillingProduct, offer: BillingOffer): Promise<void> {
      const known = products.get(product.id);
      const knownOffer = known?.offers.find((candidate) =>
        candidate.offerToken === offer.offerToken && candidate.basePlanId === offer.basePlanId);
      if (!known || !knownOffer) {
        publish({ status: 'error', code: 'OFFER_NOT_AVAILABLE' });
        return;
      }
      const auth = requireAuth(await deps.getAuthSnapshot());
      const sequence = ++checkoutSequence;
      pendingCheckout = { ownerId: auth.userId, sequence, kind: 'subscription' };
      publish({ status: 'purchasing' });
      try {
        const obfuscatedAccountId = await deps.hashAccountId(auth.userId);
        if (pendingCheckout?.sequence !== sequence) return;
        await deps.adapter.requestSubscription({
          productId: known.id,
          offerToken: knownOffer.offerToken,
          obfuscatedAccountId,
        });
      } catch (error) {
        pendingCheckout = null;
        const code = publicCode(error, 'PURCHASE_FAILED');
        publish({ status: CANCELED_CODES.has(code) ? 'canceled' : 'error', code });
      }
    },

    async purchaseCredits(product: BillingCreditProduct): Promise<void> {
      const known = creditProducts.get(product.id);
      if (!known) {
        publish({ status: 'error', code: 'PRODUCT_NOT_AVAILABLE' });
        return;
      }
      const auth = requireAuth(await deps.getAuthSnapshot());
      const sequence = ++checkoutSequence;
      pendingCheckout = { ownerId: auth.userId, sequence, kind: 'credits' };
      publish({ status: 'purchasing' });
      try {
        const obfuscatedAccountId = await deps.hashAccountId(auth.userId);
        if (pendingCheckout?.sequence !== sequence) return;
        await deps.adapter.requestConsumable({ productId: known.id, obfuscatedAccountId });
      } catch (error) {
        pendingCheckout = null;
        const code = publicCode(error, 'PURCHASE_FAILED');
        publish({ status: CANCELED_CODES.has(code) ? 'canceled' : 'error', code });
      }
    },

    async restorePurchases(): Promise<boolean> {
      publish({ status: 'loading' });
      try {
        const auth = requireAuth(await deps.getAuthSnapshot());
        const available = await deps.adapter.getAvailablePurchases();
        const purchases = available.filter((purchase) =>
          purchase.state === 'purchased' && validPurchaseToken(purchase.purchaseToken));
        if (purchases.length === 0) {
          publish({ status: 'idle' });
          return false;
        }
        publish({ status: 'verifying' });
        const consumables = purchases.filter((purchase) => creditProductIds.has(purchase.productId));
        const subscriptions = purchases.filter((purchase) => !creditProductIds.has(purchase.productId));
        const purchaseTokens = [...new Set(subscriptions.map((purchase) => purchase.purchaseToken as string))];
        const verified = purchaseTokens.length > 0
          ? await deps.backend.resync({ ...auth, purchaseTokens })
          : { validatServer: true, premium: false };
        if (!verified.validatServer) throw new Error('Invalid backend authority.');
        for (const purchase of consumables) {
          const consumed = await deps.backend.verifyConsumable({
            ...auth,
            productId: purchase.productId,
            purchaseToken: purchase.purchaseToken as string,
          });
          if (!consumed.validatServer || consumed.consumed !== true) {
            throw new Error('Consumable recovery remains pending.');
          }
        }
        const current = requireAuth(await deps.getAuthSnapshot());
        if (current.userId !== auth.userId) {
          publish({ status: 'error', code: 'ACCOUNT_CHANGED' });
          return false;
        }
        for (const purchase of subscriptions) await deps.adapter.finishTransaction(purchase);
        await deps.onVerified(auth.userId);
        publish({ status: 'verified' });
        return verified.premium === true;
      } catch {
        publish({ status: 'error', code: 'VERIFICATION_PENDING' });
        return false;
      }
    },
  });
}
