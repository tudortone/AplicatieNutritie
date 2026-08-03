/**
 * PremiumContext.tsx — monetizare NutriAI (RevenueCat).
 *
 * Abonament Premium (entitlement `premium`) + pachete de credite AI (consumabile).
 *
 * IMPORTANT: SDK-ul nativ rulează doar în development/production build (EAS).
 * În Expo Go modulul nativ lipsește — totul e încercuit cu try/catch, iar
 * `purchasesAvailable` devine false, ca aplicația să nu crape.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { PRODUCT_CATEGORY } from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';

type RC = typeof import('react-native-purchases');
type PurchasesApiType = RC['default'];

/** Încercăm încărcarea modulului nativ; în Expo Go e absent și nu vrem crash. */
let PurchasesApi: PurchasesApiType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-purchases') as RC;
  PurchasesApi = mod.default ?? (mod as unknown as PurchasesApiType);
} catch {
  PurchasesApi = null;
}

/** Cheia API publică RevenueCat (per-platform, din tab-ul App Settings). */
const REVENUECAT_API_KEYS: Record<string, string> = {
  android: 'PLACEHOLDER_REVENUECAT_GOOGLE_KEY',
  ios: 'PLACEHOLDER_REVENUECAT_APPLE_KEY',
};

/** Entitlement-ul abonamentului Premium (definit în dashboard-ul RevenueCat). */
const PREMIUM_ENTITLEMENT = 'premium';

/** Identificatorii produselor (trebuie să existe în RevenueCat + Play Console). */
export const PREMIUM_PACKAGE_IDS = ['premium_monthly', 'premium_annual'] as const;
export const CREDIT_PRODUCT_IDS = ['credits_50', 'credits_150'] as const;

export type PremiumStatus = {
  /** SDK-ul nativ e disponibil (build real, nu Expo Go) */
  purchasesAvailable: boolean;
  /** abonamentul Premium e activ */
  isPremium: boolean;
  /** încărcare inițială / refresh */
  loading: boolean;
  /** pachetele de abonament din offering-uri (ex. monthly + annual) */
  subscriptionPackages: PurchasesPackage[];
  /** produsele consumabile pentru credite AI */
  creditProducts: PurchasesStoreProduct[];
  refresh: () => Promise<void>;
  purchaseSubscription: (pkg: PurchasesPackage) => Promise<boolean>;
  purchaseCredits: (product: PurchasesStoreProduct) => Promise<boolean>;
  restore: () => Promise<boolean>;
};

const PremiumContext = createContext<PremiumStatus>({
  purchasesAvailable: false,
  isPremium: false,
  loading: false,
  subscriptionPackages: [],
  creditProducts: [],
  refresh: async () => {},
  purchaseSubscription: async () => false,
  purchaseCredits: async () => false,
  restore: async () => false,
});

export function usePremium(): PremiumStatus {
  return useContext(PremiumContext);
}

export function PremiumProvider({ children, appUserId }: { children: React.ReactNode; appUserId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionPackages, setSubscriptionPackages] = useState<PurchasesPackage[]>([]);
  const [creditProducts, setCreditProducts] = useState<PurchasesStoreProduct[]>([]);
  const purchasesAvailable = PurchasesApi != null;

  const hasPremium = useCallback((info?: CustomerInfo | null) => {
    try {
      return Boolean(info?.entitlements?.active?.[PREMIUM_ENTITLEMENT]);
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!PurchasesApi) return;
    try {
      setLoading(true);
      const customer = await PurchasesApi.getCustomerInfo();
      setIsPremium(hasPremium(customer));

      const offerings = await PurchasesApi.getOfferings();
      setSubscriptionPackages(offerings.current?.availablePackages ?? []);
      setCreditProducts(await PurchasesApi.getProducts([...CREDIT_PRODUCT_IDS], PRODUCT_CATEGORY.NON_SUBSCRIPTION));
    } catch {
      // offline / configure eșuat — starea rămâne cea anterioară
    } finally {
      setLoading(false);
    }
  }, [hasPremium]);

  // Configurare + sincronizare cu userul Supabase
  useEffect(() => {
    if (!PurchasesApi) return;
    try {
      PurchasesApi.configure({
        apiKey: REVENUECAT_API_KEYS[Platform.OS] ?? REVENUECAT_API_KEYS.android,
      });
    } catch {
      return;
    }

    PurchasesApi.addCustomerInfoUpdateListener((info) => {
      setIsPremium(hasPremium(info));
    });

    if (appUserId) {
      PurchasesApi.logIn(appUserId).catch(() => {});
    }

    refresh();
  }, [appUserId, hasPremium, refresh]);

  const purchaseSubscription = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => {
      if (!PurchasesApi) return false;
      try {
        const result = await PurchasesApi.purchasePackage(pkg);
        setIsPremium(hasPremium(result.customerInfo));
        return hasPremium(result.customerInfo);
      } catch {
        return false;
      }
    },
    [hasPremium],
  );

  const purchaseCredits = useCallback(async (product: PurchasesStoreProduct): Promise<boolean> => {
    if (!PurchasesApi) return false;
    try {
      const result = await PurchasesApi.purchaseStoreProduct(product);
      // Creditele se acordă server-side (webhook RevenueCat → Supabase) în Faza 2.
      return Boolean(result.customerInfo);
    } catch {
      return false;
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    if (!PurchasesApi) return false;
    try {
      const customer = await PurchasesApi.restorePurchases();
      const premium = hasPremium(customer);
      setIsPremium(premium);
      return premium;
    } catch {
      return false;
    }
  }, [hasPremium]);

  const value = useMemo<PremiumStatus>(
    () => ({
      purchasesAvailable,
      isPremium,
      loading,
      subscriptionPackages,
      creditProducts,
      refresh,
      purchaseSubscription,
      purchaseCredits,
      restore,
    }),
    [purchasesAvailable, isPremium, loading, subscriptionPackages, creditProducts, refresh, purchaseSubscription, purchaseCredits, restore],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
