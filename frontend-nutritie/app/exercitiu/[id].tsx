
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, Dumbbell, AlertTriangle, Flame, Clock, PlusCircle,
  Zap, TrendingUp, Activity, Layers, Award, RotateCcw, ShieldCheck, Sparkles
} from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/theme';
import { useExercitii } from '../../hooks/useExercitii';
import { calculeazaCaloriiEx } from '../../lib/exercitiu';
import { SetLogger } from '../../components/fitness/SetLogger';
import { useAntrenamente, Antrenament, SetExercitiu } from '../../hooks/useAntrenamente';
import { useNotify } from '../../hooks/useNotify';
import { Holographic3DAnatomyBody } from '../../components/fitness/HolographicAnatomyBody';
import { SeriesConfigurator, type SeriesValue } from '../../components/fitness/SeriesConfigurator';
import { classifyMeasurement, computeSessionLoad, type MeasurementSpec } from '../../lib/measurement';

export default function ExercitiuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notify = useNotify();
  const { adaugaAntrenament, adaugaExercitiu } = useAntrenamente();
  const { colors } = useTheme();
  const { exercitii } = useExercitii();

  const [greutateKg, setGreutateKg] = useState(75);

  useEffect(() => {
    AsyncStorage.getItem('greutate').then((val) => {
      if (val) {
        const g = parseFloat(val);
        if (!isNaN(g) && g > 0) setGreutateKg(g);
      }
    });
  }, []);

  const exercitiu = exercitii.find((e) => e.id === id);
  const DEFAULT_MEASUREMENT_SPEC: MeasurementSpec = {
    type: 'reps_weight',
    allowsWeight: true,
    weightOptional: true,
    defaultSets: 3,
    defaultReps: 12,
    defaultWeightKg: 20,
    unitLabel: 'Repetări',
    bodyweightFactor: 1.0,
  };
  const spec: MeasurementSpec = exercitiu ? (exercitiu.masurare ?? classifyMeasurement(exercitiu)) : DEFAULT_MEASUREMENT_SPEC;
  const [sets, setSets] = useState<SetExercitiu[]>([]);

  if (!exercitiu) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Înapoi" hitSlop={12} style={styles.backBtn}>
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

  const instructiuni = exercitiu.instructiuni && exercitiu.instructiuni.length > 0
    ? exercitiu.instructiuni
    : ['Execută mișcarea controlat, concentrându-te pe contracția musculară.'];
  const descriere = exercitiu.descriere || 'Exercițiu eficient pentru planul tău de antrenament.';

  const sessionLoad = computeSessionLoad(spec, {
    sets: sets.length > 0 ? sets.length : 3,
    reps: sets.length > 0 ? Math.max(...sets.map(s => s.repetari)) : 10,
    weightKg: sets.length > 0 ? Math.max(...sets.map(s => s.greutate || 0)) : 0,
    durationSec: 60,
    bodyweightKg: greutateKg || 75,
  });
  const volumTotal = Math.round(sessionLoad);

  const maxWeight = sets.length > 0 ? Math.max(...sets.map(s => s.greutate || 0)) : 0;
  const totalReps = sets.reduce((sum, s) => sum + s.repetari, 0);
  const scorIntensitate = Math.min(100, Math.max(15, Math.round(
    (maxWeight * 0.95) + (totalReps * 0.8) + (sets.length * 6.5) + (exercitiu.dificultate === 'greu' ? 18 : exercitiu.dificultate === 'mediu' ? 10 : 0)
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
    try {
      const p = exercitiu.caloriiPeMinut ?? 6;
      const d = Math.max(15, sets.length * 3);
      const kcalArse = Math.round(p * d);

      const result = await adaugaAntrenament({
        nume: exercitiu.nume,
        tip: exercitiu.categorie,
        durata_min: d,
        calorii_arse: kcalArse,
        volum_total: volumTotal,
        exercitii: [
          {
            exercitiuId: exercitiu.id,
            nume: exercitiu.nume,
            seturi: sets.length > 0 ? sets : [{ serie: 1, repetari: 10, greutate: 0, set_type: 'working', rpe: 8, completed: true }],
            durataMin: d,
            kcal: kcalArse,
          },
        ],
      });

      if (result === null) {
        notify.error('Eroare', 'Nu s-a putut salva antrenamentul.');
        return;
      }

      notify.success(
        'Adăugat în antrenament',
        `${exercitiu.nume} a fost înregistrat cu succes!`
      );
      router.back();
    } catch (err: any) {
      notify.error('Eroare', 'Nu s-a putut salva antrenamentul.');
    }
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
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Înapoi" hitSlop={12} style={styles.backBtn}>
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

          <View style={[styles.metricsBar, { borderColor: colors.cardBorder }]}>
            <View style={styles.metricItem}>
              <Flame size={16} color={colors.warning} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                ~{caloriiEst} kcal
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>/ sesiune (est.)</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Clock size={16} color={colors.accentSecondary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {sets.length > 0 ? `${sets.length} serii setate` : 'Configurare'}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>pentru astăzi</Text>
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

        {/* CORP UMAN HOLOGRAFIC - COMIC BOOK STYLE ANATOMY & HEATMAP */}
        <Holographic3DAnatomyBody
          activeGroups={exercitiu.target_muscles || exercitiu.grupe || ['Corp complet']}
          muschiTinta={exercitiu.activation || exercitiu.muschiTinta}
          intensityScore={scorIntensitate}
          accentColor={colors.accent}
          secondaryColor={colors.accentSecondary}
          cardBg={colors.surfaceBg}
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

        {/* Jurnalizare Profesionala Set-by-Set */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 16 }]}>LOG ANTRENAMENT</Text>
        <SetLogger 
          initialSets={sets}
          onChange={setSets}
        />

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

      {/* Bară de acțiune inferioară adaptată la tipul de măsurare conform specificației v6 */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, Spacing.md), borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: rankInfo.badgeColor }]}
          activeOpacity={0.88}
          onPress={handleQuickAdd}
        >
          <PlusCircle size={20} color="#000" />
          <Text style={[styles.actionBtnText, { color: '#000' }]}>
            {(() => {
              const maxWeight = sets.length > 0 ? Math.max(...sets.map(s => s.greutate || 0)) : 0;
              const hasWeight = spec.type === 'weight_reps' || spec.type === 'reps_weight' || spec.type === 'reps_assisted' || maxWeight > 0;
              const totalReps = sets.reduce((sum, s) => sum + s.repetari, 0);
              
              if (spec.type === 'reps' && !hasWeight) {
                return `Adaugă (${totalReps} repetări)`;
              }
              if (spec.type === 'timed') {
                return `Adaugă (${sets.length} serii)`;
              }
              return `Adaugă (${volumTotal} kg • ${rankInfo.rank.split(' • ')[0]})`;
            })()}
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
    paddingBottom: 160,
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
