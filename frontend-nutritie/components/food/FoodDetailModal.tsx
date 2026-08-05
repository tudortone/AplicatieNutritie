/**
 * FoodDetailModal.tsx — Detaliu nutrițional complet pentru un aliment
 * Afișează: macronutrienți, aminoacizi, vitamine, minerale
 * Datele vin din AlimentDetaliat (per porție) sau AlimentAI (per 100g)
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { X, Beaker, Zap, Droplets, Pill } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { AlimentDetaliat, AminoaciziEsentiali, Micronutrienti } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ThemeColors } from '../../constants/theme';

interface FoodDetailModalProps {
  visible: boolean;
  onClose: () => void;
  aliment: AlimentDetaliat | null;
  /** Dacă datele sunt per 100g în loc de per porție */
  per100g?: boolean;
}

function aminoLabels(t: TFunction): Record<keyof AminoaciziEsentiali, string> {
  return {
    leucina: t('food.detail.amino.leucina'),
    izoleucina: t('food.detail.amino.izoleucina'),
    valina: t('food.detail.amino.valina'),
    lizina: t('food.detail.amino.lizina'),
    metionina: t('food.detail.amino.metionina'),
    fenilalanina: t('food.detail.amino.fenilalanina'),
    treonina: t('food.detail.amino.treonina'),
    triptofan: t('food.detail.amino.triptofan'),
    istidina: t('food.detail.amino.istidina'),
  };
}

function vitaminLabels(t: TFunction): Array<{ key: keyof Micronutrienti; label: string; unit: string }> {
  return [
    { key: 'vitamina_a', label: t('food.detail.vitamin.a'), unit: 'µg' },
    { key: 'vitamina_c', label: t('food.detail.vitamin.c'), unit: 'mg' },
    { key: 'vitamina_d', label: t('food.detail.vitamin.d'), unit: 'µg' },
    { key: 'vitamina_e', label: t('food.detail.vitamin.e'), unit: 'mg' },
    { key: 'vitamina_k', label: t('food.detail.vitamin.k'), unit: 'µg' },
    { key: 'vitamina_b1', label: t('food.detail.vitamin.b1'), unit: 'mg' },
    { key: 'vitamina_b2', label: t('food.detail.vitamin.b2'), unit: 'mg' },
    { key: 'vitamina_b3', label: t('food.detail.vitamin.b3'), unit: 'mg' },
    { key: 'vitamina_b6', label: t('food.detail.vitamin.b6'), unit: 'mg' },
    { key: 'vitamina_b9', label: t('food.detail.vitamin.b9'), unit: 'µg' },
    { key: 'vitamina_b12', label: t('food.detail.vitamin.b12'), unit: 'µg' },
  ];
}

function mineralLabels(t: TFunction): Array<{ key: keyof Micronutrienti; label: string; unit: string }> {
  return [
    { key: 'calciu', label: t('food.detail.mineral.calciu'), unit: 'mg' },
    { key: 'fier', label: t('food.detail.mineral.fier'), unit: 'mg' },
    { key: 'magneziu', label: t('food.detail.mineral.magneziu'), unit: 'mg' },
    { key: 'fosfor', label: t('food.detail.mineral.fosfor'), unit: 'mg' },
    { key: 'potasiu', label: t('food.detail.mineral.potasiu'), unit: 'mg' },
    { key: 'sodiu', label: t('food.detail.mineral.sodiu'), unit: 'mg' },
    { key: 'zinc', label: t('food.detail.mineral.zinc'), unit: 'mg' },
    { key: 'cupru', label: t('food.detail.mineral.cupru'), unit: 'mg' },
    { key: 'mangan', label: t('food.detail.mineral.mangan'), unit: 'mg' },
    { key: 'seleniu', label: t('food.detail.mineral.seleniu'), unit: 'µg' },
    { key: 'iod', label: t('food.detail.mineral.iod'), unit: 'µg' },
  ];
}

function otherLabels(t: TFunction): Array<{ key: keyof Micronutrienti; label: string; unit: string }> {
  return [
    { key: 'zaharuri', label: t('food.detail.other.zaharuri'), unit: 'g' },
    { key: 'grasimi_saturate', label: t('food.detail.other.grasimiSaturate'), unit: 'g' },
    { key: 'grasimi_trans', label: t('food.detail.other.grasimiTrans'), unit: 'g' },
    { key: 'colesterol', label: t('food.detail.other.colesterol'), unit: 'mg' },
    { key: 'fibra', label: t('food.detail.other.fibra'), unit: 'g' },
  ];
}

type FoodDetailStyles = ReturnType<typeof createStyles>;

function NutrientRow({ label, value, unit, color, styles }: { label: string; value: number; unit: string; color?: string; styles: FoodDetailStyles }) {
  return (
    <View style={styles.nutrientRow}>
      <Text style={styles.nutrientLabel}>{label}</Text>
      <Text style={[styles.nutrientValue, { color }]}>
        {value.toFixed(value < 1 ? 1 : 0)} {unit}
      </Text>
    </View>
  );
}

function SectionHeader({ icon: Icon, title, color, styles }: { icon: LucideIcon; title: string; color: string; styles: FoodDetailStyles }) {
  return (
    <View style={styles.sectionHeader}>
      <Icon size={16} color={color} />
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
    </View>
  );
}

