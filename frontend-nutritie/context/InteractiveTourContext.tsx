import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { i18nReady } from '../i18n';
import {
  consumePendingHomeTourReplay,
  markHomeTourPromptHandled,
  shouldShowHomeTourPrompt,
  subscribeHomeTourReplay,
} from '../lib/homeTour';
import {
  SpotlightTourOverlay,
  type SpotlightRect,
  type SpotlightStep,
} from '../components/ui/SpotlightTourOverlay';

export type TourHostScreen = 'tabs' | 'pantry';

const usePathnameSafe: () => string =
  typeof usePathname === 'function' ? usePathname : () => '/';

export type TourStepKey =
  | 'calorie'
  | 'scan'
  | 'hydration'
  | 'homeMuscle'
  | 'journalOverview'
  | 'journalPantryBtn'
  | 'pantryManage'
  | 'pantryRecipes'
  | 'sportMap'
  | 'sportWorkouts'
  | 'coachAi';

export interface TourTargetRegistration {
  targetRef: React.RefObject<View | null>;
  scrollViewRef?: React.RefObject<ScrollView | null>;
  scrollOffsetRef?: { readonly current: number };
  scrollToOffset?: (offset: number, animated: boolean) => void;
  scrollOffsetY?: number;
  fixedRect?: () => SpotlightRect | null;
  onBeforeMeasure?: () => void;
}

export interface TourStep extends SpotlightStep {
  key: TourStepKey;
  host: TourHostScreen;
  route: string;
  routeParams?: Record<string, string>;
  sectionLabel: string;
}

interface TourStepDefinition {
  key: TourStepKey;
  host: TourHostScreen;
  route: string;
  routeParams?: Record<string, string>;
  sectionKey: string;
  titleKey: string;
  bodyKey: string;
  hintKey: string;
  borderRadius: number;
  canTapTarget: boolean;
  preferredCardPosition?: 'below' | 'above' | 'auto';
}

