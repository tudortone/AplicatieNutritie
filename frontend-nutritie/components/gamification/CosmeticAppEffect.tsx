import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { getCatalogCosmetic, loadEquippedCosmetics, type CosmeticItem } from '../../lib/cosmetics';

export default function CosmeticAppEffect() {
  const pathname = usePathname();
  const [effect, setEffect] = useState<CosmeticItem | null>(null);
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  // Throttle 2s pentru reload-ul cosmeticelor
  const lastRefresh = useRef(0);
  const particles = useMemo(() => Array.from({ length: 9 }, (_, index) => ({
    id: index,
    left: `${8 + ((index * 13) % 84)}%` as const,
    top: `${7 + ((index * 23) % 82)}%` as const,
  })), []);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefresh.current < 2000) return; // max o data la 2 secunde
    lastRefresh.current = now;
    const equipped = await loadEquippedCosmetics();
    setEffect(getCatalogCosmetic(equipped.effectId));
  }, []);

  // Refresh la navigare (ex: utilizatorul revine de la garderoba dupa echipare)
  // si la revenirea din background.
  useEffect(() => { refresh(); }, [pathname, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!effect) return;
    drift.setValue(0); pulse.setValue(0);
    const driftLoop = Animated.loop(Animated.timing(drift, { toValue: 1, duration: effect.effectStyle === 'electric' ? 1800 : 6500, easing: Easing.linear, useNativeDriver: true }));
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    driftLoop.start(); pulseLoop.start();
    return () => { driftLoop.stop(); pulseLoop.stop(); };
  }, [effect, drift, pulse]);

  if (!effect) return null;
  const translate = drift.interpolate({ inputRange: [0, 1], outputRange: [28, -38] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, effect.effectStyle === 'flame' ? 0.28 : 0.2] });
  const symbol = effect.effectStyle === 'electric' ? 'ϟ' : effect.effectStyle === 'flame' ? '◆' : effect.effectStyle === 'orbit' ? '◉' : '✦';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      <Animated.View style={[styles.edgeGlow, { backgroundColor: effect.colors[0], opacity, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) }] }]} />
      {particles.map((particle, index) => (
        <Animated.Text key={particle.id} style={[styles.particle, {
          left: particle.left, top: particle.top, color: effect.colors[index % 2],
          opacity, transform: [{ translateY: translate }, { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 ? '180deg' : '360deg'] }) }],
        }]}>{symbol}</Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  edgeGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -130, top: '18%' },
  particle: { position: 'absolute', fontSize: 15, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
});
