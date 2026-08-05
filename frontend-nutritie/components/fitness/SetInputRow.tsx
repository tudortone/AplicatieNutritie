import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export interface SetData {
  reps: number;
  weight: number;
  duration?: number;
}

interface Props {
  index: number;
  set: SetData;
  onChange: (index: number, next: SetData) => void;
  showWeight?: boolean; // false pentru bodyweight_reps / hold
  showDuration?: boolean;
  inputType?: 'hold' | 'bodyweight_reps' | 'weighted_reps';
}

function Stepper({ label, value, step, min, max, onChange, onLimitReached, suffix, colors }: {
  label: string; value: number; step: number; min: number; max: number;
  onChange: (v: number) => void; onLimitReached: () => void; suffix?: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const { t } = useTranslation();
  const bump = useCallback((delta: number) => {
    const nextVal = Math.round((value + delta) * 100) / 100;
    if (nextVal > max) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onChange(max);
      onLimitReached();
    } else {
      Haptics.selectionAsync();
      onChange(Math.max(min, nextVal));
    }
  }, [value, min, max, onChange, onLimitReached]);

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>{label}</Text>
      <View style={[styles.pill, { backgroundColor: colors.surfaceBg }]}>
        <Pressable
          style={[styles.stepBtn, { backgroundColor: colors.background }]}
          onPress={() => bump(-step)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.setInputRow.decrease', { label })}
          accessibilityState={{ disabled: value <= min }}
        >
          <Minus size={16} color={colors.accent} strokeWidth={3} />
        </Pressable>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={String(value ?? 0)}
          onChangeText={t => {
            const n = parseFloat(t.replace(',', '.'));
            if (isNaN(n)) {
              onChange(0);
            } else if (n > max) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onChange(max);
              onLimitReached();
            } else {
              onChange(Math.max(min, n));
            }
          }}
          keyboardType="numeric"
          selectTextOnFocus
        />
        {suffix ? <Text style={[styles.suffix, { color: colors.textSecondary }]}>{suffix}</Text> : null}
        <Pressable
          style={[styles.stepBtn, { backgroundColor: colors.background }]}
          onPress={() => bump(step)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.setInputRow.increase', { label })}
          accessibilityState={{ disabled: value >= max }}
        >
          <Plus size={16} color={colors.accent} strokeWidth={3} />
        </Pressable>
      </View>
    </View>
  );
}

export default function SetInputRow({ index, set, onChange, showWeight = true, showDuration = false, inputType }: Props) {
  const { colors } = useTheme();
  const [limitError, setLimitError] = useState<string | null>(null);

  useEffect(() => {
    if (limitError) {
      const timer = setTimeout(() => setLimitError(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [limitError]);

  const triggerLimitError = useCallback(() => {
    setLimitError('S-a atins limita maximă umană');
  }, []);

  const isHold = inputType === 'hold' || showDuration;
  const isWeightVisible = (showWeight && inputType !== 'bodyweight_reps' && inputType !== 'hold');
  const isRepsVisible = inputType !== 'hold';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.surfaceBg }]}>
          <Text style={[styles.badgeText, { color: colors.textPrimary }]}>{index + 1}</Text>
        </View>

        {isRepsVisible && (
          <Stepper
            label="Repetări"
            value={set.reps || 0}
            step={1}
            min={0}
            max={100}
            onLimitReached={triggerLimitError}
            onChange={reps => onChange(index, { ...set, reps })}
            colors={colors}
          />
        )}

        {isWeightVisible && (
          <Stepper
            label="Greutate"
            value={set.weight || 0}
            step={2.5}
            min={0}
            max={600}
            suffix="kg"
            onLimitReached={triggerLimitError}
            onChange={weight => onChange(index, { ...set, weight })}
            colors={colors}
          />
        )}

        {isHold && (
          <Stepper
            label="Timp (Hold)"
            value={set.duration || 0}
            step={5}
            min={0}
            max={7200}
            suffix="sec"
            onLimitReached={triggerLimitError}
            onChange={duration => onChange(index, { ...set, duration })}
            colors={colors}
          />
        )}
      </View>

      {limitError ? (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
          <AlertTriangle size={14} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{limitError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontWeight: '700', fontSize: 14 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 16, paddingHorizontal: 8, paddingVertical: 6,
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  input: { flex: 1, minWidth: 40, fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 2 },
  suffix: { fontSize: 12, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 6, alignSelf: 'stretch', borderWidth: 1,
  },
  errorText: { fontSize: 12, fontWeight: '700' },
});
