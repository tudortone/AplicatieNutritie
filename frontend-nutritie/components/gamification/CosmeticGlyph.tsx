import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bot, CircuitBoard, Crown, Flame, Ghost, Orbit, Shield, Sparkles, Sword, Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { CosmeticItem } from '../../lib/cosmetics';

export type CosmeticGlyphProps = {
  item: CosmeticItem;
  size?: number;
  muted?: boolean;
};

function iconFor(item: CosmeticItem): LucideIcon {
  if (item.frameStyle === 'crown' || item.catalogId.includes('king')) return Crown;
  if (item.collection === 'Dragon') return Flame;
  if (item.collection === 'Shinobi') return item.cosmeticType === 'effect' ? Ghost : Sword;
  if (item.collection === 'Samurai') return Sword;
  if (item.collection === 'Mecha') return item.cosmeticType === 'avatar' ? Bot : CircuitBoard;
  if (item.collection === 'Cyberpunk') return item.cosmeticType === 'effect' ? Orbit : Zap;
  if (item.cosmeticType === 'effect') return Sparkles;
  return Shield;
}

export default function CosmeticGlyph({ item, size = 58, muted = false }: CosmeticGlyphProps) {
  const Icon = iconFor(item);
  const accent = muted ? '#64748B' : item.colors[0];
  const secondary = muted ? '#1E293B' : item.colors[1];
  const short = item.collection === 'Cyberpunk' ? 'NEO' : item.collection === 'Shinobi' ? '忍' : item.collection === 'Samurai' ? '侍' : '';

  return (
    <LinearGradient
      colors={[`${accent}45`, `${secondary}DD`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3, borderColor: accent }]}
    >
      <View style={[styles.inner, { borderColor: `${accent}88`, borderRadius: size * 0.23 }]}>
        <Icon size={size * 0.48} color={accent} strokeWidth={2.2} />
        {short ? <Text style={[styles.rune, { color: accent, fontSize: size * 0.13 }]}>{short}</Text> : null}
      </View>
      <View style={[styles.cut, styles.cutTop, { borderBottomColor: accent }]} />
      <View style={[styles.cut, styles.cutBottom, { borderTopColor: accent }]} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1.5, padding: 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inner: { ...StyleSheet.absoluteFillObject, margin: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rune: { position: 'absolute', bottom: 3, fontWeight: '900', letterSpacing: 1 },
  cut: { position: 'absolute', width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  cutTop: { top: 0, borderBottomWidth: 5 },
  cutBottom: { bottom: 0, borderTopWidth: 5 },
});
