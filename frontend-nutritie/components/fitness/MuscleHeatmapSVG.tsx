import React from 'react';
import { View, StyleSheet } from 'react-native';
import MuscleMapFront from '../MuscleMapFront';
import type { MuscleLoadMap } from '@/lib/fitnessEngine';

export default function MuscleHeatmapSVG({ muscleLoad }: { muscleLoad: MuscleLoadMap }) {
  const intensityMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    if (!muscleLoad) return map;
    for (const [k, v] of Object.entries(muscleLoad)) {
      if (typeof v === 'number' && v > 0) {
        map[k] = Math.min(1, v > 1 ? v / 4 : v);
      }
    }
    return map;
  }, [muscleLoad]);

  return (
    <View style={styles.wrap}>
      <MuscleMapFront
        side="front"
        intensity={intensityMap}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 380, borderRadius: 20, overflow: 'hidden', backgroundColor: '#090C0E', alignItems: 'center', justifyContent: 'center' },
});

