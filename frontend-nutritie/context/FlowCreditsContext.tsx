import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { buildApiUrl } from '../lib/api';
import {
  showRewardedAdWithSsv,
  preloadRewardedAdWithSsv,
  discardPreloadedRewardedAd,
  initializeAdsSdk,
  type RewardedAdOutcome,
} from '../lib/ads/adsService';
import { getCanRequestAds, isConsentResolved, resolveAdsConsent } from '../lib/ads/adsConsent';
import { supabase } from '../supabase';
import { useBilling } from './BillingContext';
import { usePremium } from './PremiumContext';
import type { BillingCreditProduct, BillingOperationState } from '../lib/billing/types';
import { idOperatieNoua } from '../lib/idUtils';
import { getPlayIntegrityHeaders } from '../lib/playIntegrityNative';

export type FlowCreditsBalance = {
  dailyRemaining: number;
  rewarded: number;
  purchased: number;
  total: number;
  rewardedGrantsRemaining: number;
  serverDay: string | null;
};

export type FlowCreditCategory = 'daily' | 'rewarded' | 'purchased';

type RewardState = 'idle' | 'loading' | 'awaiting-server' | 'granted' | 'unavailable' | 'blocked' | 'limit';
type FlowCreditsContextValue = {
  balance: FlowCreditsBalance;
  balanceReady: boolean;
  loading: boolean;
  unlimited: boolean;
  visible: boolean;
  rewardState: RewardState;
  creditProducts: BillingCreditProduct[];
  purchaseStatus: BillingOperationState;
  lastConsumedCategory: FlowCreditCategory | null;
  open: () => void;
  close: () => void;
  refresh: () => Promise<FlowCreditsBalance | null>;
  consumeOptimisticCredit: () => FlowCreditCategory | null;
  rollbackOptimisticCredit: () => void;
  watchRewarded: () => Promise<RewardedAdOutcome | 'limit' | 'granted'>;
  purchase: (product: BillingCreditProduct) => Promise<void>;
};

const EMPTY: FlowCreditsBalance = {
  dailyRemaining: 0,
  rewarded: 0,
  purchased: 0,
  total: 0,
  rewardedGrantsRemaining: 0,
  serverDay: null,
};

const IDLE_BILLING_OPERATION: BillingOperationState = { status: 'idle' };

const FlowCreditsContext = createContext<FlowCreditsContextValue>({
  balance: EMPTY,
  balanceReady: false,
  loading: false,
  unlimited: false,
  visible: false,
  rewardState: 'idle',
  creditProducts: [],
  purchaseStatus: IDLE_BILLING_OPERATION,
  lastConsumedCategory: null,
  open: () => {},
  close: () => {},
  refresh: async () => null,
  consumeOptimisticCredit: () => null,
  rollbackOptimisticCredit: () => {},
  watchRewarded: async () => 'unavailable',
  purchase: async () => {},
});

/**
 * Returns true only when the user's Flow Credits balance for the active account
 * has been confirmed from the backend, is not loading/unlimited, and has 0 total credits.
 */
export function hasConfirmedZeroFlowCredits(
  flow: Pick<FlowCreditsContextValue, 'balance' | 'balanceReady' | 'loading' | 'unlimited'> | null | undefined,
): boolean {
  if (!flow || flow.balanceReady !== true || flow.loading || flow.unlimited) {
    return false;
  }
  return (flow.balance?.total ?? 0) <= 0;
}

function normalizedBalance(value: unknown): FlowCreditsBalance | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const num = (key: string) => Math.max(0, Number(row[key]) || 0);
  return {
    dailyRemaining: num('dailyRemaining'),
    rewarded: num('rewarded'),
    purchased: num('purchased'),
    total: num('total'),
    rewardedGrantsRemaining: num('rewardedGrantsRemaining'),
    serverDay: typeof row.serverDay === 'string' ? row.serverDay : null,
  };
}

function getDeviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.trim().length > 0 && tz.trim().length <= 64 ? tz.trim() : null;
  } catch {
    return null;
  }
}

async function authenticatedFetch(path: string, init?: RequestInit, expectedUserId?: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('AUTH_REQUIRED');
  if (expectedUserId && data.session.user.id !== expectedUserId) throw new Error('AUTH_USER_CHANGED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let integrityHeaders: Record<string, string> = {};
    let extraIdempotencyHeader: Record<string, string> = {};
    if (path === '/rewarded/intents' && init?.method === 'POST') {
      let body: Record<string, unknown> = {};
      if (typeof init.body === 'string') {
        try {
          const parsed: unknown = JSON.parse(init.body);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>;
          }
        } catch {}
      }
      const existingHeaders = init.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
        ? (init.headers as Record<string, string>)
        : {};
      const existingIdempotencyKey = existingHeaders['Idempotency-Key'] || existingHeaders['idempotency-key'];
      const idempotencyKey = (typeof existingIdempotencyKey === 'string' && existingIdempotencyKey.trim())
        ? existingIdempotencyKey.trim()
        : idOperatieNoua();
      extraIdempotencyHeader = { 'Idempotency-Key': idempotencyKey };
      integrityHeaders = await getPlayIntegrityHeaders({
        method: 'POST',
        path,
        userId: data.session.user.id,
        body,
        idempotencyKey,
      });
    }
    const deviceTimezone = getDeviceTimezone();
    return await fetch(buildApiUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...(deviceTimezone ? { 'X-Timezone': deviceTimezone } : {}),
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
        ...extraIdempotencyHeader,
        ...integrityHeaders,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const PREWARM_TTL_MS = 4 * 60 * 1000;
// P1-04: Polling SSV rezilient (~46s total cu backoff progresiv) pentru webhook-uri AdMob întârziate.
const SSV_POLL_DELAYS_MS = [1_500, 1_500, 2_000, 2_000, 2_500, 3_000, 3_000, 3_500, 4_000, 4_500, 5_000, 5_000, 5_000, 4_000];
type WatchRewardedOutcome = RewardedAdOutcome | 'granted' | 'limit';
type PrewarmedIntent = {
  owner: string;
  intentId: string;
  customData: string;
  createdAtMs: number;
};

export function FlowCreditsProvider({ children, appUserId }: { children: React.ReactNode; appUserId: string | null }) {
  const billing = useBilling();
  const premium = usePremium();
  const isPremiumResolved = !premium.loading;
  const hasUnlimitedAccess = premium.hasFullAccess || premium.isPremium;
  const [balance, setBalance] = useState<FlowCreditsBalance>(EMPTY);
  const [balanceOwnerId, setBalanceOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [rewardState, setRewardState] = useState<RewardState>('idle');
  const [lastConsumedCategory, setLastConsumedCategory] = useState<FlowCreditCategory | null>(null);
  const ownerRef = useRef(appUserId);
  const visibleRef = useRef(visible);
  const premiumRef = useRef(premium);
  const balanceRef = useRef(balance);
  const lastConsumedCategoryRef = useRef<FlowCreditCategory | null>(null);
  const sequenceRef = useRef(0);
  const rewardOperationRef = useRef(0);
  const watchInFlightRef = useRef<{ owner: string; promise: Promise<WatchRewardedOutcome> } | null>(null);
  const prewarmInFlightRef = useRef<{ owner: string; promise: Promise<PrewarmedIntent | null> } | null>(null);
  const prewarmedIntentRef = useRef<PrewarmedIntent | null>(null);

  useLayoutEffect(() => {
    ownerRef.current = appUserId;
    visibleRef.current = visible;
    premiumRef.current = premium;
    balanceRef.current = balance;
    lastConsumedCategoryRef.current = lastConsumedCategory;
  }, [appUserId, visible, premium, balance, lastConsumedCategory]);

  const clearPrewarmedRewarded = useCallback(() => {
    prewarmInFlightRef.current = null;
    prewarmedIntentRef.current = null;
    if (typeof discardPreloadedRewardedAd === 'function') {
      discardPreloadedRewardedAd();
    }
  }, []);

  const refresh = useCallback(async () => {
    const owner = ownerRef.current;
    const sequence = ++sequenceRef.current;
    if (!owner) {
      setBalance(EMPTY);
      setBalanceOwnerId(null);
      lastConsumedCategoryRef.current = null;
      setLastConsumedCategory(null);
      return null;
    }
    setLoading(true);
    try {
      const response = await authenticatedFetch('/flow-credits', undefined, owner);
      if (!response.ok) return null;
      const next = normalizedBalance(await response.json());
      if (next && ownerRef.current === owner && sequenceRef.current === sequence) {
        if (lastConsumedCategoryRef.current && next.total > balanceRef.current.total) {
          lastConsumedCategoryRef.current = null;
          setLastConsumedCategory(null);
        }
        balanceRef.current = next;
        setBalance(next);
        setBalanceOwnerId(owner);
        return next;
      }
      return null;
    } catch {
      return null;
    } finally {
      if (ownerRef.current === owner && sequenceRef.current === sequence) setLoading(false);
    }
  }, []);

  useEffect(() => {
    sequenceRef.current += 1;
    rewardOperationRef.current += 1;
    watchInFlightRef.current = null;
    clearPrewarmedRewarded();
    balanceRef.current = EMPTY;
    setBalance(EMPTY);
    setBalanceOwnerId(null);
    lastConsumedCategoryRef.current = null;
    setLastConsumedCategory(null);
    setRewardState('idle');
    setVisible(false);
    if (appUserId) void refresh();
  }, [appUserId, refresh, clearPrewarmedRewarded]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && ownerRef.current) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (billing.operation?.status === 'verified') void refresh();
  }, [billing.operation?.status, refresh]);

  const balanceReady = Boolean(appUserId && balanceOwnerId === appUserId);

  useEffect(() => {
    if (!visible || !appUserId || !isPremiumResolved || hasUnlimitedAccess || !balanceReady || balance.rewardedGrantsRemaining <= 0) {
      if (!visible || hasUnlimitedAccess || !appUserId) {
        clearPrewarmedRewarded();
      }
      return;
    }
    if (typeof preloadRewardedAdWithSsv !== 'function') return;
    if (prewarmInFlightRef.current?.owner === appUserId) {
      return;
    }
    const now = Date.now();
    const cached = prewarmedIntentRef.current;
    if (cached && cached.owner === appUserId && now - cached.createdAtMs < PREWARM_TTL_MS) {
      return;
    }
    if (cached) {
      clearPrewarmedRewarded();
    }
    const targetOwner = appUserId;
    let promise: Promise<PrewarmedIntent | null> | null = null;
    promise = (async (): Promise<PrewarmedIntent | null> => {
      try {
        await Promise.resolve();
        if (ownerRef.current !== targetOwner || prewarmInFlightRef.current?.promise !== promise || !visibleRef.current) {
          return null;
        }
        const canRequest = typeof getCanRequestAds === 'function' ? getCanRequestAds() : true;
        if (!isConsentResolved() || !canRequest) {
          try { await resolveAdsConsent(); } catch {}
        }
        try { await initializeAdsSdk(); } catch {}
        if (ownerRef.current !== targetOwner || prewarmInFlightRef.current?.promise !== promise || !visibleRef.current) {
          return null;
        }
        const currentPrem = premiumRef.current;
        if (currentPrem.loading || currentPrem.hasFullAccess || currentPrem.isPremium) return null;
        const response = await authenticatedFetch(
          '/rewarded/intents',
          { method: 'POST', body: '{}', headers: { 'Idempotency-Key': idOperatieNoua() } },
          targetOwner,
        );
        if (!response.ok) return null;
        const intent = await response.json() as { intentId?: string; status?: string; ssv?: { userId?: string; customData?: string } };
        if (
          intent.status !== 'PENDING'
          || !intent.intentId
          || intent.ssv?.userId !== intent.intentId
          || !intent.ssv.customData
        ) {
          return null;
        }
        if (ownerRef.current !== targetOwner || prewarmInFlightRef.current?.promise !== promise || !visibleRef.current) {
          return null;
        }
        const currentPremAfter = premiumRef.current;
        if (currentPremAfter.loading || currentPremAfter.hasFullAccess || currentPremAfter.isPremium) return null;
        const prewarmed: PrewarmedIntent = {
          owner: targetOwner,
          intentId: intent.intentId,
          customData: intent.ssv.customData,
          createdAtMs: Date.now(),
        };
        prewarmedIntentRef.current = prewarmed;
        preloadRewardedAdWithSsv({ intentId: prewarmed.intentId, customData: prewarmed.customData });
        return prewarmed;
      } catch {
        return null;
      } finally {
        if (promise && prewarmInFlightRef.current?.promise === promise) {
          prewarmInFlightRef.current = null;
        }
      }
    })();
    prewarmInFlightRef.current = { owner: targetOwner, promise };
  }, [visible, appUserId, isPremiumResolved, hasUnlimitedAccess, balanceReady, balance.rewardedGrantsRemaining, clearPrewarmedRewarded]);

  useEffect(() => () => {
    rewardOperationRef.current += 1;
    watchInFlightRef.current = null;
    clearPrewarmedRewarded();
  }, [clearPrewarmedRewarded]);

  const watchRewarded = useCallback((): Promise<WatchRewardedOutcome> => {
    const owner = ownerRef.current;
    const accessBlocksRewardedAds = () => {
      const current = premiumRef.current;
      return current.loading || current.hasFullAccess || current.isPremium;
    };
    if (!owner || accessBlocksRewardedAds()) return Promise.resolve('unavailable' as const);

    // P1-04: Single-flight per user — un dublu-tap nu anulează reclama/polling-ul SSV deja activ.
    if (watchInFlightRef.current && watchInFlightRef.current.owner === owner) {
      return watchInFlightRef.current.promise;
    }

    const operation = ++rewardOperationRef.current;
    const isCurrentOperation = () => Boolean(owner) && ownerRef.current === owner && rewardOperationRef.current === operation;
    const updateState = (state: RewardState) => {
      if (isCurrentOperation()) setRewardState(state);
    };
    const stopIfBlocked = () => {
      if (!isCurrentOperation() || !accessBlocksRewardedAds()) return false;
      clearPrewarmedRewarded();
      updateState('unavailable');
      return true;
    };

    const run = (async (): Promise<WatchRewardedOutcome> => {
      const eligibleBalance = balanceOwnerId === owner ? balance : await refresh();
      if (!isCurrentOperation() || accessBlocksRewardedAds()) return 'unavailable' as const;
      if (!eligibleBalance) {
        updateState('unavailable');
        return 'unavailable' as const;
      }
      if (eligibleBalance.rewardedGrantsRemaining <= 0) {
        updateState('limit');
        return 'limit' as const;
      }
      const balanceBeforeReward = eligibleBalance.total;
      updateState('loading');
      try {
        let activeIntent: { intentId: string; customData: string } | null = null;
        const now = Date.now();
        const cached = prewarmedIntentRef.current;
        if (cached && cached.owner === owner && now - cached.createdAtMs < PREWARM_TTL_MS) {
          prewarmedIntentRef.current = null;
          activeIntent = { intentId: cached.intentId, customData: cached.customData };
        } else {
          prewarmedIntentRef.current = null;
          if (cached && typeof discardPreloadedRewardedAd === 'function') {
            discardPreloadedRewardedAd();
          }
          if (prewarmInFlightRef.current?.owner === owner) {
            const awaited = await prewarmInFlightRef.current.promise;
            if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
            if (awaited && awaited.owner === owner && Date.now() - awaited.createdAtMs < PREWARM_TTL_MS) {
              prewarmedIntentRef.current = null;
              activeIntent = { intentId: awaited.intentId, customData: awaited.customData };
            }
          }
        }

        if (!activeIntent) {
          const response = await authenticatedFetch(
            '/rewarded/intents',
            { method: 'POST', body: '{}', headers: { 'Idempotency-Key': idOperatieNoua() } },
            owner,
          );
          if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
          if (!response.ok) {
            updateState(response.status === 429 ? 'limit' : 'unavailable');
            return response.status === 429 ? 'limit' as const : 'unavailable' as const;
          }
          const intent = await response.json() as { intentId?: string; status?: string; ssv?: { userId?: string; customData?: string } };
          if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
          if (intent.status !== 'PENDING' || !intent.intentId || intent.ssv?.userId !== intent.intentId || !intent.ssv.customData) {
            throw new Error('INVALID_REWARD_INTENT');
          }
          activeIntent = { intentId: intent.intentId, customData: intent.ssv.customData };
        }

        const canRequest = typeof getCanRequestAds === 'function' ? getCanRequestAds() : true;
        if (!isConsentResolved() || !canRequest) {
          try {
            await resolveAdsConsent();
          } catch {}
        }
        try {
          await initializeAdsSdk();
        } catch {}
        if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
        const outcome = await showRewardedAdWithSsv({ intentId: activeIntent.intentId, customData: activeIntent.customData });
        if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
        if (outcome !== 'earned-awaiting-server') {
          updateState(outcome === 'blocked' ? 'blocked' : outcome === 'unavailable' ? 'unavailable' : 'idle');
          return outcome;
        }
        updateState('awaiting-server');
        for (const waitMs of SSV_POLL_DELAYS_MS) {
          await delay(waitMs);
          if (!isCurrentOperation()) return 'unavailable' as const;
          let statusResponse: Response;
          try {
            statusResponse = await authenticatedFetch(`/rewarded/intents/${encodeURIComponent(activeIntent.intentId)}`, undefined, owner);
          } catch {
            // P1-04: O eroare tranzitorie de rețea pe un poll nu trebuie să abandoneze SSV-ul.
            continue;
          }
          if (!isCurrentOperation()) return 'unavailable' as const;
          if (!statusResponse.ok) continue;
          let status: string | undefined;
          try {
            ({ status } = await statusResponse.json() as { status?: string });
          } catch {
            continue;
          }
          if (status === 'GRANTED') {
            await refresh();
            if (!isCurrentOperation()) return 'unavailable' as const;
            updateState('granted');
            return 'granted' as const;
          }
          if (status === 'DENIED_LIMIT') {
            updateState('limit');
            return 'limit' as const;
          }
          if (status === 'EXPIRED') break;
        }
        // Reîmprospătare finală în caz că webhook-ul SSV a ajuns chiar la limita ferestrei.
        const finalBalance = await refresh();
        if (!isCurrentOperation()) return 'unavailable' as const;
        if (finalBalance && finalBalance.total > balanceBeforeReward) {
          updateState('granted');
          return 'granted' as const;
        }
        updateState('unavailable');
        return 'unavailable' as const;
      } catch {
        updateState('unavailable');
        return 'unavailable' as const;
      }
    })();

    const tracked = run.finally(() => {
      if (watchInFlightRef.current?.promise === tracked) {
        watchInFlightRef.current = null;
      }
    });
    watchInFlightRef.current = { owner, promise: tracked };
    return tracked;
  }, [balance, balanceOwnerId, refresh, clearPrewarmedRewarded]);

  const consumeOptimisticCredit = useCallback((): FlowCreditCategory | null => {
    if (premiumRef.current.hasFullAccess || premiumRef.current.isPremium) {
      return null;
    }
    const current = balanceRef.current;
    if (current.total <= 0) return null;
    let category: FlowCreditCategory | null = null;
    if (current.dailyRemaining > 0) {
      category = 'daily';
    } else if (current.rewarded > 0) {
      category = 'rewarded';
    } else if (current.purchased > 0) {
      category = 'purchased';
    } else {
      return null;
    }
    setBalance((prev) => {
      if (category === 'daily' && prev.dailyRemaining > 0) {
        const next = {
          ...prev,
          dailyRemaining: prev.dailyRemaining - 1,
          total: Math.max(0, prev.total - 1),
        };
        balanceRef.current = next;
        return next;
      }
      if (category === 'rewarded' && prev.rewarded > 0) {
        const next = {
          ...prev,
          rewarded: prev.rewarded - 1,
          total: Math.max(0, prev.total - 1),
        };
        balanceRef.current = next;
        return next;
      }
      if (category === 'purchased' && prev.purchased > 0) {
        const next = {
          ...prev,
          purchased: prev.purchased - 1,
          total: Math.max(0, prev.total - 1),
        };
        balanceRef.current = next;
        return next;
      }
      return prev;
    });
    lastConsumedCategoryRef.current = category;
    setLastConsumedCategory(category);
    return category;
  }, []);

  const rollbackOptimisticCredit = useCallback(() => {
    const category = lastConsumedCategoryRef.current;
    lastConsumedCategoryRef.current = null;
    setLastConsumedCategory(null);
    if (!category) return;
    setBalance((prev) => {
      if (category === 'daily') {
        const next = { ...prev, dailyRemaining: prev.dailyRemaining + 1, total: prev.total + 1 };
        balanceRef.current = next;
        return next;
      }
      if (category === 'rewarded') {
        const next = { ...prev, rewarded: prev.rewarded + 1, total: prev.total + 1 };
        balanceRef.current = next;
        return next;
      }
      if (category === 'purchased') {
        const next = { ...prev, purchased: prev.purchased + 1, total: prev.total + 1 };
        balanceRef.current = next;
        return next;
      }
      return prev;
    });
  }, []);

  const purchase = useCallback(async (product: BillingCreditProduct) => {
    try {
      await billing.purchaseCredits(product);
    } catch {
      // BillingContext records failure details in billing.operation.
    }
  }, [billing]);

  const purchaseStatus = billing.operation ?? IDLE_BILLING_OPERATION;

  const value = useMemo<FlowCreditsContextValue>(() => ({
    // Never render the previous account's credits during the render/effect gap
    // when appUserId changes; the network refresh may still be pending.
    balance: balanceReady ? balance : EMPTY,
    balanceReady,
    loading: loading || !isPremiumResolved,
    unlimited: hasUnlimitedAccess,
    visible,
    rewardState,
    creditProducts: billing.creditProducts,
    purchaseStatus,
    lastConsumedCategory,
    open: () => {
      setRewardState((prev) => (
        prev === 'granted' || prev === 'unavailable' || prev === 'blocked' || prev === 'limit' ? 'idle' : prev
      ));
      void refresh();
      setVisible(true);
    },
    close: () => {
      clearPrewarmedRewarded();
      setVisible(false);
    },
    refresh,
    consumeOptimisticCredit,
    rollbackOptimisticCredit,
    watchRewarded,
    purchase,
  }), [balanceReady, balance, loading, isPremiumResolved, hasUnlimitedAccess, visible, rewardState, billing.creditProducts, purchaseStatus, lastConsumedCategory, clearPrewarmedRewarded, refresh, consumeOptimisticCredit, rollbackOptimisticCredit, watchRewarded, purchase]);

  return <FlowCreditsContext.Provider value={value}>{children}</FlowCreditsContext.Provider>;
}

export function useFlowCredits() {
  return useContext(FlowCreditsContext);
}
