/**
 * MuscleHeatmap.tsx — container pentru harta musculara (3D nativ, SVG pe web).
 * Normalizeaza o singura data cheile si valorile, apoi le trimite mai departe.
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MuscleHeatmap3D from '@/components/fitness/MuscleHeatmap3D';
import MuscleHeatmapSVG from '@/components/fitness/MuscleHeatmapSVG';
import type { MuscleId } from '@/components/fitness/heatColor';
import { mapToCanonicalMuscleIds } from '@/lib/muscleMapping';
import { muscleForMeshName } from '@/components/fitness/muscleMeshMap';

export interface MuscleHeatmapProps {
  intensities?: Record<string, number>;
  muscleLoad?: Record<string, number>;
  intensity?: Partial<Record<MuscleId, number>>;
  /** Scara maxima a valorilor primite (ex. heatLevels 0..4). */
  maxIntensity?: number;
  height?: number;
  interactive?: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function MuscleHeatmap({
  intensities = {},
  muscleLoad,
  intensity,
  maxIntensity = 4,
  height = 380,
  interactive = true,
}: MuscleHeatmapProps) {
  const [supports3D] = useState(() => Platform.OS !== 'web');

  /**
   * FIX HARTA:
   * - inainte, o cheie nerecunoscuta era pastrata ca atare (`key as MuscleId`),
   *   deci ajungea in harta un ID inexistent care nu colora nimic;
   * - grupele generice ("picioare", "spate") nu se distribuiau pe muschii componenti;
   * - valorile erau impartite mereu la `maxIntensity`, chiar si cand veneau deja
   *   ca fractii 0..1, ceea ce stingea harta de 4 ori.
   */
  const normalizedLoad = useMemo(() => {
    const raw = intensity || muscleLoad || intensities || {};
    const values = Object.values(raw).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    const maxVal = values.length > 0 ? Math.max(...values) : 0;
    // Scara reala a datelor primite: fractii (<=1), niveluri 0..maxIntensity, sau tonaj brut.
    const divisor = maxVal <= 1 ? 1 : maxVal <= maxIntensity ? maxIntensity : maxVal;

    const result: Partial<Record<MuscleId, number>> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
      const scaled = value / divisor;

      const targets = mapToCanonicalMuscleIds(key);
      if (targets.length > 0) {
        for (const { id, weight } of targets) {
          result[id] = Math.max(result[id] ?? 0, clamp01(scaled * weight));
        }
        continue;
      }
      // Fallback pentru nume de mesh-uri din modelul 3D.
      const meshMuscle = muscleForMeshName(key);
      if (meshMuscle) {
        result[meshMuscle] = Math.max(result[meshMuscle] ?? 0, clamp01(scaled));
      }
    }
    return result;
  }, [intensity, muscleLoad, intensities, maxIntensity]);

  return (
    <View style={styles.container}>
      {supports3D ? (
        <MuscleHeatmap3D intensity={normalizedLoad} height={height} interactive={interactive} />
      ) : (
        <MuscleHeatmapSVG intensity={normalizedLoad} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#090C0E',
  },
});

export default MuscleHeatmap;
