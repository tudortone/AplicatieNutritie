import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { FoodProduct } from './types';

interface ProductSearchResultProps {
  product: FoodProduct;
  onSelect: (product: FoodProduct) => void;
}

export function ProductSearchResult({ product, onSelect }: ProductSearchResultProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const getSourceBadge = () => {
    switch (product.source) {
      case 'preset':
        return { label: t('food.result.sourcePreset'), color: colors.accent };
      case 'user_saved':
        return { label: t('food.result.sourceSaved'), color: colors.accentTertiary };
      case 'barcode_cache':
        return { label: t('food.result.sourceVerified'), color: colors.success };
      case 'openfoodfacts':
        return { label: t('food.result.sourceOfff'), color: colors.textSecondary };
      default:
        return { label: t('food.result.sourceManual'), color: colors.accentSecondary };
    }
  };

  const badge = getSourceBadge();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
      onPress={() => onSelect(product)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={product.name}
    >
      <View style={styles.infoCol}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {product.name}
          </Text>
          {product.brand ? (
            <Text style={[styles.brand, { color: colors.textSecondary }]} numberOfLines={1}>
              • {product.brand}
            </Text>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: badge.color + '18', borderColor: badge.color + '44' }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
          <Text style={[styles.macros, { color: colors.accent }]}>
            {t('food.result.macros', {
              kcal: Math.round(product.kcalPer100g),
              proteine: Math.round(product.proteinPer100g * 10) / 10,
              carbohidrati: Math.round(product.carbsPer100g * 10) / 10,
            })}
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
