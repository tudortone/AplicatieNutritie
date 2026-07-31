/**
 * BodyHeatmap — Hartă Anatomică Pro cu Rank F→SS, Animații & Rezumat Cumulativ
 * Imagini pe fundal negru + overlay culori EXACT pe mușchii lucrați
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { RotateCcw, Award, Zap, Flame, X, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { MuscleLoadMap, normalizeMuscleLoadToIntensity, RANKS, getRankByTonage } from '../../lib/fitnessEngine';
import type { TonageRank } from '../../lib/fitnessEngine';
import { MuscleBody } from './MuscleBody';
import type { MuscleId } from './heatColor';

/* ─────────────────────────────────────────────────────────── TYPES */
interface BodyHeatmapProps {
  muscleLoad: MuscleLoadMap;
  totalVolumeKg?: number;
  totalCaloriiArse?: number;
  numarSesiuni?: number;
  totalDurataMin?: number;
  heatLevels?: Record<string, 0 | 1 | 2 | 3 | 4>;
  intensity?: Partial<Record<MuscleId, number>>;
  onMusclePress?: (muscle: string, load: number) => void;
}

// Re-export pentru compatibilitate
export type { TonageRank };
export { RANKS, getRankByTonage };

/* ─────────────────────────────────────────────────────────── HEAT COLORS */
export const HEAT_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'transparent',
  1: '#38BDF8',   // albastru — ușor
  2: '#FACC15',   // galben   — mediu
  3: '#FF7B00',   // portocaliu — intens
  4: '#FF003C',   // roșu neon — maxim
};

const HEAT_OPACITY: Record<0 | 1 | 2 | 3 | 4, number> = {
  0: 0,
  1: 0.55,
  2: 0.65,
  3: 0.75,
  4: 0.85,
};

const MUSCLE_LABELS: Record<string, string> = {
  pectorali: 'Pectorali (Piept)',
  deltoizi: 'Deltoizi (Umeri)',
  'deltoid anterior': 'Deltoid Anterior',
  biceps: 'Biceps Brachii',
  triceps: 'Triceps Brachii',
  abdomeni: 'Abdomen (6-Pack)',
  core: 'Core / Oblici',
  cvadriceps: 'Cvadricepși',
  trapez: 'Trapez',
  dorsali: 'Marele Dorsal',
  fesieri: 'Fesieri',
  ischiogambieri: 'Femurali (Hamstrings)',
  gambe: 'Gambe',
};

/* ─────────────────────────────────────────────────────────── RANK ANIMATION */
function useRankAnimation(rank: TonageRank) {
  const pulse = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation;

    if (rank.animType === 'plasma' || rank.animType === 'lightning') {
      // Rapid flash
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.96, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      );
    } else if (rank.animType === 'fire') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.98, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    } else {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.05, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.00, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    }

    // Glow pulsation (separate)
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.2, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );

    loop.start();
    glowLoop.start();

    return () => { loop.stop(); glowLoop.stop(); };
  }, [rank.tier]);

  return { pulse, glow };
}

