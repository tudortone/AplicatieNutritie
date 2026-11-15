import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type SpotlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SpotlightStep = {
  key: string;
  title: string;
  body: string;
  actionHint?: string;
  targetRect: SpotlightRect | null;
  borderRadius?: number;
  canTapTarget?: boolean;
  preferredCardPosition?: 'below' | 'above' | 'auto';
  onTargetPress?: () => void;
};

type SpotlightTourOverlayProps = {
  visible: boolean;
  steps: SpotlightStep[];
  stepIndex: number;
  bottomReserve?: number;
  transitioning?: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
};

const SCRIM_COLOR = 'rgba(5, 8, 12, 0.58)';
const SCRIM_TRANSITION_COLOR = 'rgba(5, 8, 12, 0.46)';
const CUTOUT_PAD = 6;
const TOOLTIP_ESTIMATED_HEIGHT = 248;
const CARD_GAP = 12;
const MORPH_MS = 250;
const FADE_MS = 180;
const SWIPE_MS = 230;
const SMOOTH_EASING =
  typeof Easing?.out === 'function'
    ? Easing.out(Easing.cubic ?? Easing.ease)
    : undefined;
const ANDROID_BLUR_PROPS =
  Platform.OS === 'android'
    ? ({ experimentalBlurMethod: 'dimezisBlurView', blurReductionFactor: 4 } as const)
    : ({} as const);

function DefocusedScrimPane({
  style,
  transition = false,
  testID,
}: {
  style: any;
  transition?: boolean;
  testID?: string;
}) {
  return (
    <Animated.View
      testID={testID}
      pointerEvents={transition ? 'auto' : 'box-none'}
      style={[styles.scrimPane, style]}
    >
      <BlurView
        intensity={transition ? 22 : 26}
        tint="dark"
        {...ANDROID_BLUR_PROPS}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          transition ? styles.scrimTintTransition : styles.scrimTint,
        ]}
      />
    </Animated.View>
  );
}

