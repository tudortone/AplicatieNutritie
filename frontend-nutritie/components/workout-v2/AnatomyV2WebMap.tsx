import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  BODY_REGIONS,
  type BodySlug,
} from 'react-native-body-parts-anatomy';

import type { AnatomyV2View } from '../../constants/workout-v2/muscles';

interface AnatomyV2WebMapProps {
  view: AnatomyV2View;
  selectedSlugs: readonly string[];
  colorForSlug: (slug: BodySlug) => string | undefined;
  onFragmentPress?: (slug: string) => void;
  accessibilityLabel: string;
  outlineColor: string;
  unselectedFragmentColor: string;
  selectedFragmentColor: string;
}

function parseAspectRatio(viewBox: string): number {
  const [, , width, height] = viewBox.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return 1;
  return width / height;
}

function AnatomyV2WebMapBase({
  view,
  selectedSlugs,
  colorForSlug,
  onFragmentPress,
  accessibilityLabel,
  outlineColor,
  unselectedFragmentColor,
  selectedFragmentColor,
}: AnatomyV2WebMapProps) {
  const region = BODY_REGIONS.male[view];
  const selectedSet = useMemo(() => new Set(selectedSlugs), [selectedSlugs]);
  const aspectRatio = useMemo(() => parseAspectRatio(region.viewBox), [region.viewBox]);

  return (
    <View
      testID={`anatomy-v2-web-source-${view}`}
      style={[styles.container, { aspectRatio }]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={region.viewBox}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        <Path
          d={region.outlineD}
          fill="#141820"
          stroke={outlineColor}
          strokeWidth={0.8}
        />
        {region.fragments.map((fragment) => {
          const selected = selectedSet.has(fragment.slug);
          return (
            <Path
              key={fragment.slug}
              testID={`anatomy-v2-web-${fragment.slug}`}
              d={fragment.pathData}
              fill={colorForSlug(fragment.slug) ?? (
                selected ? selectedFragmentColor : unselectedFragmentColor
              )}
              stroke={selected ? selectedFragmentColor : outlineColor}
              strokeWidth={selected ? 1.2 : 0.3}
              onPress={onFragmentPress ? () => onFragmentPress(fragment.slug) : undefined}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});

export const AnatomyV2WebMap = memo(AnatomyV2WebMapBase);
