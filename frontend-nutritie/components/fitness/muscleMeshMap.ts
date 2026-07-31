import type { MuscleId } from './heatColor';

export const MUSCLE_MESH_ALIASES: Record<MuscleId, string[]> = {
  pectorali: [
    'chest',
    'chest_l',
    'chest_r',
    'chest_lower',
    'chest_middle',
    'chest_upper',
    'chest_lower_left',
    'chest_lower_right',
    'chest_middle_left',
    'chest_middle_right',
    'chest_upper_left',
    'chest_upper_right',
    'chest_right',
    'pectoralis',
    'pectoralis_major',
  ],
  deltoid_anterior: [
    'front_deltoid',
    'anterior_deltoid',
    'deltoid_anterior',
    'delts_front',
    'delts_front_left',
    'delts_front_right',
  ],
  deltoid_lateral: [
    'side_deltoid',
    'lateral_deltoid',
    'deltoid_lateral',
    'delts_side',
    'delts_lateral',
    'delts_side_left',
    'delts_side_right',
    'delts_lateral_left',
    'delts_lateral_right',
  ],
  deltoid_posterior: [
    'rear_deltoid',
    'posterior_deltoid',
    'deltoid_posterior',
    'delts_rear',
    'delts_rear_left',
    'delts_rear_right',
  ],
  biceps: [
    'biceps',
    'biceps_l',
    'biceps_r',
    'biceps_left',
    'biceps_right',
    'biceps_brachii',
  ],
  triceps: [
    'triceps',
    'triceps_l',
    'triceps_r',
    'triceps_brachii',
    'triceps_brachii_left',
    'triceps_brachii_right',
    'triceps_long',
    'triceps_long_left',
    'triceps_long_right',
    'muèchiul triceps brahial',
    'muèchiul triceps brahial_left',
    'muèchiul triceps brahial_right',
    'muèchiul triceps brahial_left_2',
    'muèchiul triceps brahial_right_2',
    'capätul medial_left',
    'capätul medial_right',
    'lateral head_left',
    'lateral head_right',
  ],
  antebrate: [
    'forearms',
    'forearm_l',
    'forearm_r',
    'brachioradialis',
    'forearms_brachio',
    'forearms_brachio_left',
    'forearms_brachio_right',
    'muèchiul brahial_left',
    'muèchiul brahial_right',
    'muèchii extensori ai antebraèului',
  ],
  abdomen: [
    'abs',
    'abdominals',
    'rectus_abdominis',
    'abdomen',
    'abs_lower',
    'abs_middle',
    'abs_upper',
    'abs_lower_left',
    'abs_lower_right',
  ],
  oblici: [
    'obliques',
    'oblique_l',
    'oblique_r',
    'obliques_left',
    'obliques_right',
    'obliques_left_2',
    'obliques_right_2',
    'oblici',
  ],
  trapez: [
    'trapezius',
    'traps',
    'trapez',
    'traps_upper',
    'traps_middle',
    'traps_upper_left',
    'traps_upper_right',
    'traps_middle_left',
    'traps_middle_right',
  ],
  dorsali: [
    'lats',
    'latissimus_dorsi',
    'dorsals',
    'dorsali',
    'lats_left',
    'lats_right',
    'infraspinatus',
    'infraspinatus_left',
    'infraspinatus_right',
  ],
  lombari: [
    'lower_back',
    'erector_spinae',
    'lombari',
    'lower_back_left',
    'lower_back_right',
  ],
  romboizi: [
    'rhomboids',
    'romboizi',
  ],
  fesieri: [
    'glutes',
    'gluteus',
    'gluteus_maximus',
    'fesieri',
    'glutes_maximus',
    'glutes_maximus_left',
    'glutes_maximus_right',
    'glutes_medius',
    'glutes_medius_left',
    'glutes_medius_right',
  ],
  cvadriceps: [
    'quads',
    'quadriceps',
    'cvadriceps',
    'quads_vastus_lateralis',
    'quads_vastus_medialis',
    'quads_vastus_lateralis_left',
    'quads_vastus_lateralis_right',
    'quads_vastus_medialis_left',
    'quads_vastus_medialis_right',
  ],
  ischiogambieri: [
    'hamstrings',
    'biceps_femoris',
    'ischiogambieri',
    'biceps_femoris_left',
    'biceps_femoris_right',
    'semimembranosus',
    'semimembranosus_left',
    'semimembranosus_right',
    'semitendinosus',
    'semitendinosus_left',
    'semitendinosus_right',
  ],
  gambe: [
    'calves',
    'gastrocnemius',
    'soleus',
    'gambe',
    'calves_gastrocnemius',
    'calves_gastrocnemius_left',
    'calves_gastrocnemius_right',
    'muèchiul soleus',
    'tibialis_anterior',
    'tibialis_anterior_left',
    'tibialis_anterior_right',
    'tibialis_anterior_left_2',
    'tibialis_anterior_right_2',
  ],
  adductori: [
    'adductors',
    'adductor_l',
    'adductor_r',
    'adductori',
    'adductors_left',
    'adductors_right',
  ],
  abductori: [
    'abductors',
    'abductor',
    'abductori',
    'hip_flexors',
    'hip_flexors_left',
    'hip_flexors_right',
    'glutes_medius',
    'glutes_medius_left',
    'glutes_medius_right',
    'fesier_mijlociu',
  ],

  // Mușchi suplimentari din SVG-urile anatomice (mapați la cel mai apropiat canonic)
  // Aceștia nu sunt în MuscleId dar apar în harta musculară
};

