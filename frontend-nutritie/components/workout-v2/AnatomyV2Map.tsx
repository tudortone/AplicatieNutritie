import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BodySilhouette,
  type BodySlug,
  type GroupLabelOverrides,
} from 'react-native-body-parts-anatomy';

import type { AnatomyV2View, V2MuscleId } from '../../constants/workout-v2/muscles';
import { useTheme } from '../../context/ThemeContext';
import {
  type AnatomyV2DisplayMode,
  type AnatomyV2DisplayState,
} from '../../lib/workout-v2/anatomyState';
import {
  resolveSourceAnatomyV2State,
  selectionTargetForSourceSlug,
  sourceFragmentsForCanonicalMuscle,
} from './anatomyV2SourceAdapter';
import { AnatomyV2WebMap } from './AnatomyV2WebMap';

export interface AnatomyV2MapProps {
  mode: AnatomyV2DisplayMode;
  initialView?: AnatomyV2View;
  selectedMuscle?: V2MuscleId | null;
  onSelectMuscle?: (muscleId: V2MuscleId) => void;
  width?: number;
}

function visualFor(
  state: AnatomyV2DisplayState,
  slug: string,
  colors: ReturnType<typeof useTheme>['colors'],
): { fill: string; opacity: number } {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  const mod = (hash % 5 - 2) * 0.015;

  switch (state) {
    case 'PRIMARY':
      return { fill: colors.accent, opacity: Math.min(1, Math.max(0.92, 0.96 + mod)) };
    case 'SECONDARY':
      return { fill: colors.accentTertiary, opacity: Math.min(1, Math.max(0.80, 0.84 + mod)) };
    case 'STABILIZER':
      return { fill: colors.warning, opacity: Math.min(1, Math.max(0.68, 0.72 + mod)) };
    case 'LEVEL_1':
      return { fill: '#0284C7', opacity: Math.min(1, Math.max(0.40, 0.44 + mod)) };
    case 'LEVEL_2':
      return { fill: colors.accentTertiary, opacity: Math.min(1, Math.max(0.64, 0.68 + mod)) };
    case 'LEVEL_3':
      return { fill: '#A3E635', opacity: Math.min(1, Math.max(0.74, 0.78 + mod)) };
    case 'LEVEL_4':
      return { fill: colors.accent, opacity: Math.min(1, Math.max(0.85, 0.88 + mod)) };
    case 'LEVEL_5':
      return { fill: colors.accent, opacity: 1.0 };
    case 'NO_DATA':
    case 'NEUTRAL':
    default: {
      const isUnmapped = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles'].some((u) => slug.startsWith(u));
      if (isUnmapped) {
        return { fill: '#141820', opacity: 0.85 };
      }
      const tones = ['#1C222B', '#202732', '#242D38'];
      const fill = tones[hash % tones.length];
      return { fill, opacity: 0.88 };
    }
  }
}

function colorWithOpacity(color: string, opacity: number): string {
  const normalized = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
      .toString(16)
      .padStart(2, '0');
    return `${normalized}${alpha}`;
  }
  return normalized;
}

function AnatomyV2MapBase({
  mode,
  initialView = 'front',
  selectedMuscle = null,
  onSelectMuscle,
  width = 220,
}: AnatomyV2MapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [view, setView] = useState<AnatomyV2View>(initialView);
  const selectedSlugs = useMemo(
    () => sourceFragmentsForCanonicalMuscle(selectedMuscle, view),
    [selectedMuscle, view],
  );
  const labels = useMemo<GroupLabelOverrides>(() => ({
    chest: t('workoutV2.muscles.chest'),
    deltoids: t(`workoutV2.muscles.${view === 'front' ? 'front_delts' : 'rear_delts'}`),
    biceps: t('workoutV2.muscles.biceps'),
    triceps: t('workoutV2.muscles.triceps'),
    forearm: t('workoutV2.muscles.forearms'),
    abs: t('workoutV2.muscles.abs'),
    obliques: t('workoutV2.muscles.obliques'),
    trapezius: t('workoutV2.muscles.traps'),
    'upper-back': t('workoutV2.muscles.lats'),
    'lower-back': t('workoutV2.muscles.lower_back'),
    gluteal: t('workoutV2.muscles.glutes'),
    quadriceps: t('workoutV2.muscles.quads'),
    hamstring: t('workoutV2.muscles.hamstrings'),
    calves: t('workoutV2.muscles.calves'),
    adductors: t('workoutV2.muscles.adductors'),
  }), [t, view]);
  const colorForSlug = useCallback((slug: BodySlug) => {
    const visual = visualFor(resolveSourceAnatomyV2State(mode, slug, view), slug, colors);
    return colorWithOpacity(visual.fill, visual.opacity);
  }, [colors, mode, view]);
  const handleFragmentPress = useCallback((slug: string) => {
    const muscleId = selectionTargetForSourceSlug(slug, view);
    if (muscleId) onSelectMuscle?.(muscleId);
  }, [onSelectMuscle, view]);

  return (
    <View style={styles.root} testID="anatomy-v2-map">
      <View style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surfaceBg }]}>
        {(['front', 'back'] as const).map((item) => {
          const selected = view === item;
          return (
            <Pressable
              key={item}
              testID={`anatomy-v2-${item}`}
              accessibilityRole="button"
              accessibilityLabel={t(`workoutV2.anatomy.show${item === 'front' ? 'Front' : 'Back'}`)}
              accessibilityState={{ selected }}
              onPress={() => setView(item)}
              style={[styles.toggleButton, selected && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.toggleText, { color: selected ? colors.background : colors.textSecondary }]}>
                {t(`workoutV2.anatomy.${item}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ width, maxWidth: '100%' }}>
        {Platform.OS === 'web' ? (
          <AnatomyV2WebMap
            view={view}
            selectedSlugs={selectedSlugs}
            onFragmentPress={onSelectMuscle ? handleFragmentPress : undefined}
            colorForSlug={colorForSlug}
            accessibilityLabel={t(`workoutV2.anatomy.${view}Diagram`)}
            outlineColor="rgba(255, 255, 255, 0.16)"
            unselectedFragmentColor="#1C222B"
            selectedFragmentColor={colors.accent}
          />
        ) : (
          <BodySilhouette
            testID={`anatomy-v2-source-${view}`}
            gender="male"
            view={view}
            selectByGroup={false}
            selectedSlugs={selectedSlugs}
            onFragmentPress={onSelectMuscle ? handleFragmentPress : undefined}
            colorForSlug={colorForSlug}
            labels={labels}
            accessibilityMode="groups"
            accessibilityLabel={t(`workoutV2.anatomy.${view}Diagram`)}
            fragmentAccessibilityHint={t('workoutV2.anatomy.selectMuscle')}
            outlineColor="rgba(255, 255, 255, 0.16)"
            unselectedFragmentColor="#1C222B"
            selectedFragmentColor={colors.accent}
            zoomable={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 3, marginBottom: 8 },
  toggleButton: { minWidth: 72, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  toggleText: { fontSize: 13, fontWeight: '700' },
});

export const AnatomyV2Map = React.memo(AnatomyV2MapBase);
