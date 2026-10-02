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
import { loadAdGateState, saveAdGateState } from '../lib/ads/adGateStore';
import { getAdsRuntimeConfig } from '../lib/ads/adsConfig';
import { adsAvailable, initializeAdsSdk, showPreloadedInterstitial } from '../lib/ads/adsService';
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
  const scopeKey = userId || 'anon';
  const stateRef = useRef<AdGateState>(loadAdGateState(scopeKey));
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(() => getPrivacyOptionsRequired());
  const runtimeConfig = useMemo(
    () => getAdsRuntimeConfig(Platform.OS === 'ios' ? 'ios' : 'android'),
    [],
  );

  // Contul curent s-a schimbat (login/logout pe același dispozitiv)
  useEffect(() => {
    stateRef.current = loadAdGateState(scopeKey);
  }, [scopeKey]);

  // Consimțământ + inițializare SDK: DOAR pentru utilizatori non-premium
  useEffect(() => {
    if (premiumLoading || hasFullAccess || !adsAvailable) return;
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
    };
  }, [premiumLoading, hasFullAccess]);

  const showPrivacyOptions = useCallback(async () => {
    const success = await showAdsPrivacyOptionsForm();
    setPrivacyOptionsRequired(getPrivacyOptionsRequired());
    if (getCanRequestAds()) {
      await initializeAdsSdk();
    }
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
      stateRef.current = decizie.nextStateIfAttempted;
      saveAdGateState(scopeKey, stateRef.current);
      showPreloadedInterstitial();
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
