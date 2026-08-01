import React, { useMemo } from 'react';
import Svg, { Path, G } from 'react-native-svg';
import { heatColor, heatOpacity, type MuscleId } from './heatColor';
import { useTheme } from '../../context/ThemeContext';

/**
 * PERF FIX: `anatomyPaths.generated.ts` are ~574 KB de path-uri SVG.
 * Importat static, modulul era parsat si evaluat la pornirea aplicatiei,
 * chiar daca utilizatorul nu deschidea niciodata harta musculara.
 * Acum se incarca lazy, prin require(), la prima randare a componentei.
 */
type AnatomyPath = { d: string; role: 'fill' | 'outline'; muscleId?: MuscleId };
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

  const fills = useMemo(() => paths.filter((p) => p.role === 'fill'), [paths]);
  const outlines = useMemo(() => paths.filter((p) => p.role === 'outline'), [paths]);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}>
      {/* Strat fill — mușchii colorați după intensitate */}
      <G>
        {fills.map((p, i) => {
          if (!/^[Mm]/.test(p.d)) return null;
          // La 0 intensitate: muscleBase (închis, siluetă), NU roșu
          const fill = p.muscleId
            ? heatColor(intensity?.[p.muscleId])
            : colors.muscleBase;
          const opacity = p.muscleId
            ? heatOpacity(intensity?.[p.muscleId])
            : 0.9;
          return (
            <Path
              key={`f${i}`}
              d={p.d}
              fill={fill}
              fillOpacity={opacity}
              onPress={
                p.muscleId && onMusclePress
                  ? () => onMusclePress(p.muscleId!)
                  : undefined
              }
            />
          );
        })}
      </G>
      {/* Strat outline — contururi și umbre, mereu vizibile */}
      <G pointerEvents="none">
        {outlines.map((p, i) => {
          if (!/^[Mm]/.test(p.d)) return null;
          return (
            <Path
              key={`o${i}`}
              d={p.d}
              fill={colors.muscleOutline}
              fillOpacity={0.85}
            />
          );
        })}
      </G>
    </Svg>
  );
}

export default React.memo(MuscleBody);
