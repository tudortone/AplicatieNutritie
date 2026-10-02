/**
 * GetFlow — Nutrient Focus Settings Modal
 * Permite configurarea profilurilor prestabilite, selectarea nutrienților afișați
 * și stabilirea preferințelor alimentare non-medicale.
 *
 * RESPECTARE PRINCIPII SIGURANȚĂ:
 * - Nu întreabă utilizatorul „Ai diabet / boli de inimă?” (Fără inferență de diagnostic);
 * - Profilurile sunt opțiuni voluntare de monitorizare nutrițională;
 * - Resetare simplă la setările implicite din fabrică.
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Switch,
} from 'react-native';
import {
  X,
  Check,
  RotateCcw,
  Sliders,
  Utensils,
  Wheat,
  Heart,
  Droplet,
  Leaf,
  Dumbbell,
  ShieldCheck,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import {
  NutrientId,
  PresetId,
  NUTRIENT_DEFINITIONS,
  FOCUS_PRESETS,
  NutrientFocusPreferences,
  selectFocusPreset,
  toggleTrackedNutrient,
  setFoodPreferences,
  resetNutrientFocusToDefaults,
} from '../../lib/nutrientFocus';

export interface NutrientFocusSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  preferences: NutrientFocusPreferences;
  onPreferencesChanged: (prefs: NutrientFocusPreferences) => void;
}

const PRESET_ICONS: Record<PresetId, React.ComponentType<{ size: number; color: string }>> = {
  general: Utensils,
  carb_awareness: Wheat,
  heart_health: Heart,
  low_sodium: Droplet,
  high_fiber: Leaf,
  high_protein: Dumbbell,
  custom: Sliders,
};

const FOOD_PREFERENCE_KEYS = [
  'none',
  'vegetarian',
  'vegan',
  'pescatarian',
  'mediterranean',
  'high_protein',
  'dairy_free',
];

export const NutrientFocusSettingsModal: React.FC<NutrientFocusSettingsModalProps> = ({
  visible,
  onClose,
  preferences,
  onPreferencesChanged,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const handleSelectPreset = async (presetId: PresetId) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const updated = await selectFocusPreset(presetId);
    onPreferencesChanged(updated);
  };

  const handleToggleNutrient = async (nutrientId: NutrientId) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const updated = await toggleTrackedNutrient(nutrientId);
    onPreferencesChanged(updated);
  };

  const handleToggleFoodPref = async (prefKey: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    let updatedList: string[];

    if (prefKey === 'none') {
      updatedList = [];
    } else {
      const exists = preferences.foodPreferences.includes(prefKey);
      if (exists) {
        updatedList = preferences.foodPreferences.filter((p) => p !== prefKey);
      } else {
        updatedList = [...preferences.foodPreferences.filter((p) => p !== 'none'), prefKey];
      }
    }

    const updated = await setFoodPreferences(updatedList);
    onPreferencesChanged(updated);
  };

  const handleResetDefaults = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    const updated = await resetNutrientFocusToDefaults();
    onPreferencesChanged(updated);
  };

  const allNutrientKeys = Object.keys(NUTRIENT_DEFINITIONS) as NutrientId[];
  const trackedSet = new Set(preferences.trackedNutrients);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderColor: colors.cardBorder }]}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {t('nutrientFocus.customize')}
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

        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
          {/* Secțiunea 1: Profiluri Prestabilite */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {t('nutrientFocus.presetsTitle')}
          </Text>

          <View style={styles.presetsGrid}>
            {(Object.keys(FOCUS_PRESETS) as PresetId[]).map((presetId) => {
              const preset = FOCUS_PRESETS[presetId];
              const isSelected = preferences.activePreset === presetId;
              const IconComp = PRESET_ICONS[presetId] || Utensils;

              return (
                <TouchableOpacity
                  key={presetId}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isSelected ? colors.accent + '15' : colors.surfaceBg,
                      borderColor: isSelected ? colors.accent : colors.cardBorder,
                    },
                  ]}
                  onPress={() => handleSelectPreset(presetId)}
                  activeOpacity={0.8}
                >
                  <View style={styles.presetTopRow}>
                    <View style={[styles.presetIconWrap, { backgroundColor: isSelected ? colors.accent : colors.surfaceElevated }]}>
                      <IconComp size={16} color={isSelected ? colors.background : colors.accent} />
                    </View>
                    {isSelected && (
                      <View style={[styles.selectedCheck, { backgroundColor: colors.accent }]}>
                        <Check size={12} color={colors.background} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.presetName, { color: colors.textPrimary }]}>
                    {t(preset.nameKey)}
                  </Text>
                  <Text style={[styles.presetDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t(preset.descriptionKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Secțiunea 2: Nutrienți Monitorizați */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.xl }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('nutrientFocus.nutrientsTitle')}
            </Text>
            <Text style={[styles.sectionCounter, { color: colors.textTertiary }]}>
              ({preferences.trackedNutrients.length} activi)
            </Text>
          </View>

          <View style={[styles.nutrientsListCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
            {allNutrientKeys.map((nutrientId, idx) => {
              const def = NUTRIENT_DEFINITIONS[nutrientId];
              const isTracked = trackedSet.has(nutrientId);

              return (
                <View
                  key={nutrientId}
                  style={[
                    styles.nutrientRow,
                    idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: Spacing.md }}>
                    <Text style={[styles.nutrientRowName, { color: colors.textPrimary }]}>
                      {t(def.nameKey)}
                    </Text>
                    <Text style={[styles.nutrientRowDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                      {t(def.generalReferenceKey || def.descriptionKey)}
                    </Text>
                  </View>

                  <Switch
                    value={isTracked}
                    onValueChange={() => handleToggleNutrient(nutrientId)}
                    trackColor={{ false: colors.surfaceElevated, true: colors.accent + '80' }}
                    thumbColor={isTracked ? colors.accent : colors.textTertiary}
                  />
                </View>
              );
            })}
          </View>

          {/* Secțiunea 3: Preferințe Alimentare (Non-medicale) */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: Spacing.xl }]}>
            {t('nutrientFocus.foodPreferencesTitle')}
          </Text>

          <View style={styles.preferencesWrap}>
            {FOOD_PREFERENCE_KEYS.map((key) => {
              const isSelected = key === 'none'
                ? preferences.foodPreferences.length === 0
                : preferences.foodPreferences.includes(key);

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.prefChip,
                    {
                      backgroundColor: isSelected ? colors.accent : colors.surface,
                      borderColor: isSelected ? colors.accent : colors.cardBorder,
                    },
                  ]}
                  onPress={() => handleToggleFoodPref(key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.prefChipText,
                      { color: isSelected ? colors.background : colors.textPrimary },
                    ]}
                  >
                    {t(`nutrientFocus.foodPreferences.${key}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Buton Resetare Implicite */}
          <TouchableOpacity
            style={[styles.resetButton, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}
            onPress={handleResetDefaults}
            activeOpacity={0.8}
          >
            <RotateCcw size={16} color={colors.textSecondary} />
            <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>
              {t('nutrientFocus.resetDefaults')}
            </Text>
          </TouchableOpacity>

          {/* Disclaimer Conștiincios */}
          <View style={[styles.disclaimerContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <ShieldCheck size={16} color={colors.accent} />
            <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
              {t('nutrientFocus.disclaimer')}
            </Text>
          </View>
        </ScrollView>
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
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  sectionCounter: {
    fontSize: 12,
    fontWeight: '600',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  presetCard: {
    width: '48%',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  presetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  presetIconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheck: {
    width: 18,
    height: 18,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  presetDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  nutrientsListCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  nutrientRowName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  nutrientRowDesc: {
    fontSize: 11,
  },
  preferencesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  prefChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  prefChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disclaimerContainer: {
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
