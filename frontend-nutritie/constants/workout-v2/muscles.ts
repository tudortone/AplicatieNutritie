export const V2_MUSCLE_IDS = [
  'chest',
  'upper_chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'traps',
  'lats',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'adductors',
  'hip_flexors',
] as const;

export type V2MuscleId = typeof V2_MUSCLE_IDS[number];
export type AnatomyV2View = 'front' | 'back';
export type AnatomyV2Side = 'left' | 'right' | 'center';
export type V2MajorRegion = 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'legs';
export type V2MuscleRegionId = `${V2MuscleId}:${AnatomyV2View}:${AnatomyV2Side}`;

export interface V2MuscleDefinition {
  id: V2MuscleId;
  nameKey: `workoutV2.muscles.${V2MuscleId}`;
  majorRegion: V2MajorRegion;
  views: readonly AnatomyV2View[];
  paired: boolean;
}

function muscle(
  id: V2MuscleId,
  majorRegion: V2MajorRegion,
  views: readonly AnatomyV2View[],
  paired = true,
): V2MuscleDefinition {
  return { id, nameKey: `workoutV2.muscles.${id}`, majorRegion, views, paired };
}

export const V2_MUSCLES: Record<V2MuscleId, V2MuscleDefinition> = {
  chest: muscle('chest', 'chest', ['front']),
  upper_chest: muscle('upper_chest', 'chest', ['front']),
  front_delts: muscle('front_delts', 'shoulders', ['front']),
  side_delts: muscle('side_delts', 'shoulders', ['front', 'back']),
  rear_delts: muscle('rear_delts', 'shoulders', ['back']),
  traps: muscle('traps', 'back', ['back'], false),
  lats: muscle('lats', 'back', ['back']),
  lower_back: muscle('lower_back', 'back', ['back'], false),
  biceps: muscle('biceps', 'arms', ['front']),
  triceps: muscle('triceps', 'arms', ['back']),
  forearms: muscle('forearms', 'arms', ['front', 'back']),
  abs: muscle('abs', 'core', ['front'], false),
  obliques: muscle('obliques', 'core', ['front']),
  glutes: muscle('glutes', 'legs', ['back']),
  quads: muscle('quads', 'legs', ['front']),
  hamstrings: muscle('hamstrings', 'legs', ['back']),
  calves: muscle('calves', 'legs', ['front', 'back']),
  adductors: muscle('adductors', 'legs', ['front']),
  hip_flexors: muscle('hip_flexors', 'legs', ['front']),
};

export function v2RegionId(
  muscleId: V2MuscleId,
  view: AnatomyV2View,
  side: AnatomyV2Side,
): V2MuscleRegionId {
  return `${muscleId}:${view}:${side}`;
}

export function isV2MuscleId(value: string): value is V2MuscleId {
  return (V2_MUSCLE_IDS as readonly string[]).includes(value);
}

