/**
 * MuscleMap.tsx — RENDERER UNIC pentru harta musculara.
 *
 * Inlocuieste cele 5 renderere paralele care existau inainte:
 *   BodyHeatmap.tsx (18,6 KB) — renderer #1
 *   MuscleHeatmap.tsx         — renderer #2 (wrapper)
 *   MuscleHeatmapSVG.tsx      — renderer #3
 *   MuscleHeatmap3D.tsx       — renderer #4 (aducea `three` + `@react-three/*`)
 *   MuscleBody.tsx            — renderer #5 (desenul propriu-zis)
 *
 * Fiecare avea propria interpretare a datelor, propriile culori hardcodate si
 * propriile bug-uri. Acum exista o singura implementare.
 *
 * Lant de date, complet explicit:
 *   date brute -> buildIntensityMap({ tip, valori }) -> MuscleId canonic
 *              -> slot (`muschi:vedere`) -> geometrie -> heatColor()
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { RotateCcw } from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';
import { heatColor, heatOpacity } from './heatColor';
import {
  BODY_VIEWBOX,
  BODY_WIDTH,
  MIRROR_AXIS,
  SILHOUETTE,
  shapesForView,
} from './anatomy/bodyPaths';
import {
  buildIntensityMap,
  countMuschiActivi,
  type IntensityMap,
  type MuscleLoadInput,
} from '../../lib/muscleIntensity';
import {
  muscleLabel,
  parseSlot,
  type BodyView,
  type MuscleId,
} from '../../constants/muscles';

export type MuscleMapProps = {
  /**
   * Datele de incarcare musculara, cu tipul declarat explicit.
   * Ex: `{ tip: 'tonaj', valori: { piept: 4200, spate: 3100 } }`
   */
  load?: MuscleLoadInput | null;
  /** Vedere controlata din exterior. Daca lipseste, componenta o gestioneaza intern. */
  view?: BodyView;
  onViewChange?: (view: BodyView) => void;
  /** Apelat la atingerea unui muschi — pentru detalii sau filtrare de exercitii. */
  onMusclePress?: (id: MuscleId, intensitate: number) => void;
  /** Ascunde butonul de intoarcere fata/spate (cand parintele are propriul control). */
  hideToggle?: boolean;
  /** Ascunde badge-ul cu numarul de muschi lucrati. */
  hideBadge?: boolean;
  height?: number;
};

const MIRROR_TRANSFORM = `translate(${MIRROR_AXIS}, 0) scale(-1, 1)`;

function MuscleMapComponent({
  load,
  view: viewProp,
  onViewChange,
  onMusclePress,
  hideToggle = false,
  hideBadge = false,
  height = 360,
}: MuscleMapProps) {
  const { colors } = useTheme();
  const [viewIntern, setViewIntern] = useState<BodyView>('front');
  const view = viewProp ?? viewIntern;

  const schimbaVedere = useCallback(() => {
    const urmatoare: BodyView = view === 'front' ? 'back' : 'front';
    if (onViewChange) onViewChange(urmatoare);
    else setViewIntern(urmatoare);
  }, [view, onViewChange]);

  // Un singur loc unde datele brute devin intensitati. Fara ghicit de format.
  const intensitati: IntensityMap = useMemo(() => buildIntensityMap(load), [load]);

  const forme = useMemo(() => shapesForView(view), [view]);
  const activi = useMemo(() => countMuschiActivi(intensitati), [intensitati]);

  const width = height * (BODY_WIDTH / 420);

  return (
    <View style={[styles.wrap, { height, backgroundColor: colors.card }]}>
      {!hideToggle && (
        <Pressable
          onPress={schimbaVedere}
          style={({ pressed }) => [
            styles.toggle,
            {
              borderColor: `${colors.accent}55`,
              backgroundColor: `${colors.accent}15`,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityRole='button'
          accessibilityLabel={
            view === 'front' ? 'Arat\u0103 spatele corpului' : 'Arat\u0103 fa\u021ba corpului'
          }
        >
          <RotateCcw size={14} color={colors.accent} />
          <Text style={[styles.toggleText, { color: colors.accent }]}>
            {view === 'front' ? 'FA\u021a\u0102' : 'SPATE'}
          </Text>
        </Pressable>
      )}

      <Svg width={width} height={height} viewBox={BODY_VIEWBOX}>
        {/* Silueta: desenata prima, sub muschi. Jumatate + oglindire. */}
        <Path d={SILHOUETTE[view]} fill={colors.border} opacity={0.45} />
        <G transform={MIRROR_TRANSFORM}>
          <Path d={SILHOUETTE[view]} fill={colors.border} opacity={0.45} />
        </G>

        {/* Muschii, in ordinea `z` stabilita in bodyPaths.ts. */}
        {forme.map((forma) => {
          const { id } = parseSlot(forma.slot);
          const intensitate = intensitati[id] ?? 0;
          const fill = heatColor(intensitate);
          const opacity = heatOpacity(intensitate);
          const apasa = onMusclePress
            ? () => onMusclePress(id, intensitate)
            : undefined;

          return (
            <React.Fragment key={forma.slot}>
              {forma.d.map((d, i) => (
                <Path
                  key={`${forma.slot}-${i}`}
                  d={d}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={colors.background}
                  strokeWidth={0.8}
                  onPress={apasa}
                />
              ))}

              {/* Copia oglindita pentru muschii pereche — simetrie garantata. */}
              {forma.mirrored && (
                <G transform={MIRROR_TRANSFORM}>
                  {forma.d.map((d, i) => (
                    <Path
                      key={`${forma.slot}-m-${i}`}
                      d={d}
                      fill={fill}
                      fillOpacity={opacity}
                      stroke={colors.background}
                      strokeWidth={0.8}
                      onPress={apasa}
                    />
                  ))}
                </G>
              )}
            </React.Fragment>
          );
        })}
      </Svg>

      {!hideBadge && (
        <View style={styles.badge}>
          <Text style={[styles.badgeText, { color: colors.textMuted }]}>
            {activi > 0
              ? `${activi} mu\u0219chi lucra\u021bi`
              : 'Niciun antrenament \u00eenregistrat'}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Legenda gradientului termic. Optionala, de folosit sub harta. */
export function MuscleMapLegend() {
  const { colors } = useTheme();
  const trepte = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View style={styles.legend}>
      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>U\u0219or</Text>
      <View style={styles.legendBar}>
        {trepte.map((t) => (
          <View key={t} style={[styles.legendStep, { backgroundColor: heatColor(t) }]} />
        ))}
      </View>
      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>Intens</Text>
    </View>
  );
}

export { muscleLabel };

/**
 * `memo` este important: harta se redeseneaza altfel la fiecare re-render al
 * ecranului parinte, desi datele nu se schimba. Comparam doar referinta datelor
 * si vederea.
 */
export const MuscleMap = React.memo(MuscleMapComponent);
export default MuscleMap;

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  toggle: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    bottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  legendBar: {
    flex: 1,
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  legendStep: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});
