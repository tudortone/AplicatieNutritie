import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Wand2, Trash2, PackageOpen, Snowflake, Clock } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useCamara, ProdusCamara } from '@/hooks/useCamara';

export default function CamaraScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { produse, loading, refresh: refreshCamara, stergeProdus } = useCamara();
  const refresh = refreshCamara;

  // Selecție Multiplă (State) conform cerințelor
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const toggleSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }, []);

  const handleGateateCuAI = useCallback(() => {
    if (selectedItems.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const ingredienteSelectate = produse
      .filter(p => selectedItems.includes(p.id))
      .map(p => `${p.nume}${p.cantitate && p.cantitate > 1 ? ` (${p.cantitate}x)` : ''}`)
      .join(', ');

    const promptReteta = `Salut! Am în cămară următoarele ingrediente: ${ingredienteSelectate}. Ce rețetă delicioasă, sănătoasă și bogată în proteine pot pregăti folosind aceste alimente? Te rog să îmi dai pași clari de preparare și estimarea valorilor nutriționale per porție.`;

    router.push({
      pathname: '/(tabs)/chat' as any,
      params: { prompt: promptReteta },
    });
  }, [selectedItems, produse, router]);

  const handleConsumatSauSterge = useCallback(async () => {
    if (selectedItems.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    Alert.alert(
      "Confirmare Ștergere / Consum",
      `Ești sigur că vrei să elimini ${selectedItems.length} aliment(e) din cămară?`,
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Șterge",
          style: "destructive",
          onPress: async () => {
            try {
              for (const id of selectedItems) {
                if (stergeProdus) {
                  await stergeProdus(id);
                }
              }
              setSelectedItems([]);
              if (refresh) refresh();
            } catch (err) {
              console.error("Eroare la ștergerea elementelor din cămară:", err);
            }
          }
        }
      ]
    );
  }, [selectedItems, stergeProdus, refresh]);

  const renderItem = useCallback(({ item, index }: { item: ProdusCamara; index: number }) => {
    const isSelected = selectedItems.includes(item.id);

    return (
      <Animated.View entering={FadeInDown.delay(index * 25).duration(250)}>
        <Pressable
          onPress={() => toggleSelect(item.id)}
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBg,
              borderColor: isSelected ? colors.accent : colors.cardBorder,
            },
          ]}
        >
          {/* Buton circular de selecție pe stânga (cerc gol care primeste bifa si culoare neon) */}
          <View
            style={[
              styles.selectCircle,
              {
                borderColor: isSelected ? colors.accent : colors.textSecondary,
                backgroundColor: isSelected ? colors.accent : 'transparent',
              },
            ]}
          >
            {isSelected && <Check size={14} color={colors.background} strokeWidth={3} />}
          </View>

          <View style={styles.cardContent}>
            <View style={styles.headerRow}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.nume}
              </Text>
              {!!item.cantitate && item.cantitate > 1 && (
                <View style={[styles.badgeQty, { backgroundColor: colors.accent + '22' }]}>
                  <Text style={[styles.badgeQtyText, { color: colors.accent }]}>
                    {item.cantitate}x
                  </Text>
                </View>
              )}
            </View>

            {!!item.brand && (
              <Text style={[styles.brand, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.brand}
              </Text>
            )}

            <Text style={[styles.meta, { color: colors.accent }]}>
              {item.calorii_100g} kcal/100g • P: {item.proteine_100g || 0}g
            </Text>

            <View style={styles.tagsRow}>
              {item.is_congelat ? (
                <View style={[styles.statusTag, { backgroundColor: '#00F0FF22' }]}>
                  <Snowflake size={11} color="#00F0FF" />
                  <Text style={[styles.statusTagText, { color: '#00F0FF' }]}>Congelat</Text>
                </View>
              ) : (
                <View style={[styles.statusTag, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                  <Clock size={11} color={colors.textSecondary} />
                  <Text style={[styles.statusTagText, { color: colors.textSecondary }]}>
                    Expiră în ~{item.zile_valabilitate || 14} zile
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }, [colors, selectedItems, toggleSelect]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={produse || []}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onRefresh={refresh}
        refreshing={loading || false}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ padding: 16, paddingBottom: selectedItems.length > 0 ? 130 : 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <PackageOpen size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Cămara ta este goală
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Adaugă alimente sau scanează coduri de bare pentru a le folosi în generatorul de rețete AI.
            </Text>
          </View>
        }
      />

      {/* Meniu Contextual Flotant (Bottom Action Bar) animat cu Reanimated */}
      {selectedItems.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(250)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.actionBar, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
        >
          {/* Container Flexbox curat (gap, alignItems: 'center') */}
          <View style={styles.actionRow}>
            {/* Buton Gătește cu AI (🪄) */}
            <TouchableOpacity
              style={[styles.btnAI, { backgroundColor: colors.accent }]}
              onPress={handleGateateCuAI}
              activeOpacity={0.85}
            >
              <Wand2 size={18} color="#000" strokeWidth={2.5} />
              <Text style={styles.btnAIText}>Gătește cu AI ({selectedItems.length})</Text>
            </TouchableOpacity>

            {/* Buton Consumat / Șterge (🗑️) */}
            <TouchableOpacity
              style={[styles.btnDelete, { backgroundColor: 'rgba(255, 68, 68, 0.15)', borderColor: '#FF4444' }]}
              onPress={handleConsumatSauSterge}
              activeOpacity={0.85}
            >
              <Trash2 size={18} color="#FF4444" strokeWidth={2} />
              <Text style={[styles.btnDeleteText, { color: '#FF4444' }]}>Consumat</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { fontSize: 16, fontWeight: '700', flex: 1 },
  badgeQty: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeQtyText: { fontSize: 11, fontWeight: '800' },
  brand: { fontSize: 12, marginTop: 1 },
  meta: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTagText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 90, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  actionBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btnAI: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  btnAIText: { fontSize: 15, fontWeight: '800', color: '#000' },
  btnDelete: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  btnDeleteText: { fontSize: 15, fontWeight: '700' },
});
