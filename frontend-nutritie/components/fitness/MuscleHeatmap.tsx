/**
 * MuscleHeatmap.tsx — Real 3D Muscle Heatmap cu SVG Fallback anatomic.
 * Conform specificației NutriAI v7 & cerințelor de normalizare a cheilor canonice.
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MuscleHeatmap3D from '@/components/fitness/MuscleHeatmap3D';
import MuscleHeatmapSVG from '@/components/fitness/MuscleHeatmapSVG';
import type { MuscleId } from '@/components/fitness/heatColor';
import { toCanonicalMuscle } from '@/components/fitness/exerciseIntensity';
import { muscleForMeshName } from '@/components/fitness/muscleMeshMap';

export interface MuscleHeatmapProps {
  intensities?: Record<string, number>;
  muscleLoad?: Record<string, number>;
  intensity?: Partial<Record<MuscleId, number>>;
  maxIntensity?: number;
  height?: number;
  interactive?: boolean;
}

export function MuscleHeatmap({
  intensities = {},
  muscleLoad,
  intensity,
  maxIntensity = 4,
  height = 380,
  interactive = true,
}: MuscleHeatmapProps) {
  const [supports3D] = useState(() => Platform.OS !== 'web');

  const normalizedLoad = useMemo(() => {
    const raw = intensity || muscleLoad || intensities || {};
    const result: Partial<Record<MuscleId, number>> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'number' || isNaN(value)) continue;
      // Încearcă normalizare directă sau prin alias/mesh map
      const canonical =
        toCanonicalMuscle(key) ||
        muscleForMeshName(key) ||
        (key as MuscleId);

      if (canonical) {
        // Dacă depășește 1, normăm opțional sau păstrăm valoarea
        const normVal = maxIntensity > 1 ? Math.min(1, value / maxIntensity) : value;
        result[canonical] = Math.max(result[canonical] ?? 0, normVal);
      }
    }
    return result;
  }, [intensity, muscleLoad, intensities, maxIntensity]);

  return (
    <View style={styles.container}>
      {supports3D ? (
        <MuscleHeatmap3D intensity={normalizedLoad} height={height} interactive={interactive} />
      ) : (
        <MuscleHeatmapSVG muscleLoad={normalizedLoad as any} />
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
