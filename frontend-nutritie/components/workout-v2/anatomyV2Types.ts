import type {
  AnatomyV2Side,
  AnatomyV2View,
  V2MuscleId,
} from '../../constants/workout-v2/muscles';

export interface AnatomyV2Shape {
  id: string;
  d: string;
  fill: string;
  muscleId?: V2MuscleId;
  view?: AnatomyV2View;
  side?: AnatomyV2Side;
}

export interface AnatomyV2Source {
  view: AnatomyV2View;
  viewBox: readonly [number, number, number, number];
  shapes: readonly AnatomyV2Shape[];
}

