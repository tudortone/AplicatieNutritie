import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useDaysUntilExpiry, expiryColor } from '@/hooks/useDaysUntilExpiry';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { MOTION_DURATIONS } from '../../constants/motion';

interface Props {
  expiryDate: string | number | Date;
  addedDate?: string | number | Date;
}

export default function ExpiryBar({ expiryDate, addedDate }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const { days, hours, progress, expired, urgent } = useDaysUntilExpiry(expiryDate, addedDate);
  const width = useSharedValue(progress);

  useEffect(() => {
    if (reduceMotion) {
      width.value = progress;
      return;
    }
    width.value = withTiming(progress, { duration: MOTION_DURATIONS.standard });
  }, [progress, width, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
    backgroundColor: expiryColor(width.value),
  }));

  const label = expired
    ? 'Expirat'
    : `${days}z ${hours}h rămase`;

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: colors.disabledBg }]}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <Text style={[styles.label, { color: expired ? colors.danger : urgent ? colors.warning : colors.textTertiary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  label: { fontSize: 11, marginTop: 4, fontWeight: '600' },
});
