import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Dumbbell, History, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import DailyQuestsCard from '../components/gamification/DailyQuestsCard';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import {
  SavedWorkoutExercisesList,
  type ExerciseDeleteSelection,
  type SetEditSelection,
} from '../components/fitness/SavedWorkoutExercisesList';
import { WorkoutSetEditSheet } from '../components/fitness/WorkoutSetEditSheet';
import {
  useAntrenamente,
  type Antrenament,
  replaceSetInWorkout,
  removeSetFromWorkout,
  removeExerciseFromWorkout,
} from '../hooks/useAntrenamente';
import { useExercitii } from '../hooks/useExercitii';
import { useNotify } from '../hooks/useNotify';
import { useTheme } from '../context/ThemeContext';
import type { DailySnapshot } from '../lib/questsEngine';
import { useTranslation } from 'react-i18next';
import { describeSet, type LoggedSet } from '../lib/workoutSets';

function snapshotFrom(workouts: Antrenament[]): DailySnapshot {
  const exerciseIds = new Set<string>();
  const muscleIds = new Set<string>();
  let sets = 0;
  let reps = 0;
  let volumeKg = 0;
  let minutes = 0;
  for (const workout of workouts) {
    minutes += Number(workout.durata_min || 0);
    Object.entries(workout.muscle_load || {}).forEach(([id, load]) => {
      if (Number(load) > 0) muscleIds.add(id);
    });
    for (const exercise of workout.exercitii || []) {
      exerciseIds.add(exercise.exercitiuId || exercise.nume);
      for (const set of exercise.seturi || []) {
        if (set.set_type === 'warmup') continue;
        sets += 1;
        reps += Number(set.repetari || 0);
        volumeKg += Number(set.repetari || 0) * Number(set.greutate || 0);
      }
    }
  }
  return { sets, reps, volumeKg, minutes, exercises: exerciseIds.size, muscles: muscleIds.size };
}

