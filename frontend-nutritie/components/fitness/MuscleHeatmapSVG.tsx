import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { MuscleBody } from './MuscleBody';
import type { MuscleLoadMap } from '@/lib/fitnessEngine';

export default function MuscleHeatmapSVG({ muscleLoad }: { muscleLoad: MuscleLoadMap }) {
  const [side, setSide] = useState<'front' | 'back'>('front');

  const intensityMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    if (!muscleLoad) return map;
    const values = Object.values(muscleLoad).filter((v): v is number => typeof v === 'number' && v > 0);
    const maxVal = values.length > 0 ? Math.max(...values) : 1;
    for (const [k, v] of Object.entries(muscleLoad)) {
      if (typeof v === 'number' && v > 0) {
        map[k] = Math.min(1, v / Math.max(1, maxVal));
      }
    }
    return map;
  }, [muscleLoad]);

  const activeMuscles = React.useMemo(() => {
    return Object.keys(intensityMap).filter((k) => (intensityMap[k] ?? 0) > 0);
  }, [intensityMap]);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => setSide(s => s === 'front' ? 'back' : 'front')}
        style={styles.toggle}
        activeOpacity={0.8}
      >
        <RotateCcw size={14} color="#00BFFF" />
        <Text style={styles.toggleText}>{side === 'front' ? 'FAȚĂ' : 'SPATE'}</Text>
      </TouchableOpacity>

      <MuscleBody
        side={side}
        intensity={intensityMap}
        width={280}
        height={340}
      />
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
  svg: {
    width: '100%',
    height: '100%',
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
});
