
import React, { useMemo, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useWindowDimensions, View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Flame, Target, Play, CheckCircle2, ChevronDown, ChevronUp, Search, Dumbbell, PersonStanding, Activity, MoveUp, Plus } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import KeyboardAwareScreen, {
  CONTENT_BOTTOM_PADDING,
} from '../../components/ui/KeyboardAwareScreen';
import { MuscleBody } from '../../components/fitness/MuscleBody';
import { mapToCanonicalMuscleIds } from '../../lib/fitnessEngine';
import type { MuscleId } from '../../components/fitness/heatColor';
import {
  CATEGORII,
  type Categorie,
  type Exercitiu,
} from '../../constants/exercitii';
import { Stepper } from '../../components/ui/Stepper';
import { Spacing, Radius } from '../../constants/theme';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { useTheme } from '../../context/ThemeContext';
import { useAntrenamente, type SetExercitiu } from '../../hooks/useAntrenamente';
import { useNotify } from '../../hooks/useNotify';
import { useExercitii } from '../../hooks/useExercitii';

// ---- Constants --------------------------------------------------------------

const MAP_HEIGHT = 380;
const CTA_COLOR = '#0EA5E9';

const CATEGORY_ICON: Record<Categorie, keyof typeof MaterialCommunityIcons.glyphMap> = {
  piept: 'weight-lifter',
  spate: 'weight',
  picioare: 'human-handsdown',
  umeri: 'arm-flex',
  brate: 'dumbbell',
  abdomen: 'fire',
  cardio: 'run-fast',
  'full-body': 'star-four-points',
  mobilitate: 'yoga',
  superior: 'weight-lifter',
  inferior: 'human-handsdown',
  core: 'fire',
  corp_intreg: 'star-four-points',
};

// ---- Helpers ----------------------------------------------------------------

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const formatNumber = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');

interface LocalExercitiuInAntrenament {
  exercitiuId: string;
  nume: string;
  seturi: SetExercitiu[];
  durataMin: number;
  kcal: number;
}

// ---- Component --------------------------------------------------------------

