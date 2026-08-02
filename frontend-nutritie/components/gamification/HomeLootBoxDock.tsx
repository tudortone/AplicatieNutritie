import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gift, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import LootBoxModal from './LootBoxModal';
import { loadRewardState, saveRewardState } from '../../lib/questsEngine';
import { useTheme } from '../../context/ThemeContext';

const TEST_BOX_SEED_KEY = 'nutriai_test_cosmetic_boxes_30_v1';
const TEST_BOX_COUNT = 30;

export type HomeLootBoxDockProps = {
  bottom: number;
  onOpenWardrobe?: () => void;
};

export default function HomeLootBoxDock({ bottom, onOpenWardrobe }: HomeLootBoxDockProps) {
  const { colors } = useTheme();
  const [count, setCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [ready, setReady] = useState(false);

  const initialize = useCallback(async () => {
    try {
      const [state, seeded] = await Promise.all([
        loadRewardState(),
        AsyncStorage.getItem(TEST_BOX_SEED_KEY),
      ]);

      if (!seeded) {
        const next = {
          ...state,
          // Nu ștergem cuferele deja câștigate. Pentru test asigurăm minimum 30.
          pendingBoxes: Math.max(TEST_BOX_COUNT, state.pendingBoxes || 0),
        };
        await saveRewardState(next);
        await AsyncStorage.setItem(TEST_BOX_SEED_KEY, new Date().toISOString());
        setCount(next.pendingBoxes);
      } else {
        setCount(state.pendingBoxes || 0);
      }
    } catch (error) {
      console.warn('[Cosmetice] Nu s-au putut inițializa cuferele de test:', error);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const openBox = () => {
    if (!ready || count <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setModalVisible(true);
  };

  return (
    <>
      <View
        style={[
          styles.dock,
          {
            bottom,
            backgroundColor: `${colors.surface}F5`,
            borderColor: `${colors.accent}55`,
            shadowColor: colors.accent,
          },
        ]}
      >
        <Pressable
          onPress={openBox}
          disabled={!ready || count <= 0}
          accessibilityRole="button"
          accessibilityLabel={`Deschide cufăr cosmetic. ${count} cufere disponibile`}
          style={({ pressed }) => [styles.mainAction, { opacity: pressed ? 0.72 : 1 }]}
        >
          <View style={[styles.chest, { backgroundColor: `${colors.accent}22`, borderColor: colors.accent }]}>
            <Text style={styles.chestIcon}>🎁</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.danger }]}>
              <Text style={styles.countText}>{ready ? count : '…'}</Text>
            </View>
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Cufere cosmetice</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {count > 0 ? 'Apasă și rulează o recompensă' : 'Ai deschis toate cuferele de test'}
            </Text>
          </View>
          <View style={[styles.openPill, { backgroundColor: count > 0 ? colors.accent : colors.surfaceElevated }]}>
            <Gift size={17} color={count > 0 ? colors.background : colors.textTertiary} />
            <Text style={[styles.openText, { color: count > 0 ? colors.background : colors.textTertiary }]}>Deschide</Text>
          </View>
        </Pressable>

        {onOpenWardrobe ? (
          <Pressable
            onPress={onOpenWardrobe}
            accessibilityRole="button"
            accessibilityLabel="Deschide garderoba cosmetică"
            hitSlop={6}
            style={({ pressed }) => [styles.wardrobe, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Sparkles size={17} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      <LootBoxModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onOpened={(_item, reward) => setCount(reward.pendingBoxes)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 500,
    elevation: 24,
    minHeight: 76,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  mainAction: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  chest: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chestIcon: { fontSize: 27 },
  countBadge: { position: 'absolute', top: -7, right: -7, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0, marginLeft: 12 },
  title: { fontSize: 14, fontWeight: '900' },
  subtitle: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  openPill: { minHeight: 38, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openText: { fontSize: 11, fontWeight: '900' },
  wardrobe: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, marginLeft: 7, alignItems: 'center', justifyContent: 'center' },
});
