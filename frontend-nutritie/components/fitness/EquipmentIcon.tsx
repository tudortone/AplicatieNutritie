/**
 * EquipmentIcon.tsx — Badge și pictogramă vizuală pentru echipamente de fitness.
 * Conform specificației NutriAI v7 (Secțiunea 6 / #63, #64, #65).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dumbbell, Activity, ShieldAlert, Zap, Layers, CircleDot } from 'lucide-react-native';

export type EquipmentType =
  | 'gantere'
  | 'haltera'
  | 'bancuta'
  | 'cabluri'
  | 'aparat'
  | 'greutate_corp'
  | 'bodyweight'
  | 'kettlebell'
  | 'cardio'
  | 'altele'
  | string;

export interface EquipmentIconProps {
  equipment?: EquipmentType;
  size?: number;
  showLabel?: boolean;
  accentColor?: string;
}

export function EquipmentIcon({
  equipment = 'altele',
  size = 18,
  showLabel = true,
  accentColor = '#38BDF8',
}: EquipmentIconProps) {
  const norm = equipment.toLowerCase().trim();

  let label = 'Altele';
  let IconComp = Layers;
  let badgeBg = 'rgba(56, 189, 248, 0.12)';
  let badgeBorder = 'rgba(56, 189, 248, 0.3)';
  let color = accentColor;

  if (norm.includes('gantere') || norm.includes('dumbbell')) {
    label = 'Gantere';
    IconComp = Dumbbell;
    color = '#A855F7';
    badgeBg = 'rgba(168, 85, 247, 0.12)';
    badgeBorder = 'rgba(168, 85, 247, 0.3)';
  } else if (norm.includes('haltera') || norm.includes('barbell')) {
    label = 'Halteră';
    IconComp = Dumbbell;
    color = '#EC4899';
    badgeBg = 'rgba(236, 72, 153, 0.12)';
    badgeBorder = 'rgba(236, 72, 153, 0.3)';
  } else if (norm.includes('bancuta') || norm.includes('bancă') || norm.includes('bench')) {
    label = 'Băncuță';
    IconComp = Layers;
    color = '#3B82F6';
    badgeBg = 'rgba(59, 130, 246, 0.12)';
    badgeBorder = 'rgba(59, 130, 246, 0.3)';
  } else if (norm.includes('cabluri') || norm.includes('cable')) {
    label = 'Cabluri';
    IconComp = Zap;
    color = '#EAB308';
    badgeBg = 'rgba(234, 179, 8, 0.12)';
    badgeBorder = 'rgba(234, 179, 8, 0.3)';
  } else if (norm.includes('aparat') || norm.includes('machine')) {
    label = 'Aparat';
    IconComp = ShieldAlert;
    color = '#14B8A6';
    badgeBg = 'rgba(20, 184, 166, 0.12)';
    badgeBorder = 'rgba(20, 184, 166, 0.3)';
  } else if (norm.includes('greutate') || norm.includes('body') || norm.includes('calisthenics')) {
    label = 'Corp';
    IconComp = Activity;
    color = '#10B981';
    badgeBg = 'rgba(16, 185, 129, 0.12)';
    badgeBorder = 'rgba(16, 185, 129, 0.3)';
  } else if (norm.includes('kettlebell')) {
    label = 'Kettlebell';
    IconComp = CircleDot;
    color = '#F97316';
    badgeBg = 'rgba(249, 115, 22, 0.12)';
    badgeBorder = 'rgba(249, 115, 22, 0.3)';
  }

  return (
    <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
      <IconComp size={size} color={color} />
      {showLabel && <Text style={[styles.label, { color }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
  },
});
