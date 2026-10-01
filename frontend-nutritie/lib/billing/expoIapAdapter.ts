import { EventEmitter, requireNativeModule } from 'expo-modules-core';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type ProductSubscription,
  type Product,
  type Purchase,
  type SubscriptionOffer,
} from 'expo-iap';
import type {
  BillingOffer,
  BillingCreditProduct,
  BillingProduct,
  NativeBillingAdapter,
  NativePurchase,
} from './types';

// Expo SDK 54 / JSI compatibility polyfill for expo-iap:
// expo-iap@5.5.1 assumes nativeModule.addListener exists directly on the object returned
// by requireNativeModule('ExpoIap'). In SDK 54, event listeners are handled by EventEmitter.
try {
  const nativeModule = requireNativeModule('ExpoIap') as Record<string, unknown> | null;
  if (nativeModule && typeof nativeModule.addListener !== 'function') {
    const coreEmitter = new EventEmitter(nativeModule as any) as any;
    nativeModule.addListener = (event: string, listener: (...args: unknown[]) => void) => {
      return coreEmitter.addListener(event, listener);
    };
    nativeModule.removeListener = (event: string, listener: (...args: unknown[]) => void) => {
      return coreEmitter.removeListener
        ? coreEmitter.removeListener(event, listener)
        : undefined;
    };
  }
} catch {
  // Ignorat în medii unde modulul nativ ExpoIap lipsește (teste unitare, web, etc.).
}


function normalizePurchase(purchase: Purchase): NativePurchase {
  return {
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken ?? null,
    state: purchase.purchaseState,
    raw: purchase,
  };
}

function normalizeOffer(offer: SubscriptionOffer): BillingOffer | null {
  const basePlanId = offer.basePlanIdAndroid;
  const offerToken = offer.offerTokenAndroid;
  if (!basePlanId || !offerToken) return null;
  const rawPhases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
  const recurringPhase = rawPhases.at(-1);

  const trialPhaseRaw = rawPhases.find((p) => p.priceAmountMicros === '0' || parseFloat(p.priceAmountMicros || '0') === 0);
  const introPhaseRaw = rawPhases.find((p) => p !== trialPhaseRaw && p !== recurringPhase);

  const pricingPhases = rawPhases.map((p) => ({
    billingPeriod: p.billingPeriod,
    priceCurrencyCode: p.priceCurrencyCode,
    formattedPrice: p.formattedPrice,
    priceAmountMicros: p.priceAmountMicros,
    recurrenceMode: p.recurrenceMode,
    billingCycleCount: p.billingCycleCount,
  }));

  const trialPhase = trialPhaseRaw ? {
    billingPeriod: trialPhaseRaw.billingPeriod,
    priceCurrencyCode: trialPhaseRaw.priceCurrencyCode,
    formattedPrice: trialPhaseRaw.formattedPrice,
    priceAmountMicros: trialPhaseRaw.priceAmountMicros,
    recurrenceMode: trialPhaseRaw.recurrenceMode,
    billingCycleCount: trialPhaseRaw.billingCycleCount,
  } : null;

  const introPhase = introPhaseRaw ? {
    billingPeriod: introPhaseRaw.billingPeriod,
    priceCurrencyCode: introPhaseRaw.priceCurrencyCode,
    formattedPrice: introPhaseRaw.formattedPrice,
    priceAmountMicros: introPhaseRaw.priceAmountMicros,
    recurrenceMode: introPhaseRaw.recurrenceMode,
    billingCycleCount: introPhaseRaw.billingCycleCount,
  } : null;

  return {
    basePlanId,
    offerId: offer.id || null,
    offerToken,
    displayPrice: recurringPhase?.formattedPrice || offer.displayPrice,
    currencyCode: recurringPhase?.priceCurrencyCode || offer.currency || null,
    billingPeriod: recurringPhase?.billingPeriod || null,
    priceAmountMicros: recurringPhase?.priceAmountMicros || null,
    offerTags: (offer.offerTagsAndroid ?? []).filter((tag): tag is string => typeof tag === 'string'),
    pricingPhases,
    trialPhase,
    introPhase,
  };
}

function isAndroidSubscription(product: ProductSubscription): boolean {
  return product.platform === 'android' &&
    product.type === 'subs' &&
    product.productStatusAndroid !== 'not-found' &&
    product.productStatusAndroid !== 'no-offers-available';
}

function normalizeProduct(product: ProductSubscription): BillingProduct | null {
  if (!isAndroidSubscription(product)) return null;
  const offers = (product.subscriptionOffers ?? [])
    .map(normalizeOffer)
    .filter((offer): offer is BillingOffer => offer !== null);
  if (offers.length === 0) return null;
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    offers,
  };
}

function normalizeConsumable(product: Product): BillingCreditProduct | null {
  if (
    product.platform !== 'android' ||
    product.type !== 'in-app' ||
    product.productStatusAndroid === 'not-found' ||
    !product.id || !product.displayPrice
  ) return null;
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    displayPrice: product.displayPrice,
    currencyCode: product.currency || null,
  };
}

export function createExpoIapBillingAdapter(): NativeBillingAdapter {
  return Object.freeze({
    async connect() {
      try {
        return await initConnection();
      } catch (err) {
        console.warn('[expoIapAdapter] initConnection failed:', err);
        return false;
      }
    },

    async disconnect() {
      try {
        await endConnection();
      } catch (err) {
        console.warn('[expoIapAdapter] endConnection failed:', err);
      }
    },

    addPurchaseUpdatedListener(listener) {
      try {
        return purchaseUpdatedListener((purchase) => {
          void listener(normalizePurchase(purchase));
        });
      } catch (err) {
        console.warn('[expoIapAdapter] addPurchaseUpdatedListener fallback:', err);
        return { remove: () => {} };
      }
    },

    addPurchaseErrorListener(listener) {
      try {
        return purchaseErrorListener((error) => listener({
          code: String(error.code),
          message: error.message,
        }));
      } catch (err) {
        console.warn('[expoIapAdapter] addPurchaseErrorListener fallback:', err);
        return { remove: () => {} };
      }
    },


    async fetchSubscriptions(productIds) {
      const result = await fetchProducts({ skus: productIds, type: 'subs' });
      if (!Array.isArray(result)) return [];
      return (result as ProductSubscription[])
        .map(normalizeProduct)
        .filter((product): product is BillingProduct => product !== null);
    },

    async fetchConsumables(productIds) {
      const result = await fetchProducts({ skus: productIds, type: 'in-app' });
      if (!Array.isArray(result)) return [];
      return (result as Product[])
        .map(normalizeConsumable)
        .filter((product): product is BillingCreditProduct => product !== null);
    },

    async requestSubscription({ productId, offerToken, obfuscatedAccountId }) {
      await requestPurchase({
        request: {
          google: {
            skus: [productId],
            subscriptionOffers: [{ sku: productId, offerToken }],
            obfuscatedAccountId,
          },
        },
        type: 'subs',
      });
    },

    async requestConsumable({ productId, obfuscatedAccountId }) {
      await requestPurchase({
        request: { google: { skus: [productId], obfuscatedAccountId } },
        type: 'in-app',
      });
    },

    async getAvailablePurchases() {
      const purchases = await getAvailablePurchases({ includeSuspendedAndroid: false });
      return purchases
        .filter((purchase) => !('isSuspendedAndroid' in purchase) || purchase.isSuspendedAndroid !== true)
        .map(normalizePurchase);
    },

    async finishTransaction(purchase) {
      await finishTransaction({
        purchase: purchase.raw as Purchase,
        isConsumable: false,
      });
    },
  });
}
