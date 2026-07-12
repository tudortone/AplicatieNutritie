import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, Dumbbell, AlertTriangle, Flame, Clock, PlusCircle,
  Zap, TrendingUp, Activity, Layers, Award, RotateCcw
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
}

function HumanBodyMuscleMap({
  activeGroups,
  intensityScore,
  accentColor,
  secondaryColor,
  cardBg,
  textPrimary
}: HumanBodyProps) {
  const [viewSide, setViewSide] = useState<'anterior' | 'posterior'>('anterior');

  // Evaluăm ce grupe sunt active
  const isPiept = activeGroups.some(g => /piept|pectorali/i.test(g));
  const isUmeri = activeGroups.some(g => /umeri|deltoid/i.test(g));
  const isBrate = activeGroups.some(g => /brațe|brate|biceps|triceps|brahial/i.test(g));
  const isAbdomen = activeGroups.some(g => /abdomen|core|oblici/i.test(g));
  const isPicioare = activeGroups.some(g => /picioare|cvadriceps|fesieri|gambe|ischiogambieri|femurali/i.test(g));
  const isSpate = activeGroups.some(g => /spate|dorsali|trapez|romboizi/i.test(g));

  // Culoarea de activare depinde de intensitate (mai intens = glow mai puternic)
  const activeColor = intensityScore >= 75
    ? accentColor
    : intensityScore >= 45
    ? secondaryColor
    : '#4ADE80';

  const inactiveFill = 'rgba(255,255,255,0.08)';
  const inactiveStroke = 'rgba(255,255,255,0.18)';

  return (
    <View style={bodyStyles.container}>
      <View style={bodyStyles.headerRow}>
        <View style={bodyStyles.titleBox}>
          <Text style={[bodyStyles.titleText, { color: textPrimary }]}>Harta Musculară Activă</Text>
          <Text style={[bodyStyles.subText, { color: accentColor }]}>
            Intensitate pompare: {intensityScore}% • {activeGroups.join(', ')}
          </Text>
        </View>

        <View style={[bodyStyles.switchPill, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            onPress={() => setViewSide('anterior')}
            style={[bodyStyles.switchBtn, viewSide === 'anterior' && { backgroundColor: accentColor }]}
          >
            <Text style={[bodyStyles.switchText, { color: viewSide === 'anterior' ? '#000' : textPrimary }]}>Față</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewSide('posterior')}
            style={[bodyStyles.switchBtn, viewSide === 'posterior' && { backgroundColor: accentColor }]}
          >
            <Text style={[bodyStyles.switchText, { color: viewSide === 'posterior' ? '#000' : textPrimary }]}>Spate</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={bodyStyles.svgWrap}>
        <Svg width="200" height="260" viewBox="0 0 240 320">
          {/* Siluetă cap & gât */}
          <Circle cx="120" cy="34" r="18" fill={inactiveFill} stroke={inactiveStroke} strokeWidth="1.5" />
          <Path d="M112,50 L128,50 L132,68 L108,68 Z" fill={inactiveFill} stroke={inactiveStroke} strokeWidth="1.5" />

          {viewSide === 'anterior' ? (
            <G>
              {/* Umeri (Deltoizi anteriori) */}
              <Path
                d="M74,72 C64,78 60,94 62,108 C68,110 76,108 80,102 L86,76 Z"
                fill={isUmeri ? activeColor : inactiveFill}
                stroke={isUmeri ? activeColor : inactiveStroke}
                strokeWidth={isUmeri ? "2.5" : "1.2"}
              />
              <Path
                d="M166,72 C176,78 180,94 178,108 C172,110 164,108 160,102 L154,76 Z"
                fill={isUmeri ? activeColor : inactiveFill}
                stroke={isUmeri ? activeColor : inactiveStroke}
                strokeWidth={isUmeri ? "2.5" : "1.2"}
              />

              {/* Piept (Pectorali stânga & dreapta) */}
              <Path
                d="M86,76 C96,74 116,74 118,74 L118,110 C106,114 92,108 86,96 Z"
                fill={isPiept ? activeColor : inactiveFill}
                stroke={isPiept ? activeColor : inactiveStroke}
                strokeWidth={isPiept ? "2.5" : "1.2"}
              />
              <Path
                d="M154,76 C144,74 124,74 122,74 L122,110 C134,114 148,108 154,96 Z"
                fill={isPiept ? activeColor : inactiveFill}
                stroke={isPiept ? activeColor : inactiveStroke}
                strokeWidth={isPiept ? "2.5" : "1.2"}
              />

              {/* Brațe (Biceps & Antebraț) */}
              <Path
                d="M62,110 C58,128 58,150 62,170 C68,172 74,168 76,162 C78,144 80,126 80,110 Z"
                fill={isBrate ? activeColor : inactiveFill}
                stroke={isBrate ? activeColor : inactiveStroke}
                strokeWidth={isBrate ? "2.5" : "1.2"}
              />
              <Path
                d="M178,110 C182,128 182,150 178,170 C172,172 166,168 164,162 C162,144 160,126 160,110 Z"
                fill={isBrate ? activeColor : inactiveFill}
                stroke={isBrate ? activeColor : inactiveStroke}
                strokeWidth={isBrate ? "2.5" : "1.2"}
              />

              {/* Abdomen & Core */}
              <Path
                d="M92,116 L148,116 L142,180 L98,180 Z"
                fill={isAbdomen ? activeColor : inactiveFill}
                stroke={isAbdomen ? activeColor : inactiveStroke}
                strokeWidth={isAbdomen ? "2.5" : "1.2"}
              />

              {/* Picioare (Cvadriceps stânga & dreapta) */}
              <Path
                d="M96,186 L116,186 L114,264 L98,304 L88,304 L90,250 Z"
                fill={isPicioare ? activeColor : inactiveFill}
                stroke={isPicioare ? activeColor : inactiveStroke}
                strokeWidth={isPicioare ? "2.5" : "1.2"}
              />
              <Path
                d="M144,186 L124,186 L126,264 L142,304 L152,304 L150,250 Z"
                fill={isPicioare ? activeColor : inactiveFill}
                stroke={isPicioare ? activeColor : inactiveStroke}
                strokeWidth={isPicioare ? "2.5" : "1.2"}
              />
            </G>
          ) : (
            <G>
              {/* Umeri & Trapez Posterior */}
              <Path
                d="M78,74 L162,74 L148,102 L92,102 Z"
                fill={isSpate || isUmeri ? activeColor : inactiveFill}
                stroke={isSpate || isUmeri ? activeColor : inactiveStroke}
                strokeWidth={isSpate || isUmeri ? "2.5" : "1.2"}
              />

              {/* Spate (Dorsali / Marele Dorsal) */}
              <Path
                d="M86,106 L154,106 L144,166 L96,166 Z"
                fill={isSpate ? activeColor : inactiveFill}
                stroke={isSpate ? activeColor : inactiveStroke}
                strokeWidth={isSpate ? "2.5" : "1.2"}
              />

              {/* Brațe Spate (Triceps) */}
              <Path
                d="M62,94 L76,94 L74,166 L60,166 Z"
                fill={isBrate ? activeColor : inactiveFill}
                stroke={isBrate ? activeColor : inactiveStroke}
                strokeWidth={isBrate ? "2.5" : "1.2"}
              />
              <Path
                d="M178,94 L164,94 L166,166 L180,166 Z"
                fill={isBrate ? activeColor : inactiveFill}
                stroke={isBrate ? activeColor : inactiveStroke}
                strokeWidth={isBrate ? "2.5" : "1.2"}
              />

              {/* Zonă lombară & Fesieri */}
              <Path
                d="M94,170 L146,170 L148,210 L92,210 Z"
                fill={isPicioare || isAbdomen ? activeColor : inactiveFill}
                stroke={isPicioare || isAbdomen ? activeColor : inactiveStroke}
                strokeWidth={isPicioare || isAbdomen ? "2.5" : "1.2"}
              />

              {/* Picioare posterior (Ischiogambieri / Gambe) */}
              <Path
                d="M92,216 L118,216 L114,298 L94,298 Z"
                fill={isPicioare ? activeColor : inactiveFill}
                stroke={isPicioare ? activeColor : inactiveStroke}
                strokeWidth={isPicioare ? "2.5" : "1.2"}
              />
              <Path
                d="M148,216 L122,216 L126,298 L146,298 Z"
                fill={isPicioare ? activeColor : inactiveFill}
                stroke={isPicioare ? activeColor : inactiveStroke}
                strokeWidth={isPicioare ? "2.5" : "1.2"}
              />
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleBox: {
    flex: 1,
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
    fontSize: 12,
    fontWeight: '800',
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

  // Calcul adaptiv pentru Scor Intensitate, Volum și Clasificare antrenament
  const kgVal = parseFloat(greutateSetaKg.replace(',', '.')) || 0;
  const repVal = parseInt(repetariSeta, 10) || repetariDefault;
  const volumTotal = kgVal * repVal * seriiSeta;

  // Scorul de intensitate (0-100) calibrat după greutate, repetări și volum
  const scorIntensitate = Math.min(100, Math.max(15, Math.round(
    (kgVal * 0.9) + (repVal * 2.2) + (seriiSeta * 6)
  )));

  const getTipStimuare = () => {
    if (kgVal >= 65 || (kgVal >= 40 && repVal <= 6)) {
      return { titlu: 'FORȚĂ EXPLOZIVĂ ⚡', descriere: 'Încărcare ridicată — adaptare neurologică maximă.' };
    }
    if (kgVal >= 20 || repVal >= 8) {
      return { titlu: 'HIPERTROFIE MAXIMĂ 🔥', descriere: 'Pompare intensă & acumulare optimă de fibre.' };
    }
    return { titlu: 'TONIFIERE & REZISTENȚĂ 🌊', descriere: 'Volum controlat și anduranță musculară.' };
  };

  const stimulare = getTipStimuare();

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
      `${exercitiu.nume} • Volum: ${volumTotal} kg • Scor: ${scorIntensitate} PTS`
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

        {/* Corp Uman Interactiv - Vizualizare Grupe & Pompare */}
        <HumanBodyMuscleMap
          activeGroups={exercitiu.grupe}
          intensityScore={scorIntensitate}
          accentColor={colors.accent}
          secondaryColor={colors.accentSecondary}
          cardBg={colors.cardBg}
          textPrimary={colors.textPrimary}
        />

        {/* Scor Antrenament & Adaptabilitate */}
        <View style={[styles.scoreCard, { backgroundColor: colors.surfaceBg, borderColor: colors.accentSecondary + '44' }]}>
          <View style={styles.scoreTopRow}>
            <View style={styles.scoreTitleRow}>
              <Award size={20} color={colors.accentSecondary} />
              <Text style={[styles.scoreCardTitle, { color: colors.textPrimary }]}>Scor Intensitate Antrenament</Text>
            </View>
            <View style={[styles.scoreBadgePill, { backgroundColor: colors.accentSecondary + '22', borderColor: colors.accentSecondary }]}>
              <Text style={[styles.scoreBadgeText, { color: colors.accentSecondary }]}>{scorIntensitate} / 100 PTS</Text>
            </View>
          </View>

          {/* Bara progres scor */}
          <View style={styles.scoreProgressTrack}>
            <LinearGradient
              colors={[colors.accent, colors.accentSecondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.scoreProgressFill, { width: `${scorIntensitate}%` }]}
            />
          </View>

          <View style={styles.scoreFooterRow}>
            <Text style={[styles.scoreStimulareTitle, { color: colors.accent }]}>{stimulare.titlu}</Text>
            <Text style={[styles.scoreVolumeText, { color: colors.textSecondary }]}>Volum: {volumTotal} kg</Text>
          </View>
          <Text style={[styles.scoreStimulareDesc, { color: colors.textSecondary }]}>{stimulare.descriere}</Text>
        </View>

        {/* Configurare rapidă greutate & repetări + serii */}
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
          style={[styles.actionBtn, { backgroundColor: colors.accent }]}
          activeOpacity={0.88}
          onPress={handleQuickAdd}
        >
          <PlusCircle size={20} color="#000" />
          <Text style={[styles.actionBtnText, { color: '#000' }]}>Adaugă în antrenament ({volumTotal} kg)</Text>
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
  scoreCard: {
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: Spacing.lg,
  },
  scoreTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreCardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  scoreBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  scoreProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  scoreProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  scoreFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scoreStimulareTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  scoreVolumeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoreStimulareDesc: {
    fontSize: 12,
    lineHeight: 17,
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
    fontSize: 16,
    fontWeight: '800',
  },
});
