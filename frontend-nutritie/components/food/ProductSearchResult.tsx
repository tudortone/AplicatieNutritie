import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { FoodProduct } from './types';

interface ProductSearchResultProps {
  product: FoodProduct;
  onSelect: (product: FoodProduct) => void;
}

export function ProductSearchResult({ product, onSelect }: ProductSearchResultProps) {
  const { colors } = useTheme();

  const getSourceBadge = () => {
    switch (product.source) {
      case 'preset':
        return { label: 'Preset Rapid', color: colors.accent };
      case 'user_saved':
        return { label: 'Salvat de tine', color: '#00F0FF' };
      case 'barcode_cache':
        return { label: 'Catalog Verificat', color: '#10B981' };
      case 'openfoodfacts':
        return { label: 'OpenFoodFacts', color: colors.textSecondary };
      default:
        return { label: 'Manual', color: colors.accentSecondary };
    }
  };

  const badge = getSourceBadge();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
      onPress={() => onSelect(product)}
      activeOpacity={0.7}
    >
      <View style={styles.infoCol}>
        <View style={styles.headerRow}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {product.name}
          </Text>
          {product.brand ? (
            <Text maxFontSizeMultiplier={1.3} style={[styles.brand, { color: colors.textSecondary }]} numberOfLines={1}>
              • {product.brand}
            </Text>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: badge.color + '18', borderColor: badge.color + '44' }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.macros, { color: colors.accent }]}>
            {Math.round(product.kcalPer100g)} kcal • P: {Math.round(product.proteinPer100g * 10) / 10}g • C: {Math.round(product.carbsPer100g * 10) / 10}g
          </Text>
        </View>
      </View>

      <View style={[styles.addBtn, { backgroundColor: colors.accent + '22', borderColor: colors.accent }]}>
        <Plus size={18} color={colors.accent} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  infoCol: {
    flex: 1,
    marginRight: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  brand: {
    fontSize: 12,
    marginLeft: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  macros: {
    fontSize: 12,
    fontWeight: '600',
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
