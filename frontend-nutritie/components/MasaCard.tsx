import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Layout } from 'react-native-reanimated';
import { Clock, Pencil, Trash2 } from 'lucide-react-native';
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
  const alimenteSubList = useMemo(() => parseAlimente(masa), [masa]);
  // REMED-018: thumbnail ImageKit (w-480) în locul rezoluției full pe card.
  const pozaUrl = obtinePozaMasaThumb(masa);

  // BUG-023: layout spring doar pe iOS când reduceMotion e fals.
  return (
    <Animated.View layout={Platform.OS === 'ios' && !reduceMotion ? Layout.springify() : undefined} style={styles.cardContainer}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          try {
            Haptics.selectionAsync();
          } catch {}
          onPress(masa);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('jurnal.mealA11y', { nume: masa.nume, kcal: masa.calorii || 0 })}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cardGrad}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardName, { color: colors.textPrimary }]}>{masa.nume}</Text>
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
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: colors.accentSecondary + '20',
                      borderColor: colors.accentSecondary + '40',
                    },
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEdit(masa);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('jurnal.editMeal')}
                >
                  <Pencil size={15} color={colors.accentSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: colors.danger + '20',
                      borderColor: colors.danger + '40',
                    },
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelete(masa);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('jurnal.deleteMeal')}
                >
                  <Trash2 size={15} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>

            {alimenteSubList && alimenteSubList.length > 0 && (
              <View
                style={[
                  styles.subItemsContainer,
                  { borderColor: colors.cardBorder, backgroundColor: 'rgba(0,0,0,0.18)' },
                ]}
              >
                {alimenteSubList.map((al, subIdx) => (
                  <TouchableOpacity
                    key={al.id || `${masa.id}-al-${subIdx}`}
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation();
                      try {
                        Haptics.selectionAsync();
                      } catch {}
                      onPress(masa, subIdx);
                    }}
                    style={[
                      styles.subItemRow,
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
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={[styles.cardStats, { marginTop: alimenteSubList.length > 0 ? 4 : 0 }]}>
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
            </View>

            {afisarePoze && pozaUrl ? (
              hasAccess ? (
                <TouchableOpacity
                  onPress={() => {
                    try {
                      Haptics.selectionAsync();
                    } catch {}
                    onPress(masa);
                  }}
                  activeOpacity={0.9}
                  style={styles.imageBottomContainer}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t('jurnal.viewMealPhoto')}
                >
                  <Image
                    source={{ uri: pozaUrl }}
                    style={styles.imageBottom}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              ) : (
                <PremiumPhotoPreview
                  variant="card"
                  onPressPaywall={() => router.push('/paywall' as never)}
                />
              )
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
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
