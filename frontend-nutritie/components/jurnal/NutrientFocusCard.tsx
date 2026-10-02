/**
 * GetFlow — Nutrient Focus Card
 * Widget compact și progresiv pentru jurnal, afișând nutrienții prioritari aleși de utilizator.
 *
 * RESPECTARE PRINCIPII SIGURANȚĂ:
 * - Nu este un dispozitiv medical;
 * - Nu calculează doze de insulină;
 * - MISSING ≠ ZERO: Afișează explicit atenționarea de date incomplete când un aliment nu declară nutrientul.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  SlidersHorizontal,
  ChevronRight,
  AlertCircle,
  Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import { Masa } from '../../types';
import {
  NutrientId,
  NutrientAggregatedItem,
  NutrientFocusPreferences,
  DEFAULT_NUTRIENT_FOCUS_PREFERENCES,
  FOCUS_PRESETS,
  getNutrientFocusPreferences,
  calculateNutrientTotals,
} from '../../lib/nutrientFocus';
import { NutrientFocusDetailModal } from './NutrientFocusDetailModal';
import { NutrientFocusSettingsModal } from './NutrientFocusSettingsModal';

export interface NutrientFocusCardProps {
  mese: Masa[];
  onOpenSettings?: () => void;
  onOpenDetails?: (nutrientId?: NutrientId) => void;
}

export const NutrientFocusCard: React.FC<NutrientFocusCardProps> = ({
  mese,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [preferences, setPreferences] = useState<NutrientFocusPreferences>(
    DEFAULT_NUTRIENT_FOCUS_PREFERENCES
  );
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [selectedNutrientForDetail, setSelectedNutrientForDetail] = useState<NutrientId>('carbs');

  const loadPreferences = useCallback(async () => {
    try {
      const prefs = await getNutrientFocusPreferences();
      setPreferences(prefs);
    } catch {
      // Fallback la default
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Calcul agregat al nutrienților pe baza meselor curente
  const aggregatedNutrients: NutrientAggregatedItem[] = useMemo(() => {
    const order = preferences.nutrientOrder && preferences.nutrientOrder.length > 0
      ? preferences.nutrientOrder
      : preferences.trackedNutrients;
    return calculateNutrientTotals(mese, order, preferences.customTargets);
  }, [mese, preferences]);

  // Afișăm primii 4 nutrienți în cardul compact
  const displayNutrients = useMemo(() => {
    return aggregatedNutrients.slice(0, 4);
  }, [aggregatedNutrients]);

  const activePresetMeta = FOCUS_PRESETS[preferences.activePreset] || FOCUS_PRESETS.general;

  const handleOpenDetails = (nutrientId?: NutrientId) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (nutrientId) setSelectedNutrientForDetail(nutrientId);
    else if (displayNutrients.length > 0) setSelectedNutrientForDetail(displayNutrients[0].nutrientId);
    setDetailModalVisible(true);
  };

  const handleOpenSettings = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSettingsModalVisible(true);
  };

  const handlePreferencesUpdated = (newPrefs: NutrientFocusPreferences) => {
    setPreferences(newPrefs);
  };

  const hasAnyIncompleteData = useMemo(() => {
    return displayNutrients.some((it) => it.status === 'incomplete');
  }, [displayNutrients]);

  if (loadingPrefs) {
    return (
      <View style={[styles.loadingContainer, { borderColor: colors.cardBorder }]}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
      {/* Header card */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Sparkles size={16} color={colors.accent} />
          <Text style={[styles.titleText, { color: colors.textPrimary }]}>
            {t('nutrientFocus.todaysFocus')}
          </Text>
          <View style={[styles.presetBadge, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '35' }]}>
            <Text style={[styles.presetBadgeText, { color: colors.accent }]}>
              {t(activePresetMeta.nameKey)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.settingsButton, { borderColor: colors.cardBorder }]}
          onPress={handleOpenSettings}
          accessibilityRole="button"
          accessibilityLabel={t('nutrientFocus.customize')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SlidersHorizontal size={14} color={colors.textSecondary} />
          <Text style={[styles.settingsBtnText, { color: colors.textSecondary }]}>
            {t('nutrientFocus.customize')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Grid de nutrienți compact */}
      <View style={styles.gridContainer}>
        {displayNutrients.map((item) => {
          const isNoData = item.status === 'no_data';
          const isIncomplete = item.status === 'incomplete';
          const hasTarget = item.target !== undefined && item.target > 0;

          let percent = 0;
          let progressColor = colors.accent;

          if (hasTarget && item.total !== null && item.target) {
            percent = Math.min(100, Math.round((item.total / item.target) * 100));
            if (item.isLimit) {
              if (item.total > item.target) progressColor = colors.danger;
              else if (percent > 85) progressColor = colors.warning;
              else progressColor = colors.accent;
            } else {
              if (percent >= 100) progressColor = colors.success;
              else progressColor = colors.accent;
            }
          }

          return (
            <TouchableOpacity
              key={item.nutrientId}
              style={[styles.nutrientCard, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}
              onPress={() => handleOpenDetails(item.nutrientId)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t(item.definition.nameKey)}: ${item.total !== null ? item.total : t('nutrientFocus.notAvailable')} ${item.unit}`}
            >
              <View style={styles.nutrientCardHeader}>
                <Text style={[styles.nutrientName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t(item.definition.shortKey)}
                </Text>
                {isIncomplete && (
                  <View style={[styles.warningDot, { backgroundColor: colors.warning }]} />
                )}
              </View>

              <View style={styles.valueRow}>
                {isNoData ? (
                  <Text style={[styles.noDataText, { color: colors.textTertiary }]}>
                    {t('nutrientFocus.notAvailable')}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.valueText, { color: colors.textPrimary }]}>
                      {item.total?.toLocaleString()}
                      {isIncomplete && <Text style={{ color: colors.warning }}>*</Text>}
                    </Text>
                    <Text style={[styles.unitText, { color: colors.textSecondary }]}>
                      {item.unit}
                    </Text>
                  </>
                )}
              </View>

              {/* Țintă și bară de progres */}
              {hasTarget && item.total !== null && (
                <View style={styles.targetProgressContainer}>
                  <View style={[styles.progressBarTrack, { backgroundColor: colors.surfaceElevated }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${percent}%`,
                          backgroundColor: progressColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.targetSubtext, { color: colors.textTertiary }]}>
                    / {item.target?.toLocaleString()} {item.unit}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Avertisment date incomplete (MISSING ≠ ZERO) */}
      {hasAnyIncompleteData && (
        <View style={[styles.incompleteBanner, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
          <AlertCircle size={13} color={colors.warning} />
          <Text style={[styles.incompleteBannerText, { color: colors.textSecondary }]}>
            * {t('nutrientFocus.incompleteDataWarning')}
          </Text>
        </View>
      )}

      {/* Footer "Vezi detalii" */}
      <TouchableOpacity
        style={[styles.footerAction, { borderColor: colors.cardBorder }]}
        onPress={() => handleOpenDetails()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('nutrientFocus.viewDetails')}
      >
        <Text style={[styles.footerActionText, { color: colors.accent }]}>
          {t('nutrientFocus.viewDetails')}
        </Text>
        <ChevronRight size={14} color={colors.accent} />
      </TouchableOpacity>

      {/* Modale */}
      <NutrientFocusDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        mese={mese}
        initialNutrientId={selectedNutrientForDetail}
        preferences={preferences}
        onSaveCustomTarget={async (nutrientId, val) => {
          const { setCustomNutrientTarget } = await import('../../lib/nutrientFocus');
          const updated = await setCustomNutrientTarget(nutrientId, val);
          setPreferences(updated);
        }}
      />

      <NutrientFocusSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        preferences={preferences}
        onPreferencesChanged={handlePreferencesUpdated}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  loadingContainer: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  presetBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginLeft: Spacing.xs,
  },
  presetBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  settingsBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  nutrientCard: {
    flex: 1,
    minWidth: '46%',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  nutrientCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  nutrientName: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginVertical: 2,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '800',
  },
  unitText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noDataText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 2,
  },
  targetProgressContainer: {
    marginTop: 4,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 2,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  targetSubtext: {
    fontSize: 10,
    fontWeight: '500',
  },
  incompleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    marginTop: Spacing.xs,
  },
  incompleteBannerText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
