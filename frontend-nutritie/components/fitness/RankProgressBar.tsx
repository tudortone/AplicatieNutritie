import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  currentKg: number;
  nextRankKg: number;
  rankLabel: string;
  nextRankLabel: string;
};

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

const gradientForRank = (progress: number): [string, string, string] => {
  if (progress >= 0.9) return ['#FF8C00', '#FF3D00', '#FF004C'];
  if (progress >= 0.6) return ['#FFD700', '#FF8C00', '#FF3D00'];
  return ['#00BFFF', '#278BFF', '#FFD700'];
};

export default function RankProgressBar({
  currentKg,
  nextRankKg,
  rankLabel,
  nextRankLabel,
}: Props) {
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

  const colors = gradientForRank(progress);

  return (
    <View style={styles.wrapper}>
      <View style={styles.metaRow}>
        <Text style={styles.label}>Progres spre {nextRankLabel}</Text>
        <Text style={styles.value}>
          {currentKg.toFixed(3)} / {nextRankKg.toFixed(3)} kg
        </Text>
      </View>

      <View style={styles.track}>
        <AnimatedGradient
          colors={colors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, widthStyle]}
        />
      </View>

      <Text style={styles.rank}>{rankLabel}</Text>
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
  label: { color: '#7F929B', fontSize: 14, fontWeight: '600' },
  value: { color: '#39B9F4', fontSize: 14, fontWeight: '800' },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#123341',
  },
  fill: { height: 10, borderRadius: 999, minWidth: 4 },
  rank: { color: '#E8F0F2', fontSize: 13, fontWeight: '700' },
});
