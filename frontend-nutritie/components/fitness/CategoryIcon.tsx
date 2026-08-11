import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'bench' | 'cardio' | string;
export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'forearms' | string;

interface Props {
  equipment?: Equipment;
  muscleGroup?: MuscleGroup;
  size?: number;
  showLabel?: boolean;
  label?: string;
}

const MUSCLE_THEME: Record<string, { color?: string; label: string }> = {
  chest: { color: '#3B82F6', label: 'Piept' },
  piept: { color: '#3B82F6', label: 'Piept' },
  back: { color: '#EF4444', label: 'Spate' },
  spate: { color: '#EF4444', label: 'Spate' },
  shoulders: { color: '#F59E0B', label: 'Umeri' },
  umeri: { color: '#F59E0B', label: 'Umeri' },
  biceps: { color: '#8B5CF6', label: 'Biceps' },
  triceps: { color: '#A855F7', label: 'Triceps' },
  quads: { color: '#10B981', label: 'Cvadriceps' },
  cvadriceps: { color: '#10B981', label: 'Cvadriceps' },
  hamstrings: { color: '#059669', label: 'Femurali' },
  femurali: { color: '#059669', label: 'Femurali' },
  glutes: { color: '#EC4899', label: 'Fesieri' },
  fesieri: { color: '#EC4899', label: 'Fesieri' },
  calves: { color: '#14B8A6', label: 'Gambe' },
  gambe: { color: '#14B8A6', label: 'Gambe' },
  core: { color: '#EAB308', label: 'Abdomen' },
  abdomen: { color: '#EAB308', label: 'Abdomen' },
  forearms: { color: '#6366F1', label: 'Antebrațe' },
  antebrațe: { color: '#6366F1', label: 'Antebrațe' },
  // cardio: culoarea se setează din tema activă (colors.danger) în componentă.
  cardio: { label: 'Cardio' },
};

function EquipmentPath({ equipment = 'bodyweight', strokeColor }: { equipment: Equipment; strokeColor: string }) {
  const common = {
    stroke: strokeColor,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const norm = equipment.toLowerCase().trim();

  if (norm.includes('haltera') || norm.includes('barbell') || norm.includes('bară')) {
    return (
      <>
        <Path d="M2 12h20" {...common} />
        <Rect x="4" y="8" width="2" height="8" rx="1" stroke={strokeColor} strokeWidth={1.75} fill="none" />
        <Rect x="18" y="8" width="2" height="8" rx="1" stroke={strokeColor} strokeWidth={1.75} fill="none" />
        <Path d="M7 9.5v5M17 9.5v5" {...common} />
      </>
    );
  }
  if (norm.includes('gantere') || norm.includes('dumbbell')) {
    return (
      <>
        <Path d="M6 12h12" {...common} />
        <Rect x="4" y="8" width="3" height="8" rx="1.2" stroke={strokeColor} strokeWidth={1.75} fill="none" />
        <Rect x="17" y="8" width="3" height="8" rx="1.2" stroke={strokeColor} strokeWidth={1.75} fill="none" />
      </>
    );
  }
  if (norm.includes('cabluri') || norm.includes('cable')) {
    return (
      <>
        <Circle cx="12" cy="4.5" r="2.5" {...common} />
        <Path d="M12 7v5" {...common} />
        <Path d="M8 17l4-5 4 5" {...common} />
        <Path d="M7 17h10" {...common} />
      </>
    );
  }
  if (norm.includes('aparat') || norm.includes('machine')) {
    return (
      <>
        <Rect x="5" y="4" width="14" height="16" rx="3" {...common} />
        <Path d="M8 10h8M12 10v6M9 16h6" {...common} />
      </>
    );
  }
  if (norm.includes('kettlebell')) {
    return (
      <>
        <Path d="M9 7a3 3 0 0 1 6 0v2H9V7Z" {...common} />
        <Circle cx="12" cy="14" r="5.5" {...common} />
      </>
    );
  }
  if (norm.includes('bancuta') || norm.includes('bancă') || norm.includes('bench')) {
    return (
      <>
        <Path d="M4 14l16-6" {...common} strokeWidth={2} />
        <Path d="M6 14v5M18 8v11" {...common} />
        <Path d="M4 19h4M16 19h4" {...common} />
      </>
    );
  }
  if (norm.includes('cardio')) {
    return (
      <>
        <Path d="M3 12h4l2.5-6 4 12 2.5-6H21" {...common} strokeWidth={2} />
      </>
    );
  }
  // Bodyweight / Default minimalist human figure
  return (
    <>
      <Circle cx="12" cy="6" r="2.2" {...common} />
      <Path d="M12 8.5v6M8.5 10.5h7M9.5 14.5l-2 5.5M14.5 14.5l2 5.5" {...common} />
    </>
  );
}

export default function CategoryIcon({
  equipment = 'bodyweight',
  muscleGroup = 'core',
  size = 24,
  showLabel = false,
  label,
}: Props) {
  const { colors } = useTheme();
  const normMuscle = (muscleGroup || 'core').toLowerCase().trim();
  const baseTheme = MUSCLE_THEME[normMuscle] ?? MUSCLE_THEME.core;
  // Cardio: roșul se ia din tema activă (colors.danger), nu e fix în hartă.
  const isCardio = normMuscle === 'cardio';
  const strokeColor = isCardio ? colors.danger : (baseTheme.color ?? colors.danger);
  const displayLabel = label || baseTheme.label;

  if (showLabel) {
    return (
      <View style={[styles.pillWrap, { borderColor: `${strokeColor}44`, backgroundColor: `${strokeColor}14` }]}>
        <View style={[styles.iconBox, { width: size, height: size }]}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <EquipmentPath equipment={equipment} strokeColor={strokeColor} />
          </Svg>
        </View>
        <Text style={[styles.pillText, { color: strokeColor }]}>{displayLabel}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.iconOnlyWrap,
        {
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          borderColor: `${strokeColor}44`,
          backgroundColor: `${strokeColor}12`,
        },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <EquipmentPath equipment={equipment} strokeColor={strokeColor} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  iconOnlyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
  },
  pillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.2,
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
