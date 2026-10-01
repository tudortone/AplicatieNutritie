import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MOTION_DURATIONS } from '../constants/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface MacroRingProps {
  consumat: number;
  tinta: number;
  size?: number;
  strokeWidth?: number;
}

export const MacroRing: React.FC<MacroRingProps> = ({
  consumat,
  tinta = 2000,
  size = 150,
  strokeWidth = 14,
}) => {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const procent = tinta > 0 ? Math.min(Math.max(consumat / tinta, 0), 1) : 0;
  const progressValue = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progressValue.value = procent;
      return;
    }
    progressValue.value = withTiming(procent, {
      duration: MOTION_DURATIONS.feedback,
      easing: Easing.out(Easing.cubic),
    });
  }, [procent, progressValue, reduceMotion]);

  const animatedProps = useAnimatedProps(() => {
    // Reanimated 4 + Fabric arunca "Loss of precision" pe valori fractionare
    // transmise prin useAnimatedProps; rotunjim la intreg — imperceptibil pe inel.
    const strokeDashoffset = Math.round(circumference * (1 - progressValue.value));
    return {
      strokeDashoffset,
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SvgLinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.accentGradient[0]} />
            <Stop offset="100%" stopColor={colors.accentGradient[1]} />
          </SvgLinearGradient>
        </Defs>

        {/* Background Track Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceBg || 'rgba(255,255,255,0.08)'}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Animated Progress Ring */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          fill="transparent"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View style={[styles.textContainer, { maxWidth: size - strokeWidth * 2 - 8 }]}>
        <Text
          style={[styles.consumedText, { color: colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {consumat}
        </Text>
        <Text
          style={[styles.targetText, { color: colors.textSecondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          / {tinta} kcal
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
  },
  textContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  consumedText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    includeFontPadding: false,
    textAlign: 'center',
  },
  targetText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