const TOUR_STEP_DEFINITIONS: readonly TourStepDefinition[] = [
  {
    key: 'calorie',
    host: 'tabs',
    route: '/(tabs)',
    sectionKey: 'homeTour.phases.home',
    titleKey: 'homeTour.steps.calorieTitle',
    bodyKey: 'homeTour.steps.calorieBody',
    hintKey: 'homeTour.steps.calorieHint',
    borderRadius: 32,
    canTapTarget: true,
  },
  {
    key: 'scan',
    host: 'tabs',
    route: '/(tabs)',
    sectionKey: 'homeTour.phases.home',
    titleKey: 'homeTour.steps.scanTitle',
    bodyKey: 'homeTour.steps.scanBody',
    hintKey: 'homeTour.steps.scanHint',
    borderRadius: 24,
    canTapTarget: true,
  },
  {
    key: 'hydration',
    host: 'tabs',
    route: '/(tabs)',
    sectionKey: 'homeTour.phases.home',
    titleKey: 'homeTour.steps.hydrationTitle',
    bodyKey: 'homeTour.steps.hydrationBody',
    hintKey: 'homeTour.steps.hydrationHint',
    borderRadius: 24,
    canTapTarget: true,
  },
  {
    key: 'homeMuscle',
    host: 'tabs',
    route: '/(tabs)',
    sectionKey: 'homeTour.phases.home',
    titleKey: 'homeTour.steps.homeMuscleTitle',
    bodyKey: 'homeTour.steps.homeMuscleBody',
    hintKey: 'homeTour.steps.homeMuscleHint',
    borderRadius: 24,
    canTapTarget: true,
  },
  {
    key: 'journalOverview',
    host: 'tabs',
    route: '/(tabs)/istoric',
    sectionKey: 'homeTour.phases.journal',
    titleKey: 'homeTour.steps.journalOverviewTitle',
    bodyKey: 'homeTour.steps.journalOverviewBody',
    hintKey: 'homeTour.steps.journalOverviewHint',
    borderRadius: 28,
    canTapTarget: true,
  },
  {
    key: 'journalPantryBtn',
    host: 'tabs',
    route: '/(tabs)/istoric',
    sectionKey: 'homeTour.phases.journal',
    titleKey: 'homeTour.steps.journalPantryTitle',
    bodyKey: 'homeTour.steps.journalPantryBody',
    hintKey: 'homeTour.steps.journalPantryHint',
    borderRadius: 16,
    canTapTarget: true,
    preferredCardPosition: 'below',
  },
  {
    key: 'pantryManage',
    host: 'pantry',
    route: '/scanner-barcode',
    routeParams: { tab: 'camara', tour: '1' },
    sectionKey: 'homeTour.phases.pantry',
    titleKey: 'homeTour.steps.pantryManageTitle',
    bodyKey: 'homeTour.steps.pantryManageBody',
    hintKey: 'homeTour.steps.pantryManageHint',
    borderRadius: 18,
    canTapTarget: true,
    preferredCardPosition: 'below',
  },
  {
    key: 'pantryRecipes',
    host: 'pantry',
    route: '/scanner-barcode',
    routeParams: { tab: 'camara', tour: '1' },
    sectionKey: 'homeTour.phases.pantry',
    titleKey: 'homeTour.steps.pantryRecipesTitle',
    bodyKey: 'homeTour.steps.pantryRecipesBody',
    hintKey: 'homeTour.steps.pantryRecipesHint',
    borderRadius: 16,
    canTapTarget: true,
    preferredCardPosition: 'below',
  },
  {
    key: 'sportMap',
    host: 'tabs',
    route: '/(tabs)/antrenamente',
    sectionKey: 'homeTour.phases.sport',
    titleKey: 'homeTour.steps.sportMapTitle',
    bodyKey: 'homeTour.steps.sportMapBody',
    hintKey: 'homeTour.steps.sportMapHint',
    borderRadius: 24,
    canTapTarget: true,
  },
  {
    key: 'sportWorkouts',
    host: 'tabs',
    route: '/(tabs)/antrenamente',
    sectionKey: 'homeTour.phases.sport',
    titleKey: 'homeTour.steps.sportWorkoutsTitle',
    bodyKey: 'homeTour.steps.sportWorkoutsBody',
    hintKey: 'homeTour.steps.sportWorkoutsHint',
    borderRadius: 18,
    canTapTarget: true,
  },
  {
    key: 'coachAi',
    host: 'tabs',
    route: '/(tabs)/chat',
    sectionKey: 'homeTour.phases.coach',
    titleKey: 'homeTour.steps.coachTitle',
    bodyKey: 'homeTour.steps.coachBody',
    hintKey: 'homeTour.steps.coachHint',
    borderRadius: 24,
    canTapTarget: false,
    preferredCardPosition: 'above',
  },
];

function isOnStepRoute(pathname: string, targetRoute: string): boolean {
  const normalized = (pathname || '/').replace(/^\/\(tabs\)/, '') || '/';
  if (targetRoute === '/(tabs)') {
    return normalized === '/' || normalized === '/index';
  }
  const cleanTarget = targetRoute.replace(/^\/\(tabs\)/, '');
  return normalized === cleanTarget;
}

function rectsCloseEnough(a: SpotlightRect | undefined, b: SpotlightRect, threshold = 4): boolean {
  if (!a) return false;
  return (
    Math.abs(a.x - b.x) < threshold &&
    Math.abs(a.y - b.y) < threshold &&
    Math.abs(a.width - b.width) < threshold &&
    Math.abs(a.height - b.height) < threshold
  );
}

export interface InteractiveTourContextValue {
  hasProvider: boolean;
  tourVisible: boolean;
  tourStepIndex: number;
  tourSteps: TourStep[];
  tourTransitioning: boolean;
  showTourInvite: boolean;
  startTour: (userId?: string) => void;
  dismissTourInvite: (userId?: string) => void;
  closeTour: (reason: 'skipped' | 'completed', userId?: string) => void;
  goToStep: (nextIndex: number) => void;
  evaluateHomeInvite: (userId?: string, loading?: boolean) => void;
  consumeReplayIfPending: (userId?: string) => void;
  registerTarget: (key: TourStepKey, reg: TourTargetRegistration) => () => void;
  remeasureActiveStep: () => void;
}

const InteractiveTourContext = createContext<InteractiveTourContextValue | null>(null);

/**
 * Shared state controller driving the 11-step Option B guided tour across
 * Home, Journal, Pantry, Workouts, and AI Coach.
 */
