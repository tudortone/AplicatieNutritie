import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { COSMETIC_CATALOG, equipCosmetic, openCosmeticLootBox, type CosmeticItem } from '../../lib/cosmetics';
import type { RewardState } from '../../lib/questsEngine';
import { useTheme } from '../../context/ThemeContext';
import CosmeticGlyph from './CosmeticGlyph';

type Phase = 'idle' | 'opening' | 'rolling' | 'revealed';
const REEL_ITEM = 76;
const WINNER_INDEX = 20;

export type LootBoxModalProps = {
  visible: boolean;
  onClose: () => void;
  onOpened?: (item: CosmeticItem, reward: RewardState) => void;
};

const buildReel = (winner: CosmeticItem) => Array.from({ length: 24 }, (_, index) =>
  index === WINNER_INDEX ? winner : COSMETIC_CATALOG[Math.floor(Math.random() * COSMETIC_CATALOG.length)],
);

export default function LootBoxModal({ visible, onClose, onOpened }: LootBoxModalProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [item, setItem] = useState<CosmeticItem | null>(null);
  const [reel, setReel] = useState<CosmeticItem[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const boxScale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reelX = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const particles = useMemo(() => Array.from({ length: 14 }, (_, i) => i), []);

  useEffect(() => {
    if (!visible || phase !== 'idle') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, phase, pulse]);

  useEffect(() => {
    if (visible) return;
    setPhase('idle'); setItem(null); setReel([]); setDuplicate(false); setEquipped(false); setError(null);
    shake.setValue(0); boxScale.setValue(1); reelX.setValue(0); reveal.setValue(0); burst.setValue(0);
  }, [visible, shake, boxScale, reelX, reveal, burst]);

  const revealWinner = useCallback((winner: CosmeticItem) => {
    setPhase('revealed');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.parallel([
      Animated.spring(reveal, { toValue: 1, friction: 6, tension: 64, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [reveal, burst]);

  const startRoll = useCallback(async () => {
    setPhase('rolling');
    try {
      const result = await openCosmeticLootBox();
      if (!result.item) {
        setError('Nu mai ai cufere disponibile.');
        setPhase('idle');
        boxScale.setValue(1);
        return;
      }
      const winner = result.item;
      setItem(winner); setDuplicate(result.duplicate); setReel(buildReel(winner)); setEquipped(false);
      onOpened?.(winner, result.reward);
      reelX.setValue(0);
      requestAnimationFrame(() => {
        const target = 143 - (WINNER_INDEX * REEL_ITEM + REEL_ITEM / 2);
        Animated.timing(reelX, {
          toValue: target,
          // Nivelul intern influențează doar suspansul; nu este afișat utilizatorului.
          duration: winner.rarity === 'legendar' ? 4300 : winner.rarity === 'epic' ? 3700 : 3200,
          easing: Easing.bezier(0.08, 0.72, 0.12, 1), useNativeDriver: true,
        }).start(() => revealWinner(winner));
      });
    } catch {
      setError('Cufărul nu a putut fi salvat. Încearcă din nou.');
      setPhase('idle');
      boxScale.setValue(1);
    }
  }, [boxScale, onOpened, reelX, revealWinner]);

  const handleOpen = useCallback(() => {
    if (phase !== 'idle' || error) return;
    setPhase('opening');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const wobble = (duration: number, toValue: number) => Animated.timing(shake, { toValue, duration, easing: Easing.linear, useNativeDriver: true });
    Animated.parallel([
      Animated.sequence([wobble(90, 1), wobble(90, -1), wobble(65, 1), wobble(65, -1), wobble(45, 1), wobble(45, -1), wobble(30, 0)]),
      Animated.sequence([
        Animated.timing(boxScale, { toValue: 1.2, duration: 430, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(boxScale, { toValue: 0.15, duration: 180, easing: Easing.in(Easing.back(1.5)), useNativeDriver: true }),
      ]),
    ]).start(startRoll);
  }, [phase, error, shake, boxScale, startRoll]);

  const handleEquip = async () => {
    if (!item) return;
    await equipCosmetic(item);
    setEquipped(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const rotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-10deg', '10deg'] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.58] });
  const accent = item?.colors[0] || colors.accent;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={phase === 'opening' || phase === 'rolling' ? undefined : onClose} statusBarTranslucent>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={phase === 'idle' || phase === 'revealed' ? onClose : undefined} />
        <View style={styles.stage}>
          {(phase === 'idle' || phase === 'opening') && (
            <>
              <Pressable onPress={onClose} disabled={phase === 'opening'} style={styles.close} accessibilityLabel="Închide"><X color="#CBD5E1" size={22} /></Pressable>
              <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: colors.accent, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
              <Pressable onPress={handleOpen} disabled={phase !== 'idle' || Boolean(error)} accessibilityRole="button" accessibilityLabel="Deschide cufărul tematic">
                <Animated.View style={[styles.box, { borderColor: `${colors.accent}99`, transform: [{ rotate }, { scale: boxScale }] }]}>
                  <Text style={styles.boxIcon}>🎁</Text><View style={[styles.boxBand, { backgroundColor: `${colors.accent}55` }]} />
                </Animated.View>
              </Pressable>
              <Text style={styles.hint}>{phase === 'opening' ? 'Portalul se deschide…' : error || 'Apasă pentru o recompensă custom'}</Text>
            </>
          )}

          {phase === 'rolling' && (
            <View style={styles.rollStage}>
              <Text style={styles.rollTitle}>ALEGE UNIVERSUL</Text>
              <View style={styles.reelWindow}>
                <View style={[styles.centerMarker, { borderColor: colors.accent }]} />
                <Animated.View style={[styles.reel, { transform: [{ translateX: reelX }] }]}>
                  {reel.map((cosmetic, index) => (
                    <View key={`${cosmetic.catalogId}-${index}`} style={[styles.reelItem, { borderColor: cosmetic.colors[0], backgroundColor: `${cosmetic.colors[1]}55` }]}>
                      <CosmeticGlyph item={cosmetic} size={55} />
                    </View>
                  ))}
                </Animated.View>
              </View>
              <Text style={styles.rollingText}>Cavaleri · Dragoni · Samurai · Mecha · Cyberpunk</Text>
            </View>
          )}

          {phase === 'revealed' && item && (
            <>
              <Animated.View pointerEvents="none" style={[styles.burst, { borderColor: accent, opacity: burst.interpolate({ inputRange: [0, .55, 1], outputRange: [.85, .4, 0] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [.4, 3] }) }] }]} />
              {particles.map((particle) => {
                const angle = particle / particles.length * Math.PI * 2;
                return <Animated.View key={particle} pointerEvents="none" style={[styles.particle, { backgroundColor: item.colors[particle % 2], opacity: burst.interpolate({ inputRange: [0, .2, 1], outputRange: [0, 1, 0] }), transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 125] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 125] }) }] }]} />;
              })}
              <Animated.View style={[styles.card, { borderColor: accent, opacity: reveal, transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [.55, 1] }) }] }]}>
                <CosmeticGlyph item={item} size={108} />
                <Text style={[styles.collection, { color: accent }]}>{item.collection.toUpperCase()}</Text>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.typeText}>{item.description}</Text>
                {duplicate ? <Text style={{ color: colors.warning, fontWeight: '800', marginTop: 10 }}>Deținut deja · +25 XP</Text> : null}
                <View style={styles.actions}>
                  <Pressable style={[styles.secondaryBtn, { borderColor: accent }]} onPress={onClose}><Text style={{ color: accent, fontWeight: '800' }}>Mai târziu</Text></Pressable>
                  <Pressable style={[styles.equipBtn, { backgroundColor: accent }]} onPress={handleEquip} disabled={equipped}><Text style={styles.equipText}>{equipped ? 'Echipat ✓' : 'Echipează'}</Text></Pressable>
                </View>
              </Animated.View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,5,8,.95)', alignItems: 'center', justifyContent: 'center' },
  stage: { minHeight: 400, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  close: { position: 'absolute', top: 0, right: 22, zIndex: 20, padding: 10 },
  glow: { position: 'absolute', width: 190, height: 190, borderRadius: 95 },
  box: { width: 142, height: 142, borderRadius: 26, backgroundColor: '#181D22', borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  boxIcon: { fontSize: 66 }, boxBand: { position: 'absolute', left: 0, right: 0, height: 11 },
  hint: { marginTop: 22, color: '#E5E7EB', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  rollStage: { alignItems: 'center', width: '100%' }, rollTitle: { color: '#FFF', fontSize: 15, fontWeight: '900', letterSpacing: 2, marginBottom: 24 },
  reelWindow: { width: 286, height: 92, overflow: 'hidden', borderRadius: 18, backgroundColor: '#0D1117', borderWidth: 1, borderColor: '#334155', justifyContent: 'center' },
  reel: { flexDirection: 'row', alignItems: 'center' }, reelItem: { width: 68, height: 68, marginHorizontal: 4, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  centerMarker: { position: 'absolute', zIndex: 4, left: 105, width: 76, height: 88, borderWidth: 2, borderRadius: 18 },
  rollingText: { color: '#94A3B8', fontSize: 11, marginTop: 18, textAlign: 'center' },
  burst: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 4 }, particle: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  card: { width: 310, borderRadius: 24, borderWidth: 2, backgroundColor: '#11161C', padding: 20, alignItems: 'center' },
  collection: { fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 14 }, cardName: { color: '#FFF', fontSize: 21, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  typeText: { color: '#94A3B8', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }, secondaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  equipBtn: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, equipText: { color: '#0B0F14', fontSize: 13, fontWeight: '900' },
});
