import React from 'react';
import { View, DimensionValue } from 'react-native';
import MuscleMap from '../MuscleMapFront';

interface LiveMuscleBodyProps {
  side: 'front' | 'back';
  intensity: Record<string, number | undefined>;
  width?: DimensionValue;
  height?: DimensionValue;
}

export function LiveMuscleBody({ side, intensity, width = 280, height = 340 }: LiveMuscleBodyProps) {
  const activeMuscles = React.useMemo(() => {
    if (!intensity) return [];
    if (Array.isArray(intensity)) return intensity;
    return Object.keys(intensity).filter((k) => (intensity[k] ?? 0) > 0);
  }, [intensity]);

  return (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <MuscleMap
        side={side}
        intensity={typeof intensity === 'object' && !Array.isArray(intensity) ? intensity : undefined}
        activeMuscles={activeMuscles}
        activeColor="#00BFFF"
        inactiveColor="#374151"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

export default LiveMuscleBody;
