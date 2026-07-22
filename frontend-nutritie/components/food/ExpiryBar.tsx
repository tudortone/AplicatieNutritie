import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useDaysUntilExpiry, expiryColor } from '@/hooks/useDaysUntilExpiry';

interface Props {
  expiryDate: string | number | Date;
  addedDate?: string | number | Date;
}

export default function ExpiryBar({ expiryDate, addedDate }: Props) {
  const { days, hours, progress, expired, urgent } = useDaysUntilExpiry(expiryDate, addedDate);
  const width = useSharedValue(progress);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 600 });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
    backgroundColor: expiryColor(width.value),
  }));

  const label = expired
    ? 'Expirat'
    : `${days}z ${hours}h rămase`;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <Text style={[styles.label, expired && styles.expired, urgent && styles.urgent]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#2A323D', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  label: { color: '#9CA3AF', fontSize: 11, marginTop: 4, fontWeight: '600' },
  urgent: { color: '#FB923C' },
  expired: { color: '#F87171' },
});