export default function ProgresAntrenamenteScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const notify = useNotify();
  const { antrenamente, loading, refresh, actualizeazaAntrenament, stergeAntrenament } = useAntrenamente();
  const { exercitii } = useExercitii();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingTarget, setEditingTarget] = useState<SetEditSelection | null>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<ExerciseDeleteSelection | null>(null);
  const [workoutToDelete, setWorkoutToDelete] = useState<Antrenament | null>(null);
  const [mutating, setMutating] = useState(false);
  const snapshot = useMemo(() => snapshotFrom(antrenamente), [antrenamente]);

  const exercitiiMap = useMemo(() => {
    const map = new Map<string, (typeof exercitii)[number]>();
    for (const ex of exercitii) {
      map.set(ex.id, ex);
      map.set(ex.nume.toLowerCase(), ex);
    }
    return map;
  }, [exercitii]);

  const keyExtractor = useCallback((item: Antrenament) => item.id, []);

  const renderWorkoutItem = useCallback(
    ({ item }: { item: Antrenament }) => {
      const isOpen = Boolean(expanded[item.id]);
      return (
        <View style={[styles.workoutCard, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <View style={styles.workoutHeaderRow}>
            <Pressable
              onPress={() => setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
              accessibilityRole="button"
              accessibilityLabel={isOpen ? t('sport.progress.closeA11y', { name: item.nume }) : t('sport.progress.openA11y', { name: item.nume })}
              style={styles.workoutHeader}
            >
              <View style={styles.workoutCopy}>
                <Text style={[styles.workoutName, { color: colors.textPrimary }]}>{item.nume}</Text>
                <View style={styles.metaRow}>
                  <Clock size={13} color={colors.textTertiary} />
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {t('sport.progress.durationAndExercises', { min: item.durata_min, count: item.exercitii?.length || 0 })}
                  </Text>
                  {item.is_local ? <Text style={[styles.localTag, { color: colors.warning }]}>{t('sport.progress.localTag')}</Text> : null}
                </View>
              </View>
              {isOpen ? <ChevronUp size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />}
            </Pressable>
            <Pressable
              testID={`progress-delete-workout-${item.id}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setWorkoutToDelete(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('sport.progress.deleteWorkoutA11y', { name: item.nume })}
              style={styles.headerDeleteBtn}
            >
              <Trash2 size={16} color={colors.danger} />
            </Pressable>
          </View>
          {isOpen ? (
            <View style={[styles.exerciseList, { borderTopColor: colors.border }]}>
              <SavedWorkoutExercisesList
                workout={item}
                exercitiiMap={exercitiiMap}
                onSelectSet={setEditingTarget}
                onRequestDeleteExercise={(sel) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setExerciseToDelete(sel);
                }}
                testIdPrefix="progress"
              />
            </View>
          ) : null}
        </View>
      );
    },
    [colors, expanded, t, exercitiiMap],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('sport.progress.backA11y')} style={[styles.iconButton, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('sport.progress.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('sport.progress.subtitle')}</Text>
        </View>
        <Pressable onPress={() => router.push('/jurnal-antrenamente')} accessibilityRole="button" accessibilityLabel={t('sport.progress.openJournalA11y')} style={[styles.iconButton, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <History size={20} color={colors.accent} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.accent} /><Text style={{ color: colors.textSecondary }}>{t('sport.progress.loading')}</Text></View>
      ) : (
        <FlatList
          data={antrenamente}
          keyExtractor={keyExtractor}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshing={loading}
          onRefresh={refresh}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
          ListHeaderComponent={
            <View style={styles.topContent}>
              <DailyQuestsCard snapshot={snapshot} />
              <View style={styles.summaryRow}>
                {[
                  [snapshot.exercises, t('sport.progress.exercisesStat'), colors.accent],
                  [snapshot.sets, t('sport.progress.setsStat'), colors.accentSecondary],
                  [Math.round(snapshot.volumeKg), t('sport.progress.volumeStat'), colors.warning],
                ].map(([value, label, color]) => (
                  <View key={String(label)} style={[styles.summary, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
                    <Text style={[styles.summaryValue, { color: String(color) }]}>{String(value)}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{String(label)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.sectionHeader}><Dumbbell size={18} color={colors.accent} /><Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('sport.progress.todayWorkouts')}</Text></View>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
              <Dumbbell size={34} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('sport.progress.emptyTitle')}</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('sport.progress.emptyText')}</Text>
            </View>
          }
          renderItem={renderWorkoutItem}
        />
      )}

      <ConfirmSheet
        visible={!!workoutToDelete}
        title={t('sport.journal.deleteConfirmTitle')}
        message={workoutToDelete ? t('sport.journal.deleteConfirmMsg', { name: workoutToDelete.nume }) : ''}
        confirmLabel={t('sport.journal.deleteConfirmBtn')}
        cancelLabel={t('sport.journal.cancelBtn')}
        destructive={true}
        loading={mutating}
        onCancel={() => setWorkoutToDelete(null)}
        onConfirm={async () => {
          if (!workoutToDelete) return;
          const target = workoutToDelete;
          setMutating(true);
          try {
            await stergeAntrenament(target.id);
            notify.info(t('sport.journal.deleteSuccessTitle'), t('sport.journal.deleteSuccessMsg'));
            setWorkoutToDelete(null);
          } catch {
            notify.error(t('sport.journal.deleteErrorTitle'), t('sport.journal.deleteErrorMsg'));
          } finally {
            setMutating(false);
          }
        }}
      />

      <ConfirmSheet
        visible={!!exerciseToDelete}
        title={t('sport.edit.deleteExerciseConfirmTitle')}
        message={
          exerciseToDelete
            ? ((exerciseToDelete.workout.exercitii?.length ?? 0) <= 1
                ? t('sport.edit.deleteLastExerciseConfirmMsg', { name: exerciseToDelete.exerciseName })
                : t('sport.edit.deleteExerciseConfirmMsg', { name: exerciseToDelete.exerciseName }))
            : ''
        }
        confirmLabel={t('sport.journal.deleteConfirmBtn')}
        cancelLabel={t('sport.journal.cancelBtn')}
        destructive={true}
        loading={mutating}
        onCancel={() => setExerciseToDelete(null)}
        onConfirm={async () => {
          if (!exerciseToDelete) return;
          const target = exerciseToDelete;
          setMutating(true);
          try {
            const nextExercitii = removeExerciseFromWorkout(target.workout, target.exIndex);
            const updated = await actualizeazaAntrenament(target.workout, nextExercitii);
            notify.info(
              t('sport.edit.exerciseDeletedTitle'),
              updated ? t('sport.edit.setDeletedMsg') : t('sport.edit.workoutDeletedMsg'),
            );
            setExerciseToDelete(null);
          } catch {
            notify.error(t('sport.edit.updateErrorTitle'), t('sport.edit.updateErrorMsg'));
          } finally {
            setMutating(false);
          }
        }}
      />

      <WorkoutSetEditSheet
        visible={!!editingTarget}
        exerciseName={editingTarget?.exerciseName ?? ''}
        setIndex={editingTarget?.setIndex ?? 0}
        initialSet={editingTarget?.set ?? null}
        fields={editingTarget?.fields ?? null}
        isLastSetInWorkout={
          ((editingTarget?.workout.exercitii ?? []).reduce((s, ex) => s + (ex.seturi?.length ?? 0), 0)) <= 1
        }
        saving={mutating}
        onSave={async (updatedSet: LoggedSet) => {
          if (!editingTarget) return;
          setMutating(true);
          try {
            const nextExercitii = replaceSetInWorkout(
              editingTarget.workout,
              editingTarget.exIndex,
              editingTarget.setIndex,
              updatedSet,
            );
            await actualizeazaAntrenament(editingTarget.workout, nextExercitii);
            notify.success(t('sport.edit.setUpdatedTitle'), describeSet(updatedSet, editingTarget.fields, t));
            setEditingTarget(null);
          } catch {
            notify.error(t('sport.edit.updateErrorTitle'), t('sport.edit.updateErrorMsg'));
          } finally {
            setMutating(false);
          }
        }}
        onDeleteSet={async () => {
          if (!editingTarget) return;
          setMutating(true);
          try {
            const nextExercitii = removeSetFromWorkout(
              editingTarget.workout,
              editingTarget.exIndex,
              editingTarget.setIndex,
            );
            const updated = await actualizeazaAntrenament(editingTarget.workout, nextExercitii);
            notify.info(
              t('sport.edit.setDeletedTitle'),
              updated ? t('sport.edit.setDeletedMsg') : t('sport.edit.workoutDeletedMsg'),
            );
            setEditingTarget(null);
          } catch {
            notify.error(t('sport.edit.updateErrorTitle'), t('sport.edit.updateErrorMsg'));
          } finally {
            setMutating(false);
          }
        }}
        onClose={() => {
          if (!mutating) setEditingTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  headerCopy: { flex: 1 }, title: { fontSize: 20, fontWeight: '900' }, subtitle: { fontSize: 12, marginTop: 2 },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 18 }, topContent: { gap: 16 },
  summaryRow: { flexDirection: 'row', gap: 10 }, summary: { flex: 1, minHeight: 76, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900' }, summaryLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }, sectionTitle: { fontSize: 17, fontWeight: '900' },
  empty: { marginTop: 12, padding: 28, borderRadius: 20, borderWidth: 1, alignItems: 'center' }, emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12 }, emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5 },
  workoutCard: { borderRadius: 18, borderWidth: 1, marginTop: 12, overflow: 'hidden' },
  workoutHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  workoutHeader: { flex: 1, minHeight: 68, flexDirection: 'row', alignItems: 'center', padding: 15, paddingRight: 8 },
  headerDeleteBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  workoutCopy: { flex: 1 }, workoutName: { fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 5 }, meta: { fontSize: 12, fontWeight: '600' }, localTag: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  exerciseList: { borderTopWidth: 1, padding: 15 },
});
