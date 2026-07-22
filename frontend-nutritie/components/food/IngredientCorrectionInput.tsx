import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Send } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import type { AlimentScanat } from '@/components/food/FoodScanSuccessModal';

interface Props {
  ingredienteCurente: AlimentScanat[];
  onCorectat: (ingrediente: AlimentScanat[]) => void;
  onSend: (text: string) => Promise<void>;
}

export default function IngredientCorrectionInput({ ingredienteCurente, onCorectat, onSend }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const value = text.trim();

    if (!value || loading) return;

    setLoading(true);

    try {
      await onSend(value);
      setText('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <TextInput
        style={[styles.input, { color: colors.textPrimary }]}
        placeholder='Ex: "plăcinta are făină de migdale"'
        placeholderTextColor={colors.textSecondary}
        value={text}
        onChangeText={setText}
        editable={!loading}
        onSubmitEditing={handleSend}
        returnKeyType="send"
        multiline
      />
      <Pressable
        style={[styles.sendBtn, { backgroundColor: colors.accent, opacity: text.trim() && !loading ? 1 : 0.5 }]}
        onPress={handleSend}
        disabled={!text.trim() || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Send size={18} color={colors.background} strokeWidth={2.5} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    borderRadius: 16, borderWidth: 1, padding: 8, paddingLeft: 14,
  },
  input: { flex: 1, fontSize: 15, maxHeight: 100, paddingVertical: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
