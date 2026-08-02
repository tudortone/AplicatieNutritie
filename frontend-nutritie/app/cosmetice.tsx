import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Lock, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import CosmeticAvatar from '../components/gamification/CosmeticAvatar';
import CosmeticGlyph from '../components/gamification/CosmeticGlyph';
import {
  COSMETIC_CATALOG, asCosmetic, equipCosmetic, getCatalogCosmetic, loadEquippedCosmetics,
  type CosmeticItem, type CosmeticType, type EquippedCosmetics, EMPTY_EQUIPPED,
} from '../lib/cosmetics';
import { loadRewardState } from '../lib/questsEngine';
import { useTheme } from '../context/ThemeContext';

const FILTERS: Array<{ id: 'all' | CosmeticType; label: string }> = [
  { id: 'all', label: 'Toate' }, { id: 'avatar', label: 'Avatare' },
  { id: 'frame', label: 'Rame' }, { id: 'effect', label: 'Efecte' },
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
      loadRewardState(), loadEquippedCosmetics(), AsyncStorage.getItem('avatar_url'), AsyncStorage.getItem('nume_profil'),
    ]);
    setOwned(new Set(reward.inventory.map(asCosmetic).filter((value): value is CosmeticItem => Boolean(value)).map((value) => value.catalogId)));
    setEquipped(current); setProfileImage(image); setInitials((name || 'NA').slice(0, 2).toUpperCase());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const preview = useMemo(() => {
    const next = { ...equipped };
    if (selected?.cosmeticType === 'avatar') next.avatarId = selected.catalogId;
    if (selected?.cosmeticType === 'frame') next.frameId = selected.catalogId;
    if (selected?.cosmeticType === 'effect') next.effectId = selected.catalogId;
    return next;
  }, [equipped, selected]);
  const items = useMemo(() => filter === 'all' ? COSMETIC_CATALOG : COSMETIC_CATALOG.filter((value) => value.cosmeticType === filter), [filter]);
  const isEquipped = (value: CosmeticItem) => equipped.avatarId === value.catalogId || equipped.frameId === value.catalogId || equipped.effectId === value.catalogId;
  const selectedOwned = Boolean(selected && owned.has(selected.catalogId));

  const handleEquip = async () => {
    if (!selected || !selectedOwned) return;
    setEquipped(await equipCosmetic(selected));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Înapoi" style={[styles.headerBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}><ArrowLeft size={20} color={colors.textPrimary} /></Pressable>
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.textPrimary }]}>Colecții custom</Text><Text style={[styles.subtitle, { color: colors.textSecondary }]}>{owned.size}/30 obiecte deblocate</Text></View>
        <Sparkles size={22} color={colors.accent} />
      </View>

      <FlatList
        data={items} numColumns={3} key={filter} keyExtractor={(value) => value.catalogId}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]} columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={<View>
          <View style={[styles.previewCard, { backgroundColor: colors.cardBg, borderColor: selected?.colors[0] || colors.cardBorder }]}>
            <CosmeticAvatar avatar={getCatalogCosmetic(preview.avatarId)} frame={getCatalogCosmetic(preview.frameId)} effect={getCatalogCosmetic(preview.effectId)} imageUri={profileImage} initials={initials} size={116} />
            <View style={styles.previewInfo}>
              <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>{selected?.name || 'Avatarul tău'}</Text>
              <Text style={[styles.collection, { color: selected?.colors[0] || colors.accent }]}>{selected?.collection?.toUpperCase() || 'ALEGE UN UNIVERS'}</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>{selected?.description || 'Combină fotografia ta cu personaje, rame și efecte.'}</Text>
              <Pressable onPress={handleEquip} disabled={!selectedOwned || Boolean(selected && isEquipped(selected))} style={({ pressed }) => [styles.equipBtn, { backgroundColor: selectedOwned ? colors.accent : colors.surfaceElevated, opacity: pressed ? .7 : 1 }]}>
                <Text style={[styles.equipText, { color: selectedOwned ? colors.background : colors.textTertiary }]}>{!selected ? 'Selectează un obiect' : !selectedOwned ? 'Blocat — obține din cufăr' : isEquipped(selected) ? 'Echipat ✓' : 'Echipează'}</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.filters}>{FILTERS.map((entry) => {
            const active = filter === entry.id;
            return <Pressable key={entry.id} onPress={() => setFilter(entry.id)} style={[styles.filter, { backgroundColor: active ? colors.accent : colors.surfaceBg, borderColor: active ? colors.accent : colors.border }]}><Text style={[styles.filterText, { color: active ? colors.background : colors.textSecondary }]}>{entry.label}</Text></Pressable>;
          })}</View>
        </View>}
        renderItem={({ item }) => {
          const unlocked = owned.has(item.catalogId); const active = selected?.catalogId === item.catalogId; const equippedNow = isEquipped(item);
          return <Pressable onPress={() => setSelected(item)} accessibilityLabel={`${item.name}, colecția ${item.collection}, ${unlocked ? 'deblocat' : 'blocat'}`} style={[styles.item, { backgroundColor: active ? `${item.colors[0]}20` : colors.surfaceBg, borderColor: active || equippedNow ? item.colors[0] : colors.border, opacity: unlocked ? 1 : .5 }]}>
            <View><CosmeticGlyph item={item} size={58} muted={!unlocked} />{!unlocked ? <View style={styles.lock}><Lock size={15} color="#FFF" /></View> : null}{equippedNow ? <View style={[styles.check, { backgroundColor: colors.success }]}><Check size={11} color="#FFF" strokeWidth={3} /></View> : null}</View>
            <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={2}>{item.name}</Text><Text style={[styles.itemCollection, { color: item.colors[0] }]}>{item.collection}</Text>
          </Pressable>;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  headerBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 19, fontWeight: '900' }, subtitle: { fontSize: 12, marginTop: 2 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16 }, previewCard: { borderRadius: 22, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  previewInfo: { flex: 1, marginLeft: 5 }, previewTitle: { fontSize: 17, fontWeight: '900' }, collection: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 4 }, description: { fontSize: 12, lineHeight: 16, marginTop: 5 },
  equipBtn: { minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, marginTop: 10 }, equipText: { fontSize: 11, fontWeight: '900', textAlign: 'center' },
  filters: { flexDirection: 'row', gap: 7, marginBottom: 16 }, filter: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, filterText: { fontSize: 11, fontWeight: '800' },
  gridRow: { gap: 9 }, item: { flex: 1, minWidth: 0, minHeight: 137, borderRadius: 16, borderWidth: 1, alignItems: 'center', padding: 9, marginBottom: 9 },
  itemName: { fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center', marginTop: 7 }, itemCollection: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginTop: 3 },
  lock: { ...StyleSheet.absoluteFillObject, borderRadius: 17, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' }, check: { position: 'absolute', right: -5, top: -5, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
