import React from 'react';
import { View, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import MuscleMap from '../MuscleMapFront';

export type MuscleView = 'anterior' | 'posterior' | 'both';
export type MuscleIntensity = Record<string, number | undefined>;

export type Props = {
  intensityData?: MuscleIntensity;
  intensity?: Record<string, number | undefined>;
  view?: MuscleView;
  side?: 'front' | 'back' | string;
  width?: DimensionValue;
  height?: DimensionValue;
  style?: StyleProp<ViewStyle>;
  [key: string]: any;
};

export function MuscleBody({
  intensityData,
  intensity,
  view,
  side,
  width = '100%',
  height = '100%',
  style,
}: Props) {
  const resolvedData = intensityData || intensity || {};
  const activeMuscles = React.useMemo(() => {
    if (Array.isArray(resolvedData)) return resolvedData;
    return Object.keys(resolvedData).filter((k) => (resolvedData[k] ?? 0) > 0);
  }, [resolvedData]);

  const resolvedSide = (side || view || 'both') as 'front' | 'back' | 'both' | 'anterior' | 'posterior';

  return (
    <View style={[{ width, height, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }, style]}>
      <MuscleMap
        side={resolvedSide}
        intensity={typeof resolvedData === 'object' && !Array.isArray(resolvedData) ? resolvedData : undefined}
        activeMuscles={activeMuscles}
        activeColor="#FF3B30"
        inactiveColor="#374151"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

export default MuscleBody;
