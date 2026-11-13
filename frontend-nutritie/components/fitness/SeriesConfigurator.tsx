/**
 * SeriesConfigurator.tsx — UI adaptiv pentru configurarea seriilor, repetărilor, greutății sau timpului
 * Conform specificației NutriAI v6 (Secțiunea 7.3)
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Minus, Plus, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useNotify } from '../../hooks/useNotify';
import type { MeasurementSpec } from '../../lib/measurement';

export interface SeriesValue {
  sets: number;
  reps: number;
  weightKg: number;
  durationSec: number;
}

interface Props {
  spec: MeasurementSpec;
  value: SeriesValue;
  onChange: (v: SeriesValue) => void;
}

function Stepper({
  label,
  value,
  onChangeVal,
  onDec,
  onInc,
  suffix,
  isDecimal = false,
}: {
  label: string;
  value: number;
  onChangeVal?: (v: number) => void;
  onDec: () => void;
  onInc: () => void;
  suffix?: string;
  isDecimal?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={onDec}
          style={[styles.stepBtn, { borderColor: colors.border }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('sport.commonControls.decreaseStepA11y', { label: label.toLowerCase(), step: isDecimal ? 2.5 : 1 })}
        >
          <Minus size={16} color={colors.textPrimary} />
        </Pressable>
        {onChangeVal ? (
          <TextInput
            style={[styles.stepValInput, { color: colors.textPrimary, borderColor: colors.border }]}
            keyboardType={isDecimal ? "decimal-pad" : "number-pad"}
            value={String(value)}
            onChangeText={(txt) => {
              const clean = txt.replace(/[^0-9.]/g, '');
              const val = isDecimal ? parseFloat(clean) : parseInt(clean, 10);
              onChangeVal(isNaN(val) ? 0 : Math.max(0, val));
            }}
            selectTextOnFocus
          />
        ) : (
          <Text style={[styles.stepVal, { color: colors.textPrimary }]}>
            {value}
            {suffix ?? ''}
          </Text>
        )}
        <Pressable
          onPress={onInc}
          style={[styles.stepBtn, { borderColor: colors.border }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('sport.commonControls.increaseStepA11y', { label: label.toLowerCase(), step: isDecimal ? 2.5 : 1 })}
        >
          <Plus size={16} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

export function SeriesConfigurator({ spec, value, onChange }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const notify = useNotify();
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, []);

  const triggerWarning = (msg: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    notify.warning(t('sport.commonControls.maxLimitTitle'), msg);
    setLimitWarning(msg);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setLimitWarning(null), 3500);
  };

  const set = (patch: Partial<SeriesValue>) => onChange({ ...value, ...patch });

  const showReps =
    spec.type !== 'timed' &&
    spec.type !== 'timed_weight' &&
    spec.type !== 'distance_time';
  const showTimer =
    spec.type === 'timed' || spec.type === 'timed_weight';
  const showWeight = spec.allowsWeight;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {t('sport.commonControls.quickSeriesTitle')}
      </Text>
      <View style={styles.row}>
        <Stepper
          label={t('sport.commonControls.sets')}
          value={value.sets}
          onChangeVal={(val) => set({ sets: Math.max(1, Math.min(50, val)) })}
          onDec={() => {
            Haptics.selectionAsync();
            set({ sets: Math.max(1, value.sets - 1) });
          }}
          onInc={() => {
            if (value.sets + 1 > 50) {
              triggerWarning(t('sport.commonControls.maxSets'));
            } else {
              Haptics.selectionAsync();
              set({ sets: value.sets + 1 });
            }
          }}
        />
        {showReps && (
          <Stepper
            label={spec.unitLabel}
            value={value.reps}
            onChangeVal={(val) => set({ reps: Math.max(1, Math.min(100, val)) })}
            onDec={() => {
              Haptics.selectionAsync();
              set({ reps: Math.max(1, value.reps - 1) });
            }}
            onInc={() => {
              if (value.reps + 1 > 100) {
                triggerWarning(t('sport.commonControls.maxReps'));
              } else {
                Haptics.selectionAsync();
                set({ reps: value.reps + 1 });
              }
            }}
          />
        )}
        {showTimer && (
          <Stepper
            label={t('sport.commonControls.secondsPerSet')}
            value={value.durationSec}
            suffix={t('sport.measurement.units.secShort')}
            onDec={() => {
              Haptics.selectionAsync();
              set({ durationSec: Math.max(5, value.durationSec - 5) });
            }}
            onInc={() => {
              if (value.durationSec + 5 > 7200) {
                triggerWarning(t('sport.commonControls.maxDuration'));
              } else {
                Haptics.selectionAsync();
                set({ durationSec: value.durationSec + 5 });
              }
            }}
          />
        )}
        {showWeight && (
          <View style={styles.field}>
            <Text
              style={[styles.fieldLabel, { color: colors.textSecondary }]}
            >
              {t('sport.commonControls.weightKg')}{spec.weightOptional ? t('sport.commonControls.optionalSuffix') : ''}
            </Text>
            <TextInput
              value={String(value.weightKg)}
              onChangeText={(txt) => {
                let num = Number(txt.replace(/[^0-9.]/g, '')) || 0;
                if (num > 600) {
                  num = 600;
                  triggerWarning(t('sport.commonControls.maxWeight'));
                }
                set({ weightKg: num });
              }}
              keyboardType="numeric"
              style={[
                styles.weightInput,
                { color: colors.textPrimary, borderColor: colors.border },
              ]}
            />
          </View>
        )}
      </View>
      {limitWarning ? (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
          <AlertTriangle size={14} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{limitWarning}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  field: {
    minWidth: 96,
    flexGrow: 1,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepVal: {
    fontSize: 20,
    fontWeight: '900',
  },
  stepValInput: {
    fontSize: 18,
    fontWeight: '800',
    minWidth: 50,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  weightInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '800',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
