import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { FoodProduct } from './types';

interface QuantityEditorProps {
  product: FoodProduct;
  onConfirm: (grams: number) => void;
  onCancel: () => void;
}

export function QuantityEditor({ product, onConfirm, onCancel }: QuantityEditorProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [grameStr, setGrameStr] = useState<string>(
    product.servingGrams ? String(product.servingGrams) : '100'
  );

  const grame = useMemo(() => {
    const n = parseFloat(grameStr.replace(/,/g, '.'));
    return isNaN(n) || !isFinite(n) || n < 0 ? 0 : n;
  }, [grameStr]);

  const calc = useMemo(() => {
    const f = grame / 100;
    return {
      kcal: Math.round(product.kcalPer100g * f),
      prot: Math.round(product.proteinPer100g * f * 10) / 10,
      carb: Math.round(product.carbsPer100g * f * 10) / 10,
      fat: Math.round(product.fatPer100g * f * 10) / 10,
    };
  }, [grame, product]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceBg, borderColor: colors.accent }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {product.name}
          </Text>
          {product.brand ? (
            <Text style={[styles.brand, { color: colors.textSecondary }]}>{product.brand}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.closeBtn}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button"
          accessibilityLabel={t('food.quantity.close')}
        >
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('food.quantity.setQuantity')}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
          keyboardType="numeric"
          value={grameStr}
          onChangeText={setGrameStr}
          autoFocus
        />
        <Text style={[styles.unitText, { color: colors.textSecondary }]}>grame</Text>
      </View>

      {/* Quick gram chips */}
      <View style={styles.chipsRow}>
        {[50, 100, 150, 200, 250].map((val) => (
          <TouchableOpacity
            key={val}
            style={[
              styles.chip,
              { backgroundColor: colors.cardBg, borderColor: grame === val ? colors.accent : colors.cardBorder }
            ]}
            onPress={() => setGrameStr(String(val))}
          >
            <Text style={[styles.chipText, { color: grame === val ? colors.accent : colors.textPrimary }]}>
              {val}g
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.summaryBox, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <View style={styles.sumCol}>
          <Text style={[styles.sumVal, { color: colors.accent }]}>{calc.kcal}</Text>
          <Text style={[styles.sumLab, { color: colors.textSecondary }]}>kcal</Text>
        </View>
        <View style={styles.sumCol}>
          <Text style={[styles.sumVal, { color: colors.accentSecondary }]}>{calc.prot}g</Text>
          <Text style={[styles.sumLab, { color: colors.textSecondary }]}>{t('food.macros.proteins')}</Text>
        </View>
        <View style={styles.sumCol}>
          <Text style={[styles.sumVal, { color: colors.accentTertiary }]}>{calc.carb}g</Text>
          <Text style={[styles.sumLab, { color: colors.textSecondary }]}>{t('food.macros.carbs')}</Text>
        </View>
        <View style={styles.sumCol}>
          <Text style={[styles.sumVal, { color: colors.warning }]}>{calc.fat}g</Text>
          <Text style={[styles.sumLab, { color: colors.textSecondary }]}>{t('food.macros.fats')}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.confirmBtn, { backgroundColor: colors.accent, opacity: grame > 0 ? 1 : 0.5 }]}
        disabled={grame <= 0}
        onPress={() => onConfirm(grame)}
      >
        <Check size={18} color="#000" />
        <Text style={styles.confirmText}>{t('food.quantity.confirm', { kcal: calc.kcal, grame })}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800' },
  brand: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '800',
  },
  unitText: { fontSize: 14, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  sumCol: { alignItems: 'center' },
  sumVal: { fontSize: 16, fontWeight: '800' },
  sumLab: { fontSize: 11, marginTop: 2 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  confirmText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
