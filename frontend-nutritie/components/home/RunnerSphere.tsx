import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
  Path,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type RunnerSphereState = 'idle' | 'processing' | 'completed' | 'failed';

interface RunnerSphereProps {
  state?: RunnerSphereState;
  onPress: () => void;
  size?: number;
}

const SafeSvg: any = Svg || (({ children }: any) => children || null);
const SafeCircle: any = Circle || (() => null);
const SafePath: any = Path || (() => null);

const AnimatedSvg: any =
  typeof Animated?.createAnimatedComponent === 'function' && SafeSvg
    ? Animated.createAnimatedComponent(SafeSvg)
    : SafeSvg;

// Authentic 4-phase human running gait cycle on 24x24 viewBox:
// Frame 0: Right foot strike contact, left leg back kick, left arm forward, right arm back
// Frame 1: Mid-stance transition, left knee driving forward through swing phase
// Frame 2: Left foot strike contact, right leg back kick, right arm forward, left arm back
// Frame 3: Mid-stance transition, right knee driving forward through swing phase
const RUN_FRAMES = [
  {
    head: { cx: 14, cy: 4.5, r: 1.8 },
    body: 'M 13.2 6.3 L 11.5 12.5 M 13 7.5 L 9.5 9.5 L 8 12 M 13 7.5 L 15.8 9.2 L 17.5 7.8 M 11.5 12.5 L 8 16 L 5 18.5 M 11.5 12.5 L 14.5 16 L 17.8 20.5',
  },
  {
    head: { cx: 13.8, cy: 4, r: 1.8 },
    body: 'M 13 5.8 L 11.8 12 M 12.8 7 L 11.2 9.8 L 12.5 12 M 12.8 7 L 15 9 L 14.8 11.5 M 11.8 12 L 12.2 16.5 L 11.5 21.5 M 11.8 12 L 14.5 14 L 13.5 18.5',
  },
  {
    head: { cx: 14, cy: 4.5, r: 1.8 },
    body: 'M 13.2 6.3 L 11.5 12.5 M 13 7.5 L 15.8 9.2 L 17.5 7.8 M 13 7.5 L 9.5 9.5 L 8 12 M 11.5 12.5 L 14.5 16 L 17.8 20.5 M 11.5 12.5 L 8 16 L 5 18.5',
  },
  {
    head: { cx: 13.8, cy: 4, r: 1.8 },
    body: 'M 13 5.8 L 11.8 12 M 12.8 7 L 15 9 L 14.8 11.5 M 12.8 7 L 11.2 9.8 L 12.5 12 M 11.8 12 L 14.5 14 L 13.5 18.5 M 11.8 12 L 12.2 16.5 L 11.5 21.5',
  },
];

// Athletic standing stance at rest (balanced posture, hands relaxed)
const IDLE_FRAME = {
  head: { cx: 12, cy: 4.5, r: 1.8 },
  body: 'M 12 6.3 L 12 13.5 M 12 7.5 L 9.8 11 L 9.5 14 M 12 7.5 L 14.2 11 L 14.5 14 M 12 13.5 L 10.5 17.5 L 10 21.5 M 12 13.5 L 13.5 17.5 L 14 21.5',
};

