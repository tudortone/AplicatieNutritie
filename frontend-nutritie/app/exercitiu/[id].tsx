import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Dumbbell, AlertTriangle, Flame, Clock, PlusCircle } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { EXERCITII } from '../../constants/exercitii';
import { calculeazaCaloriiEx } from '../../lib/exercitiu';
import { useAntrenamente } from '../../hooks/useAntrenamente';
import { useNotify } from '../../hooks/useNotify';

export default function ExercitiuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notify = useNotify();
  const { adaugaExercitiu } = useAntrenamente();

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
      <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.notFoundWrap}>
          <Text style={styles.notFoundTitle}>Exercițiul nu a fost găsit</Text>
          <Text style={styles.notFoundText}>Alege un exercițiu din catalogul principal.</Text>
        </View>
      </View>
    );
  }

  const caloriiEst = calculeazaCaloriiEx(exercitiu, greutateKg);

  const seriiDefault = exercitiu.seriiDefault ?? 3;
  const repetariDefault = exercitiu.repetariDefault ?? 12;
  const instructiuni = exercitiu.instructiuni && exercitiu.instructiuni.length > 0
    ? exercitiu.instructiuni
    : ['Execută mișcarea controlat, concentrându-te pe contracția musculară.'];
  const descriere = exercitiu.descriere || 'Exercițiu eficient pentru planul tău de antrenament.';

  const handleQuickAdd = async () => {
    const seturi = Array.from({ length: seriiDefault }, (_, i) => ({
      serie: i + 1,
      repetari: repetariDefault,
      greutate: 0,
    }));

    await adaugaExercitiu({
      exercitiuId: exercitiu.id,
      nume: exercitiu.nume,
      calorii: caloriiEst,
      durataMin: seriiDefault * 3,
      seturi,
      tip: exercitiu.categorie,
    });

    notify.success('Exercițiu adăugat!', `${exercitiu.nume} (${caloriiEst} kcal)`);
    router.back();
  };

  const getDificultateColor = () => {
    switch (exercitiu.dificultate) {
      case 'usor':
        return Colors.success;
      case 'mediu':
        return Colors.warning;
      case 'greu':
        return Colors.danger;
      default:
        return Colors.accent;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, Spacing.lg) }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {exercitiu.nume}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Card info top */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.badgesRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{exercitiu.categorie.toUpperCase()}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: `${getDificultateColor()}22` }]}>
                <Text style={[styles.badgeText, { color: getDificultateColor() }]}>
                  {exercitiu.dificultate.toUpperCase()}
                </Text>
              </View>
            </View>
            <Dumbbell size={24} color={Colors.accent} />
          </View>

          <Text style={styles.heroDesc}>{descriere}</Text>

          {/* Metric bar */}
          <View style={styles.metricsBar}>
            <View style={styles.metricItem}>
              <Flame size={16} color={Colors.accent} />
              <Text style={styles.metricValue}>~{caloriiEst} kcal</Text>
              <Text style={styles.metricLabel}>ardere estimată</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Clock size={16} color={Colors.accentSecondary} />
              <Text style={styles.metricValue}>
                {seriiDefault} serii × {repetariDefault}
              </Text>
              <Text style={styles.metricLabel}>recomandat</Text>
            </View>
          </View>

          <View style={styles.musclesRow}>
            <Text style={styles.musclesLabel}>Mușchi lucrați: </Text>
            {exercitiu.grupe.map((g, idx) => (
              <View key={idx} style={styles.musclePill}>
                <Text style={styles.muscleText}>{g}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Instrucțiuni execuție */}
        <Text style={styles.sectionHeading}>CUM SE EXECUTĂ CORECT</Text>
        <View style={styles.stepsWrap}>
          {instructiuni.map((pas, idx) => (
            <View key={idx} style={styles.stepCard}>
              <View style={styles.stepNumBubble}>
                <Text style={styles.stepNumText}>{idx + 1}</Text>
              </View>
              <Text style={styles.stepText}>{pas}</Text>
            </View>
          ))}
        </View>

        {/* Greșeli comune */}
        {exercitiu.greseliComune && exercitiu.greseliComune.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>GREȘELI DE EVITAT</Text>
            <View style={styles.mistakesWrap}>
              {exercitiu.greseliComune.map((gresala, idx) => (
                <View key={idx} style={styles.mistakeCard}>
                  <AlertTriangle size={18} color={Colors.danger} style={{ marginTop: 2 }} />
                  <Text style={styles.mistakeText}>{gresala}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bară de acțiune inferioară */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.88}
          onPress={handleQuickAdd}
        >
          <PlusCircle size={20} color={Colors.background} />
          <Text style={styles.actionBtnText}>Adaugă în antrenament</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
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
    color: Colors.textSecondary,
  },
  heroDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.border,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  musclesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  musclesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  musclePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: `${Colors.accent}15`,
  },
  muscleText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.accent,
    textTransform: 'capitalize',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textTertiary,
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  stepsWrap: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  stepCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepNumBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${Colors.accent}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.accent,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  mistakesWrap: {
    gap: Spacing.sm,
  },
  mistakeCard: {
    flexDirection: 'row',
    backgroundColor: `${Colors.danger}11`,
    borderWidth: 1,
    borderColor: `${Colors.danger}33`,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  mistakeText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.background,
  },
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  notFoundText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
