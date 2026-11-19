/**
 * AdsContext.tsx — monetizare GetFlow, latura reclame (AdMob) pentru
 * utilizatorii FREE.
 *
 * Contract expus componentelor:
 *  - `recordChatUserMessage()` — se apelează când utilizatorul trimite un mesaj în chat.
 *  - `maybeShowInterstitial('chat')` — se apelează după ce răspunsul AI s-a terminat.
 *    NICIODATĂ nu întrerupe fluxuri critice (meal save, auth, onboarding).
 *    Photo AI nu mai afișează interstițiale; este monetizat prin Flow Credits.
 *    Chat păstrează pragul 15 și cooldown-ul de 10 minute.
 *
 * Utilizatorii Premium / testeri: toate funcțiile devin no-op.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { usePremium } from './PremiumContext';
import {
  evaluateAdEligibility,
  recordChatUserMessage as recordChatUserMessageState,
  type AdGateState,
  type AdSource,
} from '../lib/ads/adGate';
import { hydrateAdGateState, loadAdGateState, saveAdGateState } from '../lib/ads/adGateStore';
import { getAdsRuntimeConfig } from '../lib/ads/adsConfig';
import {
  adsAvailable,
  discardPreloadedInterstitial,
  initializeAdsSdk,
  refreshAdsAfterConsentChange,
  showPreloadedInterstitial,
} from '../lib/ads/adsService';
import {
  resolveAdsConsent,
  getCanRequestAds,
  getPrivacyOptionsRequired,
  showAdsPrivacyOptionsForm,
} from '../lib/ads/adsConsent';

type AdsContextValue = {
  recordSuccessfulPhotoAnalysis: () => void;
  recordChatUserMessage: () => void;
  maybeShowInterstitial: (source?: AdSource) => void;
  privacyOptionsRequired: boolean;
  showPrivacyOptions: () => Promise<boolean>;
};

const noopAdsContext: AdsContextValue = {
  recordSuccessfulPhotoAnalysis: () => {},
  recordChatUserMessage: () => {},
  maybeShowInterstitial: () => {},
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => false,
};

const AdsContext = createContext<AdsContextValue>(noopAdsContext);

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}

export function AdsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string | null;
}) {
  const { hasFullAccess, loading: premiumLoading } = usePremium();
  const isPremiumResolved = !premiumLoading;
  const scopeKey = userId || 'anon';
  const stateRef = useRef<AdGateState>(loadAdGateState(scopeKey));
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(() => getPrivacyOptionsRequired());
  const runtimeConfig = useMemo(
    () => getAdsRuntimeConfig(Platform.OS === 'ios' ? 'ios' : 'android'),
    [],
  );

  // Contul curent s-a schimbat (login/logout pe același dispozitiv) + hidratare asincronă cold-start (P1-06)
  useEffect(() => {
    let activ = true;
    stateRef.current = loadAdGateState(scopeKey);
    discardPreloadedInterstitial();
    void hydrateAdGateState(scopeKey).then((hydrated) => {
      if (activ) {
        stateRef.current = hydrated;
      }
    });
    return () => {
      activ = false;
    };
  }, [scopeKey]);

  // Consimțământ + inițializare SDK: DOAR pentru utilizatori non-premium.
  // P1-06: Include scopeKey în dependințe ca după switch de cont sau expirare abonament
  // (hasFullAccess true -> false), interstițialul să fie re-preîncărcat.
  useEffect(() => {
    if (!isPremiumResolved || hasFullAccess || !adsAvailable) {
      if (hasFullAccess) {
        discardPreloadedInterstitial();
      }
      return;
    }
    let activ = true;
    (async () => {
      const res = await resolveAdsConsent();
      if (!activ) return;
      setPrivacyOptionsRequired(res.privacyOptionsRequired);
      if (res.canRequestAds) {
        await initializeAdsSdk();
      }
    })();
    return () => {
      activ = false;
      discardPreloadedInterstitial();
    };
  }, [isPremiumResolved, hasFullAccess, scopeKey]);

  const showPrivacyOptions = useCallback(async () => {
    const success = await showAdsPrivacyOptionsForm();
    setPrivacyOptionsRequired(getPrivacyOptionsRequired());
    await refreshAdsAfterConsentChange();
    return success;
  }, []);

  const recordSuccessfulPhotoAnalysis = useCallback(() => {
    // Compatibilitate temporară pentru consumatori vechi: Photo nu mai
    // incrementează și nu mai poate declanșa interstițiale.
  }, []);

  const recordChatUserMessage = useCallback(() => {
    if (hasFullAccess) return;
    stateRef.current = recordChatUserMessageState(stateRef.current);
    saveAdGateState(scopeKey, stateRef.current);
  }, [hasFullAccess, scopeKey]);

  const maybeShowInterstitial = useCallback(
    (source: AdSource = 'chat') => {
      if (source !== 'chat') return;
      if (hasFullAccess || !adsAvailable) return;
      const decizie = evaluateAdEligibility(stateRef.current, {
        hasFullAccess,
        nowMs: Date.now(),
        source,
        everyN: runtimeConfig.everyNChatMessages,
        minIntervalSeconds: Math.max(runtimeConfig.minAdIntervalSeconds, 600),
      });
      if (!decizie.eligible) return;
      if (hasFullAccess) return;
      // P1-06: Aplicăm nextStateIfAttempted (reset contor + cooldown 10 min) DOAR
      // dacă reclama preîncărcată a fost efectiv afișată.
      const shown = showPreloadedInterstitial();
      if (!shown) return;
      stateRef.current = decizie.nextStateIfAttempted;
      saveAdGateState(scopeKey, stateRef.current);
    },
    [hasFullAccess, scopeKey, runtimeConfig.everyNChatMessages, runtimeConfig.minAdIntervalSeconds],
  );

  const value = useMemo<AdsContextValue>(
    () => ({
      recordSuccessfulPhotoAnalysis,
      recordChatUserMessage,
      maybeShowInterstitial,
      privacyOptionsRequired,
      showPrivacyOptions,
    }),
    [
      recordSuccessfulPhotoAnalysis,
      recordChatUserMessage,
      maybeShowInterstitial,
      privacyOptionsRequired,
      showPrivacyOptions,
    ],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}
