import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Dumbbell, History } from 'lucide-react-native';
import DailyQuestsCard from '../components/gamification/DailyQuestsCard';
import { useAntrenamente, type Antrenament } from '../hooks/useAntrenamente';
import { useTheme } from '../context/ThemeContext';
import type { DailySnapshot } from '../lib/questsEngine';

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
  const insets = useSafeAreaInsets();
  const { antrenamente, loading, refresh } = useAntrenamente();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const snapshot = useMemo(() => snapshotFrom(antrenamente), [antrenamente]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Înapoi" style={[styles.iconButton, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Progres sport</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Questuri și exercițiile de azi</Text>
        </View>
        <Pressable onPress={() => router.push('/jurnal-antrenamente')} accessibilityRole="button" accessibilityLabel="Deschide jurnalul complet" style={[styles.iconButton, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <History size={20} color={colors.accent} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.accent} /><Text style={{ color: colors.textSecondary }}>Se încarcă progresul…</Text></View>
      ) : (
        <FlatList
          data={antrenamente}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={refresh}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
          ListHeaderComponent={
            <View style={styles.topContent}>
              <DailyQuestsCard snapshot={snapshot} />
              <View style={styles.summaryRow}>
                {[
                  [snapshot.exercises, 'exerciții', colors.accent],
                  [snapshot.sets, 'seturi', colors.accentSecondary],
                  [Math.round(snapshot.volumeKg), 'kg volum', colors.warning],
                ].map(([value, label, color]) => (
                  <View key={String(label)} style={[styles.summary, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
                    <Text style={[styles.summaryValue, { color: String(color) }]}>{String(value)}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{String(label)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.sectionHeader}><Dumbbell size={18} color={colors.accent} /><Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Antrenamentele de azi</Text></View>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
              <Dumbbell size={34} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Niciun antrenament azi</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Seturile salvate în Sport vor apărea aici și vor actualiza questurile.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOpen = Boolean(expanded[item.id]);
            return (
              <View style={[styles.workoutCard, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
                <Pressable onPress={() => setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))} accessibilityRole="button" accessibilityLabel={`${isOpen ? 'Închide' : 'Deschide'} ${item.nume}`} style={styles.workoutHeader}>
                  <View style={styles.workoutCopy}>
                    <Text style={[styles.workoutName, { color: colors.textPrimary }]}>{item.nume}</Text>
                    <View style={styles.metaRow}><Clock size={13} color={colors.textTertiary} /><Text style={[styles.meta, { color: colors.textSecondary }]}>{item.durata_min} min • {item.exercitii?.length || 0} exerciții</Text>{item.is_local ? <Text style={[styles.localTag, { color: colors.warning }]}>local</Text> : null}</View>
                  </View>
                  {isOpen ? <ChevronUp size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />}
                </Pressable>
                {isOpen ? (
                  <View style={[styles.exerciseList, { borderTopColor: colors.border }]}>
                    {(item.exercitii || []).map((exercise, exerciseIndex) => (
                      <View key={`${exercise.exercitiuId}-${exerciseIndex}`} style={styles.exercise}>
                        <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{exercise.nume}</Text>
                        <View style={styles.setList}>
                          {(exercise.seturi || []).map((set, setIndex) => (
                            <View key={setIndex} style={[styles.setPill, { backgroundColor: colors.background }]}>
                              <Text style={[styles.setText, { color: colors.textSecondary }]}>#{set.serie || setIndex + 1}</Text>
                              <Text style={[styles.setValue, { color: colors.accent }]}>{set.repetari} rep</Text>
                              <Text style={[styles.setValue, { color: colors.textPrimary }]}>× {set.greutate || 0} kg</Text>
                              {set.set_type === 'warmup' ? <Text style={[styles.warmup, { color: colors.warning }]}>încălzire</Text> : null}
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
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
  workoutCard: { borderRadius: 18, borderWidth: 1, marginTop: 12, overflow: 'hidden' }, workoutHeader: { minHeight: 68, flexDirection: 'row', alignItems: 'center', padding: 15 }, workoutCopy: { flex: 1 }, workoutName: { fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 5 }, meta: { fontSize: 12, fontWeight: '600' }, localTag: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  exerciseList: { borderTopWidth: 1, padding: 15 }, exercise: { marginBottom: 14 }, exerciseName: { fontSize: 14, fontWeight: '800', marginBottom: 7 }, setList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  setPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 }, setText: { fontSize: 11, fontWeight: '700' }, setValue: { fontSize: 12, fontWeight: '800' }, warmup: { fontSize: 9, fontWeight: '900' },
});
