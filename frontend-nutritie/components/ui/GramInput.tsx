import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

type Props = {
  value: number;
  onChange: (grams: number) => void;
  max?: number;
  suffix?: string;
  color?: string;
  borderColor?: string;
};

export function GramInput({
  value,
  onChange,
  max = 5000,
  suffix = 'g',
  color = '#FFF',
  borderColor = '#2A3441',
}: Props) {
  // Sursa de adevăr în timpul editării e STRING-ul, nu numărul.
  const [text, setText] = useState(String(value ?? ''));
  const [focused, setFocused] = useState(false);

  // Sincronizează doar când NU editezi (evită „lupta" cu utilizatorul)
  useEffect(() => {
    if (!focused) setText(value > 0 ? String(value) : '');
  }, [value, focused]);

  const handleChange = (raw: string) => {
    // Acceptă doar cifre; permite string GOL
    const cleaned = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    if (cleaned === '') {
      setText('');
      onChange(0); // 0 = „necompletat", NU 1
      return;
    }
    const n = Math.min(parseInt(cleaned, 10), max);
    setText(String(n));
    onChange(n);
  };

  const handleBlur = () => {
    setFocused(false);
    // Normalizează abia la ieșirea din câmp
    if (text === '' || parseInt(text, 10) < 1) {
      setText('');
      onChange(0);
    }
  };

  const clear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setText('');
    onChange(0);
  };

  return (
    <View style={[styles.wrap, { borderColor }]}>
      <TextInput
        value={text}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        selectTextOnFocus // tap = selectează tot, scrii direct peste
        placeholder="0"
        placeholderTextColor="#64748B"
        style={[styles.input, { color }]}
      />
      <Text style={styles.suffix}>{suffix}</Text>
      {text.length > 0 && (
        <Pressable onPress={clear} hitSlop={12} style={styles.clearBtn}>
          <X size={14} color="#94A3B8" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    minWidth: 96,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 8,
    textAlign: 'right',
  },
  suffix: { color: '#94A3B8', fontSize: 13, marginLeft: 3, fontWeight: '600' },
  clearBtn: { marginLeft: 6, padding: 2 },
});