export function useInteractiveTourController(
  defaultUserId?: string,
  hasProvider = true,
  enabled = true,
): InteractiveTourContextValue {
  const { t: rawT, i18n } = useTranslation();
  const t = useCallback(
    (key: string) => (typeof rawT === 'function' ? rawT(key) : key),
    [rawT],
  );
  const currentLang = i18n?.language;
  const router = useRouter();
  const pathname = usePathnameSafe();
  const reduceMotion = useReducedMotion();
  const { screenWidth, screenHeight, tabBarHeight } = useResponsiveLayout();
  const winDims = useWindowDimensions();
  const effectiveScreenHeight = screenHeight || winDims.height || 800;
  const effectiveTabReserve = Math.max(tabBarHeight || 0, 74);

  const [tourVisible, setTourVisible] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourTransitioning, setTourTransitioning] = useState(false);
  const [showTourInvite, setShowTourInvite] = useState(false);
  const [tourRects, setTourRects] = useState<Partial<Record<TourStepKey, SpotlightRect>>>({});

  const activeUserIdRef = useRef<string | undefined>(defaultUserId);
  activeUserIdRef.current = defaultUserId;
  const mountedRef = useRef(true);
  const tourVisibleRef = useRef(tourVisible);
  tourVisibleRef.current = tourVisible;
  const tourStepIndexRef = useRef(tourStepIndex);
  tourStepIndexRef.current = tourStepIndex;
  const targetsRef = useRef<Partial<Record<TourStepKey, TourTargetRegistration>>>({});
  const measureTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureTokenRef = useRef(0);
  const prevViewportRef = useRef({ w: screenWidth, h: effectiveScreenHeight });
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const clearTimers = useCallback(() => {
    measureTokenRef.current += 1;
    while (measureTimersRef.current.length > 0) {
      const id = measureTimersRef.current.pop();
      if (id) clearTimeout(id);
    }
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const measureStepByIndex = useCallback(
    (
      index: number,
      opts?: { initialDelayMs?: number; allowScroll?: boolean } | boolean,
    ) => {
      for (let i = measureTimersRef.current.length - 1; i >= 0; i -= 1) {
        clearTimeout(measureTimersRef.current[i]);
      }
      measureTimersRef.current = [];
      const token = (measureTokenRef.current += 1);

      const allowScroll =
        typeof opts === 'boolean' ? opts : (opts?.allowScroll ?? true);
      const initialDelayMs =
        typeof opts === 'object' && typeof opts?.initialDelayMs === 'number'
          ? opts.initialDelayMs
          : 24;

      const def = TOUR_STEP_DEFINITIONS[index];
      if (!def) return;
      const stepKey = def.key;

      const scheduleTimer = (fn: () => void, ms: number) => {
        const timer = setTimeout(() => {
          if (mountedRef.current && measureTokenRef.current === token) {
            fn();
          }
        }, ms);
        measureTimersRef.current.push(timer);
      };

      const commitRect = (rect: SpotlightRect, threshold = 4) => {
        setTourRects((prev) =>
          rectsCloseEnough(prev[stepKey], rect, threshold) ? prev : { ...prev, [stepKey]: rect },
        );
        setTourTransitioning(false);
      };

      const readNodeRect = (
        cb: (rect: SpotlightRect) => void,
      ) => {
        const latestReg = targetsRef.current[stepKey];
        if (!latestReg) return;

        if (latestReg.fixedRect) {
          const rect = latestReg.fixedRect();
          if (rect && rect.width > 0 && rect.height > 0) cb(rect);
          return;
        }

        const node = latestReg.targetRef.current;
        if (!node || typeof node.measureInWindow !== 'function') return;
        node.measureInWindow((x, y, width, height) => {
          if (!mountedRef.current || measureTokenRef.current !== token) return;
          if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) return;
          cb({ x, y, width, height });
        });
      };

      const scheduleQuietRecheck = () => {
        scheduleTimer(() => {
          readNodeRect((rect) => {
            commitRect(rect, 6);
          });
        }, 220);
      };

      const attemptFrame = () => {
        const latestReg = targetsRef.current[stepKey];
        if (!latestReg) return;
        latestReg.onBeforeMeasure?.();

        if (latestReg.fixedRect) {
          const rect = latestReg.fixedRect();
          if (rect && rect.width > 0 && rect.height > 0) commitRect(rect, 2);
          return;
        }

        readNodeRect((rawRect) => {
          const scrollFn =
            latestReg.scrollToOffset ??
            (latestReg.scrollViewRef?.current?.scrollTo
              ? (yPos: number, animated: boolean) =>
                  latestReg.scrollViewRef?.current?.scrollTo?.({ y: yPos, animated })
              : null);

          if (!allowScroll || !scrollFn) {
            commitRect(rawRect, 2);
            scheduleQuietRecheck();
            return;
          }

          const safeTop = 94;
          const tabReserve = def.host === 'tabs' ? effectiveTabReserve : 16;
          const safeBottom = Math.max(400, effectiveScreenHeight - tabReserve - 16);
          const availH = Math.max(220, safeBottom - safeTop);
          const minCardRoom = 272;

          const roomBelow = safeBottom - (rawRect.y + rawRect.height);
          const roomAbove = rawRect.y - safeTop;
          const pref = def.preferredCardPosition ?? 'auto';
          const fitsCard =
            pref === 'above'
              ? roomAbove >= minCardRoom
              : pref === 'below'
                ? roomBelow >= minCardRoom
                : Math.max(roomAbove, roomBelow) >= minCardRoom ||
                  rawRect.height > availH - 170;
          const inBounds = rawRect.y >= safeTop && rawRect.y + rawRect.height <= safeBottom;

          if (inBounds && fitsCard) {
            commitRect(rawRect, 2);
            scheduleQuietRecheck();
            return;
          }

          const currentScroll =
            latestReg.scrollOffsetRef?.current ?? latestReg.scrollOffsetY ?? 0;
          let desiredY = safeTop + 14;
          if (pref === 'above') {
            desiredY = Math.max(safeTop + 8, safeBottom - rawRect.height - 16);
          } else if (rawRect.height + minCardRoom <= availH && roomBelow < minCardRoom && roomAbove > roomBelow) {
            desiredY = safeTop + 14;
          } else if (rawRect.height > availH - 120) {
            desiredY = safeTop + 8;
          }

          const delta = rawRect.y - desiredY;
          const targetOffset = Math.max(0, currentScroll + delta);

          if (Math.abs(targetOffset - currentScroll) <= 10) {
            commitRect(rawRect, 2);
            scheduleQuietRecheck();
            return;
          }

          scrollFn(targetOffset, !reduceMotion);
          scheduleTimer(() => {
            readNodeRect((settledRect) => {
              commitRect(settledRect, 2);
              scheduleQuietRecheck();
            });
          }, reduceMotion ? 40 : 320);
        });
      };

      scheduleTimer(attemptFrame, initialDelayMs);
      scheduleTimer(() => {
        setTourTransitioning(false);
      }, initialDelayMs + 550);
    },
    [effectiveScreenHeight, effectiveTabReserve, reduceMotion],
  );

  const navigateToStepRoute = useCallback(
    (def: TourStepDefinition, forceRoute = false) => {
      if (!forceRoute && isOnStepRoute(pathnameRef.current, def.route)) {
        return;
      }

      const pushTarget = () => {
        if (def.routeParams && Object.keys(def.routeParams).length > 0) {
          router.push({ pathname: def.route, params: def.routeParams } as never);
        } else {
          router.push(def.route as never);
        }
      };

      const onPantryModal = pathnameRef.current === '/scanner-barcode';
      if (onPantryModal && def.host !== 'pantry') {
        if (Platform.OS !== 'web' && router.canGoBack?.()) {
          router.back();
          navTimerRef.current = setTimeout(pushTarget, 240);
          return;
        }
      }
      pushTarget();
    },
    [router],
  );

  const startTour = useCallback(
    (userId?: string) => {
      const targetUser = userId ?? activeUserIdRef.current;
      if (targetUser) activeUserIdRef.current = targetUser;
      clearTimers();
      setShowTourInvite(false);
      void markHomeTourPromptHandled(targetUser, 'completed');
      const firstDef = TOUR_STEP_DEFINITIONS[0];
      const onStartRoute = isOnStepRoute(pathnameRef.current, firstDef.route);
      setTourRects({});
      setTourStepIndex(0);
      setTourTransitioning(!onStartRoute);
      setTourVisible(true);
      navigateToStepRoute(firstDef, !onStartRoute);
      measureStepByIndex(0, { initialDelayMs: onStartRoute ? 24 : 150 });
    },
    [clearTimers, measureStepByIndex, navigateToStepRoute],
  );

  const dismissTourInvite = useCallback((userId?: string) => {
    const targetUser = userId ?? activeUserIdRef.current;
    try {
      void Haptics.selectionAsync();
    } catch {}
    setShowTourInvite(false);
    void markHomeTourPromptHandled(targetUser, 'dismissed');
  }, []);

  const closeTour = useCallback(
    (reason: 'skipped' | 'completed', userId?: string) => {
      const targetUser = userId ?? activeUserIdRef.current;
      const curDef = TOUR_STEP_DEFINITIONS[tourStepIndex];
      clearTimers();
      setTourTransitioning(false);
      setTourVisible(false);
      void markHomeTourPromptHandled(targetUser, reason);

      if (reason === 'completed' && curDef?.key === 'coachAi') {
        if (!isOnStepRoute(pathnameRef.current, '/(tabs)')) {
          router.push('/(tabs)' as never);
        }
      }
    },
    [clearTimers, router, tourStepIndex],
  );

  const goToStep = useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), TOUR_STEP_DEFINITIONS.length - 1);
      const prevDef = TOUR_STEP_DEFINITIONS[tourStepIndex];
      const nextDef = TOUR_STEP_DEFINITIONS[clamped];
      const routeChanged =
        prevDef?.route !== nextDef.route || prevDef?.host !== nextDef.host;
      const modalTransition = prevDef?.host !== nextDef.host;

      if (routeChanged) {
        setTourTransitioning(true);
        setTourRects((prev) => ({ ...prev, [nextDef.key]: undefined }));
      }
      setTourStepIndex(clamped);
      navigateToStepRoute(nextDef, routeChanged);
      const initialDelayMs = modalTransition
        ? Platform.OS === 'web'
          ? 60
          : 340
        : routeChanged
          ? 140
          : 16;
      measureStepByIndex(clamped, { initialDelayMs });
    },
    [measureStepByIndex, navigateToStepRoute, tourStepIndex],
  );

  const measureStepByIndexRef = useRef(measureStepByIndex);
  measureStepByIndexRef.current = measureStepByIndex;

  const registerTarget = useCallback((key: TourStepKey, reg: TourTargetRegistration) => {
    targetsRef.current[key] = reg;
    const activeDef = TOUR_STEP_DEFINITIONS[tourStepIndexRef.current];
    if (tourVisibleRef.current && activeDef?.key === key) {
      const initialDelayMs =
        activeDef.host === 'pantry'
          ? Platform.OS === 'web'
            ? 50
            : 300
          : 90;
      measureStepByIndexRef.current(tourStepIndexRef.current, { initialDelayMs });
    }
    return () => {
      if (targetsRef.current[key] === reg) {
        delete targetsRef.current[key];
      }
    };
  }, []);

  const remeasureActiveStep = useCallback(() => {
    if (!tourVisible) return;
    measureStepByIndex(tourStepIndex);
  }, [measureStepByIndex, tourStepIndex, tourVisible]);

  const evaluateHomeInvite = useCallback((userId?: string, loading = false) => {
    if (loading) return;
    if (userId) activeUserIdRef.current = userId;
    void Promise.resolve(i18nReady)
      .catch(() => undefined)
      .then(() => shouldShowHomeTourPrompt(userId))
      .then((shouldShow) => {
        if (mountedRef.current && shouldShow) setShowTourInvite(true);
      });
  }, []);

  const consumeReplayIfPending = useCallback(
    (userId?: string) => {
      if (userId) activeUserIdRef.current = userId;
      if (consumePendingHomeTourReplay()) {
        void Promise.resolve(i18nReady)
          .catch(() => undefined)
          .then(() => {
            if (mountedRef.current) startTour(userId);
          });
      }
    },
    [startTour],
  );

  useEffect(() => {
    if (!enabled) return;
    return subscribeHomeTourReplay(() => {
      if (consumePendingHomeTourReplay()) {
        void Promise.resolve(i18nReady)
          .catch(() => undefined)
          .then(() => {
            if (mountedRef.current) startTour(activeUserIdRef.current);
          });
      }
    });
  }, [enabled, startTour]);

  useEffect(() => {
    if (!enabled) return;
    const prev = prevViewportRef.current;
    const changed = prev.w !== screenWidth || prev.h !== effectiveScreenHeight;
    prevViewportRef.current = { w: screenWidth, h: effectiveScreenHeight };
    if (changed && tourVisible) {
      measureStepByIndex(tourStepIndex, false);
    }
  }, [effectiveScreenHeight, enabled, measureStepByIndex, screenWidth, tourStepIndex, tourVisible]);

  const tourSteps: TourStep[] = useMemo(
    () =>
      TOUR_STEP_DEFINITIONS.map((def, idx) => ({
        key: def.key,
        host: def.host,
        route: def.route,
        routeParams: def.routeParams,
        sectionLabel: t(def.sectionKey),
        title: t(def.titleKey),
        body: t(def.bodyKey),
        actionHint: t(def.hintKey),
        targetRect: tourRects[def.key] ?? null,
        borderRadius: def.borderRadius,
        canTapTarget: def.canTapTarget,
        preferredCardPosition: def.preferredCardPosition,
        onTargetPress: () => {
          if (idx >= TOUR_STEP_DEFINITIONS.length - 1) {
            closeTour('completed');
          } else {
            goToStep(idx + 1);
          }
        },
      })),
    // Depend explicitly on active language so switching onboarding language never leaves stale text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeTour, currentLang, goToStep, t, tourRects],
  );

  return {
    hasProvider,
    tourVisible,
    tourStepIndex,
    tourSteps,
    tourTransitioning,
    showTourInvite,
    startTour,
    dismissTourInvite,
    closeTour,
    goToStep,
    evaluateHomeInvite,
    consumeReplayIfPending,
    registerTarget,
    remeasureActiveStep,
  };
}

