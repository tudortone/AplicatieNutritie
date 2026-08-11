/**
 * SetInputForm.tsx — Componentă care randează dinamic câmpurile în funcție de inputType.
 * Conform specificației NutriAI v7 (Secțiunea 1.3 & 3.A).
 * Optimizat pentru mediu de sală: touch targets min 48x48 dp, font >= 18sp, steppers +/- mari lângă input numeric.
 */

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Pause, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';
import { InputType, SetInput, getFieldsForType } from '../../lib/adaptiveInput';
import { useHoldTimer } from '../../hooks/useHoldTimer';

interface NumberFieldProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  unit?: string;
  onChange: (n: number) => void;
}

function NumberField({ label, min = 0, max = 999, step = 1, value = 0, unit = '', onChange }: NumberFieldProps) {
  const { colors } = useTheme();

  const handleStep = (delta: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const nextVal = Math.max(min, Math.min(max, Number((value + delta).toFixed(2))));
    onChange(nextVal);
  };

  const handleChangeText = (txt: string) => {
    const clean = txt.replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    if (!isNaN(num)) {
      onChange(num);
    } else if (clean === '') {
      onChange(0);
    }
  };

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => handleStep(-step)}
          activeOpacity={0.7}
        >
          <Text style={[styles.stepperBtnText, { color: colors.textPrimary }]}>–</Text>
        </TouchableOpacity>

        <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.numericInput, { color: colors.textPrimary }]}
            keyboardType="decimal-pad"
            value={String(value || 0)}
            onChangeText={handleChangeText}
            selectTextOnFocus
          />
          {!!unit && <Text style={[styles.unitText, { color: colors.textSecondary }]}>{unit}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => handleStep(step)}
          activeOpacity={0.7}
        >
          <Text style={[styles.stepperBtnText, { color: colors.textPrimary }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface HoldTimerViewProps {
  value?: number;
  onStop: (seconds: number) => void;
}

function HoldTimerView({ value = 0, onStop }: HoldTimerViewProps) {
  const { colors } = useTheme();
  const { elapsed, isRunning, start, pause, reset } = useHoldTimer(value);

  const toggleTimer = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    if (isRunning) {
      pause();
      onStop(elapsed);
    } else {
      start();
    }
  };

  const handleReset = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    reset(0);
    onStop(0);
  };

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const displayTime = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

  return (
    <View style={[styles.timerContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.timerLabel, { color: colors.textSecondary }]}>CRONOMETRU IZOMETRIE (HOLD)</Text>
      
      <Text style={[styles.timerDisplay, { color: isRunning ? colors.accent : colors.textPrimary }]}>
        {displayTime}
      </Text>

      <View style={styles.timerControls}>
        <TouchableOpacity
          style={[
            styles.timerMainBtn,
            { backgroundColor: isRunning ? '#FF3B5C' : colors.accent },
          ]}
          onPress={toggleTimer}
          activeOpacity={0.8}
        >
          {isRunning ? <Pause size={24} color="#FFF" /> : <Play size={24} color={colors.textOnAccent} />}
          <Text style={[styles.timerBtnText, { color: isRunning ? '#FFF' : colors.textOnAccent }]}>{isRunning ? 'PAUZĂ' : 'PORNEȘTE'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.timerResetBtn, { borderColor: colors.border }]}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <RotateCcw size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export interface SetInputFormProps {
  inputType: InputType;
  value: SetInput;
  onChange: (val: SetInput) => void;
}

export function SetInputForm({ inputType, value, onChange }: SetInputFormProps) {
  const fields = getFieldsForType(inputType);

  return (
    <View style={styles.formContainer}>
      {fields.includes('weight_kg') && (
        <NumberField
          label="Greutate (kg)"
          min={0.5}
          max={500}
          step={2.5}
          unit="kg"
          value={value.weight_kg ?? 0}
          onChange={(n) => onChange({ ...value, weight_kg: n })}
        />
      )}

      {fields.includes('reps') && (
        <NumberField
          label="Repetări"
          min={1}
          max={100}
          step={1}
          unit="reps"
          value={value.reps ?? 10}
          onChange={(n) => onChange({ ...value, reps: n })}
        />
      )}

      {fields.includes('time_seconds') && (
        <HoldTimerView
          value={value.time_seconds ?? 0}
          onStop={(sec) => onChange({ ...value, time_seconds: sec })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: 16,
    marginVertical: 8,
  },
  fieldContainer: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32,
  },
  inputBox: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  numericInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  unitText: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 4,
  },
  timerContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 12,
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerDisplay: {
    fontSize: 44,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  timerMainBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timerBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
  timerResetBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
