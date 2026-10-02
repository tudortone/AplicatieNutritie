import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../context/ThemeContext';
import type { WorkoutV2StrengthMap } from '../../lib/workout-v2/strengthEngine';

export function StrengthSummary({ result }: { result: WorkoutV2StrengthMap }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const leadingMomentum = useMemo(() => Object.values(result.momentum)
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.validSessions))
    .sort((a, b) => b.score - a.score)[0], [result.momentum]);
  return (
    <View testID="workout-v2-strength-summary" style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{t('workoutV2.strength.currentStrength')}</Text>
      <View style={styles.mainRow}>
        <Text style={[styles.rank, { color: colors.accent }]}>{t(result.overall.rank.nameKey)}</Text>
        <Text style={[styles.score, { color: colors.textPrimary }]}>
          {result.overall.score ?? '—'}
          <Text style={[styles.outOf, { color: colors.textSecondary }]}> / 100</Text>
        </Text>
      </View>
      <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('workoutV2.strength.trainingDisclaimer')}</Text>
      <View style={[styles.momentum, { borderColor: colors.border }]}>
        <Text style={[styles.momentumTitle, { color: colors.textPrimary }]}>{t('workoutV2.strength.momentum')}</Text>
        <Text style={[styles.momentumScore, { color: colors.accentTertiary }]}>{leadingMomentum?.score ?? 0} / 100</Text>
        <Text style={[styles.fact, { color: colors.textSecondary }]}>
          {t('workoutV2.strength.progressFact', { value: leadingMomentum?.improvementPercent ?? 0 })}
        </Text>
        <Text style={[styles.fact, { color: colors.textSecondary }]}>
          {t('workoutV2.strength.weeksFact', { value: leadingMomentum?.activeWeeks ?? 0 })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 16, gap: 9 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  mainRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  rank: { flexShrink: 1, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  score: { fontSize: 24, lineHeight: 29, fontWeight: '900' },
  outOf: { fontSize: 12, fontWeight: '700' }, disclaimer: { fontSize: 11, lineHeight: 16 },
  momentum: { borderTopWidth: 1, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  momentumTitle: { flexGrow: 1, fontSize: 14, fontWeight: '800' }, momentumScore: { fontSize: 15, fontWeight: '900' },
  fact: { width: '100%', fontSize: 12, lineHeight: 16 },
});
