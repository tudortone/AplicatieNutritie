import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../context/ThemeContext';
import type { ActualWorkoutSet } from '../../lib/workout-v2/sessionModel';

export function WorkoutSetRow({ set, index, onComplete }: {
  set: ActualWorkoutSet;
  index: number;
  onComplete: (actual: { reps: number; weightKg?: number; assistanceWeightKg?: number }) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [reps, setReps] = useState(String(set.actualReps ?? set.plannedReps));
  const [weight, setWeight] = useState(set.actualWeightKg === undefined ? String(set.plannedWeightKg ?? '') : String(set.actualWeightKg));
  const validReps = Math.max(0, Number(reps) || 0);
  const validWeight = weight.trim() ? Math.max(0, Number(weight.replace(',', '.')) || 0) : undefined;
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Text style={[styles.index, { color: colors.textSecondary }]}>{index + 1}</Text>
      <View style={styles.fieldGroup}>
        <Text style={[styles.planned, { color: colors.textTertiary }]}>{t('workoutV2.active.planned', { value: set.plannedReps })}</Text>
        <TextInput accessibilityLabel={t('workoutV2.active.actualReps')} keyboardType="number-pad" value={reps} onChangeText={setReps} style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]} />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={[styles.planned, { color: colors.textTertiary }]}>{t('workoutV2.active.plannedKg', { value: set.plannedWeightKg ?? 0 })}</Text>
        <TextInput accessibilityLabel={t('workoutV2.active.actualWeight')} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]} />
      </View>
      <Pressable
        testID={`complete-set-${set.id}`}
        accessibilityRole="checkbox"
        accessibilityLabel={t('workoutV2.active.completeSet', { number: index + 1 })}
        accessibilityState={{ checked: set.completed }}
        disabled={set.completed || validReps <= 0}
        onPress={() => onComplete({ reps: validReps, weightKg: validWeight })}
        style={[styles.complete, { backgroundColor: set.completed ? colors.success : colors.accent }]}
      >
        <Check size={18} color={colors.textOnAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingVertical: 8 },
  index: { width: 20, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  fieldGroup: { flex: 1, minWidth: 70, gap: 3 }, planned: { fontSize: 10 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 8, textAlign: 'center' },
  complete: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});