export function RunnerSphere({ state = 'idle', onPress, size = 44 }: RunnerSphereProps) {
  const reduceMotion = useReducedMotion();

  // Animation drivers
  const spinRotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const [runFrameIndex, setRunFrameIndex] = useState(0);

  const isProcessing = state === 'processing';
  const isCompleted = state === 'completed';

  // 1. Authentic Stride Cycle (130ms per frame = ~520ms full stride cycle)
  useEffect(() => {
    if (!isProcessing || reduceMotion) {
      setRunFrameIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setRunFrameIndex((prev) => (prev + 1) % RUN_FRAMES.length);
    }, 130);
    return () => clearInterval(timer);
  }, [isProcessing, reduceMotion]);

  // 2. Kinetic Orbital Spin
  useEffect(() => {
    if (reduceMotion) {
      spinRotation.value = 0;
      cancelAnimation(spinRotation);
      return;
    }

    if (isProcessing) {
      spinRotation.value = withRepeat(
        withTiming(360, { duration: 1100, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      spinRotation.value = withRepeat(
        withTiming(360, { duration: 5000, easing: Easing.linear }),
        -1,
        false
      );
    }

    return () => cancelAnimation(spinRotation);
  }, [isProcessing, reduceMotion, spinRotation]);

  // 3. Complete pulse
  useEffect(() => {
    if (isCompleted && !reduceMotion) {
      pulseScale.value = withSequence(
        withTiming(1.12, { duration: 260, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 320, easing: Easing.inOut(Easing.ease) })
      );
    } else {
      pulseScale.value = 1;
    }
  }, [isCompleted, reduceMotion, pulseScale]);

  // Animated styles
  const orbitAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinRotation.value}deg` }],
  }));

  const sphereContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Restrained, approved GetFlow athletic palette: Neon Lime (#CCFF00) and Emerald (#10B981)
  const runnerColor = isCompleted
    ? '#10B981'
    : state === 'failed'
      ? '#EF4444'
      : '#CCFF00';

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const radius = size / 2;
  const innerRadius = radius - 4;

  const getA11yLabel = () => {
    switch (state) {
      case 'processing':
        return 'Analiză foto în desfășurare. Atingeți pentru stare.';
      case 'completed':
        return 'Analiză foto finalizată. Atingeți pentru a deschide rezultatul.';
      case 'failed':
        return 'Analiză foto eșuată. Atingeți pentru reîncercare.';
      default:
        return 'Sferă Runner GetFlow. Atingeți pentru camera foto.';
    }
  };

  const currentFrame = isProcessing ? RUN_FRAMES[runFrameIndex] : IDLE_FRAME;

  return (
    <Pressable
      testID="runner-sphere-widget"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={getA11yLabel()}
      hitSlop={6}
      style={styles.pressable}
    >
      <Animated.View style={[styles.sphereWrapper, { width: size, height: size }, sphereContainerStyle]}>
        {/* Layer 1: Metal Brushed Rim & Spherical Ambient Gradient */}
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            {/* Outer metallic chrome bevel */}
            <SvgLinearGradient id="metalBevel" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#94A3B8" stopOpacity="0.8" />
              <Stop offset="45%" stopColor="#334155" stopOpacity="0.5" />
              <Stop offset="70%" stopColor="#0F172A" stopOpacity="0.9" />
              <Stop offset="100%" stopColor="#475569" stopOpacity="0.7" />
            </SvgLinearGradient>

            {/* Deep spherical obsidian lens core */}
            <RadialGradient id="obsidianDepth" cx="40%" cy="35%" r="65%">
              <Stop offset="0%" stopColor="#1E293B" stopOpacity="0.9" />
              <Stop offset="60%" stopColor="#090C0E" stopOpacity="0.95" />
              <Stop offset="100%" stopColor="#020406" stopOpacity="1" />
            </RadialGradient>

            {/* Specular curved glass reflection */}
            <SvgLinearGradient id="glassGlare" x1="20%" y1="0%" x2="70%" y2="60%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.38" />
              <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.08" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>

          {/* Metal Ring Bevel */}
          <Circle cx={radius} cy={radius} r={radius - 1} fill="url(#metalBevel)" />

          {/* Deep Lens Core */}
          <Circle cx={radius} cy={radius} r={innerRadius} fill="url(#obsidianDepth)" />

          {/* Subtle engraved latitude / orbital groove */}
          <Circle
            cx={radius}
            cy={radius}
            r={innerRadius - 2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            fill="none"
          />
        </Svg>

        {/* Layer 2: Rotating Kinetic Orbital Ring with Traveling Progress Dot */}
        <AnimatedSvg width={size} height={size} style={[StyleSheet.absoluteFill, orbitAnimatedStyle]}>
          {/* Luminous orbital trail */}
          <Circle
            cx={radius}
            cy={radius}
            r={radius - 2.5}
            stroke={isProcessing ? 'rgba(204, 255, 0, 0.45)' : isCompleted ? 'rgba(16, 185, 129, 0.5)' : 'rgba(204, 255, 0, 0.25)'}
            strokeWidth={1.5}
            strokeDasharray={isProcessing ? '14 8' : '22 12'}
            fill="none"
          />
          {/* Leading kinetic energy dot */}
          <Circle
            cx={radius + (radius - 2.5) * 0.707}
            cy={radius - (radius - 2.5) * 0.707}
            r={isProcessing ? 2.5 : 2}
            fill={isProcessing ? '#CCFF00' : isCompleted ? '#10B981' : '#CCFF00'}
          />
        </AnimatedSvg>

        {/* Layer 3: Core Athlete Figure displaying Real Running Stride Cycle */}
        <View style={[StyleSheet.absoluteFill, styles.centerAlign]}>
          <SafeSvg width={22} height={22} viewBox="0 0 24 24">
            <SafeCircle
              cx={currentFrame.head.cx}
              cy={currentFrame.head.cy}
              r={currentFrame.head.r}
              fill={runnerColor}
            />
            <SafePath
              d={currentFrame.body}
              stroke={runnerColor}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </SafeSvg>
        </View>

        {/* Layer 4: Specular Glass Reflection Cap */}
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={`M ${radius - 12} ${radius - 14} Q ${radius} ${radius - 18} ${radius + 12} ${radius - 14} Q ${radius} ${radius - 8} ${radius - 12} ${radius - 14} Z`}
            fill="url(#glassGlare)"
          />
        </Svg>

        {/* Completed Checkmark Pill (Bottom Right Badge) */}
        {isCompleted && (
          <View style={styles.completedBadge}>
            <Check size={10} color="#090C0E" strokeWidth={3.5} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sphereWrapper: {
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: '#CCFF00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  centerAlign: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#090C0E',
  },
});
