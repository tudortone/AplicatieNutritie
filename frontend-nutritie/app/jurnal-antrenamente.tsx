
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Dumbbell, Flame, Clock, Calendar, Trash2, ChevronDown, ChevronUp, Award } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../context/ThemeContext';
import { useAntrenamente, Antrenament } from '../hooks/useAntrenamente';
import { useExercitii } from '../hooks/useExercitii';
import { useNotify } from '../hooks/useNotify';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import KeyboardAwareScreen, { useContentBottomPadding } from '@/components/ui/KeyboardAwareScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { describeSet, getSetFields } from '../lib/workoutSets';
import { getLocalizedExerciseName, getSportLocaleTag } from '../lib/sportI18n';

interface ZiGrupata {
  titlu: string;
  dataScurta: string;
  items: Antrenament[];
}

export default function JurnalAntrenamenteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const localeTag = getSportLocaleTag(i18n.language);
  const notify = useNotify();
  const contentBottomPadding = useContentBottomPadding();
  const { fetchIstoric, stergeAntrenament } = useAntrenamente();
  const { exercitii } = useExercitii();

  const exercitiiMap = useMemo(() => {
    const map = new Map<string, (typeof exercitii)[number]>();
    for (const ex of exercitii) {
      map.set(ex.id, ex);
      map.set(ex.nume.toLowerCase(), ex);
    }
    return map;
  }, [exercitii]);

  const [istoric, setIstoric] = useState<Antrenament[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [toDelete, setToDelete] = useState<Antrenament | null>(null);

  const incarcaJurnal = useCallback(async () => {
    setLoading(true);
    try {
      const date = await fetchIstoric(30);
      setIstoric(date);
    } catch (e) {
      console.warn('Eroare jurnal antrenamente:', e);
    } finally {
      setLoading(false);
    }
  }, [fetchIstoric]);

  useEffect(() => {
    incarcaJurnal();
  }, [incarcaJurnal]);

  const toggleExpand = (id: string) => {
    Haptics.selectionAsync();
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStergere = (item: Antrenament) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setToDelete(item);
  };

  // Grupare pe zile
  const zileGrupate = useMemo((): ZiGrupata[] => {
    const map: Record<string, { titlu: string; dataScurta: string; items: Antrenament[] }> = {};
    const aziStr = new Date().toDateString();
    const ieriDate = new Date();
    ieriDate.setDate(ieriDate.getDate() - 1);
    const ieriStr = ieriDate.toDateString();

    for (const item of istoric) {
      const d = new Date(item.created_at);
      const key = d.toDateString();

      let titlu = d.toLocaleDateString(localeTag, { day: 'numeric', month: 'long' });
      if (key === aziStr) titlu = t('sport.journal.today');
      else if (key === ieriStr) titlu = t('sport.journal.yesterday');

      if (!map[key]) {
        map[key] = { titlu, dataScurta: key, items: [] };
      }
      map[key].items.push(item);
    }

    return Object.values(map);
  }, [istoric, localeTag, t]);

  // Statistici globale rezumat
  const stats = useMemo(() => {
    let totalKcal = 0;
    let totalVolum = 0;
    for (const item of istoric) {
      totalKcal += item.calorii_arse || 0;
      totalVolum += Number(item.volum_total || 0);
    }
    return {
      totalSesiuni: istoric.length,
      totalKcal,
      totalVolum
    };
  }, [istoric]);

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('sport.journal.backA11y')} hitSlop={8} style={[styles.backBtn, { backgroundColor: colors.surfaceBg }]}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('sport.journal.title')}</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{t('sport.journal.subtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('sport.journal.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={zileGrupate}
          keyExtractor={(item) => item.dataScurta}
          contentContainerStyle={[styles.listContent, { width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: contentBottomPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[styles.summaryCard, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
              <View style={styles.statBox}>
                <Dumbbell size={20} color={colors.accent} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats.totalSesiuni}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('sport.journal.workoutsCount')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
              <View style={styles.statBox}>
                <Flame size={20} color={colors.accentSecondary} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats.totalKcal}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('sport.journal.kcalBurned')}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
              <View style={styles.statBox}>
                <Award size={20} color={colors.accentTertiary || colors.accent} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{Math.round(stats.totalVolum)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('sport.journal.kgVolume')}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Calendar size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('sport.journal.emptyTitle')}</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {t('sport.journal.emptySub')}
              </Text>
            </View>
          }
          renderItem={({ item: zi }) => (
            <View style={styles.ziGroup}>
              <Text style={[styles.ziTitle, { color: colors.textSecondary }]}>{zi.titlu.toUpperCase()}</Text>

              {zi.items.map((ant) => {
                const isExp = !!expandedIds[ant.id];
                const nrEx = ant.exercitii?.length || 0;
                const ora = new Date(ant.created_at).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
                const expandA11y = isExp
                  ? t('sport.journal.closeWorkoutA11y', { name: ant.nume })
                  : t('sport.journal.openWorkoutA11y', { name: ant.nume });

                return (
                  <View
                    key={ant.id}
                    style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  >
                    <View style={styles.cardHeader}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => toggleExpand(ant.id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={expandA11y}
                      >
                        <View style={styles.rowTop}>
                          <Text style={[styles.antTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ant.nume} {nrEx > 0 ? `(${t('sport.journal.exShort', { count: nrEx })})` : ''}
                          </Text>
                          <Text style={[styles.antOra, { color: colors.textSecondary }]}>{ora}</Text>
                        </View>

                        <View style={styles.rowMeta}>
                          <Clock size={13} color={colors.textSecondary} />
                          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{t('sport.journal.durationMin', { count: ant.durata_min })}</Text>
                          <Text style={[styles.metaSep, { color: colors.textSecondary }]}>•</Text>
                          <Flame size={13} color={colors.accentSecondary} />
                          <Text style={[styles.metaText, { color: colors.accentSecondary }]}>{ant.calorii_arse} kcal</Text>
                          {Number(ant.volum_total || 0) > 0 && (
                            <>
                              <Text style={[styles.metaSep, { color: colors.textSecondary }]}>•</Text>
                              <Text style={[styles.metaText, { color: colors.accent }]}>{t('sport.measurement.volumeKgLabel', { kg: ant.volum_total })}</Text>
                            </>
                          )}
                        </View>
                      </TouchableOpacity>

                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          onPress={() => handleStergere(ant)}
                          style={styles.iconBtn}
                          accessibilityRole="button"
                          accessibilityLabel={t('sport.journal.deleteWorkoutA11y', { name: ant.nume })}
                        >
                          <Trash2 size={16} color={colors.danger} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => toggleExpand(ant.id)}
                          style={styles.iconBtn}
                          accessibilityRole="button"
                          accessibilityLabel={expandA11y}
                        >
                          {isExp ? (
                            <ChevronUp size={20} color={colors.textSecondary} />
                          ) : (
                            <ChevronDown size={20} color={colors.textSecondary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {isExp && (
                      <View style={[styles.expWrap, { borderTopColor: colors.cardBorder }]}>
                        {(!ant.exercitii || ant.exercitii.length === 0) ? (
                          <Text style={[styles.noExText, { color: colors.textSecondary }]}>{t('sport.journal.noSetDetails')}</Text>
                        ) : (
                          ant.exercitii.map((ex, i) => {
                            const exMeta = exercitiiMap.get(ex.exercitiuId) ?? exercitiiMap.get((ex.nume || '').toLowerCase());
                            const displayExName = exMeta ? getLocalizedExerciseName(exMeta, t) : ex.nume;
                            return (
                              <View key={i} style={styles.exItem}>
                                <Text style={[styles.exName, { color: colors.textPrimary }]}>{displayExName}</Text>
                                <View style={styles.seturiWrap}>
                                  {ex.seturi?.map((s, j) => {
                                    const isWarmup = s.set_type === 'warmup';
                                    const isDropset = s.set_type === 'dropset';
                                    const isFailure = s.set_type === 'failure';
                                    const typeLabel = isWarmup ? 'W' : isDropset ? 'D' : isFailure ? 'F' : `#${s.serie}`;
                                    const typeColor = isWarmup ? '#F59E0B' : isDropset ? '#C084FC' : isFailure ? '#F87171' : colors.textSecondary;
                                    const fields = getSetFields(
                                      exMeta ?? ((s.time_seconds ?? 0) > 0
                                        ? {
                                            nume: ex.nume,
                                            masurare: {
                                              type: 'timed',
                                              allowsWeight: false,
                                              weightOptional: false,
                                              defaultSets: 1,
                                              unitLabel: t('sport.measurement.units.secShort'),
                                            },
                                          }
                                        : { nume: ex.nume }),
                                      t,
                                    );

                                    return (
                                      <View key={j} style={[styles.setPill, { backgroundColor: colors.background, borderColor: typeColor, borderWidth: s.set_type && s.set_type !== 'working' ? 1 : 0 }]}>
                                        <Text style={[styles.setPillText, { color: typeColor }]}>{typeLabel}: </Text>
                                        <Text style={[styles.setPillVal, { color: colors.accent }]}>{describeSet(s, fields, t)}</Text>
                                        {s.rpe ? (
                                          <Text style={[styles.setPillVal, { color: colors.warning, marginLeft: 4, fontSize: 11 }]}>
                                            {t('sport.journal.rpeLabel', { rpe: s.rpe })}
                                          </Text>
                                        ) : null}
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        />
      )}

      {/* CONFIRM SHEET (Secțiunea 5.1) */}
      <ConfirmSheet
        visible={!!toDelete}
        title={t('sport.journal.deleteConfirmTitle')}
        message={toDelete ? t('sport.journal.deleteConfirmMsg', { name: toDelete.nume }) : ''}
        confirmLabel={t('sport.journal.deleteConfirmBtn')}
        cancelLabel={t('sport.journal.cancelBtn')}
        destructive={true}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const item = toDelete;
          setToDelete(null);
          try {
            await stergeAntrenament(item.id);
            notify.info(t('sport.journal.deleteSuccessTitle'), t('sport.journal.deleteSuccessMsg'));
            await incarcaJurnal();
          } catch {
            notify.error(t('sport.journal.deleteErrorTitle'), t('sport.journal.deleteErrorMsg'));
          }
        }}
      />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub: { fontSize: 13, fontWeight: '500' },

  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: '600' },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },

  summaryCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderRadius: 22, borderWidth: 1, marginBottom: 24 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, height: 40 },

  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 6, maxWidth: 260 },

  ziGroup: { marginBottom: 20 },
  ziTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },

  card: { borderRadius: 18, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  antTitle: { fontSize: 16, fontWeight: '800', flex: 1 },
  antOra: { fontSize: 12, fontWeight: '600' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  metaText: { fontSize: 12, fontWeight: '700' },
  metaSep: { fontSize: 12 },

  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  iconBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },

  expWrap: { borderTopWidth: 1, padding: 16 },
  noExText: { fontSize: 13, fontStyle: 'italic' },
  exItem: { marginBottom: 12 },
  exName: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  seturiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  setPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  setPillText: { fontSize: 12, fontWeight: '600' },
  setPillVal: { fontSize: 12, fontWeight: '800' }
});
