/**
 * PremiumContext.tsx — monetizare NutriAI (RevenueCat).
 *
 * Abonament Premium (entitlement `premium`) + pachete de credite AI (consumabile).
 *
 * IMPORTANT: SDK-ul rulează nativ doar în development/production build (EAS).
 * În Expo Go se încarcă în „Browser Mode" (fără store nativ), iar `configure()`
 * eșuează — nu-l mai apelăm deloc, iar `purchasesAvailable` devine false,
 * ca aplicația să nu crape și să nu lase utilizatorul să intre în paywall.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_PREFIX } from '../lib/api';
import { PRODUCT_CATEGORY } from 'react-native-purchases';
import { supabase } from '../supabase';
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

/** În Expo Go SDK-ul se încarcă (Browser Mode) dar store-ul nativ lipsește — achizițiile nu pot funcționa. */
const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Cheia API publică RevenueCat, citită din env (EXPO_PUBLIC_REVENUECAT_*_KEY) și
 * inline-uită la build. NU se hardcodează în sursă: un placeholder în git ar duce
 * fie la chei reale comise, fie la un build care pare configurat dar nu e.
 * Cheile RevenueCat sunt publicabile (verificarea reală e server-side, prin
 * revenuecat-secret), deci inlinierea în bundle la build e comportamentul
 * standard al SDK-ului.
 */
function cheieApiRevenueCat(): string | null {
  const cheie = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return cheie?.trim() || null;
}

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

export function PremiumProvider({ children, appUserId, isAdmin = false }: { children: React.ReactNode; appUserId: string | null; isAdmin?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionPackages, setSubscriptionPackages] = useState<PurchasesPackage[]>([]);
  const [creditProducts, setCreditProducts] = useState<PurchasesStoreProduct[]>([]);
  // Fail-closed: fără cheie de platformă sau în Expo Go, achizițiile sunt
  // indisponibile (SDK-ul nu se configurează niciodată cu o cheie goală).
  const purchasesAvailable = PurchasesApi != null && !isExpoGo && cheieApiRevenueCat() != null;

  const hasPremium = useCallback((info?: CustomerInfo | null) => {
    try {
      return Boolean(info?.entitlements?.active?.[PREMIUM_ENTITLEMENT]);
    } catch {
      return false;
    }
  }, []);

  // B-09: entitlement-ul este verificat si pe server (revenuecat-secret), nu doar
  // local. Fail-closed: premium-ul se acorda DOAR pe un verdict afirmativ
  // `premium:true` din partea serverului. Daca serverul e indisponibil, raspunde
  // cu eroare sau cu altceva, starea ramane `false` — flag-ul local nu poate
  // acorda singur privilegii de premium.
  const verificaServerPremium = useCallback(async (forAppUserId: string | null) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!token || !apiUrl || !forAppUserId) return null;
      const resp = await fetch(`${apiUrl.replace(/\/+$/, '')}${API_PREFIX}/user/premium-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      return await resp.json() as { premium?: boolean };
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!PurchasesApi) return;
    try {
      setLoading(true);
      const customer = await PurchasesApi.getCustomerInfo();
      const premiumLocal = hasPremium(customer);
      // Fail-closed: fara entitlement local — nu e premium. Cu entitlement local,
      // premium-ul ramane activ DOAR daca serverul (revenuecat-secret) raspunde
      // afirmativ `premium:true`. Server indisponibil/eroare => nu e premium.
      if (!premiumLocal) {
        setIsPremium(false);
      } else {
        const server = await verificaServerPremium(appUserId);
        setIsPremium(server?.premium === true);
      }

      const offerings = await PurchasesApi.getOfferings();
      setSubscriptionPackages(offerings.current?.availablePackages ?? []);
      setCreditProducts(await PurchasesApi.getProducts([...CREDIT_PRODUCT_IDS], PRODUCT_CATEGORY.NON_SUBSCRIPTION));
    } catch {
      // offline / configure eșuat — fail-closed: nu acordam premium pe starea anterioara
      setIsPremium(false);
    } finally {
      setLoading(false);
    }
  }, [hasPremium, verificaServerPremium, appUserId]);

  // Configurare + sincronizare cu userul Supabase
  useEffect(() => {
    const cheie = cheieApiRevenueCat();
    if (!PurchasesApi || isExpoGo || !cheie) return;
    try {
      PurchasesApi.configure({ apiKey: cheie });
    } catch {
      return;
    }

    PurchasesApi.addCustomerInfoUpdateListener(() => {
      // Orice schimbare de customer info declanseaza un refresh complet, care
      // re-verifica premium-ul prin server (fail-closed), nu doar local.
      refresh();
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
        if (!hasPremium(result.customerInfo)) {
          // Fara entitlement local — nu e premium.
          setIsPremium(false);
          return false;
        }
        // B-09 fail-closed: achizitia locala e confirmata doar daca si serverul
        // (revenuecat-secret) raspunde afirmativ `premium:true`. Server
        // indisponibil/eroare (`null`) => nu se acorda premium.
        const server = await verificaServerPremium(appUserId);
        const premium = server?.premium === true;
        setIsPremium(premium);
        return premium;
      } catch {
        // eroare — fail-closed: nu acordam premium pe verdictul local
        setIsPremium(false);
        return false;
      }
    },
    [hasPremium, verificaServerPremium, appUserId],
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
      if (!hasPremium(customer)) {
        // Fara entitlement local — nu e premium.
        setIsPremium(false);
        return false;
      }
      // B-09 fail-closed: restaurarea e confirmata doar daca si serverul
      // (revenuecat-secret) raspunde afirmativ `premium:true`. Server
      // indisponibil/eroare (`null`) => nu se acorda premium.
      const server = await verificaServerPremium(appUserId);
      const premium = server?.premium === true;
      setIsPremium(premium);
      return premium;
    } catch {
      // eroare — fail-closed: nu acordam premium pe verdictul local
      setIsPremium(false);
      return false;
    }
  }, [hasPremium, verificaServerPremium, appUserId]);

  const value = useMemo<PremiumStatus>(
    () => ({
      purchasesAvailable,
      // Contul de admin are Premium permanent, independent de RevenueCat:
      // flag-ul vine din app_metadata.rol (server-controlled), deci nu poate fi
      // auto-acordat de un utilizator.
      isPremium: isAdmin ? true : isPremium,
      loading,
      subscriptionPackages,
      creditProducts,
      refresh,
      purchaseSubscription,
      purchaseCredits,
      restore,
    }),
    [purchasesAvailable, isPremium, isAdmin, loading, subscriptionPackages, creditProducts, refresh, purchaseSubscription, purchaseCredits, restore],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
