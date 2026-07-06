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

interface BouncingDotProps {
  delay: number;
  color?: string;
}

export default function BouncingDot({ delay, color }: BouncingDotProps) {
  const { colors } = useTheme();
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        true
      )
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
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
