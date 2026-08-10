
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
import { useNotify } from '../hooks/useNotify';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import KeyboardAwareScreen, { useContentBottomPadding } from '@/components/ui/KeyboardAwareScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ZiGrupata {
  titlu: string;
  dataScurta: string;
  items: Antrenament[];
}

export default function JurnalAntrenamenteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const notify = useNotify();
  const contentBottomPadding = useContentBottomPadding();
  const { fetchIstoric, stergeAntrenament } = useAntrenamente();

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

  // Grupare pe zile (Azi, Ieri, ro-RO)
  const zileGrupate = useMemo((): ZiGrupata[] => {
    const map: Record<string, { titlu: string; dataScurta: string; items: Antrenament[] }> = {};
    const aziStr = new Date().toDateString();
    const ieriDate = new Date();
    ieriDate.setDate(ieriDate.getDate() - 1);
    const ieriStr = ieriDate.toDateString();

    for (const item of istoric) {
      const d = new Date(item.created_at);
      const key = d.toDateString();

      let titlu = d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });
      if (key === aziStr) titlu = 'Azi';
      else if (key === ieriStr) titlu = 'Ieri';

      if (!map[key]) {
        map[key] = { titlu, dataScurta: key, items: [] };
      }
      map[key].items.push(item);
    }

    return Object.values(map);
  }, [istoric]);

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
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Înapoi" hitSlop={12} style={[styles.backBtn, { backgroundColor: colors.surfaceBg }]}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Jurnal Antrenamente</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>Ultimele 30 de zile</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Se încarcă jurnalul...</Text>
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
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Antrenamente</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
              <View style={styles.statBox}>
                <Flame size={20} color={colors.accentSecondary} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats.totalKcal}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>kcal arse</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
              <View style={styles.statBox}>
                <Award size={20} color={colors.accentTertiary || colors.accent} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{Math.round(stats.totalVolum)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>kg volum</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Calendar size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Jurnalul este gol</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Niciun antrenament înregistrat în ultimele 30 de zile.
              </Text>
            </View>
          }
          renderItem={({ item: zi }) => (
            <View style={styles.ziGroup}>
              <Text style={[styles.ziTitle, { color: colors.textSecondary }]}>{zi.titlu.toUpperCase()}</Text>

              {zi.items.map((ant) => {
                const isExp = !!expandedIds[ant.id];
                const nrEx = ant.exercitii?.length || 0;
                const ora = new Date(ant.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

                return (
                  <View
                    key={ant.id}
                    style={[styles.card, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  >
                    <TouchableOpacity
                      style={styles.cardHeader}
                      onPress={() => toggleExpand(ant.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.rowTop}>
                          <Text style={[styles.antTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ant.nume} {nrEx > 0 ? `(${nrEx} ex)` : ''}
                          </Text>
                          <Text style={[styles.antOra, { color: colors.textSecondary }]}>{ora}</Text>
                        </View>

                        <View style={styles.rowMeta}>
                          <Clock size={13} color={colors.textSecondary} />
                          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{ant.durata_min} min</Text>
                          <Text style={[styles.metaSep, { color: colors.textSecondary }]}>•</Text>
                          <Flame size={13} color={colors.accentSecondary} />
                          <Text style={[styles.metaText, { color: colors.accentSecondary }]}>{ant.calorii_arse} kcal</Text>
                          {Number(ant.volum_total || 0) > 0 && (
                            <>
                              <Text style={[styles.metaSep, { color: colors.textSecondary }]}>•</Text>
                              <Text style={[styles.metaText, { color: colors.accent }]}>{ant.volum_total} kg volum</Text>
                            </>
                          )}
                        </View>
                      </View>

                      <View style={styles.actionsRow}>
                        <TouchableOpacity onPress={() => handleStergere(ant)} style={styles.iconBtn}>
                          <Trash2 size={16} color={colors.danger} />
                        </TouchableOpacity>
                        {isExp ? (
                          <ChevronUp size={20} color={colors.textSecondary} />
                        ) : (
                          <ChevronDown size={20} color={colors.textSecondary} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExp && (
                      <View style={[styles.expWrap, { borderTopColor: colors.cardBorder }]}>
                        {(!ant.exercitii || ant.exercitii.length === 0) ? (
                          <Text style={[styles.noExText, { color: colors.textSecondary }]}>Sesiune fără detalii despre seturi.</Text>
                        ) : (
                          ant.exercitii.map((ex, i) => (
                            <View key={i} style={styles.exItem}>
                              <Text style={[styles.exName, { color: colors.textPrimary }]}>{ex.nume}</Text>
                              <View style={styles.seturiWrap}>
                                {ex.seturi?.map((s, j) => {
                                  const isWarmup = s.set_type === 'warmup';
                                  const isDropset = s.set_type === 'dropset';
                                  const isFailure = s.set_type === 'failure';
                                  const typeLabel = isWarmup ? 'W' : isDropset ? 'D' : isFailure ? 'F' : `#${s.serie}`;
                                  const typeColor = isWarmup ? '#F59E0B' : isDropset ? '#8B5CF6' : isFailure ? '#EF4444' : colors.textSecondary;
                                  
                                  return (
                                    <View key={j} style={[styles.setPill, { backgroundColor: colors.background, borderColor: typeColor, borderWidth: s.set_type && s.set_type !== 'working' ? 1 : 0 }]}>
                                      <Text style={[styles.setPillText, { color: typeColor }]}>{typeLabel}: </Text>
                                      <Text style={[styles.setPillVal, { color: colors.accent }]}>{s.repetari} rap</Text>
                                      {s.greutate && s.greutate > 0 ? (
                                        <Text style={[styles.setPillVal, { color: colors.textPrimary }]}> × {s.greutate} kg</Text>
                                      ) : null}
                                      {s.rpe ? (
                                        <Text style={[styles.setPillVal, { color: colors.warning, marginLeft: 4, fontSize: 10 }]}>@ {s.rpe} RPE</Text>
                                      ) : null}
                                    </View>
                                  );
                                })}
                              </View>
                            </View>
                          ))
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
        title="Ștergere antrenament"
        message={toDelete ? `Sigur dorești să ștergi "${toDelete.nume}" din jurnal?` : ''}
        confirmLabel="Șterge"
        cancelLabel="Anulează"
        destructive={true}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const item = toDelete;
          setToDelete(null);
          try {
            await stergeAntrenament(item.id);
            notify.info('Antrenament șters', item.nume);
            await incarcaJurnal();
          } catch {
            notify.error('Eroare', 'Nu s-a putut șterge antrenamentul.');
          }
        }}
      />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
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

  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 },
  iconBtn: { padding: 4 },

  expWrap: { borderTopWidth: 1, padding: 16 },
  noExText: { fontSize: 13, fontStyle: 'italic' },
  exItem: { marginBottom: 12 },
  exName: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  seturiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  setPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  setPillText: { fontSize: 12, fontWeight: '600' },
  setPillVal: { fontSize: 12, fontWeight: '800' }
});
