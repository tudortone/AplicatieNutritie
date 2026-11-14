import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { Exercitiu } from '../../constants/exercitii';
import type { Antrenament, ExercitiuInAntrenament } from '../../hooks/useAntrenamente';
import { getLocalizedExerciseName } from '../../lib/sportI18n';
import {
  describeSet,
  resolveHistorySetFields,
  type LoggedSet,
  type SetFields,
} from '../../lib/workoutSets';
import { useTheme } from '../../context/ThemeContext';

export interface SetEditSelection {
  workout: Antrenament;
  exIndex: number;
  setIndex: number;
  exerciseName: string;
  fields: SetFields;
  set: LoggedSet;
}

export interface ExerciseDeleteSelection {
  workout: Antrenament;
  exIndex: number;
  exerciseName: string;
}

interface SavedWorkoutExercisesListProps {
  workout: Antrenament;
  exercitiiMap: Map<string, Exercitiu>;
  onSelectSet: (selection: SetEditSelection) => void;
  onRequestDeleteExercise: (selection: ExerciseDeleteSelection) => void;
  testIdPrefix?: string;
}

export function SavedWorkoutExercisesList({
  workout,
  exercitiiMap,
  onSelectSet,
  onRequestDeleteExercise,
  testIdPrefix = 'saved-workout',
}: SavedWorkoutExercisesListProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const list: ExercitiuInAntrenament[] = workout.exercitii ?? [];

  return (
    <View>
      {list.map((ex, exIndex) => {
        const exMeta =
          exercitiiMap.get(ex.exercitiuId) ??
          exercitiiMap.get((ex.nume || '').toLowerCase());
        const displayExName = exMeta ? getLocalizedExerciseName(exMeta, t) : ex.nume;

        return (
          <View key={`${ex.exercitiuId}-${exIndex}`} style={styles.exercise}>
            <View style={styles.exerciseHeader}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.exerciseName, { color: colors.textPrimary }]}>
                {displayExName}
              </Text>
              <Pressable
                testID={`${testIdPrefix}-delete-ex-${workout.id}-${exIndex}`}
                onPress={() =>
                  onRequestDeleteExercise({
                    workout,
                    exIndex,
                    exerciseName: displayExName,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('sport.edit.deleteExerciseA11y', { name: displayExName })}
                style={({ pressed }) => [styles.deleteExBtn, { opacity: pressed ? 0.65 : 1 }]}
              >
                <Trash2 size={15} color={colors.danger} />
              </Pressable>
            </View>

            <View style={styles.setList}>
              {(ex.seturi ?? []).map((s, setIndex) => {
                const isWarmup = s.set_type === 'warmup';
                const isDropset = s.set_type === 'dropset';
                const isFailure = s.set_type === 'failure';
                const setNumber = s.serie || setIndex + 1;
                const typeLabel = isWarmup ? 'W' : isDropset ? 'D' : isFailure ? 'F' : `#${setNumber}`;
                const typeColor = isWarmup
                  ? colors.warning
                  : isDropset
                    ? colors.accentSecondary
                    : isFailure
                      ? colors.danger
                      : colors.textSecondary;
                const fields = resolveHistorySetFields(exMeta, ex.nume, s, t);
                const formattedVal = describeSet(s, fields, t);

                return (
                  <Pressable
                    key={`${ex.exercitiuId}-set-${setIndex}`}
                    testID={`${testIdPrefix}-edit-set-${workout.id}-${exIndex}-${setIndex}`}
                    onPress={() =>
                      onSelectSet({
                        workout,
                        exIndex,
                        setIndex,
                        exerciseName: displayExName,
                        fields,
                        set: s,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('sport.edit.editSetA11y', {
                      number: setNumber,
                      value: formattedVal,
                    })}
                    style={({ pressed }) => [
                      styles.setPill,
                      {
                        backgroundColor: colors.background,
                        borderColor: s.set_type && s.set_type !== 'working'
                          ? typeColor
                          : (colors.cardBorder || colors.border),
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[styles.setText, { color: typeColor }]}>
                      {typeLabel}:
                    </Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.setValue, { color: colors.accent }]}>
                      {formattedVal}
                    </Text>
                    {isWarmup ? (
                      <Text maxFontSizeMultiplier={1.3} style={[styles.warmupTag, { color: colors.warning }]}>
                        {t('sport.journal.warmupTag')}
                      </Text>
                    ) : null}
                    {s.rpe ? (
                      <Text maxFontSizeMultiplier={1.3} style={[styles.rpeText, { color: colors.warning }]}>
                        {t('sport.journal.rpeLabel', { rpe: s.rpe })}
                      </Text>
                    ) : null}
                    <Pencil size={11} color={colors.textTertiary} style={styles.editIcon} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  exercise: {
    marginBottom: 14,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  exerciseName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '800',
  },
  deleteExBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  setList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  setPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  setText: {
    fontSize: 12,
    fontWeight: '700',
  },
  setValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  warmupTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  rpeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  editIcon: {
    marginLeft: 2,
  },
});

export default SavedWorkoutExercisesList;