export default function AntrenamenteScreen() {
  // FIX UI: Dimensions.get la nivel de modul nu se actualizeaza la rotire/split-screen.
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { colors } = useTheme();
  const { adaugaAntrenament } = useAntrenamente();
  const notify = useNotify();

  const [selectedCategory, setSelectedCategory] = useState<Categorie>('piept');
  const [searchQuery, setSearchQuery] = useState('');
  const { exercitii } = useExercitii();

  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');

  useEffect(() => {
    if (!selectedExerciseId && exercitii.length > 0) {
      const first = exercitii.find((e) => e.categorie === selectedCategory) ?? exercitii[0];
      if (first) setSelectedExerciseId(first.id);
    }
  }, [exercitii, selectedCategory, selectedExerciseId]);

  const [weightInput, setWeightInput] = useState<string>('0');
  const [repsInput, setRepsInput] = useState<string>('10');
  const [session, setSession] = useState<Record<string, SetExercitiu[]>>({});

  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await AsyncStorage.getItem('current_workout_session');
        if (data) setSession(JSON.parse(data));
      } catch (e) {}
    };
    loadSession();
  }, []);

  const exercisesInCategory = useMemo(() => {
    let filtered = exercitii.filter((e) => e.categorie === selectedCategory);
    if (searchQuery.trim().length > 0) {
      filtered = filtered.filter(e => e.nume.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return filtered;
  }, [selectedCategory, exercitii, searchQuery]);

  const selectedExercise: Exercitiu | undefined = useMemo(
    () => exercitii.find((e) => e.id === selectedExerciseId) ?? exercitii[0],
    [selectedExerciseId, exercitii],
  );

  const exerciseIntensity = useMemo<Partial<Record<MuscleId, number>>>(() => {
    const out: Partial<Record<MuscleId, number>> = {};
    if (!selectedExercise?.muschiTinta) return out;
    for (const [k, pct] of Object.entries(selectedExercise.muschiTinta)) {
      const canonicals = mapToCanonicalMuscleIds(k);
      for (const { id, weight } of canonicals) {
        out[id] = Math.max(out[id] ?? 0, (Number(pct) / 100) * weight);
      }
    }
    return out;
  }, [selectedExercise]);

  const activeMuscleCount = useMemo(
    () => Object.values(exerciseIntensity).filter((v) => (v ?? 0) >= 0.25).length,
    [exerciseIntensity],
  );

  const sessionSets = selectedExercise ? (session[selectedExercise.id] ?? []) : [];
  const nextSetNumber = sessionSets.length + 1;

  if (!selectedExercise || exercitii.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, justifyContent: 'center' }}>
         <SkeletonLoader width="100%" height={200} style={{ marginBottom: 20 }} />
         <SkeletonLoader width="100%" height={100} style={{ marginBottom: 20 }} />
         <SkeletonLoader width="100%" height={100} />
      </View>
    );
  }

  const onSelectCategory = (cat: Categorie) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(cat);
    const first = exercitii.find((e) => e.categorie === cat);
    if (first) {
      setSelectedExerciseId(first.id);
      setWeightInput(
        first.masurare?.defaultWeightKg != null ? String(first.masurare.defaultWeightKg) : '0',
      );
      setRepsInput(String(first.repetariDefault || 10));
    }
  };

  const onSelectExercise = (ex: Exercitiu) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedExerciseId === ex.id) {
       // Toggle off? Actually just keep it open or let user scroll. We'll leave it as setting it.
    }
    setSelectedExerciseId(ex.id);
    setWeightInput(
      ex.masurare?.defaultWeightKg != null ? String(ex.masurare.defaultWeightKg) : '0',
    );
    setRepsInput(String(ex.repetariDefault || 10));
  };

  const adjust = (
    setter: (v: string) => void,
    current: string,
    step: number,
    min: number,
    max: number,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const parsed = parseFloat(current.replace(',', '.')) || 0;
    setter(formatNumber(clamp(parsed + step, min, max)));
  };

  const handleRecordSet = () => {
    const weight = parseFloat(weightInput.replace(',', '.')) || 0;
    const reps = parseInt(repsInput, 10) || 0;

    if (reps <= 0) {
      notify.warning('Repetări invalide', 'Introdu un număr valid de repetări.');
      return;
    }

    const newSet: SetExercitiu = {
      serie: nextSetNumber,
      repetari: reps,
      greutate: weight,
      set_type: 'working',
      completed: true,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSession((prev) => {
      const next = {
        ...prev,
        [selectedExercise.id]: [...(prev[selectedExercise.id] ?? []), newSet],
      };
      AsyncStorage.setItem('current_workout_session', JSON.stringify(next)).catch(() => {});
      return next;
    });

    notify.success(
      `Set ${nextSetNumber} înregistrat`,
      `${formatNumber(weight)} kg × ${reps} rep`,
    );
  };

  const handleSaveWorkout = async () => {
    const entries = Object.entries(session);
    if (entries.length === 0) {
      notify.warning('Nimic de salvat', 'Înregistrează cel puțin un set.');
      return;
    }

    const totalSets = entries.reduce((s, [, sets]) => s + sets.length, 0);
    const durataMin = Math.max(1, Math.round(totalSets * 1.5));
    const volum = entries.reduce(
      (s, [, sets]) => s + sets.reduce((v, x) => v + (x.greutate ?? 0) * x.repetari, 0),
      0,
    );

    const exercitiiInAntrenament: LocalExercitiuInAntrenament[] = entries
      .map(([exId, sets]) => {
        const ex = exercitii.find((e) => e.id === exId);
        if (!ex) return null;
        return {
          exercitiuId: exId,
          nume: ex.nume,
          seturi: sets,
          durataMin,
          kcal: Math.round((ex.caloriiPeMinut ?? 6) * durataMin),
        };
      })
      .filter((v): v is LocalExercitiuInAntrenament => v !== null);

    await adaugaAntrenament({
      nume: `Antrenament ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', month: 'short', day: 'numeric' })}`,
      tip: selectedCategory,
      durata_min: durataMin,
      calorii_arse: exercitiiInAntrenament.reduce((s, e) => s + e.kcal, 0),
      met: selectedExercise.met,
      exercitii: exercitiiInAntrenament,
      volum_total: Math.round(volum),
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    notify.success(
      'Antrenament salvat',
      `${totalSets} seturi • ${Math.round(volum)} kg volum`,
    );
    setSession({});
    AsyncStorage.removeItem('current_workout_session').catch(() => {});
  };

  return (
    <KeyboardAwareScreen style={{ backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: CONTENT_BOTTOM_PADDING }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Anatomy</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Select an exercise to see targeted muscles
            </Text>
          </View>
        </View>

        <View style={[styles.mapContainer, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', width: '100%', height: MAP_HEIGHT - 40, paddingVertical: 10 }}>
            <MuscleBody
              side="front"
              intensity={exerciseIntensity}
              width={(SCREEN_WIDTH - Spacing.lg * 2) * 0.45}
              height={MAP_HEIGHT - 40}
            />
            <MuscleBody
              side="back"
              intensity={exerciseIntensity}
              width={(SCREEN_WIDTH - Spacing.lg * 2) * 0.45}
              height={MAP_HEIGHT - 40}
            />
          </View>
          <View style={styles.mapLegend}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>
              {activeMuscleCount > 0
                ? `${activeMuscleCount} mușchi activi`
                : 'Selectează un exercițiu'}
            </Text>
          </View>
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated }]}>
          <Search color={colors.textSecondary} size={20} style={{ marginRight: 10 }} />
          <TextInput
            placeholder="Caută exercițiu..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 10 }]}>Targeted Exercises</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hScroll}
        >
          {CATEGORII.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => onSelectCategory(cat.id)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: active ? colors.accent : colors.surfaceElevated,
                    borderColor: active ? colors.accent : colors.cardBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={CATEGORY_ICON[cat.id]}
                  size={18}
                  color={active ? '#0B0F14' : colors.textSecondary}
                />
                <Text style={[styles.pillText, { color: active ? '#0B0F14' : colors.textPrimary }]}>
                  {cat.nume}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.vScroll}>
          {exercisesInCategory.map((ex) => {
            const active = selectedExerciseId === ex.id;
            const exSets = session[ex.id] || [];
            
            return (
              <View key={ex.id} style={{ marginBottom: Spacing.md }}>
                <Pressable
                  onPress={() => onSelectExercise(ex)}
                  style={[
                    styles.verticalCard,
                    {
                      backgroundColor: active ? colors.surfaceElevated : colors.surface,
                      borderColor: active ? colors.accent : colors.cardBorder,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: active ? 0.2 : 0.05,
                      shadowRadius: 8,
                      elevation: active ? 4 : 1,
                      borderBottomLeftRadius: active ? 0 : Radius.md,
                      borderBottomRightRadius: active ? 0 : Radius.md,
                    },
                  ]}
                >
                  <View style={[styles.verticalIcon, { backgroundColor: active ? colors.accent : colors.surfaceElevated }]}>
                    {ex.categorie === 'piept' || ex.categorie === 'spate' || ex.categorie === 'brate' || ex.categorie === 'umeri' ? (
                      <Dumbbell size={20} color={active ? '#0B0F14' : colors.textSecondary} />
                    ) : ex.categorie === 'picioare' || ex.categorie === 'abdomen' ? (
                      <PersonStanding size={20} color={active ? '#0B0F14' : colors.textSecondary} />
                    ) : ex.categorie === 'cardio' ? (
                      <Activity size={20} color={active ? '#0B0F14' : colors.textSecondary} />
                    ) : (
                      <MoveUp size={20} color={active ? '#0B0F14' : colors.textSecondary} />
                    )}
                  </View>
                  
                  <View style={styles.verticalTextWrap}>
                    <Text style={[styles.verticalName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {ex.nume}
                    </Text>
                    <Text style={[styles.verticalSub, { color: colors.textTertiary }]} numberOfLines={1}>
                      {ex.grupe.join(', ')} • {ex.dificultate || 'Medium'}
                    </Text>
                  </View>
                  
                  <View style={[styles.verticalAction, { backgroundColor: active ? colors.accent : colors.surfaceElevated }]}>
                    {active ? (
                      <ChevronUp size={16} color="#0B0F14" />
                    ) : (
                      <Play size={16} color={colors.textSecondary} fill={colors.textSecondary} />
                    )}
                  </View>
                </Pressable>

                {/* EXPANDABLE TRACKER */}
                {active && (
                   <View style={[styles.trackerCardExpanded, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                        <Text style={[styles.trackerTitle, { color: colors.textPrimary }]}>Track Set</Text>
                        <Text style={[styles.trackerSubBadge, { color: colors.accent }]}>{exSets.length} sets done</Text>
                     </View>
                     
                     <Stepper
                       key={`w-${ex.id}`}
                       label="Greutate"
                       value={weightInput}
                       onDec={() => adjust(setWeightInput, weightInput, -2.5, 0, 1000)}
                       onInc={() => adjust(setWeightInput, weightInput, 2.5, 0, 1000)}
                       suffix="kg"
                       onTextChange={setWeightInput}
                       colors={colors}
                     />
                     <Stepper
                       key={`r-${ex.id}`}
                       label="Repetări"
                       value={repsInput}
                       onDec={() => adjust(setRepsInput, repsInput, -1, 0, 500)}
                       onInc={() => adjust(setRepsInput, repsInput, 1, 0, 500)}
                       suffix="rep"
                       onTextChange={setRepsInput}
                       colors={colors}
                     />
                     
                     <Pressable
                       onPress={handleRecordSet}
                       style={({ pressed }) => [
                         styles.ctaButton,
                         { backgroundColor: CTA_COLOR, opacity: pressed ? 0.85 : 1 },
                       ]}
                     >
                       <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
                       <Text style={styles.ctaText}>Add Set</Text>
                     </Pressable>
                   </View>
                )}
              </View>
            );
          })}
        </View>

        {Object.keys(session).length > 0 && (
          <Pressable
            onPress={handleSaveWorkout}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="content-save" size={20} color="#0B0F14" />
            <Text style={[styles.saveText, { color: '#0B0F14' }]}>Salvează antrenamentul</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

// ---- StyleSheet -------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.lg,
  } as ViewStyle,

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  } as ViewStyle,

  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  } as TextStyle,

  subtitle: {
    fontSize: 13,
    marginTop: 2,
  } as TextStyle,

  mapContainer: {
    height: MAP_HEIGHT,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    paddingTop: 10,
    paddingBottom: 20,
  } as ViewStyle,

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  } as ViewStyle,

  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  } as TextStyle,

  mapLegend: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  } as ViewStyle,

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  } as ViewStyle,

  legendText: {
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  } as TextStyle,

  hScroll: {
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  } as ViewStyle,
  
  vScroll: {
    marginTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  } as ViewStyle,

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    gap: 6,
  } as ViewStyle,

  pillText: {
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,

  verticalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  } as ViewStyle,

  verticalIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  } as ViewStyle,

  verticalTextWrap: {
    flex: 1,
    justifyContent: 'center',
  } as ViewStyle,

  verticalName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  } as TextStyle,

  verticalSub: {
    fontSize: 12,
    marginTop: 2,
  } as TextStyle,

  verticalAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  } as ViewStyle,

  trackerCardExpanded: {
    padding: Spacing.lg,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
  } as ViewStyle,

  trackerTitle: {
    fontSize: 16,
    fontWeight: '700',
  } as TextStyle,

  trackerSubBadge: {
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  } as ViewStyle,

  stepperLabel: {
    fontSize: 14,
    fontWeight: '700',
  } as TextStyle,

  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  } as ViewStyle,

  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,

  stepperValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 72,
    justifyContent: 'center',
    gap: 4,
  } as ViewStyle,

  stepperValue: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
  } as TextStyle,

  stepperSuffix: {
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,

  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: Radius.pill,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  } as ViewStyle,

  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  } as TextStyle,

  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: Radius.pill,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  } as ViewStyle,

  saveText: {
    fontSize: 16,
    fontWeight: '800',
  } as TextStyle,
});