import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Layout } from 'react-native-reanimated';
import { ChevronDown, ChevronUp, Clock, Pencil, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Masa } from '../types';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { obtinePozaMasaThumb, parseAlimente } from '../lib/mealUtils';
import { PremiumPhotoPreview } from './jurnal/PremiumPhotoPreview';

interface MasaCardProps {
  masa: Masa;
  onPress: (masa: Masa, alimentIdx?: number) => void;
  onEdit: (masa: Masa) => void;
  onDelete: (masa: Masa) => void;
  /** Când false, blocul foto e ascuns (comutatorul „afișare poze” din jurnal). */
  afisarePoze?: boolean;
}

export const MasaCard = React.memo(function MasaCard({
  masa,
  onPress,
  onEdit,
  onDelete,
  afisarePoze = true,
}: MasaCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { isPremium, hasFullAccess } = usePremium();
  const hasAccess = hasFullAccess || isPremium;
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const alimenteSubList = useMemo(() => parseAlimente(masa), [masa]);
  // REMED-018: thumbnail ImageKit (w-480) în locul rezoluției full pe card.
  const pozaUrl = obtinePozaMasaThumb(masa);
  const mealCategory = masa.tip_masa
    ? t(`chat.mealCategory.${masa.tip_masa}`, { defaultValue: t('jurnal.mealRecorded') })
    : t('jurnal.mealRecorded');
  const hasExpandableDetails = alimenteSubList.length > 0 || (afisarePoze && Boolean(pozaUrl));

  // HOTFIX: The card container is a View rather than an outer TouchableOpacity to prevent
  // nested responder conflicts where parent and child buttons fight for touch control on Android.
  return (
    <Animated.View layout={Platform.OS === 'ios' && !reduceMotion ? Layout.springify() : undefined} style={styles.cardContainer}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
        ]}
      >
        <View style={styles.cardGrad}>
          <View style={styles.cardHeader}>
            <Pressable
              testID={`meal-title-pressable-${masa.id}`}
              style={({ pressed }) => [styles.cardTitleRow, pressed && { opacity: 0.75 }]}
              onPress={() => {
                try {
                  Haptics.selectionAsync();
                } catch {}
                onPress(masa);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('jurnal.mealA11y', { nume: mealCategory, kcal: masa.calorii || 0 })}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                {mealCategory}
              </Text>
              <View style={styles.timeBadgeContainer}>
                <View style={styles.timeBadge}>
                  <Clock size={12} color={colors.textSecondary} />
                  <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                    {new Date(masa.created_at || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            </Pressable>

            {/* Sibling action buttons with explicit hitSlop and haptics */}
            <View style={styles.actionButtons}>
              <Pressable
                testID={`meal-edit-${masa.id}`}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: colors.accentSecondary + (pressed ? '45' : '20'),
                    borderColor: colors.accentSecondary + '40',
                  },
                ]}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  onEdit(masa);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('jurnal.editMeal')}
              >
                <Pencil size={15} color={colors.accentSecondary} />
              </Pressable>
              <Pressable
                testID={`meal-delete-${masa.id}`}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: colors.danger + (pressed ? '45' : '20'),
                    borderColor: colors.danger + '40',
                  },
                ]}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  } catch {}
                  onDelete(masa);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('jurnal.deleteMeal')}
              >
                <Trash2 size={15} color={colors.danger} />
              </Pressable>
            </View>
          </View>

          {hasExpandableDetails && (
            <Pressable
              testID={`meal-details-toggle-${masa.id}`}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch {}
                setDetailsExpanded((expanded) => !expanded);
              }}
              style={({ pressed }) => [
                styles.detailsToggle,
                {
                  borderColor: colors.cardBorder,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsExpanded }}
              accessibilityLabel={t(detailsExpanded ? 'jurnal.hideIngredients' : 'jurnal.showIngredients')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.detailsToggleText, { color: colors.accent }]}>
                {detailsExpanded ? t('jurnal.hideIngredients') : t('jurnal.showIngredients')}
                {alimenteSubList.length > 0 ? ` · ${t('jurnal.ingredientCount', { count: alimenteSubList.length })}` : ''}
              </Text>
              {detailsExpanded ? <ChevronUp size={17} color={colors.accent} /> : <ChevronDown size={17} color={colors.accent} />}
            </Pressable>
          )}

          {detailsExpanded && alimenteSubList.length > 0 && (
            <View
              style={[
                styles.subItemsContainer,
                { borderColor: colors.cardBorder, backgroundColor: 'rgba(0,0,0,0.18)' },
              ]}
            >
              <Text style={[styles.ingredientsHeading, { color: colors.textSecondary }]}>
                {t('jurnal.ingredientDetails')}
              </Text>
              {alimenteSubList.map((al, subIdx) => (
                <Pressable
                  key={al.id || `${masa.id}-al-${subIdx}`}
                  onPress={() => {
                    try {
                      Haptics.selectionAsync();
                    } catch {}
                    onPress(masa, subIdx);
                  }}
                  style={({ pressed }) => [
                    styles.subItemRow,
                    pressed && { opacity: 0.65 },
                    subIdx < alimenteSubList.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(255,255,255,0.04)',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('jurnal.editIngredientA11y', {
                    nume: al.nume,
                    grame: al.grame || 100,
                    kcal: al.calorii,
                  })}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.subItemDot, { backgroundColor: colors.accent }]} />
                    <Text
                      style={[styles.subItemName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {al.nume}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {al.grame ? (
                      <Text style={[styles.subItemGram, { color: colors.textSecondary }]}>
                        {al.grame}g
                      </Text>
                    ) : null}
                    <Text
                      style={[styles.subItemCal, { color: colors.accent }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {al.calorii} kcal
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            testID={`meal-stats-pressable-${masa.id}`}
            style={({ pressed }) => [
              styles.cardStats,
              { marginTop: alimenteSubList.length > 0 ? 4 : 0 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              try {
                Haptics.selectionAsync();
              } catch {}
              onPress(masa);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('jurnal.mealA11y', { nume: mealCategory, kcal: masa.calorii || 0 })}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <View style={styles.cardStatItem}>
              <LinearGradient
                colors={[colors.accent + '25', 'rgba(0,0,0,0)']}
                style={styles.cardStatBg}
              >
                <Text
                  style={[styles.cardStatValue, { color: colors.accent }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {masa.calorii || 0}
                </Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]} numberOfLines={1}>kcal</Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient
                colors={[colors.accentSecondary + '25', 'rgba(0,0,0,0)']}
                style={styles.cardStatBg}
              >
                <Text
                  style={[styles.cardStatValue, { color: colors.accentSecondary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {masa.proteine || 0}g
                </Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('jurnal.macroProtein')}
                </Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient
                colors={[colors.accentTertiary + '1A', 'rgba(0,0,0,0)']}
                style={styles.cardStatBg}
              >
                <Text
                  style={[styles.cardStatValue, { color: colors.accentTertiary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {masa.carbohidrati != null ? masa.carbohidrati : '—'}
                  {masa.carbohidrati != null ? 'g' : ''}
                </Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('jurnal.macroCarbs')}
                </Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient
                colors={[colors.warning + '1A', 'rgba(0,0,0,0)']}
                style={styles.cardStatBg}
              >
                <Text
                  style={[styles.cardStatValue, { color: colors.warning }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {masa.grasimi != null ? masa.grasimi : '—'}
                  {masa.grasimi != null ? 'g' : ''}
                </Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('jurnal.macroFats')}
                </Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient
                colors={[colors.success + '1A', 'rgba(0,0,0,0)']}
                style={styles.cardStatBg}
              >
                <Text
                  style={[styles.cardStatValue, { color: colors.success }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {masa.fibre != null ? masa.fibre : '—'}
                  {masa.fibre != null ? 'g' : ''}
                </Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('jurnal.macroFiber')}
                </Text>
              </LinearGradient>
            </View>
          </Pressable>

          {detailsExpanded && afisarePoze && pozaUrl ? (
            hasAccess ? (
              <Pressable
                onPress={() => {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                  onPress(masa);
                }}
                style={({ pressed }) => [styles.imageBottomContainer, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel={t('jurnal.viewMealPhoto')}
              >
                <Image
                  source={{ uri: pozaUrl }}
                  style={styles.imageBottom}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </Pressable>
            ) : (
              <PremiumPhotoPreview
                variant="card"
                onPressPaywall={() => router.push('/paywall' as never)}
              />
            )
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  return (
    prev.masa.id === next.masa.id &&
    prev.masa.calorii === next.masa.calorii &&
    prev.masa.proteine === next.masa.proteine &&
    prev.masa.carbohidrati === next.masa.carbohidrati &&
    prev.masa.grasimi === next.masa.grasimi &&
    prev.masa.fibre === next.masa.fibre &&
    prev.masa.alimente === next.masa.alimente &&
    prev.masa.imagine_url === next.masa.imagine_url &&
    prev.masa.nume === next.masa.nume &&
    prev.afisarePoze === next.afisarePoze
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 14,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageBottomContainer: {
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  imageBottom: {
    width: '100%',
    height: 160,
  },
  cardGrad: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 10,
    flexWrap: 'wrap',
  },
  cardName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  detailsToggle: {
    minHeight: 42,
    marginTop: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsToggleText: { fontSize: 12, fontWeight: '700' },
  timeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subItemsContainer: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  ingredientsHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingTop: 8, paddingBottom: 2 },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  subItemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subItemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  subItemGram: {
    fontSize: 12,
    fontWeight: '500',
  },
  subItemCal: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardStats: {
    flexDirection: 'row',
    gap: 4,
  },
  cardStatItem: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardStatBg: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  cardStatValue: {
    fontSize: 14,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  cardStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
