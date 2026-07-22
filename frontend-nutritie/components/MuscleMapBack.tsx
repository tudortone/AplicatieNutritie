import React from 'react';
import MuscleMapFront, { MuscleMapProps } from './MuscleMapFront';

export const MuscleMapBack: React.FC<MuscleMapProps> = (props) => {
  return <MuscleMapFront side="back" {...props} />;
};

export default MuscleMapBack;