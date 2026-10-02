import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Dumbbell, Play, Save, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { WORKOUT_V2_PRESETS } from '../../constants/workout-v2/presets';
import type { V2MuscleId } from '../../constants/workout-v2/muscles';
import { useTheme } from '../../context/ThemeContext';
import {
  getWorkoutV2PreviewProfile,
  WORKOUT_V2_PREVIEW_PROFILES,
  type WorkoutV2PreviewProfileId,
} from '../../lib/workout-v2/previewFixtures';
import {
  addActualSet,
  completeCardioBlock,
  completeSet,
  startWorkoutFromTemplate,
  validateSessionForFinish,
  type ActiveWorkoutSession,
} from '../../lib/workout-v2/sessionModel';
import {
  addTemplateExercise,
  duplicateTemplateBlock,
  instantiatePreset,
  moveTemplateBlock,
  removeTemplateBlock,
  updateCardioTemplateBlock,
  updateTemplateBlock,
  type CardioTemplateBlock,
  type StrengthTemplateBlock,
  type WorkoutTemplate,
} from '../../lib/workout-v2/templateModel';
import { toWorkoutHistoryPayload } from '../../lib/workout-v2/historyAdapter';
import type { WorkoutV2ExerciseId } from '../../constants/workout-v2/exercises';
import type { WorkoutV2Performance } from '../../lib/workout-v2/strengthEngine';
import { useStrengthMap } from '../../hooks/workout-v2/useStrengthMap';
import { ActiveWorkout } from './ActiveWorkout';
import { AnatomyV2Legend } from './AnatomyV2Legend';
import { AnatomyV2Map } from './AnatomyV2Map';
import { MuscleDetailSheet } from './MuscleDetailSheet';
import { StrengthSummary } from './StrengthSummary';
import { TemplateBuilder } from './TemplateBuilder';

type ExperienceView = 'browse' | 'build' | 'active' | 'summary' | 'strength';