export function FoodDetailModal({ visible, onClose, aliment, per100g }: FoodDetailModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!aliment) return null;

  const micronutrienti = aliment.micronutrienti;
  const aminoacizi = aliment.aminoacizi;

  const gramaj = aliment.grame || 100;

  const amino = aminoLabels(t);
  const vitamins = vitaminLabels(t);
  const minerals = mineralLabels(t);
  const others = otherLabels(t);

  const hasAminoacizi = aminoacizi && Object.values(aminoacizi).some(v => (v ?? 0) > 0);
  const hasVitamins = micronutrienti && vitamins.some(v => (micronutrienti[v.key] ?? 0) > 0);
  const hasMinerals = micronutrienti && minerals.some(m => (micronutrienti[m.key] ?? 0) > 0);
  const hasOther = micronutrienti && others.some(o => (micronutrienti[o.key] ?? 0) > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{aliment.nume}</Text>
              <Text style={styles.subtitle}>
                {per100g
                  ? t('food.detail.subtitlePer100g')
                  : t('food.detail.subtitleForGrams', { grame: gramaj })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('food.detail.close')}
            >
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Macronutrienți */}
            <SectionHeader icon={Zap} title={t('food.detail.sections.macros')} color={colors.accent} styles={styles} />
            <View style={styles.card}>
              <NutrientRow label={t('food.detail.macro.calories')} value={aliment.calorii} unit="kcal" color={colors.textPrimary} styles={styles} />
              <NutrientRow label={t('food.detail.macro.proteins')} value={aliment.proteine} unit="g" color={colors.success} styles={styles} />
              <NutrientRow label={t('food.detail.macro.carbs')} value={aliment.carbohidrati} unit="g" color={colors.warning} styles={styles} />
              <NutrientRow label={t('food.detail.macro.fats')} value={aliment.grasimi} unit="g" color={colors.danger} styles={styles} />
              {(aliment.fibre ?? 0) > 0 && (
                <NutrientRow label={t('food.detail.macro.fiber')} value={aliment.fibre!} unit="g" color={colors.accentSecondary} styles={styles} />
              )}
            </View>

            {/* Aminoacizi */}
            {hasAminoacizi && (
              <>
                <SectionHeader icon={Beaker} title={t('food.detail.sections.amino')} color={colors.accentSecondary} styles={styles} />
                <View style={styles.card}>
                  {Object.entries(amino).map(([key, label]) => {
                    const val = aminoacizi![key as keyof AminoaciziEsentiali];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit="mg" color={colors.accentSecondary} styles={styles} />;
                  })}
                  {/* Total BCAA */}
                  {((aminoacizi?.leucina ?? 0) + (aminoacizi?.izoleucina ?? 0) + (aminoacizi?.valina ?? 0)) > 0 && (
                    <View style={styles.bcaaRow}>
                      <Text style={styles.bcaaLabel}>{t('food.detail.totalBcaa')}</Text>
                      <Text style={styles.bcaaValue}>
                        {((aminoacizi?.leucina ?? 0) + (aminoacizi?.izoleucina ?? 0) + (aminoacizi?.valina ?? 0)).toFixed(0)} mg
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Vitamine */}
            {hasVitamins && (
              <>
                <SectionHeader icon={Pill} title={t('food.detail.sections.vitamins')} color={colors.success} styles={styles} />
                <View style={styles.card}>
                  {vitamins.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color={colors.success} styles={styles} />;
                  })}
                </View>
              </>
            )}

            {/* Minerale */}
            {hasMinerals && (
              <>
                <SectionHeader icon={Droplets} title={t('food.detail.sections.minerals')} color={colors.warning} styles={styles} />
                <View style={styles.card}>
                  {minerals.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color={colors.warning} styles={styles} />;
                  })}
                </View>
              </>
            )}

            {/* Alte detalii */}
            {hasOther && (
              <>
                <SectionHeader icon={Zap} title={t('food.detail.sections.other')} color={colors.textTertiary} styles={styles} />
                <View style={styles.card}>
                  {others.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color={colors.textSecondary} styles={styles} />;
                  })}
                </View>
              </>
            )}

            {/* Fallback: nicio informație suplimentară */}
            {!hasAminoacizi && !hasVitamins && !hasMinerals && !hasOther && (
              <View style={styles.emptyCard}>
                <Beaker size={32} color={colors.textTertiary} />
                <Text style={styles.emptyText}>{t('food.detail.emptyMessage')}</Text>
                <Text style={styles.emptyHint}>{t('food.detail.emptyHint')}</Text>
              </View>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modal: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
      paddingTop: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
      marginTop: 6,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      gap: 2,
    },
    nutrientRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    nutrientLabel: {
      fontSize: 13,
      color: colors.textTertiary,
      fontWeight: '500',
    },
    nutrientValue: {
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    bcaaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: `${colors.accentSecondary}30`,
    },
    bcaaLabel: {
      fontSize: 13,
      color: colors.accentSecondary,
      fontWeight: '800',
    },
    bcaaValue: {
      fontSize: 14,
      color: colors.accentSecondary,
      fontWeight: '900',
    },
    emptyCard: {
      alignItems: 'center',
      padding: 30,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyHint: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
