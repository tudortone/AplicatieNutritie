import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

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

function Stepper({ label, value, step, min, max, onChange, onLimitReached, suffix }: {
  label: string; value: number; step: number; min: number; max: number;
  onChange: (v: number) => void; onLimitReached: () => void; suffix?: string;
}) {
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
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pill}>
        <Pressable style={styles.stepBtn} onPress={() => bump(-step)} hitSlop={12}>
          <Minus size={16} color="#CCFF00" strokeWidth={3} />
        </Pressable>
        <TextInput
          style={styles.input}
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
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        <Pressable style={styles.stepBtn} onPress={() => bump(step)} hitSlop={12}>
          <Plus size={16} color="#CCFF00" strokeWidth={3} />
        </Pressable>
      </View>
    </View>
  );
}

export default function SetInputRow({ index, set, onChange, showWeight = true, showDuration = false, inputType }: Props) {
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
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
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
          />
        )}
      </View>

      {limitError ? (
        <View style={styles.errorBox}>
          <AlertTriangle size={14} color="#FF003C" />
          <Text style={styles.errorText}>{limitError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#2A2A36',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  field: { flex: 1 },
  fieldLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2A2A36', borderRadius: 16, paddingHorizontal: 8, paddingVertical: 6,
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: '#1A1A24',
    alignItems: 'center', justifyContent: 'center',
  },
  input: { flex: 1, minWidth: 40, color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 2 },
  suffix: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255, 0, 60, 0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 6, alignSelf: 'stretch', borderColor: 'rgba(255, 0, 60, 0.3)', borderWidth: 1,
  },
  errorText: { color: '#FF003C', fontSize: 12, fontWeight: '700' },
});
