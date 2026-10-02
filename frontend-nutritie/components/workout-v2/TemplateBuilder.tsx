import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { getWorkoutV2Exercise, type WorkoutV2ExerciseId } from '../../constants/workout-v2/exercises';
import { useTheme } from '../../context/ThemeContext';
import type { CardioTemplateBlock, StrengthTemplateBlock, WorkoutTemplate } from '../../lib/workout-v2/templateModel';
import { ExercisePicker } from './ExercisePicker';

interface TemplateBuilderProps {
  template: WorkoutTemplate;
  saving?: boolean;
  error?: string | null;
  onNameChange: (name: string) => void;
  onAddExercise: (exerciseId: WorkoutV2ExerciseId) => void;
  onRemoveBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
  onMoveBlock: (fromIndex: number, toIndex: number) => void;
  onChangeStrengthBlock: (blockId: string, update: Partial<StrengthTemplateBlock>) => void;
  onChangeCardioBlock: (blockId: string, update: Partial<CardioTemplateBlock>) => void;
  onSave: () => void;
}

function numeric(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function TemplateBuilder({
  template, saving = false, error, onNameChange, onAddExercise, onRemoveBlock,
  onDuplicateBlock, onMoveBlock, onChangeStrengthBlock, onChangeCardioBlock, onSave,
}: TemplateBuilderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('workoutV2.builder.name')}</Text>
      <TextInput
        testID="workout-v2-template-name"
        accessibilityLabel={t('workoutV2.builder.name')}
        value={template.name}
        onChangeText={onNameChange}
        style={[styles.nameInput, { color: colors.textPrimary, backgroundColor: colors.surfaceBg, borderColor: colors.border }]}
      />
      {template.blocks.map((block, index) => {
        const exercise = getWorkoutV2Exercise(block.exerciseId);
        return (
          <View key={block.id} testID={`workout-v2-block-${block.id}`} style={[styles.block, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
            <View style={styles.blockHeader}>
              <Text numberOfLines={2} style={[styles.blockTitle, { color: colors.textPrimary }]}>{exercise ? t(exercise.nameKey) : block.exerciseId}</Text>
              <View style={styles.actions}>
                <Pressable testID={`move-up-${block.id}`} accessibilityRole="button" accessibilityLabel={t('workoutV2.builder.moveUp')} disabled={index === 0} onPress={() => onMoveBlock(index, index - 1)} style={styles.iconButton}><ArrowUp size={18} color={index === 0 ? colors.disabledText : colors.textPrimary} /></Pressable>
                <Pressable testID={`move-down-${block.id}`} accessibilityRole="button" accessibilityLabel={t('workoutV2.builder.moveDown')} disabled={index === template.blocks.length - 1} onPress={() => onMoveBlock(index, index + 1)} style={styles.iconButton}><ArrowDown size={18} color={index === template.blocks.length - 1 ? colors.disabledText : colors.textPrimary} /></Pressable>
                <Pressable testID={`duplicate-${block.id}`} accessibilityRole="button" accessibilityLabel={t('workoutV2.builder.duplicate')} onPress={() => onDuplicateBlock(block.id)} style={styles.iconButton}><Copy size={17} color={colors.accentTertiary} /></Pressable>
                <Pressable testID={`remove-${block.id}`} accessibilityRole="button" accessibilityLabel={t('workoutV2.builder.remove')} onPress={() => onRemoveBlock(block.id)} style={styles.iconButton}><Trash2 size={17} color={colors.danger} /></Pressable>
              </View>
            </View>
            {block.kind === 'strength' ? (
              <View style={styles.fields}>
                <TextInput accessibilityLabel={t('workoutV2.builder.sets')} keyboardType="number-pad" value={String(block.sets)} onChangeText={(value) => onChangeStrengthBlock(block.id, { sets: numeric(value) ?? block.sets })} style={[styles.field, { color: colors.textPrimary, borderColor: colors.border }]} />
                <TextInput accessibilityLabel={t('workoutV2.builder.reps')} keyboardType="number-pad" value={String(block.reps)} onChangeText={(value) => onChangeStrengthBlock(block.id, { reps: numeric(value) ?? block.reps })} style={[styles.field, { color: colors.textPrimary, borderColor: colors.border }]} />
                <TextInput accessibilityLabel={t('workoutV2.builder.weight')} keyboardType="decimal-pad" value={block.weightKg === undefined ? '' : String(block.weightKg)} onChangeText={(value) => onChangeStrengthBlock(block.id, { weightKg: numeric(value) })} style={[styles.field, { color: colors.textPrimary, borderColor: colors.border }]} />
                <TextInput accessibilityLabel={t('workoutV2.builder.rest')} keyboardType="number-pad" value={String(block.restSeconds)} onChangeText={(value) => onChangeStrengthBlock(block.id, { restSeconds: numeric(value) ?? block.restSeconds })} style={[styles.field, { color: colors.textPrimary, borderColor: colors.border }]} />
              </View>
            ) : (
              <View style={styles.fields}>
                <TextInput accessibilityLabel={t('workoutV2.builder.duration')} keyboardType="number-pad" value={block.durationSeconds === undefined ? '' : String(block.durationSeconds)} onChangeText={(value) => onChangeCardioBlock(block.id, { durationSeconds: numeric(value) })} style={[styles.field, { color: colors.textPrimary, borderColor: colors.border }]} />
                <TextInput accessibilityLabel={t('workoutV2.builder.distance')} keyboardType="decimal-pad" value={block.distanceKm === undefined ? '' : String(block.distanceKm)} onChangeText={(value) => onChangeCardioBlock(block.id, { distanceKm: numeric(value) })} style={[styles.field, { color: colors.textPrimary, borderColor: colors.border }]} />
              </View>
            )}
          </View>
        );
      })}
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('workoutV2.builder.addExercise')}</Text>
      <ExercisePicker onSelect={onAddExercise} />
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t('workoutV2.builder.save')} disabled={saving} onPress={onSave} style={[styles.save, { backgroundColor: saving ? colors.disabledBg : colors.accent }]}>
        <Text style={[styles.saveText, { color: colors.textOnAccent }]}>{saving ? t('common.loading') : t('workoutV2.builder.save')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 }, label: { fontSize: 12, fontWeight: '700' },
  nameInput: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, fontWeight: '700' },
  block: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  blockHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockTitle: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  actions: { flexDirection: 'row' }, iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { minWidth: 68, minHeight: 44, flexGrow: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, textAlign: 'center' },
  error: { fontSize: 13, lineHeight: 18 },
  save: { minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  saveText: { fontSize: 15, fontWeight: '800' },
});
