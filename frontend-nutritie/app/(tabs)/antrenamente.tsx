import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useWindowDimensions, View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, type TextStyle, type ViewStyle,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Play, Pause, RotateCcw, ChevronUp, Search, Dumbbell, PersonStanding, Activity,
  MoveUp, Timer, Trash2, Plus,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import KeyboardAwareScreen, { CONTENT_BOTTOM_PADDING } from '../../components/ui/KeyboardAwareScreen';
import BodyMap from '../../components/fitness/BodyMap';
import { mapToCanonicalMuscleIds } from '../../lib/fitnessEngine';
import type { MuscleId } from '../../components/fitness/heatColor';
import { CATEGORII, type Categorie, type Exercitiu } from '../../constants/exercitii';
import { Stepper } from '../../components/ui/Stepper';
import { Spacing, Radius } from '../../constants/theme';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { useTheme } from '../../context/ThemeContext';
import { useAntrenamente } from '../../hooks/useAntrenamente';
import { useNotify } from '../../hooks/useNotify';
import { useExercitii } from '../../hooks/useExercitii';
import {
  describeSet, formatSeconds, formatWeight, getSetFields, summarizeSets, summaryLabel,
  validateLoggedSet, type LoggedSet, type SetFields,
} from '../../lib/workoutSets';

const MAP_HEIGHT = 380;
const CTA_COLOR = '#0EA5E9';
const SESSION_KEY = 'current_workout_session';
const SESSION_META_KEY = 'current_workout_session_meta';
const REST_DEFAULT_SEC = 90;
const ACTIVE_THRESHOLD = 0.05;

