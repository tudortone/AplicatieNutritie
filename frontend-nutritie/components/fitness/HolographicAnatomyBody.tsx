import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BodyMap from './BodyMap';
import { mapToCanonicalMuscleIds } from '../../lib/fitnessEngine';
import type { MuscleId } from './heatColor';
import { Radius, Spacing } from '../../constants/theme';

interface HumanBodyProps {
  activeGroups: string[];
  muschiTinta?: Partial<Record<string, number>>;
  intensityScore: number; // 0 - 100
  accentColor: string;
  secondaryColor: string;
  cardBg: string;
  textPrimary: string;
  rankBadgeColor?: string;
  volumTotalKg?: number;
}

/**
 * Corp Uman Anatomic Proporționat și Hiper-realist (Athletic Bio-Scan 3D)
 * Sistem termic Heatmap clar direct pe mușchi (FĂRĂ BILE):
 * Colorare continuă în funcție de intensitatea de recrutare
 */
export function Holographic3DAnatomyBody({
  activeGroups,
  muschiTinta,
  intensityScore,
  accentColor,
  secondaryColor,
  cardBg,
  textPrimary,
  rankBadgeColor = '#00F0FF',
  volumTotalKg = 0
}: HumanBodyProps) {
  const isSpate = activeGroups.some(g => /spate|dorsali|trapez|romboizi|fesieri|ischiogambieri|femurali|triceps|lombari/i.test(g));
  const isPiept = activeGroups.some(g => /piept|pectorali/i.test(g));
  const isUmeri = activeGroups.some(g => /umeri|deltoid/i.test(g));
  const isBrate = activeGroups.some(g => /brațe|brate|biceps|triceps|brahial/i.test(g));
  const isAbdomen = activeGroups.some(g => /abdomen|core|oblici/i.test(g));
  const isPicioare = activeGroups.some(g => /picioare|cvadriceps|fesieri|gambe|ischiogambieri|femurali/i.test(g));

  const initialSide = useMemo(() => {
    const isBackPrimary = activeGroups.length > 0 && /spate|dorsali|trapez|romboizi|fesieri|ischiogambieri|femurali|triceps|lombari/i.test(activeGroups[0]);
    return isBackPrimary ? 'posterior' : 'anterior';
  }, [activeGroups]);

  const [viewSide, setViewSide] = useState<'anterior' | 'posterior'>(initialSide);

  // FIX: actualizează viewSide când se schimbă exercițiul
  useEffect(() => {
    setViewSide(initialSide);
  }, [initialSide]);

  // Culorile din sistemul termic Heatmap conform heatColor.ts (Secțiunea 3.1):
  const COLOR_PRIMARY = '#FF003C';   // 🔴 Roșu maxim (100% Țintă Principală)
  const COLOR_SECONDARY = '#FF7B00'; // 🟠 Portocaliu intens (75% Sinergici)
  const COLOR_STAB = '#FACC15';      // 🟡 Galben mediu (40% Stabilizare)
  const COLOR_REST = '#38BDF8';      // 🔵 Albastru (0% Repaus)

  // Determinăm culoarea fiecărei grupe musculare bazat pe ierarhia exercițiului
  const getGroupColor = (groupType: 'piept' | 'umeri' | 'brate' | 'spate' | 'picioare' | 'abdomen') => {
    if (groupType === 'piept' && isPiept) return COLOR_PRIMARY;
    if (groupType === 'spate' && isSpate) return COLOR_PRIMARY;
    if (groupType === 'picioare' && isPicioare) return COLOR_PRIMARY;
    if (groupType === 'umeri' && isUmeri) return isPiept || isSpate ? COLOR_SECONDARY : COLOR_PRIMARY;
    if (groupType === 'brate' && isBrate) return isPiept || isSpate ? COLOR_SECONDARY : COLOR_PRIMARY;
    if (groupType === 'abdomen' && isAbdomen) return COLOR_STAB;
    return COLOR_REST;
  };

  const pieptColor = getGroupColor('piept');
  const umeriColor = getGroupColor('umeri');
  const brateColor = getGroupColor('brate');
  const spateColor = getGroupColor('spate');
  const picioareColor = getGroupColor('picioare');
  const absColor = getGroupColor('abdomen');

  const mainActiveColor = isPiept || isSpate || isPicioare ? COLOR_PRIMARY : isUmeri || isBrate ? COLOR_SECONDARY : COLOR_STAB;

  const intensityMap = useMemo(() => {
    const out: Partial<Record<MuscleId, number>> = {};
    if (muschiTinta && Object.keys(muschiTinta).length > 0) {
      for (const [k, pct] of Object.entries(muschiTinta)) {
        const canonicals = mapToCanonicalMuscleIds(k);
        for (const { id, weight } of canonicals) {
          out[id] = Math.max(out[id] ?? 0, (Number(pct) / 100) * weight);
        }
      }
    } else {
      activeGroups.forEach((g, idx) => {
        const factor = idx === 0 ? 1.0 : idx === 1 ? 0.75 : 0.5;
        const canonicals = mapToCanonicalMuscleIds(g);
        for (const { id, weight } of canonicals) {
          out[id] = Math.max(out[id] ?? 0, factor * weight);
        }
      });
    }
    return out;
  }, [muschiTinta, activeGroups]);

  return (
    <View style={[bodyStyles.container, { borderColor: mainActiveColor + '55' }]}>
      {/* Header Anatomic Pro */}
      <View style={bodyStyles.headerRow}>
        <View style={bodyStyles.titleBox}>
          <View style={bodyStyles.hudBadgeRow}>
            <View style={[bodyStyles.hudDot, { backgroundColor: mainActiveColor }]} />
            <Text style={[bodyStyles.hudLabel, { color: mainActiveColor }]}>SCANARE BIO-TERMICĂ • RECUPERARE & INTENSITATE</Text>
          </View>
          <Text style={[bodyStyles.titleText, { color: textPrimary }]}>Anatomie Realistă & Heatmap Muscular</Text>
          <Text style={[bodyStyles.subText, { color: mainActiveColor }]} numberOfLines={2}>
            {activeGroups.join(' • ')} ({intensityScore}% intensitate)
          </Text>
        </View>

        <View style={[bodyStyles.switchPill, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            onPress={() => setViewSide('anterior')}
            style={[bodyStyles.switchBtn, viewSide === 'anterior' && { backgroundColor: mainActiveColor }]}
          >
            <Text style={[bodyStyles.switchText, { color: viewSide === 'anterior' ? '#FFFFFF' : textPrimary }]}>FAȚĂ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewSide('posterior')}
            style={[bodyStyles.switchBtn, viewSide === 'posterior' && { backgroundColor: mainActiveColor }]}
          >
            <Text style={[bodyStyles.switchText, { color: viewSide === 'posterior' ? '#FFFFFF' : textPrimary }]}>SPATE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Desenul anatomic real (assets/anatomy) cu colorare directă pe mușchi (BodyMap) */}
      <View style={[bodyStyles.svgWrap, { position: 'relative', height: 350, justifyContent: 'center', alignItems: 'center' }]}>
        {/* Fundal aură scanare biomecanică */}
        <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: mainActiveColor, opacity: 0.12 }} />

        {/* Strat SVG cu Heatmap Muscular Continuu */}
        <BodyMap
          view={viewSide === 'anterior' ? 'front' : 'back'}
          intensity={intensityMap}
          width={184}
        />
      </View>

      {/* LEGENDA COLORISTICĂ HEATMAP INTERACTIVĂ */}
      <View style={bodyStyles.legendCard}>
        <Text style={[bodyStyles.legendTitle, { color: textPrimary }]}>Culoare & Intensitate Recrutare:</Text>
        <View style={bodyStyles.legendGrid}>
          <View style={bodyStyles.legendItem}>
            <View style={[bodyStyles.legendDot, { backgroundColor: COLOR_PRIMARY }]} />
            <Text style={[bodyStyles.legendText, { color: COLOR_PRIMARY }]}>🔴 100% Țintă Principală</Text>
          </View>
          <View style={bodyStyles.legendItem}>
            <View style={[bodyStyles.legendDot, { backgroundColor: COLOR_SECONDARY }]} />
            <Text style={[bodyStyles.legendText, { color: COLOR_SECONDARY }]}>🟠 75% Mușchi Sinergici</Text>
          </View>
          <View style={bodyStyles.legendItem}>
            <View style={[bodyStyles.legendDot, { backgroundColor: COLOR_STAB }]} />
            <Text style={[bodyStyles.legendText, { color: COLOR_STAB }]}>🟡 40% Stabilizare / Core</Text>
          </View>
          <View style={bodyStyles.legendItem}>
            <View style={[bodyStyles.legendDot, { backgroundColor: COLOR_REST }]} />
            <Text style={[bodyStyles.legendText, { color: COLOR_REST }]}>🔵 0% Mușchi în Repaus</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const bodyStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: 'rgba(5, 15, 28, 0.75)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  hudBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  hudDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  hudLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  titleBox: {
    flex: 1,
    paddingRight: 8,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '800',
  },
  subText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  switchPill: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  switchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  switchText: {
    fontSize: 11,
    fontWeight: '900',
  },
  svgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  legendCard: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '45%',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
