import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../context/ThemeContext';

export function AnatomyV2Legend({ mode }: { mode: 'exercise' | 'strength' }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const items = mode === 'exercise'
    ? [
        ['primary', colors.accent],
        ['secondary', colors.accentTertiary],
        ['stabilizer', colors.warning],
      ] as const
    : [
        ['noData', '#1E252E'],
        ['strengthLow', '#0284C7'],
        ['strengthHigh', colors.accent],
      ] as const;
  return (
    <View style={styles.row} accessibilityRole="summary">
      {items.map(([key, color]) => (
        <View key={key} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t(`workoutV2.anatomy.${key}`)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  item: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 12, fontWeight: '600' },
});
