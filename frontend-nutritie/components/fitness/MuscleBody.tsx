import React, { useMemo } from 'react';
import Svg, { Path, G } from 'react-native-svg';
import { heatColor, heatOpacity, type MuscleId } from './heatColor';
import { useTheme } from '../../context/ThemeContext';

/**
 * PERF: `anatomyPaths.generated.ts` are ~560 KB de path-uri SVG.
 * Importat static, modulul era parsat la pornirea aplicatiei, chiar daca
 * utilizatorul nu deschidea niciodata harta. Acum se incarca lazy.
 */
type AnatomyPath = {
  d: string;
  role: 'fill' | 'outline';
  muscleId?: MuscleId | null;
  baseColor?: string;
};
type AnatomyModule = {
  FRONT_PATHS: AnatomyPath[];
  BACK_PATHS: AnatomyPath[];
  VIEWBOX: { width: number; height: number };
};

let anatomyCache: AnatomyModule | null = null;

function getAnatomy(): AnatomyModule {
  if (!anatomyCache) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    anatomyCache = require('./anatomyPaths.generated') as AnatomyModule;
  }
  return anatomyCache;
}

export type MuscleBodyProps = {
  side: 'front' | 'back';
  /** Valori 0..1. Cheile TREBUIE să fie MuscleId canonice. */
  intensity?: Partial<Record<MuscleId, number>>;
  width?: number;
  height?: number;
  onMusclePress?: (id: MuscleId) => void;
};

export function MuscleBody({
  side,
  intensity,
  width = 200,
  height = 300,
  onMusclePress,
}: MuscleBodyProps) {
  const { colors } = useTheme();

  const { paths, viewBox } = useMemo(() => {
    const anatomy = getAnatomy();
    return {
      paths: side === 'front' ? anatomy.FRONT_PATHS : anatomy.BACK_PATHS,
      viewBox: anatomy.VIEWBOX,
    };
  }, [side]);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}>
      {/*
        FIX: anterior componenta desena mai intai TOATE suprafetele de tip `fill`,
        apoi TOATE contururile deasupra lor. In SVG-ul anatomic sunt peste 700 de
        path-uri de tip `outline` (umbre si delimitari interne, aproape negre), iar
        randate la final acopereau muschii colorati - harta parea stinsa chiar si
        cand intensitatile erau corecte.
        Pastram acum ordinea originala din fisier, exact cum a fost desenata.
      */}
      <G>
        {paths.map((p, i) => {
          if (!/^[Mm]/.test(p.d)) return null;

          if (p.role === 'outline') {
            return (
              <Path
                key={`p${i}`}
                d={p.d}
                fill={p.baseColor || colors.muscleOutline}
                fillOpacity={0.85}
                pointerEvents="none"
              />
            );
          }

          const value = p.muscleId ? intensity?.[p.muscleId] : undefined;
          const isActive = typeof value === 'number' && value > 0.001;

          return (
            <Path
              key={`p${i}`}
              d={p.d}
              // Fara date: silueta inchisa a temei, nu rosu si nu negru.
              fill={p.muscleId ? heatColor(value) : colors.muscleBase}
              fillOpacity={p.muscleId ? heatOpacity(value) : 0.9}
              // Muschii activi primesc un contur subtire, ca sa se distinga clar
              // de suprafetele vecine chiar si la intensitati mici.
              stroke={isActive ? heatColor(value) : undefined}
              strokeWidth={isActive ? 0.6 : 0}
              onPress={
                p.muscleId && onMusclePress
                  ? () => onMusclePress(p.muscleId as MuscleId)
                  : undefined
              }
            />
          );
        })}
      </G>
    </Svg>
  );
}

export default React.memo(MuscleBody);
