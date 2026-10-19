import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { buildApiUrl } from '../lib/api';
import { showRewardedAdWithSsv, type RewardedAdOutcome } from '../lib/ads/adsService';
import { supabase } from '../supabase';
import { useBilling } from './BillingContext';
import { usePremium } from './PremiumContext';
import type { BillingCreditProduct } from '../lib/billing/types';
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

type RewardState = 'idle' | 'loading' | 'awaiting-server' | 'granted' | 'unavailable' | 'limit';
type FlowCreditsContextValue = {
  balance: FlowCreditsBalance;
  loading: boolean;
  unlimited: boolean;
  visible: boolean;
  rewardState: RewardState;
  creditProducts: BillingCreditProduct[];
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

const FlowCreditsContext = createContext<FlowCreditsContextValue>({
  balance: EMPTY,
  loading: false,
  unlimited: false,
  visible: false,
  rewardState: 'idle',
  creditProducts: [],
  lastConsumedCategory: null,
  open: () => {},
  close: () => {},
  refresh: async () => null,
  consumeOptimisticCredit: () => null,
  rollbackOptimisticCredit: () => {},
  watchRewarded: async () => 'unavailable',
  purchase: async () => {},
});

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

async function authenticatedFetch(path: string, init?: RequestInit, expectedUserId?: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('AUTH_REQUIRED');
  if (expectedUserId && data.session.user.id !== expectedUserId) throw new Error('AUTH_USER_CHANGED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let integrityHeaders: Record<string, string> = {};
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
      integrityHeaders = await getPlayIntegrityHeaders({ method: 'POST', path, body });
    }
    return await fetch(buildApiUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
        ...integrityHeaders,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function FlowCreditsProvider({ children, appUserId }: { children: React.ReactNode; appUserId: string | null }) {
  const billing = useBilling();
  const premium = usePremium();
  const [balance, setBalance] = useState<FlowCreditsBalance>(EMPTY);
  const [balanceOwnerId, setBalanceOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [rewardState, setRewardState] = useState<RewardState>('idle');
  const [lastConsumedCategory, setLastConsumedCategory] = useState<FlowCreditCategory | null>(null);
  const ownerRef = useRef(appUserId);
  const premiumRef = useRef(premium);
  const balanceRef = useRef(balance);
  const lastConsumedCategoryRef = useRef<FlowCreditCategory | null>(null);
  const sequenceRef = useRef(0);
  const rewardOperationRef = useRef(0);
  ownerRef.current = appUserId;
  premiumRef.current = premium;
  balanceRef.current = balance;
  lastConsumedCategoryRef.current = lastConsumedCategory;

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
    balanceRef.current = EMPTY;
    setBalance(EMPTY);
    setBalanceOwnerId(null);
    lastConsumedCategoryRef.current = null;
    setLastConsumedCategory(null);
    setRewardState('idle');
    setVisible(false);
    if (appUserId) void refresh();
  }, [appUserId, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && ownerRef.current) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (billing.operation.status === 'verified') void refresh();
  }, [billing.operation.status, refresh]);

  const watchRewarded = useCallback(async () => {
    const owner = ownerRef.current;
    const operation = ++rewardOperationRef.current;
    const isCurrentOperation = () => Boolean(owner) && ownerRef.current === owner && rewardOperationRef.current === operation;
    const accessBlocksRewardedAds = () => {
      const current = premiumRef.current;
      return current.loading || current.hasFullAccess || current.isPremium;
    };
    const updateState = (state: RewardState) => {
      if (isCurrentOperation()) setRewardState(state);
    };
    const stopIfBlocked = () => {
      if (!isCurrentOperation() || !accessBlocksRewardedAds()) return false;
      updateState('unavailable');
      return true;
    };
    if (!owner || accessBlocksRewardedAds()) return 'unavailable' as const;
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
    updateState('loading');
    try {
      const response = await authenticatedFetch('/rewarded/intents', { method: 'POST', body: '{}' }, owner);
      if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
      if (!response.ok) {
        updateState(response.status === 429 ? 'limit' : 'unavailable');
        return response.status === 429 ? 'limit' as const : 'unavailable' as const;
      }
      const intent = await response.json() as { intentId?: string; ssv?: { userId?: string; customData?: string } };
      if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
      if (!intent.intentId || intent.ssv?.userId !== intent.intentId || !intent.ssv.customData) throw new Error('INVALID_REWARD_INTENT');
      const outcome = await showRewardedAdWithSsv({ intentId: intent.intentId, customData: intent.ssv.customData });
      if (!isCurrentOperation() || stopIfBlocked()) return 'unavailable' as const;
      if (outcome !== 'earned-awaiting-server') {
        updateState(outcome === 'unavailable' ? 'unavailable' : 'idle');
        return outcome;
      }
      updateState('awaiting-server');
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await delay(1_500);
        if (!isCurrentOperation()) return 'unavailable' as const;
        const statusResponse = await authenticatedFetch(`/rewarded/intents/${encodeURIComponent(intent.intentId)}`, undefined, owner);
        if (!isCurrentOperation()) return 'unavailable' as const;
        if (!statusResponse.ok) continue;
        const { status } = await statusResponse.json() as { status?: string };
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
      updateState('unavailable');
      return 'unavailable' as const;
    } catch {
      updateState('unavailable');
      return 'unavailable' as const;
    }
  }, [balance, balanceOwnerId, refresh]);

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
    await billing.purchaseCredits(product);
  }, [billing]);

  const value = useMemo<FlowCreditsContextValue>(() => ({
    // Never render the previous account's credits during the render/effect gap
    // when appUserId changes; the network refresh may still be pending.
    balance: appUserId && balanceOwnerId === appUserId ? balance : EMPTY,
    loading: loading || premium.loading,
    unlimited: premium.hasFullAccess || premium.isPremium,
    visible,
    rewardState,
    creditProducts: billing.creditProducts,
    lastConsumedCategory,
    open: () => setVisible(true),
    close: () => setVisible(false),
    refresh,
    consumeOptimisticCredit,
    rollbackOptimisticCredit,
    watchRewarded,
    purchase,
  }), [appUserId, balance, balanceOwnerId, loading, premium.loading, premium.hasFullAccess, premium.isPremium, visible, rewardState, billing.creditProducts, lastConsumedCategory, refresh, consumeOptimisticCredit, rollbackOptimisticCredit, watchRewarded, purchase]);

  return <FlowCreditsContext.Provider value={value}>{children}</FlowCreditsContext.Provider>;
}

export function useFlowCredits() {
  return useContext(FlowCreditsContext);
}
