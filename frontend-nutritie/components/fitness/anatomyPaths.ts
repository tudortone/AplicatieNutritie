import { MUSCLE_REGIONS, type BodySide } from './muscleRegions';

export type MusclePath = {
  id: string;
  d: string;
  view: 'anterior' | 'posterior';
};

/**
 * Același `id` de mușchi poate exista atât pe față, cât și pe spate
 * (trapez, gambe, deltoid lateral...). Căutarea doar după `id` returna mereu
 * prima potrivire din listă, deci vederea din spate putea primi geometria de pe
 * față. Căutăm după `id` + `side`.
 */
const getPathByRegionIndex = (regionId: string, side: BodySide, idx: number): string => {
  const reg = MUSCLE_REGIONS.find((r) => r.id === regionId && r.side === side);
  if (!reg) return '';
  return reg.d[idx] || (idx === 0 ? reg.d[0] : '') || '';
};

const front = (regionId: string, idx: number) => getPathByRegionIndex(regionId, 'front', idx);
const back = (regionId: string, idx: number) => getPathByRegionIndex(regionId, 'back', idx);

export const MUSCLE_PATHS: MusclePath[] = ([
  // --- ANTERIOR (FAȚĂ) ---
  { id: 'chest_left', d: front('pectorali', 0), view: 'anterior' },
  { id: 'chest_right', d: front('pectorali', 1), view: 'anterior' },
  { id: 'front_delts_left', d: front('deltoid_anterior', 0), view: 'anterior' },
  { id: 'front_delts_right', d: front('deltoid_anterior', 1), view: 'anterior' },
  { id: 'side_delts_left', d: front('deltoid_lateral', 0), view: 'anterior' },
  { id: 'side_delts_right', d: front('deltoid_lateral', 1), view: 'anterior' },
  { id: 'biceps_left', d: front('biceps', 0), view: 'anterior' },
  { id: 'biceps_right', d: front('biceps', 1), view: 'anterior' },
  { id: 'forearms_left', d: front('antebrate', 0), view: 'anterior' },
  { id: 'forearms_right', d: front('antebrate', 1), view: 'anterior' },
  { id: 'abs', d: front('abdomen', 0), view: 'anterior' },
  { id: 'obliques_left', d: front('oblici', 0), view: 'anterior' },
  { id: 'obliques_right', d: front('oblici', 1), view: 'anterior' },
  { id: 'quads_left', d: front('cvadriceps', 0), view: 'anterior' },
  { id: 'quads_right', d: front('cvadriceps', 1), view: 'anterior' },
  { id: 'adductors_left', d: front('adductori', 0), view: 'anterior' },
  { id: 'adductors_right', d: front('adductori', 1), view: 'anterior' },
  { id: 'traps_front', d: front('trapez', 0), view: 'anterior' },
  { id: 'shins_left', d: front('gambe', 0), view: 'anterior' },
  { id: 'shins_right', d: front('gambe', 1), view: 'anterior' },
  { id: 'abductors_front_left', d: front('abductori', 0), view: 'anterior' },
  { id: 'abductors_front_right', d: front('abductori', 1), view: 'anterior' },

  // --- POSTERIOR (SPATE) ---
  { id: 'trapezius', d: back('trapez', 0), view: 'posterior' },
  { id: 'rear_delts_left', d: back('deltoid_posterior', 0), view: 'posterior' },
  { id: 'rear_delts_right', d: back('deltoid_posterior', 1), view: 'posterior' },
  { id: 'lats_left', d: back('dorsali', 0), view: 'posterior' },
  { id: 'lats_right', d: back('dorsali', 1), view: 'posterior' },
  { id: 'rhomboids', d: back('romboizi', 0), view: 'posterior' },
  { id: 'triceps_left', d: back('triceps', 0), view: 'posterior' },
  { id: 'triceps_right', d: back('triceps', 1), view: 'posterior' },
  { id: 'lower_back', d: back('lombari', 0), view: 'posterior' },
  { id: 'glutes_left', d: back('fesieri', 0), view: 'posterior' },
  { id: 'glutes_right', d: back('fesieri', 1), view: 'posterior' },
  { id: 'hamstrings_left', d: back('ischiogambieri', 0), view: 'posterior' },
  { id: 'hamstrings_right', d: back('ischiogambieri', 1), view: 'posterior' },
  { id: 'calves_left', d: back('gambe', 0), view: 'posterior' },
  { id: 'calves_right', d: back('gambe', 1), view: 'posterior' },
] as MusclePath[]).filter((p) => p.d.length > 0);
