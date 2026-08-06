import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Pressable } from 'react-native';
import Animated, { Layout } from 'react-native-reanimated';
import { Clock, Pencil, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Masa, AlimentDetaliat } from '../types';
import { useTheme } from '../context/ThemeContext';

function parseAlimente(masa: Masa): AlimentDetaliat[] {
  if (Array.isArray(masa.alimente)) return masa.alimente;
  if (typeof masa.alimente === 'string') {
    try {
      const parsed = JSON.parse(masa.alimente);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

interface MasaCardProps {
  masa: Masa;
  onPress: (masa: Masa) => void;
  onEdit: (masa: Masa) => void;
  onDelete: (masa: Masa) => void;
}

export const MasaCard = React.memo(function MasaCard({
  masa,
  onPress,
  onEdit,
  onDelete,
}: MasaCardProps) {
  const { colors } = useTheme();
  const alimenteSubList = useMemo(() => parseAlimente(masa), [masa.alimente]);
  const [fotoVisible, setFotoVisible] = useState(false);

  return (
    <Animated.View layout={Layout.springify()} style={styles.cardContainer}>
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
            </View>

            {masa.imagine_url ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setFotoVisible(true);
                }}
                style={styles.imageBottomContainer}
                accessibilityRole="imagebutton"
                accessibilityLabel="Vezi poza mesei mărită"
              >
                <Image
                  source={{ uri: masa.imagine_url }}
                  style={styles.imageBottom}
                  resizeMode="cover"
                />
              </Pressable>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>

      {/* Viewer poza masa: apasă pe poza din jurnal ca să o vezi exact */}
      <Modal
        visible={fotoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoVisible(false)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setFotoVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Închide poza mesei"
        >
          <Image
            source={{ uri: masa.imagine_url }}
            style={styles.viewerImage}
            resizeMode="contain"
          />
          <Text style={styles.viewerHint}>Apasă oriunde pentru a închide</Text>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}, (prev, next) => {
  return (
    prev.masa.id === next.masa.id &&
    prev.masa.calorii === next.masa.calorii &&
    prev.masa.proteine === next.masa.proteine &&
    prev.masa.carbohidrati === next.masa.carbohidrati &&
    prev.masa.grasimi === next.masa.grasimi &&
    prev.masa.alimente === next.masa.alimente &&
    prev.masa.imagine_url === next.masa.imagine_url &&
    prev.masa.nume === next.masa.nume
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
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  viewerImage: {
    width: '100%',
    height: '78%',
    borderRadius: 12,
  },
  viewerHint: {
    marginTop: 18,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
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
