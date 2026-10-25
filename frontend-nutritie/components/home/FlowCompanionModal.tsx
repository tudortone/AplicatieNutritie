import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  Edit3,
  Check,
  Lock,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SproutArtwork } from './PixelCompanion';
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
  userId?: string | null;
}

export function FlowCompanionModal({
  visible,
  onClose,
  streak,
  caloriiConsumate,
  caloriiTinta,
  userId,
}: FlowCompanionModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const [storedCompanionName, setStoredCompanionName] = useState<string | null>(null);
  const [storedCompanionNameKey, setStoredCompanionNameKey] = useState<string | null>(null);
  const [namingKey, setNamingKey] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const savingNameRef = useRef(false);

  const companionKey = userId ? `@getflow:companion_name_${userId}` : '@getflow:companion_name_guest';
  const activeKeyRef = useRef(companionKey);
  activeKeyRef.current = companionKey;
  const companionName = storedCompanionNameKey === companionKey ? storedCompanionName : null;
  const isNamingActive = namingKey === companionKey;

  useEffect(() => {
    if (!visible) {
      setNamingKey(null);
      setDraftName('');
      return undefined;
    }
    let isCurrent = true;
    AsyncStorage.getItem(companionKey).then((saved) => {
      if (!isCurrent) return;
      setStoredCompanionName(saved?.trim() || null);
      setStoredCompanionNameKey(companionKey);
    }).catch(() => {
      if (!isCurrent) return;
      setStoredCompanionName(null);
      setStoredCompanionNameKey(companionKey);
    });
    return () => {
      isCurrent = false;
    };
  }, [visible, companionKey]);

  const handleConfirmName = () => {
    const sanitized = draftName.trim().slice(0, 20);
    if (!sanitized) {
      Alert.alert(t('flowCompanion.invalidNameTitle'), t('flowCompanion.invalidName'));
      return;
    }
    Alert.alert(
      t('flowCompanion.confirmNameTitle', 'Confirmare Nume Companion'),
      t('flowCompanion.confirmNamePrompt', `Ești sigur că vrei să alegi numele «${sanitized}»? Numele va fi asociat companionului tău.`, { name: sanitized }),
      [
        { text: t('common.cancel', 'Anulează'), style: 'cancel' },
        {
          text: t('common.confirm', 'Confirmă'),
          onPress: async () => {
            if (savingNameRef.current) return;
            savingNameRef.current = true;
            try {
              await AsyncStorage.setItem(companionKey, sanitized);
              if (activeKeyRef.current === companionKey) {
                setStoredCompanionName(sanitized);
                setStoredCompanionNameKey(companionKey);
                setNamingKey(null);
                setDraftName('');
                try { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {}
              }
            } catch {
              if (activeKeyRef.current === companionKey) {
                Alert.alert(t('flowCompanion.nameSaveFailedTitle'), t('flowCompanion.nameSaveFailed'));
              }
            } finally {
              savingNameRef.current = false;
            }
          },
        },
      ]
    );
  };

  const stage = getCompanionStage(streak);
  const beacon = getLimitBeaconStatus(caloriiConsumate, caloriiTinta);
  const daysUntilNext = getDaysUntilNextEvolution(streak);
  const evolutionPercent = getEvolutionProgressPercent(streak);

  const stageName = t(stage.nameKey, stage.defaultName);
  const beaconLabel = t(beacon.labelKey, beacon.defaultLabel);
  const beaconDesc = t(beacon.descKey, beacon.defaultDesc);

  const renderStageBadgeIcon = (id: CompanionStageId) => {
    switch (id) {
      case 'egg':
        return <Egg size={12} color={colors.accent} strokeWidth={2.4} />;
      case 'fox':
        return <Flame size={12} color={colors.accent} strokeWidth={2.4} />;
      case 'lynx':
        return <Zap size={12} color={colors.accent} strokeWidth={2.4} />;
      case 'wolf':
        return <Crown size={12} color={colors.accent} strokeWidth={2.4} />;
      case 'titan':
        return <Sparkles size={12} color={colors.accent} strokeWidth={2.4} />;
      default:
        return <Egg size={12} color={colors.accent} strokeWidth={2.4} />;
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                    borderColor: colors.accent + '55',
                    shadowColor: colors.accent,
                  },
                ]}
              >
                <SproutArtwork size={156} />
              </View>

              <View style={styles.heroNameRow}>
                <Text style={[styles.heroName, { color: colors.textPrimary }]}>
                  {companionName || t('flowCompanion.defaultName', 'Sprout')}
                </Text>
                {companionName && !isNamingActive ? (
                  <TouchableOpacity
                    testID="flow-companion-edit-name-btn"
                    style={[styles.nameEditBtn, { borderColor: colors.accent + '44', backgroundColor: colors.accent + '15' }]}
                    onPress={() => {
                      setDraftName(companionName);
                      setNamingKey(companionKey);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('flowCompanion.editName', 'Modifică numele')}
                  >
                    <Edit3 size={12} color={colors.accent} />
                  </TouchableOpacity>
                ) : !companionName && !isNamingActive ? (
                  <TouchableOpacity
                    testID="flow-companion-name-btn"
                    style={[styles.nameEditBtn, { borderColor: colors.accent + '44', backgroundColor: colors.accent + '15' }]}
                    onPress={() => {
                      setDraftName('');
                      setNamingKey(companionKey);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('flowCompanion.giveName', 'Dă-i un nume')}
                  >
                    <Edit3 size={12} color={colors.accent} />
                    <Text style={[styles.nameEditBtnText, { color: colors.accent }]}>
                      {t('flowCompanion.giveName', 'Dă-i un nume')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {isNamingActive ? (
                <View style={[styles.namingBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent + '55' }]}>
                  <TextInput
                    testID="flow-companion-name-input"
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder={t('flowCompanion.namePlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.namingInput, { color: colors.textPrimary }]}
                    maxLength={20}
                    autoFocus
                  />
                  <TouchableOpacity
                    testID="flow-companion-name-cancel"
                    style={[styles.namingCancelBtn, { borderColor: colors.cardBorder }]}
                    onPress={() => {
                      setNamingKey(null);
                      setDraftName('');
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel', 'Anulează')}
                  >
                    <X size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="flow-companion-name-confirm"
                    style={[styles.namingConfirmBtn, { backgroundColor: colors.accent }]}
                    onPress={handleConfirmName}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.confirm', 'Confirmă')}
                  >
                    <Check size={14} color={colors.background} strokeWidth={3} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={[styles.stageBadge, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '44' }]}>
                {renderStageBadgeIcon(stage.id)}
                <Text style={[styles.stageBadgeText, { color: colors.accent }]}>{stageName}</Text>
                <Text style={[styles.stageBadgeText, { color: colors.accent }]}>
                  {t('flowCompanion.stageLabel', { stage: stage.stage })}
                </Text>
              </View>
            </View>

            {/* Sprout Introduction & Lore Card */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Sparkles size={16} color={colors.accent} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    {t('flowCompanion.aboutTitle', 'Despre Sprout')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.loreText, { color: colors.textSecondary }]}>
                {t('flowCompanion.aboutDesc', 'Sprout este companionul tău inteligent de nutriție. Crește și evoluează alături de tine cu fiecare zi de streak înregistrată în jurnal.')}
              </Text>
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

            {/* Modular Cosmetics Preview Card (Future Economy) */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Crown size={15} color={colors.accentSecondary} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    {t('flowCompanion.accessoriesTitle', 'Personalizare & Accesorii')}
                  </Text>
                </View>
                <View style={[styles.comingSoonBadge, { backgroundColor: colors.accentSecondary + '18', borderColor: colors.accentSecondary + '44' }]}>
                  <Text style={[styles.comingSoonText, { color: colors.accentSecondary }]}>
                    {t('flowCompanion.comingSoon', 'În curând')}
                  </Text>
                </View>
              </View>
              <View style={styles.cosmeticSlotsRow}>
                <View style={[styles.cosmeticSlot, { borderColor: colors.cardBorder }]}>
                  <Lock size={13} color={colors.textSecondary} />
                  <Text style={[styles.cosmeticSlotName, { color: colors.textSecondary }]}>Aură Neon</Text>
                </View>
                <View style={[styles.cosmeticSlot, { borderColor: colors.cardBorder }]}>
                  <Lock size={13} color={colors.textSecondary} />
                  <Text style={[styles.cosmeticSlotName, { color: colors.textSecondary }]}>Coroniță</Text>
                </View>
                <View style={[styles.cosmeticSlot, { borderColor: colors.cardBorder }]}>
                  <Lock size={13} color={colors.textSecondary} />
                  <Text style={[styles.cosmeticSlotName, { color: colors.textSecondary }]}>Căști Sport</Text>
                </View>
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
          </ScrollView>
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
    paddingBottom: 24,
    maxHeight: '90%',
  },
  scrollContent: {
    paddingBottom: 20,
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    width: 104,
    height: 104,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#050706',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  nameEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  nameEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  namingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    width: 264,
  },
  namingInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 4,
  },
  namingCancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  namingConfirmBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  loreText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
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
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  evolutionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  beaconStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 10,
  },
  calorieStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calorieStatsText: {
    fontSize: 12,
    fontWeight: '600',
  },
  caloriePercentText: {
    fontSize: 13,
    fontWeight: '900',
  },
  comingSoonBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cosmeticSlotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cosmeticSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cosmeticSlotName: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtn: {
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnGrad: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
