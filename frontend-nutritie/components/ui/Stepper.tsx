import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  suffix: string;
  readOnly?: boolean;
  onTextChange?: (t: string) => void;
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
  // Hooks trăiesc AICI, într-o componentă cu identitate stabilă (key)
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setText(cleaned); // permite string GOL
    onTextChange?.(cleaned);
  };

  return (
    <View
      style={[styles.row, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          onPress={onDec}
          disabled={readOnly}
          hitSlop={8}
          style={({ pressed }) => [
            styles.btn,
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
            onBlur={() => {
              setFocused(false);
              if (text === '') {
                setText('0');
                onTextChange?.('0');
              }
            }}
            editable={!readOnly}
            keyboardType="numeric"
            returnKeyType="done"
            selectTextOnFocus
            style={[styles.value, { color: colors.textPrimary }]}
          />
          <Text style={[styles.suffix, { color: colors.textTertiary }]}>{suffix}</Text>
        </View>

        <Pressable
          onPress={onInc}
          disabled={readOnly}
          hitSlop={8}
          style={({ pressed }) => [
            styles.btn,
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
  },
  label: { fontSize: 14, fontWeight: '600', minWidth: 80 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    minWidth: 60,
    justifyContent: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 40,
    paddingVertical: 2,
  },
  suffix: { fontSize: 13, marginLeft: 2, fontWeight: '600' },
});
