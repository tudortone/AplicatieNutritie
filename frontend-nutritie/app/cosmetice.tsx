import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Lock, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import CosmeticAvatar from '../components/gamification/CosmeticAvatar';
import {
  COSMETIC_CATALOG,
  asCosmetic,
  cosmeticRarityColor,
  equipCosmetic,
  getCatalogCosmetic,
  loadEquippedCosmetics,
  type CosmeticItem,
  type CosmeticType,
  type EquippedCosmetics,
  EMPTY_EQUIPPED,
} from '../lib/cosmetics';
import { loadRewardState } from '../lib/questsEngine';
import { useTheme } from '../context/ThemeContext';

const FILTERS: Array<{ id: 'all' | CosmeticType; label: string }> = [
  { id: 'all', label: 'Toate' },
  { id: 'avatar', label: 'Avatare' },
  { id: 'frame', label: 'Rame' },
  { id: 'effect', label: 'Efecte' },
];

export default function CosmeticeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<'all' | CosmeticType>('all');
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<EquippedCosmetics>(EMPTY_EQUIPPED);
  const [selected, setSelected] = useState<CosmeticItem | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [initials, setInitials] = useState('NA');

  const load = useCallback(async () => {
    const [reward, current, image, name] = await Promise.all([
      loadRewardState(),
      loadEquippedCosmetics(),
      AsyncStorage.getItem('avatar_url'),
      AsyncStorage.getItem('nume_profil'),
    ]);
    setOwned(new Set(reward.inventory.map(asCosmetic).filter((item): item is CosmeticItem => Boolean(item)).map((item) => item.catalogId)));
    setEquipped(current);
    setProfileImage(image);
    setInitials((name || 'NA').slice(0, 2).toUpperCase());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const previewEquipped = useMemo(() => {
    const next = { ...equipped };
    if (selected) {
      if (selected.cosmeticType === 'avatar') next.avatarId = selected.catalogId;
      if (selected.cosmeticType === 'frame') next.frameId = selected.catalogId;
      if (selected.cosmeticType === 'effect') next.effectId = selected.catalogId;
    }
    return next;
  }, [equipped, selected]);

  const items = useMemo(
    () => filter === 'all' ? COSMETIC_CATALOG : COSMETIC_CATALOG.filter((item) => item.cosmeticType === filter),
    [filter],
  );

  const isEquipped = (item: CosmeticItem) =>
    equipped.avatarId === item.catalogId || equipped.frameId === item.catalogId || equipped.effectId === item.catalogId;

  const handleEquip = async () => {
    if (!selected || !owned.has(selected.catalogId)) return;
    const next = await equipCosmetic(selected);
    setEquipped(next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const selectedOwned = Boolean(selected && owned.has(selected.catalogId));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Înapoi" style={[styles.headerBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Garderobă cosmetică</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{owned.size}/30 deblocate din cufere</Text>
        </View>
        <Sparkles size={22} color={colors.accent} />
      </View>

      <FlatList
        data={items}
        numColumns={3}
        key={filter}
        keyExtractor={(item) => item.catalogId}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={
          <View>
            <View style={[styles.previewCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <CosmeticAvatar
                avatar={getCatalogCosmetic(previewEquipped.avatarId)}
                frame={getCatalogCosmetic(previewEquipped.frameId)}
                effect={getCatalogCosmetic(previewEquipped.effectId)}
                imageUri={profileImage}
                initials={initials}
                size={118}
              />
              <View style={styles.previewInfo}>
                <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>{selected?.name || 'Avatarul tău'}</Text>
                <Text style={[styles.previewDescription, { color: colors.textSecondary }]}>
                  {selected?.description || 'Alege un cosmetic pentru previzualizare.'}
                </Text>
                {selected ? (
                  <Text style={[styles.rarityText, { color: cosmeticRarityColor(selected.rarity) }]}>{selected.rarity.toUpperCase()} · {selected.theme}</Text>
                ) : null}
                <Pressable
                  onPress={handleEquip}
                  disabled={!selectedOwned || (selected ? isEquipped(selected) : false)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !selectedOwned }}
                  style={({ pressed }) => [
                    styles.equipBtn,
                    {
                      backgroundColor: selectedOwned ? colors.accent : colors.surfaceElevated,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.equipText, { color: selectedOwned ? colors.background : colors.textTertiary }]}>
                    {!selected ? 'Selectează un obiect' : !selectedOwned ? 'Blocat — obține din cufăr' : isEquipped(selected) ? 'Echipat ✓' : 'Echipează'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.filters}>
              {FILTERS.map((entry) => {
                const active = filter === entry.id;
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => setFilter(entry.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.filter, { backgroundColor: active ? colors.accent : colors.surfaceBg, borderColor: active ? colors.accent : colors.border }]}
                  >
                    <Text style={[styles.filterText, { color: active ? colors.background : colors.textSecondary }]}>{entry.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const unlocked = owned.has(item.catalogId);
          const active = selected?.catalogId === item.catalogId;
          const equippedNow = isEquipped(item);
          const rarity = cosmeticRarityColor(item.rarity);
          return (
            <Pressable
              onPress={() => setSelected(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.rarity}, ${unlocked ? 'deblocat' : 'blocat'}`}
              style={[
                styles.item,
                {
                  backgroundColor: active ? `${rarity}20` : colors.surfaceBg,
                  borderColor: active || equippedNow ? rarity : colors.border,
                  opacity: unlocked ? 1 : 0.5,
                },
              ]}
            >
              <View style={[styles.iconCircle, { borderColor: rarity, backgroundColor: `${rarity}14` }]}>
                <Text style={styles.itemIcon}>{item.icon}</Text>
                {!unlocked ? <View style={styles.lockOverlay}><Lock size={15} color="#FFF" /></View> : null}
                {equippedNow ? <View style={[styles.checkBadge, { backgroundColor: colors.success }]}><Check size={11} color="#FFF" strokeWidth={3} /></View> : null}
              </View>
              <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={2}>{item.name}</Text>
              <Text style={[styles.itemRarity, { color: rarity }]}>{item.rarity}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  headerBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 }, title: { fontSize: 19, fontWeight: '900' }, subtitle: { fontSize: 12, marginTop: 2 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16 },
  previewCard: { borderRadius: 22, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  previewInfo: { flex: 1, marginLeft: 8 }, previewTitle: { fontSize: 18, fontWeight: '900' },
  previewDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 }, rarityText: { fontSize: 11, fontWeight: '900', marginTop: 7 },
  equipBtn: { minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, marginTop: 12 },
  equipText: { fontSize: 11, fontWeight: '900', textAlign: 'center' },
  filters: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  filter: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 11, fontWeight: '800' },
  gridRow: { gap: 9 },
  item: { flex: 1, minWidth: 0, minHeight: 132, borderRadius: 16, borderWidth: 1, alignItems: 'center', padding: 9, marginBottom: 9 },
  iconCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemIcon: { fontSize: 28 }, itemName: { fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center', marginTop: 7 },
  itemRarity: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginTop: 3 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 29, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'center' },
  checkBadge: { position: 'absolute', right: -3, top: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
