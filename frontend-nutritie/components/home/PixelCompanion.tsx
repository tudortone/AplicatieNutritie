import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Rect, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getCompanionStage } from '../../lib/flowCompanion';

const SafeSvg: any = Svg || (({ children }: any) => children || null);
const SafeRect: any = Rect || (() => null);
const SafeG: any = G || (({ children }: any) => children || null);

interface PixelCompanionProps {
  streak?: number;
  onPress?: () => void;
  size?: number;
}

/**
 * Handcrafted 16x16 Micro Pixel Art Sprout Creature
 * 
 * Grid colors:
 * L = Sprout Leaf (#CCFF00)
 * G = Sprout Stem / Leaf Border (#22C55E)
 * B = Body Light Emerald (#34D399)
 * D = Body Dark Emerald (#059669)
 * E = Eye Pupil (#090C0E)
 * W = Eye Glint (#FFFFFF)
 * C = Cheek Blush (#F472B6)
 */
function PixelSproutSvg({ size = 28 }: { size?: number }) {
  const pixel = size / 16;

  // 16x16 pixel definitions [x, y, color]
  const pixels: [number, number, string][] = [
    // Sprout leaf & tip
    [7, 1, '#CCFF00'],
    [8, 1, '#CCFF00'],
    [6, 2, '#22C55E'],
    [7, 2, '#CCFF00'],
    [8, 2, '#CCFF00'],
    [9, 2, '#22C55E'],
    [7, 3, '#22C55E'],
    [8, 3, '#22C55E'],
    [7, 4, '#10B981'],
    [8, 4, '#10B981'],

    // Head top curve
    [5, 5, '#10B981'],
    [6, 5, '#34D399'],
    [7, 5, '#34D399'],
    [8, 5, '#34D399'],
    [9, 5, '#34D399'],
    [10, 5, '#10B981'],

    // Head upper
    [4, 6, '#10B981'],
    [5, 6, '#34D399'],
    [6, 6, '#6EE7B7'],
    [7, 6, '#6EE7B7'],
    [8, 6, '#34D399'],
    [9, 6, '#34D399'],
    [10, 6, '#34D399'],
    [11, 6, '#059669'],

    // Face / Eyes level
    [3, 7, '#10B981'],
    [4, 7, '#34D399'],
    [5, 7, '#090C0E'], // Left eye pupil
    [6, 7, '#FFFFFF'], // Left eye reflection
    [7, 7, '#34D399'],
    [8, 7, '#34D399'],
    [9, 7, '#090C0E'], // Right eye pupil
    [10, 7, '#FFFFFF'], // Right eye reflection
    [11, 7, '#34D399'],
    [12, 7, '#059669'],

    // Cheeks & mouth level
    [3, 8, '#10B981'],
    [4, 8, '#F472B6'], // Left cheek
    [5, 8, '#34D399'],
    [6, 8, '#34D399'],
    [7, 8, '#059669'], // Smile
    [8, 8, '#059669'], // Smile
    [9, 8, '#34D399'],
    [10, 8, '#F472B6'], // Right cheek
    [11, 8, '#34D399'],
    [12, 8, '#059669'],

    // Lower body
    [3, 9, '#10B981'],
    [4, 9, '#34D399'],
    [5, 9, '#34D399'],
    [6, 9, '#34D399'],
    [7, 9, '#34D399'],
    [8, 9, '#34D399'],
    [9, 9, '#34D399'],
    [10, 9, '#34D399'],
    [11, 9, '#34D399'],
    [12, 9, '#059669'],

    // Belly
    [4, 10, '#059669'],
    [5, 10, '#34D399'],
    [6, 10, '#34D399'],
    [7, 10, '#34D399'],
    [8, 10, '#34D399'],
    [9, 10, '#34D399'],
    [10, 10, '#34D399'],
    [11, 10, '#059669'],

    // Tiny feet
    [4, 11, '#10B981'],
    [5, 11, '#10B981'],
    [10, 11, '#059669'],
    [11, 11, '#059669'],
  ];

  return (
    <SafeSvg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <SafeG>
        {pixels.map(([x, y, color], idx) => (
          <SafeRect
            key={idx}
            x={x * pixel}
            y={y * pixel}
            width={pixel + 0.3}
            height={pixel + 0.3}
            fill={color}
          />
        ))}
      </SafeG>
    </SafeSvg>
  );
}

export function PixelCompanion({
  streak = 0,
  onPress,
  size = 32,
}: PixelCompanionProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(0);
  const hopScale = useSharedValue(1);

  // Subtle breathing bobbing animation (±1.5dp)
  useEffect(() => {
    if (reduceMotion) {
      translateY.value = 0;
      cancelAnimation(translateY);
      return;
    }

    translateY.value = withRepeat(
      withSequence(
        withTiming(-1.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.6, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    return () => cancelAnimation(translateY);
  }, [reduceMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: hopScale.value }],
  }));

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (!reduceMotion) {
      hopScale.value = withSequence(
        withTiming(1.2, { duration: 140, easing: Easing.out(Easing.back(1.5)) }),
        withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) })
      );
    }

    onPress?.();
  };

  const stage = getCompanionStage(streak).stage;

  return (
    <Pressable
      testID="pixel-companion-widget"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${t('flowCompanion.defaultName')}, ${t('flowCompanion.stageLabel', { stage })}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.container}
    >
      <Animated.View style={[styles.companionWrapper, animatedStyle]}>
        <PixelSproutSvg size={size - 4} />
      </Animated.View>

      {/* Existing streak stage, not a separate companion XP level. */}
      <View style={styles.levelBadge}>
        <Text style={styles.levelText} maxFontSizeMultiplier={1.2}>
          {stage}/5
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    gap: 4,
  },
  companionWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.25)',
  },
  levelText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#CCFF00',
    letterSpacing: 0.2,
  },
});
