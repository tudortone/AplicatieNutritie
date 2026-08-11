import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';

type Props = {
  value: number;
  onChange: (grams: number) => void;
  max?: number;
  suffix?: string;
  color?: string;
  borderColor?: string;
  accessibilityLabel?: string;
};

export function GramInput({
  value,
  onChange,
  max = 5000,
  suffix = 'g',
  color,
  borderColor,
  accessibilityLabel = 'Gramaj',
}: Props) {
  // REMED-022: capăm scalarea fontului la Bold Text ca inputul numeric să nu
  // iasă din casetă (maxFontSizeMultiplier pe TextInput + textul suffixului).
  const { colors } = useTheme();
  const [text, setText] = useState(String(value ?? ''));
  const [focused, setFocused] = useState(false);
  const resolvedColor = color ?? colors.textPrimary;
  const resolvedBorder = borderColor ?? colors.border;
  const maxLength = Math.max(1, String(Math.max(0, Math.floor(max))).length);

  useEffect(() => {
    if (!focused) setText(value > 0 ? String(value) : '');
  }, [value, focused]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    if (cleaned === '') {
      setText('');
      onChange(0);
      return;
    }
    const parsed = Number.parseInt(cleaned, 10);
    const next = Number.isFinite(parsed) ? Math.min(parsed, max) : 0;
    setText(next > 0 ? String(next) : '');
    onChange(next);
  };

  const handleBlur = () => {
    setFocused(false);
    if (text === '' || Number.parseInt(text, 10) < 1) {
      setText('');
      onChange(0);
    }
  };

  const clear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setText('');
    onChange(0);
  };

  return (
    <View style={[styles.wrap, { borderColor: resolvedBorder, backgroundColor: colors.surfaceBg }]}>
      <TextInput
        value={text}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="done"
        maxLength={maxLength}
        maxFontSizeMultiplier={1.3}
        selectTextOnFocus
        placeholder="0"
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Valoare maximă ${max} ${suffix}`}
        style={[styles.input, { color: resolvedColor }]}
      />
      <Text maxFontSizeMultiplier={1.3} style={[styles.suffix, { color: colors.textSecondary }]}>{suffix}</Text>
      {text.length > 0 ? (
        <Pressable
          onPress={clear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Șterge ${accessibilityLabel.toLowerCase()}`}
          style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.55 : 1 }]}
        >
          <X size={15} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 4,
    minWidth: 96,
  },
  input: {
    flex: 1,
    minWidth: 42,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 8,
    textAlign: 'right',
  },
  suffix: {
    fontSize: 13,
    marginLeft: 3,
    fontWeight: '600',
  },
  clearBtn: {
    width: 36,
    height: 40,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
