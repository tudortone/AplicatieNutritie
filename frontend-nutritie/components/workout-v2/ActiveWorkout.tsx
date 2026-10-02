import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { getWorkoutV2Exercise } from '../../constants/workout-v2/exercises';
import { useTheme } from '../../context/ThemeContext';
import type { ActiveWorkoutSession } from '../../lib/workout-v2/sessionModel';
import { WorkoutSetRow } from './WorkoutSetRow';

export function ActiveWorkout({ session, onCompleteSet, onAddSet, onCompleteCardio, onFinish }: {
  session: ActiveWorkoutSession;
  onCompleteSet: (blockId: string, setId: string, actual: { reps: number; weightKg?: number }) => void;
  onAddSet: (blockId: string) => void;
  onCompleteCardio: (blockId: string, actual: { durationSeconds?: number; distanceKm?: number }) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{session.name}</Text>
      {session.blocks.map((block) => {
        const exercise = getWorkoutV2Exercise(block.exerciseId);
        return (
          <View key={block.id} style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
            <Text style={[styles.exercise, { color: colors.textPrimary }]}>{exercise ? t(exercise.nameKey) : block.exerciseId}</Text>
            {block.kind === 'strength' ? (
              <>
                {block.sets.map((set, index) => (
                  <WorkoutSetRow key={set.id} set={set} index={index} onComplete={(actual) => onCompleteSet(block.id, set.id, actual)} />
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel={t('workoutV2.active.addSet')} onPress={() => onAddSet(block.id)} style={styles.addSet}>
                  <Plus size={17} color={colors.accentTertiary} />
                  <Text style={[styles.addSetText, { color: colors.accentTertiary }]}>{t('workoutV2.active.addSet')}</Text>
                </Pressable>
              </>
            ) : (
              <CardioEntry
                completed={block.completed}
                onComplete={(actual) => onCompleteCardio(block.id, actual)}
              />
            )}
          </View>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel={t('workoutV2.active.finish')} onPress={onFinish} style={[styles.finish, { backgroundColor: colors.accent }]}>
        <Text style={[styles.finishText, { color: colors.textOnAccent }]}>{t('workoutV2.active.finish')}</Text>
      </Pressable>
    </View>
  );
}

function CardioEntry({ completed, onComplete }: {
  completed: boolean;
  onComplete: (actual: { durationSeconds?: number; distanceKm?: number }) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [minutes, setMinutes] = useState('20');
  const [distance, setDistance] = useState('');
  const durationSeconds = Math.max(0, Number(minutes.replace(',', '.')) || 0) * 60;
  const distanceKm = Math.max(0, Number(distance.replace(',', '.')) || 0);
  return (
    <View style={styles.cardioFields}>
      <TextInput accessibilityLabel={t('workoutV2.active.cardioMinutes')} keyboardType="decimal-pad" value={minutes} onChangeText={setMinutes} style={[styles.cardioInput, { color: colors.textPrimary, borderColor: colors.border }]} />
      <TextInput accessibilityLabel={t('workoutV2.active.cardioDistance')} keyboardType="decimal-pad" value={distance} onChangeText={setDistance} style={[styles.cardioInput, { color: colors.textPrimary, borderColor: colors.border }]} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t('workoutV2.active.completeCardio')}
        accessibilityState={{ checked: completed }}
        disabled={completed || (durationSeconds <= 0 && distanceKm <= 0)}
        onPress={() => onComplete({ durationSeconds: durationSeconds || undefined, distanceKm: distanceKm || undefined })}
        style={[styles.cardioComplete, { backgroundColor: completed ? colors.success : colors.accent }]}
      >
        <Check size={18} color={colors.textOnAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 }, title: { fontSize: 20, fontWeight: '900' },
  card: { borderWidth: 1, borderRadius: 18, padding: 12 }, exercise: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  addSet: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addSetText: { fontSize: 13, fontWeight: '800' },
  cardioFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  cardioInput: { minWidth: 100, minHeight: 44, flexGrow: 1, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10 },
  cardioComplete: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  finish: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, finishText: { fontSize: 15, fontWeight: '900' },
});
