import {
  FRAGMENT_BY_SLUG,
  GROUP_SLUGS,
  fragmentSlugsForGroup,
  type BodySlug,
  type GroupSlug,
} from 'react-native-body-parts-anatomy';

import type { AnatomyV2View, V2MuscleId } from '../../constants/workout-v2/muscles';
import {
  resolveAnatomyV2State,
  strengthLevelForScore,
  type AnatomyV2DisplayMode,
  type AnatomyV2DisplayState,
} from '../../lib/workout-v2/anatomyState';

export interface AnatomyV2SourceRegionMapping {
  readonly canonicalIds: readonly V2MuscleId[];
  readonly selectionTarget: V2MuscleId;
}

type SourceMappingByView = Readonly<
  Record<AnatomyV2View, Partial<Record<GroupSlug, AnatomyV2SourceRegionMapping>>>
>;

/**
 * Legal/source boundary for the preview anatomy package.
 *
 * A source region may represent more than one GetFlow concept only when the
 * upstream SVG does not contain a genuine boundary for that subdivision. The
 * adapter aggregates state in those cases; it never manufactures new paths.
 */
export const ANATOMY_V2_SOURCE_MAPPING: SourceMappingByView = {
  front: {
    chest: { canonicalIds: ['chest', 'upper_chest'], selectionTarget: 'chest' },
    deltoids: { canonicalIds: ['front_delts', 'side_delts'], selectionTarget: 'front_delts' },
    biceps: { canonicalIds: ['biceps'], selectionTarget: 'biceps' },
    triceps: { canonicalIds: ['triceps'], selectionTarget: 'triceps' },
    forearm: { canonicalIds: ['forearms'], selectionTarget: 'forearms' },
    abs: { canonicalIds: ['abs'], selectionTarget: 'abs' },
    obliques: { canonicalIds: ['obliques'], selectionTarget: 'obliques' },
    trapezius: { canonicalIds: ['traps'], selectionTarget: 'traps' },
    quadriceps: { canonicalIds: ['quads'], selectionTarget: 'quads' },
    adductors: { canonicalIds: ['adductors'], selectionTarget: 'adductors' },
    tibialis: { canonicalIds: ['calves'], selectionTarget: 'calves' },
    calves: { canonicalIds: ['calves'], selectionTarget: 'calves' },
  },
  back: {
    deltoids: { canonicalIds: ['rear_delts', 'side_delts'], selectionTarget: 'rear_delts' },
    trapezius: { canonicalIds: ['traps'], selectionTarget: 'traps' },
    'upper-back': { canonicalIds: ['lats'], selectionTarget: 'lats' },
    'lower-back': { canonicalIds: ['lower_back'], selectionTarget: 'lower_back' },
    triceps: { canonicalIds: ['triceps'], selectionTarget: 'triceps' },
    forearm: { canonicalIds: ['forearms'], selectionTarget: 'forearms' },
    gluteal: { canonicalIds: ['glutes'], selectionTarget: 'glutes' },
    hamstring: { canonicalIds: ['hamstrings'], selectionTarget: 'hamstrings' },
    adductors: { canonicalIds: ['adductors'], selectionTarget: 'adductors' },
    calves: { canonicalIds: ['calves'], selectionTarget: 'calves' },
  },
};

// The audited source has no distinct iliopsoas/hip-flexor geometry. Keeping
// this explicit is safer than mislabelling adductor or quadriceps paths.
export const ANATOMY_V2_SOURCE_UNSUPPORTED_IDS = ['hip_flexors'] as const satisfies readonly V2MuscleId[];

const GROUP_SLUG_SET = new Set<string>(GROUP_SLUGS);

export function sourceGroupForSlug(slug: BodySlug | string): GroupSlug | null {
  const fragment = FRAGMENT_BY_SLUG[slug];
  if (fragment) return fragment.parentSlug;
  return GROUP_SLUG_SET.has(slug) ? slug as GroupSlug : null;
}

export function mappingForSourceSlug(
  slug: BodySlug | string,
  view: AnatomyV2View,
): AnatomyV2SourceRegionMapping | null {
  const group = sourceGroupForSlug(slug);
  return group ? ANATOMY_V2_SOURCE_MAPPING[view][group] ?? null : null;
}

const EXERCISE_STATE_PRIORITY: Readonly<Record<AnatomyV2DisplayState, number>> = {
  NEUTRAL: 0,
  NO_DATA: 0,
  STABILIZER: 1,
  SECONDARY: 2,
  PRIMARY: 3,
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,
  LEVEL_4: 4,
  LEVEL_5: 5,
};

export function resolveSourceAnatomyV2State(
  mode: AnatomyV2DisplayMode,
  slug: BodySlug | string,
  view: AnatomyV2View,
): AnatomyV2DisplayState {
  const mapping = mappingForSourceSlug(slug, view);
  if (!mapping) return mode.mode === 'strength' ? 'NO_DATA' : 'NEUTRAL';

  if (mode.mode === 'strength') {
    const scores = mapping.canonicalIds
      .map((muscleId) => mode.scores[muscleId])
      .filter((score): score is number => score !== undefined && Number.isFinite(score));
    return strengthLevelForScore(scores.length > 0 ? Math.max(...scores) : undefined);
  }

  return mapping.canonicalIds
    .map((muscleId) => resolveAnatomyV2State(mode, muscleId))
    .reduce<AnatomyV2DisplayState>((strongest, candidate) => (
      EXERCISE_STATE_PRIORITY[candidate] > EXERCISE_STATE_PRIORITY[strongest]
        ? candidate
        : strongest
    ), 'NEUTRAL');
}

export function selectionTargetForSourceSlug(
  slug: BodySlug | string,
  view: AnatomyV2View,
): V2MuscleId | null {
  return mappingForSourceSlug(slug, view)?.selectionTarget ?? null;
}

export function sourceGroupsForCanonicalMuscle(
  muscleId: V2MuscleId | null | undefined,
  view: AnatomyV2View,
): GroupSlug[] {
  if (!muscleId) return [];
  return Object.entries(ANATOMY_V2_SOURCE_MAPPING[view])
    .filter(([, mapping]) => mapping?.canonicalIds.includes(muscleId))
    .map(([group]) => group as GroupSlug);
}

export function sourceFragmentsForCanonicalMuscle(
  muscleId: V2MuscleId | null | undefined,
  view: AnatomyV2View,
): string[] {
  if (!muscleId) return [];
  const groups = sourceGroupsForCanonicalMuscle(muscleId, view);
  return groups.flatMap((group) => fragmentSlugsForGroup(group, 'male', view));
}
