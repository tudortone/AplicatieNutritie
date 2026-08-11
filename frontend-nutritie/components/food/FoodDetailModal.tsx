/**
 * FoodDetailModal.tsx — Detaliu nutrițional complet pentru un aliment
 * Migrat la Gorhom BottomSheetModal (pattern WatchSelectorSheet.tsx): fără
 * flicker/ecran alb de la RN Modal. Deschis prin ref, mereu montat.
 * Afișează: macronutrienți, aminoacizi, vitamine, minerale.
 * Datele vin din AlimentDetaliat (per porție) sau AlimentAI (per 100g).
 */

import React, { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { X, Beaker, Zap, Droplets, Pill } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { AlimentDetaliat, AminoaciziEsentiali, Micronutrienti } from '../../types';
// BUG-021: foaia folosește colors.* (tema activă), nu hex fixe de altă aplicație.
import { useTheme } from '../../context/ThemeContext';

export interface FoodDetailSheetRef {
  open: (aliment: AlimentDetaliat, per100g?: boolean) => void;
  /** Actualizează alimentul afișat (detalii îmbogățite sosind async) fără re-prezentare. */
  updateAliment: (aliment: AlimentDetaliat) => void;
  close: () => void;
  /** REMED-010: pentru BackHandler-ul foii-părinte (top-of-stack corect pe Android). */
  isPresent: () => boolean;
}

const AMINO_LABELS: Record<keyof AminoaciziEsentiali, string> = {
  leucina: 'Leucină',
  izoleucina: 'Izoleucină',
  valina: 'Valină',
  lizina: 'Lizină',
  metionina: 'Metionină',
  fenilalanina: 'Fenilalanină',
  treonina: 'Treonină',
  triptofan: 'Triptofan',
  istidina: 'Istidină',
};

const VITAMIN_LABELS: { key: keyof Micronutrienti; label: string; unit: string }[] = [
  { key: 'vitamina_a', label: 'Vitamina A', unit: 'µg' },
  { key: 'vitamina_c', label: 'Vitamina C', unit: 'mg' },
  { key: 'vitamina_d', label: 'Vitamina D', unit: 'µg' },
  { key: 'vitamina_e', label: 'Vitamina E', unit: 'mg' },
  { key: 'vitamina_k', label: 'Vitamina K', unit: 'µg' },
  { key: 'vitamina_b1', label: 'Vitamina B1 (Tiamină)', unit: 'mg' },
  { key: 'vitamina_b2', label: 'Vitamina B2 (Riboflavină)', unit: 'mg' },
  { key: 'vitamina_b3', label: 'Vitamina B3 (Niacină)', unit: 'mg' },
  { key: 'vitamina_b6', label: 'Vitamina B6', unit: 'mg' },
  { key: 'vitamina_b9', label: 'Vitamina B9 (Folat)', unit: 'µg' },
  { key: 'vitamina_b12', label: 'Vitamina B12', unit: 'µg' },
];

const MINERAL_LABELS: { key: keyof Micronutrienti; label: string; unit: string }[] = [
  { key: 'calciu', label: 'Calciu', unit: 'mg' },
  { key: 'fier', label: 'Fier', unit: 'mg' },
  { key: 'magneziu', label: 'Magneziu', unit: 'mg' },
  { key: 'fosfor', label: 'Fosfor', unit: 'mg' },
  { key: 'potasiu', label: 'Potasiu', unit: 'mg' },
  { key: 'sodiu', label: 'Sodiu (Sare)', unit: 'mg' },
  { key: 'zinc', label: 'Zinc', unit: 'mg' },
  { key: 'cupru', label: 'Cupru', unit: 'mg' },
  { key: 'mangan', label: 'Mangan', unit: 'mg' },
  { key: 'seleniu', label: 'Seleniu', unit: 'µg' },
  { key: 'iod', label: 'Iod', unit: 'µg' },
];

const OTHER_LABELS: { key: keyof Micronutrienti; label: string; unit: string }[] = [
  { key: 'zaharuri', label: 'Zaharuri', unit: 'g' },
  { key: 'grasimi_saturate', label: 'Grăsimi Saturate', unit: 'g' },
  { key: 'grasimi_trans', label: 'Grăsimi Trans', unit: 'g' },
  { key: 'colesterol', label: 'Colesterol', unit: 'mg' },
  { key: 'fibra', label: 'Fibre', unit: 'g' },
];

function NutrientRow({ label, value, unit, color }: { label: string; value: number; unit: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.nutrientRow}>
      <Text style={[styles.nutrientLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.nutrientValue, { color: color ?? colors.textSecondary }]}>
        {value.toFixed(value < 1 ? 1 : 0)} {unit}
      </Text>
    </View>
  );
}

function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Icon size={16} color={color} />
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
    </View>
  );
}