export function InteractiveTourProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const value = useInteractiveTourController(userId, true);
  return (
    <InteractiveTourContext.Provider value={value}>
      {children}
    </InteractiveTourContext.Provider>
  );
}

export function useInteractiveTour(): InteractiveTourContextValue | null {
  return useContext(InteractiveTourContext);
}

/**
 * Registers a screen target inside the shared InteractiveTourProvider when mounted.
 */
export function useRegisterTourTarget(
  stepKey: TourStepKey,
  reg: TourTargetRegistration,
  deps: React.DependencyList = [],
  tourOverride?: InteractiveTourContextValue | null,
) {
  const ctx = useContext(InteractiveTourContext);
  const tour = tourOverride ?? ctx;
  const registerTarget = tour?.registerTarget;

  useEffect(() => {
    if (!registerTarget) return;
    return registerTarget(stepKey, reg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerTarget, stepKey, ...deps]);
}

/**
 * Overlay host placed on both RootNavigator (`screen="tabs"`) and the fullScreenModal
 * Pantry screen (`screen="pantry"`) so Android modals stay in the active window.
 */
export function InteractiveTourOverlayHost({
  screen,
  tourOverride,
}: {
  screen: TourHostScreen;
  tourOverride?: InteractiveTourContextValue;
}) {
  const ctx = useContext(InteractiveTourContext);
  const { tabBarHeight } = useResponsiveLayout();
  const tour = tourOverride ?? ctx;
  if (!tour) return null;

  const activeStep = tour.tourSteps[tour.tourStepIndex];
  const visible = tour.tourVisible && activeStep?.host === screen;

  return (
    <SpotlightTourOverlay
      visible={visible}
      steps={tour.tourSteps}
      stepIndex={tour.tourStepIndex}
      bottomReserve={screen === 'tabs' ? Math.max(tabBarHeight || 0, 74) + 8 : 0}
      transitioning={tour.tourTransitioning}
      onNext={() => tour.goToStep(tour.tourStepIndex + 1)}
      onBack={() => tour.goToStep(tour.tourStepIndex - 1)}
      onSkip={() => tour.closeTour('skipped')}
      onFinish={() => tour.closeTour('completed')}
    />
  );
}
