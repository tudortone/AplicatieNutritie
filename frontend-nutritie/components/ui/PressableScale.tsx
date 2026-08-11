import React, { useCallback } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Primitivă de apăsare cu scale-down subtil (0.95, ~130ms) și revenire cu un
// overshoot minim (withSequence), totul gated pe Reduce Motion + haptic opțional
// (opt-in). Folosită de workstream-urile UI în loc de Pressable simplu.
const SCALE_PRESSED = 0.95; // în intervalul țintă 0.96–0.93
const SCALE_OVERSHOOT = 0.01;
const DURATION_PRESS_MS = 130;
const DURATION_OVERSHOOT_MS = 70;
const DURATION_SETTLE_MS = 80;

export interface PressableScaleProps {
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityLabel?: PressableProps['accessibilityLabel'];
  accessibilityState?: PressableProps['accessibilityState'];
  /** Opt-in: impact haptic la apăsare (Light/Medium). Dezactivat cu Reduce Motion. */
  haptic?: boolean;
  hapticStyle?: 'light' | 'medium';
  testID?: PressableProps['testID'];
}

export function PressableScale({
  onPress,
  disabled = false,
  hitSlop,
  style,
  children,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  haptic = false,
  hapticStyle = 'light',
  testID,
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ scale: 1 }] };
    return { transform: [{ scale: scale.value }] };
  });

  const fireHaptic = useCallback(() => {
    if (!haptic || disabled || reduceMotion) return;
    const styleValue =
      hapticStyle === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(styleValue).catch(() => {});
  }, [haptic, hapticStyle, disabled, reduceMotion]);

  const handlePressIn = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withTiming(SCALE_PRESSED, { duration: DURATION_PRESS_MS });
    fireHaptic();
  }, [reduceMotion, scale, fireHaptic]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSequence(
      withTiming(1 + SCALE_OVERSHOOT, { duration: DURATION_OVERSHOOT_MS }),
      withTiming(1, { duration: DURATION_SETTLE_MS }),
    );
  }, [reduceMotion, scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      testID={testID}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}