export const FoodDetailSheet = forwardRef<FoodDetailSheetRef>((_, ref) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [aliment, setAliment] = useState<AlimentDetaliat | null>(null);
  const [per100g, setPer100g] = useState(false);
  // REMED-010: vizibilitate proprie pentru închiderea pe hardware-back (Android).
  const [prezent, setPrezent] = useState(false);
  const snapPoints = useMemo(() => ['72%'], []);

  useImperativeHandle(ref, () => ({
    open: (al: AlimentDetaliat, la100g = false) => {
      setAliment(al);
      setPer100g(la100g);
      setPrezent(true);
      bottomSheetRef.current?.present();
    },
    updateAliment: (al: AlimentDetaliat) => setAliment(al),
    close: () => {
      setPrezent(false);
      bottomSheetRef.current?.dismiss();
    },
    isPresent: () => prezent,
  }));

  // REMED-010: hardware-back pe Android închide DOAR această foie (dacă e deschisă).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (prezent) {
        bottomSheetRef.current?.dismiss();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [prezent]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    [],
  );

  const micronutrienti = aliment?.micronutrienti;
  const aminoacizi = aliment?.aminoacizi;

  const gramaj = aliment?.grame || 100;
  const prefix = per100g ? ' (per 100g)' : ` (${gramaj}g)`;

  const hasAminoacizi = aminoacizi && Object.values(aminoacizi).some(v => (v ?? 0) > 0);
  const hasVitamins = micronutrienti && VITAMIN_LABELS.some(v => (micronutrienti[v.key] ?? 0) > 0);
  const hasMinerals = micronutrienti && MINERAL_LABELS.some(m => (micronutrienti[m.key] ?? 0) > 0);
  const hasOther = micronutrienti && OTHER_LABELS.some(o => (micronutrienti[o.key] ?? 0) > 0);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      stackBehavior="push"
      enablePanDownToClose
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, borderWidth: 1 }}
      handleIndicatorStyle={{ backgroundColor: colors.overlayStrong, width: 44 }}
      onDismiss={() => setPrezent(false)}
    >
      {aliment ? (
        <>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => bottomSheetRef.current?.dismiss()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('jurnal.closeNutritionDetails')}
          >
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{aliment.nume}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('jurnal.nutritionDetails')}{prefix}
              </Text>
            </View>
          </View>

          <BottomSheetScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Macronutrienți */}
            <SectionHeader icon={Zap} title={t('jurnal.macronutrients')} color={colors.accent} />
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <NutrientRow label={t('jurnal.macroCalories')} value={aliment.calorii} unit="kcal" color={colors.textPrimary} />
              <NutrientRow label={t('jurnal.macroProtein')} value={aliment.proteine} unit="g" color={colors.success} />
              <NutrientRow label={t('jurnal.macroCarbs')} value={aliment.carbohidrati} unit="g" color={colors.warning} />
              <NutrientRow label={t('jurnal.macroFats')} value={aliment.grasimi} unit="g" color={colors.danger} />
              {(aliment.fibre ?? 0) > 0 && (
                <NutrientRow label={t('jurnal.macroFiber')} value={aliment.fibre!} unit="g" color={colors.accentSecondary} />
              )}
            </View>

            {/* Aminoacizi */}
            {hasAminoacizi && (
              <>
                <SectionHeader icon={Beaker} title={t('jurnal.aminoAcids')} color={colors.accentSecondary} />
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  {Object.entries(AMINO_LABELS).map(([key, label]) => {
                    const val = aminoacizi![key as keyof AminoaciziEsentiali];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit="mg" color={colors.accentSecondary} />;
                  })}
                  {/* Total BCAA */}
                  {((aminoacizi?.leucina ?? 0) + (aminoacizi?.izoleucina ?? 0) + (aminoacizi?.valina ?? 0)) > 0 && (
                    <View style={[styles.bcaaRow, { borderTopColor: colors.accentSecondary + '30' }]}>
                      <Text style={[styles.bcaaLabel, { color: colors.accentSecondary }]}>Total BCAA</Text>
                      <Text style={[styles.bcaaValue, { color: colors.accentSecondary }]}>
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
                <SectionHeader icon={Pill} title={t('jurnal.vitamins')} color={colors.success} />
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  {VITAMIN_LABELS.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color={colors.accentTertiary} />;
                  })}
                </View>
              </>
            )}

            {/* Minerale */}
            {hasMinerals && (
              <>
                <SectionHeader icon={Droplets} title={t('jurnal.minerals')} color={colors.warning} />
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  {MINERAL_LABELS.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color={colors.warning} />;
                  })}
                </View>
              </>
            )}

            {/* Alte detalii */}
            {hasOther && (
              <>
                <SectionHeader icon={Zap} title={t('jurnal.otherDetails')} color={colors.textSecondary} />
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  {OTHER_LABELS.map(({ key, label, unit }) => {
                    const val = micronutrienti![key];
                    if (!val || val <= 0) return null;
                    return <NutrientRow key={key} label={label} value={val} unit={unit} color={colors.textSecondary} />;
                  })}
                </View>
              </>
            )}

            {/* Fallback: nicio informație suplimentară */}
            {!hasAminoacizi && !hasVitamins && !hasMinerals && !hasOther && (
              <View style={styles.emptyCard}>
                <Beaker size={32} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t('jurnal.nutritionEmpty')}
                </Text>
                <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                  {t('jurnal.nutritionBarcodeHint')}
                </Text>
              </View>
            )}

            <View style={{ height: 30 }} />
          </BottomSheetScrollView>
        </>
      ) : null}
    </BottomSheetModal>
  );
});

FoodDetailSheet.displayName = 'FoodDetailSheet';

const styles = StyleSheet.create({
  closeBtn: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
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
    borderBottomColor: '#33415550',
  },
  nutrientLabel: {
    fontSize: 13,
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
  },
  bcaaLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  bcaaValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHint: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});