export function SpotlightTourOverlay({
  visible,
  steps,
  stepIndex,
  bottomReserve = 0,
  transitioning = false,
  onNext,
  onBack,
  onSkip,
  onFinish,
}: SpotlightTourOverlayProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  const hostRef = useRef<View>(null);
  const [hostOffset, setHostOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hostSize, setHostSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [cardHeight, setCardHeight] = useState<number>(TOOLTIP_ESTIMATED_HEIGHT);

  const viewportW = hostSize.width > 0 ? hostSize.width : winWidth;
  const viewportH = hostSize.height > 0 ? hostSize.height : winHeight;

  const pulse = useSharedValue(0);
  const animX = useSharedValue(0);
  const animY = useSharedValue(0);
  const animW = useSharedValue(0);
  const animH = useSharedValue(0);
  const animR = useSharedValue(20);
  const cutOpacity = useSharedValue(0);
  const cardAnimTop = useSharedValue(Math.max(40, (viewportH - TOOLTIP_ESTIMATED_HEIGHT) / 2));
  const cardAnimOpacity = useSharedValue(1);
  const slideX = useSharedValue(0);
  const dragX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const hasCutoutSyncedRef = useRef(false);
  const hasCardPlacedRef = useRef(false);
  const prevStepIndexRef = useRef(0);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (!visible || reduceMotion) {
      if (typeof cancelAnimation === 'function') cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1250 }), -1, true);
    return () => {
      if (typeof cancelAnimation === 'function') cancelAnimation(pulse);
      pulse.value = 0;
    };
  }, [pulse, reduceMotion, visible]);

  const haloPulseStyle = useAnimatedStyle(() => ({
    opacity: (0.65 + pulse.value * 0.35) * cutOpacity.value,
    transform: [{ scale: 1 + pulse.value * 0.012 }],
  }));

  const measureHost = useCallback(() => {
    hostRef.current?.measureInWindow?.((hx, hy) => {
      if (Number.isFinite(hx) && Number.isFinite(hy)) {
        setHostOffset((prev) =>
          Math.abs(prev.x - hx) < 0.5 && Math.abs(prev.y - hy) < 0.5
            ? prev
            : { x: hx, y: hy },
        );
      }
    });
  }, []);

  const handleHostLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        setHostSize((prev) =>
          Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
            ? prev
            : { width, height },
        );
      }
      measureHost();
    },
    [measureHost],
  );

  const handleCardLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 40) {
      setCardHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h));
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    measureHost();
    const id = setTimeout(measureHost, 32);
    return () => clearTimeout(id);
  }, [visible, stepIndex, winWidth, winHeight, measureHost]);

  const safeStepIndex = Math.min(Math.max(stepIndex, 0), Math.max(steps.length - 1, 0));
  const step = steps[safeStepIndex];
  const sectionLabel = (step as (SpotlightStep & { sectionLabel?: string }) | undefined)?.sectionLabel;
  const isFirst = safeStepIndex === 0;
  const isLast = safeStepIndex >= steps.length - 1;

  const cutout = useMemo(() => {
    if (transitioning) return null;
    const raw = step?.targetRect;
    if (!raw || raw.width <= 0 || raw.height <= 0) return null;

    const sideMargin = 8;
    const rawLeft = raw.x - hostOffset.x - CUTOUT_PAD;
    const rawTop = raw.y - hostOffset.y - CUTOUT_PAD;
    const left = Math.max(sideMargin, rawLeft);
    const top = Math.max(0, rawTop);
    const rightLimit = Math.max(left, viewportW - sideMargin);
    const width = Math.max(
      0,
      Math.min(raw.width + CUTOUT_PAD * 2 - Math.max(0, sideMargin - rawLeft), rightLimit - left),
    );
    const height = Math.max(
      0,
      Math.min(raw.height + CUTOUT_PAD * 2 - Math.max(0, -rawTop), viewportH - top),
    );
    if (width <= 0 || height <= 0) return null;

    const radius = (step?.borderRadius ?? 20) + 4;
    return { left, top, width, height, radius };
  }, [transitioning, step, hostOffset.x, hostOffset.y, viewportW, viewportH]);

  const cardPlacement = useMemo(() => {
    const topSafe = Math.max(insets.top, 24) + 12;
    const bottomSafe = Math.max(insets.bottom, 16) + 12 + bottomReserve;
    const cardWidth = Math.min(viewportW - 32, 420);
    const cardLeft = Math.max(16, (viewportW - cardWidth) / 2);
    const measuredH = Math.max(140, Math.min(cardHeight, viewportH - topSafe - bottomSafe));

    if (!cutout) {
      const centerTop = Math.max(
        topSafe,
        Math.min(
          topSafe + Math.max(0, viewportH - topSafe - bottomSafe - measuredH) / 2,
          viewportH - bottomSafe - measuredH,
        ),
      );
      return {
        cardWidth,
        cardLeft,
        top: centerTop,
        arrowSide: 'none' as const,
        arrowLeft: cardWidth / 2 - 8,
      };
    }

    const spaceBelow = viewportH - bottomSafe - (cutout.top + cutout.height + CARD_GAP);
    const spaceAbove = cutout.top - topSafe - CARD_GAP;
    const pref = step?.preferredCardPosition ?? 'auto';
    const placeBelow =
      pref === 'below'
        ? spaceBelow >= measuredH || spaceBelow >= spaceAbove
        : pref === 'above'
          ? !(spaceAbove >= measuredH || spaceAbove >= spaceBelow)
          : spaceBelow >= measuredH || spaceBelow >= spaceAbove;

    const targetCenterX = cutout.left + cutout.width / 2;
    const arrowLeft = Math.min(Math.max(targetCenterX - cardLeft - 8, 22), cardWidth - 38);
    const maxCardTop = Math.max(topSafe, viewportH - bottomSafe - measuredH);

    if (placeBelow) {
      const idealTop = cutout.top + cutout.height + CARD_GAP;
      const top = Math.max(topSafe, Math.min(idealTop, maxCardTop));
      const overlapsTarget = top < cutout.top + cutout.height - 2;
      return {
        cardWidth,
        cardLeft,
        top,
        arrowSide: overlapsTarget ? ('none' as const) : ('top' as const),
        arrowLeft,
      };
    }

    const idealAboveTop = cutout.top - CARD_GAP - measuredH;
    const top = Math.max(topSafe, Math.min(idealAboveTop, maxCardTop));
    const overlapsTarget = top + measuredH > cutout.top + 2;
    return {
      cardWidth,
      cardLeft,
      top,
      arrowSide: overlapsTarget ? ('none' as const) : ('bottom' as const),
      arrowLeft,
    };
  }, [
    insets.top,
    insets.bottom,
    bottomReserve,
    viewportW,
    viewportH,
    cardHeight,
    cutout,
    step?.preferredCardPosition,
  ]);

  useEffect(() => {
    if (!visible) {
      hasCutoutSyncedRef.current = false;
      hasCardPlacedRef.current = false;
      cutOpacity.value = 0;
      cardAnimOpacity.value = 1;
      return;
    }

    if (!cutout) {
      if (transitioning) {
        hasCutoutSyncedRef.current = false;
      }
      const timingFade = SMOOTH_EASING
        ? { duration: reduceMotion ? 0 : 120, easing: SMOOTH_EASING }
        : { duration: reduceMotion ? 0 : 120 };
      cutOpacity.value = withTiming(0, timingFade);
      cardAnimOpacity.value = reduceMotion ? 1 : withTiming(0.75, timingFade);
      const fallbackTimer = setTimeout(() => {
        cardAnimTop.value = cardPlacement.top;
        cardAnimOpacity.value = withTiming(1, { duration: reduceMotion ? 0 : FADE_MS });
      }, reduceMotion ? 0 : 520);
      return () => clearTimeout(fallbackTimer);
    }

    const timingMorph = SMOOTH_EASING
      ? { duration: reduceMotion ? 0 : MORPH_MS, easing: SMOOTH_EASING }
      : { duration: reduceMotion ? 0 : MORPH_MS };
    const timingFadeIn = SMOOTH_EASING
      ? { duration: reduceMotion ? 0 : FADE_MS, easing: SMOOTH_EASING }
      : { duration: reduceMotion ? 0 : FADE_MS };

    if (!hasCutoutSyncedRef.current || reduceMotion) {
      animX.value = cutout.left;
      animY.value = cutout.top;
      animW.value = cutout.width;
      animH.value = cutout.height;
      animR.value = cutout.radius;
      hasCutoutSyncedRef.current = true;
    } else {
      animX.value = withTiming(cutout.left, timingMorph);
      animY.value = withTiming(cutout.top, timingMorph);
      animW.value = withTiming(cutout.width, timingMorph);
      animH.value = withTiming(cutout.height, timingMorph);
      animR.value = withTiming(cutout.radius, timingMorph);
    }
    cutOpacity.value = reduceMotion ? 1 : withTiming(1, timingFadeIn);

    if (!hasCardPlacedRef.current || reduceMotion) {
      cardAnimTop.value = cardPlacement.top;
      hasCardPlacedRef.current = true;
    } else {
      cardAnimTop.value = withTiming(cardPlacement.top, timingMorph);
    }
    cardAnimOpacity.value = reduceMotion ? 1 : withTiming(1, timingFadeIn);
  }, [
    visible,
    transitioning,
    cutout,
    cardPlacement.top,
    reduceMotion,
    animX,
    animY,
    animW,
    animH,
    animR,
    cutOpacity,
    cardAnimTop,
    cardAnimOpacity,
  ]);

  const topScrimAnimStyle = useAnimatedStyle(() => ({
    top: 0,
    left: 0,
    right: 0,
    height: Math.max(0, animY.value),
  }));
  const bottomScrimAnimStyle = useAnimatedStyle(() => ({
    top: Math.max(0, animY.value + animH.value),
    left: 0,
    right: 0,
    bottom: 0,
  }));
  const leftScrimAnimStyle = useAnimatedStyle(() => ({
    top: Math.max(0, animY.value),
    left: 0,
    width: Math.max(0, animX.value),
    height: Math.max(0, animH.value),
  }));
  const rightScrimAnimStyle = useAnimatedStyle(() => ({
    top: Math.max(0, animY.value),
    left: Math.max(0, animX.value + animW.value),
    right: 0,
    height: Math.max(0, animH.value),
  }));
  const haloOuterAnimStyle = useAnimatedStyle(() => ({
    top: animY.value - 7,
    left: animX.value - 7,
    width: animW.value + 14,
    height: animH.value + 14,
    borderRadius: animR.value + 7,
  }));
  const haloMidAnimStyle = useAnimatedStyle(() => ({
    top: animY.value - 3,
    left: animX.value - 3,
    width: animW.value + 6,
    height: animH.value + 6,
    borderRadius: animR.value + 3,
    opacity: cutOpacity.value,
  }));
  const haloInnerAnimStyle = useAnimatedStyle(() => ({
    top: animY.value,
    left: animX.value,
    width: animW.value,
    height: animH.value,
    borderRadius: animR.value,
    opacity: cutOpacity.value,
  }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    top: cardAnimTop.value,
    opacity: cardAnimOpacity.value,
  }));
  const cardSwipeContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateX: slideX.value + dragX.value }],
  }));

  // Trigger horizontal swipe animation strictly ONCE per step transition (not on async cutout settle)
  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      slideX.value = 0;
      dragX.value = 0;
      contentOpacity.value = 1;
      return;
    }
    if (!wasVisibleRef.current) {
      wasVisibleRef.current = true;
      prevStepIndexRef.current = safeStepIndex;
      slideX.value = 0;
      dragX.value = 0;
      contentOpacity.value = 1;
      return;
    }
    if (prevStepIndexRef.current === safeStepIndex) return;
    const direction = safeStepIndex > prevStepIndexRef.current ? 1 : -1;
    prevStepIndexRef.current = safeStepIndex;
    dragX.value = 0;
    if (reduceMotion) {
      slideX.value = 0;
      contentOpacity.value = 1;
      return;
    }
    const timingSwipe = SMOOTH_EASING
      ? { duration: SWIPE_MS, easing: SMOOTH_EASING }
      : { duration: SWIPE_MS };
    slideX.value = direction * 44;
    contentOpacity.value = 0.25;
    slideX.value = withTiming(0, timingSwipe);
    contentOpacity.value = withTiming(1, timingSwipe);
  }, [visible, safeStepIndex, reduceMotion, slideX, dragX, contentOpacity]);

  const handleNext = useCallback(() => {
    try { void Haptics.selectionAsync(); } catch {}
    if (isLast) onFinish();
    else onNext();
  }, [isLast, onFinish, onNext]);

  const handleBack = useCallback(() => {
    try { void Haptics.selectionAsync(); } catch {}
    onBack();
  }, [onBack]);

  const handleSkip = useCallback(() => {
    try { void Haptics.selectionAsync(); } catch {}
    onSkip();
  }, [onSkip]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleSkip();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleSkip]);

  const swipeStateRef = useRef({
    isFirst,
    isLast,
    reduceMotion,
    handleNext,
    handleBack,
  });
  swipeStateRef.current = { isFirst, isLast, reduceMotion, handleNext, handleBack };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 16 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.4,
        onPanResponderMove: (_, gs) => {
          if (swipeStateRef.current.reduceMotion) return;
          dragX.value = Math.max(-68, Math.min(68, gs.dx * 0.35));
        },
        onPanResponderRelease: (_, gs) => {
          const { isFirst: first, isLast: last, reduceMotion: reduced, handleNext: next, handleBack: back } =
            swipeStateRef.current;
          dragX.value = reduced ? 0 : withTiming(0, { duration: 150 });
          if ((gs.dx < -44 || gs.vx < -0.45) && !last) {
            next();
          } else if ((gs.dx > 44 || gs.vx > 0.45) && !first) {
            back();
          }
        },
        onPanResponderTerminate: () => {
          dragX.value = swipeStateRef.current.reduceMotion
            ? 0
            : withTiming(0, { duration: 150 });
        },
      }),
    [dragX],
  );

  if (!visible || !step) return null;

  const handleTargetPress = () => {
    try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (step.onTargetPress) {
      step.onTargetPress();
      return;
    }
    if (isLast) onFinish();
    else onNext();
  };

  return (
    <View
      ref={hostRef}
      onLayout={handleHostLayout}
      style={styles.overlayRoot}
      pointerEvents="auto"
      accessibilityViewIsModal
      testID="spotlight-tour-overlay"
    >
      {cutout ? (
        <>
          {/* 4-pane defocused obsidian scrim keeping the highlighted control 100% sharp */}
          <DefocusedScrimPane
            style={[{ top: 0, left: 0, right: 0, height: cutout.top }, topScrimAnimStyle]}
          />
          <DefocusedScrimPane
            style={[
              { top: cutout.top + cutout.height, left: 0, right: 0, bottom: 0 },
              bottomScrimAnimStyle,
            ]}
          />
          <DefocusedScrimPane
            style={[
              { top: cutout.top, left: 0, width: cutout.left, height: cutout.height },
              leftScrimAnimStyle,
            ]}
          />
          <DefocusedScrimPane
            style={[
              { top: cutout.top, left: cutout.left + cutout.width, right: 0, height: cutout.height },
              rightScrimAnimStyle,
            ]}
          />

          {/* Layered luminous light band around the highlighted target (zero interior tint/shadow) */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.haloOuter,
              {
                top: cutout.top - 7,
                left: cutout.left - 7,
                width: cutout.width + 14,
                height: cutout.height + 14,
                borderRadius: cutout.radius + 7,
                borderColor: colors.accent + '24',
                ...(Platform.OS === 'ios' ? { shadowColor: colors.accent } : {}),
              },
              haloOuterAnimStyle,
              haloPulseStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.haloMid,
              {
                top: cutout.top - 3,
                left: cutout.left - 3,
                width: cutout.width + 6,
                height: cutout.height + 6,
                borderRadius: cutout.radius + 3,
                borderColor: colors.accent + '58',
              },
              haloMidAnimStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.haloInner,
              {
                top: cutout.top,
                left: cutout.left,
                width: cutout.width,
                height: cutout.height,
                borderRadius: cutout.radius,
                borderColor: colors.accent,
              },
              haloInnerAnimStyle,
            ]}
          />

          <Pressable
            testID={`spotlight-target-${step.key}`}
            onPress={handleTargetPress}
            accessibilityRole="button"
            accessibilityLabel={step.title}
            style={{
              position: 'absolute',
              top: cutout.top,
              left: cutout.left,
              width: cutout.width,
              height: cutout.height,
              borderRadius: cutout.radius,
            }}
          />
        </>
      ) : (
        <DefocusedScrimPane
          testID="spotlight-transition-veil"
          transition
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Coachmark Explanation Card with horizontal swipe transition & gesture */}
      <Animated.View
        testID="spotlight-coach-card"
        onLayout={handleCardLayout}
        {...panResponder.panHandlers}
        style={[
          styles.card,
          {
            width: cardPlacement.cardWidth,
            left: cardPlacement.cardLeft,
            top: cardPlacement.top,
            backgroundColor: colors.surfaceElevated || colors.surface,
            borderColor: colors.accent + '66',
          },
          cardAnimStyle,
        ]}
      >
        {cardPlacement.arrowSide === 'top' && (
          <View
            pointerEvents="none"
            style={[
              styles.arrowTop,
              {
                left: cardPlacement.arrowLeft,
                backgroundColor: colors.surfaceElevated || colors.surface,
                borderColor: colors.accent + '66',
              },
            ]}
          />
        )}
        {cardPlacement.arrowSide === 'bottom' && (
          <View
            pointerEvents="none"
            style={[
              styles.arrowBottom,
              {
                left: cardPlacement.arrowLeft,
                backgroundColor: colors.surfaceElevated || colors.surface,
                borderColor: colors.accent + '66',
              },
            ]}
          />
        )}

        <Animated.View style={cardSwipeContentStyle}>

          <View style={styles.cardHeader}>
            <View style={[styles.stepPill, { backgroundColor: colors.accent + '20' }]}>
              <Text style={[styles.stepPillText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                {t('homeTour.stepCounter', { current: safeStepIndex + 1, total: steps.length })}
              </Text>
            </View>

            {sectionLabel ? (
              <View style={[styles.sectionPill, { backgroundColor: colors.accentSecondary + '18', borderColor: colors.accentSecondary + '40' }]}>
                <Text
                  numberOfLines={1}
                  style={[styles.sectionPillText, { color: colors.accentSecondary }]}
                  maxFontSizeMultiplier={1.2}
                >
                  {sectionLabel}
                </Text>
              </View>
            ) : null}

            <View style={styles.dotsRow}>
              {steps.map((item, idx) => {
                const active = idx === safeStepIndex;
                return (
                  <View
                    key={item.key}
                    style={[
                      styles.dot,
                      {
                        width: active ? (steps.length > 6 ? 10 : 18) : (steps.length > 6 ? 4.5 : 7),
                        backgroundColor: active ? colors.accent : colors.overlayStrong,
                      },
                    ]}
                  />
                );
              })}
            </View>

            <TouchableOpacity
              testID="spotlight-close-btn"
              onPress={handleSkip}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('homeTour.skipA11y')}
              style={[styles.closeIconBtn, { backgroundColor: colors.overlayStrong || 'rgba(255,255,255,0.08)' }]}
            >
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            {step.title}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
            {step.body}
          </Text>

          {step.actionHint ? (
            <View style={[styles.hintBox, { backgroundColor: colors.accentSecondary + '14' }]}>
              <Text style={[styles.hintText, { color: colors.accentSecondary }]} maxFontSizeMultiplier={1.3}>
                {step.actionHint}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            {isFirst ? (
              <TouchableOpacity
                testID="spotlight-skip-btn"
                onPress={handleSkip}
                accessibilityRole="button"
                accessibilityLabel={t('homeTour.skipA11y')}
                style={styles.textActionBtn}
              >
                <Text style={[styles.skipText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('homeTour.skip')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="spotlight-back-btn"
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel={t('homeTour.back')}
                style={styles.backActionBtn}
              >
                <ArrowLeft size={15} color={colors.textSecondary} />
                <Text style={[styles.skipText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('homeTour.back')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              testID="spotlight-next-btn"
              onPress={handleNext}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t('homeTour.finish') : t('homeTour.next')}
              activeOpacity={0.85}
              style={styles.nextBtnWrap}
            >
              <LinearGradient
                colors={Array.isArray(colors.accentGradient) ? colors.accentGradient : [colors.accent, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.nextBtnGrad}
              >
                <Text style={[styles.nextBtnText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>
                  {isLast ? t('homeTour.finish') : t('homeTour.next')}
                </Text>
                {isLast ? (
                  <Check size={16} color={colors.background} strokeWidth={2.6} />
                ) : (
                  <ArrowRight size={16} color={colors.background} strokeWidth={2.6} />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  scrimPane: {
    position: 'absolute',
    overflow: 'hidden',
  },
  scrimTint: {
    backgroundColor: SCRIM_COLOR,
  },
  scrimTintTransition: {
    backgroundColor: SCRIM_TRANSITION_COLOR,
  },
  haloOuter: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Platform.OS === 'ios' ? 0.55 : 0,
    shadowRadius: 16,
  },
  haloMid: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 3,
  },
  haloInner: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  card: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
  },
  arrowTop: {
    position: 'absolute',
    top: -8,
    width: 15,
    height: 15,
    borderLeftWidth: 1.5,
    borderTopWidth: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  arrowBottom: {
    position: 'absolute',
    bottom: -8,
    width: 15,
    height: 15,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stepPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sectionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
  },
  sectionPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingLeft: 2,
    gap: 2.5,
  },
  dot: {
    height: 6,
    borderRadius: 4,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 10,
  },
  hintBox: {
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 14,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textActionBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  backActionBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  skipText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  nextBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  nextBtnGrad: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    gap: 7,
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
});
