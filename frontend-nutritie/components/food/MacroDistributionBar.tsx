import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

interface MacroDistributionBarProps {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function MacroDistributionBar({
  protein,
  carbs,
  fat,
  fiber,
}: MacroDistributionBarProps) {
  const { t } = useTranslation();

  const safeProtein = Math.max(0, protein);
  const safeCarbs = Math.max(0, carbs);
  const safeFat = Math.max(0, fat);
  const safeFiber = Math.max(0, fiber);

  const totalGrams = safeProtein + safeCarbs + safeFat + safeFiber;

  // Proportions for the bar (fallback to equal distribution if 0)
  const proteinPercent = totalGrams > 0 ? (safeProtein / totalGrams) * 100 : 25;
  const carbsPercent = totalGrams > 0 ? (safeCarbs / totalGrams) * 100 : 25;
  const fatPercent = totalGrams > 0 ? (safeFat / totalGrams) * 100 : 25;
  const fiberPercent = totalGrams > 0 ? (safeFiber / totalGrams) * 100 : 25;

  return (
    <View style={styles.container} testID="macro-distribution-bar">
      {/* 4-Color Proportional Bar */}
      <View style={styles.barTrack}>
        {totalGrams === 0 && (
          <View
            testID="macro-bar-empty"
            style={[styles.barSegment, { width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}
          />
        )}
        {safeProtein > 0 && (
          <View
            testID="macro-bar-protein"
            style={[
              styles.barSegment,
              { width: `${proteinPercent}%`, backgroundColor: '#10B981' },
            ]}
          />
        )}
        {safeCarbs > 0 && (
          <View
            testID="macro-bar-carbs"
            style={[
              styles.barSegment,
              { width: `${carbsPercent}%`, backgroundColor: '#00F0FF' },
            ]}
          />
        )}
        {safeFat > 0 && (
          <View
            testID="macro-bar-fat"
            style={[
              styles.barSegment,
              { width: `${fatPercent}%`, backgroundColor: '#FB923C' },
            ]}
          />
        )}
        {safeFiber > 0 && (
          <View
            testID="macro-bar-fiber"
            style={[
              styles.barSegment,
              { width: `${fiberPercent}%`, backgroundColor: '#FFFFFF' },
            ]}
          />
        )}
      </View>

      {/* Numerical Macro Breakdown Labels */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
          <Text maxFontSizeMultiplier={1.3} style={styles.metricValue}>
            {Math.round(safeProtein * 10) / 10}g
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.metricLabel}>
            {t('jurnal.macroProtein', 'Proteine')}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <View style={[styles.dot, { backgroundColor: '#00F0FF' }]} />
          <Text maxFontSizeMultiplier={1.3} style={styles.metricValue}>
            {Math.round(safeCarbs * 10) / 10}g
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.metricLabel}>
            {t('jurnal.macroCarbs', 'Carbohidrați')}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <View style={[styles.dot, { backgroundColor: '#FB923C' }]} />
          <Text maxFontSizeMultiplier={1.3} style={styles.metricValue}>
            {Math.round(safeFat * 10) / 10}g
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.metricLabel}>
            {t('jurnal.macroFats', 'Grăsimi')}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <View style={[styles.dot, { backgroundColor: '#FFFFFF' }]} />
          <Text maxFontSizeMultiplier={1.3} style={styles.metricValue}>
            {Math.round(safeFiber * 10) / 10}g
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.metricLabel}>
            {t('camera.fiber', 'Fibre')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 12,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
  },
  barSegment: {
    height: '100%',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  metricItem: {
    alignItems: 'center',
    minWidth: 54,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#8B93A0',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});
