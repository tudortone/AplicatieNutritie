/**
 * EquipmentIcon.tsx — Badge și pictogramă vizuală pentru echipamente de fitness.
 * Conform specificației NutriAI v7 (Secțiunea 6 / #63, #64, #65).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dumbbell, Activity, ShieldAlert, Zap, Layers, CircleDot } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { getLocalizedEquipmentLabel, normalizeSearchText } from '../../lib/sportI18n';

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
  const { t } = useTranslation();
  const norm = normalizeSearchText(equipment);

  let label = getLocalizedEquipmentLabel(equipment, t);
  let IconComp = Layers;
  let badgeBg = 'rgba(56, 189, 248, 0.12)';
  let badgeBorder = 'rgba(56, 189, 248, 0.3)';
  let color = accentColor;

  if (norm.includes('gantere') || norm.includes('dumbbell') || norm.includes('haltere') || norm.includes('kurzhantel')) {
    IconComp = Dumbbell;
    color = '#C084FC';
    badgeBg = 'rgba(192, 132, 252, 0.12)';
    badgeBorder = 'rgba(192, 132, 252, 0.3)';
  } else if (norm.includes('haltera') || norm.includes('barbell') || norm.includes('bara') || norm.includes('barre') || norm.includes('langhantel')) {
    IconComp = Dumbbell;
    color = '#F472B6';
    badgeBg = 'rgba(244, 114, 182, 0.12)';
    badgeBorder = 'rgba(244, 114, 182, 0.3)';
  } else if (norm.includes('bancuta') || norm.includes('banca') || norm.includes('bench') || norm.includes('banc') || norm.includes('bank')) {
    IconComp = Layers;
    color = '#60A5FA';
    badgeBg = 'rgba(96, 165, 250, 0.12)';
    badgeBorder = 'rgba(96, 165, 250, 0.3)';
  } else if (norm.includes('cabluri') || norm.includes('cable') || norm.includes('poulie') || norm.includes('kabel')) {
    IconComp = Zap;
    color = '#FACC15';
    badgeBg = 'rgba(250, 204, 21, 0.12)';
    badgeBorder = 'rgba(250, 204, 21, 0.3)';
  } else if (norm.includes('aparat') || norm.includes('machine') || norm.includes('maschine')) {
    IconComp = ShieldAlert;
    color = '#2DD4BF';
    badgeBg = 'rgba(45, 212, 191, 0.12)';
    badgeBorder = 'rgba(45, 212, 191, 0.3)';
  } else if (norm.includes('greutate') || norm.includes('body') || norm.includes('calisthenics') || norm.includes('eigen')) {
    IconComp = Activity;
    color = '#34D399';
    badgeBg = 'rgba(52, 211, 153, 0.12)';
    badgeBorder = 'rgba(52, 211, 153, 0.3)';
  } else if (norm.includes('kettlebell')) {
    IconComp = CircleDot;
    color = '#FB923C';
    badgeBg = 'rgba(251, 146, 60, 0.12)';
    badgeBorder = 'rgba(251, 146, 60, 0.3)';
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
