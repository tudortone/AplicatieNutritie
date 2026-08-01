import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { MuscleBody } from './MuscleBody';
import { normalizeMuscleLoadToIntensity, type MuscleLoadMap } from '@/lib/fitnessEngine';

/**
 * FIX HARTA (Acasa): componenta construia harta direct din cheile brute ale lui
 * `muscleLoad` ("piept", "chest", "lats"...), dar `MuscleBody` cauta dupa MuscleId
 * canonic ("pectorali", "dorsali"...). Nicio cheie nu se potrivea, deci corpul
 * ramanea complet stins chiar si dupa antrenamente salvate.
 *
 * Acum folosim `normalizeMuscleLoadToIntensity`, care trece fiecare cheie prin
 * maparea unica din lib/muscleMapping.ts si aplica scalare logaritmica pe tonaj
 * absolut. Astfel o sesiune usoara nu mai apare rosu-maxim doar pentru ca este
 * singura din zi (normalizarea veche impartea la maximul local).
 */
export default function MuscleHeatmapSVG({ muscleLoad }: { muscleLoad: MuscleLoadMap }) {
  const [side, setSide] = useState<'front' | 'back'>('front');

  const intensityMap = useMemo(
    () => normalizeMuscleLoadToIntensity(muscleLoad),
    [muscleLoad],
  );

  const activeCount = useMemo(
    () => Object.values(intensityMap).filter((v) => (v ?? 0) >= 0.05).length,
    [intensityMap],
  );

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
        style={styles.toggle}
        activeOpacity={0.8}
        accessibilityRole='button'
        accessibilityLabel={side === 'front' ? 'Arată spatele' : 'Arată fața'}
      >
        <RotateCcw size={14} color='#00BFFF' />
        <Text style={styles.toggleText}>{side === 'front' ? 'FAȚĂ' : 'SPATE'}</Text>
      </TouchableOpacity>

      <MuscleBody
        side={side}
        intensity={intensityMap}
        width={280}
        height={340}
      />

      {activeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeCount} mușchi lucrați</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#090C0E',
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
    borderColor: '#00BFFF55',
    backgroundColor: '#00BFFF15',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00BFFF',
  },
  badge: {
    position: 'absolute',
    bottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
