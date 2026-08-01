import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  suffix: string;
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
  suffix,
  readOnly = false,
  onTextChange,
  colors,
}: Props) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const handleChange = (raw: string) => {
    // Tastaturile românești pot trimite virgulă. Stocăm forma canonică cu punct,
    // ca parseFloat să funcționeze identic pe Android și iOS.
    const normalized = raw.replace(',', '.');
    const cleaned = normalized
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*)\./g, '$1');
    setText(cleaned);
    onTextChange?.(cleaned);
  };

  const commitBlur = () => {
    setFocused(false);
    const numeric = Number.parseFloat(text);
    if (text === '' || !Number.isFinite(numeric)) {
      setText('0');
      onTextChange?.('0');
      return;
    }
    // Elimină zerourile inutile, fără să schimbe valoarea introdusă.
    const normalized = String(numeric);
    setText(normalized);
    onTextChange?.(normalized);
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          onPress={onDec}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={`Scade ${label.toLowerCase()}`}
          accessibilityState={{ disabled: readOnly }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surfaceElevated, opacity: pressed || readOnly ? 0.5 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="minus" size={22} color={colors.textPrimary} />
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
            accessibilityLabel={`${label}, ${text || 0} ${suffix}`}
            style={[styles.value, { color: colors.textPrimary }]}
          />
          <Text style={[styles.suffix, { color: colors.textTertiary }]}>{suffix}</Text>
        </View>

        <Pressable
          onPress={onInc}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={`Crește ${label.toLowerCase()}`}
          accessibilityState={{ disabled: readOnly }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surfaceElevated, opacity: pressed || readOnly ? 0.5 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="plus" size={22} color={colors.textPrimary} />
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
