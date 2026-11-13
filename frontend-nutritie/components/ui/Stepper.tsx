import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
// BUG-027: folosim același set de iconițe ca restul aplicației (lucide),
// nu un amestec de familii MaterialCommunityIcons + lucide.
import { Minus, Plus } from 'lucide-react-native';

type Props = {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  suffix?: string;
  readOnly?: boolean;
  onTextChange?: (text: string) => void;
  colors: {
    cardBg: string;
    cardBorder: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    surfaceElevated: string;
  };
};

export function Stepper({
  label,
  value,
  onDec,
  onInc,
  suffix = '',
  readOnly = false,
  onTextChange,
  colors,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const prevValueRef = useRef(value);
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      if (value !== lastEmittedRef.current) {
        lastEmittedRef.current = null;
        setText(value);
      }
    } else if (!focused) {
      lastEmittedRef.current = null;
      setText(value);
    }
  }, [value, focused]);

  const handleChange = (raw: string) => {
    // Tastaturile românești pot trimite virgulă. Stocăm forma canonică cu punct,
    // ca parseFloat să funcționeze identic pe Android și iOS.
    const normalized = raw.replace(',', '.');
    const cleaned = normalized
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*)\./g, '$1');
    lastEmittedRef.current = cleaned;
    setText(cleaned);
    onTextChange?.(cleaned);
  };

  const commitBlur = () => {
    setFocused(false);
    const numeric = Number.parseFloat(text);
    // Elimină zerourile inutile, fără să schimbe valoarea introdusă.
    const next = text === '' || !Number.isFinite(numeric) ? '0' : String(numeric);
    setText(next);
    if (next !== value) {
      lastEmittedRef.current = next;
      onTextChange?.(next);
    } else {
      lastEmittedRef.current = null;
    }
  };

  const handleDec = () => {
    lastEmittedRef.current = null;
    onDec();
  };

  const handleInc = () => {
    lastEmittedRef.current = null;
    onInc();
  };

  const displayValue = text || '0';
  const inputA11yLabel = suffix
    ? t('sport.screen.stepperValueUnitA11y', {
        label,
        value: displayValue,
        unit: suffix,
        defaultValue: `${label}, ${displayValue} ${suffix}`,
      })
    : t('sport.screen.stepperValueA11y', {
        label,
        value: displayValue,
        defaultValue: `${label}, ${displayValue}`,
      });

  return (
    <View style={[styles.row, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.controls}>
        <Pressable
          onPress={handleDec}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={t('sport.screen.adjustDecA11y', {
            label: label.toLowerCase(),
            defaultValue: `Decrease ${label.toLowerCase()}`,
          })}
          accessibilityState={{ disabled: readOnly }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surfaceElevated, opacity: pressed || readOnly ? 0.5 : 1 },
          ]}
        >
          <Minus size={22} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.valueWrap}>
          <TextInput
            value={text}
            onChangeText={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={commitBlur}
            editable={!readOnly}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={inputA11yLabel}
            maxFontSizeMultiplier={1.3}
            style={[styles.value, { color: colors.textPrimary }]}
          />
          {suffix ? (
            <Text style={[styles.suffix, { color: colors.textTertiary }]}>{suffix}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleInc}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={t('sport.screen.adjustIncA11y', {
            label: label.toLowerCase(),
            defaultValue: `Increase ${label.toLowerCase()}`,
          })}
          accessibilityState={{ disabled: readOnly }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surfaceElevated, opacity: pressed || readOnly ? 0.5 : 1 },
          ]}
        >
          <Plus size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  label: { fontSize: 14, fontWeight: '600', minWidth: 72, flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 44,
    maxWidth: 76,
    paddingVertical: 4,
  },
  suffix: { fontSize: 13, marginLeft: 2, fontWeight: '600' },
});
