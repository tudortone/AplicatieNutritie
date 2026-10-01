import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { buildApiUrl } from '../lib/api';
import { supabase } from '../supabase';
import { createGooglePlayBillingService } from '../lib/billing/GooglePlayBillingService';
import { createExpoIapBillingAdapter } from '../lib/billing/expoIapAdapter';
import { getPlayIntegrityHeaders } from '../lib/playIntegrityNative';
import type {
  BillingAuthSnapshot,
  BillingBackend,
  BillingCreditProduct,
  BillingOffer,
  BillingOperationState,
  BillingProduct,
} from '../lib/billing/types';

export type BillingServiceApi = ReturnType<typeof createGooglePlayBillingService>;

type BillingContextValue = {
  purchasesAvailable: boolean;
  operation: BillingOperationState;
  products: BillingProduct[];
  creditProducts: BillingCreditProduct[];
  refreshProducts: () => Promise<void>;
  purchasePremium: (product: BillingProduct, offer: BillingOffer) => Promise<void>;
  purchaseCredits: (product: BillingCreditProduct) => Promise<void>;
  restorePurchases: () => Promise<boolean>;
};

const BillingContext = createContext<BillingContextValue>({
  purchasesAvailable: false,
  operation: { status: 'unavailable' },
  products: [],
  creditProducts: [],
  refreshProducts: async () => {},
  purchasePremium: async () => {},
  purchaseCredits: async () => {},
  restorePurchases: async () => false,
});

async function getAuthSnapshot(): Promise<BillingAuthSnapshot | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user?.id || !session.access_token) return null;
  return { userId: session.user.id, accessToken: session.access_token };
}

async function billingFetch<T>(
  path: string,
  auth: BillingAuthSnapshot,
  body?: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const method = body ? 'POST' : 'GET';
    const integrityHeaders = body
      ? await getPlayIntegrityHeaders({ method, path, body })
      : {};
    const response = await fetch(buildApiUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...integrityHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    if (!response.ok) throw Object.assign(new Error('Billing backend unavailable.'), {
      status: response.status,
    });
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

const backend: BillingBackend = {
  getCatalog(auth) {
    return billingFetch('/billing/google/products', auth);
  },
  verify({ purchaseToken, ...auth }) {
    return billingFetch('/billing/google/verify', auth, { purchaseToken });
  },
  resync({ purchaseTokens, ...auth }) {
    return billingFetch('/billing/google/resync', auth, { purchaseTokens });
  },
  verifyConsumable({ productId, purchaseToken, ...auth }) {
    return billingFetch('/billing/google/verify-consumable', auth, { productId, purchaseToken });
  },
};

async function sha256(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function createDefaultService(): BillingServiceApi {
  return createGooglePlayBillingService({
    adapter: createExpoIapBillingAdapter(),
    backend,
    getAuthSnapshot,
    hashAccountId: (userId) => sha256(`getflow-billing-v1:${userId}`),
    hashToken: sha256,
    // PremiumContext observa operation=verified si reia verdictul server.
    onVerified: async () => {},
  });
}

export function BillingProvider({
  children,
  appUserId,
  serviceOverride,
  nativeAvailableOverride,
}: {
  children: React.ReactNode;
  appUserId: string | null;
  serviceOverride?: BillingServiceApi;
  nativeAvailableOverride?: boolean;
}) {
  const serviceRef = useRef<BillingServiceApi | null>(null);
  if (!serviceRef.current) serviceRef.current = serviceOverride ?? createDefaultService();
  const service = serviceRef.current;
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const nativeAvailable = nativeAvailableOverride ??
    (Platform.OS === 'android' && Constants.appOwnership !== 'expo');
  const [operation, setOperation] = useState<BillingOperationState>(
    nativeAvailable ? service.getState() : { status: 'unavailable' },
  );
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [creditProducts, setCreditProducts] = useState<BillingCreditProduct[]>([]);
  const ownerRef = useRef(appUserId);
  const catalogSequenceRef = useRef(0);
  ownerRef.current = appUserId;

  useEffect(() => {
    if (!nativeAvailable) {
      setOperation({ status: 'unavailable' });
      return;
    }
    const unsubscribe = service.subscribe(setOperation);
    const startPromise = service.start().catch((err) => {
      console.warn('[BillingContext] service.start() caught:', err);
    });
    startPromiseRef.current = startPromise;
    void startPromise;
    return () => {
      unsubscribe();
      if (startPromiseRef.current === startPromise) startPromiseRef.current = null;
      void service.stop().catch(() => {});
    };
  }, [nativeAvailable, service]);

  const refreshProducts = useCallback(async () => {
    const owner = ownerRef.current;
    const sequence = ++catalogSequenceRef.current;
    if (!nativeAvailable || !owner) {
      setProducts([]);
      setCreditProducts([]);
      return;
    }
    // Effects are ordered, but service.start() connects asynchronously. On a
    // real device Play Billing can take long enough that an immediate
    // fetchProducts() races initConnection() and fails as "not connected".
    // Every catalog refresh, including Retry, must cross the same connection
    // barrier before querying ProductDetails.
    const startPromise = startPromiseRef.current;
    if (startPromise) await startPromise;
    if (service.getState().status === 'unavailable') await service.start();
    if (service.getState().status === 'unavailable') {
      if (ownerRef.current === owner && catalogSequenceRef.current === sequence) {
        setProducts([]);
        setCreditProducts([]);
      }
      return;
    }
    const [loaded, loadedCredits] = await Promise.all([
      service.getProducts(),
      service.getCreditProducts(),
    ]);
    if (ownerRef.current !== owner || catalogSequenceRef.current !== sequence) return;
    setProducts(loaded);
    setCreditProducts(loadedCredits);
  }, [nativeAvailable, service]);

  useEffect(() => {
    catalogSequenceRef.current += 1;
    setProducts([]);
    setCreditProducts([]);
    if (appUserId && nativeAvailable) void refreshProducts();
  }, [appUserId, nativeAvailable, refreshProducts]);

  const purchasePremium = useCallback(
    (product: BillingProduct, offer: BillingOffer) => service.purchasePremium(product, offer),
    [service],
  );
  const purchaseCredits = useCallback(
    (product: BillingCreditProduct) => service.purchaseCredits(product),
    [service],
  );
  const restorePurchases = useCallback(() => service.restorePurchases(), [service]);
  const purchasesAvailable = nativeAvailable && appUserId != null && operation.status !== 'unavailable';

  const value = useMemo<BillingContextValue>(() => ({
    purchasesAvailable,
    operation,
    products,
    creditProducts,
    refreshProducts,
    purchasePremium,
    purchaseCredits,
    restorePurchases,
  }), [purchasesAvailable, operation, products, creditProducts, refreshProducts, purchasePremium, purchaseCredits, restorePurchases]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}
