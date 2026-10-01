import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { buildApiUrl } from '../lib/api';
import { supabase } from '../supabase';
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
  refresh: async () => {},
  refreshProducts: async () => {},
  purchaseSubscription: async () => {},
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
  currentUserRef.current = appUserId;

  const fetchServerAccess = useCallback(async (ownerId: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ACCESS_REQUEST_TIMEOUT_MS);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.access_token || session.user.id !== ownerId) return null;
      const response = await fetch(buildApiUrl('/user/premium-status'), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return parseServerAccessEntitlement(await response.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const refresh = useCallback(async () => {
    const ownerId = appUserId;
    const sequence = ++refreshSequenceRef.current;
    if (!ownerId) {
      setBoundAccess({ ownerId: null, entitlement: { ...FREE_ACCESS_ENTITLEMENT } });
      setLoading(false);
      return;
    }
    setLoading(true);
    const serverAccess = await fetchServerAccess(ownerId);
    if (currentUserRef.current !== ownerId || refreshSequenceRef.current !== sequence) return;
    // Nicio stare Play/client nu acorda acces. Un raspuns lipsa sau inconsistent
    // este fail-closed pana la urmatoarea revalidare server reusita.
    setBoundAccess({
      ownerId,
      entitlement: { ...(serverAccess ?? FREE_ACCESS_ENTITLEMENT) },
    });
    setLoading(false);
  }, [appUserId, fetchServerAccess]);

  useEffect(() => {
    refreshSequenceRef.current += 1;
    setBoundAccess({ ownerId: appUserId, entitlement: { ...FREE_ACCESS_ENTITLEMENT } });
    void refresh();
    if (!appUserId) return;
    const interval = setInterval(() => { void refresh(); }, ACCESS_REVALIDATION_INTERVAL_MS);
    return () => clearInterval(interval);
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
