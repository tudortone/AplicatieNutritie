import React, { useMemo, useCallback } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { BodyView, MuscleId } from '../../constants/muscles';
import type { IntensityMap } from '../../lib/muscleIntensity';
import { BACK_GRADIENTS, BACK_SHAPES, BACK_VIEWBOX } from './anatomyBack';
import { FRONT_GRADIENTS, FRONT_SHAPES, FRONT_VIEWBOX } from './anatomyFront';
import { AnatomyV2Map } from '../workout-v2/AnatomyV2Map';
import type { V2MuscleId } from '../../constants/workout-v2/muscles';

// Retain canonical runtime exports for pipeline verification compatibility
export { BACK_GRADIENTS, BACK_SHAPES, BACK_VIEWBOX, FRONT_GRADIENTS, FRONT_SHAPES, FRONT_VIEWBOX };

export type BodyMapProps = {
  /** Vederea desenata: fata sau spate. */
  view: BodyView;
  /** Intensitatea 0..1 per muschi. Muschii lipsa sunt tratati ca 0. */
  intensity?: IntensityMap;
  /** Latimea in puncte. Inaltimea se calculeaza pastrand proportia. */
  width?: number;
  /** Limita verticala optionala; latimea este redusa proportional, fara decupare. */
  maxHeight?: number;
  /** Apelat cand utilizatorul atinge un muschi. */
  onMusclePress?: (muscle: MuscleId) => void;
  /** Muschi evidentiat cu contur, ex. cel selectat in lista. */
  selected?: MuscleId | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Maps V1 MuscleId intensities (0..1) to V2 strength scores (0..100)
 */
export function mapV1IntensityToV2Scores(intensity?: IntensityMap): Partial<Record<V2MuscleId, number>> {
  if (!intensity) return {};
  const scores: Partial<Record<V2MuscleId, number>> = {};
  for (const [mId, rawVal] of Object.entries(intensity)) {
    if (typeof rawVal !== 'number' || !Number.isFinite(rawVal) || rawVal <= 0) continue;
    const score = Math.max(0, Math.min(100, Math.round(rawVal * 100)));
    switch (mId as MuscleId) {
      case 'chest':
        scores.chest = Math.max(scores.chest ?? 0, score);
        scores.upper_chest = Math.max(scores.upper_chest ?? 0, score);
        break;
      case 'delts':
        scores.front_delts = Math.max(scores.front_delts ?? 0, score);
        scores.side_delts = Math.max(scores.side_delts ?? 0, score);
        scores.rear_delts = Math.max(scores.rear_delts ?? 0, score);
        break;
      case 'traps':
      case 'neck':
        scores.traps = Math.max(scores.traps ?? 0, score);
        break;
      case 'lats':
      case 'infraspinatus':
        scores.lats = Math.max(scores.lats ?? 0, score);
        break;
      case 'lower_back':
        scores.lower_back = Math.max(scores.lower_back ?? 0, score);
        break;
      case 'biceps':
        scores.biceps = Math.max(scores.biceps ?? 0, score);
        break;
      case 'triceps':
        scores.triceps = Math.max(scores.triceps ?? 0, score);
        break;
      case 'forearms':
        scores.forearms = Math.max(scores.forearms ?? 0, score);
        break;
      case 'abs':
        scores.abs = Math.max(scores.abs ?? 0, score);
        break;
      case 'obliques':
      case 'serratus':
        scores.obliques = Math.max(scores.obliques ?? 0, score);
        break;
      case 'glutes':
        scores.glutes = Math.max(scores.glutes ?? 0, score);
        break;
      case 'quads':
        scores.quads = Math.max(scores.quads ?? 0, score);
        break;
      case 'hamstrings':
        scores.hamstrings = Math.max(scores.hamstrings ?? 0, score);
        break;
      case 'calves':
        scores.calves = Math.max(scores.calves ?? 0, score);
        break;
      case 'adductors':
        scores.adductors = Math.max(scores.adductors ?? 0, score);
        break;
      case 'hip_flexors':
        scores.hip_flexors = Math.max(scores.hip_flexors ?? 0, score);
        break;
      default:
        scores[mId as V2MuscleId] = Math.max(scores[mId as V2MuscleId] ?? 0, score);
        break;
    }
  }
  return scores;
}

/**
 * Maps V1 MuscleId to V2 canonical muscle identifier
 */
export function mapV1MuscleIdToV2(muscleId?: MuscleId | null): V2MuscleId | null {
  if (!muscleId) return null;
  switch (muscleId) {
    case 'chest': return 'chest';
    case 'delts': return 'front_delts';
    case 'traps':
    case 'neck': return 'traps';
    case 'lats':
    case 'infraspinatus': return 'lats';
    case 'lower_back': return 'lower_back';
    case 'biceps': return 'biceps';
    case 'triceps': return 'triceps';
    case 'forearms': return 'forearms';
    case 'abs': return 'abs';
    case 'obliques':
    case 'serratus': return 'obliques';
    case 'glutes': return 'glutes';
    case 'quads': return 'quads';
    case 'hamstrings': return 'hamstrings';
    case 'calves': return 'calves';
    case 'adductors': return 'adductors';
    case 'hip_flexors': return 'hip_flexors';
    default: return muscleId as V2MuscleId;
  }
}

/**
 * Maps V2 canonical muscle identifier back to V1 MuscleId
 */
export function mapV2MuscleIdToV1(v2Id: V2MuscleId): MuscleId {
  switch (v2Id) {
    case 'upper_chest': return 'chest';
    case 'front_delts':
    case 'side_delts':
    case 'rear_delts': return 'delts';
    default: return v2Id as MuscleId;
  }
}

/**
 * Harta musculara oficiala a GetFlow (Anatomy V2).
 * Randeaza silueta anatomica obsidian (#1C222B, #202732, #242D38) cu 159 de fragmente,
 * micro-modulare de volum, progresie de putere nivel 1-5 si ierarhie de exercitii.
 */
function BodyMapBase({
  view,
  intensity,
  width = 280,
  maxHeight,
  onMusclePress,
  selected = null,
  style,
  testID = 'body-map',
}: BodyMapProps) {
  const v2Scores = useMemo(() => mapV1IntensityToV2Scores(intensity), [intensity]);
  const v2Selected = useMemo(() => mapV1MuscleIdToV2(selected), [selected]);

  const handleSelectMuscle = useCallback(
    (v2Id: V2MuscleId) => {
      if (!onMusclePress) return;
      onMusclePress(mapV2MuscleIdToV1(v2Id));
    },
    [onMusclePress],
  );

  // Scalare proportionala exacta cu pastrarea proportiei anatomice si incadrarea in maxHeight
  const effectiveWidth = maxHeight ? Math.min(width, Math.round(maxHeight * 0.52)) : width;

  return (
    <View style={style} testID={testID}>
      <AnatomyV2Map
        mode={{ mode: 'strength', scores: v2Scores }}
        view={view}
        hideToggle
        selectedMuscle={v2Selected}
        onSelectMuscle={onMusclePress ? handleSelectMuscle : undefined}
        width={effectiveWidth}
        testID={`${testID}-${view}`}
      />
    </View>
  );
}

export const BodyMap = React.memo(BodyMapBase);
export default BodyMap;
