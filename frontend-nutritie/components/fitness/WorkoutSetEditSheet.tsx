import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Stepper } from '../ui/Stepper';
import { Radius, Spacing } from '../../constants/theme';
import { validateLoggedSet, type LoggedSet, type SetFields } from '../../lib/workoutSets';

export interface WorkoutSetEditSheetProps {
  visible: boolean;
  exerciseName: string;
  setIndex: number;
  initialSet: LoggedSet | null;
  fields: SetFields | null;
  isLastSetInWorkout?: boolean;
  saving?: boolean;
  onSave: (updatedSet: LoggedSet) => void | Promise<void>;
  onDeleteSet: () => void | Promise<void>;
  onClose: () => void;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

export function WorkoutSetEditSheet({
  visible,
  exerciseName,
  setIndex,
  initialSet,
  fields,
  isLastSetInWorkout = false,
  saving = false,
  onSave,
  onDeleteSet,
  onClose,
}: WorkoutSetEditSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('0');
  const [time, setTime] = useState('45');
  const [isWarmup, setIsWarmup] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !initialSet) return;
    setReps(String(initialSet.repetari ?? 0));
    setWeight(formatNumber(Number(initialSet.greutate) || 0));
    setTime(String(initialSet.time_seconds ?? 0));
    setIsWarmup(initialSet.set_type === 'warmup');
    setValidationError(null);
  }, [visible, initialSet, setIndex]);

  if (!fields || !initialSet) return null;

  const stepperColors = {
    cardBg: colors.cardBg || colors.surface,
    cardBorder: colors.cardBorder || colors.border,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    surfaceElevated: colors.surfaceElevated || colors.surfaceBg || colors.surface,
  };

  const adjust = (kind: 'reps' | 'weight' | 'time', delta: number, min: number, max: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setValidationError(null);
    if (kind === 'weight') {
      const current = parseFloat(weight.replace(',', '.')) || 0;
      setWeight(formatNumber(clamp(current + delta, min, max)));
    } else if (kind === 'time') {
      const current = parseInt(time, 10) || 0;
      setTime(String(Math.round(clamp(current + delta, min, max))));
    } else {
      const current = parseInt(reps, 10) || 0;
      setReps(String(Math.round(clamp(current + delta, min, max))));
    }
  };

  const handleSave = () => {
    const candidate: LoggedSet = {
      ...initialSet,
      serie: initialSet.serie || setIndex + 1,
      repetari: fields.usesTime ? Math.max(1, Number(initialSet.repetari) || 1) : Math.max(0, parseInt(reps, 10) || 0),
      greutate: fields.usesWeight ? Math.max(0, parseFloat(weight.replace(',', '.')) || 0) : 0,
      time_seconds: fields.usesTime ? Math.max(0, parseInt(time, 10) || 0) : initialSet.time_seconds,
      set_type: isWarmup
        ? 'warmup'
        : initialSet.set_type === 'warmup'
          ? 'working'
          : (initialSet.set_type ?? 'working'),
    };
    const error = validateLoggedSet(candidate, fields, t);
    if (error) {
      setValidationError(error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setValidationError(null);
    void onSave(candidate);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
    >
      <Animated.View
        entering={FadeIn.duration(reduceMotion ? 100 : 180)}
        exiting={FadeOut.duration(reduceMotion ? 80 : 140)}
        style={styles.backdrop}
        accessibilityViewIsModal
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!saving) onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('sport.edit.cancelBtn')}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrap}
        >
          <Animated.View
            entering={FadeIn.duration(reduceMotion ? 100 : 200)}
            exiting={reduceMotion ? FadeOut.duration(80) : SlideOutDown.duration(160)}
            style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
          >
            <BlurView
              intensity={40}
              tint="dark"
              style={[
                styles.sheet,
                {
                  backgroundColor: `${colors.surface}F4`,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={[styles.grip, { backgroundColor: `${colors.textTertiary}55` }]} />
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.textPrimary }]}>
                  {t('sport.edit.title', { number: initialSet.serie || setIndex + 1 })}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                  {exerciseName} • {fields.modeLabel}
                </Text>

                {fields.usesTime ? (
                  <Stepper
                    label={t('sport.measurement.fields.duration')}
                    value={time}
                    onDec={() => adjust('time', -5, 0, 3600)}
                    onInc={() => adjust('time', 5, 0, 3600)}
                    suffix={t('sport.measurement.units.secShort')}
                    onTextChange={(v) => {
                      setValidationError(null);
                      setTime(v);
                    }}
                    colors={stepperColors}
                  />
                ) : (
                  <Stepper
                    label={t('sport.measurement.fields.reps')}
                    value={reps}
                    onDec={() => adjust('reps', -1, 0, 500)}
                    onInc={() => adjust('reps', 1, 0, 500)}
                    suffix={t('sport.measurement.units.repShort')}
                    onTextChange={(v) => {
                      setValidationError(null);
                      setReps(v);
                    }}
                    colors={stepperColors}
                  />
                )}

                {fields.usesWeight && (
                  <Stepper
                    label={fields.weightRequired ? t('sport.measurement.fields.weight') : t('sport.measurement.fields.weightOptional')}
                    value={weight}
                    onDec={() => adjust('weight', -2.5, 0, 1000)}
                    onInc={() => adjust('weight', 2.5, 0, 1000)}
                    suffix={t('sport.measurement.units.kg')}
                    onTextChange={(v) => {
                      setValidationError(null);
                      setWeight(v);
                    }}
                    colors={stepperColors}
                  />
                )}

                <Pressable
                  onPress={() => setIsWarmup((prev) => !prev)}
                  disabled={saving}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isWarmup }}
                  style={[
                    styles.warmupToggle,
                    {
                      borderColor: isWarmup ? colors.accent : (colors.cardBorder || colors.border),
                      backgroundColor: isWarmup ? `${colors.accent}22` : 'transparent',
                    },
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.warmupText, { color: isWarmup ? colors.accent : colors.textSecondary }]}>
                    {t('sport.screen.warmupToggle')}
                  </Text>
                </Pressable>

                {validationError ? (
                  <Text
                    maxFontSizeMultiplier={1.3}
                    accessibilityLiveRegion="polite"
                    style={[styles.errorText, { color: colors.danger }]}
                  >
                    {validationError}
                  </Text>
                ) : null}

                <View style={styles.horizontalRow}>
                  <Pressable
                    testID="workout-set-edit-cancel"
                    onPress={onClose}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={t('sport.edit.cancelBtn')}
                    style={({ pressed }) => [
                      styles.horizontalBtn,
                      styles.ghostButton,
                      { borderColor: colors.border, opacity: pressed ? 0.65 : saving ? 0.45 : 1 },
                    ]}
                  >
                    <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.ghostText, { color: colors.textPrimary }]}>
                      {t('sport.edit.cancelBtn')}
                    </Text>
                  </Pressable>

                  <Pressable
                    testID="workout-set-edit-save"
                    onPress={handleSave}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={t('sport.edit.saveBtn')}
                    accessibilityState={{ disabled: saving, busy: saving }}
                    style={({ pressed }) => [
                      styles.horizontalBtn,
                      styles.saveButton,
                      { backgroundColor: colors.accent, opacity: pressed || saving ? 0.8 : 1 },
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.textOnAccent || colors.background} />
                    ) : (
                      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.saveText, { color: colors.textOnAccent || colors.background }]}>
                        {t('sport.edit.saveBtn')}
                      </Text>
                    )}
                  </Pressable>
                </View>

                <Pressable
                  testID="workout-set-edit-delete"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    void onDeleteSet();
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={t('sport.edit.deleteSetBtn')}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    {
                      borderColor: `${colors.danger}44`,
                      backgroundColor: `${colors.danger}14`,
                      opacity: pressed || saving ? 0.7 : 1,
                    },
                  ]}
                >
                  <Trash2 size={16} color={colors.danger} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.deleteText, { color: colors.danger }]}>
                    {t('sport.edit.deleteSetBtn')}
                  </Text>
                </Pressable>

                {isLastSetInWorkout ? (
                  <Text maxFontSizeMultiplier={1.3} style={[styles.lastSetHint, { color: colors.textTertiary }]}>
                    {t('sport.edit.lastSetRemovesWorkoutHint')}
                  </Text>
                ) : null}
              </ScrollView>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 22,
  },
  grip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  warmupToggle: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  warmupText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  horizontalRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  horizontalBtn: {
    flex: 1,
  },
  ghostButton: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '800',
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '900',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: 16,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '800',
  },
  lastSetHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
});

export default WorkoutSetEditSheet;
