import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Egg,
  Flame,
  Zap,
  Crown,
  Sparkles,
  Lightbulb,
  X,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  getCompanionStage,
  getDaysUntilNextEvolution,
  getEvolutionProgressPercent,
  getLimitBeaconStatus,
  type CompanionStageId,
} from '../../lib/flowCompanion';

export interface FlowCompanionModalProps {
  visible: boolean;
  onClose: () => void;
  streak: number;
  caloriiConsumate: number;
  caloriiTinta: number;
}

export function FlowCompanionModal({
  visible,
  onClose,
  streak,
  caloriiConsumate,
  caloriiTinta,
}: FlowCompanionModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const stage = getCompanionStage(streak);
  const beacon = getLimitBeaconStatus(caloriiConsumate, caloriiTinta);
  const daysUntilNext = getDaysUntilNextEvolution(streak);
  const evolutionPercent = getEvolutionProgressPercent(streak);

  const stageName = t(stage.nameKey, stage.defaultName);
  const beaconLabel = t(beacon.labelKey, beacon.defaultLabel);
  const beaconDesc = t(beacon.descKey, beacon.defaultDesc);

  const renderLargeStageIcon = (id: CompanionStageId) => {
    switch (id) {
      case 'egg':
        return <Egg size={44} color={colors.accent} strokeWidth={2.2} />;
      case 'fox':
        return <Flame size={44} color={colors.accent} strokeWidth={2.2} fill={colors.accent + '33'} />;
      case 'lynx':
        return <Zap size={44} color={colors.accent} strokeWidth={2.2} fill={colors.accent + '33'} />;
      case 'wolf':
        return <Crown size={44} color={colors.accent} strokeWidth={2.2} fill={colors.accent + '33'} />;
      case 'titan':
        return <Sparkles size={44} color={colors.accent} strokeWidth={2.2} fill={colors.accent + '33'} />;
      default:
        return <Egg size={44} color={colors.accent} strokeWidth={2.2} />;
    }
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType={reduceMotion ? 'none' : 'slide'}
      transparent
    >
      <View style={styles.backdrop}>
        <Pressable
          testID="flow-companion-backdrop"
          style={styles.backdropTouchable}
          onPress={onClose}
        />

        <View
          testID="flow-companion-modal-sheet"
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}
        >
          {/* Grab indicator */}
          <View style={styles.indicatorWrap}>
            <View style={[styles.indicator, { backgroundColor: colors.overlayStrong }]} />
          </View>

          {/* Close button */}
          <TouchableOpacity
            testID="flow-companion-modal-close"
            style={[styles.closeBtn, { borderColor: colors.cardBorder }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Închide')}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Hero Avatar Card */}
          <View style={styles.heroSection}>
            <LinearGradient
              colors={[colors.accent + '25', 'transparent']}
              style={styles.heroGlow}
            />
            <View
              style={[
                styles.largeAvatarCircle,
                {
                  backgroundColor: colors.accent + '15',
                  borderColor: colors.accent + '44',
                },
              ]}
            >
              {renderLargeStageIcon(stage.id)}
            </View>

            <Text style={[styles.heroName, { color: colors.textPrimary }]}>
              {stageName}
            </Text>

            <View style={[styles.stageBadge, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
              <Text style={[styles.stageBadgeText, { color: colors.accent }]}>
                {t('flowCompanion.stageLabel', { stage: stage.stage })}
              </Text>
            </View>
          </View>

          {/* Evolution Progression Bar */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <TrendingUp size={16} color={colors.accent} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {t('flowCompanion.evolutionTitle', 'Evoluție & Streak')}
                </Text>
              </View>
              <Text style={[styles.streakCount, { color: colors.accent }]}>
                {streak} {streak === 1 ? 'zi' : 'zile'}
              </Text>
            </View>

            {/* Progress Track */}
            <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${evolutionPercent}%`,
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>

            <Text style={[styles.evolutionSubtitle, { color: colors.textSecondary }]}>
              {daysUntilNext !== null
                ? t('flowCompanion.nextEvolutionIn', { days: daysUntilNext })
                : t('flowCompanion.maxEvolutionReached', 'Ai atins forma supremă de Legendă!')}
            </Text>
          </View>

          {/* Limit Beacon ("Becul de Limită") Card */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: beacon.color + '10',
                borderColor: beacon.color + '44',
              },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <Lightbulb size={18} color={beacon.color} strokeWidth={2.5} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {t('flowCompanion.beaconTitle', 'Becul de Limită Nutrițională')}
                </Text>
              </View>
              <View
                style={[
                  styles.beaconStatusPill,
                  { backgroundColor: beacon.color + '25', borderColor: beacon.color + '55' },
                ]}
              >
                <View style={[styles.liveDot, { backgroundColor: beacon.color }]} />
                <Text style={[styles.beaconStatusText, { color: beacon.color }]}>
                  {beaconLabel}
                </Text>
              </View>
            </View>

            <Text style={[styles.beaconDescText, { color: colors.textPrimary }]}>
              {beaconDesc}
            </Text>

            <View style={styles.calorieStatsRow}>
              <Text style={[styles.calorieStatsText, { color: colors.textSecondary }]}>
                {t('flowCompanion.caloriesProgress', {
                  consumed: caloriiConsumate.toLocaleString(),
                  target: caloriiTinta.toLocaleString(),
                })}
              </Text>
              <Text style={[styles.caloriePercentText, { color: beacon.color }]}>
                {beacon.percent}%
              </Text>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            testID="flow-companion-modal-action"
            style={[styles.actionBtn, { shadowColor: colors.accent }]}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch {}
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('flowCompanion.close', 'Am înțeles')}
          >
            <LinearGradient colors={colors.accentGradient} style={styles.actionBtnGrad}>
              <Text style={[styles.actionBtnText, { color: colors.background }]}>
                {t('flowCompanion.close', 'Am înțeles')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 34,
  },
  indicatorWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  indicator: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  largeAvatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  stageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  streakCount: {
    fontSize: 13,
    fontWeight: '900',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 6,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  evolutionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  beaconStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  beaconStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  beaconDescText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginBottom: 10,
  },
  calorieStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  calorieStatsText: {
    fontSize: 11,
    fontWeight: '600',
  },
  caloriePercentText: {
    fontSize: 13,
    fontWeight: '900',
  },
  actionBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 6,
  },
  actionBtnGrad: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '900',
  },
});
