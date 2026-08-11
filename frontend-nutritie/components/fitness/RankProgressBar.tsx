import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';

type Props = {
  currentKg: number;
  nextRankKg: number;
  rankLabel: string;
  nextRankLabel: string;
};

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

// REMED-032: rampă de culoare pe token-urile temei (warning/danger/success/gold)
// în loc de hex-uri fixe — se respecă și Reduce Motion prin interpolarea shared value.
const gradientForRank = (
  progress: number,
  colors: ReturnType<typeof useTheme>['colors'],
): [string, string, string] => {
  if (progress >= 0.9) return [colors.warning, colors.danger, colors.danger];
  if (progress >= 0.6) return [colors.gold, colors.warning, colors.danger];
  return [colors.accentTertiary, colors.accentSecondary, colors.gold];
};

export default function RankProgressBar({
  currentKg,
  nextRankKg,
  rankLabel,
  nextRankLabel,
}: Props) {
  const { colors } = useTheme();
  const progress = Math.max(0, Math.min(1, currentKg / nextRankKg));
  const progressValue = useSharedValue(0);
  const widthStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`,
  }));

  useEffect(() => {
    progressValue.value = withTiming(progress, {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, progressValue]);

  const gradient = gradientForRank(progress, colors);

  return (
    <View style={styles.wrapper}>
      <View style={styles.metaRow}>
        <Text style={[styles.label, { color: colors.textTertiary }]}>Progres spre {nextRankLabel}</Text>
        <Text style={[styles.value, { color: colors.accentTertiary }]}>
          {currentKg.toFixed(3)} / {nextRankKg.toFixed(3)} kg
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceBg }]}>
        <AnimatedGradient
          colors={gradient}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, widthStyle]}
        />
      </View>

      <Text style={[styles.rank, { color: colors.textPrimary }]}>{rankLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 14, fontWeight: '600' },
  value: { fontSize: 14, fontWeight: '800' },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: { height: 10, borderRadius: 999, minWidth: 4 },
  rank: { fontSize: 13, fontWeight: '700' },
});
