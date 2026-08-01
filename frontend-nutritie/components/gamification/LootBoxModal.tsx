import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  openLootBox,
  rarityColor,
  type RewardItem,
  type RewardState,
} from '../../lib/questsEngine';

/**
 * Animația are trei faze:
 *   1. `idle`    — cutia stă și pulsează, așteaptă tap;
 *   2. `opening` — tremurat din ce în ce mai rapid + scalare;
 *   3. `revealed`— raze care se deschid și cardul recompensei.
 *
 * Totul folosește `Animated` din React Native cu `useNativeDriver`, deci nu
 * adaugă nicio dependență nouă și rulează pe firul de UI nativ.
 */

type Phase = 'idle' | 'opening' | 'revealed';

export type LootBoxModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Apelat după deschidere, cu starea actualizată (pentru refresh în ecran). */
  onOpened?: (item: RewardItem, reward: RewardState) => void;
};

export default function LootBoxModal({ visible, onClose, onOpened }: LootBoxModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [item, setItem] = useState<RewardItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shake = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const cardIn = useRef(new Animated.Value(0)).current;

  // Puls continuu cât timp cutia e închisă
  useEffect(() => {
    if (!visible || phase !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, phase, pulse]);

  // Reset la fiecare redeschidere
  useEffect(() => {
    if (visible) return;
    setPhase('idle');
    setItem(null);
    setError(null);
    shake.setValue(0);
    scale.setValue(1);
    burst.setValue(0);
    cardIn.setValue(0);
  }, [visible, shake, scale, burst, cardIn]);

  const handleOpen = useCallback(async () => {
    if (phase !== 'idle') return;
    setPhase('opening');

    // Tremurat accelerat: amplitudine constantă, durate tot mai scurte
    const wobble = (duration: number, toValue: number) =>
      Animated.timing(shake, {
        toValue,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      });

    const shakeSeq = Animated.sequence([
      wobble(90, 1), wobble(90, -1),
      wobble(70, 1), wobble(70, -1),
      wobble(55, 1), wobble(55, -1),
      wobble(40, 1), wobble(40, -1),
      wobble(30, 0),
    ]);

    const swell = Animated.sequence([
      Animated.timing(scale, { toValue: 1.18, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.9, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);

    Animated.parallel([shakeSeq, swell]).start(async () => {
      const result = await openLootBox();
      if (!result.item) {
        setError('Nu ai niciun loot box disponibil.');
        setPhase('idle');
        scale.setValue(1);
        return;
      }
      setItem(result.item);
      setPhase('revealed');
      onOpened?.(result.item, result.reward);

      Animated.parallel([
        Animated.timing(burst, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(cardIn, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      ]).start();
    });
  }, [phase, shake, scale, burst, cardIn, onOpened]);

  const rotate = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-9deg', '9deg'],
  });

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  const accent = item ? rarityColor(item.rarity) : '#CCFF00';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={phase === 'revealed' ? onClose : undefined} />

        <View style={styles.stage} pointerEvents="box-none">
          {/* Raze care explodează la dezvăluire */}
          {phase === 'revealed' && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.burst,
                {
                  borderColor: accent,
                  opacity: burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.9, 0.4, 0] }),
                  transform: [
                    { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.4] }) },
                  ],
                },
              ]}
            />
          )}

          {phase !== 'revealed' && (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.glow,
                  { opacity: glowOpacity, transform: [{ scale: glowScale }] },
                ]}
              />
              <Pressable onPress={handleOpen} disabled={phase === 'opening'}>
                <Animated.View
                  style={[
                    styles.box,
                    { transform: [{ rotate }, { scale }] },
                  ]}
                >
                  <Text style={styles.boxIcon}>🎁</Text>
                  <View style={styles.boxBand} />
                </Animated.View>
              </Pressable>
              <Text style={styles.hint}>
                {phase === 'opening' ? 'Se deschide…' : 'Apasă pe cutie ca să o deschizi'}
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          )}

          {phase === 'revealed' && item && (
            <Animated.View
              style={[
                styles.card,
                {
                  borderColor: accent,
                  opacity: cardIn,
                  transform: [
                    { scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                  ],
                },
              ]}
            >
              <View style={[styles.cardTop, { backgroundColor: item.colors[0] }]}>
                <Text style={styles.cardIcon}>{item.icon}</Text>
              </View>
              <Text style={[styles.rarity, { color: accent }]}>{item.rarity.toUpperCase()}</Text>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardTheme}>Temă: {item.theme}</Text>

              <View style={styles.swatches}>
                {item.colors.map((c) => (
                  <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
                ))}
              </View>

              <Pressable style={[styles.cta, { backgroundColor: accent }]} onPress={onClose}>
                <Text style={styles.ctaText}>Super!</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,7,10,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
    width: '100%',
  },
  glow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#CCFF00',
  },
  burst: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
  },
  box: {
    width: 140,
    height: 140,
    borderRadius: 22,
    backgroundColor: '#181D22',
    borderWidth: 2,
    borderColor: 'rgba(204,255,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxIcon: { fontSize: 64 },
  boxBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'rgba(204,255,0,0.22)',
  },
  hint: {
    marginTop: 22,
    color: '#9CA3AF',
    fontSize: 14,
  },
  error: {
    marginTop: 10,
    color: '#F87171',
    fontSize: 13,
  },
  card: {
    width: 268,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: '#12161A',
    padding: 18,
    alignItems: 'center',
  },
  cardTop: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardIcon: { fontSize: 46 },
  rarity: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  cardName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 4 },
  cardTheme: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
  swatches: { flexDirection: 'row', gap: 8, marginTop: 14 },
  swatch: { width: 34, height: 12, borderRadius: 6 },
  cta: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 34,
    borderRadius: 999,
  },
  ctaText: { color: '#0B0F14', fontWeight: '800', fontSize: 15 },
});
