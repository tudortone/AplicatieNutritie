import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { WORKOUT_V2_EXERCISES, type WorkoutV2ExerciseId } from '../../constants/workout-v2/exercises';
import { useTheme } from '../../context/ThemeContext';

export function ExercisePicker({ onSelect }: { onSelect: (exerciseId: WorkoutV2ExerciseId) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const exercises = useMemo(() => WORKOUT_V2_EXERCISES, []);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.content}
    >
      {exercises.map((exercise) => (
        <Pressable
          key={exercise.id}
          testID={`workout-v2-add-${exercise.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('workoutV2.builder.addExerciseNamed', { exercise: t(exercise.nameKey) })}
          onPress={() => onSelect(exercise.id)}
          style={[styles.chip, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}
        >
          <Text numberOfLines={1} style={[styles.chipText, { color: colors.textPrimary }]}>{t(exercise.nameKey)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, flexShrink: 0 },
  content: { gap: 8, paddingVertical: 4, paddingRight: 16, alignItems: 'center' },
  chip: { minHeight: 44, maxWidth: 180, flexShrink: 0, justifyContent: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 13 },
  chipText: { fontSize: 13, lineHeight: 18, includeFontPadding: false, fontWeight: '700' },
});

