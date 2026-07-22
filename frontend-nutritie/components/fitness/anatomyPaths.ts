import { MUSCLE_REGIONS } from './muscleRegions';

export type MusclePath = {
  id: string;
  d: string;
  view: 'anterior' | 'posterior';
};

const getPathByRegionIndex = (regionId: string, idx: number): string => {
  const reg = MUSCLE_REGIONS.find((r) => r.id === regionId);
  if (!reg) return '';
  return reg.d[idx] || (idx === 0 ? reg.d[0] : '') || '';
};

export const MUSCLE_PATHS: MusclePath[] = [
  // --- ANTERIOR (FAȚĂ) ---
  { id: 'chest_left', d: getPathByRegionIndex('pectorali', 0), view: 'anterior' },
  { id: 'chest_right', d: getPathByRegionIndex('pectorali', 1), view: 'anterior' },
  { id: 'front_delts_left', d: getPathByRegionIndex('deltoid_anterior', 0), view: 'anterior' },
  { id: 'front_delts_right', d: getPathByRegionIndex('deltoid_anterior', 1), view: 'anterior' },
  { id: 'side_delts_left', d: getPathByRegionIndex('deltoid_lateral', 0), view: 'anterior' },
  { id: 'side_delts_right', d: getPathByRegionIndex('deltoid_lateral', 1), view: 'anterior' },
  { id: 'biceps_left', d: getPathByRegionIndex('biceps', 0), view: 'anterior' },
  { id: 'biceps_right', d: getPathByRegionIndex('biceps', 1), view: 'anterior' },
  { id: 'forearms_left', d: getPathByRegionIndex('antebrate', 0), view: 'anterior' },
  { id: 'forearms_right', d: getPathByRegionIndex('antebrate', 1), view: 'anterior' },
  { id: 'abs', d: getPathByRegionIndex('abdomen', 0), view: 'anterior' },
  { id: 'obliques_left', d: getPathByRegionIndex('oblici', 0), view: 'anterior' },
  { id: 'obliques_right', d: getPathByRegionIndex('oblici', 1), view: 'anterior' },
  { id: 'quads_left', d: getPathByRegionIndex('cvadriceps', 0), view: 'anterior' },
  { id: 'quads_right', d: getPathByRegionIndex('cvadriceps', 1), view: 'anterior' },
  { id: 'adductors_left', d: getPathByRegionIndex('adductori', 0), view: 'anterior' },
  { id: 'adductors_right', d: getPathByRegionIndex('adductori', 1), view: 'anterior' },

  // --- POSTERIOR (SPATE) ---
  { id: 'trapezius', d: getPathByRegionIndex('trapez', 0), view: 'posterior' },
  { id: 'rear_delts_left', d: getPathByRegionIndex('deltoid_posterior', 0), view: 'posterior' },
  { id: 'rear_delts_right', d: getPathByRegionIndex('deltoid_posterior', 1), view: 'posterior' },
  { id: 'lats_left', d: getPathByRegionIndex('dorsali', 0), view: 'posterior' },
  { id: 'lats_right', d: getPathByRegionIndex('dorsali', 1), view: 'posterior' },
  { id: 'rhomboids', d: getPathByRegionIndex('romboizi', 0), view: 'posterior' },
  { id: 'triceps_left', d: getPathByRegionIndex('triceps', 0), view: 'posterior' },
  { id: 'triceps_right', d: getPathByRegionIndex('triceps', 1), view: 'posterior' },
  { id: 'lower_back', d: getPathByRegionIndex('lombari', 0), view: 'posterior' },
  { id: 'glutes_left', d: getPathByRegionIndex('fesieri', 0), view: 'posterior' },
  { id: 'glutes_right', d: getPathByRegionIndex('fesieri', 1), view: 'posterior' },
  { id: 'hamstrings_left', d: getPathByRegionIndex('ischiogambieri', 0), view: 'posterior' },
  { id: 'hamstrings_right', d: getPathByRegionIndex('ischiogambieri', 1), view: 'posterior' },
  { id: 'calves_left', d: getPathByRegionIndex('gambe', 0), view: 'posterior' },
  { id: 'calves_right', d: getPathByRegionIndex('gambe', 1), view: 'posterior' },
];