export function WorkoutV2Experience({ nowIso = '2026-09-26T12:00:00.000Z' }: { nowIso?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sequence = useRef(0);
  const id = (prefix: string) => `${prefix}-${++sequence.current}`;
  const [view, setView] = useState<ExperienceView>('browse');
  const [draft, setDraft] = useState<WorkoutTemplate | null>(null);
  const [templates, setTemplates] = useState<readonly WorkoutTemplate[]>([]);
  const [active, setActive] = useState<ActiveWorkoutSession | null>(null);
  const [history, setHistory] = useState<readonly WorkoutV2Performance[]>([]);
  const [profileId, setProfileId] = useState<WorkoutV2PreviewProfileId>('no-data');
  const [selectedMuscle, setSelectedMuscle] = useState<V2MuscleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profile = getWorkoutV2PreviewProfile(profileId);
  const strength = useStrengthMap([...profile.performances, ...history], profile.bodyweightKg, nowIso);
  const anatomyScores = useMemo(() => Object.fromEntries(
    Object.entries(strength.muscles).map(([muscleId, result]) => [muscleId, result.score ?? undefined]),
  ), [strength.muscles]);

  const openPreset = (presetIndex: number) => {
    const preset = WORKOUT_V2_PRESETS[presetIndex];
    const next = instantiatePreset(preset, 'preview-user', id('template'), nowIso);
    setDraft({ ...next, name: t(preset.nameKey) });
    setError(null);
    setView('build');
  };

  const requireDraft = (operation: (template: WorkoutTemplate) => WorkoutTemplate) => {
    setDraft((current) => current ? operation(current) : current);
  };

  const saveDraft = () => {
    if (!draft || !draft.name.trim() || draft.blocks.length === 0) {
      setError(t('workoutV2.experience.invalidTemplate'));
      return;
    }
    setTemplates((current) => [...current.filter((item) => item.id !== draft.id), draft]);
    setError(null);
  };

  const startDraft = () => {
    if (!draft || draft.blocks.length === 0) {
      setError(t('workoutV2.experience.invalidTemplate'));
      return;
    }
    setActive(startWorkoutFromTemplate(draft, id('session'), nowIso));
    setError(null);
    setView('active');
  };

  const finishActive = () => {
    if (!active) return;
    const errors = validateSessionForFinish(active);
    if (errors.length) {
      setError(t('workoutV2.experience.incompleteWorkout'));
      return;
    }
    // The adapter validation is the preview persistence boundary. If it throws,
    // no success state is shown and the active session remains intact.
    toWorkoutHistoryPayload(active, nowIso);
    const completed: WorkoutV2Performance[] = active.blocks.flatMap((block) => block.kind === 'strength'
      ? block.sets.filter((set) => set.completed).map((set) => ({
          id: `${active.id}:${set.id}`,
          sessionId: active.id,
          exerciseId: block.exerciseId,
          performedAt: nowIso,
          reps: set.actualReps ?? 0,
          weightKg: set.actualWeightKg,
          assistanceWeightKg: set.assistanceWeightKg,
          setType: 'working' as const,
        }))
      : []);
    setHistory((current) => [...current, ...completed]);
    setActive(null);
    setError(null);
    setView('summary');
  };

  if (view === 'active' && active) {
    return (
      <View style={styles.section}>
        <BackButton onPress={() => setView('build')} />
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <ActiveWorkout
          session={active}
          onCompleteSet={(blockId, setId, actual) => setActive((current) => current ? completeSet(current, blockId, setId, actual) : current)}
          onAddSet={(blockId) => setActive((current) => current ? addActualSet(current, blockId, id('set')) : current)}
          onCompleteCardio={(blockId, actual) => setActive((current) => current ? completeCardioBlock(current, blockId, actual) : current)}
          onFinish={finishActive}
        />
      </View>
    );
  }

  if (view === 'build' && draft) {
    return (
      <View style={styles.section}>
        <BackButton onPress={() => setView('browse')} />
        <TemplateBuilder
          template={draft}
          error={error}
          onNameChange={(name) => requireDraft((template) => ({ ...template, name }))}
          onAddExercise={(exerciseId: WorkoutV2ExerciseId) => requireDraft((template) => addTemplateExercise(template, exerciseId, id('block'), nowIso))}
          onRemoveBlock={(blockId) => requireDraft((template) => removeTemplateBlock(template, blockId, nowIso))}
          onDuplicateBlock={(blockId) => requireDraft((template) => duplicateTemplateBlock(template, blockId, id('block'), nowIso))}
          onMoveBlock={(from, to) => requireDraft((template) => moveTemplateBlock(template, from, to, nowIso))}
          onChangeStrengthBlock={(blockId, update: Partial<StrengthTemplateBlock>) => requireDraft((template) => updateTemplateBlock(template, blockId, update, nowIso))}
          onChangeCardioBlock={(blockId, update: Partial<CardioTemplateBlock>) => requireDraft((template) => updateCardioTemplateBlock(template, blockId, update, nowIso))}
          onSave={saveDraft}
        />
        <Pressable testID="workout-v2-start" accessibilityRole="button" accessibilityLabel={t('workoutV2.experience.start')} onPress={startDraft} style={[styles.primary, { backgroundColor: colors.accent }]}>
          <Play size={18} color={colors.textOnAccent} />
          <Text style={[styles.primaryText, { color: colors.textOnAccent }]}>{t('workoutV2.experience.start')}</Text>
        </Pressable>
      </View>
    );
  }

  if (view === 'strength' || view === 'summary') {
    const muscle = selectedMuscle ? strength.muscles[selectedMuscle] : null;
    return (
      <View style={styles.section}>
        <BackButton onPress={() => setView('browse')} />
        <View style={styles.profileRow}>
          {WORKOUT_V2_PREVIEW_PROFILES.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: profileId === item.id }} onPress={() => setProfileId(item.id)} style={[styles.profileChip, { borderColor: profileId === item.id ? colors.accent : colors.border, backgroundColor: colors.surfaceBg }]}>
              <Text numberOfLines={2} style={[styles.profileText, { color: colors.textPrimary }]}>{t(item.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
        <StrengthSummary result={strength} />
        <View style={[styles.anatomyCard, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <AnatomyV2Map mode={{ mode: 'strength', scores: anatomyScores }} selectedMuscle={selectedMuscle} onSelectMuscle={setSelectedMuscle} />
          <AnatomyV2Legend mode="strength" />
        </View>
        {muscle ? <MuscleDetailSheet result={muscle} onClose={() => setSelectedMuscle(null)} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={[styles.hero, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
        <Dumbbell size={24} color={colors.accent} />
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{t('workoutV2.experience.title')}</Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>{t('workoutV2.experience.subtitle')}</Text>
        </View>
        <Pressable testID="workout-v2-strength" accessibilityRole="button" accessibilityLabel={t('workoutV2.experience.openStrength')} onPress={() => setView('strength')} style={styles.heroAction}>
          <TrendingUp size={20} color={colors.accentTertiary} />
        </Pressable>
      </View>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('workoutV2.experience.presets')}</Text>
      <View style={styles.grid}>
        {WORKOUT_V2_PRESETS.map((preset, index) => (
          <Pressable key={preset.id} testID={`workout-v2-preset-${preset.id}`} accessibilityRole="button" accessibilityLabel={t('workoutV2.experience.editPreset', { name: t(preset.nameKey) })} onPress={() => openPreset(index)} style={[styles.preset, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
            <Text numberOfLines={2} style={[styles.presetTitle, { color: colors.textPrimary }]}>{t(preset.nameKey)}</Text>
            <Text style={[styles.presetMeta, { color: colors.textSecondary }]}>{t('workoutV2.experience.exerciseCount', { count: preset.blocks.length })}</Text>
          </Pressable>
        ))}
      </View>
      {templates.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('workoutV2.experience.saved')}</Text>
          {templates.map((template) => (
            <Pressable key={template.id} accessibilityRole="button" onPress={() => { setDraft(template); setView('build'); }} style={[styles.saved, { borderColor: colors.border }]}>
              <Save size={17} color={colors.accent} />
              <Text style={[styles.savedText, { color: colors.textPrimary }]}>{template.name}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </View>
  );

  function BackButton({ onPress }: { onPress: () => void }) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onPress} style={[styles.back, { borderColor: colors.border }]}>
        <ArrowLeft size={18} color={colors.textPrimary} />
        <Text style={[styles.backText, { color: colors.textPrimary }]}>{t('common.back')}</Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  section: { width: '100%', gap: 14 },
  hero: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 20, padding: 14 },
  heroCopy: { flex: 1, minWidth: 0 }, heroTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
  heroSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 16 }, heroAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 16, lineHeight: 21, fontWeight: '900' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  preset: { width: '48%', minWidth: 132, minHeight: 76, flexGrow: 1, justifyContent: 'center', borderWidth: 1, borderRadius: 17, padding: 12 },
  presetTitle: { fontSize: 14, lineHeight: 18, fontWeight: '800' }, presetMeta: { marginTop: 4, fontSize: 11, lineHeight: 15 },
  saved: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  savedText: { flex: 1, fontSize: 14, fontWeight: '800' }, back: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12 },
  backText: { fontSize: 13, fontWeight: '800' }, primary: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15 },
  primaryText: { fontSize: 15, fontWeight: '900' }, error: { fontSize: 13, lineHeight: 18 },
  profileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, profileChip: { minHeight: 44, maxWidth: '48%', flexGrow: 1, justifyContent: 'center', borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 },
  profileText: { fontSize: 11, lineHeight: 15, fontWeight: '700' }, anatomyCard: { width: '100%', alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 12, gap: 10 },
});