/* ─────────────────────────────────────────────────────────── COMPONENT */
export const BodyHeatmap: React.FC<BodyHeatmapProps> = ({
  muscleLoad,
  totalVolumeKg = 0,
  totalCaloriiArse = 0,
  numarSesiuni = 0,
  totalDurataMin = 0,
  heatLevels,
  onMusclePress,
  ...props
}) => {
  const { colors } = useTheme();
  const computedIntensityMap = React.useMemo(() => {
    if (props.intensity && Object.keys(props.intensity).length > 0) return props.intensity;
    return normalizeMuscleLoadToIntensity(muscleLoad);
  }, [props.intensity, muscleLoad]);

  const initialSide = React.useMemo(() => {
    const keys = Object.keys(computedIntensityMap).filter(k => (computedIntensityMap[k as MuscleId] ?? 0) > 0);
    let backSum = 0;
    let frontSum = 0;
    for (const k of keys) {
      const val = computedIntensityMap[k as MuscleId] ?? 0;
      if (/spate|dorsali|trapez|romboizi|fesieri|ischiogambieri|femurali|lombari|lower_back|glutes|deltoid_posterior|delts_rear|infraspinatus/i.test(k)) {
        backSum += val;
      } else {
        frontSum += val;
      }
    }
    return backSum > frontSum ? 'back' : 'front';
  }, [computedIntensityMap]);

  const [viewSide, setViewSide] = useState<'front' | 'back'>(initialSide);
  const [selectedMuscle, setSelectedMuscle] = useState<{ name: string; load: number; level: 0|1|2|3|4 } | null>(null);

  /* Tonaj total */
  const computedTonageKg = React.useMemo(() => {
    if (totalVolumeKg > 0) return totalVolumeKg;
    const sum = Object.values(muscleLoad).reduce((a, v) => a + v, 0);
    return Math.max(Math.round(sum * 3.5), sum > 0 ? 1250 : 0);
  }, [muscleLoad, totalVolumeKg]);

  const rank = getRankByTonage(computedTonageKg);
  const nextRankIdx = Math.min(RANKS.findIndex(r => r.tier === rank.tier) + 1, RANKS.length - 1);
  const nextRank = RANKS[nextRankIdx];
  const progressPct = rank.tier === 'SS' ? 100
    : Math.min(100, Math.max(3, Math.round(((computedTonageKg - rank.minKg) / Math.max(1, nextRank.minKg - rank.minKg)) * 100)));

  const { pulse, glow } = useRankAnimation(rank);

  /* Helpers */
  const getMuscleLevel = useCallback((muscle: string): 0|1|2|3|4 => {
    if (heatLevels?.[muscle] !== undefined) return heatLevels[muscle];
    const load = muscleLoad[muscle] || 0;
    if (load <= 0) return 0;
    if (load > 800) return 4;
    if (load > 400) return 3;
    if (load > 150) return 2;
    return 1;
  }, [muscleLoad, heatLevels]);

  const getColor = useCallback((muscles: string[]): string => {
    let max: 0|1|2|3|4 = 0;
    muscles.forEach(m => { const l = getMuscleLevel(m); if (l > max) max = l; });
    return HEAT_COLORS[max];
  }, [getMuscleLevel]);

  const getOpacity = useCallback((muscles: string[]): number => {
    let max: 0|1|2|3|4 = 0;
    muscles.forEach(m => { const l = getMuscleLevel(m); if (l > max) max = l; });
    return HEAT_OPACITY[max];
  }, [getMuscleLevel]);

  const handlePress = useCallback((key: string) => {
    const load = muscleLoad[key] || 0;
    const level = getMuscleLevel(key);
    setSelectedMuscle({ name: MUSCLE_LABELS[key] || key, load, level });
    onMusclePress?.(key, load);
  }, [muscleLoad, getMuscleLevel, onMusclePress]);

  /* Glow aura opacity interpolation */
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.22] });

  return (
    <View style={styles.rootWrap}>

      {/* ─── REZUMAT CUMULATIV ANTRENAMENT ─── */}
      <View style={[styles.summaryStrip, { borderColor: rank.color + '55', backgroundColor: rank.bgColor }]}>
        <View style={styles.summaryItem}>
          <Flame size={18} color="#FF7B00" />
          <Text style={styles.summaryVal}>{totalCaloriiArse.toLocaleString('ro-RO')}</Text>
          <Text style={styles.summaryLabel}>kcal arse</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: rank.color + '30' }]} />
        <View style={styles.summaryItem}>
          <Zap size={18} color={rank.color} />
          <Text style={styles.summaryVal}>{computedTonageKg.toLocaleString('ro-RO')}</Text>
          <Text style={styles.summaryLabel}>kg mutați</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: rank.color + '30' }]} />
        <View style={styles.summaryItem}>
          <Award size={18} color="#FFD700" />
          <Text style={styles.summaryVal}>{numarSesiuni}</Text>
          <Text style={styles.summaryLabel}>sesiuni</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: rank.color + '30' }]} />
        <View style={styles.summaryItem}>
          <ChevronRight size={18} color={colors.textSecondary} />
          <Text style={styles.summaryVal}>{totalDurataMin}</Text>
          <Text style={styles.summaryLabel}>min total</Text>
        </View>
      </View>

      {/* ─── CORP ANATOMIC + HEATMAP ─── */}
      <View style={[styles.cardWrap, { borderColor: rank.color + '44' }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Animated.View style={[styles.rankDot, { backgroundColor: rank.color, transform: [{ scale: pulse }] }]} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>HARTĂ MUSCULARĂ LIVE</Text>
          </View>
          <TouchableOpacity
            onPress={() => setViewSide(v => v === 'front' ? 'back' : 'front')}
            style={[styles.sideToggle, { backgroundColor: rank.color + '22', borderColor: rank.color + '55' }]}
            activeOpacity={0.8}
          >
            <RotateCcw size={13} color={rank.color} />
            <Text style={[styles.sideToggleText, { color: rank.color }]}>
              {viewSide === 'front' ? 'FAȚĂ' : 'SPATE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Corp Anatomic — fundal NEGRU + overlay SVG pe mușchi */}
        <View style={styles.anatomyWrap}>
          {/* Aura animată de rank */}
          <Animated.View style={[styles.rankAura, { backgroundColor: rank.color, opacity: glowOpacity }]} />

          {/* SVG OVERLAY pe mușchi — MuscleBody, singurul model rândat */}
          <MuscleBody
            side={viewSide}
            intensity={computedIntensityMap}
            width={280}
            height={340}
          />
        </View>

        {/* ─── RANK CARD cu animație ─── */}
        <Animated.View style={[styles.rankCard, { borderColor: rank.color + '55', backgroundColor: rank.bgColor, transform: [{ scale: pulse }] }]}>
          <View style={styles.rankCardTop}>
            {/* Badge Rank */}
            <View style={[styles.rankBadge, { backgroundColor: rank.color + '22', borderColor: rank.color }]}>
              <Text style={[styles.rankTierGlyph, { color: rank.color }]}>{rank.tier}</Text>
            </View>

            <View style={styles.rankInfo}>
              <Text style={[styles.rankTier, { color: rank.color }]}>RANK {rank.tier} • {rank.title.toUpperCase()}</Text>
              <Text style={[styles.rankTonage, { color: colors.textPrimary }]}>
                {computedTonageKg.toLocaleString('ro-RO')} kg tonaj cumulat
              </Text>
            </View>

            {/* Stele */}
            <View style={styles.starsRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Text key={i} style={{ fontSize: 12, opacity: i < rank.stars ? 1 : 0.2 }}>⭐</Text>
              ))}
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: rank.color + '20' }]}>
            <Animated.View
              style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: rank.color }]}
            />
          </View>

          <View style={styles.rankFooter}>
            <Text style={[styles.rankHint, { color: colors.textSecondary }]}>
              {rank.tier === 'SS' ? '🏆 Apex Titan — nivel maxim atins!' : `Progres → Rank ${nextRank.tier} (${nextRank.title})`}
            </Text>
            <Text style={[styles.rankKgTarget, { color: rank.color }]}>
              {rank.tier === 'SS' ? '∞' : `${computedTonageKg.toLocaleString('ro-RO')} / ${nextRank.minKg.toLocaleString('ro-RO')} kg`}
            </Text>
          </View>
        </Animated.View>

        {/* ─── LEGENDĂ INTENSITATE ─── */}
        <View style={styles.legendRow}>
          {[
            { label: 'Inactiv', color: '#334155' },
            { label: 'Ușor',   color: HEAT_COLORS[1] },
            { label: 'Mediu',  color: HEAT_COLORS[2] },
            { label: 'Intens', color: HEAT_COLORS[3] },
            { label: 'Maxim',  color: HEAT_COLORS[4] },
          ].map((it, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: it.color }]} />
              <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{it.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── MODAL DETALIU MUȘCHI ─── */}
      {selectedMuscle && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setSelectedMuscle(null)}>
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { backgroundColor: '#0F172A', borderColor: HEAT_COLORS[selectedMuscle.level] || '#334155' }]}>
              <View style={styles.modalTop}>
                <View style={[styles.modalDot, { backgroundColor: HEAT_COLORS[selectedMuscle.level] || '#334155' }]} />
                <Text style={styles.modalTitle}>{selectedMuscle.name}</Text>
                <TouchableOpacity onPress={() => setSelectedMuscle(null)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                  <X size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalDesc}>
                Nivel activare: <Text style={{ color: HEAT_COLORS[selectedMuscle.level] || '#fff', fontWeight: '800' }}>
                  {['Inactiv', 'Ușor', 'Mediu', 'Intens', 'Maxim'][selectedMuscle.level]}
                </Text>
              </Text>
              <Text style={styles.modalDesc}>
                Sarcină înregistrată: <Text style={{ color: '#38BDF8', fontWeight: '700' }}>{selectedMuscle.load} pts</Text>
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

