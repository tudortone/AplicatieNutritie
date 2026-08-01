
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
import { Play, ChevronUp, Search, Dumbbell, PersonStanding, Activity, MoveUp, Timer, Trash2, Plus } from 'lucide-react-native';
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
const SESSION_KEY = 'current_workout_session';
const SESSION_META_KEY = 'current_workout_session_meta';
const REST_DEFAULT_SEC = 90;
/** Sub acest prag un muschi este considerat neactivat (nu il numaram in legenda). */
const ACTIVE_THRESHOLD = 0.05;

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
const clamp01 = (n: number) => clamp(Number.isFinite(n) ? n : 0, 0, 1);
const formatNumber = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
const formatClock = (totalSec: number) => {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type IntensityMap = Partial<Record<MuscleId, number>>;

/**
 * FIX HARTA: intensitatea unui exercitiu.
 * 1. `muschiTinta` poate veni in procente (0-100) sau in fractii (0-1) — detectam.
 * 2. Daca exercitiul nu are `muschiTinta`, cadem pe `grupe`, altfel exercitiile
 *    fara date detaliate nu colorau NIMIC pe harta.
 * 3. Fiecare cheie trece prin mapToCanonicalMuscleIds, deci si grupele generice
 *    ("picioare", "spate") se distribuie pe toti muschii componenti.
 */
function baseIntensityFor(ex?: Exercitiu): IntensityMap {
  const out: IntensityMap = {};
  if (!ex) return out;

  const tinta = (ex.muschiTinta ?? {}) as Record<string, number>;
  const tintaKeys = Object.keys(tinta);

  let entries: Array<readonly [string, number]>;
  if (tintaKeys.length > 0) {
    const maxVal = Math.max(...tintaKeys.map((k) => Number(tinta[k]) || 0));
    const divisor = maxVal > 1 ? 100 : 1;
    entries = tintaKeys.map((k) => [k, (Number(tinta[k]) || 0) / divisor] as const);
  } else {
    // Prima grupa = motor principal, restul = secundare.
    entries = (ex.grupe ?? []).map((g, i) => [g, i === 0 ? 1 : 0.6] as const);
  }

  for (const [key, value] of entries) {
    for (const { id, weight } of mapToCanonicalMuscleIds(key)) {
      out[id] = Math.max(out[id] ?? 0, clamp01(value * weight));
    }
  }
  return out;
}

/** Reuniune "soft" (probabilistica): a + b - a*b. Doi stimuli medii dau unul mare, dar nu depaseste 1. */
function unionInto(target: IntensityMap, source: IntensityMap, scale = 1) {
  for (const key of Object.keys(source) as MuscleId[]) {
    const a = target[key] ?? 0;
    const b = clamp01((source[key] ?? 0) * scale);
    target[key] = a + b - a * b;
  }
}

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
  /** FIX UI: cardul se poate INCHIDE. Inainte, butonul cu sageata nu facea nimic. */
  const [expandedExerciseId, setExpandedExerciseId] = useState<string>('');

  const [weightInput, setWeightInput] = useState<string>('0');
  const [repsInput, setRepsInput] = useState<string>('10');
  const [isWarmup, setIsWarmup] = useState(false);
  const [session, setSession] = useState<Record<string, SetExercitiu[]>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [restLeft, setRestLeft] = useState(0);
  const restTargetRef = useRef<number>(REST_DEFAULT_SEC);

  useEffect(() => {
    if (!selectedExerciseId && exercitii.length > 0) {
      const first = exercitii.find((e) => e.categorie === selectedCategory) ?? exercitii[0];
      if (first) setSelectedExerciseId(first.id);
    }
  }, [exercitii, selectedCategory, selectedExerciseId]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const [data, meta] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(SESSION_META_KEY),
        ]);
        if (data) setSession(JSON.parse(data));
        if (meta) {
          const parsed = JSON.parse(meta) as { startedAt?: number };
          if (parsed?.startedAt) setStartedAt(parsed.startedAt);
        }
      } catch {
        // sesiune coruptă în storage — pornim curat
      }
    };
    loadSession();
  }, []);

  // Rest timer (countdown de 1s, oprit automat la 0)
  useEffect(() => {
    if (restLeft <= 0) return;
    const t = setTimeout(() => setRestLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  useEffect(() => {
    if (restLeft === 0 && restTargetRef.current > 0) {
      restTargetRef.current = REST_DEFAULT_SEC;
    }
  }, [restLeft]);

  const persistSession = useCallback((next: Record<string, SetExercitiu[]>) => {
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const exercisesInCategory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Cautarea ignora categoria: altfel gaseai doar exercitii din tab-ul curent.
    const pool = q.length > 0 ? exercitii : exercitii.filter((e) => e.categorie === selectedCategory);
    return q.length > 0 ? pool.filter((e) => e.nume.toLowerCase().includes(q)) : pool;
  }, [selectedCategory, exercitii, searchQuery]);

  const selectedExercise: Exercitiu | undefined = useMemo(
    () => exercitii.find((e) => e.id === selectedExerciseId) ?? exercitii[0],
    [selectedExerciseId, exercitii],
  );

  /**
   * FIX HARTA: intensitatea CUMULATA pe sesiune.
   * Inainte harta arata doar exercitiul selectat, deci muschii deja lucrati
   * se stingeau imediat ce schimbai exercitiul.
   */
  const sessionIntensity = useMemo<IntensityMap>(() => {
    const acc: IntensityMap = {};
    for (const [exId, sets] of Object.entries(session)) {
      if (!sets || sets.length === 0) continue;
      const ex = exercitii.find((e) => e.id === exId);
      if (!ex) continue;
      const working = sets.filter((s) => s.set_type !== 'warmup').length || sets.length;
      // 1 set = 70%, 2 seturi = 95%, 3+ seturi = stimul complet
      const scale = clamp01(0.45 + 0.25 * working);
      unionInto(acc, baseIntensityFor(ex), scale);
    }
    return acc;
  }, [session, exercitii]);

  const previewIntensity = useMemo(() => baseIntensityFor(selectedExercise), [selectedExercise]);

  const displayIntensity = useMemo<IntensityMap>(() => {
    const merged: IntensityMap = { ...sessionIntensity };
    unionInto(merged, previewIntensity);
    return merged;
  }, [sessionIntensity, previewIntensity]);

  const activeMuscleCount = useMemo(
    () => Object.values(displayIntensity).filter((v) => (v ?? 0) >= ACTIVE_THRESHOLD).length,
    [displayIntensity],
  );

  const sessionStats = useMemo(() => {
    let sets = 0;
    let volume = 0;
    for (const list of Object.values(session)) {
      for (const s of list) {
        sets += 1;
        if (s.set_type !== 'warmup') volume += (s.greutate ?? 0) * s.repetari;
      }
    }
    return { sets, volume, exercises: Object.keys(session).filter((k) => session[k]?.length).length };
  }, [session]);

  const sessionSets = selectedExercise ? (session[selectedExercise.id] ?? []) : [];
  const nextSetNumber = sessionSets.length + 1;

  if (!selectedExercise || exercitii.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, justifyContent: 'center' }}>
         <SkeletonLoader width='100%' height={200} style={{ marginBottom: 20 }} />
         <SkeletonLoader width='100%' height={100} style={{ marginBottom: 20 }} />
         <SkeletonLoader width='100%' height={100} />
      </View>
    );
  }

  const onSelectCategory = (cat: Categorie) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(cat);
    setSearchQuery('');
    const first = exercitii.find((e) => e.categorie === cat);
    if (first) {
      setSelectedExerciseId(first.id);
      applyDefaultsFor(first);
    }
  };

  /** Preia ultimul set logat pentru exercitiu (ca in aplicatiile pro: "last time"). */
  function applyDefaultsFor(ex: Exercitiu) {
    const previous = session[ex.id]?.[session[ex.id].length - 1];
    if (previous) {
      setWeightInput(formatNumber(previous.greutate ?? 0));
      setRepsInput(String(previous.repetari));
      return;
    }
    setWeightInput(ex.masurare?.defaultWeightKg != null ? String(ex.masurare.defaultWeightKg) : '0');
    setRepsInput(String(ex.repetariDefault || 10));
  }

  const onSelectExercise = (ex: Exercitiu) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // FIX UI: al doilea tap inchide cardul (butonul chiar micsoreaza acum).
    if (expandedExerciseId === ex.id) {
      setExpandedExerciseId('');
      return;
    }
    setExpandedExerciseId(ex.id);
    setSelectedExerciseId(ex.id);
    setIsWarmup(false);
    applyDefaultsFor(ex);
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
      set_type: isWarmup ? 'warmup' : 'working',
      completed: true,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSession((prev) => {
      const next = {
        ...prev,
        [selectedExercise.id]: [...(prev[selectedExercise.id] ?? []), newSet],
      };
      persistSession(next);
      return next;
    });

    if (startedAt == null) {
      const now = Date.now();
      setStartedAt(now);
      AsyncStorage.setItem(SESSION_META_KEY, JSON.stringify({ startedAt: now })).catch(() => {});
    }

    // Pauza intre seturi porneste automat, ca in aplicatiile de forta.
    restTargetRef.current = REST_DEFAULT_SEC;
    setRestLeft(REST_DEFAULT_SEC);
    setIsWarmup(false);

    notify.success(
      `Set ${nextSetNumber} înregistrat`,
      `${formatNumber(weight)} kg × ${reps} rep`,
    );
  };

  const removeSet = (exId: string, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSession((prev) => {
      const list = [...(prev[exId] ?? [])];
      list.splice(index, 1);
      const next = { ...prev };
      if (list.length === 0) delete next[exId];
      else next[exId] = list.map((s, i) => ({ ...s, serie: i + 1 }));
      persistSession(next);
      return next;
    });
  };

  const handleSaveWorkout = async () => {
    const entries = Object.entries(session).filter(([, sets]) => sets.length > 0);
    if (entries.length === 0) {
      notify.warning('Nimic de salvat', 'Înregistrează cel puțin un set.');
      return;
    }

    const totalSets = entries.reduce((s, [, sets]) => s + sets.length, 0);
    // Durata reala a sesiunii daca o stim; altfel estimare pe seturi.
    const elapsedMin = startedAt ? (Date.now() - startedAt) / 60000 : 0;
    const durataMin = Math.max(1, Math.round(elapsedMin > 0 ? elapsedMin : totalSets * 1.5));
    const perExerciseMin = Math.max(1, Math.round(durataMin / entries.length));

    const exercitiiInAntrenament: LocalExercitiuInAntrenament[] = entries
      .map(([exId, sets]) => {
        const ex = exercitii.find((e) => e.id === exId);
        if (!ex) return null;
        return {
          exercitiuId: exId,
          nume: ex.nume,
          seturi: sets,
          durataMin: perExerciseMin,
          kcal: Math.round((ex.caloriiPeMinut ?? 6) * perExerciseMin),
        };
      })
      .filter((v): v is LocalExercitiuInAntrenament => v !== null);

    try {
      const result = await adaugaAntrenament({
        nume: `Antrenament ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', month: 'short', day: 'numeric' })}`,
        tip: selectedCategory,
        durata_min: durataMin,
        calorii_arse: exercitiiInAntrenament.reduce((s, e) => s + e.kcal, 0),
        met: selectedExercise.met,
        exercitii: exercitiiInAntrenament,
        volum_total: Math.round(sessionStats.volume),
      });

      if (result === null) {
        notify.error('Eroare la salvare', 'Antrenamentul nu a putut fi salvat. Încearcă din nou.');
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success(
        'Antrenament salvat',
        `${totalSets} seturi • ${Math.round(sessionStats.volume)} kg volum`,
      );
      setSession({});
      setStartedAt(null);
      setRestLeft(0);
      AsyncStorage.multiRemove([SESSION_KEY, SESSION_META_KEY]).catch(() => {});
    } catch (err: any) {
      notify.error('Eroare la salvare', err?.message || 'Nu s-a putut salva antrenamentul. Verifică conexiunea.');
    }
  };

  const bodyWidth = (SCREEN_WIDTH - Spacing.lg * 2) * 0.45;

  return (
    <KeyboardAwareScreen style={{ backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: CONTENT_BOTTOM_PADDING }]}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Anatomie</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Harta rămâne aprinsă pe tot parcursul sesiunii
            </Text>
          </View>
        </View>

        <View style={[styles.mapContainer, { backgroundColor: colors.surface }]}>
          <View style={styles.mapRow}>
            <MuscleBody side='front' intensity={displayIntensity} width={bodyWidth} height={MAP_HEIGHT - 40} />
            <MuscleBody side='back' intensity={displayIntensity} width={bodyWidth} height={MAP_HEIGHT - 40} />
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

        {sessionStats.sets > 0 && (
          <View style={[styles.sessionBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder }]}>
            <View style={styles.sessionItem}>
              <Text style={[styles.sessionValue, { color: colors.textPrimary }]}>{sessionStats.sets}</Text>
              <Text style={[styles.sessionLabel, { color: colors.textTertiary }]}>seturi</Text>
            </View>
            <View style={styles.sessionItem}>
              <Text style={[styles.sessionValue, { color: colors.textPrimary }]}>{sessionStats.exercises}</Text>
              <Text style={[styles.sessionLabel, { color: colors.textTertiary }]}>exerciții</Text>
            </View>
            <View style={styles.sessionItem}>
              <Text style={[styles.sessionValue, { color: colors.textPrimary }]}>{Math.round(sessionStats.volume)}</Text>
              <Text style={[styles.sessionLabel, { color: colors.textTertiary }]}>kg volum</Text>
            </View>
          </View>
        )}

        {restLeft > 0 && (
          <View style={[styles.restBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}>
            <Timer size={18} color={colors.accent} />
            <Text style={[styles.restText, { color: colors.textPrimary }]}>Pauză {formatClock(restLeft)}</Text>
            <Pressable onPress={() => setRestLeft((s) => s + 15)} style={[styles.restBtn, { borderColor: colors.cardBorder }]}>
              <Text style={[styles.restBtnText, { color: colors.textSecondary }]}>+15s</Text>
            </Pressable>
            <Pressable onPress={() => setRestLeft(0)} style={[styles.restBtn, { borderColor: colors.cardBorder }]}>
              <Text style={[styles.restBtnText, { color: colors.textSecondary }]}>Skip</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated }]}>
          <Search color={colors.textSecondary} size={20} style={{ marginRight: 10 }} />
          <TextInput
            placeholder='Caută exercițiu...'
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 10 }]}>Exerciții</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hScroll}
        >
          {CATEGORII.map((cat) => {
            const active = selectedCategory === cat.id && searchQuery.trim().length === 0;
            return (
              <Pressable
                key={cat.id}
                onPress={() => onSelectCategory(cat.id)}
                accessibilityRole='button'
                accessibilityLabel={`Categoria ${cat.nume}`}
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
            const expanded = expandedExerciseId === ex.id;
            const exSets = session[ex.id] || [];
            const exVolume = exSets.reduce(
              (v, s) => v + (s.set_type === 'warmup' ? 0 : (s.greutate ?? 0) * s.repetari),
              0,
            );

            return (
              <View key={ex.id} style={{ marginBottom: Spacing.md }}>
                <Pressable
                  onPress={() => onSelectExercise(ex)}
                  accessibilityRole='button'
                  accessibilityLabel={expanded ? `Închide ${ex.nume}` : `Deschide ${ex.nume}`}
                  style={[
                    styles.verticalCard,
                    {
                      backgroundColor: expanded ? colors.surfaceElevated : colors.surface,
                      borderColor: expanded ? colors.accent : colors.cardBorder,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: expanded ? 0.2 : 0.05,
                      shadowRadius: 8,
                      elevation: expanded ? 4 : 1,
                      borderBottomLeftRadius: expanded ? 0 : Radius.md,
                      borderBottomRightRadius: expanded ? 0 : Radius.md,
                    },
                  ]}
                >
                  <View style={[styles.verticalIcon, { backgroundColor: expanded ? colors.accent : colors.surfaceElevated }]}>
                    {ex.categorie === 'piept' || ex.categorie === 'spate' || ex.categorie === 'brate' || ex.categorie === 'umeri' ? (
                      <Dumbbell size={20} color={expanded ? '#0B0F14' : colors.textSecondary} />
                    ) : ex.categorie === 'picioare' || ex.categorie === 'abdomen' ? (
                      <PersonStanding size={20} color={expanded ? '#0B0F14' : colors.textSecondary} />
                    ) : ex.categorie === 'cardio' ? (
                      <Activity size={20} color={expanded ? '#0B0F14' : colors.textSecondary} />
                    ) : (
                      <MoveUp size={20} color={expanded ? '#0B0F14' : colors.textSecondary} />
                    )}
                  </View>

                  <View style={styles.verticalTextWrap}>
                    <Text style={[styles.verticalName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {ex.nume}
                    </Text>
                    <Text style={[styles.verticalSub, { color: colors.textTertiary }]} numberOfLines={1}>
                      {exSets.length > 0
                        ? `${exSets.length} seturi • ${Math.round(exVolume)} kg`
                        : `${ex.grupe.join(', ')} • ${ex.dificultate || 'mediu'}`}
                    </Text>
                  </View>

                  <View style={[styles.verticalAction, { backgroundColor: expanded ? colors.accent : colors.surfaceElevated }]}>
                    {expanded ? (
                      <ChevronUp size={16} color='#0B0F14' />
                    ) : (
                      <Play size={16} color={colors.textSecondary} fill={colors.textSecondary} />
                    )}
                  </View>
                </Pressable>

                {/* TRACKER EXPANDABIL */}
                {expanded && (
                   <View style={[styles.trackerCardExpanded, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}>
                     <View style={styles.trackerHeader}>
                        <Text style={[styles.trackerTitle, { color: colors.textPrimary }]}>Loghează set</Text>
                        <Text style={[styles.trackerSubBadge, { color: colors.accent }]}>{exSets.length} seturi</Text>
                     </View>

                     {/* Istoricul seturilor din sesiune, cu stergere */}
                     {exSets.map((s, idx) => (
                       <View key={`${ex.id}-${idx}`} style={[styles.setRow, { borderColor: colors.cardBorder }]}>
                         <Text style={[styles.setIndex, { color: colors.textTertiary }]}>#{idx + 1}</Text>
                         <Text style={[styles.setValue, { color: colors.textPrimary }]}>
                           {formatNumber(s.greutate ?? 0)} kg × {s.repetari}
                         </Text>
                         {s.set_type === 'warmup' && (
                           <Text style={[styles.warmupTag, { color: colors.textTertiary, borderColor: colors.cardBorder }]}>încălzire</Text>
                         )}
                         <Pressable
                           onPress={() => removeSet(ex.id, idx)}
                           accessibilityRole='button'
                           accessibilityLabel={`Șterge setul ${idx + 1}`}
                           hitSlop={8}
                         >
                           <Trash2 size={16} color={colors.textTertiary} />
                         </Pressable>
                       </View>
                     ))}

                     <Stepper
                       key={`w-${ex.id}`}
                       label='Greutate'
                       value={weightInput}
                       onDec={() => adjust(setWeightInput, weightInput, -2.5, 0, 1000)}
                       onInc={() => adjust(setWeightInput, weightInput, 2.5, 0, 1000)}
                       suffix='kg'
                       onTextChange={setWeightInput}
                       colors={colors}
                     />
                     <Stepper
                       key={`r-${ex.id}`}
                       label='Repetări'
                       value={repsInput}
                       onDec={() => adjust(setRepsInput, repsInput, -1, 0, 500)}
                       onInc={() => adjust(setRepsInput, repsInput, 1, 0, 500)}
                       suffix='rep'
                       onTextChange={setRepsInput}
                       colors={colors}
                     />

                     <Pressable
                       onPress={() => setIsWarmup((v) => !v)}
                       accessibilityRole='switch'
                       accessibilityState={{ checked: isWarmup }}
                       style={[
                         styles.warmupToggle,
                         {
                           borderColor: isWarmup ? colors.accent : colors.cardBorder,
                           backgroundColor: isWarmup ? colors.accent + '22' : 'transparent',
                         },
                       ]}
                     >
                       <Text style={[styles.warmupToggleText, { color: isWarmup ? colors.accent : colors.textSecondary }]}>
                         Set de încălzire (nu intră în volum)
                       </Text>
                     </Pressable>

                     <Pressable
                       onPress={handleRecordSet}
                       style={({ pressed }) => [
                         styles.ctaButton,
                         { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
                       ]}
                     >
                       <Plus size={20} color='#FFFFFF' />
                       <Text style={styles.ctaText}>Adaugă set</Text>
                     </Pressable>
                   </View>
                )}
              </View>
            );
          })}
        </View>

        {sessionStats.sets > 0 && (
          <Pressable
            onPress={handleSaveWorkout}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialCommunityIcons name='content-save' size={20} color='#0B0F14' />
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
    marginBottom: Spacing.md,
    paddingTop: 10,
    paddingBottom: 20,
  } as ViewStyle,

  mapRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
    height: MAP_HEIGHT - 40,
    paddingVertical: 10,
  } as ViewStyle,

  sessionBar: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  } as ViewStyle,

  sessionItem: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,

  sessionValue: {
    fontSize: 18,
    fontWeight: '800',
  } as TextStyle,

  sessionLabel: {
    fontSize: 11,
    marginTop: 2,
  } as TextStyle,

  restBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  } as ViewStyle,

  restText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  } as TextStyle,

  restBtn: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  } as ViewStyle,

  restBtnText: {
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,

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

  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  } as ViewStyle,

  trackerTitle: {
    fontSize: 16,
    fontWeight: '700',
  } as TextStyle,

  trackerSubBadge: {
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderBottomWidth: 1,
    paddingVertical: Spacing.sm,
  } as ViewStyle,

  setIndex: {
    fontSize: 12,
    fontWeight: '700',
    width: 28,
  } as TextStyle,

  setValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,

  warmupTag: {
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  } as TextStyle,

  warmupToggle: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  } as ViewStyle,

  warmupToggleText: {
    fontSize: 12,
    fontWeight: '700',
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