// Pictograme per categorie de muschi. Toate numele exista in glyphmap-ul MaterialCommunityIcons
// instalat — alese dupa semnificatie: halterofil pt piept, om intins pt spate, alergator pt picioare,
// inima pt cardio, silueta plina pt full-body etc. (inainte: greutate pt spate, om aplecat pt picioare).
const CATEGORY_ICON: Record<Categorie, keyof typeof MaterialCommunityIcons.glyphMap> = {
  piept: 'weight-lifter', spate: 'human-handsup', picioare: 'run', umeri: 'arm-flex',
  brate: 'dumbbell', abdomen: 'fire', cardio: 'heart-pulse', 'full-body': 'human-male',
  mobilitate: 'yoga', superior: 'weight-lifter', inferior: 'run', core: 'fire',
  corp_intreg: 'human-male',
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const clamp01 = (n: number) => clamp(Number.isFinite(n) ? n : 0, 0, 1);
const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
const formatClock = (totalSec: number) => {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const localDayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type IntensityMap = Partial<Record<MuscleId, number>>;
type InputState = { weight: string; reps: string; time: string };

function baseIntensityFor(ex?: Exercitiu): IntensityMap {
  const out: IntensityMap = {};
  if (!ex) return out;
  const tinta = (ex.muschiTinta ?? {}) as Record<string, number>;
  const keys = Object.keys(tinta);
  let entries: Array<readonly [string, number]>;
  if (keys.length > 0) {
    const maxVal = Math.max(...keys.map((k) => Number(tinta[k]) || 0));
    const divisor = maxVal > 1 ? 100 : 1;
    entries = keys.map((k) => [k, (Number(tinta[k]) || 0) / divisor] as const);
  } else {
    entries = (ex.grupe ?? []).map((g, i) => [g, i === 0 ? 1 : 0.6] as const);
  }
  for (const [key, value] of entries) {
    for (const { id, weight } of mapToCanonicalMuscleIds(key)) {
      out[id] = Math.max(out[id] ?? 0, clamp01(value * weight));
    }
  }
  return out;
}

function unionInto(target: IntensityMap, source: IntensityMap, scale = 1) {
  for (const key of Object.keys(source) as MuscleId[]) {
    const a = target[key] ?? 0;
    const b = clamp01((source[key] ?? 0) * scale);
    target[key] = a + b - a * b;
  }
}

export default function AntrenamenteScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { colors } = useTheme();
  const { adaugaAntrenament } = useAntrenamente();
  const notify = useNotify();
  const { exercitii, loading, refresh } = useExercitii();

  const [selectedCategory, setSelectedCategory] = useState<Categorie>('piept');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [expandedExerciseId, setExpandedExerciseId] = useState<string>('');
  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [warmupFor, setWarmupFor] = useState<string>('');
  const [session, setSession] = useState<Record<string, LoggedSet[]>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [restLeft, setRestLeft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [timerExerciseId, setTimerExerciseId] = useState<string>('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedExerciseId && exercitii.length > 0) {
      const first = exercitii.find((e) => e.categorie === selectedCategory) ?? exercitii[0];
      if (first) setSelectedExerciseId(first.id);
    }
  }, [exercitii, selectedCategory, selectedExerciseId]);

  // Sesiunea salvată se restaurează doar dacă este din ziua locală curentă.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [data, meta] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(SESSION_META_KEY),
        ]);
        if (!active) return;
        const parsedMeta = meta ? (JSON.parse(meta) as { startedAt?: number; day?: string }) : null;
        if (parsedMeta?.day && parsedMeta.day !== localDayKey()) {
          await AsyncStorage.multiRemove([SESSION_KEY, SESSION_META_KEY]);
          return;
        }
        if (data) setSession(JSON.parse(data));
        if (parsedMeta?.startedAt) setStartedAt(parsedMeta.startedAt);
      } catch {
        await AsyncStorage.multiRemove([SESSION_KEY, SESSION_META_KEY]).catch(() => {});
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (restLeft <= 0) return;
    const t = setTimeout(() => setRestLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  // Cronometru pentru exercițiile izometrice (plank, hollow, wall sit).
  useEffect(() => {
    if (!timerExerciseId || timerStartRef.current == null) return;
    const id = setInterval(() => {
      if (timerStartRef.current == null) return;
      setTimerSeconds(Math.round((Date.now() - timerStartRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [timerExerciseId]);

  const persistSession = useCallback((next: Record<string, LoggedSet[]>) => {
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => {
      notify.warning('Salvare locală eșuată', 'Setul poate dispărea dacă închizi aplicația.');
    });
  }, [notify]);

  const exercisesInCategory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pool = q.length > 0 ? exercitii : exercitii.filter((e) => e.categorie === selectedCategory);
    return q.length > 0 ? pool.filter((e) => e.nume.toLowerCase().includes(q)) : pool;
  }, [selectedCategory, exercitii, searchQuery]);

  const selectedExercise: Exercitiu | undefined = useMemo(
    () => exercitii.find((e) => e.id === selectedExerciseId) ?? exercitii[0],
    [selectedExerciseId, exercitii],
  );

  const sessionIntensity = useMemo<IntensityMap>(() => {
    const acc: IntensityMap = {};
    for (const [exId, sets] of Object.entries(session)) {
      if (!sets || sets.length === 0) continue;
      const ex = exercitii.find((e) => e.id === exId);
      if (!ex) continue;
      const working = sets.filter((s) => s.set_type !== 'warmup').length || sets.length;
      unionInto(acc, baseIntensityFor(ex), clamp01(0.45 + 0.25 * working));
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
    let sets = 0; let volume = 0; let seconds = 0;
    for (const [exId, list] of Object.entries(session)) {
      const fields = getSetFields(exercitii.find((e) => e.id === exId));
      for (const s of list) {
        sets += 1;
        seconds += Math.max(0, Number(s.time_seconds) || 0);
        if (s.set_type !== 'warmup' && !fields.usesTime) volume += (s.greutate ?? 0) * (s.repetari || 0);
      }
    }
    return { sets, volume, seconds, exercises: Object.keys(session).filter((k) => session[k]?.length).length };
  }, [session, exercitii]);

  /** Lista "ce ai lucrat" — exercițiile din sesiune, în ordinea logării. */
  const workedExercises = useMemo(() => {
    return Object.entries(session)
      .filter(([, sets]) => sets && sets.length > 0)
      .map(([exId, sets]) => {
        const ex = exercitii.find((e) => e.id === exId);
        const fields = getSetFields(ex);
        return { exId, nume: ex?.nume ?? 'Exercițiu', sets, fields, summary: summarizeSets(sets, fields) };
      });
  }, [session, exercitii]);

  if (!selectedExercise || exercitii.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, justifyContent: 'center' }}>
        <SkeletonLoader width='100%' height={200} style={{ marginBottom: 20 }} />
        <SkeletonLoader width='100%' height={100} style={{ marginBottom: 20 }} />
        <SkeletonLoader width='100%' height={100} />
      </View>
    );
  }

  const defaultsFor = (ex: Exercitiu): InputState => {
    const fields = getSetFields(ex);
    const previous = session[ex.id]?.[session[ex.id].length - 1];
    if (previous) {
      return {
        weight: formatNumber(previous.greutate ?? 0),
        reps: String(previous.repetari || fields.spec.defaultReps || 10),
        time: String(previous.time_seconds || fields.spec.defaultDurationSec || 45),
      };
    }
    return {
      weight: String(fields.spec.defaultWeightKg ?? 0),
      reps: String(fields.spec.defaultReps ?? ex.repetariDefault ?? 10),
      time: String(fields.spec.defaultDurationSec ?? 45),
    };
  };

  const inputFor = (ex: Exercitiu): InputState => inputs[ex.id] ?? defaultsFor(ex);
  const setInputFor = (ex: Exercitiu, patch: Partial<InputState>) =>
    setInputs((prev) => ({ ...prev, [ex.id]: { ...(prev[ex.id] ?? defaultsFor(ex)), ...patch } }));

  const onSelectCategory = (cat: Categorie) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(cat);
    setSearchQuery('');
    const first = exercitii.find((e) => e.categorie === cat);
    if (first) setSelectedExerciseId(first.id);
  };

  const onSelectExercise = (ex: Exercitiu) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (expandedExerciseId === ex.id) { setExpandedExerciseId(''); return; }
    setExpandedExerciseId(ex.id);
    setSelectedExerciseId(ex.id);
    setWarmupFor('');
    if (!inputs[ex.id]) setInputs((prev) => ({ ...prev, [ex.id]: defaultsFor(ex) }));
  };

  const adjust = (ex: Exercitiu, key: keyof InputState, step: number, min: number, max: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const parsed = parseFloat(String(inputFor(ex)[key]).replace(',', '.')) || 0;
    setInputFor(ex, { [key]: formatNumber(clamp(parsed + step, min, max)) } as Partial<InputState>);
  };

  const startTimer = (ex: Exercitiu) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    timerStartRef.current = Date.now();
    setTimerSeconds(0);
    setTimerExerciseId(ex.id);
  };

  const stopTimer = (ex: Exercitiu) => {
    const elapsed = timerStartRef.current ? Math.round((Date.now() - timerStartRef.current) / 1000) : timerSeconds;
    timerStartRef.current = null;
    setTimerExerciseId('');
    setTimerSeconds(0);
    if (elapsed > 0) setInputFor(ex, { time: String(elapsed) });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const resetTimer = () => {
    timerStartRef.current = null;
    setTimerExerciseId('');
    setTimerSeconds(0);
  };

  const handleRecordSet = (ex: Exercitiu) => {
    const fields = getSetFields(ex);
    const current = inputFor(ex);
    const existing = session[ex.id] ?? [];
    const isWarmup = warmupFor === ex.id;

    const newSet: LoggedSet = {
      serie: existing.length + 1,
      repetari: fields.usesTime ? 1 : parseInt(current.reps, 10) || 0,
      greutate: fields.usesWeight ? parseFloat(current.weight.replace(',', '.')) || 0 : 0,
      time_seconds: fields.usesTime ? parseInt(current.time, 10) || 0 : undefined,
      set_type: isWarmup ? 'warmup' : 'working',
      completed: true,
    };

    const error = validateLoggedSet(newSet, fields);
    if (error) { notify.warning('Set incomplet', error); return; }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSession((prev) => {
      const next = { ...prev, [ex.id]: [...(prev[ex.id] ?? []), newSet] };
      persistSession(next);
      return next;
    });

    if (startedAt == null) {
      const now = Date.now();
      setStartedAt(now);
      AsyncStorage.setItem(SESSION_META_KEY, JSON.stringify({ startedAt: now, day: localDayKey() })).catch(() => {});
    }

    setRestLeft(REST_DEFAULT_SEC);
    setWarmupFor('');
    notify.success(`Set ${newSet.serie} înregistrat`, describeSet(newSet, fields));
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
    if (saving) return;
    const entries = Object.entries(session).filter(([, sets]) => sets.length > 0);
    if (entries.length === 0) {
      notify.warning('Nimic de salvat', 'Înregistrează cel puțin un set.');
      return;
    }

    setSaving(true);
    try {
      const totalSets = entries.reduce((s, [, sets]) => s + sets.length, 0);
      const elapsedMin = startedAt ? (Date.now() - startedAt) / 60000 : 0;
      const durataMin = Math.max(1, Math.round(elapsedMin > 0 ? elapsedMin : totalSets * 1.5));
      const perExerciseMin = Math.max(1, Math.round(durataMin / entries.length));

      const exercitiiInAntrenament = entries
        .map(([exId, sets]) => {
          const ex = exercitii.find((e) => e.id === exId);
          if (!ex) return null;
          const fields = getSetFields(ex);
          const summary = summarizeSets(sets, fields);
          const minutes = fields.usesTime && summary.seconds > 0
            ? Math.max(1, Math.round(summary.seconds / 60))
            : perExerciseMin;
          return {
            exercitiuId: exId,
            nume: ex.nume,
            seturi: sets,
            durataMin: minutes,
            kcal: Math.round((ex.caloriiPeMinut ?? 6) * minutes),
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      const result = await adaugaAntrenament({
        nume: `Antrenament ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', month: 'short', day: 'numeric' })}`,
        tip: selectedCategory,
        durata_min: durataMin,
        calorii_arse: exercitiiInAntrenament.reduce((s, e) => s + e.kcal, 0),
        met: selectedExercise.met,
        exercitii: exercitiiInAntrenament,
        volum_total: Math.round(sessionStats.volume),
      });

      // Sesiunea se șterge DOAR dacă salvarea a reușit.
      if (!result) {
        notify.error('Antrenamentul nu a fost salvat', 'Sesiunea a rămas intactă. Încearcă din nou.');
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify.success('Antrenament salvat', `${totalSets} seturi • ${Math.round(sessionStats.volume)} kg volum`);
      setSession({});
      setInputs({});
      setStartedAt(null);
      setRestLeft(0);
      resetTimer();
      AsyncStorage.multiRemove([SESSION_KEY, SESSION_META_KEY]).catch(() => {});
    } catch {
      notify.error('Eroare la salvare', 'Sesiunea a rămas intactă.');
    } finally {
      setSaving(false);
    }
  };

  const bodyWidth = (SCREEN_WIDTH - Spacing.lg * 2) * 0.45;

  const renderTracker = (ex: Exercitiu, fields: SetFields) => {
    const exSets = session[ex.id] ?? [];
    const current = inputFor(ex);
    const timerRunning = timerExerciseId === ex.id;
    const isWarmup = warmupFor === ex.id;

    return (
      <View style={[styles.trackerCardExpanded, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}>
        <View style={styles.trackerHeader}>
          <Text style={[styles.trackerTitle, { color: colors.textPrimary }]}>Logheaзă set</Text>
          <Text style={[styles.modeBadge, { color: colors.accent, borderColor: colors.accent }]}>{fields.modeLabel}</Text>
        </View>

        {exSets.map((s, idx) => (
          <View key={`${ex.id}-${idx}`} style={[styles.setRow, { borderColor: colors.cardBorder }]}>
            <Text style={[styles.setIndex, { color: colors.textTertiary }]}>#{idx + 1}</Text>
            <Text style={[styles.setValue, { color: colors.textPrimary }]}>{describeSet(s, fields)}</Text>
            {s.set_type === 'warmup' && (
              <Text style={[styles.warmupTag, { color: colors.textTertiary, borderColor: colors.cardBorder }]}>încălzire</Text>
            )}
            <Pressable onPress={() => removeSet(ex.id, idx)} accessibilityRole='button' accessibilityLabel={`Șterge setul ${idx + 1}`} hitSlop={8}>
              <Trash2 size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        ))}

        {fields.usesTime ? (
          <View style={[styles.timerBox, { borderColor: timerRunning ? colors.accent : colors.cardBorder }]}>
            <Text style={[styles.timerValue, { color: timerRunning ? colors.accent : colors.textPrimary }]}>
              {formatClock(timerRunning ? timerSeconds : parseInt(current.time, 10) || 0)}
            </Text>
            <View style={styles.timerActions}>
              {timerRunning ? (
                <Pressable onPress={() => stopTimer(ex)} style={[styles.timerBtn, { backgroundColor: colors.accent }]} accessibilityRole='button' accessibilityLabel='Oprește cronometrul'>
                  <Pause size={16} color='#0B0F14' />
                  <Text style={styles.timerBtnText}>Stop</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => startTimer(ex)} style={[styles.timerBtn, { backgroundColor: colors.accent }]} accessibilityRole='button' accessibilityLabel='Pornește cronometrul'>
                  <Play size={16} color='#0B0F14' />
                  <Text style={styles.timerBtnText}>Start</Text>
                </Pressable>
              )}
              <Pressable onPress={resetTimer} style={[styles.timerGhost, { borderColor: colors.cardBorder }]} accessibilityRole='button' accessibilityLabel='Resetează cronometrul'>
                <RotateCcw size={15} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {fields.usesTime ? (
          <Stepper
            key={`t-${ex.id}`}
            label='Durată set'
            value={current.time}
            onDec={() => adjust(ex, 'time', -5, 0, 3600)}
            onInc={() => adjust(ex, 'time', 5, 0, 3600)}
            suffix='sec'
            onTextChange={(v: string) => setInputFor(ex, { time: v })}
            colors={colors}
          />
        ) : (
          <Stepper
            key={`r-${ex.id}`}
            label='Repetări'
            value={current.reps}
            onDec={() => adjust(ex, 'reps', -1, 0, 500)}
            onInc={() => adjust(ex, 'reps', 1, 0, 500)}
            suffix='rep'
            onTextChange={(v: string) => setInputFor(ex, { reps: v })}
            colors={colors}
          />
        )}

        {fields.usesWeight ? (
          <Stepper
            key={`w-${ex.id}`}
            label={fields.weightRequired ? 'Greutate' : 'Greutate (opțional)'}
            value={current.weight}
            onDec={() => adjust(ex, 'weight', -2.5, 0, 1000)}
            onInc={() => adjust(ex, 'weight', 2.5, 0, 1000)}
            suffix='kg'
            onTextChange={(v: string) => setInputFor(ex, { weight: v })}
            colors={colors}
          />
        ) : (
          <Text style={[styles.noWeightHint, { color: colors.textTertiary }]}>
            Exercițiu cu greutatea corpului — nu are câmp de kilograme.
          </Text>
        )}

        <Pressable
          onPress={() => setWarmupFor(isWarmup ? '' : ex.id)}
          accessibilityRole='switch'
          accessibilityState={{ checked: isWarmup }}
          style={[styles.warmupToggle, { borderColor: isWarmup ? colors.accent : colors.cardBorder, backgroundColor: isWarmup ? colors.accent + '22' : 'transparent' }]}
        >
          <Text style={[styles.warmupToggleText, { color: isWarmup ? colors.accent : colors.textSecondary }]}>
            Set de încălzire (nu intră în volum)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleRecordSet(ex)}
          style={({ pressed }) => [styles.ctaButton, { backgroundColor: CTA_COLOR, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole='button'
        >
          <Plus size={20} color='#FFFFFF' />
          <Text style={styles.ctaText}>Adaugă set</Text>
        </Pressable>
      </View>
    );
  };

  // Element din catalogul virtualizat. Închide peste starea sesiunii — FlashList
  // re-randează celulele vizibile când extraData se schimbă, deci doar cardurile
  // de pe ecran se re-randeză la fiecare update de timer/set, nu toate cele 356.
  const renderExerciseItem = ({ item: ex }: { item: Exercitiu }) => {
    const expanded = expandedExerciseId === ex.id;
    const fields = getSetFields(ex);
    const exSets = session[ex.id] ?? [];
    const summary = summarizeSets(exSets, fields);

    return (
      <View style={{ marginBottom: Spacing.md }}>
        <Pressable
          onPress={() => onSelectExercise(ex)}
          accessibilityRole='button'
          accessibilityLabel={expanded ? `Închide ${ex.nume}` : `Deschide ${ex.nume}`}
          style={[styles.verticalCard, {
            backgroundColor: expanded ? colors.surfaceElevated : colors.surface,
            borderColor: expanded ? colors.accent : colors.cardBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: expanded ? 0.2 : 0.05,
            shadowRadius: 8,
            elevation: expanded ? 4 : 1,
            borderBottomLeftRadius: expanded ? 0 : Radius.md,
            borderBottomRightRadius: expanded ? 0 : Radius.md,
          }]}
        >
          <View style={[styles.verticalIcon, { backgroundColor: expanded ? colors.accent : colors.surfaceElevated }]}>
            {fields.usesTime ? (
              <Timer size={20} color={expanded ? '#0B0F14' : colors.textSecondary} />
            ) : ex.categorie === 'piept' || ex.categorie === 'spate' || ex.categorie === 'brate' || ex.categorie === 'umeri' ? (
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
            <Text style={[styles.verticalName, { color: colors.textPrimary }]} numberOfLines={1}>{ex.nume}</Text>
            <Text style={[styles.verticalSub, { color: colors.textTertiary }]} numberOfLines={1}>
              {exSets.length > 0 ? summaryLabel(summary, fields) : `${fields.modeLabel} • ${ex.dificultate || 'mediu'}`}
            </Text>
          </View>

          {exSets.length > 0 ? (
            <View style={[styles.setsBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.setsBadgeText}>{exSets.length}</Text>
            </View>
          ) : null}

          <View style={[styles.verticalAction, { backgroundColor: expanded ? colors.accent : colors.surfaceElevated }]}>
            {expanded ? <ChevronUp size={16} color='#0B0F14' /> : <Play size={16} color={colors.textSecondary} fill={colors.textSecondary} />}
          </View>
        </Pressable>

        {expanded && renderTracker(ex, fields)}
      </View>
    );
  };

  const listHeader = (
    <View>
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
            <BodyMap view="front" intensity={displayIntensity} width={bodyWidth} />
            <BodyMap view="back" intensity={displayIntensity} width={bodyWidth} />
          </View>
          <View style={styles.mapLegend}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>
              {activeMuscleCount > 0 ? `${activeMuscleCount} mușchi activi` : 'Selectează un exercițiu'}
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

        {/* CE AI LUCRAT — exercițiile din sesiunea curentă, cu seturile lor. */}
        {workedExercises.length > 0 && (
          <View style={[styles.workedCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.workedTitle, { color: colors.textPrimary }]}>Ce ai lucrat</Text>
            {workedExercises.map((entry) => (
              <View key={entry.exId} style={styles.workedItem}>
                <View style={styles.workedRow}>
                  <Text style={[styles.workedName, { color: colors.textPrimary }]} numberOfLines={1}>{entry.nume}</Text>
                  <Text style={[styles.workedSummary, { color: colors.accent }]}>{summaryLabel(entry.summary, entry.fields)}</Text>
                </View>
                <View style={styles.workedSets}>
                  {entry.sets.map((s, idx) => (
                    <Text
                      key={`${entry.exId}-chip-${idx}`}
                      style={[styles.setChip, {
                        color: s.set_type === 'warmup' ? colors.textTertiary : colors.textSecondary,
                        borderColor: colors.cardBorder,
                      }]}
                    >
                      {idx + 1}. {describeSet(s, entry.fields)}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {restLeft > 0 && (
          <View style={[styles.restBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}>
            <Timer size={18} color={colors.accent} />
            <Text style={[styles.restText, { color: colors.textPrimary }]}>Pauză {formatClock(restLeft)}</Text>
            <Pressable onPress={() => setRestLeft((s) => s + 15)} style={[styles.restBtn, { borderColor: colors.cardBorder }]} accessibilityRole='button' accessibilityLabel='Prelungește pauza cu 15 secunde'>
              <Text style={[styles.restBtnText, { color: colors.textSecondary }]}>+15s</Text>
            </Pressable>
            <Pressable onPress={() => setRestLeft(0)} style={[styles.restBtn, { borderColor: colors.cardBorder }]} accessibilityRole='button' accessibilityLabel='Sari peste pauză'>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {CATEGORII.map((cat) => {
            const active = selectedCategory === cat.id && searchQuery.trim().length === 0;
            return (
              <Pressable
                key={cat.id}
                onPress={() => onSelectCategory(cat.id)}
                accessibilityRole='button'
                accessibilityLabel={`Categoria ${cat.nume}`}
                style={[styles.pill, { backgroundColor: active ? colors.accent : colors.surfaceElevated, borderColor: active ? colors.accent : colors.cardBorder }]}
              >
                <MaterialCommunityIcons name={CATEGORY_ICON[cat.id]} size={18} color={active ? '#0B0F14' : colors.textSecondary} />
                <Text style={[styles.pillText, { color: active ? '#0B0F14' : colors.textPrimary }]}>{cat.nume}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

      </View>
  );

  return (
    <KeyboardAwareScreen style={{ backgroundColor: colors.background }}>
      <FlashList
        style={{ flex: 1 }}
        data={exercisesInCategory}
        renderItem={renderExerciseItem}
        keyExtractor={(ex: Exercitiu) => ex.id}
        extraData={{ session, inputs, expandedExerciseId, warmupFor, timerExerciseId, timerSeconds, colors }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: CONTENT_BOTTOM_PADDING }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={refresh}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          sessionStats.sets > 0 ? (
            <Pressable
              onPress={handleSaveWorkout}
              disabled={saving}
              accessibilityRole='button'
              accessibilityState={{ disabled: saving, busy: saving }}
              style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.accent, opacity: pressed || saving ? 0.85 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator color='#0B0F14' />
              ) : (
                <>
                  <MaterialCommunityIcons name='content-save' size={20} color='#0B0F14' />
                  <Text style={[styles.saveText, { color: '#0B0F14' }]}>Salvează antrenamentul</Text>
                </>
              )}
            </Pressable>
          ) : null
        }
      />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: Spacing.lg } as ViewStyle,
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md } as ViewStyle,
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 } as TextStyle,
  subtitle: { fontSize: 13, marginTop: 2 } as TextStyle,
  mapContainer: { height: MAP_HEIGHT, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: Spacing.md, paddingTop: 10, paddingBottom: 20 } as ViewStyle,
  mapRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', width: '100%', height: MAP_HEIGHT - 40, paddingVertical: 10 } as ViewStyle,
  sessionBar: { flexDirection: 'row', borderRadius: Radius.md, borderWidth: 1, paddingVertical: Spacing.sm, marginBottom: Spacing.md } as ViewStyle,
  sessionItem: { flex: 1, alignItems: 'center' } as ViewStyle,
  sessionValue: { fontSize: 18, fontWeight: '800' } as TextStyle,
  sessionLabel: { fontSize: 11, marginTop: 2 } as TextStyle,
  workedCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md } as ViewStyle,
  workedTitle: { fontSize: 15, fontWeight: '800', marginBottom: Spacing.sm } as TextStyle,
  workedItem: { marginBottom: Spacing.sm } as ViewStyle,
  workedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm } as ViewStyle,
  workedName: { flex: 1, fontSize: 14, fontWeight: '700' } as TextStyle,
  workedSummary: { fontSize: 12, fontWeight: '800' } as TextStyle,
  workedSets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 } as ViewStyle,
  setChip: { fontSize: 11, fontWeight: '600', borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 } as TextStyle,
  restBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.md } as ViewStyle,
  restText: { flex: 1, fontSize: 14, fontWeight: '700' } as TextStyle,
  restBtn: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 } as ViewStyle,
  restBtnText: { fontSize: 12, fontWeight: '700' } as TextStyle,
  searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderRadius: Radius.md, marginBottom: Spacing.md } as ViewStyle,
  searchInput: { flex: 1, fontSize: 16, padding: 0 } as TextStyle,
  mapLegend: { position: 'absolute', bottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill } as ViewStyle,
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 } as ViewStyle,
  legendText: { fontSize: 12, fontWeight: '600' } as TextStyle,
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: Spacing.md, marginTop: Spacing.sm } as TextStyle,
  hScroll: { paddingBottom: Spacing.lg, gap: Spacing.md } as ViewStyle,
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, borderWidth: 1, gap: 6 } as ViewStyle,
  pillText: { fontSize: 13, fontWeight: '700' } as TextStyle,
  verticalCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 } as ViewStyle,
  verticalIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md } as ViewStyle,
  verticalTextWrap: { flex: 1, justifyContent: 'center' } as ViewStyle,
  verticalName: { fontSize: 16, fontWeight: '700', lineHeight: 22 } as TextStyle,
  verticalSub: { fontSize: 12, marginTop: 2 } as TextStyle,
  setsBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 } as ViewStyle,
  setsBadgeText: { color: '#0B0F14', fontSize: 12, fontWeight: '900' } as TextStyle,
  verticalAction: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.md } as ViewStyle,
  trackerCardExpanded: { padding: Spacing.lg, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: Radius.md, borderBottomRightRadius: Radius.md } as ViewStyle,
  trackerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm } as ViewStyle,
  trackerTitle: { fontSize: 16, fontWeight: '700' } as TextStyle,
  modeBadge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 } as TextStyle,
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderBottomWidth: 1, paddingVertical: Spacing.sm } as ViewStyle,
  setIndex: { fontSize: 12, fontWeight: '700', width: 28 } as TextStyle,
  setValue: { flex: 1, fontSize: 14, fontWeight: '600' } as TextStyle,
  warmupTag: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 } as TextStyle,
  timerBox: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.md, gap: Spacing.sm } as ViewStyle,
  timerValue: { fontSize: 40, fontWeight: '900', letterSpacing: 1 } as TextStyle,
  timerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm } as ViewStyle,
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 22, borderRadius: Radius.pill } as ViewStyle,
  timerBtnText: { color: '#0B0F14', fontSize: 14, fontWeight: '900' } as TextStyle,
  timerGhost: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  noWeightHint: { fontSize: 12, marginTop: Spacing.sm, lineHeight: 16 } as TextStyle,
  warmupToggle: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.sm } as ViewStyle,
  warmupToggleText: { fontSize: 12, fontWeight: '700' } as TextStyle,
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: Radius.pill, gap: Spacing.sm, marginTop: Spacing.md } as ViewStyle,
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' } as TextStyle,
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: Radius.pill, gap: Spacing.sm, marginTop: Spacing.lg } as ViewStyle,
  saveText: { fontSize: 16, fontWeight: '800' } as TextStyle,
});
