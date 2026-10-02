import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { flowStrengthRankForScore } from '../../constants/workout-v2/ranks';
import type { AnatomyV2View, V2MuscleId } from '../../constants/workout-v2/muscles';
import { useTheme } from '../../context/ThemeContext';
import type { AnatomyV2DisplayMode } from '../../lib/workout-v2/anatomyState';
import { AnatomyV2Map } from './AnatomyV2Map';
import { AnatomyV2Legend } from './AnatomyV2Legend';
import { MuscleDetailSheet } from './MuscleDetailSheet';

export type AnatomyV2QaScenario =
  | 'neutral'
  | 'exercise-front'
  | 'exercise-back'
  | 'level-1'
  | 'level-3'
  | 'level-5'
  | 'full-workout'
  | 'detail';

function modeForScenario(scenario: AnatomyV2QaScenario): AnatomyV2DisplayMode {
  switch (scenario) {
    case 'exercise-front':
      return {
        mode: 'exercise',
        primary: ['chest', 'upper_chest', 'front_delts'],
        secondary: ['triceps', 'side_delts'],
        stabilizers: ['abs'],
      };
    case 'exercise-back':
      return {
        mode: 'exercise',
        primary: ['lats', 'traps', 'rear_delts'],
        secondary: ['triceps', 'hamstrings'],
        stabilizers: ['lower_back'],
      };
    case 'level-1':
      return { mode: 'strength', scores: { chest: 10, front_delts: 10, quads: 10 } };
    case 'level-3':
    case 'detail':
      return { mode: 'strength', scores: { chest: 52, front_delts: 52, quads: 52 } };
    case 'level-5':
      return { mode: 'strength', scores: { chest: 90, front_delts: 90, quads: 90 } };
    case 'full-workout':
      return {
        mode: 'exercise',
        primary: ['quads', 'glutes', 'lats'],
        secondary: ['hamstrings', 'triceps', 'calves'],
        stabilizers: ['abs', 'lower_back'],
      };
    case 'neutral':
    default:
      return { mode: 'strength', scores: {} };
  }
}

export function AnatomyV2VisualQA({
  scenario,
  initialView,
}: {
  scenario: AnatomyV2QaScenario;
  initialView: AnatomyV2View;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [selectedMuscle, setSelectedMuscle] = useState<V2MuscleId | null>(
    scenario === 'detail' ? 'chest' : null,
  );
  const mode = useMemo(() => modeForScenario(scenario), [scenario]);
  const detailResult = selectedMuscle ? {
    muscleId: selectedMuscle,
    score: 52,
    rank: flowStrengthRankForScore(52),
    contributors: [],
  } : null;

  return (
    <View style={styles.root} testID={`anatomy-v2-qa-${scenario}-${initialView}`}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>{scenario.replaceAll('-', ' ').toUpperCase()}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('workoutV2.preview.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('workoutV2.preview.tapMuscle')}</Text>
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}> 
        <AnatomyV2Map
          mode={mode}
          initialView={initialView}
          selectedMuscle={selectedMuscle}
          onSelectMuscle={setSelectedMuscle}
          width={260}
        />
        <AnatomyV2Legend mode={mode.mode} />
      </View>
      {detailResult ? <MuscleDetailSheet result={detailResult} onClose={() => setSelectedMuscle(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 14 },
  headingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 2, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  subtitle: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  card: { width: '100%', alignItems: 'center', borderWidth: 1, borderRadius: 22, padding: 14, gap: 10 },
});
