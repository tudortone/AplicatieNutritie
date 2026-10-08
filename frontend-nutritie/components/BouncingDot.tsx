import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface BouncingDotProps {
  delay: number;
  color?: string;
}

export default function BouncingDot({ delay, color }: BouncingDotProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.35);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 450 }),
          withTiming(0.35, { duration: 450 })
        ),
        -1,
        true
      )
    );
  }, [delay, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.typingDot,
        { backgroundColor: color || colors.accentSecondary },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
