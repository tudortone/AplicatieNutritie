import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { authenticatedFetch } from '../lib/api';
import {
  FREE_ACCESS_ENTITLEMENT,
  parseServerAccessEntitlement,
  type AccessEntitlement,
  type AccessTier,
} from '../lib/accessEntitlement';
import { useBilling } from './BillingContext';
import type {
  BillingOffer,
  BillingOperationState,
  BillingProduct,
} from '../lib/billing/types';

export const ACCESS_REVALIDATION_INTERVAL_MS = 60 * 1000;
export const ACCESS_REQUEST_TIMEOUT_MS = 10 * 1000;
export const PREMIUM_PACKAGE_IDS = ['premium_monthly', 'premium_annual'] as const;

export type PremiumStatus = {
  purchasesAvailable: boolean;
  isPremium: boolean;
  isTester: boolean;
  isAdmin: boolean;
  accessTier: AccessTier;
  hasFullAccess: boolean;
  loading: boolean;
  operation: BillingOperationState;
  subscriptionPackages: BillingProduct[];
  refresh: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  purchaseSubscription: (product: BillingProduct, offer: BillingOffer) => Promise<void>;
  restore: () => Promise<boolean>;
};

const PremiumContext = createContext<PremiumStatus>({
  purchasesAvailable: false,
  ...FREE_ACCESS_ENTITLEMENT,
  loading: false,
  operation: { status: 'unavailable' },
  subscriptionPackages: [],
  refresh: async () => { },
  refreshProducts: async () => { },
  purchaseSubscription: async () => { },
  restore: async () => false,
});

export function usePremium(): PremiumStatus {
  return useContext(PremiumContext);
}

type BoundAccess = {
  ownerId: string | null;
  entitlement: AccessEntitlement;
};

export function PremiumProvider({ children, appUserId }: {
  children: React.ReactNode;
  appUserId: string | null;
}) {
  const billing = useBilling();
  const [loading, setLoading] = useState(false);
  const [boundAccess, setBoundAccess] = useState<BoundAccess>({
    ownerId: null,
    entitlement: { ...FREE_ACCESS_ENTITLEMENT },
  });
  const currentUserRef = useRef(appUserId);
  const refreshSequenceRef = useRef(0);
  const consecutive401Ref = useRef(0);
  const verifiedOwnerRef = useRef<string | null>(null);
  currentUserRef.current = appUserId;

  const fetchServerAccess = useCallback(async (
    ownerId: string,
  ): Promise<
    | { kind: 'ok'; entitlement: AccessEntitlement }
    | { kind: 'transient_401' }
    | { kind: 'failed' }
  > => {
    try {
      const response = await authenticatedFetch('/user/premium-status', undefined, {
        expectedUserId: ownerId,
        timeoutMs: ACCESS_REQUEST_TIMEOUT_MS,
      });
      if (response.status === 401) {
        return { kind: 'transient_401' };
      }
      if (!response.ok) return { kind: 'failed' };
      const parsed = parseServerAccessEntitlement(await response.json());
      return parsed ? { kind: 'ok', entitlement: parsed } : { kind: 'failed' };
    } catch {
      return { kind: 'failed' };
    }
  }, []);

  const refresh = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    const ownerId = appUserId;
    const sequence = ++refreshSequenceRef.current;
    if (!ownerId) {
      consecutive401Ref.current = 0;
      verifiedOwnerRef.current = null;
      setBoundAccess((prev) => (
        prev.ownerId === null && !prev.entitlement.hasFullAccess && !prev.entitlement.isPremium
          ? prev
          : { ownerId: null, entitlement: { ...FREE_ACCESS_ENTITLEMENT } }
      ));
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    const result = await fetchServerAccess(ownerId);
    if (currentUserRef.current !== ownerId || refreshSequenceRef.current !== sequence) return;

    if (result.kind === 'transient_401') {
      consecutive401Ref.current += 1;
      // Nu retrogradam brusc un abonat deja validat pe un singur 401 tranzitoriu;
      // al doilea 401 consecutiv revine fail-closed la FREE.
      if (consecutive401Ref.current === 1 && verifiedOwnerRef.current === ownerId) {
        if (!background) setLoading(false);
        return;
      }
    } else {
      consecutive401Ref.current = 0;
    }

    if (result.kind === 'ok') {
      verifiedOwnerRef.current = ownerId;
    } else {
      verifiedOwnerRef.current = null;
    }

    // Nicio stare Play/client nu acorda acces. Un raspuns lipsa sau inconsistent
    // este fail-closed pana la urmatoarea revalidare server reusita.
    const nextEntitlement = result.kind === 'ok' ? result.entitlement : FREE_ACCESS_ENTITLEMENT;
    setBoundAccess((prev) => {
      if (
        prev.ownerId === ownerId
        && prev.entitlement.isPremium === nextEntitlement.isPremium
        && prev.entitlement.isTester === nextEntitlement.isTester
        && prev.entitlement.isAdmin === nextEntitlement.isAdmin
        && prev.entitlement.accessTier === nextEntitlement.accessTier
        && prev.entitlement.hasFullAccess === nextEntitlement.hasFullAccess
      ) {
        return prev;
      }
      return {
        ownerId,
        entitlement: { ...nextEntitlement },
      };
    });
    if (!background) setLoading(false);
  }, [appUserId, fetchServerAccess]);

  useEffect(() => {
    refreshSequenceRef.current += 1;
    consecutive401Ref.current = 0;
    verifiedOwnerRef.current = null;
    setBoundAccess({ ownerId: appUserId, entitlement: { ...FREE_ACCESS_ENTITLEMENT } });
    void refresh();
    if (!appUserId) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const startPolling = () => {
      if (interval === null) {
        interval = setInterval(() => {
          void refresh({ background: true });
        }, ACCESS_REVALIDATION_INTERVAL_MS);
      }
    };

    const initialState = AppState?.currentState;
    if (initialState !== 'background' && initialState !== 'inactive') {
      startPolling();
    }

    const subscription = AppState?.addEventListener?.('change', (nextState) => {
      if (nextState === 'active') {
        void refresh({ background: true });
        startPolling();
      } else if (nextState === 'background' || nextState === 'inactive') {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription?.remove();
    };
  }, [appUserId, refresh]);

  useEffect(() => {
    if (billing.operation.status === 'verified') void refresh();
  }, [billing.operation.status, refresh]);

  const purchaseSubscription = useCallback(
    (product: BillingProduct, offer: BillingOffer) => billing.purchasePremium(product, offer),
    [billing],
  );

  const restore = useCallback(async () => {
    const restored = await billing.restorePurchases();
    if (restored) await refresh();
    return restored;
  }, [billing, refresh]);

  const effectiveAccess = boundAccess.ownerId === appUserId
    ? boundAccess.entitlement
    : FREE_ACCESS_ENTITLEMENT;
  const effectiveLoading = appUserId != null && (boundAccess.ownerId !== appUserId || loading);

  const value = useMemo<PremiumStatus>(() => ({
    purchasesAvailable: billing.purchasesAvailable,
    ...effectiveAccess,
    loading: effectiveLoading,
    operation: billing.operation,
    subscriptionPackages: billing.products,
    refresh,
    refreshProducts: billing.refreshProducts,
    purchaseSubscription,
    restore,
  }), [billing.purchasesAvailable, billing.operation, billing.products, billing.refreshProducts, effectiveAccess, effectiveLoading, refresh, purchaseSubscription, restore]);

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
