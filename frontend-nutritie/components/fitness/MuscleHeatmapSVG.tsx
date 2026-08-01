import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { MuscleBody } from './MuscleBody';
import { normalizeMuscleLoadToIntensity, type MuscleLoadMap } from '@/lib/fitnessEngine';
import { mapToCanonicalMuscleIds } from '@/lib/muscleMapping';
import type { MuscleId } from './heatColor';

type IntensityMap = Partial<Record<MuscleId, number>>;

export type MuscleHeatmapSVGProps = {
  /** Tonaj brut pe muschi (kg). Se normalizeaza logaritmic. */
  muscleLoad?: MuscleLoadMap;
  /** Intensitati deja normalizate 0..1, cu chei canonice. Are prioritate. */
  intensity?: IntensityMap;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** Chei brute -> MuscleId canonic, pastrand valorile deja normalizate 0..1. */
function canonicalizeRatios(input: Record<string, number>): IntensityMap {
  const out: IntensityMap = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    for (const { id, weight } of mapToCanonicalMuscleIds(key)) {
      out[id] = Math.max(out[id] ?? 0, clamp01(value * weight));
    }
  }
  return out;
}

/**
 * FIX HARTA (Acasa):
 * 1. Componenta construia harta din cheile brute ale lui `muscleLoad` ("piept",
 *    "chest", "lats"...), dar `MuscleBody` cauta dupa MuscleId canonic
 *    ("pectorali", "dorsali"...). Nicio cheie nu se potrivea, deci corpul ramanea
 *    complet stins chiar si dupa antrenamente salvate.
 * 2. Apelantul (MuscleHeatmap) trimite deja valori normalizate 0..1. Daca le-am fi
 *    trecut din nou prin scalarea logaritmica pe tonaj, totul ar fi cazut la ~0.08,
 *    adica tot un corp stins. De aceea detectam formatul valorilor.
 */
export default function MuscleHeatmapSVG({ muscleLoad, intensity }: MuscleHeatmapSVGProps) {
  const [side, setSide] = useState<'front' | 'back'>('front');

  const intensityMap = useMemo<IntensityMap>(() => {
    if (intensity && Object.keys(intensity).length > 0) {
      return canonicalizeRatios(intensity as Record<string, number>);
    }
    const raw = muscleLoad ?? {};
    const values = Object.values(raw).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    if (values.length === 0) return {};
    // Valori <= 1 => sunt deja intensitati; > 1 => tonaj brut in kg.
    const isRatio = Math.max(...values) <= 1;
    return isRatio ? canonicalizeRatios(raw) : normalizeMuscleLoadToIntensity(raw);
  }, [muscleLoad, intensity]);

  const activeCount = useMemo(
    () => Object.values(intensityMap).filter((v) => (v ?? 0) >= 0.05).length,
    [intensityMap],
  );

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
        style={styles.toggle}
        activeOpacity={0.8}
        accessibilityRole='button'
        accessibilityLabel={side === 'front' ? 'Arată spatele' : 'Arată fața'}
      >
        <RotateCcw size={14} color='#00BFFF' />
        <Text style={styles.toggleText}>{side === 'front' ? 'FAȚĂ' : 'SPATE'}</Text>
      </TouchableOpacity>

      <MuscleBody
        side={side}
        intensity={intensityMap}
        width={280}
        height={340}
      />

      {activeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeCount} mușchi lucrați</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#090C0E',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  toggle: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00BFFF55',
    backgroundColor: '#00BFFF15',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00BFFF',
  },
  badge: {
    position: 'absolute',
    bottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
