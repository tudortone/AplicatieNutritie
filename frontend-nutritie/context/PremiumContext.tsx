/**
 * PremiumContext.tsx — monetizare NutriAI (RevenueCat).
 * Entitlement-ul local este doar un semnal; privilegiul devine activ exclusiv
 * după un verdict pozitiv al backendului.
 */

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
import { API_PREFIX } from '../lib/api';
import { PRODUCT_CATEGORY } from 'react-native-purchases';
import { supabase } from '../supabase';
import type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';

type RC = typeof import('react-native-purchases');
type PurchasesApiType = RC['default'];

let PurchasesApi: PurchasesApiType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-purchases') as RC;
  PurchasesApi = mod.default ?? (mod as unknown as PurchasesApiType);
} catch {
  PurchasesApi = null;
}

const isExpoGo = Constants.appOwnership === 'expo';
let purchasesConfigured = false;

function cheieApiRevenueCat(): string | null {
  const cheie = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return cheie?.trim() || null;
}

const PREMIUM_ENTITLEMENT = 'premium';
export const PREMIUM_PACKAGE_IDS = ['premium_monthly', 'premium_annual'] as const;
export const CREDIT_PRODUCT_IDS = ['credits_50', 'credits_150'] as const;

export type PremiumStatus = {
  purchasesAvailable: boolean;
  isPremium: boolean;
  loading: boolean;
  subscriptionPackages: PurchasesPackage[];
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

export function PremiumProvider({
  children,
  appUserId,
  isAdmin = false,
}: {
  children: React.ReactNode;
  appUserId: string | null;
  isAdmin?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionPackages, setSubscriptionPackages] = useState<PurchasesPackage[]>([]);
  const [creditProducts, setCreditProducts] = useState<PurchasesStoreProduct[]>([]);
  const generatieRef = useRef(0);
  const mountedRef = useRef(true);
  const appUserIdRef = useRef(appUserId);
  appUserIdRef.current = appUserId;

  const apiKey = cheieApiRevenueCat();
  const purchasesAvailable = PurchasesApi !== null && !isExpoGo && apiKey !== null;

  const hasPremiumLocal = useCallback((info?: CustomerInfo | null) =>
    Boolean(info?.entitlements?.active?.[PREMIUM_ENTITLEMENT]), []);

  const verificaServerPremium = useCallback(async (forAppUserId: string | null): Promise<boolean> => {
    if (!forAppUserId) return false;
    try {
      const { data, error } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
      if (error || !token || !apiUrl) return false;

      const resp = await fetch(`${apiUrl}${API_PREFIX}/user/premium-status`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!resp.ok) return false;
      const payload: unknown = await resp.json();
      return Boolean(
        payload && typeof payload === 'object' &&
        'premium' in payload && payload.premium === true,
      );
    } catch {
      return false;
    }
  }, []);

  const aplicaCustomerInfo = useCallback(async (info: CustomerInfo): Promise<boolean> => {
    const generatie = ++generatieRef.current;
    if (!hasPremiumLocal(info)) {
      if (mountedRef.current && generatieRef.current === generatie) setIsPremium(false);
      return false;
    }

    const validat = await verificaServerPremium(appUserIdRef.current);
    if (mountedRef.current && generatieRef.current === generatie) setIsPremium(validat);
    return validat;
  }, [hasPremiumLocal, verificaServerPremium]);

  const refresh = useCallback(async () => {
    if (!PurchasesApi || !purchasesAvailable || !appUserIdRef.current) {
      setIsPremium(false);
      return;
    }
    try {
      setLoading(true);
      const [customer, offerings, products] = await Promise.all([
        PurchasesApi.getCustomerInfo(),
        PurchasesApi.getOfferings(),
        PurchasesApi.getProducts([...CREDIT_PRODUCT_IDS], PRODUCT_CATEGORY.NON_SUBSCRIPTION),
      ]);
      if (!mountedRef.current) return;
      setSubscriptionPackages(offerings.current?.availablePackages ?? []);
      setCreditProducts(products);
      await aplicaCustomerInfo(customer);
    } catch {
      if (mountedRef.current) setIsPremium(false);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [aplicaCustomerInfo, purchasesAvailable]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generatieRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!PurchasesApi || !purchasesAvailable || !apiKey) {
      setIsPremium(false);
      return;
    }

    try {
      if (!purchasesConfigured) {
        PurchasesApi.configure({ apiKey });
        purchasesConfigured = true;
      }
    } catch {
      setIsPremium(false);
      return;
    }

    const listener: CustomerInfoUpdateListener = (info) => {
      void aplicaCustomerInfo(info);
    };
    PurchasesApi.addCustomerInfoUpdateListener(listener);
    return () => PurchasesApi?.removeCustomerInfoUpdateListener(listener);
  }, [apiKey, aplicaCustomerInfo, purchasesAvailable]);

  useEffect(() => {
    if (!PurchasesApi || !purchasesAvailable) {
      setIsPremium(false);
      return;
    }

    const generatie = ++generatieRef.current;
    setIsPremium(false);
    if (!appUserId) return;

    PurchasesApi.logIn(appUserId)
      .then(() => {
        if (mountedRef.current && generatieRef.current === generatie) return refresh();
        return undefined;
      })
      .catch(() => {
        if (mountedRef.current && generatieRef.current === generatie) setIsPremium(false);
      });
  }, [appUserId, purchasesAvailable, refresh]);

  const purchaseSubscription = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    if (!PurchasesApi || !purchasesAvailable) return false;
    try {
      const result = await PurchasesApi.purchasePackage(pkg);
      return await aplicaCustomerInfo(result.customerInfo);
    } catch {
      setIsPremium(false);
      return false;
    }
  }, [aplicaCustomerInfo, purchasesAvailable]);

  const purchaseCredits = useCallback(async (product: PurchasesStoreProduct): Promise<boolean> => {
    if (!PurchasesApi || !purchasesAvailable) return false;
    try {
      const result = await PurchasesApi.purchaseStoreProduct(product);
      return Boolean(result.customerInfo);
    } catch {
      return false;
    }
  }, [purchasesAvailable]);

  const restore = useCallback(async (): Promise<boolean> => {
    if (!PurchasesApi || !purchasesAvailable) return false;
    try {
      return await aplicaCustomerInfo(await PurchasesApi.restorePurchases());
    } catch {
      setIsPremium(false);
      return false;
    }
  }, [aplicaCustomerInfo, purchasesAvailable]);

  const value = useMemo<PremiumStatus>(() => ({
    purchasesAvailable,
    isPremium: isAdmin ? true : isPremium,
    loading,
    subscriptionPackages,
    creditProducts,
    refresh,
    purchaseSubscription,
    purchaseCredits,
    restore,
  }), [
    purchasesAvailable,
    isPremium,
    isAdmin,
    loading,
    subscriptionPackages,
    creditProducts,
    refresh,
    purchaseSubscription,
    purchaseCredits,
    restore,
  ]);

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