/* ─────────────────────────────────────────────────────────── STYLES */
const styles = StyleSheet.create({
  rootWrap: { gap: 10 },

  /* Summary Strip */
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
  },
  summaryItem: { alignItems: 'center', gap: 3 },
  summaryVal:  { fontSize: 16, fontWeight: '800', color: '#F1F5F9' },
  summaryLabel:{ fontSize: 10, fontWeight: '600', color: '#64748B', textAlign: 'center' },
  summaryDivider: { width: 1, height: 32, borderRadius: 1 },

  /* Main card */
  cardWrap: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#05080D',
    overflow: 'hidden',
    padding: 14,
    gap: 12,
  },

  /* Header */
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankDot:    { width: 9, height: 9, borderRadius: 5 },
  headerTitle:{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  sideToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  sideToggleText: { fontSize: 11, fontWeight: '800' },

  /* Anatomy */
  anatomyWrap: {
    height: 340,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#000000',
    borderRadius: 14,
    overflow: 'hidden',
  },
  rankAura: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },

  /* Rank card */
  rankCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  rankCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge:   { width: 46, height: 46, borderRadius: 13, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  rankTierGlyph: { fontSize: 20, fontWeight: '900' },
  rankInfo:    { flex: 1, gap: 2 },
  rankTier:    { fontSize: 14, fontWeight: '800' },
  rankTonage:  { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  starsRow:    { flexDirection: 'row', gap: 1 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3 },
  rankFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rankHint:    { fontSize: 11, fontWeight: '600', flex: 1 },
  rankKgTarget:{ fontSize: 11, fontWeight: '800' },

  /* Legend */
  legendRow:  { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendLabel:{ fontSize: 10, fontWeight: '600' },

  /* Modal */
  modalBg:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '80%', padding: 20, borderRadius: 18, borderWidth: 1, gap: 10 },
  modalTop:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalDot:  { width: 10, height: 10, borderRadius: 5 },
  modalTitle:{ flex: 1, fontSize: 16, fontWeight: '800', color: '#F1F5F9' },
  modalDesc: { fontSize: 13, color: '#94A3B8' },
});
