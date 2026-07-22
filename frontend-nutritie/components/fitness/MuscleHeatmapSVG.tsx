import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { MuscleLoadMap } from '@/lib/fitnessEngine';

function fillFor(load: number): string {
  const t = Math.min(Math.max(load / 4, 0), 1);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  // #2A323D -> #FF0033
  const r = lerp(0x2a, 0xff), g = lerp(0x32, 0x00), b = lerp(0x3d, 0x33);
  return `rgb(${r},${g},${b})`;
}

// Trasee anatomice simplificate, vedere frontală. Fiecare <path> = o grupă.
const REGIONS: { muscle: string; d: string }[] = [
  { muscle: 'chest',     d: 'M70 90 Q100 80 130 90 L128 120 Q100 130 72 120 Z' },
  { muscle: 'core',      d: 'M80 125 L120 125 L116 175 Q100 182 84 175 Z' },
  { muscle: 'biceps',    d: 'M58 95 Q50 110 54 135 L66 132 L68 100 Z' },
  { muscle: 'triceps',   d: 'M142 95 Q150 110 146 135 L134 132 L132 100 Z' },
  { muscle: 'quads',     d: 'M82 180 L98 180 L96 240 L84 240 Z' },
  { muscle: 'hamstrings',d: 'M102 180 L118 180 L116 240 L104 240 Z' },
  { muscle: 'calves',    d: 'M84 245 L96 245 L94 290 L86 290 Z M104 245 L116 245 L114 290 L106 290 Z' },
  { muscle: 'shoulders', d: 'M60 82 Q75 74 88 82 L84 92 Q72 88 64 94 Z M112 82 Q125 74 140 82 L136 94 Q128 88 116 92 Z' },
];

export default function MuscleHeatmapSVG({ muscleLoad }: { muscleLoad: MuscleLoadMap }) {
  return (
    <View style={styles.wrap}>
      <Svg width="100%" height="100%" viewBox="0 0 200 300">
        {REGIONS.map(({ muscle, d }) => (
          <Path
            key={muscle}
            d={d}
            fill={fillFor(muscleLoad[muscle] ?? 0)}
            stroke="#090C0E"
            strokeWidth={1.5}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 380, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F141A', alignItems: 'center' },
});
