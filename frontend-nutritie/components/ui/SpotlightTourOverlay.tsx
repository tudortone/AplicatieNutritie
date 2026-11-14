import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react-native';
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
  onTargetPress?: () => void;
};

type SpotlightTourOverlayProps = {
  visible: boolean;
  steps: SpotlightStep[];
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
};

const SCRIM_COLOR = 'rgba(5, 8, 12, 0.80)';
const CUTOUT_PAD = 6;
const TOOLTIP_ESTIMATED_HEIGHT = 248;

export function SpotlightTourOverlay({
  visible,
  steps,
  stepIndex,
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

  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!visible || reduceMotion) {
      if (typeof cancelAnimation === 'function') cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1150 }), -1, true);
    return () => {
      if (typeof cancelAnimation === 'function') cancelAnimation(pulse);
      pulse.value = 0;
    };
  }, [pulse, reduceMotion, visible]);

  const haloPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.025 }],
  }));

  const measureHost = useCallback(() => {
    hostRef.current?.measureInWindow?.((hx, hy) => {
      if (Number.isFinite(hx) && Number.isFinite(hy)) {
        setHostOffset((prev) => (prev.x === hx && prev.y === hy ? prev : { x: hx, y: hy }));
      }
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(measureHost, 20);
    return () => clearTimeout(id);
  }, [visible, stepIndex, winWidth, winHeight, measureHost]);

  const safeStepIndex = Math.min(Math.max(stepIndex, 0), Math.max(steps.length - 1, 0));
  const step = steps[safeStepIndex];
  const isFirst = safeStepIndex === 0;
  const isLast = safeStepIndex >= steps.length - 1;

  const cutout = useMemo(() => {
    const raw = step?.targetRect;
    if (!raw || raw.width <= 0 || raw.height <= 0) return null;

    const left = Math.max(0, raw.x - hostOffset.x - CUTOUT_PAD);
    const top = Math.max(0, raw.y - hostOffset.y - CUTOUT_PAD);
    const maxW = Math.max(0, winWidth - left);
    const maxH = Math.max(0, winHeight - top);
    const width = Math.min(raw.width + CUTOUT_PAD * 2, maxW);
    const height = Math.min(raw.height + CUTOUT_PAD * 2, maxH);
    const radius = (step?.borderRadius ?? 20) + 4;
    return { left, top, width, height, radius };
  }, [step, hostOffset.x, hostOffset.y, winWidth, winHeight]);

  const cardPlacement = useMemo(() => {
    const topSafe = Math.max(insets.top, 24) + 12;
    const bottomSafe = Math.max(insets.bottom, 16) + 12;
    const cardWidth = Math.min(winWidth - 32, 420);
    const cardLeft = Math.max(16, (winWidth - cardWidth) / 2);

    if (!cutout) {
      return {
        cardWidth,
        cardLeft,
        top: Math.max(topSafe, (winHeight - TOOLTIP_ESTIMATED_HEIGHT) / 2),
        arrowSide: 'none' as const,
        arrowLeft: cardWidth / 2 - 8,
      };
    }

    const spaceBelow = winHeight - bottomSafe - (cutout.top + cutout.height + 14);
    const spaceAbove = cutout.top - topSafe - 14;
    const placeBelow = spaceBelow >= TOOLTIP_ESTIMATED_HEIGHT || spaceBelow >= spaceAbove;
    const targetCenterX = cutout.left + cutout.width / 2;
    const arrowLeft = Math.min(Math.max(targetCenterX - cardLeft - 8, 22), cardWidth - 38);

    if (placeBelow) {
      const maxTop = Math.max(topSafe, winHeight - bottomSafe - TOOLTIP_ESTIMATED_HEIGHT);
      return {
        cardWidth,
        cardLeft,
        top: Math.min(cutout.top + cutout.height + 14, maxTop),
        arrowSide: 'top' as const,
        arrowLeft,
      };
    }

    const bottom = Math.min(
      Math.max(bottomSafe, winHeight - cutout.top + 14),
      Math.max(bottomSafe, winHeight - topSafe - TOOLTIP_ESTIMATED_HEIGHT),
    );
    return {
      cardWidth,
      cardLeft,
      bottom,
      arrowSide: 'bottom' as const,
      arrowLeft,
    };
  }, [cutout, insets.bottom, insets.top, winHeight, winWidth]);

  if (!visible || !step) return null;

  const handleNext = () => {
    try { void Haptics.selectionAsync(); } catch {}
    if (isLast) onFinish();
    else onNext();
  };

  const handleBack = () => {
    try { void Haptics.selectionAsync(); } catch {}
    onBack();
  };

  const handleSkip = () => {
    try { void Haptics.selectionAsync(); } catch {}
    onSkip();
  };

  const handleTargetPress = () => {
    try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (step.onTargetPress) {
      step.onTargetPress();
      return;
    }
    if (isLast) onFinish();
    else onNext();
  };

  const badgeAboveCutout = cutout ? cutout.top >= Math.max(insets.top, 24) + 28 : true;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <View
        ref={hostRef}
        onLayout={measureHost}
        style={styles.root}
        accessibilityViewIsModal
        testID="spotlight-tour-overlay"
      >
        {cutout ? (
          <>
            {/* 4-pane dark scrim so the highlighted control remains unobscured */}
            <View pointerEvents="box-none" style={[styles.scrimPane, { top: 0, left: 0, right: 0, height: cutout.top }]} />
            <View pointerEvents="box-none" style={[styles.scrimPane, { top: cutout.top + cutout.height, left: 0, right: 0, bottom: 0 }]} />
            <View pointerEvents="box-none" style={[styles.scrimPane, { top: cutout.top, left: 0, width: cutout.left, height: cutout.height }]} />
            <View pointerEvents="box-none" style={[styles.scrimPane, { top: cutout.top, left: cutout.left + cutout.width, right: 0, height: cutout.height }]} />

            {/* Outer pulsing lime halo (static when Reduce Motion is enabled) */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.haloOuter,
                haloPulseStyle,
                {
                  top: cutout.top - 5,
                  left: cutout.left - 5,
                  width: cutout.width + 10,
                  height: cutout.height + 10,
                  borderRadius: cutout.radius + 5,
                  borderColor: colors.accent + '66',
                  shadowColor: colors.accent,
                },
              ]}
            />

            {/* Crisp focus border + direct interactive press target */}
            <View
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

            {step.canTapTarget && (
              <View
                pointerEvents="none"
                style={[
                  styles.tapBadge,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.accent,
                    right: Math.max(16, winWidth - (cutout.left + cutout.width) + 8),
                    top: badgeAboveCutout
                      ? cutout.top - 13
                      : cutout.top + cutout.height - 13,
                  },
                ]}
              >
                <Sparkles size={11} color={colors.accent} />
                <Text style={[styles.tapBadgeText, { color: colors.accent }]} maxFontSizeMultiplier={1.2}>
                  {t('homeTour.tapTargetBadge')}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.scrimPane]} />
        )}

        {/* Coachmark Explanation Card */}
        <View
          testID="spotlight-coach-card"
          style={[
            styles.card,
            {
              width: cardPlacement.cardWidth,
              left: cardPlacement.cardLeft,
              backgroundColor: colors.surfaceElevated || colors.surface,
              borderColor: colors.accent + '66',
              ...(typeof cardPlacement.top === 'number'
                ? { top: cardPlacement.top }
                : { bottom: cardPlacement.bottom }),
            },
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

          <View style={styles.cardHeader}>
            <View style={[styles.stepPill, { backgroundColor: colors.accent + '20' }]}>
              <Text style={[styles.stepPillText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                {t('homeTour.stepCounter', { current: safeStepIndex + 1, total: steps.length })}
              </Text>
            </View>

            <View style={styles.dotsRow}>
              {steps.map((item, idx) => {
                const active = idx === safeStepIndex;
                return (
                  <View
                    key={item.key}
                    style={[
                      styles.dot,
                      {
                        width: active ? 18 : 7,
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
              style={styles.closeIconBtn}
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrimPane: {
    position: 'absolute',
    backgroundColor: SCRIM_COLOR,
  },
  haloOuter: {
    position: 'absolute',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 14,
  },
  haloInner: {
    position: 'absolute',
    borderWidth: 2.5,
  },
  tapBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    elevation: 16,
  },
  tapBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.2,
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
    gap: 8,
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
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  dot: {
    height: 7,
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
