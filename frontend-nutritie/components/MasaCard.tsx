import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Layout } from 'react-native-reanimated';
import { Clock, Pencil, Trash2, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Masa } from '../types';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { obtinePozaMasa, parseAlimente } from '../lib/mealUtils';

interface MasaCardProps {
  masa: Masa;
  onPress: (masa: Masa) => void;
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
  const router = useRouter();
  const { isPremium } = usePremium();
  const alimenteSubList = useMemo(() => parseAlimente(masa), [masa.alimente]);
  const pozaUrl = obtinePozaMasa(masa);

  // BUG-023: layout spring doar pe iOS. Pe Android spring-ul pe orice schimbare
  // de listă (add/delete/edit) e fragil și scump cu multe mese; sistemul deja
  // animă adăugările, iar aici spring-ul repornea pe toate cardurile vizibile.
  return (
    <Animated.View layout={Platform.OS === 'ios' ? Layout.springify() : undefined} style={styles.cardContainer}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          try {
            Haptics.selectionAsync();
          } catch {}
          onPress(masa);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Masa ${masa.nume}, ${masa.calorii || 0} kcal`}
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
                  accessibilityLabel="Editează masa"
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
                  accessibilityLabel="Șterge masa"
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
                  <View
                    key={al.id || `${masa.id}-al-${subIdx}`}
                    style={[
                      styles.subItemRow,
                      subIdx < alimenteSubList.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(255,255,255,0.04)',
                      },
                    ]}
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
                      <Text style={[styles.subItemCal, { color: colors.accent }]}>
                        {al.calorii} kcal
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.cardStats, { marginTop: alimenteSubList.length > 0 ? 4 : 0 }]}>
              <View style={styles.cardStatItem}>
                <LinearGradient
                  colors={[colors.accent + '25', 'rgba(0,0,0,0)']}
                  style={styles.cardStatBg}
                >
                  <Text style={[styles.cardStatValue, { color: colors.accent }]}>
                    {masa.calorii || 0}
                  </Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>kcal</Text>
                </LinearGradient>
              </View>
              <View style={styles.cardStatItem}>
                <LinearGradient
                  colors={[colors.accentSecondary + '25', 'rgba(0,0,0,0)']}
                  style={styles.cardStatBg}
                >
                  <Text style={[styles.cardStatValue, { color: colors.accentSecondary }]}>
                    {masa.proteine || 0}g
                  </Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>
                    proteine
                  </Text>
                </LinearGradient>
              </View>
              <View style={styles.cardStatItem}>
                <LinearGradient
                  colors={[colors.accentTertiary + '1A', 'rgba(0,0,0,0)']}
                  style={styles.cardStatBg}
                >
                  <Text style={[styles.cardStatValue, { color: colors.accentTertiary }]}>
                    {masa.carbohidrati != null ? masa.carbohidrati : '—'}
                    {masa.carbohidrati != null ? 'g' : ''}
                  </Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>carbs</Text>
                </LinearGradient>
              </View>
              <View style={styles.cardStatItem}>
                <LinearGradient
                  colors={[colors.warning + '1A', 'rgba(0,0,0,0)']}
                  style={styles.cardStatBg}
                >
                  <Text style={[styles.cardStatValue, { color: colors.warning }]}>
                    {masa.grasimi != null ? masa.grasimi : '—'}
                    {masa.grasimi != null ? 'g' : ''}
                  </Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>
                    grăsimi
                  </Text>
                </LinearGradient>
              </View>
              <View style={styles.cardStatItem}>
                <LinearGradient
                  colors={[colors.success + '1A', 'rgba(0,0,0,0)']}
                  style={styles.cardStatBg}
                >
                  <Text style={[styles.cardStatValue, { color: colors.success }]}>
                    {masa.fibre != null ? masa.fibre : '—'}
                    {masa.fibre != null ? 'g' : ''}
                  </Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>fibre</Text>
                </LinearGradient>
              </View>
            </View>

            {afisarePoze && pozaUrl ? (
              isPremium ? (
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
                  accessibilityLabel="Vezi poza mesei și detaliile"
                >
                  <Image
                    source={{ uri: pozaUrl }}
                    style={styles.imageBottom}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push('/paywall' as never);
                  }}
                  activeOpacity={0.95}
                  style={styles.imageBottomContainer}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Deblochează pozele meselor cu Premium"
                >
                  <Image
                    source={{ uri: pozaUrl }}
                    style={styles.imageBottom}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: 'rgba(9, 12, 14, 0.72)' },
                    ]}
                  />
                  <View style={styles.lockOverlay}>
                    <View style={styles.lockBadge}>
                      <Lock size={14} color={colors.textPrimary} />
                      <Text style={styles.lockBadgeText}>Pozele mesei sunt Premium</Text>
                    </View>
                    <Text style={styles.lockCta}>Deblochează cu Premium</Text>
                  </View>
                </TouchableOpacity>
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
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  lockBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  lockCta: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
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
    width: 32,
    height: 32,
    borderRadius: 10,
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
    gap: 8,
  },
  cardStatItem: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardStatBg: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  cardStatValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
