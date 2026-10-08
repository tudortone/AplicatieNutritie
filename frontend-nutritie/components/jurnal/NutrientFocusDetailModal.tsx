/**
 * GetFlow — Nutrient Focus Detail Modal
 * Vedere detaliată a nutrienților: ierarhia contributorilor de azi,
 * distribuția pe mese, ținte clinice/individuale și avertizări de date lipsă.
 *
 * RESPECTARE PRINCIPII SIGURANȚĂ:
 * - Nu este un dispozitiv medical;
 * - Nu calculează doze de insulină;
 * - Nu face predicții medicale de tipul „Diabetul tău se îmbunătățește”;
 * - Etichete strict neutre („Contribuitor principal”, „Contribuitor moderat”).
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  AlertCircle,
  TrendingUp,
  PieChart,
  ShieldAlert,
  Edit3,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import { Masa } from '../../types';
import {
  NutrientId,
  NUTRIENT_DEFINITIONS,
  NutrientFocusPreferences,
  calculateNutrientTotals,
  getTopContributors,
  getMealBreakdown,
} from '../../lib/nutrientFocus';

export interface NutrientFocusDetailModalProps {
  visible: boolean;
  onClose: () => void;
  mese: Masa[];
  initialNutrientId?: NutrientId;
  preferences: NutrientFocusPreferences;
  onSaveCustomTarget?: (nutrientId: NutrientId, value: number | null) => Promise<void>;
}

export const NutrientFocusDetailModal: React.FC<NutrientFocusDetailModalProps> = ({
  visible,
  onClose,
  mese,
  initialNutrientId = 'carbs',
  preferences,
  onSaveCustomTarget,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [activeNutrientId, setActiveNutrientId] = useState<NutrientId>(initialNutrientId);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  // Sincronizăm nutrientul inițial când se deschide modalul
  React.useEffect(() => {
    if (initialNutrientId) {
      setActiveNutrientId(initialNutrientId);
    }
  }, [initialNutrientId, visible]);

  const activeDef = NUTRIENT_DEFINITIONS[activeNutrientId] || NUTRIENT_DEFINITIONS.carbs;

  // Calcul agregat pentru toți nutrienții monitorizați
  const aggregatedList = useMemo(() => {
    const list = preferences.trackedNutrients && preferences.trackedNutrients.length > 0
      ? preferences.trackedNutrients
      : ['calories', 'protein', 'carbs', 'fat', 'fiber'];
    return calculateNutrientTotals(mese, list as NutrientId[], preferences.customTargets);
  }, [mese, preferences]);

  const activeAggregated = useMemo(() => {
    return (
      aggregatedList.find((it) => it.nutrientId === activeNutrientId) ||
      calculateNutrientTotals(mese, [activeNutrientId], preferences.customTargets)[0]
    );
  }, [aggregatedList, activeNutrientId, mese, preferences]);

  // Top contributori de azi (Factual și Neutru)
  const topContributors = useMemo(() => {
    return getTopContributors(mese, activeNutrientId, 6);
  }, [mese, activeNutrientId]);

  // Distribuție pe mese
  const mealBreakdown = useMemo(() => {
    return getMealBreakdown(mese, activeNutrientId, {
      mic_dejun: t('chat.mealCategory.mic_dejun', { defaultValue: 'Mic Dejun' }),
      pranz: t('chat.mealCategory.pranz', { defaultValue: 'Prânz' }),
      cina: t('chat.mealCategory.cina', { defaultValue: 'Cină' }),
      gustare: t('chat.mealCategory.gustare', { defaultValue: 'Gustări' }),
    });
  }, [mese, activeNutrientId, t]);

  const handleSelectNutrient = (nutrientId: NutrientId) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setActiveNutrientId(nutrientId);
    setEditingTarget(false);
  };

  const handleStartEditTarget = () => {
    setTargetInput(activeAggregated.target ? String(activeAggregated.target) : '');
    setEditingTarget(true);
  };

  const handleSaveTarget = async () => {
    const num = parseInt(targetInput.trim(), 10);
    const valid = Number.isFinite(num) && num > 0 ? num : null;
    if (onSaveCustomTarget) {
      await onSaveCustomTarget(activeNutrientId, valid);
    }
    setEditingTarget(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  };

  const handleClearTarget = async () => {
    if (onSaveCustomTarget) {
      await onSaveCustomTarget(activeNutrientId, null);
    }
    setEditingTarget(false);
  };

  const hasIncompleteData = activeAggregated.status === 'incomplete';
  const isNoData = activeAggregated.status === 'no_data';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView
        testID="nutrient-focus-detail-safe-area"
        edges={['top', 'bottom', 'left', 'right']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { borderColor: colors.cardBorder }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {t('nutrientFocus.title')}
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                {t('nutrientFocus.subtitle')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
              accessibilityRole="button"
              accessibilityLabel={t('nutrientFocus.close')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Bară orizontală de selecție nutrienți */}
          <View style={styles.selectorWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
              {aggregatedList.map((item) => {
                const isSelected = item.nutrientId === activeNutrientId;
                return (
                  <TouchableOpacity
                    key={item.nutrientId}
                    style={[
                      styles.nutrientTab,
                      {
                        backgroundColor: isSelected ? colors.accent : colors.surface,
                        borderColor: isSelected ? colors.accent : colors.cardBorder,
                      },
                    ]}
                    onPress={() => handleSelectNutrient(item.nutrientId)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.nutrientTabText,
                        { color: isSelected ? colors.background : colors.textPrimary },
                      ]}
                    >
                      {t(item.definition.shortKey)}
                    </Text>
                    {item.status === 'incomplete' && (
                      <View
                        style={[
                          styles.tabDot,
                          { backgroundColor: isSelected ? colors.background : colors.warning },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
            {/* Card Hero Nutritiv */}
            <View style={[styles.heroCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={[styles.heroNutrientName, { color: colors.textPrimary }]}>
                    {t(activeDef.nameKey)}
                  </Text>
                  <Text style={[styles.heroNutrientDesc, { color: colors.textSecondary }]}>
                    {t(activeDef.descriptionKey)}
                  </Text>
                </View>
              </View>

              <View style={styles.heroAmountRow}>
                {isNoData ? (
                  <Text style={[styles.heroNoData, { color: colors.textTertiary }]}>
                    {t('nutrientFocus.notAvailable')}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.heroAmountNumber, { color: colors.textPrimary }]}>
                      {activeAggregated.total?.toLocaleString()}
                      {hasIncompleteData && <Text style={{ color: colors.warning }}>*</Text>}
                    </Text>
                    <Text style={[styles.heroAmountUnit, { color: colors.textSecondary }]}>
                      {activeAggregated.unit}
                    </Text>
                  </>
                )}
              </View>

              {/* Status Țintă vs Consumat */}
              <View style={[styles.targetInfoBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={styles.targetRowHeader}>
                  <Text style={[styles.targetTitle, { color: colors.textSecondary }]}>
                    {activeAggregated.hasCustomTarget
                      ? t('nutrientFocus.customTarget')
                      : t('nutrientFocus.generalReference')}
                  </Text>
                  <TouchableOpacity
                    onPress={handleStartEditTarget}
                    style={styles.editTargetBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('nutrientFocus.setCustomTarget')}
                  >
                    <Edit3 size={13} color={colors.accent} />
                    <Text style={[styles.editTargetText, { color: colors.accent }]}>
                      {t('nutrientFocus.setCustomTarget')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {editingTarget ? (
                  <View style={styles.editInputContainer}>
                    <TextInput
                      style={[styles.targetInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                      keyboardType="numeric"
                      value={targetInput}
                      onChangeText={setTargetInput}
                      placeholder={t('nutrientFocus.enterTargetAmount', { unit: activeDef.unit })}
                      placeholderTextColor={colors.textTertiary}
                      autoFocus
                    />
                    <View style={styles.editBtnRow}>
                      <TouchableOpacity
                        style={[styles.saveTargetBtn, { backgroundColor: colors.accent }]}
                        onPress={handleSaveTarget}
                      >
                        <Check size={14} color={colors.background} />
                        <Text style={[styles.saveTargetBtnText, { color: colors.background }]}>
                          {t('nutrientFocus.save')}
                        </Text>
                      </TouchableOpacity>
                      {activeAggregated.hasCustomTarget && (
                        <TouchableOpacity
                          style={[styles.clearTargetBtn, { borderColor: colors.cardBorder }]}
                          onPress={handleClearTarget}
                        >
                          <Text style={[styles.clearTargetBtnText, { color: colors.danger }]}>
                            {t('nutrientFocus.clearCustomTarget')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.targetDisplayRow}>
                    <Text style={[styles.targetValueText, { color: colors.textPrimary }]}>
                      {activeAggregated.target
                        ? `${activeAggregated.target.toLocaleString()} ${activeAggregated.unit}`
                        : t('nutrientFocus.notAvailable')}
                    </Text>
                    <Text style={[styles.targetTypeSubtext, { color: colors.textTertiary }]}>
                      ({activeDef.isLimit ? t('nutrientFocus.targetTypeLimit') : t('nutrientFocus.targetTypeGoal')})
                    </Text>
                  </View>
                )}

                <Text style={[styles.healthcareAdviceNote, { color: colors.textTertiary }]}>
                  {t('nutrientFocus.healthcareNotice')}
                </Text>
              </View>

              {/* Explicație explicită Date Incomplete (MISSING ≠ ZERO) */}
              {hasIncompleteData && (
                <View style={[styles.incompleteExplanationCard, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
                  <AlertCircle size={16} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.incompleteExpTitle, { color: colors.warning }]}>
                      {t('nutrientFocus.incompleteDataBadge')} ({activeAggregated.missingFoodsCount} {t('nutrientFocus.incompleteDataWarning')})
                    </Text>
                    <Text style={[styles.incompleteExpBody, { color: colors.textSecondary }]}>
                      {t('nutrientFocus.incompleteDataExplanation')}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Secțiunea: Cei mai importanți contributori de azi */}
            <View style={styles.sectionHeaderRow}>
              <PieChart size={16} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('nutrientFocus.topContributors')}
              </Text>
            </View>

            {topContributors.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                <Text style={[styles.emptyCardText, { color: colors.textTertiary }]}>
                  {isNoData ? t('nutrientFocus.noDataForNutrient') : t('nutrientFocus.noFoodsLogged')}
                </Text>
              </View>
            ) : (
              <View style={[styles.contributorsCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                {topContributors.map((item, idx) => {
                  let badgeBg = colors.accent + '20';
                  let badgeText = colors.accent;
                  let label = t('nutrientFocus.higherContributor');

                  if (item.classification === 'moderate') {
                    badgeBg = colors.surfaceElevated;
                    badgeText = colors.textSecondary;
                    label = t('nutrientFocus.moderateContributor');
                  } else if (item.classification === 'lower') {
                    badgeBg = colors.surface;
                    badgeText = colors.textTertiary;
                    label = t('nutrientFocus.lowerContributor');
                  }

                  return (
                    <View
                      key={`${item.foodName}_${idx}`}
                      style={[
                        styles.contributorRow,
                        idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder },
                      ]}
                    >
                      <View style={{ flex: 1, marginRight: Spacing.sm }}>
                        <Text style={[styles.foodName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.foodName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={[styles.neutralBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[styles.neutralBadgeText, { color: badgeText }]}>{label}</Text>
                          </View>
                          <Text style={[styles.foodPercentage, { color: colors.textTertiary }]}>
                            {item.percentage}% din total
                          </Text>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.foodAmount, { color: colors.textPrimary }]}>
                          {item.amount.toLocaleString()} {item.unit}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Secțiunea: Distribuție pe mese */}
            <View style={[styles.sectionHeaderRow, { marginTop: Spacing.xl }]}>
              <TrendingUp size={16} color={colors.accentSecondary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('nutrientFocus.perMealBreakdown')}
              </Text>
            </View>

            <View style={[styles.mealBreakdownCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
              {mealBreakdown.map((meal, idx) => {
                return (
                  <View
                    key={meal.mealType}
                    style={[
                      styles.mealRow,
                      idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mealLabel, { color: colors.textPrimary }]}>
                        {meal.mealLabel}
                      </Text>
                      {meal.hasIncompleteData && (
                        <Text style={[styles.mealIncompleteNotice, { color: colors.warning }]}>
                          * {t('nutrientFocus.incompleteDataBadge')}
                        </Text>
                      )}
                    </View>

                    <Text style={[styles.mealAmount, { color: colors.textPrimary }]}>
                      {meal.amount !== null
                        ? `${meal.amount.toLocaleString()} ${meal.unit}${meal.hasIncompleteData ? '*' : ''}`
                        : t('nutrientFocus.notAvailable')}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Disclaimer Medical & Siguranță Google Play */}
            <View style={[styles.disclaimerBox, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
              <ShieldAlert size={16} color={colors.textSecondary} />
              <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                {t('nutrientFocus.disclaimer')}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  selectorWrapper: {
    paddingVertical: Spacing.sm,
  },
  selectorScroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  nutrientTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    gap: 4,
  },
  nutrientTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  heroTopRow: {
    marginBottom: Spacing.sm,
  },
  heroNutrientName: {
    fontSize: 20,
    fontWeight: '800',
  },
  heroNutrientDesc: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: Spacing.sm,
  },
  heroAmountNumber: {
    fontSize: 34,
    fontWeight: '800',
  },
  heroAmountUnit: {
    fontSize: 16,
    fontWeight: '600',
  },
  heroNoData: {
    fontSize: 18,
    fontStyle: 'italic',
    paddingVertical: Spacing.xs,
  },
  targetInfoBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  targetRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  targetTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  editTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 2,
  },
  editTargetText: {
    fontSize: 11,
    fontWeight: '700',
  },
  targetDisplayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: 4,
  },
  targetValueText: {
    fontSize: 16,
    fontWeight: '700',
  },
  targetTypeSubtext: {
    fontSize: 11,
    fontWeight: '500',
  },
  healthcareAdviceNote: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
  editInputContainer: {
    marginVertical: Spacing.xs,
  },
  targetInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  saveTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  saveTargetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  clearTargetBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  clearTargetBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  incompleteExplanationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  incompleteExpTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  incompleteExpBody: {
    fontSize: 11,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  contributorsCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  foodName: {
    fontSize: 13,
    fontWeight: '600',
  },
  neutralBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  neutralBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  foodPercentage: {
    fontSize: 11,
    fontWeight: '500',
  },
  foodAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  mealBreakdownCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  mealLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  mealIncompleteNotice: {
    fontSize: 11,
    marginTop: 2,
  },
  mealAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
});
