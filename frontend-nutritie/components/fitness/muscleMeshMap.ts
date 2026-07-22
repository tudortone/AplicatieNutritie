import type { MuscleId } from './heatColor';

export const MUSCLE_MESH_ALIASES: Record<MuscleId, string[]> = {
  pectorali: [
    'chest',
    'chest_l',
    'chest_r',
    'pectoralis',
    'pectoralis_major',
  ],
  deltoid_anterior: [
    'front_deltoid',
    'anterior_deltoid',
    'deltoid_anterior',
  ],
  deltoid_lateral: ['side_deltoid', 'lateral_deltoid', 'deltoid_lateral'],
  deltoid_posterior: [
    'rear_deltoid',
    'posterior_deltoid',
    'deltoid_posterior',
  ],
  biceps: ['biceps', 'biceps_l', 'biceps_r', 'biceps_brachii'],
  triceps: ['triceps', 'triceps_l', 'triceps_r', 'triceps_brachii'],
  antebrate: ['forearms', 'forearm_l', 'forearm_r', 'brachioradialis'],
  abdomen: ['abs', 'abdominals', 'rectus_abdominis', 'abdomen'],
  oblici: ['obliques', 'oblique_l', 'oblique_r'],
  trapez: ['trapezius', 'traps', 'trapez'],
  dorsali: ['lats', 'latissimus_dorsi', 'dorsals', 'dorsali'],
  lombari: ['lower_back', 'erector_spinae', 'lombari'],
  romboizi: ['rhomboids', 'romboizi'],
  fesieri: ['glutes', 'gluteus', 'gluteus_maximus', 'fesieri'],
  cvadriceps: ['quads', 'quadriceps', 'cvadriceps'],
  ischiogambieri: ['hamstrings', 'biceps_femoris', 'ischiogambieri'],
  gambe: ['calves', 'gastrocnemius', 'soleus', 'gambe'],
  adductori: ['adductors', 'adductor_l', 'adductor_r', 'adductori'],
};

export function normalizeMeshName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/\.\d+$/g, '');
}

export function muscleForMeshName(meshName: string): MuscleId | null {
  const normalized = normalizeMeshName(meshName);

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
