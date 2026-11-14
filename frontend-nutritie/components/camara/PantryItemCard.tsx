import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  SlidersHorizontal,
  Snowflake,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { ProdusCamara } from '../../hooks/useCamara';
import { Radius, Spacing } from '../../constants/theme';
import { computeExpiryMeta, isLowStockItem } from './pantryUtils';

export interface PantryItemCardProps {
  item: ProdusCamara;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onQuickDecrement: (item: ProdusCamara) => void;
  onQuickIncrement: (item: ProdusCamara) => void;
  onAddMeal: (item: ProdusCamara) => void;
  onOpenEdit: (item: ProdusCamara) => void;
}

function PantryItemCardComponent({
  item,
  isSelected,
  onToggleSelect,
  onQuickDecrement,
  onQuickIncrement,
  onAddMeal,
  onOpenEdit,
}: PantryItemCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const meta = computeExpiryMeta(item);
  const lowStock = isLowStockItem(item);
  const hasGrams = typeof item.cantitate_g === 'number' && item.cantitate_g > 0;
  const stockLabel = hasGrams ? `${Math.round(item.cantitate_g!)} g` : `×${item.cantitate || 1}`;

  let barColor = colors.success;
  let statusText = t('scannerBarcode.expiresInDaysShort', { days: meta.daysLeft });
  let StatusIcon = CheckCircle2;

  if (meta.status === 'frozen') {
    barColor = colors.accentTertiary;
    statusText = t('scannerBarcode.frozenDaysShort', { days: meta.daysLeft });
    StatusIcon = Snowflake;
  } else if (meta.status === 'expired') {
    barColor = colors.danger;
    statusText = t('scannerBarcode.expiredTag');
    StatusIcon = AlertTriangle;
  } else if (meta.status === 'danger') {
    barColor = colors.danger;
    statusText =
      meta.daysLeft <= 0
        ? t('scannerBarcode.expiresTodayTag')
        : t('scannerBarcode.expiresTomorrowTag');
    StatusIcon = AlertTriangle;
  } else if (meta.status === 'warning') {
    barColor = colors.warning;
    statusText = t('scannerBarcode.expiresInDaysShort', { days: meta.daysLeft });
    StatusIcon = Clock;
  }

  const cardBorderColor = isSelected
    ? colors.accent
    : meta.status === 'expired' || meta.status === 'danger'
      ? `${colors.danger}66`
      : item.is_congelat
        ? `${colors.accentTertiary}55`
        : colors.cardBorder;

  const rawKcal: unknown = item.calorii_100g ?? (item as { kcal_100g?: unknown }).kcal_100g;
  const parsedKcal =
    typeof rawKcal === 'number'
      ? rawKcal
      : typeof rawKcal === 'string' && rawKcal.trim() !== ''
        ? Number(rawKcal)
        : NaN;
  const safeKcal = Number.isFinite(parsedKcal) ? Math.round(parsedKcal) : null;
  const macroParts = [
    safeKcal !== null ? `${safeKcal} kcal/100g` : null,
    item.brand ? item.brand : null,
  ].filter(Boolean);
  const macroSummary = macroParts.join(' · ');

  return (
    // REMED-016: cardul e un View simplu; checkbox-ul e un Pressable separat de butoanele de acțiune (frați).
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: cardBorderColor,
        },
      ]}
      testID={`pantry-card-${item.id}`}
    >
      {/* Rândul 1: Selecție + Identitate + Pill Stoc */}
      <View style={styles.topRow}>
        <Pressable
          onPress={() => onToggleSelect(item.id)}
          style={styles.selectArea}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected }}
          accessibilityLabel={t('scannerBarcode.selectForRecipesA11y', {
            name: item.nume,
            selected: isSelected ? t('scannerBarcode.selectedState') : '',
          })}
        >
          <View
            style={[
              styles.checkbox,
              isSelected
                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                : { borderColor: colors.textTertiary, backgroundColor: 'transparent' },
            ]}
          >
            {isSelected && <Check size={14} color={colors.textOnAccent} strokeWidth={3} />}
          </View>
          <View style={styles.identityCol}>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.title, { color: colors.textPrimary }]}
            >
              {item.nume}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.subtitle, { color: colors.textSecondary }]}
            >
              {macroSummary}
            </Text>
          </View>
        </Pressable>

        <TouchableOpacity
          onPress={() => onOpenEdit(item)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('scannerBarcode.editItemA11y', { name: item.nume })}
          style={[
            styles.stockPill,
            {
              backgroundColor: lowStock ? `${colors.warning}20` : colors.surfaceElevated,
              borderColor: lowStock ? `${colors.warning}66` : colors.cardBorder,
            },
          ]}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              styles.stockPillText,
              { color: lowStock ? colors.warning : colors.accent },
            ]}
          >
            {stockLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bară subțire de prospețime */}
      <View style={[styles.freshTrack, { backgroundColor: colors.surfaceElevated }]}>
        <View
          style={[
            styles.freshFill,
            {
              width: `${Math.round(meta.progress * 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      {/* Rândul 2: Status urgență + Controale directe */}
      <View style={styles.bottomRow}>
        <View style={styles.statusWrap}>
          <StatusIcon size={13} color={barColor} />
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={[styles.statusText, { color: barColor }]}
          >
            {statusText}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <View
            style={[
              styles.stepperGroup,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder },
            ]}
          >
            <TouchableOpacity
              onPress={() => onQuickDecrement(item)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.decreaseQuantityA11y', { name: item.nume })}
              style={styles.stepperBtn}
            >
              <Minus size={14} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={[styles.stepperDivider, { backgroundColor: colors.cardBorder }]} />
            <TouchableOpacity
              onPress={() => onQuickIncrement(item)}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.increaseQuantityA11y', { name: item.nume })}
              style={styles.stepperBtn}
            >
              <Plus size={14} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => onAddMeal(item)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('scannerBarcode.addPantryMealA11y', { name: item.nume })}
            style={[styles.mealBtn, { backgroundColor: colors.accent }]}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={[styles.mealBtnText, { color: colors.textOnAccent }]}
            >
              {t('scannerBarcode.addMealShort')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onOpenEdit(item)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('scannerBarcode.editItemA11y', { name: item.nume })}
            style={[
              styles.editBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.cardBorder },
            ]}
          >
            <SlidersHorizontal size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export const PantryItemCard = React.memo(PantryItemCardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md + 2,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  stockPill: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 11,
    borderRadius: Radius.sm + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockPillText: {
    fontSize: 13.5,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  freshTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 10,
  },
  freshFill: {
    height: '100%',
    borderRadius: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDivider: {
    width: 1,
    height: 18,
  },
  mealBtn: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealBtnText: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
