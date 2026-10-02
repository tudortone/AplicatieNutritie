import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTheme } from '../../context/ThemeContext';

interface MotionCardEnterProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export const MotionCardEnter: React.FC<MotionCardEnterProps> = ({
  children,
  delay = 0,
  duration = 400,
  style,
}) => {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(duration).delay(delay)}
      style={style}
    >
      {children}
    </Animated.View>
  );
};

interface MotionScreenEnterProps {
  children: React.ReactNode;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export const MotionScreenEnter: React.FC<MotionScreenEnterProps> = ({
  children,
  duration = 350,
  style,
}) => {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View entering={FadeIn.duration(duration)} style={style}>
      {children}
    </Animated.View>
  );
};

interface MotionMacroBarProps {
  progress: number; // 0.0 la 1.0 (sau > 1.0)
  color?: string;
  backgroundColor?: string;
  height?: number;
  borderRadius?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const MotionMacroBar: React.FC<MotionMacroBarProps> = ({
  progress,
  color,
  backgroundColor,
  height = 6,
  borderRadius = 3,
  testID = 'macro-progress-bar',
  style,
}) => {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(progress, 1));
  const animatedProgress = useSharedValue(reduceMotion ? clamped : 0);

  const barColor = color || colors.accent;
  const bgColor = backgroundColor || 'rgba(255,255,255,0.08)';

  useEffect(() => {
    if (reduceMotion) {
      animatedProgress.value = clamped;
    } else {
      animatedProgress.value = withSpring(clamped, {
        damping: 18,
        stiffness: 140,
        mass: 0.7,
      });
    }
  }, [clamped, reduceMotion, animatedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${Math.round(animatedProgress.value * 100)}%`,
  }));

  return (
    <View
      style={[
        styles.macroBarTrack,
        { height, borderRadius, backgroundColor: bgColor },
        style,
      ]}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View
        style={[
          styles.macroBarFill,
          { height, borderRadius, backgroundColor: barColor },
          animatedStyle,
        ]}
      />
    </View>
  );
};

interface MotionSkeletonProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const MotionSkeleton: React.FC<MotionSkeletonProps> = ({
  width,
  height,
  borderRadius = 8,
  style,
}) => {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 0.3);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5;
      return;
    }

    // Micro-animatie restrained: puls discret (nu ciclu infinit greu)
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 750 }),
        withTiming(0.25, { duration: 750 })
      ),
      6, // Cicluri finite pentru a preveni bucle infinite consumatoare
      true
    );
  }, [reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.surfaceElevated || '#181D22',
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  macroBarTrack: {
    width: '100%',
    overflow: 'hidden',
  },
  macroBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});
