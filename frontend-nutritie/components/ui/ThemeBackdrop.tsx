import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { Device, ThemeColors, ThemeDecor, ThemeName, getThemeColors, getThemeDecor } from '../../constants/theme';

/**
 * Fundal decorativ desenat custom pentru fiecare temă.
 * - midnight -> orbite/orbs geometrice
 * - ocean    -> valuri stratificate
 * - sunset   -> raze + arc de soare
 *
 * Totul e desenat cu SVG, cu opacități mici, ca efectele să fie subtile
 * și să nu concureze cu conținutul. Se folosește global, pe toate ecranele.
 */
interface ThemeBackdropProps {
  style?: ViewStyle;
  /** multiplicator de intensitate (1 = valoarea temei) */
  intensity?: number;
}

export default function ThemeBackdrop({ style, intensity = 1 }: ThemeBackdropProps) {
  const { colors, decor } = useTheme();
  const w = Device.width;
  const h = Device.height;
  const o = Math.max(0, Math.min(1, decor.backdropOpacity * intensity));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <RadialGradient id="tb-accent" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity={o} />
            <Stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="tb-secondary" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.accentSecondary} stopOpacity={o * 0.85} />
            <Stop offset="100%" stopColor={colors.accentSecondary} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* halou difuz, comun tuturor temelor (foarte discret) */}
        <Circle cx={w * 0.12} cy={h * 0.08} r={w * 0.5} fill="url(#tb-accent)" />
        <Circle cx={w * 0.95} cy={h * 0.78} r={w * 0.55} fill="url(#tb-secondary)" />

        {decor.shape === 'orbs' && (
          <G opacity={o * 1.6}>
            <Circle cx={w * 0.78} cy={h * 0.16} r={w * 0.24} stroke={colors.accent} strokeWidth={decor.strokeWidth} fill="none" />
            <Circle cx={w * 0.78} cy={h * 0.16} r={w * 0.15} stroke={colors.accentTertiary} strokeWidth={decor.strokeWidth} fill="none" />
            <Circle cx={w * 0.2} cy={h * 0.62} r={w * 0.34} stroke={colors.accentSecondary} strokeWidth={decor.strokeWidth} fill="none" />
            <Circle cx={w * 0.78} cy={h * 0.16} r={3} fill={colors.accent} />
          </G>
        )}

        {decor.shape === 'waves' && (
          <G opacity={o * 1.7}>
            <Path
              d={`M0 ${h * 0.30} C ${w * 0.3} ${h * 0.24}, ${w * 0.62} ${h * 0.38}, ${w} ${h * 0.28}`}
              stroke={colors.accent}
              strokeWidth={decor.strokeWidth}
              fill="none"
            />
            <Path
              d={`M0 ${h * 0.36} C ${w * 0.28} ${h * 0.30}, ${w * 0.66} ${h * 0.45}, ${w} ${h * 0.34}`}
              stroke={colors.accentTertiary}
              strokeWidth={decor.strokeWidth}
              fill="none"
            />
            <Path
              d={`M0 ${h * 0.80} C ${w * 0.32} ${h * 0.72}, ${w * 0.60} ${h * 0.90}, ${w} ${h * 0.80}`}
              stroke={colors.accentSecondary}
              strokeWidth={decor.strokeWidth}
              fill="none"
            />
          </G>
        )}

        {decor.shape === 'rays' && (
          <G opacity={o * 1.5}>
            <Ellipse cx={w * 0.5} cy={h * 0.14} rx={w * 0.34} ry={w * 0.34} stroke={colors.accent} strokeWidth={decor.strokeWidth} fill="none" />
            {[0.18, 0.34, 0.5, 0.66, 0.82].map((p, i) => (
              <Path
                key={i}
                d={`M${w * p} ${h * 0.14} L ${w * (p * 1.35 - 0.1)} ${h * 0.62}`}
                stroke={i % 2 === 0 ? colors.accentTertiary : colors.accentSecondary}
                strokeWidth={decor.strokeWidth}
                fill="none"
              />
            ))}
          </G>
        )}
      </Svg>
    </View>
  );
}

/**
 * Miniatură a figurii custom, folosită în selectorul de teme din Profil.
 */
export function ThemeShapePreview({ theme, size = 46 }: { theme: ThemeName; size?: number }) {
  const c: ThemeColors = getThemeColors(theme);
  const d: ThemeDecor = getThemeDecor(theme);
  const s = size;

  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      {d.shape === 'orbs' && (
        <G>
          <Circle cx="50" cy="50" r="34" stroke={c.accent} strokeWidth={4} fill="none" opacity={0.85} />
          <Circle cx="50" cy="50" r="20" stroke={c.accentSecondary} strokeWidth={4} fill="none" opacity={0.85} />
          <Circle cx="50" cy="16" r="6" fill={c.accentTertiary} />
        </G>
      )}
      {d.shape === 'waves' && (
        <G>
          <Path d="M6 40 C 26 26, 54 56, 94 40" stroke={c.accent} strokeWidth={5} fill="none" />
          <Path d="M6 58 C 26 44, 54 74, 94 58" stroke={c.accentTertiary} strokeWidth={5} fill="none" opacity={0.8} />
          <Path d="M6 76 C 26 62, 54 92, 94 76" stroke={c.accentSecondary} strokeWidth={5} fill="none" opacity={0.6} />
        </G>
      )}
      {d.shape === 'rays' && (
        <G>
          <Circle cx="50" cy="46" r="18" fill={c.accent} opacity={0.9} />
          {[0, 45, 90, 135].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 50 + Math.cos(rad) * 30;
            const y1 = 46 + Math.sin(rad) * 30;
            const x2 = 50 - Math.cos(rad) * 30;
            const y2 = 46 - Math.sin(rad) * 30;
            return (
              <Path
                key={i}
                d={`M${x1} ${y1} L ${x2} ${y2}`}
                stroke={i % 2 === 0 ? c.accentSecondary : c.accentTertiary}
                strokeWidth={4}
                opacity={0.7}
              />
            );
          })}
        </G>
      )}
    </Svg>
  );
}
