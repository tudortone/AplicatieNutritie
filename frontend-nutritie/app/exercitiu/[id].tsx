import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Defs, RadialGradient, Stop, LinearGradient as SvgLinearGradient, G, Line, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, Dumbbell, AlertTriangle, Flame, Clock, PlusCircle,
  Zap, TrendingUp, Activity, Layers, Award, RotateCcw, ShieldCheck, Sparkles
} from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/theme';
import { EXERCITII } from '../../constants/exercitii';
import { calculeazaCaloriiEx } from '../../lib/exercitiu';
import { useAntrenamente } from '../../hooks/useAntrenamente';
import { useNotify } from '../../hooks/useNotify';

interface HumanBodyProps {
  activeGroups: string[];
  intensityScore: number; // 0 - 100
  accentColor: string;
  secondaryColor: string;
  cardBg: string;
  textPrimary: string;
  rankBadgeColor?: string;
  volumTotalKg?: number;
}

/**
 * Corp Uman 3D Holografic (Anatomy 3D Cyber Render) inspirat din poza 3
 * Redă o siluetă anatomică volumetrică cu câmp de energie, rețea constelație și iluminare dinamică
 */
export function Holographic3DAnatomyBody({
  activeGroups,
  intensityScore,
  accentColor,
  secondaryColor,
  cardBg,
  textPrimary,
  rankBadgeColor = '#00F0FF',
  volumTotalKg = 0
}: HumanBodyProps) {
  const [viewSide, setViewSide] = useState<'anterior' | 'posterior'>('anterior');

  const isPiept = activeGroups.some(g => /piept|pectorali/i.test(g));
  const isUmeri = activeGroups.some(g => /umeri|deltoid/i.test(g));
  const isBrate = activeGroups.some(g => /brațe|brate|biceps|triceps|brahial/i.test(g));
  const isAbdomen = activeGroups.some(g => /abdomen|core|oblici/i.test(g));
  const isPicioare = activeGroups.some(g => /picioare|cvadriceps|fesieri|gambe|ischiogambieri|femurali/i.test(g));
  const isSpate = activeGroups.some(g => /spate|dorsali|trapez|romboizi/i.test(g));

  const activeColor = rankBadgeColor || (intensityScore >= 80 ? '#FACC15' : intensityScore >= 55 ? '#00F0FF' : '#4ADE80');
  const wireframeInactive = 'rgba(0, 240, 255, 0.11)';
  const wireframeStrokeInactive = 'rgba(0, 240, 255, 0.28)';

  return (
    <View style={[bodyStyles.container, { borderColor: activeColor + '44' }]}>
      {/* HUD Header Anatomic */}
      <View style={bodyStyles.headerRow}>
        <View style={bodyStyles.titleBox}>
          <View style={bodyStyles.hudBadgeRow}>
            <View style={[bodyStyles.hudDot, { backgroundColor: activeColor }]} />
            <Text style={[bodyStyles.hudLabel, { color: activeColor }]}>3D HOLOGRAPHIC ANATOMY • BIO SCAN</Text>
          </View>
          <Text style={[bodyStyles.titleText, { color: textPrimary }]}>Recrutare Anatomică Volumetrică</Text>
          <Text style={[bodyStyles.subText, { color: activeColor }]} numberOfLines={1}>
            {activeGroups.join(', ')} • {intensityScore}% Pompă
          </Text>
        </View>

        <View style={[bodyStyles.switchPill, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            onPress={() => setViewSide('anterior')}
            style={[bodyStyles.switchBtn, viewSide === 'anterior' && { backgroundColor: activeColor }]}
          >
            <Text style={[bodyStyles.switchText, { color: viewSide === 'anterior' ? '#000' : textPrimary }]}>FAȚĂ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewSide('posterior')}
            style={[bodyStyles.switchBtn, viewSide === 'posterior' && { backgroundColor: activeColor }]}
          >
            <Text style={[bodyStyles.switchText, { color: viewSide === 'posterior' ? '#000' : textPrimary }]}>SPATE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SVG 3D Holographic Cyber Render */}
      <View style={bodyStyles.svgWrap}>
        <Svg width="230" height="300" viewBox="0 0 260 360">
          <Defs>
            <RadialGradient id="hologramAura" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor={activeColor} stopOpacity="0.32" />
              <Stop offset="60%" stopColor={activeColor} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={activeColor} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Câmp de aură volumetrică 3D în spatele corpului */}
          <Circle cx="130" cy="170" r="110" fill="url(#hologramAura)" />

          {/* Linii HUD și grid orizontal 3D */}
          <Line x1="15" y1="50" x2="245" y2="50" stroke={activeColor + '22'} strokeDasharray="3,4" />
          <Line x1="15" y1="170" x2="245" y2="170" stroke={activeColor + '22'} strokeDasharray="3,4" />
          <Line x1="15" y1="290" x2="245" y2="290" stroke={activeColor + '22'} strokeDasharray="3,4" />
          <Line x1="130" y1="10" x2="130" y2="350" stroke={activeColor + '28'} strokeDasharray="2,3" />

          {/* Cranium & Gât 3D Mesh */}
          <Circle cx="130" cy="38" r="18" fill="rgba(0,240,255,0.08)" stroke={wireframeStrokeInactive} strokeWidth="1.3" />
          <Path d="M121,54 L139,54 L143,72 L117,72 Z" fill="rgba(0,240,255,0.08)" stroke={wireframeStrokeInactive} strokeWidth="1.3" />

          {viewSide === 'anterior' ? (
            <G>
              {/* Umeri (Deltoizi anteriori volumetrici) */}
              <Path
                d="M78,76 C64,82 58,98 60,114 C66,116 78,114 84,106 L90,78 Z"
                fill={isUmeri ? activeColor + '55' : wireframeInactive}
                stroke={isUmeri ? activeColor : wireframeStrokeInactive}
                strokeWidth={isUmeri ? "2.6" : "1.2"}
              />
              <Path
                d="M182,76 C196,82 202,98 200,114 C194,116 182,114 176,106 L170,78 Z"
                fill={isUmeri ? activeColor + '55' : wireframeInactive}
                stroke={isUmeri ? activeColor : wireframeStrokeInactive}
                strokeWidth={isUmeri ? "2.6" : "1.2"}
              />

              {/* Piept (Pectoralis Major volumetric 3D) */}
              <Path
                d="M90,78 C102,76 126,76 128,76 L128,118 C114,122 98,114 90,100 Z"
                fill={isPiept ? activeColor + '66' : wireframeInactive}
                stroke={isPiept ? activeColor : wireframeStrokeInactive}
                strokeWidth={isPiept ? "2.6" : "1.2"}
              />
              <Path
                d="M170,78 C158,76 134,76 132,76 L132,118 C146,122 162,114 170,100 Z"
                fill={isPiept ? activeColor + '66' : wireframeInactive}
                stroke={isPiept ? activeColor : wireframeStrokeInactive}
                strokeWidth={isPiept ? "2.6" : "1.2"}
              />

              {/* Brațe (Biceps / Antebraț sculptat) */}
              <Path
                d="M60,116 C54,136 54,160 60,182 C66,184 74,180 76,172 C80,152 82,132 82,116 Z"
                fill={isBrate ? activeColor + '55' : wireframeInactive}
                stroke={isBrate ? activeColor : wireframeStrokeInactive}
                strokeWidth={isBrate ? "2.6" : "1.2"}
              />
              <Path
                d="M200,116 C206,136 206,160 200,182 C194,184 186,180 184,172 C180,152 178,132 178,116 Z"
                fill={isBrate ? activeColor + '55' : wireframeInactive}
                stroke={isBrate ? activeColor : wireframeStrokeInactive}
                strokeWidth={isBrate ? "2.6" : "1.2"}
              />

              {/* Abdomen 6-Pack Grid & Oblici */}
              <Path
                d="M96,124 L164,124 L156,196 L104,196 Z"
                fill={isAbdomen ? activeColor + '66' : wireframeInactive}
                stroke={isAbdomen ? activeColor : wireframeStrokeInactive}
                strokeWidth={isAbdomen ? "2.6" : "1.2"}
              />
              <Line x1="106" y1="148" x2="154" y2="148" stroke={isAbdomen ? activeColor : wireframeStrokeInactive} strokeWidth="1.2" />
              <Line x1="108" y1="172" x2="152" y2="172" stroke={isAbdomen ? activeColor : wireframeStrokeInactive} strokeWidth="1.2" />

              {/* Cvadriceps & Gambe */}
              <Path
                d="M102,204 L126,204 L124,286 L106,334 L92,334 L96,274 Z"
                fill={isPicioare ? activeColor + '66' : wireframeInactive}
                stroke={isPicioare ? activeColor : wireframeStrokeInactive}
                strokeWidth={isPicioare ? "2.6" : "1.2"}
              />
              <Path
                d="M158,204 L134,204 L136,286 L154,334 L168,334 L164,274 Z"
                fill={isPicioare ? activeColor + '66' : wireframeInactive}
                stroke={isPicioare ? activeColor : wireframeStrokeInactive}
                strokeWidth={isPicioare ? "2.6" : "1.2"}
              />

              {/* Constelație cibernetică de puncte luminoase (Nodes) */}
              <Circle cx="130" cy="76" r="4" fill={isPiept ? activeColor : '#00F0FF'} />
              <Circle cx="84" cy="94" r="3.5" fill={isUmeri || isPiept ? activeColor : '#00F0FF'} />
              <Circle cx="176" cy="94" r="3.5" fill={isUmeri || isPiept ? activeColor : '#00F0FF'} />
              <Circle cx="70" cy="148" r="3.5" fill={isBrate ? activeColor : '#00F0FF'} />
              <Circle cx="190" cy="148" r="3.5" fill={isBrate ? activeColor : '#00F0FF'} />
              <Circle cx="130" cy="158" r="4" fill={isAbdomen ? activeColor : '#00F0FF'} />
              <Circle cx="114" cy="278" r="4" fill={isPicioare ? activeColor : '#00F0FF'} />
              <Circle cx="146" cy="278" r="4" fill={isPicioare ? activeColor : '#00F0FF'} />
            </G>
          ) : (
            <G>
              {/* Umeri & Trapez Posterior */}
              <Path
                d="M82,78 L178,78 L160,110 L100,110 Z"
                fill={isSpate || isUmeri ? activeColor + '55' : wireframeInactive}
                stroke={isSpate || isUmeri ? activeColor : wireframeStrokeInactive}
                strokeWidth={isSpate || isUmeri ? "2.6" : "1.2"}
              />
              {/* Dorsali / Lats 3D */}
              <Path
                d="M92,114 L168,114 L156,182 L104,182 Z"
                fill={isSpate ? activeColor + '66' : wireframeInactive}
                stroke={isSpate ? activeColor : wireframeStrokeInactive}
                strokeWidth={isSpate ? "2.6" : "1.2"}
              />
              {/* Triceps Posterior */}
              <Path
                d="M64,102 L80,102 L78,178 L62,178 Z"
                fill={isBrate ? activeColor + '55' : wireframeInactive}
                stroke={isBrate ? activeColor : wireframeStrokeInactive}
                strokeWidth={isBrate ? "2.6" : "1.2"}
              />
              <Path
                d="M196,102 L180,102 L182,178 L198,178 Z"
                fill={isBrate ? activeColor + '55' : wireframeInactive}
                stroke={isBrate ? activeColor : wireframeStrokeInactive}
                strokeWidth={isBrate ? "2.6" : "1.2"}
              />
              {/* Fesieri & Femurali */}
              <Path
                d="M100,188 L128,188 L124,284 L102,332 L90,332 L94,272 Z"
                fill={isPicioare ? activeColor + '66' : wireframeInactive}
                stroke={isPicioare ? activeColor : wireframeStrokeInactive}
                strokeWidth={isPicioare ? "2.6" : "1.2"}
              />
              <Path
                d="M160,188 L132,188 L136,284 L158,332 L170,332 L166,272 Z"
                fill={isPicioare ? activeColor + '66' : wireframeInactive}
                stroke={isPicioare ? activeColor : wireframeStrokeInactive}
                strokeWidth={isPicioare ? "2.6" : "1.2"}
              />

              <Circle cx="130" cy="94" r="4" fill={isSpate ? activeColor : '#00F0FF'} />
              <Circle cx="130" cy="148" r="3.5" fill={isSpate ? activeColor : '#00F0FF'} />
              <Circle cx="114" cy="278" r="4" fill={isPicioare ? activeColor : '#00F0FF'} />
              <Circle cx="146" cy="278" r="4" fill={isPicioare ? activeColor : '#00F0FF'} />
            </G>
          )}
        </Svg>
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
    backgroundColor: 'rgba(5, 15, 28, 0.65)',
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
    fontSize: 15,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  switchText: {
    fontSize: 11,
    fontWeight: '900',
  },
  svgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
});

