/**
 * MuscleHeatmap.tsx — container unic pentru harta musculară.
 * Normalizează o singură dată cheile și valorile, apoi alege randarea.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import MuscleHeatmap3D from '@/components/fitness/MuscleHeatmap3D';
import MuscleHeatmapSVG from '@/components/fitness/MuscleHeatmapSVG';
import type { MuscleId } from '@/components/fitness/heatColor';
import { mapToCanonicalMuscleIds } from '@/lib/muscleMapping';
import { muscleForMeshName } from '@/components/fitness/muscleMeshMap';

export interface MuscleHeatmapProps {
  intensities?: Record<string, number>;
  muscleLoad?: Record<string, number>;
  intensity?: Partial<Record<MuscleId, number>>;
  /** Scara maximă a valorilor primite (ex. heatLevels 0..4). */
  maxIntensity?: number;
  height?: number;
  interactive?: boolean;
  /**
   * `svg` este implicit pe toate platformele: path-urile și maparea lor sunt
   * verificate de buildAnatomy/verifyAnatomy. Modelul GLB are altă mapare, bazată
   * pe nume de mesh-uri, și se activează numai explicit până când toate mesh-urile
   * sale sunt inventariate și testate.
   */
  renderMode?: 'svg' | '3d';
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function MuscleHeatmap({
  intensities = {},
  muscleLoad,
  intensity,
  maxIntensity = 4,
  height = 380,
  interactive = true,
  renderMode = 'svg',
}: MuscleHeatmapProps) {
  /**
   * Normalizarea acceptă:
   * - fracții 0..1;
   * - niveluri 0..maxIntensity;
   * - tonaj brut, scalat relativ la valoarea maximă din hartă.
   *
   * Cheile necunoscute nu sunt păstrate prin cast; sunt ignorate, deoarece un ID
   * inexistent ar mări contoarele fără să poată colora vreo suprafață.
   */
  const normalizedLoad = useMemo(() => {
    const raw = intensity || muscleLoad || intensities || {};
    const values = Object.values(raw).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    const maxVal = values.length > 0 ? Math.max(...values) : 0;
    const safeMaxIntensity = Number.isFinite(maxIntensity) && maxIntensity > 0 ? maxIntensity : 1;
    const divisor = maxVal <= 1 ? 1 : maxVal <= safeMaxIntensity ? safeMaxIntensity : maxVal;

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

      // Compatibilitate pentru apelanți care trimit direct nume din modelul GLB.
      const meshMuscle = muscleForMeshName(key);
      if (meshMuscle) {
        result[meshMuscle] = Math.max(result[meshMuscle] ?? 0, clamp01(scaled));
      }
    }
    return result;
  }, [intensity, muscleLoad, intensities, maxIntensity]);

  return (
    <View style={[styles.container, { minHeight: height }]}>
      {renderMode === '3d' ? (
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
