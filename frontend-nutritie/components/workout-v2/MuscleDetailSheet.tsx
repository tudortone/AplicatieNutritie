import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { getWorkoutV2Exercise } from '../../constants/workout-v2/exercises';
import { useTheme } from '../../context/ThemeContext';
import type { MuscleStrengthResult } from '../../lib/workout-v2/strengthEngine';

export function MuscleDetailSheet({ result, onClose }: { result: MuscleStrengthResult; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="summary" style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t(`workoutV2.muscles.${result.muscleId}`)}</Text>
          <Text style={[styles.level, { color: colors.accent }]}>{t(result.rank.nameKey)} · {result.score ?? '—'} / 100</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
          <X size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Text style={[styles.explanation, { color: colors.textSecondary }]}>{t('workoutV2.strength.muscleExplanation')}</Text>
      {result.contributors.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('workoutV2.strength.noEvidence')}</Text>
      ) : result.contributors.map((contributor) => {
        const exercise = getWorkoutV2Exercise(contributor.exerciseId);
        return (
          <View key={contributor.exerciseId} style={[styles.row, { borderColor: colors.border }]}>
            <Text numberOfLines={2} style={[styles.exercise, { color: colors.textPrimary }]}>
              {exercise ? t(exercise.nameKey) : contributor.exerciseId}
            </Text>
            <Text style={[styles.evidence, { color: colors.textSecondary }]}>
              {t('workoutV2.strength.e1rmEvidence', { value: contributor.e1rmKg.toFixed(1), score: contributor.exerciseScore })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center' }, headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '900' }, level: { marginTop: 2, fontSize: 13, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  explanation: { fontSize: 11, lineHeight: 16 }, empty: { fontSize: 13, lineHeight: 18 },
  row: { borderTopWidth: 1, paddingTop: 9 }, exercise: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  evidence: { marginTop: 2, fontSize: 11, lineHeight: 16 },
});