export default function ExercitiuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notify = useNotify();
  const { adaugaExercitiu } = useAntrenamente();
  const { colors } = useTheme();

  const [greutateKg, setGreutateKg] = useState(75);

  useEffect(() => {
    AsyncStorage.getItem('greutate').then((val) => {
      if (val) {
        const g = parseFloat(val);
        if (!isNaN(g) && g > 0) setGreutateKg(g);
      }
    });
  }, []);

  const exercitiu = EXERCITII.find((e) => e.id === id);

  if (!exercitiu) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.notFoundWrap}>
          <Text style={[styles.notFoundTitle, { color: colors.textPrimary }]}>Exercițiul nu a fost găsit</Text>
          <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>Alege un exercițiu din catalogul principal.</Text>
        </View>
      </View>
    );
  }

  const caloriiEst = calculeazaCaloriiEx(exercitiu, greutateKg);

  const seriiDefault = exercitiu.seriiDefault ?? 4;
  const repetariDefault = exercitiu.repetariDefault ?? 10;
  const [seriiSeta, setSeriiSeta] = useState(seriiDefault);
  const [greutateSetaKg, setGreutateSetaKg] = useState('20');
  const [repetariSeta, setRepetariSeta] = useState(String(repetariDefault));

  const instructiuni = exercitiu.instructiuni && exercitiu.instructiuni.length > 0
    ? exercitiu.instructiuni
    : ['Execută mișcarea controlat, concentrându-te pe contracția musculară.'];
  const descriere = exercitiu.descriere || 'Exercițiu eficient pentru planul tău de antrenament.';

  const kgVal = parseFloat(greutateSetaKg.replace(',', '.')) || 0;
  const repVal = parseInt(repetariSeta, 10) || repetariDefault;
  const volumTotal = kgVal * repVal * seriiSeta;

  const scorIntensitate = Math.min(100, Math.max(15, Math.round(
    (kgVal * 0.95) + (repVal * 2.3) + (seriiSeta * 6.5) + (exercitiu.dificultate === 'greu' ? 18 : exercitiu.dificultate === 'mediu' ? 10 : 0)
  )));

  const getExerciseRankInfo = () => {
    if (scorIntensitate >= 85) {
      return {
        rank: 'RANK S+ • ELITE PRO 👑⚡',
        badgeColor: '#FACC15',
        stele: '⭐⭐⭐⭐⭐',
        eficienta: 'Recrutare 99% Fibre Musculare',
        mesaj: 'Stimulare hipertrofică maximă — nivel competițional absolut.',
        hintNext: 'Ai atins nivelul maxim de măiestrie pentru acest exercițiu!'
      };
    }
    if (scorIntensitate >= 65) {
      return {
        rank: 'RANK A • ADVANCED HYPERTROPHY 🔥',
        badgeColor: '#00F0FF',
        stele: '⭐⭐⭐⭐',
        eficienta: 'Recrutare 92% Fibre Musculare',
        mesaj: 'Tensiune mecanică intensă & adaptare structurală profundă.',
        hintNext: `Adaugă +${Math.max(2, Math.round((85 - scorIntensitate) / 2))} kg sau 1 serie pentru a debloca Rank S+`
      };
    }
    if (scorIntensitate >= 45) {
      return {
        rank: 'RANK B • INTERMEDIATE STRENGTH 💪',
        badgeColor: '#4ADE80',
        stele: '⭐⭐⭐',
        eficienta: 'Recrutare 78% Fibre Musculare',
        mesaj: 'Volum solid de lucru pentru creștere progresivă și tonifiere.',
        hintNext: `Adaugă +${Math.max(2, Math.round((65 - scorIntensitate) / 2))} kg sau 2 repetări pentru Rank A`
      };
    }
    return {
      rank: 'RANK C • FOUNDATION & FORM 🌊',
      badgeColor: '#38BDF8',
      stele: '⭐⭐',
      eficienta: 'Recrutare 60% Fibre Musculare',
      mesaj: 'Execuție tehnică controlată și activare metabolică de bază.',
      hintNext: `Crește greutatea sau adaugă repetări pentru a atinge Rank B`
    };
  };

  const rankInfo = getExerciseRankInfo();

  const handleQuickAdd = async () => {
    const seturi = Array.from({ length: seriiSeta }, (_, i) => ({
      serie: i + 1,
      repetari: repVal,
      greutate: kgVal,
    }));

    await adaugaExercitiu({
      exercitiuId: exercitiu.id,
      nume: exercitiu.nume,
      calorii: caloriiEst,
      durataMin: seriiSeta * 3,
      seturi,
      tip: exercitiu.categorie,
    });

    notify.success(
      'Exercițiu adăugat!',
      `${exercitiu.nume} • ${rankInfo.rank} • ${volumTotal} kg volum`
    );
    router.back();
  };

  const getDificultateColor = () => {
    switch (exercitiu.dificultate) {
      case 'usor':
        return colors.success;
      case 'mediu':
        return colors.warning;
      case 'greu':
        return colors.danger;
      default:
        return colors.accent;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, Spacing.lg), backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {exercitiu.nume}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Card info top */}
        <View style={[styles.heroCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.badgesRow}>
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{exercitiu.categorie.toUpperCase()}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: `${getDificultateColor()}22` }]}>
                <Text style={[styles.badgeText, { color: getDificultateColor() }]}>
                  {exercitiu.dificultate.toUpperCase()}
                </Text>
              </View>
            </View>
            <Dumbbell size={24} color={colors.accent} />
          </View>

          <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>{descriere}</Text>

          {/* Metric bar */}
          <View style={styles.metricsBar}>
            <View style={styles.metricItem}>
              <Flame size={16} color={colors.accent} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>~{caloriiEst} kcal</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ardere estimată</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Clock size={16} color={colors.accentSecondary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {seriiSeta} serii × {repVal}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>recomandat</Text>
            </View>
          </View>

          <View style={styles.musclesRow}>
            <Text style={[styles.musclesLabel, { color: colors.textSecondary }]}>Mușchi lucrați: </Text>
            {exercitiu.grupe.map((g, idx) => (
              <View key={idx} style={[styles.musclePill, { backgroundColor: colors.accent + '1A', borderColor: colors.accent + '33' }]}>
                <Text style={[styles.muscleText, { color: colors.accent }]}>{g}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CORP UMAN 3D HOLOGRAFIC */}
        <Holographic3DAnatomyBody
          activeGroups={exercitiu.grupe}
          intensityScore={scorIntensitate}
          accentColor={colors.accent}
          secondaryColor={colors.accentSecondary}
          cardBg={colors.cardBg}
          textPrimary={colors.textPrimary}
          rankBadgeColor={rankInfo.badgeColor}
          volumTotalKg={volumTotal}
        />

        {/* SISTEM SPECIFIC DE RANK (ÎNCADRARE TEXT REZOLVATĂ PERFECT) */}
        <View style={[styles.rankCard, { backgroundColor: colors.surfaceBg, borderColor: rankInfo.badgeColor }]}>
          <View style={styles.rankTopRow}>
            <View style={styles.rankTitleRow}>
              <ShieldCheck size={24} color={rankInfo.badgeColor} />
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.rankCategoryTitle, { color: colors.textSecondary }]}>MASTERY RANK SYSTEM</Text>
                <Text style={[styles.rankBadgeTitle, { color: rankInfo.badgeColor }]} numberOfLines={1}>
                  {rankInfo.rank}
                </Text>
              </View>
            </View>
            <View style={styles.starsBadgeWrap}>
              <Text style={styles.rankStarsText}>{rankInfo.stele}</Text>
            </View>
          </View>

          <View style={styles.rankProgressTrack}>
            <LinearGradient
              colors={[rankInfo.badgeColor, colors.accentSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.rankProgressFill, { width: `${scorIntensitate}%` }]}
            />
          </View>

          {/* Linie de statistici perfect spațiată pe 2 coloane clare */}
          <View style={styles.rankStatsGrid}>
            <View style={styles.statsColLeft}>
              <Text style={[styles.rankStatLabel, { color: colors.textSecondary }]}>Eficiență Anatomică</Text>
              <Text style={[styles.rankStatVal, { color: rankInfo.badgeColor }]}>{rankInfo.eficienta}</Text>
            </View>
            <View style={styles.statsColRight}>
              <Text style={[styles.rankStatLabel, { color: colors.textSecondary, textAlign: 'right' }]}>Scor Efort</Text>
              <Text style={[styles.rankStatVal, { color: colors.textPrimary, textAlign: 'right' }]}>
                {scorIntensitate} <Text style={{ fontSize: 12, color: colors.textSecondary }}>/ 100 PTS</Text>
              </Text>
            </View>
          </View>

          <Text style={[styles.rankDescText, { color: colors.textSecondary }]}>{rankInfo.mesaj}</Text>

          <View style={[styles.rankHintBox, { backgroundColor: rankInfo.badgeColor + '14', borderColor: rankInfo.badgeColor + '33' }]}>
            <Sparkles size={16} color={rankInfo.badgeColor} />
            <Text style={[styles.rankHintText, { color: colors.textPrimary }]}>{rankInfo.hintNext}</Text>
          </View>
        </View>

        {/* Configurare rapidă greutate & repetări */}
        <View style={[styles.quickConfigBox, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>CONFIGURARE RAPIDĂ SERII</Text>
          <View style={styles.quickConfigRow}>
            <View style={styles.configField}>
              <Text style={[styles.configLabel, { color: colors.textSecondary }]}>Serii</Text>
              <View style={styles.seriiRow}>
                <TouchableOpacity
                  onPress={() => setSeriiSeta(Math.max(1, seriiSeta - 1))}
                  style={[styles.stepperBtn, { backgroundColor: colors.cardBg }]}
                >
                  <Text style={[styles.stepperTxt, { color: colors.textPrimary }]}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.seriiNumber, { color: colors.textPrimary }]}>{seriiSeta}</Text>
                <TouchableOpacity
                  onPress={() => setSeriiSeta(seriiSeta + 1)}
                  style={[styles.stepperBtn, { backgroundColor: colors.cardBg }]}
                >
                  <Text style={[styles.stepperTxt, { color: colors.textPrimary }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.configField}>
              <Text style={[styles.configLabel, { color: colors.textSecondary }]}>Greutate (kg)</Text>
              <TextInput
                style={[styles.configInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
                value={greutateSetaKg}
                onChangeText={setGreutateSetaKg}
                keyboardType="numeric"
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.configField}>
              <Text style={[styles.configLabel, { color: colors.textSecondary }]}>Repetări / serie</Text>
              <TextInput
                style={[styles.configInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
                value={repetariSeta}
                onChangeText={setRepetariSeta}
                keyboardType="numeric"
                selectTextOnFocus
                placeholder="10"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* Instrucțiuni execuție */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 8 }]}>CUM SE EXECUTĂ CORECT</Text>
        <View style={styles.stepsWrap}>
          {instructiuni.map((pas, idx) => (
            <View key={idx} style={[styles.stepCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
              <View style={[styles.stepNumBubble, { backgroundColor: colors.accent }]}>
                <Text style={styles.stepNumText}>{idx + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.textPrimary }]}>{pas}</Text>
            </View>
          ))}
        </View>

        {/* Greșeli comune */}
        {exercitiu.greseliComune && exercitiu.greseliComune.length > 0 && (
          <>
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>GREȘELI DE EVITAT</Text>
            <View style={styles.mistakesWrap}>
              {exercitiu.greseliComune.map((gresala, idx) => (
                <View key={idx} style={[styles.mistakeCard, { backgroundColor: colors.danger + '14', borderColor: colors.danger + '33' }]}>
                  <AlertTriangle size={18} color={colors.danger} style={{ marginTop: 2 }} />
                  <Text style={[styles.mistakeText, { color: colors.textPrimary }]}>{gresala}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bară de acțiune inferioară */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, Spacing.md), borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: rankInfo.badgeColor }]}
          activeOpacity={0.88}
          onPress={handleQuickAdd}
        >
          <PlusCircle size={20} color="#000" />
          <Text style={[styles.actionBtnText, { color: '#000' }]}>
            Adaugă în antrenament ({volumTotal} kg • {rankInfo.rank.split(' • ')[0]})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 110,
  },
  heroCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  metricsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  musclesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  musclesLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  musclePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  muscleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rankCard: {
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1.5,
    marginBottom: Spacing.lg,
  },
  rankTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  rankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rankCategoryTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  rankBadgeTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  starsBadgeWrap: {
    paddingLeft: 6,
  },
  rankStarsText: {
    fontSize: 14,
  },
  rankProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  rankProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  rankStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  statsColLeft: {
    flex: 1.2,
    paddingRight: 8,
  },
  statsColRight: {
    flex: 0.8,
  },
  rankStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  rankStatVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  rankDescText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  rankHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  rankHintText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  quickConfigBox: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  quickConfigRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.sm,
  },
  configField: {
    flex: 1,
  },
  configLabel: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  configInput: {
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  seriiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  stepperBtn: {
    width: 36,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperTxt: {
    fontSize: 18,
    fontWeight: '800',
  },
  seriiNumber: {
    fontSize: 17,
    fontWeight: '800',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  stepsWrap: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  stepNumBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  stepText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  mistakesWrap: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  mistakeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  mistakeText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  notFoundWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  notFoundText: {
    fontSize: 14,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  actionBtn: {
    height: 52,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
