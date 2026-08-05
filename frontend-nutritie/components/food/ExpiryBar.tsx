import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useDaysUntilExpiry, expiryColor } from '@/hooks/useDaysUntilExpiry';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  expiryDate: string | number | Date;
  addedDate?: string | number | Date;
}

export default function ExpiryBar({ expiryDate, addedDate }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
    ? t('food.expiry.expired')
    : t('food.expiry.remaining', { zile: days, ore: hours });

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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginTop: 8 },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3 },
    label: { color: colors.textTertiary, fontSize: 11, marginTop: 4, fontWeight: '600' },
    urgent: { color: colors.warning },
    expired: { color: colors.danger },
  });
