import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
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

export const shouldAnimateRunner = (state: RunnerSphereState, reduceMotion: boolean): boolean =>
  state === 'processing' && !reduceMotion;

interface RunnerSphereProps {
  state?: RunnerSphereState;
  onPress: () => void;
  size?: number;
}

const SafeSvg: any = Svg || (({ children }: any) => children || null);
const AnimatedSvg: any =
  typeof Animated?.createAnimatedComponent === 'function' && SafeSvg
    ? Animated.createAnimatedComponent(SafeSvg)
    : SafeSvg;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RunnerFrame {
  head: { cx: number; cy: number; r: number };
  torso: string;
  nearLeg: string;
  nearArm: string;
  farLeg: string;
  farArm: string;
}

// Authentic 6-phase human running gait cycle on 24x24 viewBox:
// Phase 0: Near leg heel strike forward, far leg kicked back, near arm back, far arm forward
// Phase 1: Near leg mid-stance vertical support, far leg 90° knee drive forward past hips
// Phase 2: Near leg toe-off push backward, far leg reaches forward into flight apex
// Phase 3: Far leg heel strike forward, near leg kicked back, far arm back, near arm forward
// Phase 4: Far leg mid-stance vertical support, near leg 90° knee drive forward past hips
// Phase 5: Far leg toe-off push backward, near leg reaches forward into flight apex
export const RUN_FRAMES: RunnerFrame[] = [
  {
    head: { cx: 13.8, cy: 4.8, r: 1.8 },
    torso: 'M 13.2 6.6 L 11.5 12.8',
    nearLeg: 'M 11.5 12.8 L 14.5 16.5 L 18 20.8',
    nearArm: 'M 12.8 7.8 L 9.5 9.5 L 7.8 11.8',
    farLeg: 'M 11.5 12.8 L 8 16 L 5 18.5',
    farArm: 'M 12.8 7.8 L 15.5 9.2 L 17.5 7.8',
  },
  {
    head: { cx: 13.6, cy: 4.2, r: 1.8 },
    torso: 'M 13.0 6.0 L 11.8 12.2',
    nearLeg: 'M 11.8 12.2 L 12.5 16.5 L 12 21.5',
    nearArm: 'M 12.6 7.2 L 11 9.5 L 11.5 12',
    farLeg: 'M 11.8 12.2 L 14.8 13.8 L 13 17.5',
    farArm: 'M 12.6 7.2 L 14.2 9.8 L 14.5 12',
  },
  {
    head: { cx: 14.2, cy: 3.6, r: 1.8 },
    torso: 'M 13.4 5.4 L 12.0 11.6',
    nearLeg: 'M 12.0 11.6 L 8.5 15.5 L 6 19.5',
    nearArm: 'M 13.0 6.6 L 9 8.5 L 7 10.5',
    farLeg: 'M 12.0 11.6 L 16.2 14.5 L 16 18.5',
    farArm: 'M 13.0 6.6 L 15.8 8.5 L 18 7',
  },
  {
    head: { cx: 13.8, cy: 4.8, r: 1.8 },
    torso: 'M 13.2 6.6 L 11.5 12.8',
    nearLeg: 'M 11.5 12.8 L 8 16 L 5 18.5',
    nearArm: 'M 12.8 7.8 L 15.5 9.2 L 17.5 7.8',
    farLeg: 'M 11.5 12.8 L 14.5 16.5 L 18 20.8',
    farArm: 'M 12.8 7.8 L 9.5 9.5 L 7.8 11.8',
  },
  {
    head: { cx: 13.6, cy: 4.2, r: 1.8 },
    torso: 'M 13.0 6.0 L 11.8 12.2',
    nearLeg: 'M 11.8 12.2 L 14.8 13.8 L 13 17.5',
    nearArm: 'M 12.6 7.2 L 14.2 9.8 L 14.5 12',
    farLeg: 'M 11.8 12.2 L 12.5 16.5 L 12 21.5',
    farArm: 'M 12.6 7.2 L 11 9.5 L 11.5 12',
  },
  {
    head: { cx: 14.2, cy: 3.6, r: 1.8 },
    torso: 'M 13.4 5.4 L 12.0 11.6',
    nearLeg: 'M 12.0 11.6 L 16.2 14.5 L 16 18.5',
    nearArm: 'M 13.0 6.6 L 15.8 8.5 L 18 7',
    farLeg: 'M 12.0 11.6 L 8.5 15.5 L 6 19.5',
    farArm: 'M 13.0 6.6 L 9 8.5 L 7 10.5',
  },
];

// Athletic standing stance at rest (balanced posture, relaxed arms)
export const IDLE_FRAME: RunnerFrame = {
  head: { cx: 12, cy: 4.5, r: 1.8 },
  torso: 'M 12 6.3 L 12 13.5',
  nearLeg: 'M 12 13.5 L 13.5 17.5 L 14 21.5',
  nearArm: 'M 12 7.5 L 14.2 11 L 14.5 14',
  farLeg: 'M 12 13.5 L 10.5 17.5 L 10 21.5',
  farArm: 'M 12 7.5 L 9.8 11 L 9.5 14',
};