// Mapare extinsă pentru ID-uri specifice din SVG (mai ales spate)
const EXTENDED_ALIASES: Record<string, MuscleId> = {
  // Spate - mușchi specifici
  'brachialis_left': 'antebrate',
  'brachialis_right': 'antebrate',
  'forearm_extensors': 'antebrate',
  'calves_medial_head_left': 'gambe',
  'calves_medial_head_right': 'gambe',
  'lateral_head_left': 'triceps',
  'lateral_head_right': 'triceps',
  'soleus': 'gambe',
  'glutes_medius_left': 'fesieri',
  'glutes_medius_right': 'fesieri',
  'glutes_maximus_left': 'fesieri',
  'glutes_maximus_right': 'fesieri',
  'traps_upper_left': 'trapez',
  'traps_upper_right': 'trapez',
  'traps_middle_left': 'trapez',
  'traps_middle_right': 'trapez',
  'triceps_long_left': 'triceps',
  'triceps_long_right': 'triceps',
  'triceps_brachii_left_2': 'triceps',
  'triceps_brachii_right_2': 'triceps',
  'infraspinatus_left': 'dorsali',
  'infraspinatus_right': 'dorsali',
  'semimembranosus_left': 'ischiogambieri',
  'semimembranosus_right': 'ischiogambieri',
  'semitendinosus_left': 'ischiogambieri',
  'semitendinosus_right': 'ischiogambieri',

  // Față - mușchi specifici
  'abs_lower_left': 'abdomen',
  'abs_lower_right': 'abdomen',
  'abs_middle': 'abdomen',
  'abs_upper': 'abdomen',
  'chest_upper_left': 'pectorali',
  'chest_upper_right': 'pectorali',
  'chest_lower_left': 'pectorali',
  'chest_lower_right': 'pectorali',
  'chest_middle_left': 'pectorali',
  'chest_middle_right': 'pectorali',
  'chest_right': 'pectorali',
  'calves_gastrocnemius_left': 'gambe',
  'calves_gastrocnemius_right': 'gambe',
  'forearms_brachio_left': 'antebrate',
  'forearms_brachio_right': 'antebrate',
  'tibialis_anterior_left': 'gambe',
  'tibialis_anterior_right': 'gambe',
  'tibialis_anterior_left_2': 'gambe',
  'tibialis_anterior_right_2': 'gambe',
  'serratus_left': 'abdomen',
  'serratus_right': 'abdomen',
  'hip_flexors_left': 'cvadriceps',
  'hip_flexors_right': 'cvadriceps',
  'neck_front_left': 'trapez',
  'neck_front_right': 'trapez',
  'neck_tendons_left': 'trapez',
  'neck_tendons_right': 'trapez',
  'clavicle': 'pectorali',

  // Variante cu sufix
  'obliques_left_2': 'oblici',
  'obliques_right_2': 'oblici',
};

/**
 * Normalizează un nume de mesh/ID SVG pentru căutare
 */
export function normalizeMeshName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimină diacriticele
    .replace(/[\s-]+/g, '_')
    .replace(/\.\d+$/g, '');
}

/**
 * Găsește MuscleId canonic pentru un nume de mesh/ID SVG
 */
export function muscleForMeshName(meshName: string): MuscleId | null {
  const normalized = normalizeMeshName(meshName);

  // Verifică mai întâi aliasurile extinse (prioritate mai mare)
  for (const [alias, muscleId] of Object.entries(EXTENDED_ALIASES)) {
    const normAlias = normalizeMeshName(alias);
    // Match exact sau cu sufix _left/_right
    if (normalized === normAlias) return muscleId;
    const withoutSuffix = normalized.replace(/_(left|right)$/, '');
    const aliasWithoutSuffix = normAlias.replace(/_(left|right)$/, '');
    if (withoutSuffix === aliasWithoutSuffix) return muscleId;
  }

  // Caută în MUSCLE_MESH_ALIASES
  for (const [muscle, aliases] of Object.entries(MUSCLE_MESH_ALIASES)) {
    if (
      aliases.some((alias) => {
        const normalizedAlias = normalizeMeshName(alias);
        return (
          normalized === normalizedAlias ||
          normalized.startsWith(`${normalizedAlias}_`) ||
          normalized.includes(normalizedAlias)
        );
      })
    ) {
      return muscle as MuscleId;
    }
  }

  return null;
}