const pathNumbers = (path: string): number[] =>
  (path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const FRAME_POINTS = RUN_FRAMES.map((frame) => ({
  head: frame.head,
  torso: pathNumbers(frame.torso),
  nearLeg: pathNumbers(frame.nearLeg),
  nearArm: pathNumbers(frame.nearArm),
  farLeg: pathNumbers(frame.farLeg),
  farArm: pathNumbers(frame.farArm),
}));

function pathBetween(a: number[], b: number[], fraction: number): string {
  'worklet';
  let path = '';
  for (let i = 0; i < a.length; i += 2) {
    path += `${i === 0 ? 'M' : ' L'} ${a[i] + (b[i] - a[i]) * fraction} ${a[i + 1] + (b[i + 1] - a[i + 1]) * fraction}`;
  }
  return path;
}

export function interpolateRunnerFrame(phase: number): RunnerFrame {
  'worklet';
  const position = ((phase % RUN_FRAMES.length) + RUN_FRAMES.length) % RUN_FRAMES.length;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = FRAME_POINTS[index];
  const b = FRAME_POINTS[(index + 1) % FRAME_POINTS.length];
  return {
    head: {
      cx: a.head.cx + (b.head.cx - a.head.cx) * fraction,
      cy: a.head.cy + (b.head.cy - a.head.cy) * fraction,
      r: a.head.r,
    },
    torso: pathBetween(a.torso, b.torso, fraction),
    nearLeg: pathBetween(a.nearLeg, b.nearLeg, fraction),
    nearArm: pathBetween(a.nearArm, b.nearArm, fraction),
    farLeg: pathBetween(a.farLeg, b.farLeg, fraction),
    farArm: pathBetween(a.farArm, b.farArm, fraction),
  };
}

export function RunnerSphere({ state = 'idle', onPress, size = 44 }: RunnerSphereProps) {
  const reduceMotion = useReducedMotion();

  // Animation drivers (100% UI-thread Reanimated)
  const spinRotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const stridePhase = useSharedValue(0);

  const isProcessing = state === 'processing';
  const isCompleted = state === 'completed';
  const runMotion = shouldAnimateRunner(state, reduceMotion);

  // 1. Authentic Stride Cycle driven 100% on Reanimated UI thread (0 to 6 over 600ms gait cycle)
  useEffect(() => {
    if (!runMotion) {
      cancelAnimation(stridePhase);
      stridePhase.value = 0;
      return;
    }
    stridePhase.value = withRepeat(
      withTiming(6, { duration: 600, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(stridePhase);
  }, [runMotion, stridePhase]);

  // 2. Kinetic Orbital Spin
  useEffect(() => {
    if (!runMotion) {
      cancelAnimation(spinRotation);
      spinRotation.value = 0;
      return;
    }
    spinRotation.value = withRepeat(
      withTiming(360, { duration: 1100, easing: Easing.linear }),
      -1,
      false
    );

    return () => cancelAnimation(spinRotation);
  }, [runMotion, spinRotation]);

  // 3. Complete pulse
  useEffect(() => {
    if (isCompleted && !reduceMotion) {
      pulseScale.value = withSequence(
        withTiming(1.12, { duration: 260, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 320, easing: Easing.inOut(Easing.ease) })
      );
    } else {
      cancelAnimation(pulseScale);
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

  const pose = useDerivedValue(() => runMotion
    ? interpolateRunnerFrame(stridePhase.value) : IDLE_FRAME);
  const headProps = useAnimatedProps(() => ({ cx: pose.value.head.cx, cy: pose.value.head.cy }));
  const torsoProps = useAnimatedProps(() => ({ d: pose.value.torso }));
  const nearLegProps = useAnimatedProps(() => ({ d: pose.value.nearLeg }));
  const nearArmProps = useAnimatedProps(() => ({ d: pose.value.nearArm }));
  const farLegProps = useAnimatedProps(() => ({ d: pose.value.farLeg }));
  const farArmProps = useAnimatedProps(() => ({ d: pose.value.farArm }));

  // Restrained, approved GetFlow athletic palette: Neon Lime (#CCFF00) and Emerald (#10B981)
  const runnerColor = isCompleted
    ? '#10B981'
    : state === 'failed'
      ? '#EF4444'
      : '#CCFF00';

  const farLimbColor = isCompleted
    ? 'rgba(16, 185, 129, 0.52)'
    : state === 'failed'
      ? 'rgba(239, 68, 68, 0.52)'
      : 'rgba(204, 255, 0, 0.48)';

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

        {/* Layer 3: One continuous athlete pose, animated on the UI thread */}
        <View style={[StyleSheet.absoluteFill, styles.centerAlign]} pointerEvents="none">
          <Svg width={24} height={24} viewBox="0 0 24 24" testID="runner-figure">
            <AnimatedPath d={IDLE_FRAME.farArm} animatedProps={farArmProps} stroke={farLimbColor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <AnimatedPath d={IDLE_FRAME.farLeg} animatedProps={farLegProps} stroke={farLimbColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <AnimatedCircle cx={IDLE_FRAME.head.cx} cy={IDLE_FRAME.head.cy} animatedProps={headProps} r={IDLE_FRAME.head.r} fill={runnerColor} />
            <AnimatedPath d={IDLE_FRAME.torso} animatedProps={torsoProps} stroke={runnerColor} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <AnimatedPath d={IDLE_FRAME.nearLeg} animatedProps={nearLegProps} stroke={runnerColor} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <AnimatedPath d={IDLE_FRAME.nearArm} animatedProps={nearArmProps} stroke={runnerColor} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
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
